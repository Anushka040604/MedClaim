from __future__ import annotations

import json
import math
import threading
import time
from collections import deque
from typing import Any

import httpx

from app.core.config import settings


class GroqError(RuntimeError):
    pass


_groq_lock = threading.Lock()
_groq_rpm_timestamps: deque[float] = deque()
_groq_tpm_events: deque[tuple[float, int]] = deque()
_groq_last_call_at: float = 0.0


def _estimate_tokens_for_messages(messages: list[dict[str, Any]], *, max_tokens: int) -> int:
    # Very rough estimate: ~4 chars/token + small structural overhead.
    chars = 0
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            chars += len(c)
        elif isinstance(c, list):
            # If future multimodal: count string-ish items best-effort.
            chars += sum(len(str(x)) for x in c)
        else:
            chars += len(str(c))
    prompt_tokens = int(math.ceil(chars / 4)) + 50
    return prompt_tokens + int(max_tokens)


def _sleep_for_rpm_budget(now: float) -> None:
    rpm = int(settings.groq_requests_per_minute)
    if rpm <= 0:
        return
    window = 60.0
    while _groq_rpm_timestamps and (now - _groq_rpm_timestamps[0]) > window:
        _groq_rpm_timestamps.popleft()
    if len(_groq_rpm_timestamps) < rpm:
        return
    oldest = _groq_rpm_timestamps[0]
    sleep_s = max(0.0, window - (now - oldest)) + 0.05
    if sleep_s > 0.2:
        print(f"[groq] rpm budget sleep {sleep_s:.2f}s (rpm={rpm})", flush=True)
    time.sleep(min(sleep_s, 60.0))


def _sleep_for_tpm_budget(now: float, estimated_tokens: int) -> None:
    tpm = int(settings.groq_tokens_per_minute)
    if tpm <= 0:
        return
    window = 60.0
    while _groq_tpm_events and (now - _groq_tpm_events[0][0]) > window:
        _groq_tpm_events.popleft()
    used = sum(tokens for _, tokens in _groq_tpm_events)
    if used + estimated_tokens <= tpm:
        return
    # Sleep until enough events fall out of window
    oldest_ts = _groq_tpm_events[0][0]
    sleep_s = max(0.0, window - (now - oldest_ts)) + 0.05
    if sleep_s > 0.2:
        print(f"[groq] tpm budget sleep {sleep_s:.2f}s (tpm={tpm} used={used} est={estimated_tokens})", flush=True)
    time.sleep(min(sleep_s, 60.0))


def chat_completion(
    *,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.2,
    max_tokens: int = 2048,
    timeout_seconds: float = 60.0,
) -> str:
    """
    Minimal Groq client using OpenAI-compatible Chat Completions endpoint.
    Docs: https://console.groq.com/docs/openai
    """
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": False,
    }
    # Load-shaping: process-wide concurrency + RPM/TPM budgets + jitterless delay.
    if not hasattr(chat_completion, "_sema"):
        chat_completion._sema = threading.Semaphore(max(1, int(settings.groq_max_concurrency)))  # type: ignore[attr-defined]

    estimated_tokens = _estimate_tokens_for_messages(messages, max_tokens=max_tokens)

    with chat_completion._sema:  # type: ignore[attr-defined]
        last_err: Exception | None = None
        for attempt in range(int(settings.groq_retry_max_attempts)):
            try:
                with _groq_lock:
                    now = time.time()
                    # Optional fixed spacing between calls
                    delay = float(settings.groq_call_delay_seconds or 0.0)
                    global _groq_last_call_at
                    if delay > 0 and _groq_last_call_at > 0:
                        sleep_s = max(0.0, delay - (now - _groq_last_call_at))
                        if sleep_s > 0:
                            if sleep_s > 0.2:
                                print(f"[groq] call delay sleep {sleep_s:.2f}s", flush=True)
                            time.sleep(min(sleep_s, 30.0))
                            now = time.time()

                    _sleep_for_rpm_budget(now)
                    now = time.time()
                    _sleep_for_tpm_budget(now, estimated_tokens)
                    now = time.time()
                    _groq_last_call_at = now

                print(f"[groq] request model={model} est_tokens={estimated_tokens} attempt={attempt}", flush=True)
                with httpx.Client(timeout=timeout_seconds) as client:
                    resp = client.post(url, headers=headers, json=payload)

                # Record usage estimate after sending (best-effort)
                with _groq_lock:
                    ts = time.time()
                    _groq_rpm_timestamps.append(ts)
                    _groq_tpm_events.append((ts, estimated_tokens))

                if resp.status_code == 429:
                    ra = (resp.headers.get("retry-after") or "").strip()
                    try:
                        retry_after = float(ra) if ra else None
                    except Exception:
                        retry_after = None
                    # Prefer Retry-After if present; otherwise exponential backoff.
                    backoff = min(60.0, 1.7**attempt)
                    print(f"[groq] 429 retry_after={retry_after} backoff={backoff:.2f}", flush=True)
                    time.sleep(min(60.0, retry_after if retry_after is not None else backoff))
                    continue
                if resp.status_code in {500, 502, 503, 504}:
                    print(f"[groq] {resp.status_code} retrying", flush=True)
                    time.sleep(min(30.0, 1.7**attempt))
                    continue
                if resp.status_code >= 400:
                    raise GroqError(f"Groq HTTP {resp.status_code}: {resp.text[:800]}")
                data = resp.json()
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(min(30.0, 1.7**attempt))
        else:
            raise GroqError(f"Groq request failed after retries: {type(last_err).__name__}: {str(last_err)[:200]}")
    try:
        return (data["choices"][0]["message"]["content"] or "").strip()
    except Exception as e:  # noqa: BLE001
        raise GroqError(f"Unexpected Groq response shape: {json.dumps(data)[:800]}") from e

