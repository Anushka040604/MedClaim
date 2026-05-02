import os
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def _set_test_env(tmp_path_factory: pytest.TempPathFactory):
    """
    Configure env vars BEFORE importing the FastAPI app/settings.
    Uses a file-based SQLite DB so multiple connections share state.
    """
    db_path = tmp_path_factory.mktemp("db") / "test.db"
    storage_dir = tmp_path_factory.mktemp("storage")
    chroma_dir = tmp_path_factory.mktemp("chroma")
    policies_dir = Path(__file__).resolve().parent.parent / "policies"

    os.environ.setdefault("ENV", "test")
    os.environ.setdefault("APP_NAME", "MCV Test")
    os.environ.setdefault("BACKEND_CORS_ORIGINS", "http://localhost:5173")
    os.environ.setdefault("DATABASE_URL", f"sqlite+pysqlite:///{db_path.as_posix()}")
    os.environ.setdefault("SESSION_SECRET", "test-session-secret")
    os.environ.setdefault("STORAGE_DIR", str(storage_dir))
    os.environ.setdefault("POLICIES_DIR", str(policies_dir))
    os.environ.setdefault("CHROMA_DIR", str(chroma_dir))
    os.environ.setdefault("GEMINI_API_KEY", "")  # keep Gemini off for tests

    return {
        "db_path": db_path,
        "storage_dir": storage_dir,
        "chroma_dir": chroma_dir,
        "policies_dir": policies_dir,
    }


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    # Disable background AI pipeline during tests (it would run OCR/RAG).
    import app.api.routers.claims as claims_router

    monkeypatch.setattr(claims_router, "run_ai_pipeline_stub", lambda _claim_db_id: None)

    from fastapi.testclient import TestClient
    from app.main import app

    # Use context manager so startup/shutdown events run (creates tables).
    with TestClient(app) as c:
        yield c

