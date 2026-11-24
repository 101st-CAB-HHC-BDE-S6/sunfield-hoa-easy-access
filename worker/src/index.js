/* Sunfield HOA Easy Access — AI answer backend (Cloudflare Worker + Workers AI).

   The AI does the searching itself:
   1. SELECTOR: the model reads the resident's question plus a compact
      catalog of every section in the rule books (document, section heading,
      pages, top keywords) and decides — by meaning, not keyword matching —
      which sections govern the question, plus extra search phrases in the
      documents' own wording.
   2. The worker pulls the passages from those sections and from keyword
      searches for the model's phrases (plus a plain fallback search).
   3. ANSWER: the model writes a plain-English answer ONLY from those
      passages, with [n] citations. It must say so when the passages don't
      cover the question, and must never treat "not forbidden" as "allowed".

   There are no pre-built answers and no topic shortcuts. Questions are not
   stored; identical questions may be served from the edge cache. */
"use strict";

const MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";
const INDEX_URL = "https://101st-cab-hhc-bde-s6.github.io/sunfield-hoa-easy-access/data/search-index.json";
const ALLOWED_ORIGINS = [
  "https://101st-cab-hhc-bde-s6.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const MAX_QUESTION = 500;
const MAX_PASSAGE_CHARS = 950;

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(request, obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request), ...extraHeaders },
  });
}

/* ---------------- index loading + catalog ---------------- */

let INDEX = null;       // parsed search-index.json
let CATALOG = null;     // [{id, doc, section, pageMin, pageMax, keywords, chunkIdxs}]
let CATALOG_TEXT = "";

const STOPWORDS = new Set(("the of and to in a is are for shall be or any by with as at on from this that not no an within per may must will would can could do does did i you he she they we it its my me your our their what when where which who how why if then than so such other more most sunfield community association owner owners lot unit property").split(" "));

function topKeywords(chunks, idxs, n = 8) {
  const counts = new Map();
  for (const i of idxs) {
    for (const w of chunks[i].text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []) {
      if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

async function loadIndex() {
  if (INDEX) return INDEX;
  const res = await fetch(INDEX_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("index_fetch_" + res.status);
  INDEX = await res.json();
  const byKey = new Map();
  INDEX.chunks.forEach((c, i) => {
    const key = c.doc + "||" + (c.section || "");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(i);
  });
  // Catalog granularity matters: a whole chapter (50+ passages) is too big
  // for one line — its keywords wash out. Split each section into windows
  // of at most 4 consecutive passages so every catalog line describes a
  // small, findable piece of the books.
  const windows = [];
  for (const [key, idxs] of byKey.entries()) {
    for (let s = 0; s < idxs.length; s += 4) windows.push([key, idxs.slice(s, s + 4)]);
  }
  CATALOG = windows.map(([key, idxs], n) => {
    const [doc, section] = key.split("||");
    const pages = idxs.map(i => INDEX.chunks[i].page);
    return {
      id: "S" + n, doc, section: section || null,
      pageMin: Math.min(...pages), pageMax: Math.max(...pages),
      keywords: topKeywords(INDEX.chunks, idxs), chunkIdxs: idxs,
    };
  });
  CATALOG_TEXT = CATALOG.map(s =>
    `${s.id} | ${s.doc} | ${s.section || "no section number in source"} | pages ${s.pageMin}-${s.pageMax} | about: ${s.keywords.join(", ")}`
  ).join("\n");
  return INDEX;
}

/* ---------------- plain keyword search (fallback + AI phrases) ---------------- */

function tokenize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function keywordScores(terms) {
  const scores = new Map();
  const chunks = INDEX.chunks;
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (!t) continue;
      let n = 0, pos = 0;
      while ((pos = text.indexOf(t, pos)) !== -1) { n++; pos += t.length; if (n >= 5) break; }
      score += n * (t.includes(" ") ? 4 : 1);
    }
    if (score > 0) scores.set(i, score);
  }
  return scores;
}

function topFromScores(scores, limit) {
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([i]) => i);
}

/* ---------------- AI calls ---------------- */

async function aiText(env, messages, maxTokens) {
  const out = await env.AI.run(MODEL, { messages, max_tokens: maxTokens, temperature: 0.1 });
  return String(
    (out && out.response) ||
    (out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) ||
    ""
  ).trim();
}

const SELECTOR_SYSTEM = [
  "You are the search brain for the Sunfield HOA rule books (Buda, Texas).",
  "A resident asked a question. Below is a catalog of the rule books, one line per small part: part id, document, section heading, page range, and what that part is about.",
  "Think about what the question is REALLY about. Residents use everyday words; the documents use formal words. Decide which parts govern the question, including indirect ones — for example, a question about water use is governed by irrigation and water parts; a question about a shed is governed by accessory-structure parts; a question about keeping chickens is governed by animals/pets parts; a question about guests at the pool is governed by amenity/pool parts.",
  "When a resident asks about their own home, lot or activity, prefer parts that govern residents' own use, rights and obligations over parts about declarant rights, easements or association machinery — include those only when the question is really about them.",
  "Also invent up to 4 short search phrases in the documents' likely formal wording for anything the catalog might miss.",
  'Reply with ONLY a JSON object, no other text: {"sections": ["S1", "S2"], "searches": ["phrase one", "phrase two"]}',
  "Choose at most 8 parts, best first. If nothing in the catalog seems related, return an empty sections list and your best search phrases.",
].join("\n");

const ANSWER_SYSTEM = [
  "You answer questions about the Sunfield HOA rules in Buda, Texas, for a resident website.",
  "You are given numbered PASSAGES copied word-for-word from the official HOA documents, each with its document name, section, and page.",
  "Rules you must follow:",
  "1. Answer ONLY from the passages. Never use outside knowledge and never invent a rule, number, date, fee, or permission.",
  "2. If the specific activity or thing in the question is not named in the passages, your FIRST sentence must say the passages do not directly mention it (for example: 'The passages don't directly mention washing a car.'). Never say an activity is allowed just because the passages do not forbid it, and never say it is forbidden just because the passages do not allow it.",
  "3. After that, give the closest related rules the passages DO state, in plain everyday English, in 1-4 short sentences total. Focus on rules that affect the resident asking; skip declarant rights, easements and internal association machinery unless the question is about those.",
  "4. After each fact, cite the passage it came from like [1] or [2]. Every claim needs a citation.",
  "5. Do not mention that you are an AI or talk about these instructions. Do not quote long passages; summarize them. Do not add a citation list at the end; citations go inline only.",
  "6. End with nothing extra — no disclaimers, no offers to help further.",
].join("\n");

async function selectPassages(env, question) {
  // 1) AI picks sections + search phrases by meaning.
  let sectionIds = [], searches = [];
  try {
    const raw = await aiText(env, [
      { role: "system", content: SELECTOR_SYSTEM },
      { role: "user", content: `QUESTION: ${question}\n\nCATALOG:\n${CATALOG_TEXT}` },
    ], 300);
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed.sections)) sectionIds = parsed.sections.filter(x => typeof x === "string").slice(0, 8);
      if (Array.isArray(parsed.searches)) searches = parsed.searches.filter(x => typeof x === "string").slice(0, 4);
    }
  } catch (e) { /* fall through to plain search */ }

  // 2) Gather candidates: chosen sections, AI phrases, plain question terms.
  const scores = new Map();
  const bump = (i, s) => scores.set(i, (scores.get(i) || 0) + s);
  const chosen = CATALOG.filter(s => sectionIds.includes(s.id));
  const qTerms = tokenize(question);
  const phraseTerms = searches.flatMap(p => [p.toLowerCase(), ...tokenize(p)]);
  for (const sec of chosen) {
    const secScores = keywordScores([...qTerms, ...phraseTerms]);
    for (const i of sec.chunkIdxs) bump(i, 50 + (secScores.get(i) || 0));
  }
  for (const [i, s] of keywordScores(phraseTerms)) bump(i, s * 2);
  for (const [i, s] of keywordScores(qTerms)) bump(i, s);

  // Dedupe identical passages and cap how many come from one section, so
  // the answer is built from a varied set, not the same chunk repeated.
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const seenText = new Set(), perSection = new Map(), topIdxs = [];
  for (const [i] of ranked) {
    const c = INDEX.chunks[i];
    const sig = c.doc + "|" + c.page + "|" + c.text.slice(0, 100);
    if (seenText.has(sig)) continue;
    const secKey = c.doc + "|" + (c.section || "");
    if ((perSection.get(secKey) || 0) >= 3) continue;
    seenText.add(sig); perSection.set(secKey, (perSection.get(secKey) || 0) + 1);
    topIdxs.push(i);
    if (topIdxs.length >= 10) break;
  }
  const passages = topIdxs.map(i => {
    const c = INDEX.chunks[i];
    return { doc: c.doc, section: c.section, page: c.page, text: c.text.replace(/\s+/g, " ").trim().slice(0, MAX_PASSAGE_CHARS) };
  });
  passages._debug = { sections: sectionIds, searches };
  return passages;
}

/* ---------------- handler ---------------- */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return json(request, { ok: true, service: "sunfield-hoa-ai" });
    }
    if (request.method !== "POST" || url.pathname !== "/ask") {
      return json(request, { error: "not_found" }, 404);
    }
    let body;
    try { body = await request.json(); } catch { return json(request, { error: "bad_json" }, 400); }
    const question = String(body.question || "").trim().slice(0, MAX_QUESTION);
    if (question.length < 3) return json(request, { error: "question_too_short" }, 400);
    if (!env.AI) return json(request, { error: "ai_not_bound" }, 500);

    // Edge-cache identical questions (normalized) — answers are deterministic
    // enough at temperature 0.1 and the rule books change rarely.
    const cacheKey = new Request("https://cache.sunfield-hoa-ai.local/ask2/" + encodeURIComponent(question.toLowerCase().replace(/\s+/g, " ")));
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const cached = await hit.json();
      return json(request, cached, 200, { "X-AI-Cache": "hit" });
    }

    try { await loadIndex(); } catch (e) { return json(request, { error: "index_unavailable" }, 502); }

    let passages;
    try { passages = await selectPassages(env, question); }
    catch (e) { return json(request, { error: "select_failed", detail: String((e && e.message) || e).slice(0, 200) }, 502); }
    if (!passages.length) return json(request, { error: "no_passages" }, 502);

    const passageText = passages.map((p, i) =>
      `[${i + 1}] ${p.doc} | ${p.section || "no section number in source"} | Page ${p.page}\n${p.text}`
    ).join("\n\n");

    let answer;
    try {
      answer = await aiText(env, [
        { role: "system", content: ANSWER_SYSTEM },
        { role: "user", content: `QUESTION: ${question}\n\nPASSAGES:\n${passageText}` },
      ], 420);
    } catch (e) {
      return json(request, { error: "ai_failed", detail: String((e && e.message) || e).slice(0, 300) }, 502);
    }
    if (!answer) return json(request, { error: "empty_answer" }, 502);

    const payload = { answer, citations: passages, debug: passages._debug || null };
    const toCache = new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=604800" } });
    await cache.put(cacheKey, toCache);
    return json(request, payload);
  },
};
