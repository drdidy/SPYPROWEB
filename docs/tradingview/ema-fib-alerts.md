# EMA/Fib Continuation Alerts

This integration turns a TradingView 1-minute EMA/Fib continuation signal into
a SPY Prophet decision notification. It does not place trades.

## Production Flow

1. TradingView runs `ema-fib-continuation-alert.pine`.
2. TradingView posts the JSON alert to:

```text
https://www.spyprophet.app/api/tradingview/ema-fib?token=YOUR_SHARED_SECRET
```

3. SPY Prophet validates:
   - payload shape,
   - pivot high above pivot low,
   - Fib 50 midpoint,
   - Fib 1.5 extension,
   - clean rejection candle at Fib 50 when the alert is an entry,
   - signal freshness.
4. Accepted signals are logged and routed to Telegram when configured.

## Environment Variables

Required in production. Your Vercel project already has `ALERT_SECRET`, and the
webhook accepts it:

```text
ALERT_SECRET=long-random-secret
```

The app also accepts `SPYPROPHET_TRADINGVIEW_WEBHOOK_SECRET` if a more specific
name is added later.

Telegram notification sink:

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

The app also accepts these names if you prefer namespacing:

```text
SPYPROPHET_TELEGRAM_BOT_TOKEN=...
SPYPROPHET_TELEGRAM_CHAT_ID=...
```

Optional generic notification sink:

```text
SPYPROPHET_ALERT_WEBHOOK_URL=https://...
SPYPROPHET_ALERT_WEBHOOK_TOKEN=optional-bearer-token
```

If `TELEGRAM_CHAT_ID` is wrong or missing, the app can bind the chat through
the Telegram bot webhook:

```text
POST https://www.spyprophet.app/api/telegram/configure?token=YOUR_SHARED_SECRET
```

Then send `/start` to the SPY Prophet Telegram bot once. The app stores that
chat in Upstash Redis and uses it for future alerts.

## TradingView Setup

1. Open the Pine Editor.
2. Paste `docs/tradingview/ema-fib-continuation-alert.pine`.
3. Add it to the 1-minute SPX, SPY, or ES chart.
4. Create an alert.
5. Condition: the indicator, then `Any alert() function call`.
6. Frequency: `Once Per Bar Close`.
7. Webhook URL:

```text
https://www.spyprophet.app/api/tradingview/ema-fib?token=YOUR_SHARED_SECRET
```

8. Alert message can be blank because the script emits dynamic JSON through
   `alert()`.

## Telegram Message Contract

Telegram messages are intentionally short and actionable:

```text
SPX ENTRY NOW: SHORT Fib 50 rejection

Setup confirmed: 21 EMA / 50 EMA continuation on 1m.
Candle tagged Fib 50 and closed back below 7432.60.
Entry window: next 1-minute candle after the bearish rejection close.
Entry reference: 7429.40.
Target / planned exit: Fib 1.5 at 7381.50.
Invalidation reference: 7459.10.
Swing map: 7406.10 -> 7459.10.
This is an alert only. Confirm spread, contract price, and liquidity before acting.
```

The lifecycle is:

1. `CROSS` - the 21 EMA / 50 EMA cross is detected and the Fib map is built.
2. `TESTING` - price has reached the Fib 50 line, but there is no entry yet.
3. `ENTRY NOW` - the candle touched Fib 50 and closed on the continuation side.
4. `EXIT` - Fib 1.5 target was reached.
5. `INVALIDATED` - the setup failed before or after entry.

Rejected signals are logged but not sent to Telegram.

## Signal Log

Recent TradingView EMA/Fib alerts are visible on `/log` under
`02 TradingView`.
