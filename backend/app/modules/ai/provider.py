"""Free, private AI through Ollama (https://ollama.com): an open model running on your own computer. No account, no
API key, no cost, and nothing leaves the machine. If Ollama isn't running, the AI buttons simply don't show.

Settings (.env): OLLAMA_URL (default http://127.0.0.1:11434) and OLLAMA_MODEL (default qwen2.5:3b — small, good at
following a JSON format, and writes Chinese as well as English).
"""

import json
import os
import time
import urllib.error
import urllib.request

from app.common.errors import ApiError

DEFAULT_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen2.5:3b"
STATUS_TTL = 20  # seconds the "is it running?" answer is reused
GENERATE_TIMEOUT = 180  # a laptop without a graphics card can take a while

_status_cache: tuple[float, dict] | None = None


def url() -> str:
    return os.environ.get("OLLAMA_URL", DEFAULT_URL).rstrip("/")


def model() -> str:
    return os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)


def _request(path: str, body: dict | None = None, timeout: float = 3):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{url()}{path}", data=data, headers={"Content-Type": "application/json"},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as res:  # noqa: S310 (a URL you configure)
        return json.loads(res.read().decode("utf-8"))


def status(fresh: bool = False) -> dict:
    """Is Ollama running, and is the chosen model downloaded?"""
    global _status_cache
    if not fresh and _status_cache and time.monotonic() - _status_cache[0] < STATUS_TTL:
        return _status_cache[1]
    want = model()
    try:
        tags = _request("/api/tags", timeout=2)
        names = [m.get("name", "") for m in tags.get("models", [])]
        installed = any(n == want or n == f"{want}:latest" or n.split(":")[0] == want for n in names)
        result = {"running": True, "model": want, "installed": installed, "models": names[:20]}
    except (urllib.error.URLError, OSError, ValueError):
        result = {"running": False, "model": want, "installed": False, "models": []}
    _status_cache = (time.monotonic(), result)
    return result


def require_ready() -> None:
    s = status()
    if not s["running"]:
        raise ApiError(503, "ai_unavailable", "Local AI isn't running. Start Ollama on this computer.")
    if not s["installed"]:
        raise ApiError(503, "ai_model_missing", f"Download the model first: ollama pull {s['model']}")


def generate_json(system: str, prompt: str, schema: dict) -> dict:
    """One chat turn, with the reply forced into `schema` (Ollama structured outputs)."""
    require_ready()
    body = {
        "model": model(),
        "stream": False,
        "format": schema,
        "options": {"temperature": 0.3},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
    }
    try:
        res = _request("/api/chat", body, timeout=GENERATE_TIMEOUT)
        return json.loads(res["message"]["content"])
    except (urllib.error.URLError, OSError, KeyError, ValueError, TypeError):
        raise ApiError(502, "ai_failed", "The local AI didn't give a usable answer. Try again.") from None
