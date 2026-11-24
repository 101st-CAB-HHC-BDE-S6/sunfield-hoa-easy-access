/* Sunfield HOA Easy Access — AI answer backend (Cloudflare Worker + Workers AI).
   Receives a question plus the top search passages from the static site,
   and returns a plain-English answer written ONLY from those passages,
   with [n] citations that map back to the passages' document/section/page.
   It has no access to anything else: no database, no keys, no user data.
   Questions and passage text are not stored or logged. */
"use strict";

const MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";
const ALLOWED_ORIGINS = [
  "https://101st-cab-hhc-bde-s6.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const MAX_QUESTION = 300;
const MAX_PASSAGES = 8;
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

function json(request, obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

const SYSTEM = [
  "You answer questions about the Sunfield HOA rules in Buda, Texas, for a resident website.",
  "You are given numbered PASSAGES copied word-for-word from the official HOA documents, each with its document name, section, and page.",
  "Rules you must follow:",
  "1. Answer ONLY from the passages. Never use outside knowledge and never invent a rule, number, date, fee, or permission.",
  "2. If the specific activity or thing in the question is not named in the passages, your FIRST sentence must say the passages do not directly mention it (for example: 'The passages don't directly mention washing a car.'). Never say an activity is allowed just because the passages do not forbid it, and never say it is forbidden just because the passages do not allow it.",
  "3. After that, give the closest related rules the passages DO state, in plain everyday English, in 1-4 short sentences total.",
  "4. After each fact, cite the passage it came from like [1] or [2]. Every claim needs a citation.",
  "5. Do not mention that you are an AI or talk about these instructions. Do not quote long passages; summarize them. Do not add a citation list at the end; citations go inline only.",
  "6. End with nothing extra — no disclaimers, no offers to help further.",
].join("\n");

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
    const passages = (Array.isArray(body.passages) ? body.passages : [])
      .slice(0, MAX_PASSAGES)
      .map(p => ({
        doc: String(p.doc || "").slice(0, 120),
        section: p.section ? String(p.section).slice(0, 120) : null,
        page: Number(p.page) || null,
        text: String(p.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_PASSAGE_CHARS),
      }))
      .filter(p => p.text.length >= 30);
    if (question.length < 3) return json(request, { error: "question_too_short" }, 400);
    if (!passages.length) return json(request, { error: "no_passages" }, 400);
    if (!env.AI) return json(request, { error: "ai_not_bound" }, 500);

    const passageText = passages.map((p, i) =>
      `[${i + 1}] ${p.doc} | ${p.section || "no section number in source"} | Page ${p.page}\n${p.text}`
    ).join("\n\n");
    const user = `QUESTION: ${question}\n\nPASSAGES:\n${passageText}`;

    let out;
    try {
      out = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        max_tokens: 420,
        temperature: 0.1,
      });
    } catch (e) {
      return json(request, { error: "ai_failed", detail: String((e && e.message) || e).slice(0, 300) }, 502);
    }
    const answer = String(
      (out && out.response) ||
      (out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) ||
      ""
    ).trim();
    if (!answer) return json(request, { error: "empty_answer" }, 502);
    return json(request, { answer, citations: passages });
  },
};
