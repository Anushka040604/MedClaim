import io


def test_auth_and_claim_flow(client):
    # Login as claimant (fixed user)
    r = client.post("/api/auth/login", json={"email": "claimant@gmail.com", "password": "123"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "claimant"

    # Claimant creates a claim (session cookie sent automatically)
    r = client.post(
        "/api/claims",
        json={
            "patient_name": "John Doe",
            "policy_number": "POL123",
            "hospital": "City Hospital",
            "doctor": "Dr Smith",
            "diagnosis": "Fever",
            "treatment_date": "2026-03-06",
            "claimed_amount": 1234.56,
        },
    )
    assert r.status_code == 200, r.text
    claim = r.json()
    assert claim["claim_id"].startswith("CLM-")
    claim_id = claim["claim_id"]

    # Upload 2 documents with per-file tagging
    files = [
        ("files", ("prescription.png", io.BytesIO(b"fakeimage"), "image/png")),
        ("files", ("bill.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")),
    ]
    data = {"document_types_json": '["Prescription","Hospital Bill"]'}
    r = client.post(f"/api/claims/{claim_id}/documents", files=files, data=data)
    assert r.status_code == 200, r.text
    docs = r.json()
    assert len(docs) == 2
    assert docs[0]["document_type"] == "Prescription"
    assert docs[1]["document_type"] == "Hospital Bill"

    # Claimant can fetch details + history
    r = client.get(f"/api/claims/{claim_id}")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["claim_id"] == claim_id
    assert len(detail["history"]) >= 1

    # Logout claimant, login as approver
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    r = client.post("/api/auth/login", json={"email": "approver@gmail.com", "password": "123"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "approver"

    # Approver queue sees claim
    r = client.get("/api/claims/queue/approver")
    assert r.status_code == 200, r.text
    assert any(c["claim_id"] == claim_id for c in r.json())

    # Approver requests more info
    r = client.post(
        f"/api/claims/{claim_id}/decision",
        json={"action": "request_more_info", "notes": "Need discharge summary", "message_to_claimant": "Upload discharge summary"},
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["status"] in {"More Info Requested", "Decision", "Under Review", "Processing", "Submitted"}
    assert any(h["to_status"] == "More Info Requested" for h in updated["history"])
