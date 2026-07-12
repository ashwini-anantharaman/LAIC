"""Local JSON fallback for platform tables when Supabase schema is not migrated."""

from __future__ import annotations

import json
import re
import secrets
import string
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException

from .platform_permissions import StageNode

_DATA = Path(__file__).parent.parent / ".local_data"
_ALPHABET = string.ascii_uppercase + string.digits
_ROLE_ALIASES = {"teacher": "instructor"}


def _normalize_role(role: Optional[str]) -> Optional[str]:
    return _ROLE_ALIASES.get(role, role)


def _read_learning(name: str) -> list[dict[str, Any]]:
    """Read a learning-platform local table (unprefixed .local_data/<name>.json)."""
    path = _DATA / f"{name}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def _migrate_legacy_roles() -> None:
    """One-time pass: rewrite any legacy role: 'teacher' rows to 'instructor'."""
    changed = False
    memberships = _read("memberships")
    for m in memberships:
        if m.get("role") in _ROLE_ALIASES:
            m["role"] = _normalize_role(m["role"])
            changed = True
    if changed:
        _write("memberships", memberships)


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


import hashlib


def _hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def local_auth_create_user(email: str, password: str) -> dict:
    """Create a local auth user (demo mode, no Supabase). Token == user id."""
    users = _read("auth_users")
    if any(u.get("email", "").lower() == email.lower() for u in users):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {"id": str(uuid4()), "email": email, "password_hash": _hash_pw(password)}
    users.append(user)
    _write("auth_users", users)
    return {"id": user["id"], "email": email}


def local_auth_sign_in(email: str, password: str) -> dict:
    for u in _read("auth_users"):
        if u.get("email", "").lower() == email.lower() and u.get("password_hash") == _hash_pw(password):
            return {"id": u["id"], "email": u["email"], "access_token": u["id"]}
    raise HTTPException(status_code=401, detail="Invalid credentials")


def local_auth_get_user(token: str) -> Optional[dict]:
    for u in _read("auth_users"):
        if u["id"] == token:
            return {"id": u["id"], "email": u["email"]}
    return None


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


def local_update_org_theme(org_id: str, accent_color: Optional[str], logo_url: Optional[str]) -> dict:
    orgs = _read("organizations")
    for org in orgs:
        if org["id"] == org_id:
            settings = dict(org.get("settings") or {})
            theme = dict(settings.get("theme") or {})
            if accent_color is not None:
                theme["accent_color"] = accent_color
            if logo_url is not None:
                theme["logo_url"] = logo_url
            settings["theme"] = theme
            org["settings"] = settings
            _write("organizations", orgs)
            return org
    raise HTTPException(status_code=404, detail="Organization not found")


def local_create_program(
    org_id: str,
    name: str,
    category: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    instructor_label: Optional[str] = None,
    learner_label: Optional[str] = None,
) -> dict:
    row = {
        "id": str(uuid4()),
        "org_id": org_id,
        "name": name,
        "category": category,
        "description": description,
        "icon": icon,
        "instructor_label": instructor_label,
        "learner_label": learner_label,
    }
    programs = _read("programs")
    programs.append(row)
    _write("programs", programs)
    return row


def _program_counts(program_id: str) -> dict:
    """Best-effort course/learner/instructor counts for a program's workspace card."""
    program_stage_ids = {s["id"] for s in _read("stage_nodes") if s.get("program_id") == program_id}
    instructor_count = sum(
        1
        for m in _read("memberships")
        if m.get("program_id") == program_id and _normalize_role(m.get("role")) == "instructor"
    )
    learner_count = sum(
        1
        for r in _read("student_registrations")
        if r.get("stage_node_id") in program_stage_ids
    )
    course_count = sum(
        1
        for c in _read_learning("courses")
        if c.get("stage_node_id") in program_stage_ids
    )
    return {
        "course_count": course_count,
        "learner_count": learner_count,
        "instructor_count": instructor_count,
    }


def local_list_programs(org_id: str) -> list[dict]:
    return [{**p, **_program_counts(p["id"])} for p in _read("programs") if p.get("org_id") == org_id]


def local_get_program(program_id: str) -> Optional[dict]:
    for row in _read("programs"):
        if row["id"] == program_id:
            return {**row, **_program_counts(program_id)}
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
                    program_id=row.get("program_id"),
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
                settings = dict(org.get("settings") or {})
                settings["discord_link"] = payload["discord_link"]
                org["settings"] = settings
        _write("organizations", orgs)
        local_create_integration(
            org_id,
            "discord",
            {"server_url": payload["discord_link"]},
            payload.get("discord_permission_level") or "per_level",
        )

    for prog in payload.get("programs") or []:
        program_row = local_create_program(
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
            _insert_stage_tree_local(
                org_id,
                challenge_id,
                [{"stage_type": stage_type, "name": prog["name"]}],
                program_id=program_row["id"],
            )
        else:
            class_names = prog.get("class_names") or []
            if class_names:
                _insert_stage_tree_local(
                    org_id,
                    None,
                    [{"stage_type": "chapter", "name": cn} for cn in class_names],
                    program_id=program_row["id"],
                )

    return {"org_id": org_id, "challenge_id": challenge_id}


def _insert_stage_tree_local(
    org_id: str,
    challenge_id: Optional[str],
    nodes: list[dict],
    parent_id: Optional[str] = None,
    parent_path: str = "/",
    depth: int = 0,
    program_id: Optional[str] = None,
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
            "program_id": program_id or node_input.get("program_id"),
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
            created.extend(
                _insert_stage_tree_local(
                    org_id, challenge_id, children, stage_id, path, depth + 1, program_id=program_id
                )
            )
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
        if row.get("code") != code.strip().upper() or not row.get("active", True):
            continue
        uses_remaining = row.get("uses_remaining")
        if uses_remaining is not None and uses_remaining <= 0:
            continue
        expires_at = row.get("expires_at")
        if expires_at:
            try:
                if datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                    continue
            except ValueError:
                pass
        stages = {s["id"]: s for s in _read("stage_nodes")}
        orgs = {o["id"]: o for o in _read("organizations")}
        programs = {p["id"]: p for p in _read("programs")}
        stage = stages.get(row.get("stage_node_id") or "", {})
        org = orgs.get(row.get("org_id") or "", {})
        program = programs.get(row.get("program_id") or "", {})
        return {
            **row,
            "stage_nodes": {"name": stage.get("name", ""), "stage_type": stage.get("stage_type")},
            "organizations": {"name": org.get("name", "")},
            "programs": {"name": program.get("name", ""), "category": program.get("category")}
            if program
            else None,
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
        "registered_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    regs.append(row)
    _write("student_registrations", regs)
    if join_code_row.get("code"):
        local_consume_join_code(join_code_row["code"])
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


def local_create_join_code(
    stage_node_id: str,
    kind: str,
    delivery_method: str = "join_code",
    email: Optional[str] = None,
    max_uses: Optional[int] = None,
    expires_at: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
) -> dict:
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
        "delivery_method": delivery_method,
        "email": email,
        "max_uses": max_uses,
        "uses_remaining": max_uses,
        "expires_at": expires_at,
        "created_by_user_id": created_by_user_id,
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
    program_id: Optional[str] = None,
) -> dict:
    row = {
        "id": str(uuid4()),
        "org_id": org_id,
        "profile_id": profile_id,
        "role": _normalize_role(role),
        "stage_node_id": stage_node_id,
        "access": access,
        "program_id": program_id,
    }
    memberships = _read("memberships")
    memberships.append(row)
    _write("memberships", memberships)
    return row


def local_create_program_join_code(
    program_id: str,
    kind: str,
    delivery_method: str = "join_code",
    email: Optional[str] = None,
    max_uses: Optional[int] = None,
    expires_at: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
) -> dict:
    program = next((p for p in _read("programs") if p["id"] == program_id), None)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    code = _make_code()
    row = {
        "id": str(uuid4()),
        "org_id": program["org_id"],
        "stage_node_id": None,
        "program_id": program_id,
        "code": code,
        "kind": kind,
        "active": True,
        "delivery_method": delivery_method,
        "email": email,
        "max_uses": max_uses,
        "uses_remaining": max_uses,
        "expires_at": expires_at,
        "created_by_user_id": created_by_user_id,
    }
    codes = _read("join_codes")
    codes.append(row)
    _write("join_codes", codes)
    return row


def local_consume_join_code(code: str) -> None:
    """Decrement uses_remaining for a code with a usage limit, if set."""
    codes = _read("join_codes")
    for row in codes:
        if row.get("code") == code.strip().upper():
            if row.get("uses_remaining") is not None:
                row["uses_remaining"] = max(0, row["uses_remaining"] - 1)
                if row["uses_remaining"] == 0:
                    row["active"] = False
            _write("join_codes", codes)
            return


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


def local_add_stage_nodes(
    org_id: str, nodes: list[dict], parent_id: Optional[str] = None, program_id: Optional[str] = None
) -> list[dict]:
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
        program_id = program_id or parent.get("program_id")
    return _insert_stage_tree_local(org_id, challenge_id, nodes, parent_id, parent_path, depth, program_id=program_id)


# ── Integration entity (generic — not hardcoded to Discord) ─────────────────
def local_create_integration(
    org_id: str,
    integration_type: str,
    config: dict,
    permission_level: str,
    program_id: Optional[str] = None,
) -> dict:
    row = {
        "id": str(uuid4()),
        "organization_id": org_id,
        "program_id": program_id,
        "integration_type": integration_type,
        "config": config,
        "permission_level": permission_level,
        "status": "active",
    }
    rows = _read("integrations")
    rows.append(row)
    _write("integrations", rows)
    return row


def local_list_integrations(org_id: str) -> list[dict]:
    return [r for r in _read("integrations") if r.get("organization_id") == org_id]


# ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
_DEFAULT_SIGNUP_FIELDS: list[dict] = [
    {"key": "name", "label": "Name", "type": "text", "required": True},
    {"key": "age", "label": "Age", "type": "number", "required": False},
    {"key": "email", "label": "Email", "type": "email", "required": True},
]


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    raw = "nxk_" + secrets.token_urlsafe(32)
    return raw, hash_api_key(raw), raw[:12]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _unique_offering_slug(program_id: str, base: str) -> str:
    rows = _read("offerings")
    slug = base
    n = 0
    while any(r.get("program_id") == program_id and r.get("slug") == slug for r in rows):
        n += 1
        slug = f"{base}-{n}"
    return slug


def _unique_app_slug(org_id: str, base: str) -> str:
    rows = _read("registered_apps")
    slug = base
    n = 0
    while any(r.get("organization_id") == org_id and r.get("app_slug") == slug for r in rows):
        n += 1
        slug = f"{base}-{n}"
    return slug


def _offering_counts(offering_id: str) -> dict:
    regs = [r for r in _read("registrations") if r.get("offering_id") == offering_id]
    pending = sum(1 for r in regs if r.get("status") == "pending_review")
    participants = sum(1 for p in _read("participants") if p.get("offering_id") == offering_id)
    return {"registration_count": len(regs), "pending_count": pending, "participant_count": participants}


def local_create_offering(
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
    final_slug = _unique_offering_slug(program_id, slug or _slugify(name))
    now = _now_iso()
    row = {
        "id": str(uuid4()),
        "organization_id": org_id,
        "program_id": program_id,
        "stage_node_id": stage_node_id,
        "name": name,
        "slug": final_slug,
        "offering_type": offering_type,
        "status": "draft",
        "description": description,
        "start_date": start_date,
        "end_date": end_date,
        "registration_open": registration_open,
        "approval_mode": approval_mode,
        "signup_fields": signup_fields if signup_fields is not None else list(_DEFAULT_SIGNUP_FIELDS),
        "platform_module": platform_module,
        "registered_app_id": registered_app_id,
        "external_runtime_url": external_runtime_url,
        "participant_label_singular": participant_label_singular,
        "participant_label_plural": participant_label_plural,
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
    }
    rows = _read("offerings")
    rows.append(row)
    _write("offerings", rows)
    return {**row, **_offering_counts(row["id"])}


def local_list_offerings(program_id: str) -> list[dict]:
    return [
        {**r, **_offering_counts(r["id"])} for r in _read("offerings") if r.get("program_id") == program_id
    ]


def local_get_offering(offering_id: str) -> Optional[dict]:
    for row in _read("offerings"):
        if row["id"] == offering_id:
            return {**row, **_offering_counts(offering_id)}
    return None


def local_update_offering(offering_id: str, patch: dict) -> dict:
    rows = _read("offerings")
    for row in rows:
        if row["id"] == offering_id:
            row.update({k: v for k, v in patch.items() if v is not None})
            row["updated_at"] = _now_iso()
            _write("offerings", rows)
            return {**row, **_offering_counts(offering_id)}
    raise HTTPException(status_code=404, detail="Offering not found")


def local_set_offering_status(offering_id: str, status: str) -> dict:
    return local_update_offering(offering_id, {"status": status})


def local_create_registered_app(
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
    final_slug = _unique_app_slug(org_id, app_slug or _slugify(app_name))
    raw_key, key_hash, key_prefix = generate_api_key()
    now = _now_iso()
    row = {
        "id": str(uuid4()),
        "organization_id": org_id,
        "program_id": program_id,
        "offering_id": offering_id,
        "app_name": app_name,
        "app_slug": final_slug,
        "api_key_hash": key_hash,
        "key_prefix": key_prefix,
        "allowed_identifiers": allowed_identifiers,
        "status": "active",
        "launch_url": launch_url,
        "launch_context": launch_context or {},
        "created_at": now,
        "updated_at": now,
    }
    rows = _read("registered_apps")
    rows.append(row)
    _write("registered_apps", rows)
    return row, raw_key


def local_list_registered_apps(program_id: str) -> list[dict]:
    return [r for r in _read("registered_apps") if r.get("program_id") == program_id]


def local_get_registered_app(app_id: str) -> Optional[dict]:
    for row in _read("registered_apps"):
        if row["id"] == app_id:
            return row
    return None


def local_get_registered_app_by_hash(api_key_hash: str) -> Optional[dict]:
    for row in _read("registered_apps"):
        if row.get("api_key_hash") == api_key_hash:
            return row
    return None


def local_update_registered_app(app_id: str, patch: dict) -> dict:
    rows = _read("registered_apps")
    for row in rows:
        if row["id"] == app_id:
            row.update({k: v for k, v in patch.items() if v is not None})
            row["updated_at"] = _now_iso()
            _write("registered_apps", rows)
            return row
    raise HTTPException(status_code=404, detail="Registered app not found")


def local_rotate_app_api_key(app_id: str) -> tuple[dict, str]:
    rows = _read("registered_apps")
    for row in rows:
        if row["id"] == app_id:
            raw_key, key_hash, key_prefix = generate_api_key()
            row["api_key_hash"] = key_hash
            row["key_prefix"] = key_prefix
            row["updated_at"] = _now_iso()
            _write("registered_apps", rows)
            return row, raw_key
    raise HTTPException(status_code=404, detail="Registered app not found")


def local_revoke_app(app_id: str) -> dict:
    rows = _read("registered_apps")
    for row in rows:
        if row["id"] == app_id:
            row["status"] = "revoked"
            row["api_key_hash"] = None
            row["updated_at"] = _now_iso()
            _write("registered_apps", rows)
            return row
    raise HTTPException(status_code=404, detail="Registered app not found")


def local_create_registration(
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
    row = {
        "id": str(uuid4()),
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
        "reviewed_by_user_id": None,
        "reviewed_at": None,
        "created_by_user_id": created_by_user_id,
        "created_at": _now_iso(),
    }
    rows = _read("registrations")
    rows.append(row)
    _write("registrations", rows)
    return row


def local_get_registration(registration_id: str) -> Optional[dict]:
    for row in _read("registrations"):
        if row["id"] == registration_id:
            return row
    return None


def local_list_registrations(offering_id: str, status: Optional[str] = None) -> list[dict]:
    rows = [r for r in _read("registrations") if r.get("offering_id") == offering_id]
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return rows


def local_set_registration_status(registration_id: str, status: str, reviewed_by_user_id: Optional[str]) -> dict:
    rows = _read("registrations")
    for row in rows:
        if row["id"] == registration_id:
            row["status"] = status
            row["reviewed_by_user_id"] = reviewed_by_user_id
            row["reviewed_at"] = _now_iso()
            _write("registrations", rows)
            return row
    raise HTTPException(status_code=404, detail="Registration not found")


def local_create_participant(
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
    rows = _read("participants")
    if user_id:
        for row in rows:
            if (
                row.get("offering_id") == offering_id
                and row.get("user_id") == user_id
                and row.get("participant_type") == participant_type
            ):
                return row
    row = {
        "id": str(uuid4()),
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
        "created_at": _now_iso(),
    }
    rows.append(row)
    _write("participants", rows)
    return row


def local_list_participants(offering_id: str, status: Optional[str] = None) -> list[dict]:
    rows = [r for r in _read("participants") if r.get("offering_id") == offering_id]
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return rows


# ── Audit events: who did what, when (append-only) ──────────────────────────
def local_record_audit_event(
    action: str,
    *,
    org_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    row = {
        "id": str(uuid4()),
        "organization_id": org_id,
        "actor_user_id": actor_user_id,
        "action": action,
        "scope_type": scope_type,
        "scope_id": scope_id,
        "target_type": target_type,
        "target_id": target_id,
        "metadata": metadata or {},
        "created_at": _now_iso(),
    }
    rows = _read("audit_events")
    rows.append(row)
    _write("audit_events", rows)
    return row


def local_list_audit_events(org_id: str, limit: int = 50) -> list[dict]:
    rows = [r for r in _read("audit_events") if r.get("organization_id") == org_id]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows[:limit]


# ── Entitlements: module access grants for orgs/programs/offerings ──────────
def local_list_entitlements(org_id: str) -> list[dict]:
    return [r for r in _read("entitlements") if r.get("organization_id") == org_id]


def local_set_entitlement(
    org_id: str,
    module: str,
    status: str,
    *,
    subject_type: str = "organization",
    subject_id: Optional[str] = None,
    limits: Optional[dict] = None,
) -> dict:
    subject = subject_id or org_id
    rows = _read("entitlements")
    for row in rows:
        if (
            row.get("subject_type") == subject_type
            and row.get("subject_id") == subject
            and row.get("module") == module
        ):
            row["status"] = status
            if limits is not None:
                row["limits"] = limits
            _write("entitlements", rows)
            return row
    row = {
        "id": str(uuid4()),
        "organization_id": org_id,
        "subject_type": subject_type,
        "subject_id": subject,
        "module": module,
        "status": status,
        "limits": limits or {},
        "starts_at": None,
        "ends_at": None,
        "created_at": _now_iso(),
    }
    rows.append(row)
    _write("entitlements", rows)
    return row


# ── Launch tokens: short-lived, single-use, swapped by an app for a real session ─
def local_create_launch_token(registered_app_id: str, user_id: str, ttl_seconds: int = 60) -> tuple[dict, str]:
    raw = secrets.token_urlsafe(24)
    expires_dt = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    row = {
        "id": str(uuid4()),
        "token_hash": hash_api_key(raw),
        "registered_app_id": registered_app_id,
        "user_id": user_id,
        "expires_at": expires_dt.isoformat().replace("+00:00", "Z"),
        "used_at": None,
        "created_at": _now_iso(),
    }
    rows = _read("app_launch_tokens")
    rows.append(row)
    _write("app_launch_tokens", rows)
    return row, raw


def local_consume_launch_token(raw_token: str) -> Optional[dict]:
    token_hash = hash_api_key(raw_token)
    rows = _read("app_launch_tokens")
    for row in rows:
        if row.get("token_hash") != token_hash:
            continue
        if row.get("used_at"):
            return None
        try:
            expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            return None
        if expires_at < datetime.now(timezone.utc):
            return None
        row["used_at"] = _now_iso()
        _write("app_launch_tokens", rows)
        return row
    return None


_migrate_legacy_roles()
