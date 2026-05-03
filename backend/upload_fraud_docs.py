from __future__ import annotations

import json
from pathlib import Path

import httpx


BASE = "http://127.0.0.1:8000/api"
DOC_DIR = Path(
    r"C:\Users\Lenovo\Downloads\Medical Claim Verification\Medical Claim Verification\Test Documents\Fraud Claim"
)

FILES: list[tuple[str, Path]] = [
    ("Prescription", DOC_DIR / "01_Prescription.pdf"),
    ("Hospital Bill", DOC_DIR / "02_Hospital_Bill.pdf"),
    ("Lab Report", DOC_DIR / "03_Lab_Report.pdf"),
    ("Discharge Summary", DOC_DIR / "04_Discharge_Summary.pdf"),
    ("Consent Form", DOC_DIR / "05_Consent_Form.pdf"),
]


def main() -> None:
    missing = [str(p) for _, p in FILES if not p.exists()]
    if missing:
        raise SystemExit("Missing files:\n" + "\n".join(missing))

    doc_types = [t for t, _ in FILES]

    with httpx.Client(timeout=90.0) as client:
        r = client.post(
            f"{BASE}/auth/login",
            json={"email": "claimant@gmail.com", "password": "123"},
        )
        r.raise_for_status()
        me = r.json()
        print("login_ok:", me.get("email"), "role=", me.get("role"))

        claim_payload = {
            "patient_name": "Fraud Test",
            "policy_number": "POL-FRAUD-001",
            "hospital": "City Hospital",
            "doctor": "Dr Smith",
            "diagnosis": "High amount claim test",
            "treatment_date": "2026-04-01",
            "claimed_amount": 450000,
        }
        r = client.post(f"{BASE}/claims", json=claim_payload)
        r.raise_for_status()
        claim = r.json()
        claim_id = claim.get("claim_id")
        if not claim_id:
            raise SystemExit(f"Create claim failed: {claim}")
        print("created_claim_id:", claim_id)

        multipart: list[tuple[str, tuple[str | None, bytes | str, str] | tuple[str, bytes, str]]] = []
        multipart.append(("document_types_json", (None, json.dumps(doc_types), "text/plain")))
        for _, path in FILES:
            multipart.append(("files", (path.name, path.read_bytes(), "application/pdf")))

        r = client.post(f"{BASE}/claims/{claim_id}/documents", files=multipart)
        r.raise_for_status()
        docs = r.json()
        print("uploaded_docs:", len(docs))
        for d in docs:
            print("doc:", d.get("id"), d.get("document_type"), d.get("original_filename"))


if __name__ == "__main__":
    main()

