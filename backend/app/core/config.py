from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    app_name: str = "Medical Claim Verification"
    backend_cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175"

    database_url: str

    session_secret: str = "change-me-in-production"

    storage_dir: str = "storage"

    # RAG storage
    policies_dir: str = "policies"
    chroma_dir: str = "storage/chroma"
    # RAG behavior
    # Vector retrieval can trigger large model downloads on first run; keep off by default.
    rag_use_vectors: bool = False

    sendgrid_api_key: str | None = None
    sendgrid_from_email: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # Groq (OpenAI-compatible) - optional alternative to Gemini for Stage 2/3
    groq_api_key: str | None = None
    # Default to a generally-available Groq model id (see: GET /openai/v1/models)
    groq_model_extraction: str = "groq/compound"
    groq_model_reasoning: str = "groq/compound"
    # Groq load-shaping (process-wide)
    # Keep these conservative on small tiers to avoid 429 TPM/RPM.
    groq_max_concurrency: int = 1
    groq_requests_per_minute: int = 10
    # A rough token/min budget (we estimate tokens; provider accounting is authoritative).
    groq_tokens_per_minute: int = 7000
    groq_call_delay_seconds: float = 0.0
    groq_retry_max_attempts: int = 8


settings = Settings()

