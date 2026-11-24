# Sunfield HOA AI answer backend

A tiny Cloudflare Worker where the AI does the searching itself using
Workers AI (free tier). The static GitHub Pages site sends only the
resident's question. The worker keeps a map of the rule books (built from
the site's `data/search-index.json`), the AI picks by meaning which parts
govern the question and pulls those passages, then writes a plain-English
answer strictly from them, with citations. It stores nothing; identical
questions may be served from the edge cache.

## Deploy (one time)

You need a free Cloudflare account.

**Dashboard way (no tools):**
1. Cloudflare dashboard → Workers & Pages → Create → Worker, name it
   `sunfield-hoa-ai`, deploy the placeholder.
2. Open the worker → Edit code → replace everything with `src/index.js` → Deploy.
3. Worker → Settings → Bindings → Add → Workers AI, variable name `AI` → Save/Deploy.
4. Copy the worker URL (looks like
   `https://sunfield-hoa-ai.<your-subdomain>.workers.dev`) and put it in
   `AI_ENDPOINT` at the top of the site's `app.js`, then push the site.

**Wrangler way:** `npx wrangler deploy` from this folder (the `[ai]` binding
is already in `wrangler.toml`).

## API

`POST /ask` with JSON `{ "question": "..." }`
returns `{ "answer": "...", "citations": [ ...the passages the AI used... ] }`.
`GET /` is a health check.
