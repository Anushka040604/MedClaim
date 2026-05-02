from __future__ import annotations

import secrets
from datetime import datetime, timezone


def generate_claim_id() -> str:
    # Example: CLM-20260306-8f3a1c2d
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand = secrets.token_hex(4)
    return f"CLM-{day}-{rand}"

