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


def role_label(memberships: list[Membership], org_id: str, stages: list[StageNode]) -> str:
    org_memberships = [m for m in memberships if m.org_id == org_id]
    if not org_memberships:
        return "Member"

    primary = next((m for m in org_memberships if m.role == "owner"), org_memberships[0])
    role_word = {
        "owner": "Owner",
        "administrator": "Administrator",
        "teacher": "Teacher",
    }.get(primary.role, "Member")

    if primary.stage_node_id:
        stage = next((s for s in stages if s.id == primary.stage_node_id), None)
        if stage:
            type_word = stage.stage_type.capitalize()
            return f"{type_word} {role_word}"
    return role_word
