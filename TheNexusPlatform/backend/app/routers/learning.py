from fastapi import APIRouter, HTTPException

from ..schemas import AttemptRequest, AttemptResponse, ItemMastery, ModuleStructure
from ..supabase_client import get_mastery, get_module_structure, update_mastery

router = APIRouter(tags=["learning"])


@router.get("/api/content/module/{unit_id}", response_model=ModuleStructure)
def get_module(unit_id: str) -> ModuleStructure:
    data = get_module_structure(unit_id)
    if not data:
        raise HTTPException(status_code=404, detail="Module structure not found")
    return ModuleStructure.model_validate(data)


@router.get("/api/learning/mastery/{unit_id}")
def list_mastery(unit_id: str, studentId: str = "local-student") -> list[ItemMastery]:
    rows = get_mastery(studentId, unit_id)
    return [ItemMastery.model_validate(r) for r in rows]


@router.post("/api/learning/attempt", response_model=AttemptResponse)
def record_attempt(req: AttemptRequest) -> AttemptResponse:
    row = update_mastery(req.studentId, req.unitId, req.itemId, req.correct)
    mastery = ItemMastery(
        itemId=row["itemId"],
        alpha=row["alpha"],
        beta=row["beta"],
        wrongCount=row["wrongCount"],
        lastResult=row.get("lastResult"),
    )
    should_resurface = not req.correct or row["wrongCount"] >= 2
    return AttemptResponse(mastery=mastery, shouldResurface=should_resurface)
