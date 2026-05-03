from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.api import api_router
from app.core.config import settings
from app.db.base import init_db
from app.db.session import SessionLocal
from app.models.claim import Claim, ClaimStatus

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.backend_cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)


def _resume_orphaned_pipelines() -> None:
    """
    AI pipelines run in background threads. If the process restarts, threads
    die and any claims in Processing get stuck forever. On startup, find any
    claim left in Processing and re-launch its pipeline.

    Only resumes claims that have been Processing for >=10 seconds, to avoid
    racing with a worker that legitimately just started.
    """
    from app.ai_pipeline.run_pipeline import run_ai_pipeline_stub

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=10)
        # SQLite stores naive datetimes; compare naive to naive
        cutoff_naive = cutoff.replace(tzinfo=None)
        stuck = (
            db.query(Claim)
            .filter(Claim.status == ClaimStatus.processing)
            .filter(Claim.updated_at < cutoff_naive)
            .all()
        )
        if not stuck:
            return
        logger.warning("Resuming %d orphaned Processing claim(s)", len(stuck))
        for claim in stuck:
            cid = claim.id
            t = threading.Thread(
                target=run_ai_pipeline_stub,
                args=(cid,),
                kwargs={"is_reprocessing": True},
                daemon=True,
            )
            t.start()
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to resume orphaned pipelines: %s", e)
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    _resume_orphaned_pipelines()


app.include_router(api_router)

