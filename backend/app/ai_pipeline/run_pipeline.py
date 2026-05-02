from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.ai_pipeline.stages.stage1_ocr import run_ocr
from app.ai_pipeline.stages.stage2_extraction_llm import extract_fields_with_llm
from app.ai_pipeline.stages.stage3_policy_rag_llm import (
    PolicyComplianceResult,
    policy_rag_check_with_llm,
)
from app.ai_pipeline.stages.stage4_code_validation import run_code_validation
from app.db.session import SessionLocal
from app.models.claim import Claim, ClaimStatus, ClaimStatusHistory
from app.services.fraud_detection_service import FraudDetectionResult, analyze_fraud
from app.services.notifications import notify_status_change

logger = logging.getLogger(__name__)


def _set_status(db: Session, claim: Claim, new_status: ClaimStatus, message: str | None = None) -> None:
    previous = claim.status.value
    claim.status = new_status
    claim.updated_at = datetime.now(timezone.utc)
    db.add(
        ClaimStatusHistory(
            claim_id_fk=claim.id,
            from_status=previous,
            to_status=new_status.value,
            message=message,
        )
    )


def _fraud_fallback(reason: str) -> FraudDetectionResult:
    return FraudDetectionResult(
        fraud_probability=0.0,
        anomaly_score=0.0,
        risk_score_0_100=0,
        risk_level="GREEN",
        flags=[{"type": "fraud_detection_error", "message": reason}],
        model_status="error",
    )


def run_ai_pipeline_stub(claim_db_id: int, is_reprocessing: bool = False) -> None:
    """
    AI processing: OCR → extraction → policy RAG → ICD/CPT validation → ML fraud scoring.
    """
    db = SessionLocal()
    try:
        try:
            claim = db.query(Claim).filter(Claim.id == claim_db_id).first()
            if not claim:
                return
            print(f"[ai] start claim_id={claim.claim_id} reprocessing={is_reprocessing} docs={len(claim.documents or [])}", flush=True)

            start_message = "AI Reprocessing Started" if is_reprocessing else "AI processing started"
            _set_status(db, claim, ClaimStatus.processing, start_message)
            db.commit()

            # Stage 1 + Stage 2 sequential per document (single-threaded).
            doc_results: list[dict] = []
            for d in (claim.documents or []):
                print(f"[ai] doc start claim_id={claim.claim_id} doc_id={d.id} type={d.document_type}", flush=True)
                ocr = run_ocr(stored_path=d.stored_path)
                print(f"[ai] ocr done claim_id={claim.claim_id} doc_id={d.id} text_len={len(ocr.text or '')} flags={len(ocr.quality_flags)}", flush=True)
                extraction = extract_fields_with_llm(
                    document_type=d.document_type,
                    ocr_text=ocr.text,
                )
                keys = list(extraction.extracted_json.keys())[:10] if isinstance(extraction.extracted_json, dict) else "non_dict"
                print(f"[ai] extraction done claim_id={claim.claim_id} doc_id={d.id} keys={keys}", flush=True)
                doc_results.append(
                    {
                        "document_id": d.id,
                        "document_type": d.document_type,
                        "original_filename": d.original_filename,
                        "quality_flags": ocr.quality_flags,
                        "extraction": extraction.extracted_json,
                    }
                )

            # Stage 3: policy compliance RAG (exactly one LLM call for the claim).
            policy_query = (
                f"Patient={claim.patient_name}; Policy={claim.policy_number}; "
                f"Hospital={claim.hospital}; Doctor={claim.doctor}; "
                f"Diagnosis={claim.diagnosis}; TreatmentDate={claim.treatment_date}; "
                f"ClaimedAmount={float(claim.claimed_amount)}"
            )
            try:
                print(f"[ai] stage3 start claim_id={claim.claim_id}", flush=True)
                policy = policy_rag_check_with_llm(policy_query=policy_query)
                print(f"[ai] stage3 done claim_id={claim.claim_id} compliant={policy.compliant}", flush=True)
            except Exception as e:
                policy = PolicyComplianceResult(
                    compliant=None,
                    clause_citations=[],
                    explanation=f"RAG error: {type(e).__name__}: {str(e)[:300]}",
                )

            # Stage 4: ICD/CPT validation on extracted codes
            print(f"[ai] stage4 start claim_id={claim.claim_id}", flush=True)
            stage4 = run_code_validation(doc_results=doc_results)
            print(f"[ai] stage4 done claim_id={claim.claim_id}", flush=True)

            stage3_dict = {
                "compliant": policy.compliant,
                "explanation": policy.explanation,
                "citations": policy.clause_citations,
            }

            claim_dict = {
                "claim_id": claim.claim_id,
                "patient_name": claim.patient_name,
                "policy_number": claim.policy_number,
                "hospital": claim.hospital,
                "doctor": claim.doctor,
                "diagnosis": claim.diagnosis,
                "treatment_date": claim.treatment_date,
                "claimed_amount": float(claim.claimed_amount),
            }

            try:
                print(f"[ai] stage5 start claim_id={claim.claim_id}", flush=True)
                fraud = analyze_fraud(
                    claim=claim_dict,
                    doc_results=doc_results,
                    stage3_policy=stage3_dict,
                    stage4=stage4,
                )
                print(f"[ai] stage5 done claim_id={claim.claim_id} model_status={fraud.model_status}", flush=True)
            except Exception as e:
                logger.exception("Fraud detection failed for claim %s: %s", claim.claim_id, e)
                fraud = _fraud_fallback(reason=f"{type(e).__name__}: {str(e)[:200]}")

            _set_status(db, claim, ClaimStatus.under_review, "AI processing completed")

            claim.fraud_probability = fraud.fraud_probability
            claim.anomaly_score = fraud.anomaly_score
            claim.risk_score = fraud.risk_score_0_100
            claim.risk_level = fraud.risk_level
            claim.fraud_flags = json.dumps(fraud.flags)

            claim.ai_report_json = json.dumps(
                {
                    "stage1_ocr": {"status": "ok", "documents_processed": len(doc_results)},
                    "stage2_extraction": {"status": "ok", "documents": doc_results},
                    "stage3_policy_rag": {
                        "status": "ok",
                        "compliant": policy.compliant,
                        "explanation": policy.explanation,
                        "citations": policy.clause_citations,
                    },
                    "stage4_code_validation": stage4,
                    "stage5_fraud_scoring": {
                        "status": "ok" if fraud.model_status != "error" else "error",
                        "fraud_probability": fraud.fraud_probability,
                        "anomaly_score": fraud.anomaly_score,
                        "risk_score_0_100": fraud.risk_score_0_100,
                        "risk_score": fraud.risk_score_0_100,
                        "risk_level": fraud.risk_level,
                        "flags": fraud.flags,
                        "model_status": fraud.model_status,
                    },
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            db.add(
                ClaimStatusHistory(
                    claim_id_fk=claim.id,
                    from_status=claim.status.value,
                    to_status="AI Report Updated",
                    message="Latest AI report saved",
                )
            )
            db.commit()

            notify_status_change(to_email=None, to_phone=None, claim_id=claim.claim_id, new_status=claim.status.value)
        except Exception as e:  # noqa: BLE001
            # Never leave a claim stuck in Processing.
            logger.exception("AI pipeline failed for claim_db_id=%s: %s", claim_db_id, e)
            claim = db.query(Claim).filter(Claim.id == claim_db_id).first()
            if claim:
                _set_status(db, claim, ClaimStatus.under_review, "AI processing failed (see ai_report_json)")
                claim.ai_report_json = json.dumps(
                    {
                        "status": "error",
                        "error": {"type": type(e).__name__, "message": str(e)[:500]},
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                db.commit()
    finally:
        db.close()
