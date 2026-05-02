from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.ml.fraud_features import FRAUD_NUMERIC_FEATURE_ORDER, build_fraud_feature_dict

logger = logging.getLogger(__name__)

_ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "ml_models" / "artifacts"


@dataclass
class FraudDetectionResult:
    fraud_probability: float
    anomaly_score: float
    risk_score_0_100: int
    risk_level: str
    flags: list[dict[str, Any]]
    model_status: str


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _risk_level_from_score(score: int) -> str:
    if score <= 33:
        return "GREEN"
    if score <= 66:
        return "AMBER"
    return "RED"


def _rule_based_flags_and_score(
    feature_dict: dict[str, float],
    *,
    claim: dict[str, Any],
    stage3_policy: dict[str, Any] | None,
    stage4: dict[str, Any] | None,
) -> tuple[float, list[dict[str, Any]]]:
    """Score 0–100 from interpretable rules using actual field names in messages."""
    score = 0.0
    flags: list[dict[str, Any]] = []

    claimed = float(feature_dict.get("claimed_amount") or 0)
    if claimed > 500_000:
        score += 15
        flags.append(
            {
                "type": "high_claimed_amount",
                "message": f"claimed_amount is high ({claimed:.2f}); manual review suggested.",
                "field": "claimed_amount",
            }
        )

    if isinstance(stage3_policy, dict) and stage3_policy.get("compliant") is False:
        score += 25
        flags.append(
            {
                "type": "policy_not_compliant",
                "message": "stage3_policy_rag.compliant is false; policy risk elevated.",
                "field": "stage3_policy_rag.compliant",
            }
        )

    irr = float(feature_dict.get("invalid_code_rate") or 0)
    if irr > 0.35:
        score += min(30, int(irr * 40))
        flags.append(
            {
                "type": "invalid_medical_codes",
                "message": f"invalid_code_rate ({irr:.2f}) elevated from stage4_code_validation aggregate counts.",
                "field": "stage4_code_validation.aggregate",
            }
        )

    ratio = float(feature_dict.get("extraction_to_claimed_ratio") or 0)
    if ratio > 0 and (ratio < 0.5 or ratio > 1.5):
        score += 12
        flags.append(
            {
                "type": "amount_mismatch",
                "message": f"extraction_claimed_amount_sum vs claimed_amount mismatch (extraction_to_claimed_ratio={ratio:.2f}).",
                "field": "claimed_amount",
            }
        )

    ocr_n = int(feature_dict.get("ocr_quality_flag_count") or 0)
    if ocr_n >= 2:
        score += 10
        flags.append(
            {
                "type": "ocr_quality",
                "message": f"Multiple OCR quality_flags on documents ({ocr_n}).",
                "field": "stage2_extraction.documents.quality_flags",
            }
        )

    _ = claim
    _ = stage4
    return _clamp01(score / 100.0), flags


def _load_sklearn_bundle():
    scaler_path = _ARTIFACT_DIR / "scaler.pkl"
    iso_path = _ARTIFACT_DIR / "isolation_forest.pkl"
    xgb_path = _ARTIFACT_DIR / "xgboost_model.pkl"
    manifest_path = _ARTIFACT_DIR / "feature_manifest.json"
    if not all(p.exists() for p in (scaler_path, iso_path, xgb_path, manifest_path)):
        return None
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    order = tuple(manifest.get("feature_names") or FRAUD_NUMERIC_FEATURE_ORDER)
    return {
        "scaler": joblib.load(scaler_path),
        "iso": joblib.load(iso_path),
        "xgb": joblib.load(xgb_path),
        "feature_names": order,
    }


def analyze_fraud(
    *,
    claim: dict[str, Any],
    doc_results: list[dict[str, Any]],
    stage3_policy: dict[str, Any] | None,
    stage4: dict[str, Any] | None,
) -> FraudDetectionResult:
    """
    Run ML (if artifacts present) + rules. `claim` should include at least:
    claimed_amount, treatment_date (as stored on Claim model).
    """
    feature_dict = build_fraud_feature_dict(
        claim=claim,
        doc_results=doc_results,
        stage3_policy=stage3_policy,
        stage4=stage4,
    )

    rule_score_01, rule_flags = _rule_based_flags_and_score(
        feature_dict, claim=claim, stage3_policy=stage3_policy, stage4=stage4
    )

    bundle = _load_sklearn_bundle()
    fraud_prob = float(rule_score_01)
    anomaly_score = 0.0
    model_status = "rules_only"

    if bundle is not None:
        try:
            fn = list(bundle["feature_names"])
            vec_ml = [float(feature_dict.get(name, 0.0)) for name in fn]
            x_ml = np.asarray(vec_ml, dtype=np.float64).reshape(1, -1)
            xs = bundle["scaler"].transform(x_ml)
            iso = bundle["iso"]
            raw = float(iso.decision_function(xs)[0])
            # sklearn: lower decision_function => more anomalous
            anomaly_score = float(_clamp01(1.0 / (1.0 + np.exp(raw))))

            xgb = bundle["xgb"]
            proba = xgb.predict_proba(xs)
            xgb_pos = float(proba[0][1]) if proba.shape[1] > 1 else float(proba[0][0])
            fraud_prob = float(0.55 * xgb_pos + 0.25 * anomaly_score + 0.20 * rule_score_01)
            model_status = "ml_loaded"
        except Exception as e:  # noqa: BLE001
            logger.exception("Fraud ML inference failed; falling back to rules: %s", e)
            fraud_prob = float(rule_score_01)
            anomaly_score = 0.0
            model_status = "rules_fallback_ml_error"
    else:
        fraud_prob = float(rule_score_01)
        anomaly_score = float(min(1.0, rule_score_01))

    combined = _clamp01(0.5 * fraud_prob + 0.3 * anomaly_score + 0.2 * rule_score_01)
    risk_score_0_100 = int(round(combined * 100))
    risk_score_0_100 = max(0, min(100, risk_score_0_100))
    risk_level = _risk_level_from_score(risk_score_0_100)

    all_flags = list(rule_flags)
    if model_status == "rules_only":
        all_flags.append({"type": "ml_models_not_trained", "message": "Train models with ml_models/train_model.py for full ML scoring."})

    return FraudDetectionResult(
        fraud_probability=float(_clamp01(fraud_prob)),
        anomaly_score=float(_clamp01(anomaly_score)),
        risk_score_0_100=risk_score_0_100,
        risk_level=risk_level,
        flags=all_flags,
        model_status=model_status,
    )
