"""Background course ingest jobs with progress tracking."""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Optional

from .ingest import DetectedChapter, ingest_chapter
from .schemas import ModuleStructure, TeacherBlockInput

_lock = threading.Lock()
_jobs: dict[str, dict] = {}


def create_job(total: int) -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = {
            "status": "running",
            "stage": "starting",
            "current": 0,
            "total": total,
            "error": None,
        }
    return job_id


def update_job(job_id: str, **fields: object) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def get_job(job_id: str) -> dict:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else {"status": "not_found"}


def run_ingest_job(
    job_id: str,
    unit_ids: list[str],
    detected: list[DetectedChapter],
    grade: Optional[str],
    teacher_blocks: list[TeacherBlockInput],
    on_structure: Callable[[ModuleStructure], None],
    upload_ids: Optional[list[str]] = None,
) -> None:
    try:
        total = len(unit_ids)
        update_job(job_id, stage="Generating chapter 1 (priority)", current=0, total=total)
        blocks = teacher_blocks or []
        upload_ids = upload_ids or []

        def work(index: int) -> tuple[int, ModuleStructure]:
            chapter = detected[index] if index < len(detected) else detected[-1]
            mod = ingest_chapter(
                unit_ids[index],
                chapter,
                grade,
                blocks,
                index,
                upload_ids=upload_ids or None,
            )
            return index, ModuleStructure(unitId=unit_ids[index], chapters=[mod], teacherBlocks=blocks)

        done = 0

        # Chapter 1 first so students/teachers can start immediately.
        if total > 0:
            _, first = work(0)
            on_structure(first)
            done = 1
            update_job(
                job_id,
                current=done,
                stage=f"Chapter 1 ready — generating {max(total - 1, 0)} more",
            )

        workers = min(4, max(total - 1, 1))
        if total > 1:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = [pool.submit(work, i) for i in range(1, total)]
                for fut in as_completed(futures):
                    _, structure = fut.result()
                    on_structure(structure)
                    done += 1
                    update_job(
                        job_id,
                        current=done,
                        stage=f"Generating chapter {done} of {total}",
                    )

        update_job(job_id, status="complete", stage="Done", current=total)
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), stage="Failed")


def start_ingest_job(
    unit_ids: list[str],
    detected: list[DetectedChapter],
    grade: Optional[str],
    teacher_blocks: list[TeacherBlockInput],
    on_structure: Callable[[ModuleStructure], None],
    upload_ids: Optional[list[str]] = None,
) -> str:
    job_id = create_job(len(unit_ids))
    threading.Thread(
        target=run_ingest_job,
        args=(job_id, unit_ids, detected, grade, teacher_blocks, on_structure, upload_ids),
        daemon=True,
    ).start()
    return job_id
