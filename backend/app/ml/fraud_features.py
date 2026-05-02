from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any


def _safe_float(x: Any, default: float = 0.0) -> float:
    if x is None:
        return default
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _parse_date_for_ordinal(val: Any) -> float:
    if val is None:
        return 0.0
    if isinstance(val, date) and not isinstance(val, datetime):
        return float(val.toordinal())
    if isinstance(val, datetime):
        return float(val.date().toordinal())
    s = str(val).strip()[:40]
    if not s:
        return 0.0
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return float(datetime.strptime(s[:10], fmt).date().toordinal())
        except ValueError:
            continue
    return 0.0


def _policy_compliant_numeric(compliant: Any) -> float:
    if compliant is True:
        return 1.0
    if compliant is False:
        return 0.0
    return 0.5


def aggregate_stage2_extractions(doc_results: list[dict[str, Any]]) -> dict[str, float]:
    """Roll up Stage 2 `extraction` dicts (per document) into numeric signals."""
    line_item_count = 0
    line_item_amount_sum = 0.0
    extraction_claimed_sum = 0.0
    proc_count = 0
    diag_count = 0
    ocr_flag_count = 0
    los_days = 0.0

    for doc in doc_results:
        qf = doc.get("quality_flags")
        if isinstance(qf, list):
            ocr_flag_count += len(qf)
        ext = doc.get("extraction")
        if not isinstance(ext, dict):
            continue

        items = ext.get("line_items")
        if isinstance(items, list):
            line_item_count += len(items)
            for li in items:
                if not isinstance(li, dict):
                    continue
                line_item_amount_sum += _safe_float(li.get("amount"))

        extraction_claimed_sum += _safe_float(ext.get("claimed_amount"))

        pc = ext.get("procedure_codes")
        if isinstance(pc, list):
            proc_count += len(pc)
        dc = ext.get("diagnosis_codes")
        if isinstance(dc, list):
            diag_count += len(dc)

        adm = ext.get("admission_date") or ext.get("admission")
        dis = ext.get("discharge_date") or ext.get("discharge")
        a_ord = _parse_date_for_ordinal(adm)
        d_ord = _parse_date_for_ordinal(dis)
        if a_ord > 0 and d_ord >= a_ord:
            los_days = max(los_days, d_ord - a_ord)

    return {
        "document_count": float(len(doc_results)),
        "ocr_quality_flag_count": float(ocr_flag_count),
        "line_item_count_total": float(line_item_count),
        "line_item_amount_sum": line_item_amount_sum,
        "extraction_claimed_amount_sum": extraction_claimed_sum,
        "procedure_codes_count_total": float(proc_count),
        "diagnosis_codes_count_total": float(diag_count),
        "length_of_stay_days": float(los_days),
    }


def stage4_aggregate_numeric(stage4: dict[str, Any] | None) -> dict[str, float]:
    agg = (stage4 or {}).get("aggregate")
    if not isinstance(agg, dict):
        agg = {}
    return {
        "stage4_total_diagnosis_codes": float(agg.get("total_diagnosis_codes") or 0),
        "stage4_total_procedure_codes": float(agg.get("total_procedure_codes") or 0),
        "stage4_invalid_diagnosis_count": float(agg.get("invalid_diagnosis_count") or 0),
        "stage4_invalid_procedure_count": float(agg.get("invalid_procedure_count") or 0),
        "stage4_unique_diagnosis_codes": float(agg.get("unique_diagnosis_codes") or 0),
        "stage4_unique_procedure_codes": float(agg.get("unique_procedure_codes") or 0),
    }


# Order used for training CSV columns and model matrices — must stay stable for inference.
FRAUD_NUMERIC_FEATURE_ORDER: tuple[str, ...] = (
    "claimed_amount",
    "treatment_date_ordinal",
    "document_count",
    "ocr_quality_flag_count",
    "line_item_count_total",
    "line_item_amount_sum",
    "extraction_claimed_amount_sum",
    "procedure_codes_count_total",
    "diagnosis_codes_count_total",
    "length_of_stay_days",
    "policy_compliant_numeric",
    "stage4_total_diagnosis_codes",
    "stage4_total_procedure_codes",
    "stage4_invalid_diagnosis_count",
    "stage4_invalid_procedure_count",
    "stage4_unique_diagnosis_codes",
    "stage4_unique_procedure_codes",
    "invalid_code_rate",
    "amount_per_line_item",
    "extraction_to_claimed_ratio",
    "codes_per_document",
    "amount_per_stay_day",
)


def build_fraud_feature_dict(
    *,
    claim: dict[str, Any],
    doc_results: list[dict[str, Any]],
    stage3_policy: dict[str, Any] | None,
    stage4: dict[str, Any] | None,
) -> dict[str, float]:
    """
    Map claim row + pipeline stages to a flat numeric dict for ML and rules.
    Field names mirror DB columns and ai_report_json sections.
    """
    claimed = _safe_float(claim.get("claimed_amount"))
    treatment_ord = _parse_date_for_ordinal(claim.get("treatment_date"))

    s2 = aggregate_stage2_extractions(doc_results)
    s4 = stage4_aggregate_numeric(stage4)

    compliant = stage3_policy.get("compliant") if isinstance(stage3_policy, dict) else None
    pol_num = _policy_compliant_numeric(compliant)

    total_codes = s4["stage4_total_diagnosis_codes"] + s4["stage4_total_procedure_codes"]
    invalid_total = s4["stage4_invalid_diagnosis_count"] + s4["stage4_invalid_procedure_count"]
    invalid_code_rate = invalid_total / total_codes if total_codes > 0 else 0.0

    doc_ct = max(int(s2["document_count"]), 1)
    line_ct = max(int(s2["line_item_count_total"]), 1)
    stay = max(s2["length_of_stay_days"], 0.0)

    extraction_to_claimed_ratio = s2["extraction_claimed_amount_sum"] / claimed if claimed > 0 else 0.0
    codes_per_document = (s2["procedure_codes_count_total"] + s2["diagnosis_codes_count_total"]) / doc_ct
    amount_per_line = claimed / line_ct
    amount_per_stay = claimed / (stay + 1.0)

    out: dict[str, float] = {
        "claimed_amount": claimed,
        "treatment_date_ordinal": treatment_ord,
        "document_count": s2["document_count"],
        "ocr_quality_flag_count": s2["ocr_quality_flag_count"],
        "line_item_count_total": s2["line_item_count_total"],
        "line_item_amount_sum": s2["line_item_amount_sum"],
        "extraction_claimed_amount_sum": s2["extraction_claimed_amount_sum"],
        "procedure_codes_count_total": s2["procedure_codes_count_total"],
        "diagnosis_codes_count_total": s2["diagnosis_codes_count_total"],
        "length_of_stay_days": s2["length_of_stay_days"],
        "policy_compliant_numeric": pol_num,
        **s4,
        "invalid_code_rate": float(invalid_code_rate),
        "amount_per_line_item": float(amount_per_line),
        "extraction_to_claimed_ratio": float(extraction_to_claimed_ratio),
        "codes_per_document": float(codes_per_document),
        "amount_per_stay_day": float(amount_per_stay),
    }

    # Replace NaN with 0 for sklearn
    for k, v in list(out.items()):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            out[k] = 0.0
    return out


def feature_vector_from_dict(
    feature_dict: dict[str, float], *, order: tuple[str, ...] | None = None
) -> tuple[list[float], list[str]]:
    ord_ = order or FRAUD_NUMERIC_FEATURE_ORDER
    vec = [float(feature_dict.get(name, 0.0)) for name in ord_]
    return vec, list(ord_)


def pipeline_snapshot_for_training_row(
    *,
    claim: dict[str, Any],
    doc_results: list[dict[str, Any]],
    stage3_policy: dict[str, Any],
    stage4: dict[str, Any],
) -> dict[str, Any]:
    """Structured snapshot aligned with ai_report_json sections (for docs / synthetic data)."""
    return {
        "claim": claim,
        "stage2_extraction": {"documents": doc_results},
        "stage3_policy_rag": stage3_policy,
        "stage4_code_validation": stage4,
    }
