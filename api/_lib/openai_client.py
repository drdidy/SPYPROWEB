"""OpenAI Chat Completions client for daily-brief generation.

Plain `requests` against the REST API (no SDK dep) so cold-start stays
fast on Vercel. Returns None when OPENAI_API_KEY is missing or the
upstream call fails — the brief endpoint then falls back to the
engine's own narrative.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Optional

API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TIMEOUT = 12.0


def has_key() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def chat(
    *,
    system: str,
    user: str,
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 700,
    timeout: float = DEFAULT_TIMEOUT,
) -> Optional[str]:
    """Run a single Chat Completions call. Returns the assistant text
    or None on any failure (missing key, network, non-200, malformed
    body). Callers degrade gracefully."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    payload = {
        "model": model or os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(API_URL, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None

    try:
        text = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    if not isinstance(text, str):
        return None
    return text.strip() or None
