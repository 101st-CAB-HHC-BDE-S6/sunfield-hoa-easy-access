# Contributing

Neighbors welcome — especially if you're tech-savvy. This site is deliberately
simple (static HTML/CSS/JS, no build step, no backend) so it can live on GitHub
Pages for free and anyone can read the code.

## Easiest high-value contribution: make the AI search smarter

Search quality lives in the worker (`worker/src/index.js`): the catalog it
builds from the index, the selector prompt that picks which parts of the
books govern a question, and the answer prompt. There are deliberately no
pre-built answers or keyword shortcuts. If a natural question gets a bad
answer:

1. Reproduce it on the live site and look at which passages the AI used
   (they're printed under the answer, with citations).
2. Improve the selector/answer prompt or the catalog keywords in the worker.
3. In your pull request, name the question you tested and what improved.

Other welcome help:

- **Improve the OCR text** for the scanned PDFs (noted as OCR on the site):
  `tools/ocr_pdfs.py` (pdftoppm + tesseract) or `tools/ocr_rapid.py`
  (PyMuPDF + RapidOCR) produces the text, then rebuild the index with
  `tools/build_index.py` and open a PR with the updated `data/search-index.json`.
- Better section/heading detection in `tools/build_index.py` (citations must
  always come from the source text — never invent a section or rule number).
- Accessibility and mobile polish.

## Rules of the road

- No accounts, no tracking, no API keys in the site — the site must keep working
  as static files on GitHub Pages, offline after first load. The optional AI
  answer backend (`worker/`, a Cloudflare Worker + Workers AI) may only ever
  summarize passages the search already found, with citations, and the site
  must fall back to plain search whenever it is unreachable.
- Don't present summaries as rulings. The site finds rule text; it never decides
  what's allowed. Plain-language hints must stay clearly labeled as pointers.
- Keep the unofficial disclaimer intact.

## Test before you PR

```sh
python3 -m http.server 8000
```

Try at least: `lights`, `car wash`, `parking`, `fence` — results should be
relevant, cited (document • section • page), and highlighted.
