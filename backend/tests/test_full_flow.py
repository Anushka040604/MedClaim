import io
import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient


def _fake_pipeline_factory():
    calls = {"count": 0}

    def _fake_pipeline(claim_db_id: int, is_reprocessing: bool = False) -> None:
        from app.db.session import SessionLocal
        from app.models.claim import Claim, ClaimStatus, ClaimStatusHistory

        db = SessionLocal()
        try:
            claim = db.query(Claim).filter(Claim.id == claim_db_id).first()
            if not claim:
                return
            calls["count"] += 1
            claim.status = ClaimStatus.under_review
            claim.updated_at = datetime.now(timezone.utc)
            claim.ai_report_json = json.dumps(
                {
                    "run_number": calls["count"],
                    "is_reprocessing": is_reprocessing,
                    "stage1_ocr": {"status": "ok"},
                    "stage2_extraction": {"status": "ok"},
                    "stage3_policy_rag": {"status": "ok", "compliant": True},
                    "stage4_code_validation": {"status": "ok"},
                    "stage5_fraud_scoring": {"status": "ok", "risk_score_0_100": 12, "risk_level": "GREEN"},
                }
            )
            db.add(
                ClaimStatusHistory(
                    claim_id_fk=claim.id,
                    from_status="Processing",
                    to_status="AI Report Updated",
                    message=f"Mock AI report v{calls['count']}",
                )
            )
            db.commit()
        finally:
            db.close()

    return _fake_pipeline, calls


def test_full_flow(monkeypatch):
    import app.api.routers.claims as claims_router
    from app.main import app

    fake_pipeline, calls = _fake_pipeline_factory()
    monkeypatch.setattr(claims_router, "run_ai_pipeline_stub", fake_pipeline)

    with TestClient(app) as client:
        # Step 1: Login claimant
        r = client.post("/api/auth/login", json={"email": "claimant@gmail.com", "password": "123"})
        assert r.status_code == 200, r.text

        # Step 2: Submit claim with documents in one request (multipart)
        files = [
            ("files", ("prescription.png", io.BytesIO(b"fakeimage"), "image/png")),
            ("files", ("bill.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")),
        ]
        data = {
            "patient_name": "John Doe",
            "policy_number": "POL123",
            "hospital": "City Hospital",
            "doctor": "Dr Smith",
            "diagnosis": "Fever and dehydration",
            "treatment_date": "2026-03-06",
            "claimed_amount": "1234.56",
            "document_types_json": '["Prescription","Hospital Bill"]',
        }
        r = client.post("/api/claims", data=data, files=files)
        assert r.status_code == 200, r.text
        claim = r.json()
        claim_id = claim["claim_id"]
        assert len(claim["documents"]) == 2

        # Step 3: Verify saved docs + download URLs work
        r = client.get(f"/api/claims/{claim_id}")
        assert r.status_code == 200, r.text
        detail = r.json()
        assert len(detail["documents"]) == 2
        dl_url = detail["documents"][0]["download_url"]
        d = client.get(dl_url)
        assert d.status_code == 200, d.text

        # Step 4 + 5: AI pipeline ran and report generated
        r = client.get(f"/api/claims/{claim_id}")
        assert r.status_code == 200, r.text
        first_report = json.loads(r.json()["ai_report_json"])
        assert first_report["run_number"] == 1
        assert calls["count"] == 1

        # Step 6: Approver requests more info
        client.post("/api/auth/logout")
        r = client.post("/api/auth/login", json={"email": "approver@gmail.com", "password": "123"})
        assert r.status_code == 200, r.text
        r = client.post(
            f"/api/claims/{claim_id}/decision",
            json={"action": "request_more_info", "notes": "Need discharge summary", "message_to_claimant": "Please submit more details"},
        )
        assert r.status_code == 200, r.text
        assert any(h["to_status"] == "More Info Requested" for h in r.json()["history"])

        # Step 7: Claimant submits more info
        client.post("/api/auth/logout")
        r = client.post("/api/auth/login", json={"email": "claimant@gmail.com", "password": "123"})
        assert r.status_code == 200, r.text
        r = client.post(f"/api/claims/{claim_id}/more-info", json={"additional_info": "Attached latest discharge note"})
        assert r.status_code == 200, r.text

        # Step 8 + 9: AI re-runs and report is updated
        r = client.get(f"/api/claims/{claim_id}")
        assert r.status_code == 200, r.text
        after = r.json()
        report = json.loads(after["ai_report_json"])
        assert report["run_number"] == 2
        assert report["is_reprocessing"] is True
        assert calls["count"] == 2
        statuses = [h["to_status"] for h in after["history"]]
        assert "More Info Submitted" in statuses
        assert "Reprocessing Claim" in statuses
        assert "AI Report Updated" in statuses

        # Step 10: Approver approves/rejects
        client.post("/api/auth/logout")
        r = client.post("/api/auth/login", json={"email": "approver@gmail.com", "password": "123"})
        assert r.status_code == 200, r.text
        r = client.post(
            f"/api/claims/{claim_id}/decision",
            json={"action": "approve", "notes": "All good", "message_to_claimant": "Approved"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["decision"] == "Approved"
