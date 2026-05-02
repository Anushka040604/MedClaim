from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import engine
from app.models.base import Base
from app.models.claim import Claim, ClaimDocument, ClaimStatusHistory
from app.models.user import User, UserRole


def _migrate_claim_fraud_columns() -> None:
    """Add Stage 5 fraud columns to `claims` if missing (SQLite + PostgreSQL)."""
    try:
        insp = inspect(engine)
        if not insp.has_table("claims"):
            return
        existing = {c["name"] for c in insp.get_columns("claims")}
    except Exception:
        return

    alters: list[str] = []
    if "fraud_probability" not in existing:
        alters.append("ADD COLUMN fraud_probability NUMERIC(8, 6)")
    if "anomaly_score" not in existing:
        alters.append("ADD COLUMN anomaly_score NUMERIC(10, 6)")
    if "risk_score" not in existing:
        alters.append("ADD COLUMN risk_score INTEGER")
    if "risk_level" not in existing:
        alters.append("ADD COLUMN risk_level VARCHAR(20)")
    if "fraud_flags" not in existing:
        alters.append("ADD COLUMN fraud_flags TEXT")

    if not alters:
        return
    with engine.begin() as conn:
        for fragment in alters:
            conn.execute(text(f"ALTER TABLE claims {fragment}"))


def seed_users(session: Session) -> None:
    """Create the three fixed demo users if they don't exist; always refresh their password so '123' works."""
    fixed = [
        ("claimant@gmail.com", "Claimant", UserRole.claimant),
        ("approver@gmail.com", "Approver", UserRole.approver),
        ("admin@gmail.com", "Admin", UserRole.admin),
    ]
    password_hash = hash_password("123")
    for email, full_name, role in fixed:
        user = session.query(User).filter(User.email == email).first()
        if user is None:
            session.add(
                User(email=email, full_name=full_name, password_hash=password_hash, role=role)
            )
        else:
            user.password_hash = password_hash
    session.commit()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _migrate_claim_fraud_columns()
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        seed_users(db)
    finally:
        db.close()

