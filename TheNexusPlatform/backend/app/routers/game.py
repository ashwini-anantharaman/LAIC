"""Mock Game Platform routes: turn a coach's prompt into a fake gameplay scenario."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..claude import call_claude_json
from ..game_store import get_scenario, list_scenarios, save_scenario
from ..platform_auth import PlatformUser, get_current_user
from ..platform_db import get_organization, get_program
from ..schemas_game import GenerateScenarioRequest, ScenarioResponse, ScenarioResult

router = APIRouter(prefix="/api/game", tags=["game"])


def _assert_program_access(user: PlatformUser, program: dict) -> None:
    org_id = program["org_id"]
    has_program_membership = any(m.program_id == program["id"] for m in user.memberships)
    has_org_membership = any(m.org_id == org_id for m in user.memberships)
    if not (has_program_membership or has_org_membership):
        raise HTTPException(status_code=403, detail="Not a member of this program")


def _row_to_response(row: dict) -> ScenarioResponse:
    return ScenarioResponse(
        id=row["id"],
        program_id=row["program_id"],
        game_type=row["game_type"],
        prompt=row["prompt"],
        title=row["title"],
        setup=row["setup"],
        steps=row["steps"],
        outcome=row["outcome"],
        created_at=row["created_at"],
    )


_SYSTEM_PROMPT = """You are a game master narrating a tabletop card game coaching scenario.
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
}"""


@router.post("/scenarios", response_model=ScenarioResponse)
def generate_scenario(
    req: GenerateScenarioRequest,
    user: PlatformUser = Depends(get_current_user),
) -> ScenarioResponse:
    program = get_program(req.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _assert_program_access(user, program)

    org = get_organization(program["org_id"])
    user_message = (
        f"Game: {req.game_type}\n"
        f"Organization: {(org or {}).get('name', '')}\n"
        f"Coach's situation prompt: {req.prompt}"
    )
    result = call_claude_json(_SYSTEM_PROMPT, user_message, ScenarioResult, max_tokens=1800)

    row = save_scenario(
        program_id=req.program_id,
        game_type=req.game_type,
        prompt=req.prompt,
        title=result.title,
        setup=result.setup,
        steps=[s.model_dump() for s in result.steps],
        outcome=result.outcome,
    )
    return _row_to_response(row)


@router.get("/scenarios/{scenario_id}", response_model=ScenarioResponse)
def get_scenario_route(
    scenario_id: str,
    user: PlatformUser = Depends(get_current_user),
) -> ScenarioResponse:
    row = get_scenario(scenario_id)
    if not row:
        raise HTTPException(status_code=404, detail="Scenario not found")
    program = get_program(row["program_id"])
    if program:
        _assert_program_access(user, program)
    return _row_to_response(row)


@router.get("/scenarios", response_model=list[ScenarioResponse])
def list_scenarios_route(
    program_id: Optional[str] = Query(None),
    user: PlatformUser = Depends(get_current_user),
) -> list[ScenarioResponse]:
    if program_id:
        program = get_program(program_id)
        if program:
            _assert_program_access(user, program)
    rows = list_scenarios(program_id)
    return [_row_to_response(r) for r in rows]
