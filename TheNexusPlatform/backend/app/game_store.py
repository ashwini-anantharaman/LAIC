"""Local JSON persistence for mock Game Platform scenarios.

This is intentionally a simple file-backed store (no Supabase table) since the
Game Platform flow is a fake/demo flow used only to show the product shape.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

_DATA = Path(__file__).parent.parent / ".local_data"
_FILE = _DATA / "game_scenarios.json"


def _read() -> list[dict[str, Any]]:
    if not _FILE.exists():
        return []
    return json.loads(_FILE.read_text())


def _write(rows: list[dict[str, Any]]) -> None:
    _DATA.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(rows, indent=2))


def save_scenario(
    program_id: str,
    game_type: str,
    prompt: str,
    title: str,
    setup: str,
    steps: list[dict[str, Any]],
    outcome: str,
) -> dict[str, Any]:
    row = {
        "id": str(uuid4()),
        "program_id": program_id,
        "game_type": game_type,
        "prompt": prompt,
        "title": title,
        "setup": setup,
        "steps": steps,
        "outcome": outcome,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    rows = _read()
    rows.append(row)
    _write(rows)
    return row


def get_scenario(scenario_id: str) -> Optional[dict[str, Any]]:
    for row in _read():
        if row["id"] == scenario_id:
            return row
    return None


def list_scenarios(program_id: Optional[str] = None) -> list[dict[str, Any]]:
    rows = _read()
    if program_id:
        rows = [r for r in rows if r.get("program_id") == program_id]
    return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)
