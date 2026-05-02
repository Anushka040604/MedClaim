# Run guide

**Fast path (SQLite, Windows):** see **[docs/RUN.md](docs/RUN.md)** — venv, train fraud models once, `npm run dev`.

This file covers **PostgreSQL via Docker** and a generic backend/frontend split.

## Before you zip / clone

You can omit large folders:

- `frontend/node_modules/`
- `backend/.venv/`
- `backend/ml_models/data/*.csv` (regenerate with `python -m ml_models.data_generator`)
- `backend/storage/` (optional)

After clone, recreate `.venv`, run `pip install`, and **train fraud models** once (see `docs/RUN.md`).

## 1) Postgres (optional — only if `DATABASE_URL` points to Postgres)

From repo root:

```bash
cd infra
docker compose up -d
```

Default in compose: user `mcv`, password `mcv`, db `mcv`, port `5432`.

## 2) Backend

```bash
cd backend
python -m venv .venv
```

**Windows (PowerShell):** `.venv\Scripts\Activate.ps1`  
**macOS/Linux:** `source .venv/bin/activate`

```bash
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env   # Windows; use cp on Unix
```

Set `DATABASE_URL` in `.env` (SQLite or Postgres). Train ML artifacts once:

```bash
python -m ml_models.data_generator --samples 4000
python -m ml_models.train_model
```

Run API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000  
- Swagger: http://localhost:8000/docs  

### Optional: RAG extras

```bash
pip install -r requirements-rag.txt
```

### Optional: OCR (Windows)

Install Tesseract (and Poppler for PDFs); set `TESSERACT_CMD` / `POPPLER_PATH` in `backend/.env` if needed.

## 3) Frontend

Second terminal:

```bash
cd frontend
npm install
npm run dev
```

UI: http://localhost:5173

## 4) Backend + frontend together (Windows)

From **repository root**:

```bash
npm install
npm run dev
```

`backend/ensure_and_run.ps1` creates `backend/.venv` if missing, installs requirements, starts Uvicorn. It does **not** auto-train ML; train once using the commands above or [docs/RUN.md](docs/RUN.md).

## Demo logins

- `claimant@gmail.com` / `123`
- `approver@gmail.com` / `123`
- `admin@gmail.com` / `123`
