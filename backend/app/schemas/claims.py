from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class ClaimCreateRequest(BaseModel):
    patient_name: str = Field(min_length=2, max_length=200)
    policy_number: str = Field(min_length=2, max_length=100)
    hospital: str = Field(min_length=2, max_length=200)
    doctor: str = Field(min_length=2, max_length=200)
    diagnosis: str = Field(min_length=2)
    treatment_date: date
    claimed_amount: float = Field(gt=0)


class ClaimDocumentResponse(BaseModel):
    id: int
    original_filename: str
    content_type: str
    document_type: str
    download_url: str
    created_at: datetime


class ClaimStatusHistoryResponse(BaseModel):
    id: int
    from_status: str | None
    to_status: str
    message: str | None
    created_at: datetime


class ClaimResponse(BaseModel):
    id: int
    claim_id: str
    patient_name: str
    policy_number: str
    hospital: str
    doctor: str
    diagnosis: str
    treatment_date: date
    claimed_amount: float
    status: str
    decision: str
    approver_notes: str | None
    created_at: datetime
    updated_at: datetime
    documents: list[ClaimDocumentResponse] = []


class ClaimDetailResponse(ClaimResponse):
    history: list[ClaimStatusHistoryResponse] = []
    ai_report_json: str | None = None
    fraud_probability: float | None = None
    anomaly_score: float | None = None
    risk_score: int | None = None
    risk_level: str | None = None
    fraud_flags: list | None = None


class ApproverDecisionRequest(BaseModel):
    action: str = Field(description="approve | reject | request_more_info")
    notes: str | None = Field(default=None, max_length=2000)
    message_to_claimant: str | None = Field(default=None, max_length=255)


class ClaimMoreInfoRequest(BaseModel):
    additional_info: str = Field(min_length=2, max_length=2000)

