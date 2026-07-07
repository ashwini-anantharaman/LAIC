"""Local JSON fallback for platform tables when Supabase schema is not migrated."""

from __future__ import annotations

import json
import re
import secrets
import string
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException

from .platform_permissions import StageNode

_DATA = Path(__file__).parent.parent / ".local_data"
_ALPHABET = string.ascii_uppercase + string.digits


def _read(name: str) -> list[dict[str, Any]]:
    path = _DATA / f"platform_{name}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def _write(name: str, rows: list[dict[str, Any]]) -> None:
    _DATA.mkdir(parents=True, exist_ok=True)
    (_DATA / f"platform_{name}.json").write_text(json.dumps(rows, indent=2))


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"


def _unique_slug(base: str) -> str:
    rows = _read("organizations")
    slug = base
    n = 0
    while any(r.get("slug") == slug for r in rows):
        n += 1
        slug = f"{base}-{n}"
    return slug


def _make_code(length: int = 8) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if not any(r.get("code") == code for r in _read("join_codes")):
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique join code")


def local_create_profile(
    user_id: str,
    email: str,
    role: str,
    display_name: Optional[str] = None,
) -> dict:
    rows = _read("profiles")
    row = {
        "id": user_id,
        "email": email,
        "role": role,
        "display_name": display_name or email.split("@")[0],
        "name": display_name or email.split("@")[0],
    }
    rows = [r for r in rows if r["id"] != user_id]
    rows.append(row)
    _write("profiles", rows)
    return row


def local_get_profile(user_id: str) -> Optional[dict]:
    for row in _read("profiles"):
        if row["id"] == user_id:
            return row
    return None


def local_create_organization(name: str, owner_id: str) -> dict:
    slug = _unique_slug(_slugify(name))
    org = {"id": str(uuid4()), "name": name, "slug": slug, "owner_id": owner_id, "settings": {}}
    orgs = _read("organizations")
    orgs.append(org)
    _write("organizations", orgs)

    memberships = _read("memberships")
    memberships.append(
        {
            "id": str(uuid4()),
            "org_id": org["id"],
            "profile_id": owner_id,
            "role": "owner",
            "stage_node_id": None,
            "access": "edit",
        }
    )
    _write("memberships", memberships)

    profiles = _read("profiles")
    for p in profiles:
        if p["id"] == owner_id:
            p["role"] = "org_admin"
    _write("profiles", profiles)
    return org


def local_get_organization(org_id: str) -> Optional[dict]:
    for row in _read("organizations"):
        if row["id"] == org_id:
            return row
    return None


def local_get_memberships(profile_id: str) -> list[dict]:
    return [m for m in _read("memberships") if m.get("profile_id") == profile_id]


def local_list_stage_nodes(org_id: str) -> list[StageNode]:
    result = []
    for row in _read("stage_nodes"):
        if row.get("org_id") == org_id:
            result.append(
                StageNode(
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
            )
    return sorted(result, key=lambda s: (s.depth, s.name))


def local_setup_organization(org_id: str, payload: dict) -> dict:
    challenges = _read("challenges")
    challenges = [c for c in challenges if c.get("org_id") != org_id]
    challenge_id = str(uuid4())
    challenges.append(
        {
            "id": challenge_id,
            "org_id": org_id,
            "enabled": payload.get("has_challenge", False),
            "name": payload.get("challenge_name"),
        }
    )
    _write("challenges", challenges)

    if payload.get("has_challenge"):
        stage_types = payload.get("stage_types") or []
        cfg_rows = [c for c in _read("challenge_stage_config") if c.get("challenge_id") != challenge_id]
        for i, st in enumerate(stage_types):
            cfg_rows.append(
                {"id": str(uuid4()), "challenge_id": challenge_id, "stage_type": st, "position": i, "enabled": True}
            )
        _write("challenge_stage_config", cfg_rows)

        existing = [s for s in _read("stage_nodes") if s.get("org_id") == org_id]
        if not existing:
            _insert_stage_tree_local(org_id, challenge_id, payload.get("initial_stages") or [])

    defaults = payload.get("permission_defaults") or {}
    perm_rows = [p for p in _read("permission_defaults") if p.get("org_id") != org_id]
    for role, cfg in defaults.items():
        perm_rows.append(
            {
                "id": str(uuid4()),
                "org_id": org_id,
                "role": role,
                "default_access": cfg.get("default_access", "view"),
                "per_level_overrides": cfg.get("per_level_overrides") or {},
            }
        )
    _write("permission_defaults", perm_rows)

    if payload.get("discord_link"):
        orgs = _read("organizations")
        for org in orgs:
            if org["id"] == org_id:
                org["settings"] = {"discord_link": payload["discord_link"]}
        _write("organizations", orgs)

    return {"org_id": org_id, "challenge_id": challenge_id}


def _insert_stage_tree_local(
    org_id: str,
    challenge_id: Optional[str],
    nodes: list[dict],
    parent_id: Optional[str] = None,
    parent_path: str = "/",
    depth: int = 0,
) -> list[dict]:
    stages = _read("stage_nodes")
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
            "qualifier_status": "pending",
        }
        stages.append(row)
        created.append(row)
        children = node_input.get("children") or []
        if children:
            created.extend(_insert_stage_tree_local(org_id, challenge_id, children, stage_id, path, depth + 1))
    _write("stage_nodes", stages)
    return created


def local_get_org_challenge(org_id: str) -> Optional[dict]:
    org = local_get_organization(org_id)
    if not org:
        return None
    challenges = [c for c in _read("challenges") if c.get("org_id") == org_id]
    if not challenges:
        return {"org_id": org_id, "org_name": org["name"], "enabled": False, "stage_types": []}
    challenge = challenges[0]
    cfg = [
        c["stage_type"]
        for c in _read("challenge_stage_config")
        if c.get("challenge_id") == challenge["id"] and c.get("enabled", True)
    ]
    cfg.sort(key=lambda st: ["international", "national", "state", "chapter"].index(st) if st in ["international", "national", "state", "chapter"] else 99)
    return {
        "org_id": org_id,
        "org_name": org["name"],
        "enabled": challenge.get("enabled", False),
        "name": challenge.get("name"),
        "stage_types": cfg,
    }


def local_list_student_registrations(org_id: str, visible_stages: list[StageNode]) -> list[dict]:
    visible_by_id = {s.id: s for s in visible_stages}
    profiles = {p["id"]: p for p in _read("profiles")}
    stages = {s["id"]: s for s in _read("stage_nodes")}
    result = []
    for row in _read("student_registrations"):
        if row.get("org_id") != org_id:
            continue
        stage_id = row.get("stage_node_id")
        stage = stages.get(stage_id or "", {})
        stage_path = stage.get("path", row.get("stage_path", "/"))
        include = False
        if stage_id in visible_by_id:
            include = True
        else:
            for s in visible_stages:
                normalized = s.path if s.path.endswith("/") else s.path + "/"
                if stage_path == s.path or stage_path.startswith(normalized):
                    include = True
                    break
        if not include:
            continue
        profile = profiles.get(row.get("profile_id"), {})
        result.append(
            {
                **row,
                "profiles": {
                    "email": profile.get("email"),
                    "display_name": profile.get("display_name"),
                    "name": profile.get("name"),
                },
                "stage_nodes": {
                    "name": stage.get("name", ""),
                    "path": stage.get("path", "/"),
                    "stage_type": stage.get("stage_type"),
                },
            }
        )
    return result


def local_get_join_code(code: str) -> Optional[dict]:
    for row in _read("join_codes"):
        if row.get("code") == code.strip().upper() and row.get("active", True):
            stages = {s["id"]: s for s in _read("stage_nodes")}
            orgs = {o["id"]: o for o in _read("organizations")}
            stage = stages.get(row.get("stage_node_id") or "", {})
            org = orgs.get(row.get("org_id") or "", {})
            return {
                **row,
                "stage_nodes": {"name": stage.get("name", ""), "stage_type": stage.get("stage_type")},
                "organizations": {"name": org.get("name", "")},
            }
    return None


def local_register_student(profile_id: str, join_code_row: dict, display_name: Optional[str] = None) -> dict:
    if display_name:
        profiles = _read("profiles")
        for p in profiles:
            if p["id"] == profile_id:
                p["display_name"] = display_name
                p["name"] = display_name
                p["role"] = "student"
        _write("profiles", profiles)

    regs = _read("student_registrations")
    regs = [r for r in regs if not (r.get("profile_id") == profile_id and r.get("org_id") == join_code_row["org_id"])]
    row = {
        "id": str(uuid4()),
        "org_id": join_code_row["org_id"],
        "stage_node_id": join_code_row["stage_node_id"],
        "profile_id": profile_id,
        "join_code_id": join_code_row.get("id"),
        "current_stage_node_id": join_code_row["stage_node_id"],
        "registered_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    regs.append(row)
    _write("student_registrations", regs)
    return row


def local_get_stage(stage_id: str) -> Optional[dict]:
    for row in _read("stage_nodes"):
        if row["id"] == stage_id:
            orgs = {o["id"]: o for o in _read("organizations")}
            org = orgs.get(row.get("org_id"), {})
            return {**row, "organizations": {"name": org.get("name", "")}}
    return None


def local_get_profile_by_email(email: str) -> Optional[dict]:
    for row in _read("profiles"):
        if row.get("email", "").lower() == email.lower():
            return row
    return None


def local_get_membership(member_id: str) -> Optional[dict]:
    for row in _read("memberships"):
        if row["id"] == member_id:
            return row
    return None


def local_create_join_code(stage_node_id: str, kind: str) -> dict:
    stages = _read("stage_nodes")
    stage = next((s for s in stages if s["id"] == stage_node_id), None)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    code = _make_code()
    row = {
        "id": str(uuid4()),
        "org_id": stage["org_id"],
        "stage_node_id": stage_node_id,
        "code": code,
        "kind": kind,
        "active": True,
    }
    codes = _read("join_codes")
    codes.append(row)
    _write("join_codes", codes)
    return row


def local_add_membership(
    org_id: str,
    profile_id: str,
    role: str,
    stage_node_id: Optional[str],
    access: str,
) -> dict:
    row = {
        "id": str(uuid4()),
        "org_id": org_id,
        "profile_id": profile_id,
        "role": role,
        "stage_node_id": stage_node_id,
        "access": access,
    }
    memberships = _read("memberships")
    memberships.append(row)
    _write("memberships", memberships)
    return row


def local_list_members(org_id: str) -> list[dict]:
    profiles = {p["id"]: p for p in _read("profiles")}
    stages = {s["id"]: s for s in _read("stage_nodes")}
    result = []
    for m in _read("memberships"):
        if m.get("org_id") != org_id:
            continue
        profile = profiles.get(m.get("profile_id"), {})
        stage = stages.get(m.get("stage_node_id") or "", {})
        result.append(
            {
                **m,
                "profiles": {
                    "email": profile.get("email"),
                    "display_name": profile.get("display_name"),
                    "name": profile.get("name"),
                },
                "stage_nodes": {
                    "name": stage.get("name"),
                    "stage_type": stage.get("stage_type"),
                }
                if stage
                else None,
            }
        )
    return result


def local_get_user_orgs(profile_id: str) -> list[dict]:
    orgs = {o["id"]: o for o in _read("organizations")}
    result = []
    for m in _read("memberships"):
        if m.get("profile_id") != profile_id:
            continue
        org = orgs.get(m.get("org_id"), {})
        result.append(
            {
                **m,
                "organizations": {
                    "id": org.get("id"),
                    "name": org.get("name"),
                    "slug": org.get("slug"),
                },
            }
        )
    return result


def local_update_member_access(member_id: str, access: str) -> dict:
    memberships = _read("memberships")
    for m in memberships:
        if m["id"] == member_id:
            m["access"] = access
            _write("memberships", memberships)
            return m
    raise HTTPException(status_code=404, detail="Member not found")


def local_add_stage_nodes(org_id: str, nodes: list[dict], parent_id: Optional[str] = None) -> list[dict]:
    challenges = [c for c in _read("challenges") if c.get("org_id") == org_id]
    challenge_id = challenges[0]["id"] if challenges else None
    parent_path = "/"
    depth = 0
    if parent_id:
        parent = next((s for s in _read("stage_nodes") if s["id"] == parent_id), None)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent stage not found")
        parent_path = parent["path"]
        depth = parent.get("depth", 0) + 1
    return _insert_stage_tree_local(org_id, challenge_id, nodes, parent_id, parent_path, depth)
