# SPY Prophet Web

Production Next.js workspace for SPY Prophet, deployed on Vercel at
`https://www.spyprophet.app`.

## What Ships

- Next.js 14 App Router, React, TypeScript, Tailwind, and Vercel serverless routes.
- Python API functions under `api/` for SPY, ES/SPX, replay, macro, and options data.
- SPY Channel, ES Channel, Decision Slate, Replay, Foresight, Brief, Options,
  Market Context, Order Flow, Signal Log, Learning, and Configuration surfaces.
- No in-browser Babel, no design-editor tweak panel, and no random client-side
  trading data generation in production source.

## Local Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e:smoke
npm run test:a11y
pytest api/tests/test_data_sources_replay.py api/tests/spx/test_engine.py api/tests/spx/test_replay_grading.py
```

`next start` serves the Next.js app locally. Vercel serves the Python API
functions in production, so local production-mode checks may show guarded
fallback states for Python-backed feeds unless those routes are run through the
Vercel runtime.

## Deployment

Production deploy:

```bash
npx vercel deploy --prod -y
```

The canonical production alias is `https://www.spyprophet.app`.
