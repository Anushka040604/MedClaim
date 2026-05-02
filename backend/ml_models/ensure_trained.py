"""
Idempotent: train fraud models only if .pkl artifacts are missing.
Run from repo root:  cd backend && python -m ml_models.ensure_trained
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
_REQUIRED = ("scaler.pkl", "isolation_forest.pkl", "xgboost_model.pkl", "feature_manifest.json")
_DEFAULT_CSV = Path(__file__).resolve().parent / "data" / "synthetic_fraud_training.csv"


def _artifacts_ok() -> bool:
    return all((_ARTIFACTS / name).exists() for name in _REQUIRED)


def _ensure_data_csv() -> None:
    _DEFAULT_CSV.parent.mkdir(parents=True, exist_ok=True)
    if _DEFAULT_CSV.is_file() and _DEFAULT_CSV.stat().st_size > 100:
        return
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    from ml_models.data_generator import write_csv

    write_csv(_DEFAULT_CSV, n_samples=4000, fraud_ratio=0.22)
    print(f"Created training data: {_DEFAULT_CSV}")


def main() -> int:
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))

    if _artifacts_ok():
        print("ML fraud artifacts already present; skipping training.")
        return 0
    print("ML fraud artifacts missing; generating data (if needed) and training…")
    _ensure_data_csv()
    r = subprocess.run(
        [
            sys.executable,
            "-m",
            "ml_models.train_model",
            "--data",
            str(_DEFAULT_CSV),
            "--out",
            str(_ARTIFACTS),
        ],
        cwd=BACKEND_ROOT,
    )
    if r.returncode != 0:
        return r.returncode
    if not _artifacts_ok():
        print("error: training finished but required artifacts are still missing.", file=sys.stderr)
        return 1
    print("Fraud models trained and saved to ml_models/artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
