from datetime import datetime
from zoneinfo import ZoneInfo

from api._lib import options_chains
from api._lib import schwab


CT = ZoneInfo("America/Chicago")


def test_equity_options_use_nearest_available_weekly(monkeypatch):
    calls = []

    def fake_chain(symbol, underlying_price=None, span=None, expiration_date=None):
        calls.append((symbol, span, expiration_date))
        if expiration_date is None:
            return {"expiration": "2026-05-29", "calls": [], "puts": []}
        return None

    monkeypatch.setattr(options_chains.schwab, "has_secrets", lambda: True)
    monkeypatch.setattr(options_chains.schwab, "fetch_chain_snapshot", fake_chain)
    result = options_chains.fetch_symbol_options_intel("AAPL")

    assert result["available"] is True
    assert result["chainDate"] == "2026-05-29"
    assert calls[0][2] is None


def test_spx_tries_session_date_before_nearest(monkeypatch):
    calls = []

    def fake_chain(symbol, underlying_price=None, span=None, expiration_date=None):
        calls.append((symbol, span, expiration_date))
        return {"expiration": expiration_date or "2026-05-29", "calls": [], "puts": []}

    monkeypatch.setattr(options_chains.schwab, "has_secrets", lambda: True)
    monkeypatch.setattr(options_chains.schwab, "fetch_chain_snapshot", fake_chain)
    result = options_chains.fetch_symbol_options_intel("SPX")

    assert result["available"] is True
    assert calls[0][2] is not None


def test_holiday_chain_date_rolls_to_next_trading_day():
    holiday = datetime(2026, 5, 25, 7, 30, tzinfo=CT)
    assert options_chains.effective_options_date(holiday) == "2026-05-22"
    assert options_chains.effective_chain_date(holiday) == "2026-05-26"


def test_schwab_accepts_app_key_aliases(monkeypatch):
    for key in (
        "SCHWAB_CLIENT_ID",
        "SCHWAB_CLIENT_SECRET",
        "SCHWAB_APP_KEY",
        "SCHWAB_APP_SECRET",
        "SCHWAB_REFRESH_TOKEN",
    ):
        monkeypatch.delenv(key, raising=False)

    monkeypatch.setenv("SCHWAB_APP_KEY", " app-key ")
    monkeypatch.setenv("SCHWAB_APP_SECRET", " app-secret ")
    monkeypatch.setenv("SCHWAB_REFRESH_TOKEN", " refresh-token ")

    assert schwab.has_secrets() is True


def test_schwab_env_values_tolerate_pasted_key_prefix(monkeypatch):
    for key in (
        "SCHWAB_CLIENT_ID",
        "SCHWAB_CLIENT_SECRET",
        "SCHWAB_APP_KEY",
        "SCHWAB_APP_SECRET",
        "SCHWAB_REFRESH_TOKEN",
    ):
        monkeypatch.delenv(key, raising=False)

    monkeypatch.setenv("SCHWAB_CLIENT_ID", "SCHWAB_CLIENT_ID=client-id")
    monkeypatch.setenv("SCHWAB_CLIENT_SECRET", "SCHWAB_CLIENT_SECRET=client-secret")
    monkeypatch.setenv("SCHWAB_REFRESH_TOKEN", "SCHWAB_REFRESH_TOKEN=refresh-token")

    assert schwab.has_secrets() is True


def test_schwab_option_rows_hide_unavailable_greeks():
    row = schwab._option_row(
        {
            "symbol": "AAPL 260526C00315000",
            "strikePrice": 315,
            "bid": 5.7,
            "ask": 7.7,
            "mark": 6.7,
            "volatility": -999,
            "delta": -999.0,
            "gamma": "-999.0",
            "theta": -999,
            "vega": -999,
            "rho": -999,
            "openInterest": 11,
            "totalVolume": 1276,
        },
        "CALL",
        "2026-05-26",
    )

    assert row is not None
    assert row["bid"] == 5.7
    assert row["ask"] == 7.7
    assert row["mark"] == 6.7
    assert row["iv"] is None
    assert row["delta"] is None
    assert row["gamma"] is None
    assert row["theta"] is None
    assert row["vega"] is None
    assert row["rho"] is None
    assert row["oi"] == 11
    assert row["volume"] == 1276


def test_options_chain_fills_missing_greeks_from_secondary(monkeypatch):
    def fake_schwab_chain(symbol, underlying_price=None, span=None, expiration_date=None):
        return {
            "ticker": symbol,
            "expiration": "2026-05-26",
            "atm": 309,
            "calls": [
                {
                    "optionSymbol": "AAPL 260526C00310000",
                    "strike": 310.0,
                    "side": "CALL",
                    "bid": 2.1,
                    "ask": 2.3,
                    "mark": 2.2,
                    "iv": None,
                    "delta": None,
                    "gamma": None,
                    "theta": None,
                    "vega": None,
                    "rho": None,
                    "oi": 20,
                    "volume": 10,
                    "expiration": "2026-05-26",
                }
            ],
            "puts": [],
            "totals": {"callOi": 20, "putOi": 0, "callVol": 10, "putVol": 0, "pcr": None},
        }

    def fake_secondary_chain(symbol, underlying_price=None, span=None):
        return {
            "ticker": symbol,
            "expiration": "2026-05-26",
            "atm": 309,
            "calls": [
                {
                    "optionSymbol": "AAPL  260526C310",
                    "strike": 310.0,
                    "side": "CALL",
                    "iv": 0.31,
                    "delta": 0.48,
                    "gamma": 0.06,
                    "theta": -0.12,
                    "vega": 0.03,
                    "rho": 0.01,
                }
            ],
            "puts": [],
        }

    monkeypatch.setattr(options_chains.schwab, "has_secrets", lambda: True)
    monkeypatch.setattr(options_chains.schwab, "fetch_chain_snapshot", fake_schwab_chain)
    monkeypatch.setattr(options_chains.tastytrade, "fetch_chain_snapshot", fake_secondary_chain)

    result = options_chains.fetch_symbol_options_intel("AAPL")
    row = result["chain"]["calls"][0]

    assert result["available"] is True
    assert result["greekCoverage"]["ready"] is True
    assert result["greekCoverage"]["deltaRows"] == 1
    assert result["greekCoverage"]["gammaRows"] == 1
    assert row["bid"] == 2.1
    assert row["ask"] == 2.3
    assert row["mark"] == 2.2
    assert row["iv"] == 0.31
    assert row["delta"] == 0.48
    assert row["gamma"] == 0.06
    assert row["theta"] == -0.12
    assert row["vega"] == 0.03
    assert row["rho"] == 0.01


def test_options_chain_keeps_schwab_greeks_when_present(monkeypatch):
    def fake_schwab_chain(symbol, underlying_price=None, span=None, expiration_date=None):
        return {
            "ticker": symbol,
            "expiration": "2026-05-26",
            "atm": 309,
            "calls": [
                {
                    "optionSymbol": "AAPL 260526C00310000",
                    "strike": 310.0,
                    "side": "CALL",
                    "bid": 2.1,
                    "ask": 2.3,
                    "mark": 2.2,
                    "iv": 0.25,
                    "delta": 0.44,
                    "gamma": 0.05,
                    "theta": -0.1,
                    "vega": 0.02,
                    "rho": 0.01,
                    "oi": 20,
                    "volume": 10,
                    "expiration": "2026-05-26",
                }
            ],
            "puts": [],
            "totals": {"callOi": 20, "putOi": 0, "callVol": 10, "putVol": 0, "pcr": None},
        }

    def fail_secondary_chain(*args, **kwargs):
        raise AssertionError("secondary chain should not be requested")

    monkeypatch.setattr(options_chains.schwab, "has_secrets", lambda: True)
    monkeypatch.setattr(options_chains.schwab, "fetch_chain_snapshot", fake_schwab_chain)
    monkeypatch.setattr(options_chains.tastytrade, "fetch_chain_snapshot", fail_secondary_chain)

    result = options_chains.fetch_symbol_options_intel("AAPL")
    row = result["chain"]["calls"][0]

    assert result["greekCoverage"]["ready"] is True
    assert row["delta"] == 0.44
    assert row["gamma"] == 0.05


def test_options_diagnostic_uses_public_broker_message(monkeypatch):
    monkeypatch.setattr(options_chains.schwab, "fetch_chain_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr(options_chains.schwab, "has_secrets", lambda: True)
    monkeypatch.setattr(options_chains.schwab, "last_error_public", lambda: "Broker authorization needs reconnection.")
    monkeypatch.setattr(options_chains.schwab, "last_error_code", lambda: "schwab_refresh_rejected")

    result = options_chains.fetch_symbol_options_intel("SPX")

    assert result["available"] is False
    assert result["diagnostic"] == "Broker authorization needs reconnection."
    assert result["diagnosticCode"] == "schwab_refresh_rejected"


def test_options_fail_closed_when_broker_env_is_empty(monkeypatch):
    for key in (
        "SCHWAB_CLIENT_ID",
        "SCHWAB_CLIENT_SECRET",
        "SCHWAB_APP_KEY",
        "SCHWAB_APP_SECRET",
        "SCHWAB_REFRESH_TOKEN",
    ):
        monkeypatch.delenv(key, raising=False)

    result = options_chains.fetch_symbol_options_intel("SPX")

    assert result["available"] is False
    assert result["diagnostic"] == "Broker connection is not configured."
    assert result["diagnosticCode"] == "missing_credentials"
