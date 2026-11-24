"use strict";
let INDEX = null;

/* The AI backend (Cloudflare Worker + Workers AI, see worker/) does the
   searching itself: it reads the question, decides by meaning which parts
   of the rule books govern it, pulls those passages, and writes a
   plain-English answer from only those passages, with citations.
   There are no pre-built answers, topics or query shortcuts on this page.
   If the AI is unreachable, the page falls back to a plain keyword search
   over the same passages so the rule text is always available. */
const AI_ENDPOINT = "https://sunfield-hoa-ai.sunfield-hoa.workers.dev/ask";
let askSeq = 0;

const $ = s => document.querySelector(s);

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function citation(c) {
  const sec = c.section ? esc(c.section) : "no section number in source";
  return `${esc(c.doc)} &bull; ${sec} &bull; Page ${c.page}`;
}

function passageCard(c, n) {
  return `<article class="card">
    <p class="cite">${n ? `[${n}] ` : ""}${citation(c)}</p>
    <p class="rule">${esc(c.text)}</p>
  </article>`;
}

/* Plain keyword fallback — used only when the AI backend is unreachable. */
const FALLBACK_STOP = new Set(("a an the is are was were do does did can i may shall will would should could to of in on at for with and or be it this that what when where which who how why if then than so as by from into about over under am pm please tell show find give get want need know").split(" "));
function fallbackSearch(query, limit = 20) {
  const terms = [...new Set(query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !FALLBACK_STOP.has(w)))];
  if (!terms.length || !INDEX) return [];
  const scored = [];
  for (const chunk of INDEX.chunks) {
    const text = chunk.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      let n = 0, pos = 0;
      while ((pos = text.indexOf(t, pos)) !== -1) { n++; pos += t.length; if (n >= 5) break; }
      score += n;
    }
    if (score > 0) scored.push({ chunk, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.chunk);
}

async function render(query) {
  const sum = $("#summary"), box = $("#results");
  query = (query || "").trim();
  if (!query) { sum.innerHTML = ""; box.innerHTML = ""; return; }
  const seq = ++askSeq;
  sum.innerHTML = `<article class="card short-answer"><h3>Answer</h3>
    <p class="muted">Thinking about your question and searching the rule books… this usually takes 15–45 seconds.</p></article>`;
  box.innerHTML = "";
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query }),
    });
    if (!res.ok) throw new Error("ai " + res.status);
    const data = await res.json();
    if (seq !== askSeq || !data.answer) return;
    const passages = data.citations || [];
    sum.innerHTML = `<article class="card short-answer">
      <h3>Answer</h3>
      <p class="answer-text">${esc(data.answer)}</p>
      ${passages.map((c, i) => `<p class="cite">[${i + 1}] ${citation(c)}</p>`).join("")}
      <p class="muted">Written by AI only from the passages below — the exact rule text in the cards is what counts.</p>
    </article>`;
    box.innerHTML = passages.map((c, i) => passageCard(c, i + 1)).join("");
  } catch (e) {
    if (seq !== askSeq) return;
    const found = fallbackSearch(query);
    sum.innerHTML = `<article class="card"><h3>AI answer unavailable right now</h3>
      <p>Showing plain keyword matches instead — read the passages below for the exact rules.</p></article>`;
    box.innerHTML = found.length
      ? found.map(c => passageCard(c)).join("")
      : `<div class="card"><h3>No matching passages found</h3><p>Try different words for the same idea. This search only covers the documents listed under Sources below.</p></div>`;
  }
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

$("#search-form").addEventListener("submit", e => { e.preventDefault(); render($("#q").value); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init();
