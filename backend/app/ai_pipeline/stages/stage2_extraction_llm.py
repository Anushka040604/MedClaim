from __future__ import annotations

import json
from dataclasses import dataclass

from app.ai_pipeline.groq_client import chat_completion
from app.core.config import settings


@dataclass
class ExtractionResult:
    extracted_json: dict
    confidence: dict


def _extraction_prompt(document_type: str, ocr_text: str) -> str:
    return f"""
You extract structured fields from insurance claim documents.

Document type: {document_type}

Return ONLY valid JSON with these keys:
- patient_name
- hospital
- doctor
- diagnosis
- admission_date
- discharge_date
- treatment_date
- policy_number
- claimed_amount
- procedure_codes (array)
- diagnosis_codes (array)
- line_items (array of {{description, amount}})

If a field is not present, set it to null (or [] for arrays).
Text:
{ocr_text[:6000]}
""".strip()


def _parse_json_lenient(raw: str, *, document_type: str) -> dict:
    """
    LLMs sometimes wrap JSON in markdown fences or add leading text.
    Try to recover a JSON object/array rather than failing the whole stage.
    """
    s = (raw or "").strip()
    if not s:
        return {"raw": raw, "parse_error": True, "document_type": document_type}

    # Strip ```json fences if present
    if "```" in s:
        for marker in ("```json", "```"):
            if marker in s:
                s = s.split(marker, 1)[-1].rsplit("```", 1)[0].strip()
                break

    # Try direct parse
    try:
        parsed = json.loads(s)
        return parsed if isinstance(parsed, dict) else {"raw": parsed, "document_type": document_type}
    except Exception:
        pass

    # Try extracting first JSON object
    obj_start = s.find("{")
    obj_end = s.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        snippet = s[obj_start : obj_end + 1].strip()
        try:
            parsed = json.loads(snippet)
            return parsed if isinstance(parsed, dict) else {"raw": parsed, "document_type": document_type}
        except Exception:
            pass

    # Try extracting first JSON array
    arr_start = s.find("[")
    arr_end = s.rfind("]")
    if arr_start != -1 and arr_end != -1 and arr_end > arr_start:
        snippet = s[arr_start : arr_end + 1].strip()
        try:
            parsed = json.loads(snippet)
            return {"raw": parsed, "document_type": document_type}
        except Exception:
            pass

    return {"raw": raw, "parse_error": True, "document_type": document_type}


def extract_fields_with_llm(*, document_type: str, ocr_text: str) -> ExtractionResult:
    """
    Structured extraction via LLM (Groq).
    """
    prompt = _extraction_prompt(document_type, ocr_text)

    if not settings.groq_api_key:
        return ExtractionResult(
            extracted_json={"document_type": document_type, "note": "Set GROQ_API_KEY to enable LLM extraction"},
            confidence={},
        )

    try:
        raw = chat_completion(
            api_key=settings.groq_api_key,
            model=settings.groq_model_extraction,
            messages=[
                {"role": "system", "content": "Return ONLY valid JSON. No markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=900,
        )
    except Exception as e:  # noqa: BLE001
        return ExtractionResult(
            extracted_json={"document_type": document_type, "note": f"Groq error: {type(e).__name__}: {str(e)[:200]}"},
            confidence={},
        )

    parsed = _parse_json_lenient(raw, document_type=document_type)
    if isinstance(parsed, dict):
        parsed.setdefault("document_type", document_type)
        return ExtractionResult(extracted_json=parsed, confidence={})
    return ExtractionResult(extracted_json={"raw": raw, "parse_error": True, "document_type": document_type}, confidence={})

