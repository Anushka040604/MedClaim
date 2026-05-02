from __future__ import annotations

import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ClaimStatus(str, enum.Enum):
    submitted = "Submitted"
    processing = "Processing"
    under_review = "Under Review"
    decision = "Decision"
    more_info_requested = "More Info Requested"


class ClaimDecision(str, enum.Enum):
    pending = "Pending"
    approved = "Approved"
    rejected = "Rejected"


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    claim_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)

    claimant_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    patient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    policy_number: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    hospital: Mapped[str] = mapped_column(String(200), nullable=False)
    doctor: Mapped[str] = mapped_column(String(200), nullable=False)
    diagnosis: Mapped[str] = mapped_column(Text, nullable=False)
    treatment_date: Mapped[date] = mapped_column(Date, nullable=False)
    claimed_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    status: Mapped[ClaimStatus] = mapped_column(Enum(ClaimStatus), nullable=False, default=ClaimStatus.submitted)
    decision: Mapped[ClaimDecision] = mapped_column(Enum(ClaimDecision), nullable=False, default=ClaimDecision.pending)

    ai_report_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stage 5 fraud ML outputs (nullable for backward compatibility with existing rows)
    fraud_probability: Mapped[float | None] = mapped_column(Numeric(8, 6), nullable=True)
    anomaly_score: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fraud_flags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of flag objects

    approver_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    documents: Mapped[list["ClaimDocument"]] = relationship(back_populates="claim", cascade="all, delete-orphan")
    history: Mapped[list["ClaimStatusHistory"]] = relationship(back_populates="claim", cascade="all, delete-orphan")


class ClaimDocument(Base):
    __tablename__ = "claim_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    claim_id_fk: Mapped[int] = mapped_column(ForeignKey("claims.id"), nullable=False, index=True)

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    document_type: Mapped[str] = mapped_column(String(100), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    claim: Mapped["Claim"] = relationship(back_populates="documents")


class ClaimStatusHistory(Base):
    __tablename__ = "claim_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    claim_id_fk: Mapped[int] = mapped_column(ForeignKey("claims.id"), nullable=False, index=True)

    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    claim: Mapped["Claim"] = relationship(back_populates="history")

