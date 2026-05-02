"""
Generate synthetic training CSV aligned with `app.ml.fraud_features.FRAUD_NUMERIC_FEATURE_ORDER`.
Rows are built from the same engineered features used at inference (Stage 4 aggregate + claim + Stage 2/3 signals).
"""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from app.ml.fraud_features import FRAUD_NUMERIC_FEATURE_ORDER

RNG = random.Random(42)


def _row_normal() -> dict[str, float]:
    claimed = RNG.uniform(5_000, 180_000)
    docs = float(RNG.randint(1, 4))
    line_items = float(RNG.randint(1, 12))
    stay = float(RNG.randint(0, 10))
    total_dx = float(RNG.randint(0, 5))
    total_px = float(RNG.randint(0, 8))
    inv_dx = float(RNG.randint(0, int(total_dx) + 1)) if total_dx else 0.0
    inv_px = float(RNG.randint(0, int(total_px) + 1)) if total_px else 0.0
    inv_dx = min(inv_dx, total_dx)
    inv_px = min(inv_px, total_px)
    total_codes = total_dx + total_px
    inv = inv_dx + inv_px
    irr = inv / total_codes if total_codes > 0 else 0.0
    ext_sum = claimed * RNG.uniform(0.92, 1.08)

    fd = {
        "claimed_amount": claimed,
        "treatment_date_ordinal": float(730000 + RNG.randint(0, 2000)),
        "document_count": docs,
        "ocr_quality_flag_count": float(RNG.randint(0, 1)),
        "line_item_count_total": line_items,
        "line_item_amount_sum": claimed * RNG.uniform(0.85, 1.05),
        "extraction_claimed_amount_sum": ext_sum,
        "procedure_codes_count_total": total_px,
        "diagnosis_codes_count_total": total_dx,
        "length_of_stay_days": stay,
        "policy_compliant_numeric": 1.0 if RNG.random() > 0.12 else 0.5,
        "stage4_total_diagnosis_codes": total_dx,
        "stage4_total_procedure_codes": total_px,
        "stage4_invalid_diagnosis_count": inv_dx,
        "stage4_invalid_procedure_count": inv_px,
        "stage4_unique_diagnosis_codes": max(0.0, total_dx - RNG.uniform(0, 1)),
        "stage4_unique_procedure_codes": max(0.0, total_px - RNG.uniform(0, 1)),
        "invalid_code_rate": float(irr),
        "amount_per_line_item": claimed / max(line_items, 1.0),
        "extraction_to_claimed_ratio": ext_sum / claimed if claimed > 0 else 1.0,
        "codes_per_document": (total_px + total_dx) / max(docs, 1.0),
        "amount_per_stay_day": claimed / (stay + 1.0),
    }
    return fd


def _row_fraud() -> dict[str, float]:
    """Inject extreme values / inconsistencies (proxy fraud)."""
    r = _row_normal()
    mode = RNG.randint(0, 3)
    if mode == 0:
        r["claimed_amount"] = RNG.uniform(600_000, 2_500_000)
    elif mode == 1:
        r["invalid_code_rate"] = RNG.uniform(0.45, 1.0)
        r["stage4_invalid_diagnosis_count"] += RNG.uniform(2, 8)
        r["stage4_invalid_procedure_count"] += RNG.uniform(2, 8)
    elif mode == 2:
        r["policy_compliant_numeric"] = 0.0
    else:
        r["extraction_to_claimed_ratio"] = RNG.uniform(0.05, 0.35) if RNG.random() > 0.5 else RNG.uniform(1.6, 3.0)
        r["ocr_quality_flag_count"] = float(RNG.randint(3, 9))

    # recompute derived fields for consistency
    total_dx = r["stage4_total_diagnosis_codes"]
    total_px = r["stage4_total_procedure_codes"]
    inv = r["stage4_invalid_diagnosis_count"] + r["stage4_invalid_procedure_count"]
    tc = total_dx + total_px
    r["invalid_code_rate"] = float(inv / tc if tc > 0 else r["invalid_code_rate"])
    r["amount_per_line_item"] = r["claimed_amount"] / max(r["line_item_count_total"], 1.0)
    r["amount_per_stay_day"] = r["claimed_amount"] / (r["length_of_stay_days"] + 1.0)
    r["codes_per_document"] = (r["procedure_codes_count_total"] + r["diagnosis_codes_count_total"]) / max(
        r["document_count"], 1.0
    )
    return r


def write_csv(path: Path, n_samples: int, fraud_ratio: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n_fraud = int(n_samples * fraud_ratio)
    n_ok = n_samples - n_fraud
    rows: list[dict[str, float | int]] = []
    for _ in range(n_ok):
        r = _row_normal()
        r["fraud_label"] = 0
        rows.append(r)
    for _ in range(n_fraud):
        r = _row_fraud()
        r["fraud_label"] = 1
        rows.append(r)
    RNG.shuffle(rows)

    fieldnames = list(FRAUD_NUMERIC_FEATURE_ORDER) + ["fraud_label"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow({k: row[k] for k in fieldnames})


def main() -> None:
    p = argparse.ArgumentParser(description="Generate synthetic fraud training CSV.")
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "data" / "synthetic_fraud_training.csv")
    p.add_argument("--samples", type=int, default=4000)
    p.add_argument("--fraud-ratio", type=float, default=0.22)
    args = p.parse_args()
    write_csv(args.out, args.samples, args.fraud_ratio)
    print(f"Wrote {args.samples} rows to {args.out}")


if __name__ == "__main__":
    main()
