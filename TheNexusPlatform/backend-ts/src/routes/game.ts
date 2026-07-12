/** Mock Game Platform routes: turn a coach's prompt into a fake gameplay scenario. */

import { Hono } from "hono";

import { getCurrentUser, type PlatformUser } from "../auth";
import { callClaudeJson } from "../claude";
import * as gameStore from "../gameStore";
import { HttpError } from "../httpError";
import * as db from "../platformDb";
import { generateScenarioSchema, parseBody, scenarioResultSchema } from "../schemas";

type Row = Record<string, any>;

export const gameRouter = new Hono();

function _assertProgramAccess(user: PlatformUser, program: Row): void {
  const orgId = program.org_id;
  const hasProgramMembership = user.memberships.some((m) => m.program_id === program.id);
  const hasOrgMembership = user.memberships.some((m) => m.org_id === orgId);
  if (!(hasProgramMembership || hasOrgMembership)) {
    throw new HttpError(403, "Not a member of this program");
  }
}

function _rowToResponse(row: Row): Row {
  return {
    id: row.id,
    program_id: row.program_id,
    game_type: row.game_type,
    prompt: row.prompt,
    title: row.title,
    setup: row.setup,
    steps: row.steps,
    outcome: row.outcome,
    created_at: row.created_at,
  };
}

const _SYSTEM_PROMPT = `You are a game master narrating a tabletop card game coaching scenario.
Given the coach's description of a situation, produce a short, structured play-by-play
that turns the prompt into fake gameplay for teaching purposes. Keep it concrete, use the
named game's terminology, and make each step a single beat of the scenario (a bid, a play,
a decision point, a reveal, etc). Return 4 to 6 steps.

Respond with ONLY a JSON object matching this shape:
{
  "title": "short scenario title",
  "setup": "1-2 sentence description of the starting situation (hands, score, position, etc)",
  "steps": [
    {"narration": "what happens in this beat", "dialogue": "optional short quote from a player, or null"}
  ],
  "outcome": "1-2 sentence resolution / lesson for the students"
}`;

gameRouter.post("/scenarios", async (c) => {
  const user = await getCurrentUser(c);
  const req = parseBody(generateScenarioSchema, await c.req.json());
  const program = await db.getProgram(req.program_id);
  if (!program) throw new HttpError(404, "Program not found");
  _assertProgramAccess(user, program);

  const org = await db.getOrganization(program.org_id);
  const userMessage =
    `Game: ${req.game_type}\n` +
    `Organization: ${org?.name ?? ""}\n` +
    `Coach's situation prompt: ${req.prompt}`;
  const result = await callClaudeJson(_SYSTEM_PROMPT, userMessage, scenarioResultSchema, 1800);

  const row = gameStore.saveScenario(
    req.program_id,
    req.game_type,
    req.prompt,
    result.title,
    result.setup,
    result.steps,
    result.outcome,
  );
  return c.json(_rowToResponse(row));
});

gameRouter.get("/scenarios/:scenario_id", async (c) => {
  const user = await getCurrentUser(c);
  const row = gameStore.getScenario(c.req.param("scenario_id"));
  if (!row) throw new HttpError(404, "Scenario not found");
  const program = await db.getProgram(row.program_id);
  if (program) _assertProgramAccess(user, program);
  return c.json(_rowToResponse(row));
});

gameRouter.get("/scenarios", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.query("program_id") ?? null;
  if (programId) {
    const program = await db.getProgram(programId);
    if (program) _assertProgramAccess(user, program);
  }
  const rows = gameStore.listScenarios(programId);
  return c.json(rows.map(_rowToResponse));
});
