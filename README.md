# SPY Prophet — Web

Migration of [drdidy/SPYPROST](https://github.com/drdidy/SPYPROST) (Streamlit) to a real web stack.

## Layout

```
api/   Python FastAPI backend → Render
web/   Next.js 15 (App Router, TypeScript, Tailwind) → Vercel
```

## Status

- `api/prophet_core.py` — pure trading engine ported from `drdidy/SPYPROST/app.py`.
  No Streamlit, Plotly, yfinance, or other UI dependencies. Numerically equivalent
  to the Streamlit version; parity is enforced by `api/tests/test_prophet_core.py`.
- FastAPI app, `/health`, `/spy/snapshot`, render.yaml — pending follow-up PR.
- `web/` Next.js scaffold + Prophet Chart page — pending follow-up PR.

## Local development

```bash
cd api
pip install -r requirements.txt   # added in follow-up PR
pytest tests/                     # 40 parity tests must pass
```

The Streamlit app at `drdidy/SPYPROST` keeps running in production. Business logic
in `api/prophet_core.py` must stay numerically equivalent so we can A/B them.
