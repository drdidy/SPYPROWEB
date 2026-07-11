from datetime import date
from zoneinfo import ZoneInfo

import pandas as pd

from _lib.spx_data.schwab_backend import SchwabFetcher, _test_es_candidates


CT = ZoneInfo("America/Chicago")


def test_schwab_es_candidates_prioritize_june_2026_contract() -> None:
    symbols = _test_es_candidates(date(2026, 5, 18))

    assert symbols[:2] == ["/ESM26", "/ESM6"]
    assert "/ES" == symbols[-1]


def test_schwab_es_candidates_allow_explicit_override_first() -> None:
    symbols = _test_es_candidates(date(2026, 5, 18), configured=["/ESM26"])

    assert symbols[0] == "/ESM26"
    assert symbols.count("/ESM26") == 1


def test_schwab_close_anchored_quote_keeps_holiday_es_from_widening_basis(monkeypatch) -> None:
    spx_daily = pd.DataFrame(
        {"Close": [7473.47]},
        index=pd.DatetimeIndex(["2026-05-22 15:00"], tz=CT),
    )
    es_1m = pd.DataFrame(
        {"Close": [7491.50, 7564.50]},
        index=pd.DatetimeIndex(["2026-05-22 14:59", "2026-05-25 13:24"], tz=CT),
    )

    def fake_history(symbol: str, **_kwargs):
        if symbol in {"$SPX", "SPX", "^SPX"}:
            return spx_daily
        if symbol == "/ESM26":
            return es_1m
        return pd.DataFrame()

    from _lib import schwab as schwab_api

    monkeypatch.setattr(schwab_api, "fetch_price_history_frame", fake_history)

    fetcher = SchwabFetcher()
    fetcher._es_symbol = "/ESM26"

    quote = fetcher._close_anchored_quote()

    assert quote is not None
    assert round(quote.offset, 2) == -18.03
    assert quote.spx_spot == 7473.47
    assert quote.es_spot == 7491.50
    assert quote.captured_at.hour == 15
