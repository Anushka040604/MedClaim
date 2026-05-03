# How to Run the Project (macOS/Linux/Windows)

From the **repository root** (the folder that contains `backend/` and `frontend/`).

**Prerequisites:** [Node.js](https://nodejs.org/) (LTS), and **Python 3.13+**.

---

## A) First-time setup (once per clone)

### 1. Backend virtual environment and dependencies

**macOS/Linux:**
```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r requirements.txt
```

### 2. Environment file

Copy the example config:
```bash
cp backend/.env.example backend/.env
```

Edit **`backend/.env`** and set **`DATABASE_URL`**. Recommend **SQLite** (no external DB needed):
```
DATABASE_URL=sqlite+pysqlite:///./storage/local.db
```

Ensure **`SESSION_SECRET`** is set to a non-empty value.

### 3. Fraud ML models (once — generates `ml_models/artifacts/*.pkl`)

Still in **`backend/`** with venv activated:

```bash
python -m ml_models.data_generator --samples 4000
python -m ml_models.train_model
```

**Skip this** if `backend/ml_models/artifacts/*.pkl` files already exist.

### 4. Frontend dependencies

```bash
cd frontend
npm install
cd ..
npm install
```

---

## B) Run the full stack (every time)

### macOS/Linux: Separate terminals

**Terminal 1 — Backend:**
```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Access:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

### Windows: Combined

From repository root:
```powershell
npm run dev
```

This runs both backend (port 8000) and frontend (port 5173) concurrently.

---

## Demo users (pre-seeded)

| Role     | Email              | Password |
|----------|--------------------|----------|
| Claimant | claimant@gmail.com | 123      |
| Approver | approver@gmail.com | 123      |
| Admin    | admin@gmail.com    | 123      |

**Typical flow:** Sign in → Create claim → Upload documents → Open claim → Use **Refresh** or **Live** until AI report appears.

---

## Troubleshooting

- **bcrypt error on startup?** Ensure Python 3.13+ is used (not 3.14).
- **Port already in use?** Change `--port 8000` to another port (e.g., 8002, 8003).
- **Node modules error?** Run `rm -rf frontend/node_modules frontend/package-lock.json && cd frontend && npm install`.
- **Database issues?** Delete `backend/storage/local.db` and restart—it will auto-create.

---

## What to exclude when sharing

Per `RUN.md` root:
- `frontend/node_modules/`
- `backend/.venv/`
- `backend/ml_models/data/*.csv` (regenerate with `python -m ml_models.data_generator`)
- `backend/storage/` (optional)
- `.DS_Store`, `__pycache__`, `.pytest_cache/`
