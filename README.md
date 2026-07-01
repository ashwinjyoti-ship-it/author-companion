# Book Companion

Minimal scope: Status Recall, Edit Tracking (drift check), Fact Check. Brutalist UI, sage/ivory palette. Cloudflare Pages + D1 backend, vanilla JS frontend.

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

This starts `wrangler pages dev` with a local D1 emulation (nothing is created in your real Cloudflare account). The app defaults to the bundled seed story ("The Weight") until a Google Doc is connected in Settings.

`public/_worker.js` runs in Pages "advanced mode" — it handles every request, answering `/api/*` itself and falling back to `env.ASSETS.fetch()` for everything else (the static frontend).

## Settings

The gear icon opens Settings, where you can enter (stored server-side in D1, never echoed back to the browser):

- **Google Doc link + API key** — switches Status Recall from the seed story to a live Google Doc.
- **Anthropic API key** — powers chapter-state and drift-detection via Claude. Without it, both fall back to rule-based heuristics.
- **EXA API key** — powers Check Facts. Without it, the app tells you to add a key instead of failing.

## Deploying

```bash
wrangler d1 create author-companion-db   # then update database_id in wrangler.toml
npm run db:migrate:remote
npm run deploy
```

Live at `author-companion.pages.dev`.
