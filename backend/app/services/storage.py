from __future__ import annotations

import os
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings


def claim_storage_dir(claim_id: str) -> Path:
    base = Path(settings.storage_dir)
    return base / "claims" / claim_id


def ensure_dir(p: Path) -> None:
    os.makedirs(p, exist_ok=True)


async def save_upload_to_disk(claim_id: str, file: UploadFile) -> tuple[str, str]:
    """
    Returns (stored_path, original_filename).
    """
    dest_dir = claim_storage_dir(claim_id)
    ensure_dir(dest_dir)

    safe_name = f"{file.filename}"
    stored_path = dest_dir / safe_name

    # Avoid overwrite by appending if needed
    if stored_path.exists():
        stem = stored_path.stem
        suffix = stored_path.suffix
        stored_path = dest_dir / f"{stem}-{os.urandom(3).hex()}{suffix}"

    contents = await file.read()
    stored_path.write_bytes(contents)
    return str(stored_path), file.filename


def delete_claim_storage(claim_id: str) -> None:
    """Remove stored files for a claim (e.g. when claim is deleted)."""
    import shutil
    dest_dir = claim_storage_dir(claim_id)
    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)

