# Sunfield HOA Easy Access

**Smart search over the Sunfield HOA rules** — for Sunfield residents in Buda, Texas.

Ask in plain words — `lights`, `parking`, `can I wash my car in the driveway?` — and get back
the **exact rule text**, each result cited with its **source document, section/rule, and page**.

> **Unofficial, resident-made.** This is not the official Sunfield HOA / FirstService
> Residential site, and it is not affiliated with the Sunfield Community Association,
> its developer, or FirstService Residential. Always confirm with the association —
> the documents themselves are the final word.

**Live site:** https://101st-cab-hhc-bde-s6.github.io/sunfield-hoa-easy-access/

## Install it on your phone

Open the live site, then **Add to Home Screen** (Share menu on iPhone, ⋮ menu on Android).
It's a PWA: no app store, no account, and it works offline after the first visit.

## How the "smart" search works (honestly)

There is no backend, no API key, and no AI model. All search runs in your browser:

- `data/search-index.json` — passages extracted from the HOA PDFs, each with document,
  page, and the nearest section/article/rule heading found in the source text
  (or an explicit "no section number in source" — numbers are never invented).
- `answers.js` — the **short answer** shown first: for the main topics, a
  plain-English summary written by hand only from the indexed passages, citing
  them by document + page (resolved against the index at runtime; if the
  documents don't directly address a topic, the answer says so). Other queries
  get key requirement sentences pulled word-for-word from the top matches.
- `search.js` — ranked keyword search plus a hand-built **HOA topic thesaurus**
  (`TOPICS`): searching *lights* also searches *lighting, illumination, exterior
  fixtures…*; asking about a *car wash* also searches *vehicles, driveways, water…*.
  It also strips question words and does light fuzzy matching.
- Making it smarter = improving the thesaurus and ranking. That's the best place
  for neighbors to contribute — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Sources & known gaps

Text was extracted (with `pdftotext`) from documents downloaded from the FirstService
Residential resident portal on 2026-11-24, plus the public *Sunfield Information and
Quick Reference Guide v12* from sunfield-scaac.net. The full source list is on the
site's Sources section.

Known gaps: the portal library has **no standalone base Community Charter and no
standalone Bylaws** — only amendments/supplements (the main rules document is filed
under the Charter name). Several portal PDFs were scanned images with no text layer
(Fining Policy filing, Commercial Land Charter, some amendments/certificates);
they are listed on the site but are **not yet searchable** until someone OCRs them
(`tools/ocr_pdfs.py` is ready for that — see "Rebuild the search index" below).

## Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Rebuild the search index

Put the source PDFs in a folder (they are **not** committed to this repo — they are
the association's documents) and run:

```sh
# Scanned-image PDFs only: OCR them first (pdftoppm + tesseract)
python3 tools/ocr_pdfs.py /path/to/scanned.pdf [...]
python3 tools/build_index.py /path/to/pdfs [extra.pdf ...]
```

`build_index.py` uses `pdftotext` where a text layer exists and automatically
falls back to the OCR text in `tools/ocr_text/` for scanned-image PDFs.

## License

The **code** in this repository is [MIT-licensed](LICENSE). The HOA rule text in the
search index and the documents it came from belong to the Sunfield Community
Association — the MIT license does **not** cover them; they are included so residents
can find the rules that govern their own homes. The sunset/sunburst artwork in
`icons/` is original to this project. "Sunfield" is used only to identify the community.
