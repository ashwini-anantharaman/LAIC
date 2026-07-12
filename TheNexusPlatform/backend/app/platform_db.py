"""Database operations for the LIAC platform layer."""

from __future__ import annotations

import re
import secrets
import string
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException
from postgrest.exceptions import APIError

from . import platform_local_store as local
from .platform_permissions import Membership, StageNode
from .supabase_client import require_client

_ALPHABET = string.ascii_uppercase + string.digits
STAGE_ORDER = ["international", "national", "state", "chapter"]
_local_mode: Optional[bool] = None
_ROLE_ALIASES = {"teacher": "instructor"}


def _normalize_role(role: Optional[str]) -> Optional[str]:
    return _ROLE_ALIASES.get(role, role)


def _schema_missing(exc: APIError) -> bool:
    msg = (exc.message or str(exc)).lower()
    return "pgrst205" in msg or ("profiles" in msg and "schema" in msg)


def _use_local() -> bool:
    global _local_mode
    if _local_mode is not None:
        return _local_mode
    try:
        require_client().table("profiles").select("id").limit(1).execute()
        _local_mode = False
    except APIError as exc:
        _local_mode = _schema_missing(exc)
        if not _local_mode:
            raise _db_error(exc) from exc
    except Exception:
        _local_mode = True
    return _local_mode


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"


def _unique_slug(base: str) -> str:
    client = require_client()
    slug = base
    n = 0
    while True:
        resp = client.table("organizations").select("id").eq("slug", slug).limit(1).execute()
        if not resp.data:
            return slug
        n += 1
        slug = f"{base}-{n}"


def _make_code(length: int = 8) -> str:
    client = require_client()
    for _ in range(10):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        resp = client.table("join_codes").select("id").eq("code", code).limit(1).execute()
        if not resp.data:
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique join code")


def _first_row(data: list | None, detail: str = "No row returned") -> dict:
    rows = data or []
    if not rows:
        raise HTTPException(status_code=500, detail=detail)
    return rows[0]


def _mutate_one(builder, detail: str = "No row returned") -> dict:
    """Execute insert/upsert/update mutations that return .select() rows."""
    try:
        resp = builder.execute()
    except APIError as exc:
        raise _db_error(exc) from exc
    return _first_row(resp.data, detail)


def _db_error(exc: APIError) -> HTTPException:
    msg = exc.message or str(exc)
    if "profiles" in msg and "schema cache" in msg:
        return HTTPException(
            status_code=503,
            detail="Database not migrated. Run backend/supabase/schema.sql then migration_platform.sql in Supabase SQL editor.",
        )
    return HTTPException(status_code=503, detail=f"Database error: {msg}")


def _row_to_stage(row: dict) -> StageNode:
    return StageNode(
        id=row["id"],
        org_id=row["org_id"],
        parent_id=row.get("parent_id"),
        stage_type=row["stage_type"],
        name=row["name"],
        depth=row.get("depth", 0),
        path=row.get("path", "/"),
        discord_url=row.get("discord_url"),
        event_at=row.get("event_at"),
        qualifier_status=row.get("qualifier_status"),
        program_id=row.get("program_id"),
    )


def create_profile(
    user_id: str,
    email: str,
    role: str,
    display_name: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_create_profile(user_id, email, role, display_name)
    client = require_client()
    row = {
        "id": user_id,
        "email": email,
        "role": role,
        "display_name": display_name or email.split("@")[0],
        "name": display_name or email.split("@")[0],
    }
    try:
        resp = client.table("profiles").upsert(row).select("*").execute()
    except APIError as exc:
        raise _db_error(exc) from exc
    return _first_row(resp.data, "Failed to create profile")


def create_organization(name: str, owner_id: str) -> dict:
    if _use_local():
        return local.local_create_organization(name, owner_id)
    client = require_client()
    slug = _unique_slug(_slugify(name))
    resp = (
        client.table("organizations")
        .insert({"name": name, "slug": slug, "owner_id": owner_id})
        .select("*")
        .execute()
    )
    org = _first_row(resp.data, "Failed to create organization")
    client.table("org_memberships").insert(
        {
            "org_id": org["id"],
            "profile_id": owner_id,
            "role": "owner",
            "stage_node_id": None,
            "access": "edit",
        }
    ).execute()
    client.table("profiles").update({"role": "org_admin"}).eq("id", owner_id).execute()
    return org


def get_organization(org_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_organization(org_id)
    client = require_client()
    resp = client.table("organizations").select("*").eq("id", org_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def update_org_theme(org_id: str, accent_color: Optional[str], logo_url: Optional[str]) -> dict:
    if _use_local():
        return local.local_update_org_theme(org_id, accent_color, logo_url)
    client = require_client()
    org = get_organization(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    settings = dict(org.get("settings") or {})
    theme = dict(settings.get("theme") or {})
    if accent_color is not None:
        theme["accent_color"] = accent_color
    if logo_url is not None:
        theme["logo_url"] = logo_url
    settings["theme"] = theme
    return _mutate_one(
        client.table("organizations").update({"settings": settings}).eq("id", org_id).select("*"),
        "Failed to update organization theme",
    )


def get_join_code(code: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_join_code(code)
    client = require_client()
    resp = (
        client.table("join_codes")
        .select("*, stage_nodes(name, stage_type), organizations(name), programs(name, category)")
        .eq("code", code.strip().upper())
        .eq("active", True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def create_program(
    org_id: str,
    name: str,
    category: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    instructor_label: Optional[str] = None,
    learner_label: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_create_program(org_id, name, category, description, icon, instructor_label, learner_label)
    client = require_client()
    return _mutate_one(
        client.table("programs")
        .insert(
            {
                "org_id": org_id,
                "name": name,
                "category": category,
                "description": description,
                "icon": icon,
                "instructor_label": instructor_label,
                "learner_label": learner_label,
            }
        )
        .select("*"),
        "Failed to create program",
    )


def _program_counts(org_id: str, program_id: str) -> dict:
    client = require_client()
    stage_resp = (
        client.table("stage_nodes").select("id").eq("org_id", org_id).eq("program_id", program_id).execute()
    )
    stage_ids = [r["id"] for r in (stage_resp.data or [])]

    instructor_count = 0
    membership_resp = (
        client.table("org_memberships").select("role").eq("program_id", program_id).execute()
    )
    instructor_count = sum(
        1 for r in (membership_resp.data or []) if _normalize_role(r.get("role")) == "instructor"
    )

    learner_count = 0
    course_count = 0
    if stage_ids:
        reg_resp = client.table("student_registrations").select("id").in_("stage_node_id", stage_ids).execute()
        learner_count = len(reg_resp.data or [])
        course_resp = client.table("courses").select("id").in_("stage_node_id", stage_ids).execute()
        course_count = len(course_resp.data or [])

    return {"course_count": course_count, "learner_count": learner_count, "instructor_count": instructor_count}


def list_programs(org_id: str) -> list[dict]:
    if _use_local():
        return local.local_list_programs(org_id)
    client = require_client()
    resp = client.table("programs").select("*").eq("org_id", org_id).execute()
    return [{**r, **_program_counts(org_id, r["id"])} for r in (resp.data or [])]


def get_program(program_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_program(program_id)
    client = require_client()
    resp = client.table("programs").select("*").eq("id", program_id).limit(1).execute()
    rows = resp.data or []
    if not rows:
        return None
    row = rows[0]
    return {**row, **_program_counts(row["org_id"], row["id"])}


def create_program_join_code(
    program_id: str,
    kind: str,
    delivery_method: str = "join_code",
    email: Optional[str] = None,
    max_uses: Optional[int] = None,
    expires_at: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_create_program_join_code(
            program_id, kind, delivery_method, email, max_uses, expires_at, created_by_user_id
        )
    client = require_client()
    program_resp = client.table("programs").select("*").eq("id", program_id).limit(1).execute()
    program = _first_row(program_resp.data, "Program not found")
    code = _make_code()
    return _mutate_one(
        client.table("join_codes")
        .insert(
            {
                "org_id": program["org_id"],
                "stage_node_id": None,
                "program_id": program_id,
                "code": code,
                "kind": kind,
                "delivery_method": delivery_method,
                "email": email,
                "max_uses": max_uses,
                "uses_remaining": max_uses,
                "expires_at": expires_at,
                "created_by_user_id": created_by_user_id,
            }
        )
        .select("*"),
        "Failed to create join code",
    )


def _insert_stage_tree(
    org_id: str,
    challenge_id: Optional[str],
    nodes: list[dict],
    parent_id: Optional[str] = None,
    parent_path: str = "/",
    depth: int = 0,
    program_id: Optional[str] = None,
) -> list[dict]:
    client = require_client()
    created: list[dict] = []

    for node_input in nodes:
        stage_id = str(uuid4())
        segment = f"{node_input['stage_type']}-{stage_id[:8]}"
        path = f"{parent_path}{segment}/" if parent_path != "/" else f"/{segment}/"

        row = {
            "id": stage_id,
            "org_id": org_id,
            "challenge_id": challenge_id,
            "parent_id": parent_id,
            "program_id": program_id or node_input.get("program_id"),
            "stage_type": node_input["stage_type"],
            "name": node_input["name"],
            "depth": depth,
            "path": path,
            "discord_url": node_input.get("discord_url"),
            "event_at": node_input.get("event_at"),
        }
        stage_row = _mutate_one(
            client.table("stage_nodes").insert(row).select("*"),
            "Failed to create stage",
        )
        created.append(stage_row)

        children = node_input.get("children") or []
        if children:
            created.extend(
                _insert_stage_tree(
                    org_id, challenge_id, children, stage_id, path, depth + 1, program_id=program_id
                )
            )

    return created


def setup_organization(org_id: str, payload: dict) -> dict:
    if _use_local():
        return local.local_setup_organization(org_id, payload)
    client = require_client()

    challenge_resp = (
        client.table("challenges")
        .upsert(
            {
                "org_id": org_id,
                "enabled": payload.get("has_challenge", False),
                "name": payload.get("challenge_name"),
            },
            on_conflict="org_id",
        )
        .select("*")
        .execute()
    )
    challenge = _first_row(challenge_resp.data, "Failed to save challenge")
    challenge_id = challenge["id"] if payload.get("has_challenge") else None

    if payload.get("has_challenge"):
        stage_types = payload.get("stage_types") or []
        for i, st in enumerate(stage_types):
            client.table("challenge_stage_config").upsert(
                {
                    "challenge_id": challenge_id,
                    "stage_type": st,
                    "position": i,
                    "enabled": True,
                },
                on_conflict="challenge_id,stage_type",
            ).execute()

        initial = payload.get("initial_stages") or []
        if initial:
            existing = (
                client.table("stage_nodes").select("id").eq("org_id", org_id).limit(1).execute()
            )
            if not existing.data:
                _insert_stage_tree(org_id, challenge_id, initial)

    defaults = payload.get("permission_defaults") or {}
    for role, cfg in defaults.items():
        client.table("org_permission_defaults").upsert(
            {
                "org_id": org_id,
                "role": role,
                "default_access": cfg.get("default_access", "view"),
                "per_level_overrides": cfg.get("per_level_overrides") or {},
            },
            on_conflict="org_id,role",
        ).execute()

    if payload.get("discord_link"):
        org = get_organization(org_id) or {}
        settings = dict(org.get("settings") or {})
        settings["discord_link"] = payload["discord_link"]
        client.table("organizations").update({"settings": settings}).eq("id", org_id).execute()
        create_integration(
            org_id,
            "discord",
            {"server_url": payload["discord_link"]},
            payload.get("discord_permission_level") or "per_level",
        )

    for prog in payload.get("programs") or []:
        program_row = create_program(
            org_id,
            prog["name"],
            prog["category"],
            description=prog.get("description"),
            icon=prog.get("icon"),
            instructor_label=prog.get("instructor_label"),
            learner_label=prog.get("learner_label"),
        )
        # Program-scoped Groups: edu programs get a single-level admin root
        # (level picked per program); game programs get flat "classes", no hierarchy.
        if prog["category"] == "edu":
            stage_type = prog.get("stage_type") or "national"
            _insert_stage_tree(
                org_id,
                challenge_id,
                [{"stage_type": stage_type, "name": prog["name"]}],
                program_id=program_row["id"],
            )
        else:
            class_names = prog.get("class_names") or []
            if class_names:
                _insert_stage_tree(
                    org_id,
                    None,
                    [{"stage_type": "chapter", "name": cn} for cn in class_names],
                    program_id=program_row["id"],
                )

    return {"org_id": org_id, "challenge_id": challenge_id}


def list_stage_nodes(org_id: str) -> list[StageNode]:
    if _use_local():
        return local.local_list_stage_nodes(org_id)
    client = require_client()
    resp = (
        client.table("stage_nodes")
        .select("*")
        .eq("org_id", org_id)
        .order("depth")
        .order("name")
        .execute()
    )
    return [_row_to_stage(r) for r in (resp.data or [])]


def build_stage_tree(stages: list[StageNode]) -> list[dict]:
    by_id = {s.id: {**s.__dict__, "children": []} for s in stages}
    roots: list[dict] = []
    for s in stages:
        node = by_id[s.id]
        if s.parent_id and s.parent_id in by_id:
            by_id[s.parent_id]["children"].append(node)
        else:
            roots.append(node)
    return roots


def create_join_code(
    stage_node_id: str,
    kind: str,
    delivery_method: str = "join_code",
    email: Optional[str] = None,
    max_uses: Optional[int] = None,
    expires_at: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_create_join_code(
            stage_node_id, kind, delivery_method, email, max_uses, expires_at, created_by_user_id
        )
    client = require_client()
    stage_resp = client.table("stage_nodes").select("*").eq("id", stage_node_id).limit(1).execute()
    stage = _first_row(stage_resp.data, "Stage not found")
    code = _make_code()
    return _mutate_one(
        client.table("join_codes")
        .insert(
            {
                "org_id": stage["org_id"],
                "stage_node_id": stage_node_id,
                "code": code,
                "kind": kind,
                "delivery_method": delivery_method,
                "email": email,
                "max_uses": max_uses,
                "uses_remaining": max_uses,
                "expires_at": expires_at,
                "created_by_user_id": created_by_user_id,
            }
        )
        .select("*"),
        "Failed to create join code",
    )


def consume_join_code(code: str) -> None:
    """Decrement uses_remaining for a code with a usage limit, if set."""
    if _use_local():
        local.local_consume_join_code(code)
        return
    client = require_client()
    resp = client.table("join_codes").select("*").eq("code", code.strip().upper()).limit(1).execute()
    rows = resp.data or []
    if not rows or rows[0].get("uses_remaining") is None:
        return
    remaining = max(0, rows[0]["uses_remaining"] - 1)
    update = {"uses_remaining": remaining}
    if remaining == 0:
        update["active"] = False
    client.table("join_codes").update(update).eq("id", rows[0]["id"]).execute()


def add_membership(
    org_id: str,
    profile_id: str,
    role: str,
    stage_node_id: Optional[str],
    access: str,
    program_id: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_add_membership(org_id, profile_id, role, stage_node_id, access, program_id)
    client = require_client()
    return _mutate_one(
        client.table("org_memberships")
        .insert(
            {
                "org_id": org_id,
                "profile_id": profile_id,
                "role": _normalize_role(role),
                "stage_node_id": stage_node_id,
                "access": access,
                "program_id": program_id,
            }
        )
        .select("*"),
        "Failed to add membership",
    )


def _bridge_join_code_to_participant(profile_id: str, join_code_row: dict) -> None:
    """Best-effort: join-code student signups also get a Participant row when the
    program has a resolvable offering, so offering-based admin views (registration
    queue, participant counts) see them too. Non-fatal by design — most orgs won't
    have offerings configured yet, and join-code registration must still succeed."""
    try:
        program_id = join_code_row.get("program_id")
        if not program_id:
            return
        offerings = list_offerings(program_id)
        if not offerings:
            return
        offering = next((o for o in offerings if o.get("offering_type") in ("course", "class")), offerings[0])
        create_participant(
            join_code_row["org_id"],
            offering["id"],
            program_id=program_id,
            stage_node_id=join_code_row.get("stage_node_id"),
            user_id=profile_id,
            participant_type="learner",
        )
    except Exception:
        pass


def register_student(profile_id: str, join_code_row: dict, display_name: Optional[str] = None) -> dict:
    if _use_local():
        result = local.local_register_student(profile_id, join_code_row, display_name)
        _bridge_join_code_to_participant(profile_id, join_code_row)
        return result

    client = require_client()
    org_id = join_code_row["org_id"]
    stage_node_id = join_code_row["stage_node_id"]

    if display_name:
        client.table("profiles").update({"display_name": display_name, "name": display_name}).eq(
            "id", profile_id
        ).execute()

    client.table("profiles").update({"role": "student"}).eq("id", profile_id).execute()

    result = _mutate_one(
        client.table("student_registrations")
        .upsert(
            {
                "org_id": org_id,
                "stage_node_id": stage_node_id,
                "profile_id": profile_id,
                "join_code_id": join_code_row["id"],
                "current_stage_node_id": stage_node_id,
            },
            on_conflict="profile_id,org_id",
        )
        .select("*"),
        "Failed to register student",
    )
    if join_code_row.get("code"):
        consume_join_code(join_code_row["code"])
    _bridge_join_code_to_participant(profile_id, join_code_row)
    return result


def list_student_registrations_for_stages(org_id: str, visible_stages: list[StageNode]) -> list[dict]:
    if _use_local():
        return local.local_list_student_registrations(org_id, visible_stages)
    client = require_client()
    resp = (
        client.table("student_registrations")
        .select("*, profiles(email, display_name, name), stage_nodes(name, path, stage_type)")
        .eq("org_id", org_id)
        .execute()
    )
    rows = resp.data or []
    visible_by_id = {s.id: s for s in visible_stages}

    result = []
    for row in rows:
        stage = row.get("stage_nodes") or {}
        row_path = stage.get("path", "/")
        row_id = row.get("stage_node_id")
        if row_id in visible_by_id:
            result.append(row)
            continue
        for s in visible_stages:
            normalized = s.path if s.path.endswith("/") else s.path + "/"
            if row_path == s.path or row_path.startswith(normalized):
                result.append(row)
                break
    return result


def list_members(org_id: str) -> list[dict]:
    if _use_local():
        return local.local_list_members(org_id)
    client = require_client()
    resp = (
        client.table("org_memberships")
        .select("*, profiles(email, display_name, name), stage_nodes(name, stage_type)")
        .eq("org_id", org_id)
        .execute()
    )
    return resp.data or []


def get_user_orgs(profile_id: str) -> list[dict]:
    if _use_local():
        return local.local_get_user_orgs(profile_id)
    client = require_client()
    resp = (
        client.table("org_memberships")
        .select("*, organizations(id, name, slug)")
        .eq("profile_id", profile_id)
        .execute()
    )
    return resp.data or []


def get_org_challenge(org_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_org_challenge(org_id)
    client = require_client()
    org = get_organization(org_id)
    if not org:
        return None
    challenge_resp = (
        client.table("challenges").select("*").eq("org_id", org_id).limit(1).execute()
    )
    challenges = challenge_resp.data or []
    if not challenges:
        return {"org_id": org_id, "org_name": org["name"], "enabled": False, "stage_types": []}

    challenge = challenges[0]
    cfg_resp = (
        client.table("challenge_stage_config")
        .select("stage_type")
        .eq("challenge_id", challenge["id"])
        .eq("enabled", True)
        .order("position")
        .execute()
    )
    stage_types = [r["stage_type"] for r in (cfg_resp.data or [])]
    return {
        "org_id": org_id,
        "org_name": org["name"],
        "enabled": challenge.get("enabled", False),
        "name": challenge.get("name"),
        "stage_types": stage_types,
    }


def update_member_access(member_id: str, access: str) -> dict:
    if _use_local():
        return local.local_update_member_access(member_id, access)
    client = require_client()
    return _mutate_one(
        client.table("org_memberships")
        .update({"access": access})
        .eq("id", member_id)
        .select("*"),
        "Member not found",
    )


def get_stage_node(stage_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_stage(stage_id)
    client = require_client()
    resp = client.table("stage_nodes").select("*, organizations(name)").eq("id", stage_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def get_profile_by_email(email: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_profile_by_email(email)
    client = require_client()
    resp = client.table("profiles").select("*").eq("email", email).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def get_membership(member_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_membership(member_id)
    client = require_client()
    resp = client.table("org_memberships").select("*").eq("id", member_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def get_profile(profile_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_profile(profile_id)
    client = require_client()
    resp = client.table("profiles").select("*").eq("id", profile_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None

def add_stage_nodes(
    org_id: str, nodes: list[dict], parent_id: Optional[str] = None, program_id: Optional[str] = None
) -> list[dict]:
    if _use_local():
        return local.local_add_stage_nodes(org_id, nodes, parent_id, program_id)
    client = require_client()
    challenge_resp = client.table("challenges").select("id").eq("org_id", org_id).limit(1).execute()
    challenges = challenge_resp.data or []
    challenge_id = challenges[0]["id"] if challenges else None

    parent_path = "/"
    depth = 0
    if parent_id:
        parent_resp = client.table("stage_nodes").select("*").eq("id", parent_id).limit(1).execute()
        parent = _first_row(parent_resp.data, "Parent stage not found")
        parent_path = parent["path"]
        depth = parent.get("depth", 0) + 1
        program_id = program_id or parent.get("program_id")

    return _insert_stage_tree(org_id, challenge_id, nodes, parent_id, parent_path, depth, program_id=program_id)


# ── Integration entity (generic — not hardcoded to Discord) ─────────────────
def create_integration(
    org_id: str,
    integration_type: str,
    config: dict,
    permission_level: str,
    program_id: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_create_integration(org_id, integration_type, config, permission_level, program_id)
    client = require_client()
    return _mutate_one(
        client.table("integrations")
        .insert(
            {
                "organization_id": org_id,
                "program_id": program_id,
                "integration_type": integration_type,
                "config": config,
                "permission_level": permission_level,
            }
        )
        .select("*"),
        "Failed to create integration",
    )


def list_integrations(org_id: str) -> list[dict]:
    if _use_local():
        return local.local_list_integrations(org_id)
    client = require_client()
    resp = client.table("integrations").select("*").eq("organization_id", org_id).execute()
    return resp.data or []


# ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
_DEFAULT_SIGNUP_FIELDS: list[dict] = [
    {"key": "name", "label": "Name", "type": "text", "required": True},
    {"key": "age", "label": "Age", "type": "number", "required": False},
    {"key": "email", "label": "Email", "type": "email", "required": True},
]


def hash_api_key(raw: str) -> str:
    return local.hash_api_key(raw)


def _offering_counts(offering_id: str) -> dict:
    client = require_client()
    reg_resp = client.table("registrations").select("status").eq("offering_id", offering_id).execute()
    regs = reg_resp.data or []
    participant_resp = client.table("participants").select("id").eq("offering_id", offering_id).execute()
    return {
        "registration_count": len(regs),
        "pending_count": sum(1 for r in regs if r.get("status") == "pending_review"),
        "participant_count": len(participant_resp.data or []),
    }


def _unique_scoped_slug(table: str, scope_col: str, scope_id: str, slug_col: str, base: str) -> str:
    client = require_client()
    slug = base
    n = 0
    while True:
        resp = (
            client.table(table).select("id").eq(scope_col, scope_id).eq(slug_col, slug).limit(1).execute()
        )
        if not resp.data:
            return slug
        n += 1
        slug = f"{base}-{n}"


def create_offering(
    org_id: str,
    program_id: str,
    name: str,
    offering_type: str,
    *,
    slug: Optional[str] = None,
    stage_node_id: Optional[str] = None,
    description: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    registration_open: bool = False,
    approval_mode: str = "manual_approve",
    signup_fields: Optional[list[dict]] = None,
    platform_module: str = "nexus_only",
    registered_app_id: Optional[str] = None,
    external_runtime_url: Optional[str] = None,
    participant_label_singular: Optional[str] = None,
    participant_label_plural: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    if _use_local():
        return local.local_create_offering(
            org_id,
            program_id,
            name,
            offering_type,
            slug=slug,
            stage_node_id=stage_node_id,
            description=description,
            start_date=start_date,
            end_date=end_date,
            registration_open=registration_open,
            approval_mode=approval_mode,
            signup_fields=signup_fields,
            platform_module=platform_module,
            registered_app_id=registered_app_id,
            external_runtime_url=external_runtime_url,
            participant_label_singular=participant_label_singular,
            participant_label_plural=participant_label_plural,
            metadata=metadata,
        )
    final_slug = _unique_scoped_slug("offerings", "program_id", program_id, "slug", slug or _slugify(name))
    client = require_client()
    row = _mutate_one(
        client.table("offerings")
        .insert(
            {
                "organization_id": org_id,
                "program_id": program_id,
                "stage_node_id": stage_node_id,
                "name": name,
                "slug": final_slug,
                "offering_type": offering_type,
                "description": description,
                "start_date": start_date,
                "end_date": end_date,
                "registration_open": registration_open,
                "approval_mode": approval_mode,
                "signup_fields": signup_fields if signup_fields is not None else _DEFAULT_SIGNUP_FIELDS,
                "platform_module": platform_module,
                "registered_app_id": registered_app_id,
                "external_runtime_url": external_runtime_url,
                "participant_label_singular": participant_label_singular,
                "participant_label_plural": participant_label_plural,
                "metadata": metadata or {},
            }
        )
        .select("*"),
        "Failed to create offering",
    )
    return {**row, **_offering_counts(row["id"])}


def list_offerings(program_id: str) -> list[dict]:
    if _use_local():
        return local.local_list_offerings(program_id)
    client = require_client()
    resp = client.table("offerings").select("*").eq("program_id", program_id).execute()
    return [{**r, **_offering_counts(r["id"])} for r in (resp.data or [])]


def get_offering(offering_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_offering(offering_id)
    client = require_client()
    resp = client.table("offerings").select("*").eq("id", offering_id).limit(1).execute()
    rows = resp.data or []
    if not rows:
        return None
    return {**rows[0], **_offering_counts(offering_id)}


def update_offering(offering_id: str, patch: dict) -> dict:
    if _use_local():
        return local.local_update_offering(offering_id, patch)
    client = require_client()
    clean = {k: v for k, v in patch.items() if v is not None}
    row = _mutate_one(
        client.table("offerings").update(clean).eq("id", offering_id).select("*"),
        "Offering not found",
    )
    return {**row, **_offering_counts(offering_id)}


def set_offering_status(offering_id: str, status: str) -> dict:
    return update_offering(offering_id, {"status": status})


def create_registered_app(
    org_id: str,
    program_id: Optional[str],
    app_name: str,
    *,
    app_slug: Optional[str] = None,
    offering_id: Optional[str] = None,
    allowed_identifiers: str = "email",
    launch_url: Optional[str] = None,
    launch_context: Optional[dict] = None,
) -> tuple[dict, str]:
    if _use_local():
        return local.local_create_registered_app(
            org_id,
            program_id,
            app_name,
            app_slug=app_slug,
            offering_id=offering_id,
            allowed_identifiers=allowed_identifiers,
            launch_url=launch_url,
            launch_context=launch_context,
        )
    final_slug = _unique_scoped_slug(
        "registered_apps", "organization_id", org_id, "app_slug", app_slug or _slugify(app_name)
    )
    raw_key, key_hash, key_prefix = local.generate_api_key()
    client = require_client()
    row = _mutate_one(
        client.table("registered_apps")
        .insert(
            {
                "organization_id": org_id,
                "program_id": program_id,
                "offering_id": offering_id,
                "app_name": app_name,
                "app_slug": final_slug,
                "api_key_hash": key_hash,
                "key_prefix": key_prefix,
                "allowed_identifiers": allowed_identifiers,
                "launch_url": launch_url,
                "launch_context": launch_context or {},
            }
        )
        .select("*"),
        "Failed to register app",
    )
    return row, raw_key


def list_registered_apps(program_id: str) -> list[dict]:
    if _use_local():
        return local.local_list_registered_apps(program_id)
    client = require_client()
    resp = client.table("registered_apps").select("*").eq("program_id", program_id).execute()
    return resp.data or []


def get_registered_app(app_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_registered_app(app_id)
    client = require_client()
    resp = client.table("registered_apps").select("*").eq("id", app_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def get_registered_app_by_hash(api_key_hash: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_registered_app_by_hash(api_key_hash)
    client = require_client()
    resp = client.table("registered_apps").select("*").eq("api_key_hash", api_key_hash).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def update_registered_app(app_id: str, patch: dict) -> dict:
    if _use_local():
        return local.local_update_registered_app(app_id, patch)
    client = require_client()
    clean = {k: v for k, v in patch.items() if v is not None}
    return _mutate_one(
        client.table("registered_apps").update(clean).eq("id", app_id).select("*"),
        "Registered app not found",
    )


def rotate_app_api_key(app_id: str) -> tuple[dict, str]:
    if _use_local():
        return local.local_rotate_app_api_key(app_id)
    raw_key, key_hash, key_prefix = local.generate_api_key()
    client = require_client()
    row = _mutate_one(
        client.table("registered_apps")
        .update({"api_key_hash": key_hash, "key_prefix": key_prefix})
        .eq("id", app_id)
        .select("*"),
        "Registered app not found",
    )
    return row, raw_key


def revoke_app(app_id: str) -> dict:
    if _use_local():
        return local.local_revoke_app(app_id)
    client = require_client()
    return _mutate_one(
        client.table("registered_apps")
        .update({"status": "revoked", "api_key_hash": None})
        .eq("id", app_id)
        .select("*"),
        "Registered app not found",
    )


def create_registration(
    org_id: str,
    offering_id: str,
    *,
    program_id: Optional[str] = None,
    stage_node_id: Optional[str] = None,
    registered_app_id: Optional[str] = None,
    registration_source: str = "app_hook",
    email: Optional[str] = None,
    phone: Optional[str] = None,
    name: Optional[str] = None,
    age: Optional[int] = None,
    user_id: Optional[str] = None,
    status: str = "pending_review",
    field_data: Optional[dict] = None,
    created_by_user_id: Optional[str] = None,
) -> dict:
    if _use_local():
        return local.local_create_registration(
            org_id,
            offering_id,
            program_id=program_id,
            stage_node_id=stage_node_id,
            registered_app_id=registered_app_id,
            registration_source=registration_source,
            email=email,
            phone=phone,
            name=name,
            age=age,
            user_id=user_id,
            status=status,
            field_data=field_data,
            created_by_user_id=created_by_user_id,
        )
    client = require_client()
    return _mutate_one(
        client.table("registrations")
        .insert(
            {
                "organization_id": org_id,
                "program_id": program_id,
                "offering_id": offering_id,
                "stage_node_id": stage_node_id,
                "registered_app_id": registered_app_id,
                "registration_source": registration_source,
                "email": email,
                "phone": phone,
                "name": name,
                "age": age,
                "user_id": user_id,
                "status": status,
                "field_data": field_data or {},
                "created_by_user_id": created_by_user_id,
            }
        )
        .select("*"),
        "Failed to create registration",
    )


def get_registration(registration_id: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_registration(registration_id)
    client = require_client()
    resp = client.table("registrations").select("*").eq("id", registration_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def list_registrations(offering_id: str, status: Optional[str] = None) -> list[dict]:
    if _use_local():
        return local.local_list_registrations(offering_id, status)
    client = require_client()
    query = client.table("registrations").select("*").eq("offering_id", offering_id)
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data or []


def set_registration_status(registration_id: str, status: str, reviewed_by_user_id: Optional[str]) -> dict:
    if _use_local():
        return local.local_set_registration_status(registration_id, status, reviewed_by_user_id)
    from datetime import datetime, timezone

    client = require_client()
    return _mutate_one(
        client.table("registrations")
        .update(
            {
                "status": status,
                "reviewed_by_user_id": reviewed_by_user_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", registration_id)
        .select("*"),
        "Registration not found",
    )


def create_participant(
    org_id: str,
    offering_id: str,
    *,
    program_id: Optional[str] = None,
    stage_node_id: Optional[str] = None,
    user_id: Optional[str] = None,
    participant_type: str = "learner",
    status: str = "active",
    added_by_user_id: Optional[str] = None,
    registration_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    if _use_local():
        return local.local_create_participant(
            org_id,
            offering_id,
            program_id=program_id,
            stage_node_id=stage_node_id,
            user_id=user_id,
            participant_type=participant_type,
            status=status,
            added_by_user_id=added_by_user_id,
            registration_id=registration_id,
            metadata=metadata,
        )
    client = require_client()
    if user_id:
        existing = (
            client.table("participants")
            .select("*")
            .eq("offering_id", offering_id)
            .eq("user_id", user_id)
            .eq("participant_type", participant_type)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]
    return _mutate_one(
        client.table("participants")
        .insert(
            {
                "organization_id": org_id,
                "program_id": program_id,
                "offering_id": offering_id,
                "stage_node_id": stage_node_id,
                "user_id": user_id,
                "participant_type": participant_type,
                "status": status,
                "added_by_user_id": added_by_user_id,
                "registration_id": registration_id,
                "metadata": metadata or {},
            }
        )
        .select("*"),
        "Failed to create participant",
    )


def list_participants(offering_id: str, status: Optional[str] = None) -> list[dict]:
    if _use_local():
        return local.local_list_participants(offering_id, status)
    client = require_client()
    query = client.table("participants").select("*").eq("offering_id", offering_id)
    if status:
        query = query.eq("status", status)
    resp = query.execute()
    return resp.data or []


def approve_registration(registration_id: str, reviewer_id: Optional[str]) -> dict:
    """Mark a registration approved and create (or reuse) its participant record."""
    registration = get_registration(registration_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    registration = set_registration_status(registration_id, "approved", reviewer_id)
    participant = create_participant(
        registration["organization_id"],
        registration["offering_id"],
        program_id=registration.get("program_id"),
        stage_node_id=registration.get("stage_node_id"),
        user_id=registration.get("user_id"),
        participant_type="learner",
        added_by_user_id=reviewer_id,
        registration_id=registration["id"],
    )
    return {"registration": registration, "participant": participant}


def reject_registration(registration_id: str, reviewer_id: Optional[str]) -> dict:
    registration = get_registration(registration_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    return set_registration_status(registration_id, "rejected", reviewer_id)


# ── Audit events: who did what, when (append-only) ──────────────────────────
def record_audit_event(
    action: str,
    *,
    org_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Best-effort, never raises — an audit failure must not fail the action."""
    try:
        if _use_local():
            local.local_record_audit_event(
                action,
                org_id=org_id,
                actor_user_id=actor_user_id,
                scope_type=scope_type,
                scope_id=scope_id,
                target_type=target_type,
                target_id=target_id,
                metadata=metadata,
            )
            return
        client = require_client()
        client.table("audit_events").insert(
            {
                "organization_id": org_id,
                "actor_user_id": actor_user_id,
                "action": action,
                "scope_type": scope_type,
                "scope_id": scope_id,
                "target_type": target_type,
                "target_id": target_id,
                "metadata": metadata or {},
            }
        ).execute()
    except Exception:
        pass


def list_audit_events(org_id: str, limit: int = 50) -> list[dict]:
    if _use_local():
        return local.local_list_audit_events(org_id, limit)
    client = require_client()
    resp = (
        client.table("audit_events")
        .select("*")
        .eq("organization_id", org_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data or []


# ── Entitlements: module access grants for orgs/programs/offerings ──────────
def list_entitlements(org_id: str) -> list[dict]:
    if _use_local():
        return local.local_list_entitlements(org_id)
    client = require_client()
    resp = client.table("entitlements").select("*").eq("organization_id", org_id).execute()
    return resp.data or []


def set_entitlement(
    org_id: str,
    module: str,
    status: str,
    *,
    subject_type: str = "organization",
    subject_id: Optional[str] = None,
    limits: Optional[dict] = None,
) -> dict:
    if _use_local():
        return local.local_set_entitlement(
            org_id, module, status, subject_type=subject_type, subject_id=subject_id, limits=limits
        )
    client = require_client()
    row = {
        "organization_id": org_id,
        "subject_type": subject_type,
        "subject_id": subject_id or org_id,
        "module": module,
        "status": status,
    }
    if limits is not None:
        row["limits"] = limits
    return _mutate_one(
        client.table("entitlements").upsert(row, on_conflict="subject_type,subject_id,module").select("*"),
        "Failed to set entitlement",
    )


def ensure_default_entitlements(org_id: str) -> list[dict]:
    """Seed org-level grants for every module if the org has none yet. Keeps
    pre-entitlement orgs working: modules default to enabled, admins opt out."""
    existing = list_entitlements(org_id)
    if existing:
        return existing
    for module in ("nexus", "learning", "coaching", "analytics"):
        set_entitlement(org_id, module, "active")
    return list_entitlements(org_id)


def check_module_access(org_id: str, module: str) -> bool:
    """Org-level module gate. An org with no entitlement rows at all is treated
    as unconfigured → permissive (legacy orgs keep working); once any rows
    exist, the module needs an active/trial org-level grant."""
    if module in (None, "", "nexus", "nexus_only", "mixed"):
        return True
    # Bridge is a coaching mode, not a module (Decision 7).
    if module == "bridge":
        module = "coaching"
    rows = list_entitlements(org_id)
    if not rows:
        return True
    for r in rows:
        if (
            r.get("subject_type") == "organization"
            and r.get("module") == module
            and r.get("status") in ("active", "trial")
        ):
            return True
    return False


def create_launch_token(registered_app_id: str, user_id: str, ttl_seconds: int = 60) -> tuple[dict, str]:
    if _use_local():
        return local.local_create_launch_token(registered_app_id, user_id, ttl_seconds)
    from datetime import datetime, timedelta, timezone

    raw_key, key_hash, _ = local.generate_api_key()
    client = require_client()
    row = _mutate_one(
        client.table("app_launch_tokens")
        .insert(
            {
                "token_hash": key_hash,
                "registered_app_id": registered_app_id,
                "user_id": user_id,
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat(),
            }
        )
        .select("*"),
        "Failed to create launch token",
    )
    return row, raw_key


def consume_launch_token(raw_token: str) -> Optional[dict]:
    if _use_local():
        return local.local_consume_launch_token(raw_token)
    from datetime import datetime, timezone

    client = require_client()
    token_hash = local.hash_api_key(raw_token)
    resp = client.table("app_launch_tokens").select("*").eq("token_hash", token_hash).limit(1).execute()
    rows = resp.data or []
    if not rows or rows[0].get("used_at"):
        return None
    row = rows[0]
    expires_at = row.get("expires_at")
    if expires_at and expires_at < datetime.now(timezone.utc).isoformat():
        return None
    return _mutate_one(
        client.table("app_launch_tokens")
        .update({"used_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", row["id"])
        .select("*"),
        "Failed to consume launch token",
    )
