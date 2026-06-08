import sys
from pathlib import Path

from pypdf import PdfWriter
from pypdf.errors import DependencyError


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: encrypt_pdf.py <input.pdf> <output.pdf> <password>", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    password = sys.argv[3]

    if not input_path.exists():
        print(f"Input PDF not found: {input_path}", file=sys.stderr)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        writer = PdfWriter(clone_from=input_path)
        writer.encrypt(
            user_password=password,
            owner_password=password,
            algorithm="AES-256",
        )
    except DependencyError:
        print(
            "AES-256 requires Python package cryptography; falling back to RC4-128 PDF password protection.",
            file=sys.stderr,
        )
        writer = PdfWriter(clone_from=input_path)
        writer.encrypt(
            user_password=password,
            owner_password=password,
            use_128bit=True,
        )

    with output_path.open("wb") as handle:
        writer.write(handle)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
