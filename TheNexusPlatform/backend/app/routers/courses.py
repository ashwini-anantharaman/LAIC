import secrets
import string
import threading

from fastapi import APIRouter, HTTPException

from ..chapter_cache import detect_chapters_cached, warm_chapter_detection
from ..ingest import detect_chapter_outline
from ..ingest_jobs import create_job, get_job, run_ingest_job, update_job
from ..rag import index_upload_text
from ..schemas import (
    CourseDetailResponse,
    CreateCourseRequest,
    CreateCourseResponse,
    EnrollRequest,
    IngestJobStatus,
    PreviewStructureRequest,
)
from ..supabase_client import (
    create_course_with_units,
    enroll_student,
    get_course_by_id,
    get_course_by_join_code,
    link_uploads_to_course,
    load_course_source_text,
    save_module_structure,
)

router = APIRouter(prefix="/api/courses", tags=["courses"])

_ALPHABET = string.ascii_uppercase + string.digits


def _make_join_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(6))


def _start_ingest(
    job_id: str,
    upload_ids: list[str],
    source_text: str,
    unit_rows: list[dict],
    grade: str | None,
    teacher_blocks: list,
) -> None:
    try:
        update_job(job_id, stage="Detecting chapters")
        chapters = detect_chapters_cached(upload_ids, source_text)
        run_ingest_job(
            job_id,
            [u["id"] for u in unit_rows],
            chapters,
            grade,
            teacher_blocks,
            lambda structure: save_module_structure(structure.unitId, structure.model_dump()),
            upload_ids=upload_ids,
        )
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), stage="Failed")


@router.post("/preview-structure")
def preview_structure(req: PreviewStructureRequest) -> dict:
    """Return detected chapter labels from upload text (no generation)."""
    upload_ids = req.uploadIds
    if not upload_ids:
        raise HTTPException(status_code=400, detail="No uploads provided")
    from ..supabase_client import _get_upload_text_by_ids, local_get_uploads_by_ids

    text = _get_upload_text_by_ids(upload_ids)
    if not text:
        raise HTTPException(status_code=404, detail="Upload text not found")

    for row in local_get_uploads_by_ids(upload_ids):
        if row.get("extracted_text"):
            index_upload_text(row["id"], row["extracted_text"])

    chapters = detect_chapter_outline(text)
    warm_chapter_detection(upload_ids, text)
    return {
        "chapters": [{"label": c.label, "title": c.title} for c in chapters],
    }


@router.get("/ingest-jobs/{job_id}", response_model=IngestJobStatus)
def ingest_job_status(job_id: str) -> IngestJobStatus:
    job = get_job(job_id)
    if job.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    return IngestJobStatus(
        status=job.get("status", "running"),
        stage=job.get("stage", ""),
        current=job.get("current", 0),
        total=job.get("total", 0),
        error=job.get("error"),
    )


@router.post("", response_model=CreateCourseResponse)
def create_course(req: CreateCourseRequest) -> CreateCourseResponse:
    join_code = _make_join_code()
    teacher_blocks = req.teacherBlocks or []
    units_input = [u.model_dump() for u in req.units]
    source_text = ""

    if req.uploadIds:
        from ..supabase_client import _get_upload_text_by_ids

        source_text = _get_upload_text_by_ids(req.uploadIds)

    if not units_input:
        units_input = [{"moduleLabel": "Chapter 1", "concept": req.unitTitle}]

    result = create_course_with_units(
        subject=req.subject,
        unit_title=req.unitTitle,
        teacher=req.teacherName,
        grade=req.grade,
        goals=req.goals,
        join_code=join_code,
        units=units_input,
        org_id=req.orgId,
        stage_node_id=req.stageNodeId,
        teacher_profile_id=req.teacherProfileId,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Failed to create course")

    course_id = result["course_id"]
    unit_rows = result["units"]

    if req.uploadIds:
        link_uploads_to_course(req.uploadIds, course_id)

    ingest_job_id = None
    if source_text.strip() and req.uploadIds:
        job_id = create_job(len(unit_rows))
        threading.Thread(
            target=_start_ingest,
            args=(job_id, req.uploadIds, source_text, unit_rows, req.grade, teacher_blocks),
            daemon=True,
        ).start()
        ingest_job_id = job_id

    return CreateCourseResponse(
        courseId=course_id,
        joinCode=join_code,
        subject=req.subject,
        unitTitle=req.unitTitle,
        teacher=req.teacherName or "",
        units=unit_rows,
        ingestJobId=ingest_job_id,
    )


@router.get("/join/{code}", response_model=CourseDetailResponse)
def join_by_code(code: str) -> CourseDetailResponse:
    course = get_course_by_join_code(code.strip().upper())
    if course is None:
        raise HTTPException(status_code=404, detail="Invalid classroom code")
    return course


@router.get("/{course_id}", response_model=CourseDetailResponse)
def get_course(course_id: str) -> CourseDetailResponse:
    course = get_course_by_id(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.post("/{course_id}/enroll")
def enroll(course_id: str, req: EnrollRequest) -> dict:
    ok = enroll_student(course_id, req.displayName, req.profileId)
    if not ok:
        raise HTTPException(status_code=503, detail="Failed to enroll")

    if req.joinCode:
        try:
            from ..platform_db import get_join_code, register_student

            code_row = get_join_code(req.joinCode)
            if code_row and code_row.get("kind") == "student" and req.profileId:
                register_student(req.profileId, code_row, req.displayName)
        except Exception:
            pass

    return {"ok": True}
