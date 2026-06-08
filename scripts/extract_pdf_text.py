import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception as exc:
    print(f"pypdf unavailable: {exc}", file=sys.stderr)
    sys.exit(2)


def main():
    if len(sys.argv) != 2:
        print("Usage: extract_pdf_text.py INPUT.pdf", file=sys.stderr)
        sys.exit(2)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(2)

    reader = PdfReader(str(pdf_path))
    parts = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text)
    print("\n\n".join(parts))


if __name__ == "__main__":
    main()
