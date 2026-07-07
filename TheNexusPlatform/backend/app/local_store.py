import json
import uuid
from pathlib import Path
from typing import Any, Optional

DATA_DIR = Path(__file__).parent.parent / ".local_data"


def _path(name: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"{name}.json"


def _read(name: str) -> list[dict[str, Any]]:
    p = _path(name)
    if not p.exists():
        return []
    return json.loads(p.read_text())


def _write(name: str, rows: list[dict[str, Any]]) -> None:
    _path(name).write_text(json.dumps(rows, indent=2))


def local_insert_upload(filename: str, extracted_text: str, kind: str = "context") -> dict:
    rows = _read("uploads")
    row = {"id": str(uuid.uuid4()), "filename": filename, "extracted_text": extracted_text, "kind": kind, "course_id": None}
    rows.append(row)
    _write("uploads", rows)
    return {"id": row["id"], "filename": filename}


def local_link_uploads(upload_ids: list[str], course_id: str) -> None:
    rows = _read("uploads")
    for row in rows:
        if row["id"] in upload_ids:
            row["course_id"] = course_id
    _write("uploads", rows)


def local_load_course_source_text(course_id: str, max_chars: int = 12000) -> str:
    rows = _read("uploads")
    parts = [r["extracted_text"] for r in rows if r.get("course_id") == course_id and r.get("extracted_text")]
    return "\n\n".join(parts)[:max_chars]


def local_get_uploads_by_ids(upload_ids: list[str]) -> list[dict]:
    rows = _read("uploads")
    return [r for r in rows if r.get("id") in upload_ids]


def local_create_course(
    subject: str,
    unit_title: str,
    teacher: Optional[str],
    grade: Optional[str],
    goals: Optional[str],
    join_code: str,
    units: list[dict],
) -> dict:
    courses = _read("courses")
    unit_rows_store = _read("units")
    course_id = str(uuid.uuid4())
    courses.append(
        {
            "id": course_id,
            "subject": subject,
            "unit_title": unit_title,
            "teacher": teacher,
            "grade": grade,
            "goals": goals,
            "join_code": join_code,
            "units": len(units),
        }
    )
    _write("courses", courses)

    unit_results = []
    for i, u in enumerate(units):
        uid = str(uuid.uuid4())
        unit_rows_store.append(
            {
                "id": uid,
                "course_id": course_id,
                "module_label": u.get("moduleLabel", f"Module {i + 1}"),
                "concept": u.get("concept", unit_title),
                "position": i,
            }
        )
        unit_results.append(
            {
                "id": uid,
                "moduleLabel": u.get("moduleLabel", f"Module {i + 1}"),
                "concept": u.get("concept", unit_title),
                "position": i,
            }
        )
    _write("units", unit_rows_store)
    return {"course_id": course_id, "units": unit_results}


def local_sync_course(
    course_id: str,
    subject: str,
    unit_title: str,
    teacher: Optional[str],
    grade: Optional[str],
    goals: Optional[str],
    join_code: str,
    units: list[dict],
) -> None:
    """Mirror a Supabase-created course into local JSON for reliable join-code lookup."""
    courses = [c for c in _read("courses") if c.get("id") != course_id]
    courses.append(
        {
            "id": course_id,
            "subject": subject,
            "unit_title": unit_title,
            "teacher": teacher,
            "grade": grade,
            "goals": goals,
            "join_code": join_code.upper(),
            "units": len(units),
        }
    )
    _write("courses", courses)

    unit_rows = [u for u in _read("units") if u.get("course_id") != course_id]
    for i, u in enumerate(units):
        unit_rows.append(
            {
                "id": u["id"],
                "course_id": course_id,
                "module_label": u.get("moduleLabel", f"Module {i + 1}"),
                "concept": u.get("concept", unit_title),
                "position": u.get("position", i),
            }
        )
    _write("units", unit_rows)


def local_get_course_by_join_code(code: str) -> Optional[dict]:
    courses = _read("courses")
    row = next((c for c in courses if c.get("join_code", "").upper() == code.upper()), None)
    if not row:
        return None
    return _course_detail(row)


def local_get_course_by_id(course_id: str) -> Optional[dict]:
    courses = _read("courses")
    row = next((c for c in courses if c["id"] == course_id), None)
    if not row:
        return None
    return _course_detail(row)


def _course_detail(row: dict) -> dict:
    unit_rows = [u for u in _read("units") if u["course_id"] == row["id"]]
    return {
        "id": row["id"],
        "subject": row["subject"],
        "unitTitle": row["unit_title"],
        "teacher": row.get("teacher") or "",
        "units": len(unit_rows),
        "progress": 0,
        "joinCode": row.get("join_code"),
        "grade": row.get("grade"),
        "unitList": [
            {
                "id": u["id"],
                "moduleLabel": u["module_label"],
                "concept": u["concept"],
                "position": u["position"],
            }
            for u in sorted(unit_rows, key=lambda x: x.get("position", 0))
        ],
    }


def local_enroll(course_id: str, display_name: str) -> bool:
    rows = _read("enrollments")
    rows.append({"id": str(uuid.uuid4()), "course_id": course_id, "display_name": display_name})
    _write("enrollments", rows)
    return True


def local_get_cached_unit(unit_id: str, topic: str, grade: Optional[str]) -> Optional[dict]:
    rows = _read("unit_content")
    row = next(
        (
            r
            for r in rows
            if r["unit_id"] == unit_id and r["topic"] == topic and r.get("grade", "") == (grade or "")
        ),
        None,
    )
    return row["content"] if row else None


def local_save_cached_unit(unit_id: str, topic: str, grade: Optional[str], content: dict) -> None:
    rows = _read("unit_content")
    rows = [r for r in rows if not (r["unit_id"] == unit_id and r["topic"] == topic and r.get("grade", "") == (grade or ""))]
    rows.append({"unit_id": unit_id, "topic": topic, "grade": grade or "", "content": content})
    _write("unit_content", rows)


def local_save_module_structure(unit_id: str, structure: dict) -> None:
    rows = _read("module_structures")
    rows = [r for r in rows if r.get("unit_id") != unit_id]
    rows.append({"unit_id": unit_id, "structure": structure})
    _write("module_structures", rows)


def local_get_module_structure(unit_id: str) -> Optional[dict]:
    rows = _read("module_structures")
    row = next((r for r in rows if r.get("unit_id") == unit_id), None)
    return row["structure"] if row else None


def local_get_mastery(student_id: str, unit_id: str) -> list[dict]:
    return [r for r in _read("item_mastery") if r.get("student_id") == student_id and r.get("unit_id") == unit_id]


def local_update_mastery(student_id: str, unit_id: str, item_id: str, correct: bool) -> dict:
    rows = _read("item_mastery")
    row = next(
        (r for r in rows if r.get("student_id") == student_id and r.get("unit_id") == unit_id and r.get("item_id") == item_id),
        None,
    )
    if row is None:
        row = {"student_id": student_id, "unit_id": unit_id, "item_id": item_id, "alpha": 1.0, "beta": 1.0, "wrong_count": 0}
        rows.append(row)
    if correct:
        row["alpha"] = row.get("alpha", 1) + 1
        row["last_result"] = "correct"
    else:
        row["beta"] = row.get("beta", 1) + 1
        row["wrong_count"] = row.get("wrong_count", 0) + 1
        row["last_result"] = "incorrect"
    _write("item_mastery", rows)
    return row
