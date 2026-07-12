from fastapi import APIRouter, HTTPException

from ..claude import call_claude, call_claude_json
from ..prompts import build_assistant_prompt, build_generation_prompt
from ..schemas import (
    AssistantRequest,
    AssistantResponse,
    GeneratedPayload,
    GenerateRequest,
    UnitContent,
)
from ..supabase_client import get_cached_unit, load_course_source_text, save_cached_unit

router = APIRouter(prefix="/api/content", tags=["content"])


@router.post("/generate", response_model=UnitContent)
def generate_unit(req: GenerateRequest) -> UnitContent:
    # 1. Cache lookup (best-effort).
    cached = get_cached_unit(req.unitId, req.topic, req.grade)
    if cached:
        try:
            return UnitContent.model_validate(cached)
        except Exception:
            pass  # stale/invalid cache -> regenerate

    source_text = load_course_source_text(req.courseId) if req.courseId else ""

    # 2. Generate all three modes in one structured call.
    try:
        payload = call_claude_json(
            system_prompt="You are an expert curriculum designer. Output only valid JSON.",
            user_message=build_generation_prompt(req.topic, req.grade, source_text or None),
            schema=GeneratedPayload,
        )
    except RuntimeError as err:
        raise HTTPException(status_code=502, detail=str(err))

    unit = UnitContent(
        unitId=req.unitId,
        moduleLabel=req.moduleLabel or "Module 1",
        concept=payload.concept or req.topic,
        progress=req.progress if req.progress is not None else 0,
        availableModes=["conversational", "summary", "narrative"],
        hasInteractive=False,
        conversational=payload.conversational,
        summary=payload.summary,
        narrative=payload.narrative,
        assistantReply=payload.assistantReply,
    )

    # 3. Cache the result (best-effort).
    save_cached_unit(req.unitId, req.topic, req.grade, unit.model_dump())
    return unit


@router.post("/assistant", response_model=AssistantResponse)
def assistant(req: AssistantRequest) -> AssistantResponse:
    source_text = load_course_source_text(req.courseId) if req.courseId else ""
    try:
        reply = call_claude(
            system_prompt=build_assistant_prompt(req.topic, req.mode, source_text or None),
            user_message=req.question,
            max_tokens=500,
        )
    except RuntimeError as err:
        raise HTTPException(status_code=502, detail=str(err))
    return AssistantResponse(reply=reply.strip())
