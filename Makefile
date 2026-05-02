.PHONY: help install start stop restart clean

help:
	@echo "Medical Claim Verification"
	@echo "make install - install deps"
	@echo "make start   - start both apps"
	@echo "make stop    - stop both apps"
	@echo "make restart - restart"

install:
	@echo "Installing backend (Python 3.13)..."
	cd backend && python3.13 -m venv .venv && .venv/bin/pip install -q \
		fastapi uvicorn sqlalchemy pydantic pydantic-core pydantic-settings \
		'passlib[bcrypt]' 'bcrypt<5.0' python-multipart email-validator \
		httpx itsdangerous cryptography cffi sendgrid twilio pymupdf \
		google-generativeai numpy scikit-learn xgboost joblib \
		'uvicorn[standard]' grpcio grpcio-tools grpcio-status protobuf
	@echo "Installing frontend..."
	cd frontend && npm install -q
	@echo "✓ Dependencies installed"

start:
	@pkill -f "uvicorn|vite" 2>/dev/null || true
	@sleep 1
	@echo "Starting backend (port 8001)..."
	cd backend && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 &
	@sleep 3
	@echo "Starting frontend (port 5173)..."
	cd frontend && npm run dev &
	@echo ""
	@echo "✓ Apps started:"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend:  http://localhost:8001"
	@echo "  API Docs: http://localhost:8001/docs"

stop:
	@pkill -f "uvicorn|vite" 2>/dev/null || echo "Stopped"

restart: stop start

clean:
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -name ".DS_Store" -delete 2>/dev/null || true
	@echo "✓ Cleaned"
