# Medical Claim Verification (MCV)

End-to-end demo that simulates a **medical claim submission + review workflow**, with an **AI pipeline** that produces an explainable report (OCR → extraction → policy check → ICD/CPT format checks → fraud/risk scoring).

This repo is intentionally “minimal but complete”: it has a modern UI, a real API + database, background processing, and enough scaffolding to extend into a full system.

## What’s inside (tech stack)

- **Frontend**
  - React 18 + TypeScript
  - Vite dev server / build
  - Tailwind CSS
  - React Router
  - Axios (`withCredentials`) for session-cookie auth
- **Backend**
  - FastAPI (OpenAPI at `/docs`)
  - Session-based auth via `SessionMiddleware` (signed cookie)
  - SQLAlchemy 2.x ORM
  - DB: SQLite **or** PostgreSQL (via Docker Compose)
  - Local file storage for uploads (`backend/storage/…`)
- **AI / “Module 2” pipeline**
  - Stage 1: PDF/image text extraction via **PyMuPDF** + optional Gemini Vision fallback
  - Stage 2: structured field extraction via **Groq** (OpenAI-compatible) *or* **Gemini API**
  - Stage 3: minimal policy “RAG” over `.txt` policy docs (ChromaDB + sentence-transformers when available; fallback retrieval otherwise) + LLM reasoning via Groq/Gemini
  - Stage 4: ICD-10 + CPT/HCPCS **format** validation (regex-based)
  - Stage 5: fraud/risk scoring
    - Rules-only fallback always works
    - Optional ML scoring if artifacts exist (IsolationForest + XGBoost + StandardScaler trained locally)
- **Notifications (optional)**
  - SendGrid / Twilio config exists, but the demo implementation is a safe no-op (no external calls).

## Repository layout

```text
backend/    FastAPI app, DB models, AI pipeline, ML training scripts, storage/
frontend/   React UI
infra/      docker-compose.yml (Postgres)
docs/       extra run notes (Windows focused)
RUN.md      step-by-step runbook
```

## System flow (end-to-end)

### User roles (seeded demo accounts)

The backend seeds 3 fixed users on startup (password always `123`):

- **Claimant**: `claimant@gmail.com`
- **Approver**: `approver@gmail.com`
- **Admin**: `admin@gmail.com`

Auth is session-cookie based:
- `POST /api/auth/login` sets `request.session["user_id"]`
- frontend sends cookies via Axios `withCredentials: true`

### Claim lifecycle (happy path)

1. **Claimant logs in** in the frontend.
2. Claimant submits a claim (with optional PDFs/images).
3. Backend:
   - Creates DB rows: `claims`, `claim_documents`, `claim_status_history`
   - Saves files to disk under `backend/storage/claims/<claim_id>/`
   - Enqueues background processing: `run_ai_pipeline_stub(claim_db_id)`
4. AI pipeline runs in the background and updates:
   - `claims.status` → `Processing` → `Under Review`
   - `claims.ai_report_json` (Stage 1–5 outputs)
   - `claims.fraud_probability`, `claims.anomaly_score`, `claims.risk_score`, `claims.risk_level`, `claims.fraud_flags`
5. **Approver reviews** the claim + AI report and takes an action:
   - Approve / Reject → status `Decision`
   - Request more info → status `More Info Requested`
6. If more info is requested, claimant can:
   - Submit extra text (“More info”) and/or upload documents
   - Backend re-queues AI processing and updates history

### Architecture diagram

```mermaid
flowchart LR
  UI[React UI<br/>Vite + Tailwind] -->|Axios + Cookies| API[FastAPI<br/>/api]
  API --> DB[(SQLite or Postgres)]
  API --> FS[(Local storage<br/>backend/storage)]
  API --> BG[Background task<br/>AI pipeline]
  BG --> FS
  BG --> DB
  BG --> LLM[Groq or Gemini]
  BG --> RAG[Policy retrieval<br/>Chroma or fallback]
```

## Backend details

### API base URL

- Default API base: `http://localhost:8000/api`
- OpenAPI docs: `http://localhost:8000/docs`

### Main endpoints

- **Auth**
  - `POST /api/auth/login` → returns `MeResponse` and sets session cookie
  - `POST /api/auth/logout` → clears session
  - `GET /api/auth/me` → current user
- **Claims**
  - `POST /api/claims` → create claim (JSON or multipart with `files`)
  - `GET /api/claims` → list claims (claimant sees own; approver/admin sees all)
  - `GET /api/claims/{claim_id}` → claim detail (includes `history`, AI fields)
  - `DELETE /api/claims/{claim_id}` → delete (claimant own or admin)
  - `POST /api/claims/{claim_id}/documents` → upload more docs (multipart)
  - `GET /api/claims/{claim_id}/documents/{document_id}/download` → file download
  - `GET /api/claims/queue/approver` → queue view for approver/admin
  - `POST /api/claims/{claim_id}/decision` → approve/reject/request_more_info
  - `POST /api/claims/{claim_id}/more-info` → claimant text update + reprocess

### Data model (tables)

- `users`
  - `email`, `password_hash` (bcrypt), `role` (`claimant|approver|admin`)
- `claims`
  - claim metadata + `status` / `decision`
  - AI outputs: `ai_report_json`, fraud/risk fields
- `claim_documents`
  - document metadata + stored file path
- `claim_status_history`
  - timeline of status transitions and messages

### Database setup behavior

On backend startup (`backend/app/main.py`), `init_db()`:
- creates tables via `Base.metadata.create_all`
- runs a small migration helper to add fraud columns if missing
- seeds fixed demo users (and refreshes their password to `123`)

## AI pipeline (Module 2)

The background task is triggered when a claim is created (and also on “reprocess” paths).

### Stage 1 — OCR / text extraction (`stage1_ocr.py`)

- PDFs: tries native text extraction via PyMuPDF.
- If a page has too little text, it renders the page to an image and extracts text using **Gemini Vision** (if configured).
- Images: Gemini Vision OCR.

### Stage 2 — Structured extraction (`stage2_extraction_llm.py`)

Given `document_type` + OCR text, returns JSON fields:
- patient/hospital/doctor/diagnosis
- dates, policy number, claimed amount
- diagnosis/procedure codes
- line items

LLM provider selection:
- Uses **Groq** when `GROQ_API_KEY` is set (preferred).
- Else uses **Gemini** when `GEMINI_API_KEY` is set.
- Else returns a helpful “configure Groq/Gemini” note in the output.

### Stage 3 — Policy “RAG” (`stage3_policy_rag_llm.py`)

- Loads `.txt` policies from `POLICIES_DIR` (default `policies/` under `backend/`).
- Retrieval:
  - Tries ChromaDB + sentence-transformers (local embeddings)
  - Falls back to a simple token-overlap scorer if vector store deps aren’t available
- Reasoning:
  - Uses Groq (preferred) or Gemini to return JSON: `compliant`, `explanation`, `citations`

### Stage 4 — ICD/CPT checks (`stage4_code_validation.py`)

Validates code **format only**:
- ICD-10-CM pattern: letter + digits + optional dot suffix
- CPT: `#####`
- HCPCS: `A####` … `V####`

Outputs `aggregate` counts (used as features in Stage 5).

### Stage 5 — Fraud / risk scoring (`services/fraud_detection_service.py`)

- Always computes rule-based flags (explainable)
- If trained artifacts exist under `backend/ml_models/artifacts/`, it also runs:
  - StandardScaler
  - IsolationForest (anomaly)
  - XGBoost classifier (fraud probability)
- Writes results to `claims` columns + `ai_report_json.stage5_fraud_scoring`

## How to run

### macOS / Linux — Makefile (simplest)

From repo root:

```bash
make setup    # creates backend venv, installs deps, copies .env (one-time)
make start    # launches backend (port 8000) + frontend (port 5173) in background
make stop     # kills both
make restart  # stop + start
make clean    # removes __pycache__, dist, etc
```

Demo logins printed below. App at http://localhost:5173.

### Windows — runbook

See `RUN.md` (repo root) and `docs/RUN.md`.

### One-command dev mode (Windows, frontend + backend)

After one-time installs, run from repo root:

```powershell
npm run dev
```

This uses:
- `concurrently` (root `package.json`)
- `backend/ensure_and_run.ps1` to create the venv, install deps, and start Uvicorn
- `frontend` Vite dev server

### Backend only (manual)

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Using backend on port 8000 (recommended on Windows when 8000 gets stuck)

If port `8000` is “stuck” due to lingering Uvicorn/reload processes, run the backend on `8000`:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
$env:BACKEND_PORT="8000"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

And point the frontend at it using `frontend/.env.local`:

```text
VITE_API_BASE=http://localhost:8000/api
```

### Frontend only (manual)

```powershell
cd frontend
npm install
npm run dev
```

## Configuration (.env)

Backend config lives in `backend/.env` and is loaded by `pydantic-settings`.

Common variables:

- **`DATABASE_URL`** (required)
  - SQLite (simplest): `sqlite+pysqlite:///./storage/local.db`
  - Postgres: `postgresql+psycopg2://mcv:mcv@localhost:5432/mcv`
- **`SESSION_SECRET`**: cookie signing secret (use a real secret in prod)
- **`BACKEND_CORS_ORIGINS`**: comma-separated origins (defaults include `http://localhost:5173`)

LLM / AI:
- **`GEMINI_API_KEY`**: if using Gemini
- **`GEMINI_MODEL_EXTRACTION`**, **`GEMINI_MODEL_REASONING`**
- **`GEMINI_CALL_DELAY_SECONDS`**, **`GEMINI_RETRY_MAX_ATTEMPTS`**
- **`GEMINI_MAX_CONCURRENCY`**: in-flight Gemini calls (process-wide)
- **`GEMINI_REQUESTS_PER_MINUTE`**: hard cap on total Gemini requests/min (process-wide)
- **`GEMINI_VISION_REQUESTS_PER_MINUTE`**: optional separate cap for Vision OCR (Stage 1)
- **`GEMINI_CACHE_ENABLED`**, **`GEMINI_CACHE_DIR`**: optional on-disk response cache
- **`POLICIES_DIR`**: where `.txt` policy docs live
- **`CHROMA_DIR`**: persistent Chroma folder (optional)

Groq (POC):
- **`GROQ_API_KEY`**: enables Groq for Stage 2 + Stage 3 (preferred if set)
- **`GROQ_MODEL_EXTRACTION`**: default `llama-3.1-8b-instant`
- **`GROQ_MODEL_REASONING`**: default `llama-3.3-70b-versatile`

Notifications (optional, demo no-op):
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

## Postgres (optional)

Start Postgres via Docker Compose:

```powershell
cd infra
docker compose up -d
```

Defaults:
- user `mcv`, password `mcv`, db `mcv`, port `5432`

## Training fraud ML artifacts (optional but recommended)

Stage 5 ML inference only runs if artifacts exist under `backend/ml_models/artifacts/`.
Train once:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m ml_models.data_generator --samples 4000
python -m ml_models.train_model
```

## Where to extend

- **Add real notifications**: `backend/app/services/notifications.py`
- **Replace local storage**: `backend/app/services/storage.py` (S3/Azure/GCS, etc.)
- **Add real policy documents**: put `.txt` files under `backend/policies/` (or change `POLICIES_DIR`)
- **Harden auth**: replace fixed users + sessions with proper user management/JWT/OAuth
- **Background jobs**: move from FastAPI `BackgroundTasks` to Celery/RQ/Arq for production

## Frontend UI design

The UI was redesigned end-to-end on the `design/mvp-ui-polish` branch. Key principles:

- **Decision-first detail page** — claim detail shows VERDICT banner ("Likely approve / Needs review / Likely reject") at top, computed from policy compliance + risk score + critical issues. Risk number shown inside the verdict tile (left), not floating.
- **Role-aware dashboards** —
  - **Claimant**: list-primary, "+ New claim" opens a modal form
  - **Approver**: alert-driven stats (SLA breach / High risk / Needs decision / Oldest pending), table-like row with risk badge + "Waiting: 6h", filters bar (risk / status / sort / SLA-only), sticky decision sidebar with override toggle when warnings exist
  - **Admin**: same dashboard variant + extra stats, oldest-first sort, no delete button
- **Human-readable AI flags** — internal types like `ml_models_not_trained` are hidden, `invalid_medical_codes` becomes "2 medical codes invalid", `amount_mismatch` parses ratio and shows Claimed/Extracted/Diff.
- **Auto-refresh** — claim detail polls every 2s, dashboards every 30s. Manual Refresh buttons removed.
- **Mobile** — hamburger drawer, breadcrumb header, responsive grids.
- **Out of scope (needs backend)**: claim assignment to specific approvers, bulk actions, override AI risk score, audit log UI, analytics histograms, document preview modal.

## Troubleshooting

- **Current known errors / issues (what they mean)**
  - **Gemini `403 PermissionDenied`**
    - Your Google project/account doesn’t currently have access/eligibility for the model/API. This is **not a code bug**. Fix in Google AI Studio / GCP (API enabled, project selected, billing/quota/region eligibility).
  - **Gemini `429 ResourceExhausted` with `limit: 0`**
    - You have **0 remaining quota** for that model/tier. Throttling/backoff helps bursts, but cannot fix `limit: 0`. Either wait for quota reset or enable billing / increase quota.
  - **Groq `model_decommissioned`**
    - The configured model name is no longer available on Groq. Update `GROQ_MODEL_*` to a currently supported model (example: `llama-3.3-70b-versatile`).
  - **`GET /api/claims/{claim_id}/ai-report` returns `404`**
    - This project currently **does not expose** a dedicated `/ai-report` endpoint. The AI report is stored as `ai_report_json` on the claim detail response (`GET /api/claims/{claim_id}`).
  - **Groq `HTTP 429 Rate limit reached (TPM/RPM)`**
    - Your Groq org/tier hit tokens-per-minute or requests-per-minute. The pipeline now retries with backoff and also reduces token usage, but if you run many claims quickly you can still hit limits—wait a minute and retry.
  - **Stage 2 extraction shows `parse_error`**
    - The LLM returned text around JSON (markdown fences / extra prose). The extractor now tries to recover JSON, but if the provider returns non-JSON repeatedly you'll still see `parse_error` with the raw output.
  - **Claim stuck in `Processing` after backend restart**
    - Background pipeline runs in a daemon thread. When uvicorn restarts, the thread dies. `app/main.py` now runs `_resume_orphaned_pipelines()` on startup — finds claims left in `Processing` for >10s and re-launches the pipeline as `reprocessing=True`. Just restart the backend; stuck claims pick up automatically.
  - **`{"error": {"type": "BrokenPipeError"}}` in `ai_report_json`**
    - Pre-fix bug: `print(..., flush=True)` in the pipeline thread raised `BrokenPipeError` when stdout closed (e.g., uvicorn reload). The outer Exception handler treated this as a real failure and poisoned the report. Fix: module-local `print()` shadow in `run_pipeline.py` and `groq_client.py` swallows `BrokenPipeError`/`OSError` and falls back to `logger.info`. Existing poisoned claims need to be reprocessed via "Submit more info".
  - **CORS preflight 400 on `OPTIONS /api/auth/login`**
    - Frontend at `localhost:5173`, backend `BACKEND_CORS_ORIGINS` had only `127.0.0.1`. `backend/.env` ships with both `localhost` and `127.0.0.1` variants on ports 5173–5175. If you change the frontend port, add it to that list.
  - **Windows PowerShell: `&& is not a valid statement separator`**
    - PowerShell doesn’t support `cmd`-style `&&`. Use separate lines or `;`.
  - **Port bind error `Errno 10048`**
    - Another process is already using the port. Run on `8000` or kill the owning PID.
  - **Broken `.venv`**
    - If the venv was moved/copied, scripts can point to old paths. Delete `backend/.venv` and re-run `backend/ensure_and_run.ps1`.

- **401 Not logged in**
  - Make sure frontend uses `withCredentials: true` (it does)
  - Make sure backend CORS allows credentials and origin matches
- **Gemini quota / 429**
  - Lower `GEMINI_REQUESTS_PER_MINUTE`, keep `GEMINI_MAX_CONCURRENCY=1`, or retry later
- **Windows wheel issues**
  - `backend/ensure_and_run.ps1` includes repair logic for common broken wheels (pydantic-core / psycopg2 / grpc / cryptography).

