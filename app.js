"use strict";
let INDEX = null;

/* AI answer backend (Cloudflare Worker + Workers AI, see worker/).
   Empty = AI off and the site is search-only. When set, question-like
   searches also ask the worker for a plain-English answer written only
   from the top passages below, with citations. Any failure is silent —
   the short answer and passages always remain. */
const AI_ENDPOINT = "https://sunfield-hoa-ai.sunfield-hoa.workers.dev/ask";
let aiSeq = 0;

const $ = s => document.querySelector(s);

function esc(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function highlight(text, matched) {
  let out = esc(text);
  const terms = [...matched].filter(t => t.length >= 3).sort((a, b) => b.length - a.length);
  for (const t of terms) {
    const re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

function citation(c) {
  const sec = c.section ? esc(c.section) : "no section number in source";
  return `${esc(c.doc)} &bull; ${sec} &bull; Page ${c.page}`;
}

/* Answer-first layer: a plain-English short answer above the passages.
   Curated answers (answers.js) are hand-written from the indexed passages
   and cite them by {doc, page}, resolved here against the real index.
   Queries with no curated topic get key requirement sentences pulled
   word-for-word from the top matches instead. There is no AI backend. */
function resolveCite(loc) {
  if (!INDEX) return null;
  const onPage = INDEX.chunks.filter(c => c.doc === loc.doc && c.page === loc.page);
  if (loc.match) {
    const hit = onPage.find(c => c.text.toLowerCase().includes(loc.match.toLowerCase()));
    if (hit) return hit;
  }
  return onPage[0] || null;
}

function keyPoints(results, query) {
  const KEY = /\b(must|shall|prohibit\w*|required|not permitted|may not|no .{0,50}?\b(shall|may|will)\b|only)\b/i;
  const qtoks = (query || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length >= 4 && !["what", "when", "where", "which", "does", "can", "the", "and", "for"].includes(w));
  const collect = needQueryHit => {
    const seen = new Set(), pts = [];
    for (const { chunk } of results.slice(0, 8)) {
      const sentences = chunk.text.match(/[^.!?]+[.!?]+/g) || [];
      for (const s0 of sentences) {
        const s = s0.trim();
        if (s.length < 50 || s.length > 320 || !KEY.test(s) || s.includes("WPB")) continue;
        if (needQueryHit && qtoks.length && !qtoks.some(t => s.toLowerCase().includes(t))) continue;
        const k = s.slice(0, 40).toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k); pts.push({ s, chunk });
        if (pts.length >= 4) return pts;
      }
    }
    return pts;
  };
  const onTopic = collect(true);
  return onTopic.length >= 2 ? onTopic : collect(false);
}

function shortAnswerHtml(topics, results, query) {
  // A curated short answer may only appear when the query actually used one
  // of the topic's distinctive trigger words (topic.strong). A weak topic hit
  // (a shared expansion term like "water" or "driveway") must never pull in
  // another topic's answer — those queries get key points instead.
  const byPriority = topics.filter(t => t.strong)
    .sort((a, b) => ANSWER_PRIORITY.indexOf(a.id) - ANSWER_PRIORITY.indexOf(b.id));
  for (const t of byPriority) {
    const a = SHORT_ANSWERS[t.id];
    if (!a) continue;
    const cites = a.cites.map(resolveCite).filter(Boolean);
    return `<article class="card short-answer">
      <h3>Short answer</h3>
      <p class="answer-text">${esc(a.text)}</p>
      ${cites.map(c => `<p class="cite">${citation(c)}</p>`).join("")}
      <p class="muted">Plain-language summary written from the passages below — the exact rule text in the cards is what counts.</p>
    </article>`;
  }
  const pts = keyPoints(results, query);
  if (!pts.length) return "";
  return `<article class="card short-answer">
    <h3>Key points from the top matches</h3>
    <ul>${pts.map(p => `<li>${esc(p.s)}<br><span class="cite">${citation(p.chunk)}</span></li>`).join("")}</ul>
    <p class="muted">Pulled word-for-word from the passages below — read the full cards for context.</p>
  </article>`;
}

/* Ask the AI backend for an answer grounded in the top passages, and
   show it above everything else. Citations [n] in the answer map to the
   numbered passages sent, printed in the usual citation format. */
async function askAI(query, results) {
  const seq = ++aiSeq;
  const slot = document.getElementById("ai-answer");
  if (!slot) return;
  slot.innerHTML = `<article class="card short-answer"><h3>Answer</h3><p class="muted">Reading the top rules and writing an answer…</p></article>`;
  try {
    const passages = results.slice(0, 8).map(({ chunk }) => ({
      doc: chunk.doc, section: chunk.section, page: chunk.page, text: chunk.text,
    }));
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query, passages }),
    });
    if (!res.ok) throw new Error("ai " + res.status);
    const data = await res.json();
    if (seq !== aiSeq || !data.answer) { if (seq === aiSeq) slot.innerHTML = ""; return; }
    const cites = (data.citations || passages).map((c, i) =>
      `<p class="cite">[${i + 1}] ${citation(c)}</p>`).join("");
    slot.innerHTML = `<article class="card short-answer">
      <h3>Answer</h3>
      <p class="answer-text">${esc(data.answer)}</p>
      ${cites}
      <p class="muted">Written by AI only from the passages below — the exact rule text in the cards is what counts.</p>
    </article>`;
  } catch (e) {
    if (seq === aiSeq) slot.innerHTML = "";
  }
}

function render(query) {
  const box = $("#results");
  if (!INDEX) { box.innerHTML = "<p class='muted'>Loading the rule book…</p>"; return; }
  if (!query.trim()) { box.innerHTML = ""; $("#summary").innerHTML = ""; return; }
  const { results, topics, total } = search(INDEX, query, 30);
  const sum = $("#summary");
  if (!results.length) {
    sum.innerHTML = "";
    box.innerHTML = `<div class="card"><h3>No matching passages found</h3>
      <p>Try different words for the same idea — for example “exterior lighting” instead of “lights”, or “trailer” instead of “camper”.
      This search only covers the documents listed under Sources below; a scanned or missing document may hold the answer.</p></div>`;
    return;
  }
  const hints = topics.map(t => `<span class="chip">${esc(t.label)}</span>`).join(" ");
  sum.innerHTML = `${AI_ENDPOINT ? `<div id="ai-answer"></div>` : ""}${shortAnswerHtml(topics, results, query)}
    <p><strong>${total} matching passage${total === 1 ? "" : "s"}</strong> — showing the top ${results.length}, best matches first.</p>
    ${hints ? `<p>Understood as: ${hints}</p>` : ""}
    ${topics.map(t => `<p class="hint">${esc(t.hint)}</p>`).join("")}
    <p class="muted">The plain-language lines above only point you to the right topic. The rule itself is the exact text in each card — always go by that, and check the source document.</p>`;
  box.innerHTML = results.map(({ chunk, matched }) => `
    <article class="card">
      <p class="cite">${citation(chunk)}</p>
      <p class="context">This passage mentions: ${matched.slice(0, 6).map(esc).join(", ")}</p>
      <p class="rule">${highlight(chunk.text, matched)}</p>
    </article>`).join("");
  if (AI_ENDPOINT) askAI(query, results);
}

async function init() {
  try {
    INDEX = await (await fetch("data/search-index.json")).json();
    $("#doccount").textContent = `${INDEX.documents.filter(d => d.searchable).length} searchable documents · ${INDEX.chunks.length} passages indexed`;
    $("#sources-list").innerHTML = INDEX.documents.map(d =>
      `<li><strong>${esc(d.name)}</strong>${d.date ? ` — ${esc(d.date)}` : ""} · ${esc(d.category)} · ${d.pages} pages${d.note ? `<br><em>${esc(d.note)}</em>` : ""}</li>`).join("");
    const q = new URLSearchParams(location.search).get("q");
    if (q) { $("#q").value = q; render(q); }
  } catch (e) {
    $("#results").innerHTML = "<p class='card'>Could not load the search index. If you opened this file directly, try it over the web instead.</p>";
  }
}

let timer;
$("#q").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => render(e.target.value), 180); });
$("#search-form").addEventListener("submit", e => { e.preventDefault(); render($("#q").value); });
document.querySelectorAll("[data-example]").forEach(b => b.addEventListener("click", () => {
  $("#q").value = b.dataset.example; render(b.dataset.example); $("#q").focus();
}));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init();
