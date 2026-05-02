from __future__ import annotations

import re
from typing import Any


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _normalize_code(raw: str) -> str:
    return raw.strip().upper().replace(" ", "")


# ICD-10-CM: starts with letter (except U), then digits/dot/alphanumeric; flexible for real-world OCR noise
_ICD10_RE = re.compile(r"^[A-TV-Z][0-9][0-9A-TV-Z](\.[0-9A-TV-Z]{1,4})?$")

# CPT: 5 digits; HCPCS Level II: letter + 4 digits
_CPT_RE = re.compile(r"^[0-9]{5}$")
_HCPCS_RE = re.compile(r"^[A-V][0-9]{4}$")


def is_valid_icd10_code(code: str) -> bool:
    c = _normalize_code(code)
    if len(c) < 3:
        return False
    return bool(_ICD10_RE.match(c))


def is_valid_cpt_or_hcpcs(code: str) -> bool:
    c = _normalize_code(code)
    if not c:
        return False
    if _CPT_RE.match(c):
        return True
    if _HCPCS_RE.match(c):
        return True
    return False


def validate_codes_for_extraction(extraction: dict[str, Any]) -> dict[str, Any]:
    """Validate diagnosis_codes and procedure_codes from a single document extraction dict."""
    diag_raw = _as_list(extraction.get("diagnosis_codes"))
    proc_raw = _as_list(extraction.get("procedure_codes"))
    diagnosis_codes = [str(x) for x in diag_raw if x is not None and str(x).strip()]
    procedure_codes = [str(x) for x in proc_raw if x is not None and str(x).strip()]

    invalid_diagnosis = [c for c in diagnosis_codes if not is_valid_icd10_code(c)]
    invalid_procedure = [c for c in procedure_codes if not is_valid_cpt_or_hcpcs(c)]

    valid_diagnosis = [c for c in diagnosis_codes if is_valid_icd10_code(c)]
    valid_procedure = [c for c in procedure_codes if is_valid_cpt_or_hcpcs(c)]

    return {
        "diagnosis_codes": diagnosis_codes,
        "procedure_codes": procedure_codes,
        "invalid_diagnosis_codes": invalid_diagnosis,
        "invalid_procedure_codes": invalid_procedure,
        "valid_diagnosis_codes": valid_diagnosis,
        "valid_procedure_codes": valid_procedure,
    }


def run_code_validation(*, doc_results: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Stage 4: ICD/CPT format validation on Stage 2 extraction output.
    Structure is consumed by Stage 5 fraud features and persisted in ai_report_json.
    """
    if not doc_results:
        return {
            "status": "no_documents",
            "per_document": [],
            "aggregate": {
                "total_diagnosis_codes": 0,
                "total_procedure_codes": 0,
                "invalid_diagnosis_count": 0,
                "invalid_procedure_count": 0,
                "unique_diagnosis_codes": 0,
                "unique_procedure_codes": 0,
            },
        }

    per_document: list[dict[str, Any]] = []
    all_diag: list[str] = []
    all_proc: list[str] = []
    invalid_diag_n = 0
    invalid_proc_n = 0

    for doc in doc_results:
        ext = doc.get("extraction") if isinstance(doc.get("extraction"), dict) else {}
        v = validate_codes_for_extraction(ext)
        all_diag.extend(v["diagnosis_codes"])
        all_proc.extend(v["procedure_codes"])
        invalid_diag_n += len(v["invalid_diagnosis_codes"])
        invalid_proc_n += len(v["invalid_procedure_codes"])
        per_document.append(
            {
                "document_id": doc.get("document_id"),
                "document_type": doc.get("document_type"),
                "original_filename": doc.get("original_filename"),
                "diagnosis_codes": v["diagnosis_codes"],
                "procedure_codes": v["procedure_codes"],
                "invalid_diagnosis_codes": v["invalid_diagnosis_codes"],
                "invalid_procedure_codes": v["invalid_procedure_codes"],
            }
        )

    uniq_diag = len({_normalize_code(x) for x in all_diag if str(x).strip()})
    uniq_proc = len({_normalize_code(x) for x in all_proc if str(x).strip()})

    return {
        "status": "ok",
        "per_document": per_document,
        "aggregate": {
            "total_diagnosis_codes": len(all_diag),
            "total_procedure_codes": len(all_proc),
            "invalid_diagnosis_count": invalid_diag_n,
            "invalid_procedure_count": invalid_proc_n,
            "unique_diagnosis_codes": uniq_diag,
            "unique_procedure_codes": uniq_proc,
        },
    }
