"""Hierarchical stage-scoped permission helpers for the LIAC platform layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

Access = Literal["view", "edit"]
StageType = Literal["international", "national", "state", "chapter"]


@dataclass
class Membership:
    id: str
    org_id: str
    profile_id: str
    role: str
    stage_node_id: Optional[str]
    access: Access
    stage_path: Optional[str] = None
    stage_type: Optional[StageType] = None
    program_id: Optional[str] = None


@dataclass
class StageNode:
    id: str
    org_id: str
    parent_id: Optional[str]
    stage_type: StageType
    name: str
    depth: int
    path: str
    discord_url: Optional[str] = None
    event_at: Optional[str] = None
    qualifier_status: Optional[str] = None
    program_id: Optional[str] = None


@dataclass
class ProgramInfo:
    """Minimal program shape needed for role-label derivation."""

    id: str
    category: str
    instructor_label: Optional[str] = None
    learner_label: Optional[str] = None


def is_subtree_path(ancestor_path: str, descendant_path: str) -> bool:
    """True if descendant_path is under ancestor_path in the stage tree."""
    if not ancestor_path or ancestor_path == "/":
        return True
    normalized = ancestor_path if ancestor_path.endswith("/") else ancestor_path + "/"
    return descendant_path == ancestor_path or descendant_path.startswith(normalized)


def membership_covers_stage(membership: Membership, stage: StageNode) -> bool:
    """Whether a membership scope includes the given stage node."""
    if membership.role == "owner" and membership.stage_node_id is None:
        return True
    if membership.stage_node_id is None:
        return membership.role == "owner"
    if membership.stage_path is None:
        return membership.stage_node_id == stage.id
    return is_subtree_path(membership.stage_path, stage.path)


def visible_stages(memberships: list[Membership], stages: list[StageNode], org_id: str) -> list[StageNode]:
    """Return stage nodes visible to the user within an org."""
    org_stages = [s for s in stages if s.org_id == org_id]
    if not org_stages:
        return []

    org_memberships = [m for m in memberships if m.org_id == org_id]
    if not org_memberships:
        return []

    visible: list[StageNode] = []
    for stage in org_stages:
        if any(membership_covers_stage(m, stage) for m in org_memberships):
            visible.append(stage)
    return visible


def visible_stage_ids(memberships: list[Membership], stages: list[StageNode], org_id: str) -> set[str]:
    return {s.id for s in visible_stages(memberships, stages, org_id)}


def can_view_stage(memberships: list[Membership], stage: StageNode) -> bool:
    org_memberships = [m for m in memberships if m.org_id == stage.org_id]
    return any(membership_covers_stage(m, stage) for m in org_memberships)


def can_edit_stage(memberships: list[Membership], stage: StageNode) -> bool:
    org_memberships = [m for m in memberships if m.org_id == stage.org_id]
    for m in org_memberships:
        if not membership_covers_stage(m, stage):
            continue
        if m.role == "owner":
            return True
        if m.access == "edit":
            return True
    return False


def resolve_effective_access(
    default_access: str,
    per_level_overrides: dict,
    stage_type: StageType,
    membership_access: Access,
) -> Access:
    """Resolve per_level org defaults for a given stage type."""
    if default_access == "per_level":
        override = per_level_overrides.get(stage_type)
        if override in ("view", "edit"):
            return override  # type: ignore[return-value]
        return membership_access
    if default_access in ("view", "edit"):
        return default_access  # type: ignore[return-value]
    return membership_access


def category_role_word(role: str, category: Optional[str]) -> str:
    """Category-derived display word for a canonical instructor/learner role.

    Game programs read as Coach/Player, edu programs (or no program) read as
    Teacher/Student. This is only the *default*; callers should prefer an
    explicit per-program instructor_label/learner_label override when present.
    """
    if role == "instructor":
        return "Coach" if category == "game" else "Teacher"
    if role == "learner":
        return "Player" if category == "game" else "Student"
    return {"owner": "Owner", "administrator": "Administrator"}.get(role, "Member")


def is_offering_admin(memberships: list[Membership], org_id: str, program_id: Optional[str] = None) -> bool:
    """Minimal offering/app/registration-admin check reusing existing membership
    data — not the full generic RoleAssignment/permission-string system from the
    Nexus doc's Section 17, just enough to gate the new offering/app endpoints."""
    for m in memberships:
        if m.org_id != org_id:
            continue
        if m.role in ("owner", "administrator") and m.stage_node_id is None:
            return True
        if program_id and m.program_id == program_id and m.role in ("administrator", "instructor"):
            return True
    return False


def role_label(
    memberships: list[Membership],
    org_id: str,
    stages: list[StageNode],
    programs: Optional[list["ProgramInfo"]] = None,
) -> str:
    org_memberships = [m for m in memberships if m.org_id == org_id]
    if not org_memberships:
        return "Member"

    primary = next((m for m in org_memberships if m.role == "owner"), org_memberships[0])

    program = None
    if primary.program_id and programs:
        program = next((p for p in programs if p.id == primary.program_id), None)

    if primary.role == "instructor" and program and program.instructor_label:
        role_word = program.instructor_label
    elif primary.role == "learner" and program and program.learner_label:
        role_word = program.learner_label
    else:
        role_word = category_role_word(primary.role, program.category if program else None)

    if primary.stage_node_id:
        stage = next((s for s in stages if s.id == primary.stage_node_id), None)
        if stage:
            type_word = stage.stage_type.capitalize()
            return f"{type_word} {role_word}"
    return role_word
