/**
 * Local JSON persistence for mock Game Platform scenarios.
 *
 * This is intentionally a simple file-backed store (no Supabase table) since the
 * Game Platform flow is a fake/demo flow used only to show the product shape.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _here = dirname(fileURLToPath(import.meta.url));

type Row = Record<string, any>;

function _dataDir(): string {
  return process.env.LOCAL_DATA_DIR || join(_here, "..", "..", "backend", ".local_data");
}

function _file(): string {
  return join(_dataDir(), "game_scenarios.json");
}

function _read(): Row[] {
  const file = _file();
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf-8"));
}

function _write(rows: Row[]): void {
  mkdirSync(_dataDir(), { recursive: true });
  writeFileSync(_file(), JSON.stringify(rows, null, 2));
}

export function saveScenario(
  programId: string,
  gameType: string,
  prompt: string,
  title: string,
  setup: string,
  steps: Row[],
  outcome: string,
): Row {
  const row = {
    id: randomUUID(),
    program_id: programId,
    game_type: gameType,
    prompt,
    title,
    setup,
    steps,
    outcome,
    created_at: new Date().toISOString(),
  };
  const rows = _read();
  rows.push(row);
  _write(rows);
  return row;
}

export function getScenario(scenarioId: string): Row | null {
  for (const row of _read()) {
    if (row.id === scenarioId) return row;
  }
  return null;
}

export function listScenarios(programId: string | null = null): Row[] {
  let rows = _read();
  if (programId) rows = rows.filter((r) => r.program_id === programId);
  return rows.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
}
