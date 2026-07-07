"""Platform layer API routes for orgs, challenges, permissions, and join codes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..platform_auth import (
    PlatformUser,
    create_auth_user,
    get_current_user,
    get_optional_user,
    load_platform_user,
    sign_in_user,
)
from ..platform_db import (
    add_membership,
    add_stage_nodes,
    build_stage_tree,
    create_join_code,
    create_organization,
    create_profile,
    get_join_code,
    get_membership,
    get_org_challenge,
    get_organization,
    get_profile,
    get_profile_by_email,
    get_stage_node,
    get_user_orgs,
    list_members,
    list_stage_nodes,
    list_student_registrations_for_stages,
    register_student,
    setup_organization,
    update_member_access,
)
from ..platform_permissions import (
    can_edit_stage,
    can_view_stage,
    membership_covers_stage,
    role_label,
    visible_stages,
)
from ..schemas_platform import (
    AddMemberRequest,
    AuthUserResponse,
    CreateJoinCodeRequest,
    CreateOrgRequest,
    DashboardResponse,
    DashboardStageTab,
    JoinCodeResponse,
    MeResponse,
    MemberResponse,
    MembershipSummary,
    OrgChallengeResponse,
    OrgResponse,
    OrgSetupRequest,
    RegisterViaJoinCodeRequest,
    SignupRequest,
    StageNodeResponse,
    StudentRegistrationResponse,
    UpdateMemberRequest,
)
from ..config import get_settings

router = APIRouter(prefix="/api/platform", tags=["platform"])


def _require_supabase() -> None:
    if not get_settings().supabase_enabled:
        raise HTTPException(status_code=503, detail="Supabase is required for platform features")


def _serialize_stage_tree(nodes: list[dict]) -> list[StageNodeResponse]:
    result = []
    for n in nodes:
        result.append(
            StageNodeResponse(
                id=n["id"],
                org_id=n["org_id"],
                parent_id=n.get("parent_id"),
                stage_type=n["stage_type"],
                name=n["name"],
                depth=n.get("depth", 0),
                path=n.get("path", "/"),
                discord_url=n.get("discord_url"),
                event_at=n.get("event_at"),
                qualifier_status=n.get("qualifier_status"),
                children=_serialize_stage_tree(n.get("children", [])),
            )
        )
    return result


def _membership_summaries(user: PlatformUser) -> list[MembershipSummary]:
    summaries = []
    for m in user.memberships:
        org = get_organization(m.org_id)
        stage_name = None
        stage_type = m.stage_type
        if m.stage_node_id:
            stage = get_stage_node(m.stage_node_id)
            if stage:
                stage_name = stage.get("name")
                stage_type = stage.get("stage_type", stage_type)
        summaries.append(
            MembershipSummary(
                id=m.id,
                org_id=m.org_id,
                org_name=org["name"] if org else "",
                role=m.role,
                stage_node_id=m.stage_node_id,
                stage_name=stage_name,
                stage_type=stage_type,
                access=m.access,
            )
        )
    return summaries


def _assert_org_access(user: PlatformUser, org_id: str, require_edit: bool = False) -> None:
    org_memberships = [m for m in user.memberships if m.org_id == org_id]
    if not org_memberships:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    if require_edit:
        if not any(m.role == "owner" or m.access == "edit" for m in org_memberships):
            raise HTTPException(status_code=403, detail="Edit access required")


@router.post("/auth/signup", response_model=AuthUserResponse)
def signup(req: SignupRequest) -> AuthUserResponse:
    _require_supabase()

    if req.signup_type == "org":
        if not req.org_name:
            raise HTTPException(status_code=400, detail="org_name is required for org signup")
        auth = create_auth_user(req.email, req.password)
        create_profile(auth["id"], req.email, "org_admin", req.display_name)
        org = create_organization(req.org_name, auth["id"])
        session = sign_in_user(req.email, req.password)
        user = load_platform_user(auth["id"], req.email)
        return AuthUserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            access_token=session["access_token"],
        )

    if req.signup_type == "student":
        auth = create_auth_user(req.email, req.password)
        create_profile(auth["id"], req.email, "student", req.display_name)
        session = sign_in_user(req.email, req.password)
        user = load_platform_user(auth["id"], req.email)
        return AuthUserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            access_token=session["access_token"],
        )

    if not req.join_code:
        raise HTTPException(status_code=400, detail="join_code is required for administrator/teacher signup")

    code_row = get_join_code(req.join_code)
    if not code_row:
        raise HTTPException(status_code=404, detail="Invalid join code")

    if req.signup_type == "administrator" and code_row["kind"] != "administrator":
        raise HTTPException(status_code=400, detail="Join code is not valid for administrator signup")
    if req.signup_type == "teacher" and code_row["kind"] != "teacher":
        raise HTTPException(status_code=400, detail="Join code is not valid for teacher signup")

    auth = create_auth_user(req.email, req.password)
    profile_role = "org_admin" if req.signup_type == "administrator" else "teacher"
    create_profile(auth["id"], req.email, profile_role, req.display_name)

    membership_role = "administrator" if req.signup_type == "administrator" else "teacher"
    add_membership(
        org_id=code_row["org_id"],
        profile_id=auth["id"],
        role=membership_role,
        stage_node_id=code_row["stage_node_id"],
        access="view",
    )

    session = sign_in_user(req.email, req.password)
    user = load_platform_user(auth["id"], req.email)
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        access_token=session["access_token"],
    )


@router.post("/auth/login", response_model=AuthUserResponse)
def login(body: dict) -> AuthUserResponse:
    _require_supabase()
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")
    session = sign_in_user(email, password)
    user = load_platform_user(session["id"], session["email"])
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        access_token=session["access_token"],
    )


@router.get("/auth/me", response_model=MeResponse)
def me(user: PlatformUser = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        memberships=_membership_summaries(user),
    )


@router.post("/orgs", response_model=OrgResponse)
def create_org(req: CreateOrgRequest, user: PlatformUser = Depends(get_current_user)) -> OrgResponse:
    _require_supabase()
    org = create_organization(req.name, user.id)
    return OrgResponse(id=org["id"], name=org["name"], slug=org["slug"], owner_id=org.get("owner_id"))


@router.put("/orgs/{org_id}/setup")
def org_setup(
    org_id: str,
    req: OrgSetupRequest,
    user: PlatformUser = Depends(get_current_user),
) -> dict:
    _require_supabase()
    _assert_org_access(user, org_id, require_edit=True)

    payload = {
        "has_challenge": req.has_challenge,
        "challenge_name": req.challenge_name,
        "stage_types": req.stage_types,
        "permission_defaults": {
            role: {
                "default_access": cfg.default_access,
                "per_level_overrides": cfg.per_level_overrides or {},
            }
            for role, cfg in req.permission_defaults.items()
        },
        "initial_stages": [
            {
                "stage_type": s.stage_type,
                "name": s.name,
                "discord_url": s.discord_url,
                "event_at": s.event_at.isoformat() if s.event_at else None,
                "children": [
                    {
                        "stage_type": c.stage_type,
                        "name": c.name,
                        "discord_url": c.discord_url,
                        "event_at": c.event_at.isoformat() if c.event_at else None,
                        "children": [],
                    }
                    for c in s.children
                ],
            }
            for s in req.initial_stages
        ],
        "discord_link": req.discord_link,
    }
    return setup_organization(org_id, payload)


@router.get("/orgs/{org_id}/stages", response_model=list[StageNodeResponse])
def get_stages(org_id: str, user: PlatformUser = Depends(get_current_user)) -> list[StageNodeResponse]:
    _require_supabase()
    _assert_org_access(user, org_id)
    all_stages = list_stage_nodes(org_id)
    visible = visible_stages(user.memberships, all_stages, org_id)
    tree = build_stage_tree(visible)
    return _serialize_stage_tree(tree)


@router.post("/orgs/{org_id}/stages", response_model=list[StageNodeResponse])
def post_stages(
    org_id: str,
    nodes: list[dict],
    parent_id: Optional[str] = Query(None),
    user: PlatformUser = Depends(get_current_user),
) -> list[StageNodeResponse]:
    _require_supabase()
    _assert_org_access(user, org_id, require_edit=True)
    created = add_stage_nodes(org_id, nodes, parent_id)
    return [
        StageNodeResponse(
            id=r["id"],
            org_id=r["org_id"],
            parent_id=r.get("parent_id"),
            stage_type=r["stage_type"],
            name=r["name"],
            depth=r.get("depth", 0),
            path=r.get("path", "/"),
            discord_url=r.get("discord_url"),
            event_at=r.get("event_at"),
            qualifier_status=r.get("qualifier_status"),
        )
        for r in created
    ]


@router.post("/stages/{stage_id}/join-codes", response_model=JoinCodeResponse)
def create_stage_join_code(
    stage_id: str,
    req: CreateJoinCodeRequest,
    user: PlatformUser = Depends(get_current_user),
) -> JoinCodeResponse:
    _require_supabase()
    stage = get_stage_node(stage_id)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    _assert_org_access(user, stage["org_id"], require_edit=True)

    row = create_join_code(stage_id, req.kind)
    org = get_organization(stage["org_id"])
    return JoinCodeResponse(
        id=row["id"],
        code=row["code"],
        kind=row["kind"],
        org_id=row["org_id"],
        stage_node_id=row["stage_node_id"],
        stage_name=stage["name"],
        org_name=(stage.get("organizations") or {}).get("name") or (org or {}).get("name", ""),
    )


@router.get("/join-codes/{code}", response_model=JoinCodeResponse)
def validate_join_code(code: str) -> JoinCodeResponse:
    _require_supabase()
    row = get_join_code(code)
    if not row:
        raise HTTPException(status_code=404, detail="Invalid join code")
    stage = row.get("stage_nodes") or {}
    org = row.get("organizations") or {}
    return JoinCodeResponse(
        id=row["id"],
        code=row["code"],
        kind=row["kind"],
        org_id=row["org_id"],
        stage_node_id=row["stage_node_id"],
        stage_name=stage.get("name", ""),
        org_name=org.get("name", ""),
    )


@router.post("/join-codes/{code}/register")
def register_via_join_code(
    code: str,
    req: RegisterViaJoinCodeRequest,
    user: Optional[PlatformUser] = Depends(get_optional_user),
) -> dict:
    _require_supabase()
    row = get_join_code(code)
    if not row:
        raise HTTPException(status_code=404, detail="Invalid join code")
    if row["kind"] != "student":
        raise HTTPException(status_code=400, detail="This join code is not for student registration")

    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required to register")

    reg = register_student(user.id, row, req.display_name)
    return {"ok": True, "registration_id": reg["id"], "org_id": reg["org_id"]}


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    org_id: Optional[str] = Query(None),
    stage_id: Optional[str] = Query(None),
    user: PlatformUser = Depends(get_current_user),
) -> DashboardResponse:
    _require_supabase()
    if not user.memberships:
        raise HTTPException(status_code=403, detail="No organization memberships")

    target_org_id = org_id or user.memberships[0].org_id
    _assert_org_access(user, target_org_id)

    org = get_organization(target_org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    all_stages = list_stage_nodes(target_org_id)
    visible = visible_stages(user.memberships, all_stages, target_org_id)

    registrations = list_student_registrations_for_stages(target_org_id, visible)

    stage_tabs: list[DashboardStageTab] = []
    for s in visible:
        count = sum(1 for r in registrations if r.get("stage_node_id") == s.id)
        stage_tabs.append(
            DashboardStageTab(
                id=s.id,
                stage_type=s.stage_type,
                name=s.name,
                signup_count=count,
                event_at=s.event_at,
                discord_url=s.discord_url,
                qualifier_status=s.qualifier_status,
            )
        )

    active = stage_id or (stage_tabs[0].id if stage_tabs else None)
    active_regs = [
        r for r in registrations if not active or r.get("stage_node_id") == active
    ]

    students = []
    for r in active_regs[:50]:
        profile = r.get("profiles") or {}
        stage = r.get("stage_nodes") or {}
        students.append(
            StudentRegistrationResponse(
                id=r["id"],
                profile_id=r["profile_id"],
                display_name=profile.get("display_name") or profile.get("name"),
                email=profile.get("email"),
                stage_node_id=r["stage_node_id"],
                stage_name=stage.get("name", ""),
                registered_at=r["registered_at"],
            )
        )

    return DashboardResponse(
        org_id=target_org_id,
        org_name=org["name"],
        role_label=role_label(user.memberships, target_org_id, all_stages),
        active_stage_id=active,
        stages=stage_tabs,
        total_signups=len(registrations),
        students=students,
    )


@router.get("/stages/{stage_id}/students", response_model=list[StudentRegistrationResponse])
def stage_students(
    stage_id: str,
    user: PlatformUser = Depends(get_current_user),
) -> list[StudentRegistrationResponse]:
    _require_supabase()
    stage = get_stage_node(stage_id)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    from ..platform_permissions import StageNode

    stage_node = StageNode(
        id=stage["id"],
        org_id=stage["org_id"],
        parent_id=stage.get("parent_id"),
        stage_type=stage["stage_type"],
        name=stage["name"],
        depth=stage.get("depth", 0),
        path=stage.get("path", "/"),
    )
    if not can_view_stage(user.memberships, stage_node):
        raise HTTPException(status_code=403, detail="Cannot view this stage")

    all_stages = list_stage_nodes(stage["org_id"])
    visible = visible_stages(user.memberships, all_stages, stage["org_id"])
    registrations = list_student_registrations_for_stages(stage["org_id"], visible)
    filtered = [r for r in registrations if r.get("stage_node_id") == stage_id]

    result = []
    for r in filtered:
        profile = r.get("profiles") or {}
        st = r.get("stage_nodes") or {}
        result.append(
            StudentRegistrationResponse(
                id=r["id"],
                profile_id=r["profile_id"],
                display_name=profile.get("display_name") or profile.get("name"),
                email=profile.get("email"),
                stage_node_id=r["stage_node_id"],
                stage_name=st.get("name", ""),
                registered_at=r["registered_at"],
            )
        )
    return result


@router.get("/orgs/{org_id}/members", response_model=list[MemberResponse])
def get_members(org_id: str, user: PlatformUser = Depends(get_current_user)) -> list[MemberResponse]:
    _require_supabase()
    _assert_org_access(user, org_id)
    rows = list_members(org_id)
    result = []
    for r in rows:
        profile = r.get("profiles") or {}
        stage = r.get("stage_nodes") or {}
        result.append(
            MemberResponse(
                id=r["id"],
                profile_id=r["profile_id"],
                email=profile.get("email", ""),
                display_name=profile.get("display_name") or profile.get("name"),
                role=r["role"],
                stage_node_id=r.get("stage_node_id"),
                stage_name=stage.get("name"),
                access=r.get("access", "view"),
            )
        )
    return result


@router.post("/orgs/{org_id}/members", response_model=MemberResponse)
def post_member(
    org_id: str,
    req: AddMemberRequest,
    user: PlatformUser = Depends(get_current_user),
) -> MemberResponse:
    _require_supabase()
    _assert_org_access(user, org_id, require_edit=True)

    profile = get_profile_by_email(req.email)
    if not profile:
        raise HTTPException(status_code=404, detail="User with this email not found")

    row = add_membership(org_id, profile["id"], req.role, req.stage_node_id, req.access)
    stage = get_stage_node(req.stage_node_id) if req.stage_node_id else None
    stage_name = stage.get("name") if stage else None

    return MemberResponse(
        id=row["id"],
        profile_id=row["profile_id"],
        email=profile.get("email", ""),
        display_name=profile.get("display_name") or profile.get("name"),
        role=row["role"],
        stage_node_id=row.get("stage_node_id"),
        stage_name=stage_name,
        access=row.get("access", "view"),
    )


@router.patch("/members/{member_id}", response_model=MemberResponse)
def patch_member(
    member_id: str,
    req: UpdateMemberRequest,
    user: PlatformUser = Depends(get_current_user),
) -> MemberResponse:
    _require_supabase()

    row = get_membership(member_id)
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")
    _assert_org_access(user, row["org_id"], require_edit=True)

    updated = update_member_access(member_id, req.access)
    profile = get_profile(updated["profile_id"]) or {}
    stage_name = None
    if updated.get("stage_node_id"):
        stage = get_stage_node(updated["stage_node_id"])
        if stage:
            stage_name = stage.get("name")

    return MemberResponse(
        id=updated["id"],
        profile_id=updated["profile_id"],
        email=profile.get("email", ""),
        display_name=profile.get("display_name") or profile.get("name"),
        role=updated["role"],
        stage_node_id=updated.get("stage_node_id"),
        stage_name=stage_name,
        access=updated.get("access", "view"),
    )


@router.get("/orgs/mine")
def my_orgs(user: PlatformUser = Depends(get_current_user)) -> list[dict]:
    _require_supabase()
    rows = get_user_orgs(user.id)
    seen = set()
    result = []
    for r in rows:
        org = r.get("organizations") or {}
        oid = org.get("id")
        if oid and oid not in seen:
            seen.add(oid)
            result.append({"id": oid, "name": org.get("name"), "slug": org.get("slug"), "role": r.get("role")})
    return result


@router.get("/orgs/{org_id}/challenge", response_model=OrgChallengeResponse)
def org_challenge(org_id: str, user: PlatformUser = Depends(get_current_user)) -> OrgChallengeResponse:
    _require_supabase()
    _assert_org_access(user, org_id)
    data = get_org_challenge(org_id)
    if not data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrgChallengeResponse(**data)
