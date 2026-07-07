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


def get_join_code(code: str) -> Optional[dict]:
    if _use_local():
        return local.local_get_join_code(code)
    client = require_client()
    resp = (
        client.table("join_codes")
        .select("*, stage_nodes(name, stage_type), organizations(name)")
        .eq("code", code.strip().upper())
        .eq("active", True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _insert_stage_tree(
    org_id: str,
    challenge_id: Optional[str],
    nodes: list[dict],
    parent_id: Optional[str] = None,
    parent_path: str = "/",
    depth: int = 0,
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
                    org_id, challenge_id, children, stage_id, path, depth + 1
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
        client.table("organizations").update(
            {"settings": {"discord_link": payload["discord_link"]}}
        ).eq("id", org_id).execute()

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


def create_join_code(stage_node_id: str, kind: str) -> dict:
    if _use_local():
        return local.local_create_join_code(stage_node_id, kind)
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
            }
        )
        .select("*"),
        "Failed to create join code",
    )


def add_membership(
    org_id: str,
    profile_id: str,
    role: str,
    stage_node_id: Optional[str],
    access: str,
) -> dict:
    if _use_local():
        return local.local_add_membership(org_id, profile_id, role, stage_node_id, access)
    client = require_client()
    return _mutate_one(
        client.table("org_memberships")
        .insert(
            {
                "org_id": org_id,
                "profile_id": profile_id,
                "role": role,
                "stage_node_id": stage_node_id,
                "access": access,
            }
        )
        .select("*"),
        "Failed to add membership",
    )


def register_student(profile_id: str, join_code_row: dict, display_name: Optional[str] = None) -> dict:
    if _use_local():
        return local.local_register_student(profile_id, join_code_row, display_name)
    client = require_client()
    org_id = join_code_row["org_id"]
    stage_node_id = join_code_row["stage_node_id"]

    if display_name:
        client.table("profiles").update({"display_name": display_name, "name": display_name}).eq(
            "id", profile_id
        ).execute()

    client.table("profiles").update({"role": "student"}).eq("id", profile_id).execute()

    return _mutate_one(
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


def list_student_registrations_for_stages(org_id: str, visible_stages: list[StageNode]) -> list[dict]:
    if _use_local():
        return local.local_list_student_registrations(org_id, visible_stages)
    client = require_client()
    resp = (
        client.table("student_registrations")
        # Disambiguate: student_registrations has two FKs to stage_nodes
        # (stage_node_id and current_stage_node_id). Embed via stage_node_id.
        .select(
            "*, profiles(email, display_name, name), "
            "stage_nodes!student_registrations_stage_node_id_fkey(name, path, stage_type)"
        )
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

def add_stage_nodes(org_id: str, nodes: list[dict], parent_id: Optional[str] = None) -> list[dict]:
    if _use_local():
        return local.local_add_stage_nodes(org_id, nodes, parent_id)
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

    return _insert_stage_tree(org_id, challenge_id, nodes, parent_id, parent_path, depth)
