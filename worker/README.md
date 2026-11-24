# Sunfield HOA AI answer backend

A tiny Cloudflare Worker that turns the site's top search passages into a
plain-English answer using Workers AI (free tier). The static GitHub Pages
site does the searching; this worker only writes the answer, strictly from
the passages it is sent, with citations. It stores nothing.

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

`POST /ask` with JSON `{ "question": "...", "passages": [{ "doc", "section", "page", "text" }] }`
returns `{ "answer": "...", "citations": [ ...the passages... ] }`.
`GET /` is a health check.
