from __future__ import annotations

from dataclasses import dataclass
import mimetypes
from pathlib import Path


@dataclass
class OcrResult:
    text: str
    quality_flags: list[str]


def run_ocr(*, stored_path: str) -> OcrResult:
    """
    Text extraction without external OCR dependencies.
    - PDFs: extract native text via PyMuPDF
    - Images: no OCR in Groq-only mode (Groq has no vision); returns empty text with flags
    """
    import fitz

    p = Path(stored_path)
    suffix = p.suffix.lower()

    text_parts: list[str] = []
    quality_flags: list[str] = []

    try:
        if suffix == ".pdf":
            with fitz.open(str(p)) as pdf:
                for page in pdf:
                    direct_text = (page.get_text("text") or "").strip()
                    if len(direct_text) >= 30:
                        text_parts.append(direct_text)
                        continue
                    quality_flags.append(f"low_text_page_no_ocr:{page.number + 1}")
        else:
            mime_type = mimetypes.guess_type(str(p))[0] or "image/png"
            _ = mime_type  # kept for debugging/flags
            quality_flags.append("image_ocr_not_supported_groq_only")
    except Exception as e:  # noqa: BLE001
        quality_flags.append(f"ocr_failed:{type(e).__name__}")

    text = "\n".join([t.strip() for t in text_parts if t and t.strip()])
    if not text:
        quality_flags.append("low_text_extracted")
    return OcrResult(text=text, quality_flags=quality_flags)

