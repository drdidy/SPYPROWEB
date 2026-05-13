"""News and economic-calendar context for the Daily Brief.

The brief should know when macro risk is quiet, pending, or unavailable. This
module is deliberately defensive: it uses optional public/API-key feeds when
configured and otherwise returns explicit empty states. The model sees the
absence of news/calendar as "no feed", never as "no risk".
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

CT = ZoneInfo("America/Chicago")


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) and value.strip() else None


def _http_json(url: str, headers: dict[str, str] | None = None, timeout: float = 6.0) -> Any:
    req = urllib.request.Request(url, method="GET")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def fetch_market_news(limit: int = 6) -> dict:
    """Return market news from a configured provider.

    Supported server-only envs:
      - FINNHUB_API_KEY
      - NEWS_API_KEY
    """
    finnhub = _env("FINNHUB_API_KEY")
    if finnhub:
        general_raw = _http_json(
            "https://finnhub.io/api/v1/news?category=general&token="
            + urllib.parse.quote(finnhub),
        )
        today = datetime.now(CT).date()
        from_date = (today - timedelta(days=3)).isoformat()
        to_date = today.isoformat()
        company_raw = _http_json(
            "https://finnhub.io/api/v1/company-news?"
            + urllib.parse.urlencode({"symbol": "SPY", "from": from_date, "to": to_date, "token": finnhub}),
        )
        rows = []
        seen = set()
        for row in (company_raw if isinstance(company_raw, list) else []) + (general_raw if isinstance(general_raw, list) else []):
            if not isinstance(row, dict):
                continue
            headline = str(row.get("headline") or "").strip()
            if not headline or headline.lower() in seen:
                continue
            seen.add(headline.lower())
            rows.append(row)
        return {
            "available": bool(rows),
            "source": "connected_news",
            "items": [
                {
                    "headline": str(row.get("headline") or "")[:180],
                    "summary": str(row.get("summary") or "")[:260],
                    "source": row.get("source"),
                    "url": row.get("url"),
                    "publishedAt": row.get("datetime"),
                }
                for row in rows[:limit]
                if isinstance(row, dict)
            ],
        }

    news_api = _env("NEWS_API_KEY")
    if news_api:
        q = urllib.parse.urlencode(
            {
                "q": "SPY OR S&P 500 OR Federal Reserve OR CPI OR Treasury yields",
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": str(limit),
                "apiKey": news_api,
            }
        )
        raw = _http_json(f"https://newsapi.org/v2/everything?{q}")
        rows = raw.get("articles") if isinstance(raw, dict) else []
        return {
            "available": bool(rows),
            "source": "connected_news",
            "items": [
                {
                    "headline": str(row.get("title") or "")[:180],
                    "summary": str(row.get("description") or "")[:260],
                    "source": (row.get("source") or {}).get("name") if isinstance(row.get("source"), dict) else None,
                    "url": row.get("url"),
                    "publishedAt": row.get("publishedAt"),
                }
                for row in (rows or [])[:limit]
                if isinstance(row, dict)
            ],
        }

    return {
        "available": False,
        "source": None,
        "items": [],
        "reason": "No news provider key configured.",
    }


def fetch_economic_calendar(now: datetime | None = None) -> dict:
    """Return upcoming macro events.

    If FMP_API_KEY is present, use Financial Modeling Prep's economic calendar.
    Otherwise return the repo's known replay macro dates plus explicit no-feed.
    """
    now_ct = (now or datetime.now(CT)).astimezone(CT)
    finnhub = _env("FINNHUB_API_KEY")
    if finnhub:
        start = now_ct.date().isoformat()
        end = (now_ct + timedelta(days=14)).date().isoformat()
        q = urllib.parse.urlencode({"from": start, "to": end, "token": finnhub})
        raw = _http_json(f"https://finnhub.io/api/v1/calendar/economic?{q}")
        rows = raw.get("economicCalendar") if isinstance(raw, dict) else []
        if rows:
            return {
                "available": True,
                "source": "connected_calendar",
                "events": [
                    {
                        "date": (row.get("time") or row.get("date") or "")[:10],
                        "time": row.get("time"),
                        "event": row.get("event"),
                        "country": row.get("country"),
                        "impact": row.get("impact"),
                        "actual": row.get("actual"),
                        "estimate": row.get("estimate"),
                        "forecast": row.get("estimate"),
                        "previous": row.get("prev") or row.get("previous"),
                        "unit": row.get("unit"),
                    }
                    for row in rows[:20]
                    if isinstance(row, dict)
                ],
            }

    fmp = _env("FMP_API_KEY")
    if fmp:
        start = now_ct.date().isoformat()
        end = (now_ct + timedelta(days=7)).date().isoformat()
        q = urllib.parse.urlencode({"from": start, "to": end, "apikey": fmp})
        raw = _http_json(f"https://financialmodelingprep.com/api/v3/economic_calendar?{q}")
        rows = raw if isinstance(raw, list) else []
        return {
            "available": bool(rows),
            "source": "connected_calendar",
            "events": [
                {
                    "date": row.get("date"),
                    "event": row.get("event"),
                    "country": row.get("country"),
                    "impact": row.get("impact"),
                    "actual": row.get("actual"),
                    "estimate": row.get("estimate"),
                    "previous": row.get("previous"),
                }
                for row in rows[:12]
                if isinstance(row, dict)
            ],
        }

    known = [
        {"date": "2026-05-13", "event": "CPI", "impact": "high"},
        {"date": "2026-05-28", "event": "FOMC minutes", "impact": "high"},
        {"date": "2026-06-10", "event": "CPI", "impact": "high"},
        {"date": "2026-06-17", "event": "FOMC", "impact": "high"},
    ]
    upcoming = [event for event in known if str(event["date"]) >= now_ct.date().isoformat()]
    return {
        "available": False,
        "source": "static_watchlist",
        "events": upcoming[:6],
        "reason": "No live economic-calendar provider key configured.",
    }


def fetch_market_status() -> dict:
    finnhub = _env("FINNHUB_API_KEY")
    if not finnhub:
        return {"available": False, "reason": "No market-status feed configured."}
    raw = _http_json(
        "https://finnhub.io/api/v1/stock/market-status?"
        + urllib.parse.urlencode({"exchange": "US", "token": finnhub}),
    )
    if not isinstance(raw, dict):
        return {"available": False, "reason": "Market-status feed unavailable."}
    return {
        "available": True,
        "isOpen": raw.get("isOpen"),
        "holiday": raw.get("holiday"),
        "sessionOpen": raw.get("sessionOpen"),
        "sessionClose": raw.get("sessionClose"),
        "timestamp": raw.get("t"),
    }


def fetch_macro_context() -> dict:
    return {
        "asOf": datetime.now(CT).isoformat(),
        "news": fetch_market_news(),
        "economicCalendar": fetch_economic_calendar(),
        "marketStatus": fetch_market_status(),
    }
