"""Bridge Program context endpoint — the Bridge workstream's integration
surface (see NEXUS_BRIDGE_INTEGRATION.md for review notes).

Assembles the `NexusBridgeContext` consumed by Applications/BridgePlatform
(shape: Components/laic-learner-contracts; Bridge plan §3.3). This is a THIN
projection of existing Nexus data — organizations act as Bridge Program
Organizations, stage scopes act as groups, membership roles map onto bridge
roles. No new program/offering model is introduced; the Nexus workstream can
generalize later without breaking the contract shape.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..config import get_settings
from ..platform_auth import PlatformUser, get_current_user

router = APIRouter(prefix="/api/platform/bridge", tags=["bridge"])

# Existing Nexus membership roles -> bridge roles (documented mapping).
MEMBERSHIP_ROLE_MAP = {
    "owner": "bridge_org_admin",
    "administrator": "bridge_org_admin",
    "teacher": "bridge_coach",
    "student": "bridge_learner",
}

ROLE_PERMISSIONS = {
    "bridge_learner": ["bridge.session.create", "bridge.session.play", "bridge.progress.read_own"],
    "bridge_coach": [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.progress.read_own",
        "bridge.progress.read_learners",
        "bridge.group.manage",
        "bridge.config.manage_own",
    ],
    "bridge_org_admin": [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.org.manage",
        "bridge.config.manage_org",
        "bridge.progress.read_org",
    ],
    "bridge_program_admin": [
        "bridge.program.manage",
        "bridge.org.manage",
        "bridge.knowledge.review",
        "bridge.knowledge.publish",
        "bridge.progress.read_program",
    ],
    "bridge_reviewer": [
        "bridge.session.create",
        "bridge.session.play",
        "bridge.knowledge.review",
        "bridge.knowledge.edit",
    ],
}

_ACCESS_PRECEDENCE = ["admin", "coach", "reviewer", "learner", "guest"]


def _emails(csv: str) -> set[str]:
    return {e.strip().lower() for e in (csv or "").split(",") if e.strip()}


@router.get("/context")
def bridge_context(user: PlatformUser = Depends(get_current_user)) -> dict:
    settings = get_settings()
    roles: list[str] = []
    access_candidates: list[str] = []

    # Program-level roles are config-seeded (env) until a grant UI exists.
    email = (user.email or "").lower()
    if email in _emails(settings.bridge_program_admin_emails):
        roles.append("bridge_program_admin")
        access_candidates.append("admin")
    if email in _emails(settings.bridge_reviewer_emails):
        roles.extend(["bridge_reviewer", "bridge_fellow"])
        access_candidates.append("reviewer")

    # Organization scope: the user's first membership. Its org acts as the
    # Bridge Program Organization; its stage scope acts as the group.
    membership = user.memberships[0] if user.memberships else None
    if membership is not None:
        mapped = MEMBERSHIP_ROLE_MAP.get(membership.role)
        if mapped and mapped not in roles:
            roles.append(mapped)
            access_candidates.append(
                "admin" if mapped == "bridge_org_admin" else "coach" if mapped == "bridge_coach" else "learner"
            )

    if not roles:
        roles = ["bridge_guest"]
        access_candidates.append("guest")

    permissions = sorted({p for r in roles for p in ROLE_PERMISSIONS.get(r, [])})
    access_level = next(a for a in _ACCESS_PRECEDENCE if a in access_candidates)

    # Program admins/reviewers operate program-wide: no org scope attached.
    program_scoped = access_level in ("admin", "reviewer") and membership is None

    return {
        "nexusUserId": user.id,
        "laicOrgId": settings.laic_org_id,
        "programId": "bridge_program",
        "programOrganizationId": None if program_scoped else (membership.org_id if membership else None),
        "groupId": membership.stage_node_id if membership else None,
        "appId": "bridge_ai_coach",
        "roles": roles,
        "permissions": permissions,
        "accessLevel": access_level,
    }
