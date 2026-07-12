import io

from pypdf import PdfReader


def extract_text_from_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    result = "\n".join(parts).strip()
    if not result:
        raise ValueError(
            "No text could be extracted from the PDF. It may be a scanned image-only PDF."
        )
    return result
