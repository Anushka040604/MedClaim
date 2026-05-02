# Start API: create venv if missing, install deps, uvicorn. Run from repo root: npm run dev
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .\.venv\Scripts\python.exe)) {
    py -3 -m venv .venv 2>$null
    if (-not (Test-Path .\.venv\Scripts\python.exe)) {
        python -m venv .venv
    }
}
$py = ".\.venv\Scripts\python.exe"

# If .venv was copied from another machine, python.exe can be a broken shim.
# Detect this early and recreate the venv locally.
$probeOk = $true
try {
    & $py -c "import sys; print(sys.executable)" 2>$null
} catch {
    $probeOk = $false
}
if (-not $probeOk) {
    Write-Host "[backend] Detected broken .venv; recreating..."
    try { Remove-Item -Recurse -Force .\.venv -ErrorAction SilentlyContinue } catch {}
    py -3 -m venv .venv 2>$null
    if (-not (Test-Path .\.venv\Scripts\python.exe)) {
        python -m venv .venv
    }
    $py = ".\.venv\Scripts\python.exe"
}
& $py -m pip install -U pip
& $py -m pip install -r requirements.txt
# RAG deps can be heavy on Windows (chromadb / sentence-transformers).
# Install only when explicitly requested:
#   $env:INSTALL_RAG_DEPS="1"
if ($env:INSTALL_RAG_DEPS -eq "1" -and (Test-Path .\requirements-rag.txt)) {
    & $py -m pip install -r requirements-rag.txt
}
# Windows: broken/partial pydantic_core wheels cause ModuleNotFoundError for _pydantic_core
& $py -c "import pydantic_core._pydantic_core" 2>$null
if (-not $?) {
    Write-Host "[backend] Repairing pydantic_core (force reinstall)..."
    & $py -m pip install --force-reinstall --no-cache-dir "pydantic-core==2.27.2" "pydantic==2.10.4"
}
# Same class of issue: broken wheels for compiled extensions on some Windows venvs
& $py -c "import psycopg2._psycopg" 2>$null
if (-not $?) {
    Write-Host "[backend] Repairing psycopg2-binary (force reinstall)..."
    & $py -m pip install --force-reinstall --no-cache-dir "psycopg2-binary==2.9.10"
}
# Same class of issue: bad grpc wheel in venv (e.g. cp312 wheel in py310 env)
& $py -c "import grpc; from grpc._cython import cygrpc" 2>$null
if (-not $?) {
    Write-Host "[backend] Repairing grpc/protobuf stack (force reinstall)..."
    & $py -m pip install --force-reinstall --no-cache-dir "grpcio==1.71.2" "grpcio-tools==1.71.2" "grpcio-status==1.71.2" "protobuf==5.29.6"
}
# Windows occasionally lands on incompatible crypto wheel; ensure google-auth imports cleanly
& $py -c "import cryptography.hazmat.bindings._rust" 2>$null
if (-not $?) {
    Write-Host "[backend] Repairing cryptography/cffi (force reinstall)..."
    & $py -m pip install --force-reinstall --no-cache-dir "cryptography==44.0.3" "cffi==1.17.1"
}
# Use a single-process server by default to avoid multiple reloaders fighting for port 8000.
# Set $env:UVICORN_RELOAD="1" if you want reload behavior.
$port = 8000
if ($env:BACKEND_PORT) {
    try { $port = [int]$env:BACKEND_PORT } catch { $port = 8000 }
}
if ($env:UVICORN_RELOAD -eq "1") {
    & $py -m uvicorn app.main:app --reload --host 0.0.0.0 --port $port
} else {
    & $py -m uvicorn app.main:app --host 0.0.0.0 --port $port
}
