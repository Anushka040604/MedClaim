from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.ai_pipeline.run_pipeline import run_ai_pipeline_stub
from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.claim import Claim, ClaimDecision, ClaimDocument, ClaimStatus, ClaimStatusHistory
from app.models.user import User, UserRole
from app.schemas.claims import (
    ApproverDecisionRequest,
    ClaimCreateRequest,
    ClaimDetailResponse,
    ClaimDocumentResponse,
    ClaimMoreInfoRequest,
    ClaimResponse,
    ClaimStatusHistoryResponse,
)
from app.services.claim_id import generate_claim_id
from app.services.notifications import notify_status_change
from app.services.storage import delete_claim_storage, save_upload_to_disk

router = APIRouter(prefix="/claims", tags=["claims"])


def _queue_ai_pipeline(*, claim_db_id: int, is_reprocessing: bool = False) -> None:
    """
    Run the sync AI pipeline in a daemon thread so the API server stays responsive.
    FastAPI BackgroundTasks run in-process and can block a single-worker dev server.
    """
    t = threading.Thread(
        target=run_ai_pipeline_stub,
        args=(claim_db_id, is_reprocessing),
        daemon=True,
        name=f"ai-pipeline-{claim_db_id}",
    )
    t.start()


def _document_download_url(claim_id: str, document_id: int) -> str:
    return f"/api/claims/{claim_id}/documents/{document_id}/download"


def _claim_to_response(c: Claim) -> ClaimResponse:
    return ClaimResponse(
        id=c.id,
        claim_id=c.claim_id,
        patient_name=c.patient_name,
        policy_number=c.policy_number,
        hospital=c.hospital,
        doctor=c.doctor,
        diagnosis=c.diagnosis,
        treatment_date=c.treatment_date,
        claimed_amount=float(c.claimed_amount),
        status=c.status.value,
        decision=c.decision.value,
        approver_notes=c.approver_notes,
        created_at=c.created_at,
        updated_at=c.updated_at,
        documents=[
            ClaimDocumentResponse(
                id=d.id,
                original_filename=d.original_filename,
                content_type=d.content_type,
                document_type=d.document_type,
                download_url=_document_download_url(c.claim_id, d.id),
                created_at=d.created_at,
            )
            for d in (c.documents or [])
        ],
    )


def _history_to_response(h: ClaimStatusHistory) -> ClaimStatusHistoryResponse:
    return ClaimStatusHistoryResponse(
        id=h.id,
        from_status=h.from_status,
        to_status=h.to_status,
        message=h.message,
        created_at=h.created_at,
    )


def _parse_fraud_flags(raw: str | None) -> list | None:
    if not raw:
        return None
    try:
        out = json.loads(raw)
        return out if isinstance(out, list) else None
    except Exception:
        return None


def _claim_to_detail_response(c: Claim) -> ClaimDetailResponse:
    base = _claim_to_response(c)
    fp = c.fraud_probability
    an = c.anomaly_score
    return ClaimDetailResponse(
        **base.model_dump(),
        history=[_history_to_response(h) for h in (c.history or [])],
        ai_report_json=c.ai_report_json,
        fraud_probability=float(fp) if fp is not None else None,
        anomaly_score=float(an) if an is not None else None,
        risk_score=c.risk_score,
        risk_level=c.risk_level,
        fraud_flags=_parse_fraud_flags(c.fraud_flags),
    )


def _create_history(
    db: Session,
    *,
    claim: Claim,
    from_status: str | None,
    to_status: str,
    message: str | None = None,
) -> None:
    db.add(
        ClaimStatusHistory(
            claim_id_fk=claim.id,
            from_status=from_status,
            to_status=to_status,
            message=message,
        )
    )


async def _create_claim_record(
    *,
    db: Session,
    background: BackgroundTasks,
    payload: ClaimCreateRequest,
    user: User,
    files: list[UploadFile] | None = None,
    doc_types: list[str] | None = None,
) -> Claim:
    claim = Claim(
        claim_id=generate_claim_id(),
        claimant_user_id=user.id,
        patient_name=payload.patient_name,
        policy_number=payload.policy_number,
        hospital=payload.hospital,
        doctor=payload.doctor,
        diagnosis=payload.diagnosis,
        treatment_date=payload.treatment_date,
        claimed_amount=payload.claimed_amount,
        status=ClaimStatus.submitted,
        decision=ClaimDecision.pending,
    )
    db.add(claim)
    db.flush()

    _create_history(
        db,
        claim=claim,
        from_status=None,
        to_status=ClaimStatus.submitted.value,
        message="Claim submitted",
    )

    if files:
        normalized_types = doc_types or ["Other"] * len(files)
        for f, doc_type in zip(files, normalized_types, strict=True):
            stored_path, original_name = await save_upload_to_disk(claim.claim_id, f)
            db.add(
                ClaimDocument(
                    claim_id_fk=claim.id,
                    original_filename=original_name,
                    stored_path=stored_path,
                    content_type=f.content_type or "application/octet-stream",
                    document_type=str(doc_type),
                )
            )

    db.commit()
    db.refresh(claim)
    return claim


@router.post("", response_model=ClaimResponse)
async def create_claim(
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.claimant, UserRole.admin)),
):
    content_type = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" in content_type:
        form = await request.form()
        raw_payload = {
            "patient_name": form.get("patient_name"),
            "policy_number": form.get("policy_number"),
            "hospital": form.get("hospital"),
            "doctor": form.get("doctor"),
            "diagnosis": form.get("diagnosis"),
            "treatment_date": form.get("treatment_date"),
            "claimed_amount": form.get("claimed_amount"),
        }
        files = [f for f in form.getlist("files") if hasattr(f, "filename") and hasattr(f, "read")]
        doc_types_raw = str(form.get("document_types_json") or "[]")
        try:
            doc_types = json.loads(doc_types_raw)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail="document_types_json must be a JSON array") from e
        if not isinstance(doc_types, list):
            raise HTTPException(status_code=400, detail="document_types_json must be a JSON array")
        if files and doc_types and len(doc_types) != len(files):
            raise HTTPException(status_code=400, detail="document_types_json length must match files length")
    else:
        raw_payload = await request.json()
        files = []
        doc_types = []

    try:
        payload = ClaimCreateRequest.model_validate(raw_payload)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e

    claim = await _create_claim_record(
        db=db,
        background=background,
        payload=payload,
        user=user,
        files=files,
        doc_types=doc_types,
    )

    # Start AI only when documents exist (Stage 1/2 depend on them).
    # If claim is created without docs, AI will start on first document upload.
    if files and len(files) > 0:
        _queue_ai_pipeline(claim_db_id=claim.id)

    notify_status_change(to_email=user.email, to_phone=user.phone, claim_id=claim.claim_id, new_status=claim.status.value)
    return _claim_to_response(claim)


@router.post("/{claim_id}/documents", response_model=list[ClaimDocumentResponse])
async def upload_documents(
    claim_id: str,
    background: BackgroundTasks,
    files: Annotated[list[UploadFile], File(...)],
    document_types_json: Annotated[str, Form(...)],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if user.role == UserRole.claimant and claim.claimant_user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        doc_types: list[str] = json.loads(document_types_json)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="document_types_json must be a JSON array") from e

    if len(doc_types) != len(files):
        raise HTTPException(status_code=400, detail="document_types_json length must match files length")

    created: list[ClaimDocumentResponse] = []
    had_no_docs = not bool(claim.documents)
    for f, doc_type in zip(files, doc_types, strict=True):
        stored_path, original_name = await save_upload_to_disk(claim.claim_id, f)
        doc = ClaimDocument(
            claim_id_fk=claim.id,
            original_filename=original_name,
            stored_path=stored_path,
            content_type=f.content_type or "application/octet-stream",
            document_type=str(doc_type),
        )
        db.add(doc)
        db.flush()
        created.append(
            ClaimDocumentResponse(
                id=doc.id,
                original_filename=doc.original_filename,
                content_type=doc.content_type,
                document_type=doc.document_type,
                download_url=_document_download_url(claim.claim_id, doc.id),
                created_at=doc.created_at,
            )
        )

    # Initial AI run: if the claim was submitted without documents, kick off processing
    # as soon as the first docs arrive.
    should_process_initial = had_no_docs and claim.status == ClaimStatus.submitted
    if should_process_initial:
        _create_history(
            db,
            claim=claim,
            from_status=claim.status.value,
            to_status="Documents Uploaded",
            message="Initial documents uploaded; AI processing queued",
        )
        _create_history(
            db,
            claim=claim,
            from_status=claim.status.value,
            to_status="Processing",
            message="AI processing started after first document upload",
        )
        claim.status = ClaimStatus.processing

    should_reprocess = user.role == UserRole.claimant and claim.claimant_user_id == user.id and claim.status == ClaimStatus.more_info_requested
    if should_reprocess:
        _create_history(
            db,
            claim=claim,
            from_status=claim.status.value,
            to_status="More Info Submitted",
            message="Claimant submitted additional documents",
        )
        _create_history(
            db,
            claim=claim,
            from_status=claim.status.value,
            to_status="Reprocessing Claim",
            message="AI reprocessing queued after additional info",
        )
        claim.status = ClaimStatus.processing

    claim.updated_at = datetime.now(timezone.utc)
    db.commit()
    if should_process_initial:
        _queue_ai_pipeline(claim_db_id=claim.id)
    elif should_reprocess:
        _queue_ai_pipeline(claim_db_id=claim.id, is_reprocessing=True)
    return created


@router.get("/{claim_id}/documents/{document_id}/download")
def download_document(
    claim_id: str,
    document_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if user.role == UserRole.claimant and claim.claimant_user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    doc = db.query(ClaimDocument).filter(ClaimDocument.id == document_id, ClaimDocument.claim_id_fk == claim.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(path=doc.stored_path, media_type=doc.content_type, filename=doc.original_filename)


@router.get("", response_model=list[ClaimResponse])
def list_claims(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Claim).order_by(Claim.created_at.desc())
    if user.role == UserRole.claimant:
        q = q.filter(Claim.claimant_user_id == user.id)
    claims = q.all()
    return [_claim_to_response(c) for c in claims]


@router.get("/{claim_id}", response_model=ClaimDetailResponse)
def get_claim(
    claim_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if user.role == UserRole.claimant and claim.claimant_user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return _claim_to_detail_response(claim)


@router.delete("/{claim_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_claim(
    claim_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.claimant, UserRole.admin)),
):
    """Claimant can delete their own claim; admin can delete any. Removes claim, documents, history, and stored files."""
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if user.role == UserRole.claimant and claim.claimant_user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(claim)
    db.commit()
    delete_claim_storage(claim_id)
    return None


@router.get("/queue/approver", response_model=list[ClaimResponse])
def approver_queue(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.approver, UserRole.admin)),
):
    claims = db.query(Claim).order_by(Claim.updated_at.desc()).all()
    return [_claim_to_response(c) for c in claims]


@router.post("/{claim_id}/decision", response_model=ClaimDetailResponse)
def take_decision(
    claim_id: str,
    payload: ApproverDecisionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.approver, UserRole.admin)),
):
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    action = payload.action.lower().strip()
    if action not in {"approve", "reject", "request_more_info"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    previous = claim.status.value
    message = payload.message_to_claimant

    if action == "approve":
        claim.decision = ClaimDecision.approved
        claim.status = ClaimStatus.decision
    elif action == "reject":
        claim.decision = ClaimDecision.rejected
        claim.status = ClaimStatus.decision
    else:
        claim.status = ClaimStatus.more_info_requested

    if payload.notes:
        claim.approver_notes = payload.notes

    db.add(
        ClaimStatusHistory(
            claim_id_fk=claim.id,
            from_status=previous,
            to_status=claim.status.value,
            message=message,
        )
    )
    db.commit()
    db.refresh(claim)

    claimant = db.query(User).filter(User.id == claim.claimant_user_id).first()
    notify_status_change(
        to_email=claimant.email if claimant else None,
        to_phone=claimant.phone if claimant else None,
        claim_id=claim.claim_id,
        new_status=claim.status.value,
    )

    return _claim_to_detail_response(claim)


@router.post("/{claim_id}/more-info", response_model=ClaimDetailResponse)
def submit_more_info(
    claim_id: str,
    payload: ClaimMoreInfoRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.claimant, UserRole.admin)),
):
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if user.role == UserRole.claimant and claim.claimant_user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    previous = claim.status.value
    claim.diagnosis = f"{claim.diagnosis}\n\nAdditional info: {payload.additional_info}".strip()
    claim.status = ClaimStatus.processing
    claim.updated_at = datetime.now(timezone.utc)

    _create_history(
        db,
        claim=claim,
        from_status=previous,
        to_status="More Info Submitted",
        message=payload.additional_info,
    )
    _create_history(
        db,
        claim=claim,
        from_status=previous,
        to_status="Reprocessing Claim",
        message="AI reprocessing queued after claimant update",
    )
    db.commit()
    db.refresh(claim)

    _queue_ai_pipeline(claim_db_id=claim.id, is_reprocessing=True)
    return _claim_to_detail_response(claim)

