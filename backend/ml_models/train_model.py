"""
Train IsolationForest (unsupervised) and XGBoost classifier on engineered fraud features.
Writes artifacts to ml_models/artifacts/: scaler.pkl, isolation_forest.pkl, xgboost_model.pkl, feature_manifest.json
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from app.ml.fraud_features import FRAUD_NUMERIC_FEATURE_ORDER


def _metrics(y_true, y_pred) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "synthetic_fraud_training.csv",
    )
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "artifacts")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    feature_cols = list(FRAUD_NUMERIC_FEATURE_ORDER)
    with args.data.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        raise SystemExit("Empty CSV")
    missing = [c for c in feature_cols + ["fraud_label"] if c not in rows[0]]
    if missing:
        raise SystemExit(f"CSV missing columns: {missing}")

    X = np.array([[float(r[c]) for c in feature_cols] for r in rows], dtype=np.float64)
    y = np.array([int(float(r["fraud_label"])) for r in rows], dtype=np.int64)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=args.seed, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    iso = IsolationForest(
        n_estimators=200,
        contamination=max(0.02, min(0.5, float(y_train.mean()))),
        random_state=args.seed,
    )
    iso.fit(X_train_s)
    iso_pred_test = (iso.predict(X_test_s) == -1).astype(int)

    xgb = XGBClassifier(
        n_estimators=120,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.85,
        eval_metric="logloss",
        random_state=args.seed,
    )
    xgb.fit(X_train_s, y_train)
    xgb_pred_test = xgb.predict(X_test_s)

    iso_metrics = _metrics(y_test, iso_pred_test)
    xgb_metrics = _metrics(y_test, xgb_pred_test)

    args.out.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, args.out / "scaler.pkl")
    joblib.dump(iso, args.out / "isolation_forest.pkl")
    joblib.dump(xgb, args.out / "xgboost_model.pkl")

    manifest = {
        "feature_names": feature_cols,
        "evaluation": {
            "isolation_forest": iso_metrics,
            "xgboost": xgb_metrics,
        },
    }
    (args.out / "feature_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps(manifest["evaluation"], indent=2))
    print(f"Artifacts saved under {args.out}")


if __name__ == "__main__":
    main()
