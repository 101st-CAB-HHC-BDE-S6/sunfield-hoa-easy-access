#!/usr/bin/env python3
"""OCR scanned PDFs using PyMuPDF + RapidOCR (venv at ~/workspace/.ocr-venv).
Writes tools/ocr_text/<stem>.txt with form feeds between pages, same as ocr_pdfs.py."""
import sys, hashlib
from pathlib import Path
import pymupdf
from rapidocr_onnxruntime import RapidOCR

OCR_DIR = Path(__file__).resolve().parent / "ocr_text"
engine = RapidOCR()

def ocr_pdf(pdf: Path):
    out = OCR_DIR / (pdf.stem + ".txt")
    if out.exists() and out.stat().st_size > 0:
        print(f"cached: {pdf.name}", flush=True); return out
    doc = pymupdf.open(pdf)
    pages = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=300)
        import numpy as np
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4: img = img[:, :, :3]
        result, _ = engine(img)
        lines = []
        if result:
            # sort by y then x
            items = sorted(result, key=lambda r: (min(p[1] for p in r[0]), min(p[0] for p in r[0])))
            lines = [r[1] for r in items]
        pages.append("\n".join(lines))
        print(f"  {pdf.name} page {i+1}/{len(doc)}: {sum(len(l) for l in lines)} chars", flush=True)
    OCR_DIR.mkdir(exist_ok=True)
    out.write_text("\f".join(pages))
    print(f"-> {out.name}: {len(pages)} pages, {sum(len(p) for p in pages)} chars", flush=True)
    return out

seen=set()
for p in sys.argv[1:]:
    pdf=Path(p); h=hashlib.md5(pdf.read_bytes()).hexdigest()
    if h in seen: print(f"skip duplicate {pdf.name}"); continue
    seen.add(h); ocr_pdf(pdf)
