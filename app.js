"use strict";
let INDEX = null;

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
  sum.innerHTML = `<p><strong>${total} matching passage${total === 1 ? "" : "s"}</strong> — showing the top ${results.length}, best matches first.</p>
    ${hints ? `<p>Understood as: ${hints}</p>` : ""}
    ${topics.map(t => `<p class="hint">${esc(t.hint)}</p>`).join("")}
    <p class="muted">The plain-language lines above only point you to the right topic. The rule itself is the exact text in each card — always go by that, and check the source document.</p>`;
  box.innerHTML = results.map(({ chunk, matched }) => `
    <article class="card">
      <p class="cite">${citation(chunk)}</p>
      <p class="context">This passage mentions: ${matched.slice(0, 6).map(esc).join(", ")}</p>
      <p class="rule">${highlight(chunk.text, matched)}</p>
    </article>`).join("");
}

async function init() {
  try {
    INDEX = await (await fetch("data/search-index.json")).json();
    $("#doccount").textContent = `${INDEX.documents.filter(d => d.searchable).length} searchable documents · ${INDEX.chunks.length} passages indexed`;
    $("#sources-list").innerHTML = INDEX.documents.map(d =>
      `<li><strong>${esc(d.name)}</strong>${d.date ? ` — ${esc(d.date)}` : ""} · ${esc(d.category)} · ${d.pages} pages${d.searchable ? "" : `<br><em>${esc(d.note || "Not text-searchable.")}</em>`}</li>`).join("");
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
