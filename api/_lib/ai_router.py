"""Small provider router for app-owned AI synthesis.

DeepSeek carries the high-volume drafting work by default. OpenAI is used as
the final reviewer/polisher when available, or as a fallback if DeepSeek is
missing or fails. Plain HTTPS keeps Vercel cold starts small and avoids a new
SDK dependency.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
DEFAULT_TIMEOUT = 14.0


@dataclass(frozen=True)
class AIResult:
    text: str
    source: str
    draft_provider: str | None
    review_provider: str | None


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) and value.strip() else None


def _deepseek_key() -> str | None:
    # The user's Vercel key is named SPYPROPHET. Keep the standard name too
    # so the project can be cleaned up later without code changes.
    return _env("DEEPSEEK_API_KEY") or _env("SPYPROPHET") or _env("spyprophet")


def has_deepseek_key() -> bool:
    return _deepseek_key() is not None


def has_openai_key() -> bool:
    return _env("OPENAI_API_KEY") is not None


def _chat_completion(
    *,
    api_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> Optional[str]:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(api_url, data=data, method="POST")
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
    return text.strip() if isinstance(text, str) and text.strip() else None


def deepseek_chat(
    *,
    system: str,
    user: str,
    temperature: float = 0.25,
    max_tokens: int = 900,
    timeout: float = DEFAULT_TIMEOUT,
) -> Optional[str]:
    key = _deepseek_key()
    if not key:
        return None
    return _chat_completion(
        api_url=_env("DEEPSEEK_API_URL") or DEEPSEEK_URL,
        api_key=key,
        model=_env("DEEPSEEK_MODEL") or DEFAULT_DEEPSEEK_MODEL,
        system=system,
        user=user,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )


def openai_chat(
    *,
    system: str,
    user: str,
    temperature: float = 0.2,
    max_tokens: int = 900,
    timeout: float = DEFAULT_TIMEOUT,
) -> Optional[str]:
    key = _env("OPENAI_API_KEY")
    if not key:
        return None
    return _chat_completion(
        api_url=_env("OPENAI_API_URL") or OPENAI_URL,
        api_key=key,
        model=_env("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL,
        system=system,
        user=user,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )


def daily_brief(
    *,
    system: str,
    user: str,
    review_system: str,
    review_user_prefix: str,
    max_tokens: int = 950,
    timeout: float = DEFAULT_TIMEOUT,
) -> AIResult | None:
    """Draft with DeepSeek, review with OpenAI when present.

    The output source is explicit so the UI can say what happened without
    exposing keys or provider internals.
    """
    draft = deepseek_chat(
        system=system,
        user=user,
        temperature=0.2,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    if draft:
        reviewed = openai_chat(
            system=review_system,
            user=f"{review_user_prefix}\n\nDeepSeek draft:\n{draft}",
            temperature=0.1,
            max_tokens=max_tokens,
            timeout=timeout,
        )
        if reviewed:
            return AIResult(
                text=reviewed,
                source="deepseek+openai",
                draft_provider="deepseek",
                review_provider="openai",
            )
        return AIResult(
            text=draft,
            source="deepseek",
            draft_provider="deepseek",
            review_provider=None,
        )

    fallback = openai_chat(
        system=system,
        user=user,
        temperature=0.2,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    if fallback:
        return AIResult(
            text=fallback,
            source="openai",
            draft_provider="openai",
            review_provider=None,
        )
    return None
