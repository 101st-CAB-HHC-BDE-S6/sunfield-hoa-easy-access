#!/usr/bin/env python3
"""Build data/search-index.json from Sunfield HOA PDFs.

Usage:
  python3 tools/build_index.py /path/to/pdf_dir [/path/to/extra.pdf ...]

Extracts text with pdftotext -layout, chunks by document + page, cleans
whitespace, and writes a JSON index the static site searches client-side.
The PDFs themselves are NOT committed to this repo (they are the
association's documents); only the extracted search index is.
"""
import hashlib, json, re, subprocess, sys
from pathlib import Path

# Map portal download filename fragments -> (display name, date shown in portal, category)
DOC_META = [
    ("Community_Charter_-_NSUNZ", ("Rules and Regulations (filed as Community Charter)", "May 9, 2019", "Governing Documents")),
    ("Amenity_Center_Pool_Rules", ("Amenity Center Pool Rules", "April 3, 2023", "Amenities")),
    ("Residential_Design_Guidelines", ("Residential Design Guidelines", "August 17, 2021", "Governing Documents / ARC")),
    ("Welcome_Sheet", ("Welcome to Sunfield", "December 11, 2023", "Welcome Packet")),
    ("Master_Plant_list_2025", ("Master Plant List", "February 26, 2026", "ARC Guidelines")),
    ("Master_Plant_List_2021", ("Approved Plant List", "March 20, 2019", "Governing Documents")),
    ("1st_Amendment_to_Community_Charter", ("1st Amendment to Community Charter", "February 4, 2019", "Charter Amendments")),
    ("3rd_Amendment_to_Community_Charter__Hays", ("3rd Amendment to Community Charter (Hays Co.)", "February 4, 2019", "Charter Amendments")),
    ("3rd_Amendment_to_Community_Charter_Travis", ("3rd Amendment to Community Charter (Travis Co.)", "February 4, 2019", "Charter Amendments")),
    ("4th_Amendment_to_Community_Charter_Hays", ("4th Amendment to Community Charter (Hays Co.)", "February 4, 2019", "Charter Amendments")),
    ("4th_Amendment_to_Community_Charter_Travis", ("4th Amendment to Community Charter (Travis Co.)", "February 4, 2019", "Charter Amendments")),
    ("5th_SUPPLEMENT_TO_CHARTER", ("5th Supplement to Community Charter (Travis Co.)", "February 4, 2019", "Charter Amendments")),
    ("Commercial_Land_Charter", ("Commercial Land Charter", "February 4, 2019", "Governing Documents")),
    ("1st_Amendment_to_Bylaws", ("1st Amendment to Bylaws", "February 4, 2019", "Bylaws")),
    ("Not_of_Filing_of_Dedicatory_Instrument", ("Fining Policy — Notice of Filing of Dedicatory Instruments (Hays Co.)", "January 31, 2024", "Fine Policy")),
    ("Amendment_to_Notice_of_Filing_Dedicatory_Instruments_Travis", ("Amendment to Notice of Filing of Dedicatory Instruments (Travis Co.)", "February 4, 2019", "Governing Documents")),
    ("Amendment_to_Notice_of_Filing_Dedicatory_Instruments_Hays", ("Amendment to Notice of Filing of Dedicatory Instruments (Hays Co.)", "February 4, 2019", "Governing Documents")),
    ("Certificate_of_Formation", ("Certificate of Formation", "August 6, 2018", "Certificates")),
    ("Management_Certificate", ("Management Certificate", "August 6, 2018", "Certificates")),
    ("Quick_Reference_Guide", ("Sunfield Information and Quick Reference Guide v12", "July 2026", "Quick Reference (public)")),
]

def meta_for(name):
    # Most specific fragments first so amendments are not mislabeled as the base Charter.
    for frag, meta in sorted(DOC_META, key=lambda kv: -len(kv[0])):
        if frag.lower() in name.lower():
            return meta
    return (name, "", "Other")

HEADING_RE = re.compile(
    r"^\s*((?:Section|SECTION|Article|ARTICLE|Rule|RULE|Chapter|CHAPTER)\s+"
    r"(?:[0-9]+(?:\.[0-9]+)*|[IVXLCDM]+)\b[^\n]{0,80}|"
    r"§\s*[0-9]+(?:\.[0-9]+)*[^\n]{0,60}|"
    r"[0-9]+\.[0-9]+(?:\.[0-9]+)?\s+[A-Z][A-Za-z /&\-]{3,60})$")

def find_heading(line, current):
    m = HEADING_RE.match(line.strip())
    if m:
        h = re.sub(r"\s+", " ", m.group(1)).strip(" .")
        return h[:90]
    return current

def clean(text):
    text = text.replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    out, blank = [], False
    for ln in lines:
        if not ln:
            if not blank: out.append("")
            blank = True
        else:
            out.append(ln); blank = False
    return "\n".join(out).strip()

def chunk_page(text, max_len=900):
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        p = re.sub(r"\s*\n\s*", " ", p)
        if len(cur) + len(p) + 1 <= max_len:
            cur = (cur + " " + p).strip()
        else:
            if cur: chunks.append(cur)
            while len(p) > max_len:  # hard-split very long paragraphs on sentence boundaries
                cut = p.rfind(". ", 0, max_len)
                if cut < 200: cut = max_len
                chunks.append(p[:cut+1].strip()); p = p[cut+1:].strip()
            cur = p
    if cur: chunks.append(cur)
    return [c for c in chunks if len(c) >= 40]

def main():
    pdf_dir = Path(sys.argv[1]); extras = [Path(p) for p in sys.argv[2:]]
    pdfs = sorted([p for p in pdf_dir.iterdir() if p.suffix.lower() == ".pdf"]) + extras
    seen_hashes, docs, chunks, cid = set(), [], [], 0
    for pdf in pdfs:
        h = hashlib.md5(pdf.read_bytes()).hexdigest()
        if h in seen_hashes:
            print(f"skip duplicate: {pdf.name}"); continue
        seen_hashes.add(h)
        name, date, cat = meta_for(pdf.name)
        txt_path = Path("/tmp") / (pdf.stem + ".txt")
        subprocess.run(["pdftotext", "-layout", str(pdf), str(txt_path)], check=True)
        raw = txt_path.read_text(errors="ignore")
        used_ocr = False
        if len(raw.strip()) < 100:
            # Scanned-image PDF with no text layer: fall back to OCR text
            # produced by tools/ocr_pdfs.py, if present.
            ocr_path = Path(__file__).resolve().parent / "ocr_text" / (pdf.stem + ".txt")
            if ocr_path.exists():
                raw = ocr_path.read_text(errors="ignore")
                used_ocr = True
                print(f"  (using OCR text from {ocr_path.name})")
        pages = raw.split("\f")
        doc_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        n_chunks = 0
        current_heading = None
        for i, page in enumerate(pages, start=1):
            cleaned = clean(page)
            # Walk paragraph by paragraph so each chunk records the heading
            # nearest *before* it (headings carry across pages).
            paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", cleaned) if p.strip()]
            cur, cur_sec = "", current_heading
            def flush():
                nonlocal cur, cid, n_chunks
                alpha = sum(ch.isalpha() for ch in cur)
                if len(cur) >= 40 and alpha >= 0.45 * max(len(cur), 1):
                    chunks.append({"id": cid, "doc": name, "docId": doc_id, "page": i,
                                   "section": cur_sec, "text": cur})
                    cid += 1; n_chunks += 1
                cur = ""
            for p in paras:
                current_heading = find_heading(p, current_heading)
                if len(cur) + len(p) + 1 <= 900:
                    if not cur: cur_sec = current_heading
                    cur = (cur + " " + p).strip()
                else:
                    flush()
                    while len(p) > 900:
                        cut = p.rfind(". ", 0, 900)
                        if cut < 200: cut = 900
                        cur = p[:cut+1].strip(); cur_sec = current_heading; flush()
                        p = p[cut+1:].strip()
                    cur, cur_sec = p, current_heading
            flush()
        searchable = n_chunks > 0
        if used_ocr and searchable:
            note = ("Scanned-image PDF — searchable text produced by OCR, so minor recognition "
                    "errors are possible; the original PDF governs.")
        elif searchable:
            note = ""
        else:
            note = "Scanned-image PDF in the portal — no text layer, so not yet searchable. Listed for completeness."
        docs.append({"id": doc_id, "name": name, "date": date, "category": cat,
                     "pages": len(pages), "chunks": n_chunks, "searchable": searchable,
                     "ocr": used_ocr, "note": note})
        print(f"{name}: {len(pages)} pages, {n_chunks} chunks")
    out = Path(__file__).resolve().parent.parent / "data" / "search-index.json"
    out.write_text(json.dumps({"generated": "2026-11-24", "documents": docs, "chunks": chunks}, separators=(",", ":")))
    print(f"Wrote {out} ({out.stat().st_size/1e6:.2f} MB, {len(chunks)} chunks, {len(docs)} docs)")

if __name__ == "__main__":
    main()
