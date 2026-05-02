from __future__ import annotations

import json
import os

from app.ai_pipeline.groq_client import chat_completion


def _strip_fences(s: str) -> str:
    t = (s or "").strip()
    if "```" not in t:
        return t
    for marker in ("```json", "```"):
        if marker in t:
            return t.split(marker, 1)[-1].rsplit("```", 1)[0].strip()
    return t


def main() -> None:
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(".env")
    except Exception:
        # If python-dotenv isn't installed, fall back to process env only.
        pass

    api_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise SystemExit("Set GROQ_API_KEY in environment (do not commit it).")

    model = (os.getenv("GROQ_MODEL") or os.getenv("GROQ_MODEL_REASONING") or "llama-3.3-70b-versatile").strip()

    prompt = """
Return ONLY valid JSON with keys:
- patient_name
- hospital
- doctor
- diagnosis
- treatment_date
- policy_number
- claimed_amount
- procedure_codes (array)
- diagnosis_codes (array)
- line_items (array of {description, amount})

Text:
Patient: John Doe
Hospital: City Hospital
Doctor: Dr Smith
Diagnosis: Fever
Treatment date: 2026-04-01
Policy: POL-123
Amount: 4500
ICD: A09
CPT: 99213
Line item: Consultation 1500
Line item: Labs 3000
""".strip()

    raw = chat_completion(
        api_key=api_key,
        model=model,
        messages=[
            {"role": "system", "content": "Return ONLY valid JSON. No markdown."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=900,
    )

    print(raw)
    json.loads(_strip_fences(raw))  # validate JSON


if __name__ == "__main__":
    main()

