"""Split source documents into overlapping chunks for retrieval."""

from __future__ import annotations

import re

DEFAULT_CHUNK_SIZE = 1200
DEFAULT_OVERLAP = 200


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[dict]:
    """Return chunk dicts: {id, text, start}."""
    cleaned = text.strip()
    if not cleaned:
        return []

    chunks: list[dict] = []
    start = 0
    index = 0
    while start < len(cleaned):
        end = min(start + chunk_size, len(cleaned))
        if end < len(cleaned):
            paragraph_break = cleaned.rfind("\n\n", start + chunk_size // 2, end)
            if paragraph_break > start:
                end = paragraph_break
            else:
                sentence_break = max(
                    cleaned.rfind(". ", start + chunk_size // 2, end),
                    cleaned.rfind(".\n", start + chunk_size // 2, end),
                )
                if sentence_break > start:
                    end = sentence_break + 1

        body = cleaned[start:end].strip()
        if body:
            chunks.append({"id": f"c{index}", "text": body, "start": start})
            index += 1

        if end >= len(cleaned):
            break
        start = max(start + 1, end - overlap)

    return chunks


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())
