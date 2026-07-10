"""Lightweight BM25 retrieval over upload chunks (no external vector DB)."""

from __future__ import annotations

import json
import math
import threading
from collections import Counter
from pathlib import Path
from typing import Optional

from .chunking import chunk_text, tokenize

_lock = threading.Lock()
_indexes: dict[str, dict] = {}
_DATA_DIR = Path(__file__).resolve().parents[1] / ".local_data"
_INDEX_FILE = _DATA_DIR / "rag_index.json"


def _load_persisted() -> dict[str, dict]:
    if not _INDEX_FILE.exists():
        return {}
    try:
        return json.loads(_INDEX_FILE.read_text())
    except Exception:
        return {}


def _persist() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _INDEX_FILE.write_text(json.dumps(_indexes, indent=2))


def _build_bm25(chunks: list[dict]) -> dict:
    doc_lens: list[int] = []
    doc_freq: Counter[str] = Counter()
    tokenized: list[list[str]] = []

    for chunk in chunks:
        tokens = tokenize(chunk["text"])
        tokenized.append(tokens)
        doc_lens.append(len(tokens))
        doc_freq.update(set(tokens))

    avg_dl = sum(doc_lens) / max(len(doc_lens), 1)
    return {
        "chunks": chunks,
        "tokenized": tokenized,
        "doc_lens": doc_lens,
        "doc_freq": dict(doc_freq),
        "avg_dl": avg_dl,
        "n": len(chunks),
    }


def _bm25_scores(index: dict, query: str) -> list[tuple[int, float]]:
    q_tokens = tokenize(query)
    if not q_tokens:
        return []

    k1 = 1.5
    b = 0.75
    n = index["n"]
    avg_dl = index["avg_dl"]
    doc_freq = index["doc_freq"]
    scores: list[tuple[int, float]] = []

    for i, tokens in enumerate(index["tokenized"]):
        if not tokens:
            scores.append((i, 0.0))
            continue
        tf = Counter(tokens)
        dl = index["doc_lens"][i]
        score = 0.0
        for term in q_tokens:
            freq = tf.get(term, 0)
            if not freq:
                continue
            df = doc_freq.get(term, 0)
            idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
            score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * dl / avg_dl))
        scores.append((i, score))

    scores.sort(key=lambda item: item[1], reverse=True)
    return scores


def index_upload_text(upload_id: str, text: str) -> int:
    """Chunk and index upload text. Returns chunk count."""
    chunks = chunk_text(text)
    index = _build_bm25(chunks)
    with _lock:
        _indexes[upload_id] = index
        _persist()
    return len(chunks)


def index_uploads(upload_ids: list[str], get_text) -> None:
    """Index multiple uploads if not already indexed."""
    for upload_id in upload_ids:
        with _lock:
            if upload_id in _indexes:
                continue
        text = get_text(upload_id)
        if text:
            index_upload_text(upload_id, text)


def _ensure_loaded() -> None:
    global _indexes
    with _lock:
        if _indexes:
            return
        _indexes = _load_persisted()


def retrieve_context(
    upload_ids: list[str],
    query: str,
    top_k: int = 8,
    max_chars: int = 7000,
) -> str:
    """Return the most relevant passages for a query across uploads."""
    _ensure_loaded()
    ranked: list[tuple[float, int, dict]] = []

    for upload_id in upload_ids:
        with _lock:
            index = _indexes.get(upload_id)
        if not index:
            continue
        for chunk_idx, score in _bm25_scores(index, query):
            if score <= 0:
                break
            ranked.append((score, chunk_idx, index["chunks"][chunk_idx]))

    ranked.sort(key=lambda item: item[0], reverse=True)

    parts: list[str] = []
    total = 0
    seen: set[str] = set()
    for _, _, chunk in ranked[: top_k * 2]:
        body = chunk["text"].strip()
        if not body or body in seen:
            continue
        seen.add(body)
        if total + len(body) > max_chars:
            remaining = max_chars - total
            if remaining > 200:
                parts.append(body[:remaining])
            break
        parts.append(body)
        total += len(body)
        if len(parts) >= top_k:
            break

    return "\n\n---\n\n".join(parts)


def retrieve_from_text(text: str, query: str, top_k: int = 6, max_chars: int = 7000) -> str:
    """Retrieve relevant passages from a single chapter/document string."""
    cleaned = text.strip()
    if not cleaned:
        return ""
    if len(cleaned) <= max_chars:
        return cleaned

    chunks = chunk_text(cleaned, chunk_size=1500, overlap=200)
    if not chunks:
        return cleaned[:max_chars]
    if len(chunks) == 1:
        return chunks[0]["text"]

    index = _build_bm25(chunks)
    ranked: list[tuple[float, dict]] = []
    for chunk_idx, score in _bm25_scores(index, query):
        if score <= 0:
            break
        ranked.append((score, chunks[chunk_idx]))
    ranked.sort(key=lambda item: item[0], reverse=True)

    parts: list[str] = []
    total = 0
    seen: set[str] = set()
    for _, chunk in ranked[: top_k * 2]:
        body = chunk["text"].strip()
        if not body or body in seen:
            continue
        seen.add(body)
        if total + len(body) > max_chars:
            remaining = max_chars - total
            if remaining > 200:
                parts.append(body[:remaining])
            break
        parts.append(body)
        total += len(body)
        if len(parts) >= top_k:
            break

    return "\n\n---\n\n".join(parts) if parts else cleaned[:max_chars]
