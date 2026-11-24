#!/usr/bin/env python3
"""OCR scanned-image Sunfield HOA PDFs into page-separated text files.

Usage:
  python3 tools/ocr_pdfs.py /path/to/some.pdf [/path/to/other.pdf ...]

Some portal PDFs are scanned images with no text layer, so `pdftotext`
returns nothing for them. This script renders each page with `pdftoppm`
(300 dpi) and OCRs it with `tesseract`, writing the result to
tools/ocr_text/<pdf-stem>.txt with form feeds (\\f) between pages — the
same page-separated format `pdftotext` produces, so tools/build_index.py
can consume it unchanged (it checks this folder automatically when a PDF
has no usable text layer).

Requires only already-installed system tools: pdftoppm, tesseract.
The OCR text is an intermediate build artifact; minor recognition errors
are possible and the original PDFs govern.
"""
import hashlib, os, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

TESSERACT = shutil.which("tesseract") or "/usr/bin/tesseract"
PDFTOPPM = shutil.which("pdftoppm") or "/usr/bin/pdftoppm"

# One thread per tesseract process: parallel processes OCR pages faster than
# tesseract's own threading on small/shared CPUs.
os.environ.setdefault("OMP_THREAD_LIMIT", "1")

OCR_DIR = Path(__file__).resolve().parent / "ocr_text"


def ocr_page(png: Path) -> str:
    r = subprocess.run([TESSERACT, str(png), "stdout", "--psm", "6"],
                       capture_output=True, text=True)
    return r.stdout


def ocr_pdf(pdf: Path) -> Path:
    out = OCR_DIR / (pdf.stem + ".txt")
    if out.exists() and out.stat().st_size > 0:
        print(f"cached, skipping OCR: {pdf.name}")
        return out
    with tempfile.TemporaryDirectory() as td:
        prefix = str(Path(td) / "page")
        subprocess.run([PDFTOPPM, "-r", "300", "-png", str(pdf), prefix], check=True)
        pngs = sorted(Path(td).glob("page-*.png"))
        print(f"{pdf.name}: {len(pngs)} pages")
        with ThreadPoolExecutor(max_workers=2) as ex:
            pages = list(ex.map(ocr_page, pngs))
    OCR_DIR.mkdir(exist_ok=True)
    out.write_text("\f".join(pages))
    chars = sum(len(p) for p in pages)
    print(f"  -> {out.name}: {len(pages)} pages, {chars} chars")
    return out


def main():
    pdfs = [Path(p) for p in sys.argv[1:]]
    if not pdfs:
        sys.exit(__doc__)
    seen = set()
    for pdf in pdfs:
        h = hashlib.md5(pdf.read_bytes()).hexdigest()
        if h in seen:
            print(f"skip duplicate: {pdf.name}")
            continue
        seen.add(h)
        ocr_pdf(pdf)


if __name__ == "__main__":
    main()
