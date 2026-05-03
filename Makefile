.PHONY: help install start stop restart clean setup

help:
	@echo "Medical Claim Verification"
	@echo ""
	@echo "Setup (run once):"
	@echo "  make setup   - install deps (uses SQLite)"
	@echo ""
	@echo "Development:"
	@echo "  make start   - start backend + frontend"
	@echo "  make stop    - stop backend + frontend"
	@echo "  make restart - restart all"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean   - remove cache files"

setup: .env install
	@echo "✓ Setup complete. Run 'make start' to launch apps"

.env:
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo "✓ Created backend/.env from .env.example"; \
	fi

install: .env
	@if [ ! -d "backend/.venv" ]; then \
		echo "Installing backend (Python 3.13)..."; \
		cd backend && python3.13 -m venv .venv; \
	fi
	@cd backend && .venv/bin/pip install -q \
		fastapi uvicorn sqlalchemy pydantic pydantic-core pydantic-settings \
		'passlib[bcrypt]' 'bcrypt<5.0' python-multipart email-validator \
		httpx itsdangerous cryptography cffi sendgrid twilio pymupdf \
		google-generativeai numpy scikit-learn xgboost joblib \
		'uvicorn[standard]' grpcio grpcio-tools grpcio-status protobuf
	@if [ ! -d "frontend/node_modules" ]; then \
		echo "Installing frontend..."; \
		cd frontend && npm install -q; \
	fi
	@echo "✓ Dependencies installed"

start:
	@pkill -f "uvicorn|vite" 2>/dev/null || true
	@sleep 1
	@echo "Starting backend (port 8000)..."
	cd backend && .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
	@sleep 3
	@echo "Starting frontend (port 5173)..."
	cd frontend && npm run dev &
	@echo ""
	@echo "✓ Apps started:"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend:  http://localhost:8000"
	@echo "  API Docs: http://localhost:8000/docs"

stop:
	@pkill -f "uvicorn|vite" 2>/dev/null || true
	@echo "✓ Stopped"

restart: stop start

clean:
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -name "*.pyc" -delete 2>/dev/null || true
	@find . -name "*.pyo" -delete 2>/dev/null || true
	@find . -name ".DS_Store" -delete 2>/dev/null || true
	@find . -name "*.log" -delete 2>/dev/null || true
	@find . -name "*.pid" -delete 2>/dev/null || true
	@rm -rf frontend/dist 2>/dev/null || true
	@rm -rf backend/.pytest_cache 2>/dev/null || true
	@echo "✓ Cleaned"
