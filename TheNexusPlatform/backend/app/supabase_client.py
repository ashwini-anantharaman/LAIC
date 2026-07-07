from typing import Optional

from .config import get_settings
from .local_store import (
    local_create_course,
    local_enroll,
    local_get_cached_unit,
    local_get_course_by_id,
    local_get_course_by_join_code,
    local_get_mastery,
    local_get_module_structure,
    local_get_uploads_by_ids,
    local_insert_upload,
    local_link_uploads,
    local_load_course_source_text,
    local_save_cached_unit,
    local_save_module_structure,
    local_sync_course,
    local_update_mastery,
)

# Supabase helpers. Cache and course operations are best-effort where noted;
# hard failures on course create/upload return errors to the caller.

_client = None
_admin_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    settings = get_settings()
    if not settings.supabase_enabled:
        return None
    try:
        from supabase import create_client

        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        return _client
    except Exception:
        return None


def require_admin_client():
    """Service-role client reserved for admin auth APIs (never sign-in)."""
    global _admin_client
    if _admin_client is not None:
        return _admin_client
    settings = get_settings()
    if not settings.supabase_enabled:
        raise RuntimeError("Supabase is not configured")
    from supabase import create_client

    _admin_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _admin_client


def create_ephemeral_client():
    settings = get_settings()
    if not settings.supabase_enabled:
        raise RuntimeError("Supabase is not configured")
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def require_client():
    client = _get_client()
    if client is None:
        raise RuntimeError("Supabase is not configured")
    return client


# ── Unit content cache ────────────────────────────────────────────────────────
def get_cached_unit(unit_id: str, topic: str, grade: Optional[str]) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return local_get_cached_unit(unit_id, topic, grade)
    try:
        resp = (
            client.table("unit_content")
            .select("content")
            .eq("unit_id", unit_id)
            .eq("topic", topic)
            .eq("grade", grade or "")
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]["content"]
    except Exception:
        return local_get_cached_unit(unit_id, topic, grade)
    return None


def save_cached_unit(unit_id: str, topic: str, grade: Optional[str], content: dict) -> None:
    client = _get_client()
    if client is None:
        local_save_cached_unit(unit_id, topic, grade, content)
        return
    try:
        client.table("unit_content").upsert(
            {
                "unit_id": unit_id,
                "topic": topic,
                "grade": grade or "",
                "content": content,
            },
            on_conflict="unit_id,topic,grade",
        ).execute()
    except Exception:
        local_save_cached_unit(unit_id, topic, grade, content)


# ── Uploads ───────────────────────────────────────────────────────────────────
def insert_upload(filename: str, extracted_text: str, kind: str = "context") -> Optional[dict]:
    try:
        client = require_client()
        resp = (
            client.table("uploads")
            .insert({"filename": filename, "extracted_text": extracted_text, "kind": kind})
            .select("id, filename")
            .single()
            .execute()
        )
        return resp.data
    except Exception:
        return local_insert_upload(filename, extracted_text, kind)


def link_uploads_to_course(upload_ids: list[str], course_id: str) -> None:
    try:
        client = require_client()
        for uid in upload_ids:
            client.table("uploads").update({"course_id": course_id}).eq("id", uid).execute()
    except Exception:
        local_link_uploads(upload_ids, course_id)


def _get_upload_text_by_ids(upload_ids: list[str]) -> str:
    client = _get_client()
    parts: list[str] = []
    if client is None:
        rows = local_get_uploads_by_ids(upload_ids)
        parts = [r.get("extracted_text", "") for r in rows if r.get("extracted_text")]
    else:
        try:
            for uid in upload_ids:
                resp = client.table("uploads").select("extracted_text").eq("id", uid).limit(1).execute()
                rows = resp.data or []
                if rows and rows[0].get("extracted_text"):
                    parts.append(rows[0]["extracted_text"])
        except Exception:
            rows = local_get_uploads_by_ids(upload_ids)
            parts = [r.get("extracted_text", "") for r in rows if r.get("extracted_text")]
    return "\n\n".join(parts)


def load_course_source_text(course_id: str, max_chars: int = 12000) -> str:
    if not course_id:
        return ""
    client = _get_client()
    if client is None:
        return local_load_course_source_text(course_id, max_chars)
    try:
        resp = (
            client.table("uploads")
            .select("extracted_text")
            .eq("course_id", course_id)
            .execute()
        )
        parts = [r["extracted_text"] for r in (resp.data or []) if r.get("extracted_text")]
        combined = "\n\n".join(parts)
        return combined[:max_chars]
    except Exception:
        return local_load_course_source_text(course_id, max_chars)


# ── Courses ───────────────────────────────────────────────────────────────────
def _row_to_course_detail(row: dict, unit_rows: list[dict]) -> dict:
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


def create_course_with_units(
    subject: str,
    unit_title: str,
    teacher: Optional[str],
    grade: Optional[str],
    goals: Optional[str],
    join_code: str,
    units: list[dict],
    org_id: Optional[str] = None,
    stage_node_id: Optional[str] = None,
    teacher_profile_id: Optional[str] = None,
) -> Optional[dict]:
    try:
        client = require_client()
        insert_row = {
            "subject": subject,
            "unit_title": unit_title,
            "teacher": teacher,
            "grade": grade,
            "goals": goals,
            "join_code": join_code,
            "units": len(units),
        }
        if org_id:
            insert_row["org_id"] = org_id
        if stage_node_id:
            insert_row["stage_node_id"] = stage_node_id
        if teacher_profile_id:
            insert_row["teacher_profile_id"] = teacher_profile_id

        course_resp = (
            client.table("courses")
            .insert(insert_row)
            .select("id")
            .single()
            .execute()
        )
        course_id = course_resp.data["id"]

        unit_results = []
        for i, u in enumerate(units):
            unit_resp = (
                client.table("units")
                .insert(
                    {
                        "course_id": course_id,
                        "module_label": u.get("moduleLabel", f"Module {i + 1}"),
                        "concept": u.get("concept", unit_title),
                        "position": i,
                    }
                )
                .select("id, module_label, concept, position")
                .single()
                .execute()
            )
            row = unit_resp.data
            unit_results.append(
                {
                    "id": row["id"],
                    "moduleLabel": row["module_label"],
                    "concept": row["concept"],
                    "position": row["position"],
                }
            )

        local_sync_course(
            course_id,
            subject,
            unit_title,
            teacher,
            grade,
            goals,
            join_code,
            unit_results,
        )
        return {"course_id": course_id, "units": unit_results}
    except Exception:
        return local_create_course(subject, unit_title, teacher, grade, goals, join_code, units)


def get_course_by_join_code(code: str) -> Optional[dict]:
    normalized = code.strip().upper()
    # Local store is the source of truth during dev / when Supabase is out of sync.
    local = local_get_course_by_join_code(normalized)
    if local is not None:
        return local

    client = _get_client()
    if client is None:
        return None
    try:
        resp = (
            client.table("courses")
            .select("*")
            .eq("join_code", normalized)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        row = rows[0]
        units_resp = (
            client.table("units").select("*").eq("course_id", row["id"]).execute()
        )
        return _row_to_course_detail(row, units_resp.data or [])
    except Exception:
        return local_get_course_by_join_code(normalized)


def get_course_by_id(course_id: str) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return local_get_course_by_id(course_id)
    try:
        resp = client.table("courses").select("*").eq("id", course_id).limit(1).execute()
        rows = resp.data or []
        if not rows:
            return local_get_course_by_id(course_id)
        row = rows[0]
        units_resp = (
            client.table("units").select("*").eq("course_id", course_id).execute()
        )
        return _row_to_course_detail(row, units_resp.data or [])
    except Exception:
        return local_get_course_by_id(course_id)


def enroll_student(
    course_id: str,
    display_name: str,
    profile_id: Optional[str] = None,
) -> bool:
    try:
        client = require_client()
        row = {"course_id": course_id, "display_name": display_name}
        if profile_id:
            row["profile_id"] = profile_id
        client.table("enrollments").insert(row).execute()
        return True
    except Exception:
        return local_enroll(course_id, display_name)


def save_module_structure(unit_id: str, structure: dict) -> None:
    client = _get_client()
    if client is None:
        local_save_module_structure(unit_id, structure)
        return
    try:
        client.table("module_structures").upsert(
            {"unit_id": unit_id, "structure": structure},
            on_conflict="unit_id",
        ).execute()
    except Exception:
        local_save_module_structure(unit_id, structure)


def get_module_structure(unit_id: str) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return local_get_module_structure(unit_id)
    try:
        resp = (
            client.table("module_structures")
            .select("structure")
            .eq("unit_id", unit_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]["structure"]
    except Exception:
        return local_get_module_structure(unit_id)
    return local_get_module_structure(unit_id)


def get_mastery(student_id: str, unit_id: str) -> list[dict]:
    client = _get_client()
    if client is None:
        return local_get_mastery(student_id, unit_id)
    try:
        resp = (
            client.table("item_mastery")
            .select("*")
            .eq("student_id", student_id)
            .eq("unit_id", unit_id)
            .execute()
        )
        return [
            {
                "itemId": r["item_id"],
                "alpha": r["alpha"],
                "beta": r["beta"],
                "wrongCount": r["wrong_count"],
                "lastResult": r.get("last_result"),
            }
            for r in (resp.data or [])
        ]
    except Exception:
        return local_get_mastery(student_id, unit_id)


def update_mastery(student_id: str, unit_id: str, item_id: str, correct: bool) -> dict:
    client = _get_client()
    if client is None:
        row = local_update_mastery(student_id, unit_id, item_id, correct)
        return {
            "itemId": item_id,
            "alpha": row["alpha"],
            "beta": row["beta"],
            "wrongCount": row["wrong_count"],
            "lastResult": row.get("last_result"),
        }
    try:
        resp = (
            client.table("item_mastery")
            .select("*")
            .eq("student_id", student_id)
            .eq("unit_id", unit_id)
            .eq("item_id", item_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            row = rows[0]
            alpha, beta, wrong = row["alpha"], row["beta"], row["wrong_count"]
        else:
            alpha, beta, wrong = 1.0, 1.0, 0
        if correct:
            alpha += 1
            last = "correct"
        else:
            beta += 1
            wrong += 1
            last = "incorrect"
        client.table("item_mastery").upsert(
            {
                "student_id": student_id,
                "unit_id": unit_id,
                "item_id": item_id,
                "alpha": alpha,
                "beta": beta,
                "wrong_count": wrong,
                "last_result": last,
            },
            on_conflict="student_id,unit_id,item_id",
        ).execute()
        return {"itemId": item_id, "alpha": alpha, "beta": beta, "wrongCount": wrong, "lastResult": last}
    except Exception:
        row = local_update_mastery(student_id, unit_id, item_id, correct)
        return {
            "itemId": item_id,
            "alpha": row["alpha"],
            "beta": row["beta"],
            "wrongCount": row["wrong_count"],
            "lastResult": row.get("last_result"),
        }

