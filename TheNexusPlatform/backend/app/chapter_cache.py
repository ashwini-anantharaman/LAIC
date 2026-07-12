"""Cache full chapter detection results keyed by upload IDs."""

from __future__ import annotations

import threading
import time
from typing import Optional

from .ingest import DetectedChapter, detect_chapters

_lock = threading.Lock()
_cache: dict[str, list[DetectedChapter]] = {}
_warming: set[str] = set()


def cache_key(upload_ids: list[str]) -> str:
    return ",".join(sorted(upload_ids))


def get_cached_chapters(upload_ids: list[str]) -> Optional[list[DetectedChapter]]:
    key = cache_key(upload_ids)
    with _lock:
        return list(_cache[key]) if key in _cache else None


def set_cached_chapters(upload_ids: list[str], chapters: list[DetectedChapter]) -> None:
    key = cache_key(upload_ids)
    with _lock:
        _cache[key] = chapters


def _wait_for_warm(key: str, timeout_sec: float = 300.0) -> Optional[list[DetectedChapter]]:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        with _lock:
            if key in _cache:
                return list(_cache[key])
            warming = key in _warming
        if not warming:
            return None
        time.sleep(0.5)
    with _lock:
        return list(_cache[key]) if key in _cache else None


def detect_chapters_cached(upload_ids: list[str], source_text: str) -> list[DetectedChapter]:
    key = cache_key(upload_ids)
    cached = get_cached_chapters(upload_ids)
    if cached is not None:
        return cached

    warmed = _wait_for_warm(key)
    if warmed is not None:
        return warmed

    chapters = detect_chapters(source_text)
    set_cached_chapters(upload_ids, chapters)
    return chapters


def warm_chapter_detection(upload_ids: list[str], source_text: str) -> None:
    """Start full chapter detection in the background (after fast preview)."""
    key = cache_key(upload_ids)
    with _lock:
        if key in _cache or key in _warming:
            return
        _warming.add(key)

    def _run() -> None:
        try:
            chapters = detect_chapters(source_text)
            set_cached_chapters(upload_ids, chapters)
        finally:
            with _lock:
                _warming.discard(key)

    threading.Thread(target=_run, daemon=True).start()
