"""Platform layer API routes for orgs, challenges, permissions, and join codes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..platform_auth import (
    PlatformUser,
    create_auth_user,
    exchange_launch_token,
    get_current_user,
    get_optional_user,
    load_platform_user,
    sign_in_user,
)
from ..platform_db import (
    add_membership,
    add_stage_nodes,
    build_stage_tree,
    consume_join_code,
    create_integration,
    create_join_code,
    create_organization,
    create_profile,
    create_program,
    create_program_join_code,
    ensure_default_entitlements,
    get_join_code,
    get_membership,
    get_org_challenge,
    get_organization,
    get_profile,
    get_profile_by_email,
    get_program,
    get_stage_node,
    get_user_orgs,
    list_audit_events,
    list_entitlements,
    list_integrations,
    list_members,
    list_programs,
    list_registered_apps,
    list_stage_nodes,
    list_student_registrations_for_stages,
    record_audit_event,
    register_student,
    set_entitlement,
    setup_organization,
    update_member_access,
    update_org_theme,
)
from ..platform_permissions import (
    ProgramInfo,
    can_edit_stage,
    can_view_stage,
    membership_covers_stage,
    role_label,
    visible_stages,
)
from ..schemas_platform import (
    AddMemberRequest,
    AuditEventResponse,
    AuthUserResponse,
    CreateJoinCodeRequest,
    CreateOrgRequest,
    DashboardResponse,
    DashboardStageTab,
    EntitlementResponse,
    ModuleKey,
    SetEntitlementRequest,
    IntegrationInput,
    IntegrationResponse,
    JoinCodeResponse,
    LaunchExchangeRequest,
    MeResponse,
    MemberResponse,
    MembershipSummary,
    OrgChallengeResponse,
    OrgResponse,
    OrgSetupRequest,
    OrgThemeUpdateRequest,
    ProgramInput,
    ProgramResponse,
    RegisterViaJoinCodeRequest,
    SignupRequest,
    StageNodeResponse,
    StudentRegistrationResponse,
    UpdateMemberRequest,
)
from ..config import get_settings

router = APIRouter(prefix="/api/platform", tags=["platform"])


def _require_supabase() -> None:
    # Supabase is the production backend, but when it isn't configured the platform
    # runs fully against the local JSON store + local auth (demo mode), so we no
    # longer hard-block here. Kept as a hook in case a route needs to force real DB.
    return None


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
                program_id=n.get("program_id"),
                children=_serialize_stage_tree(n.get("children", [])),
            )
        )
    return result


def _redeem_url(code: str) -> str:
    """Shareable/copyable redemption link for an invitation (email delivery is
    out of scope — the admin copies this and sends it manually)."""
    base = (get_settings().frontend_origin or "").rstrip("/")
    return f"{base}/?join_code={code}" if base else f"/?join_code={code}"


def _invitation_response(row: dict, org_name: str, stage_name: Optional[str], program: Optional[dict]) -> JoinCodeResponse:
    delivery_method = row.get("delivery_method", "join_code")
    return JoinCodeResponse(
        id=row["id"],
        code=row["code"] if delivery_method == "join_code" else None,
        kind=row["kind"],
        org_id=row["org_id"],
        stage_node_id=row.get("stage_node_id"),
        stage_name=stage_name,
        org_name=org_name,
        program_id=(program or {}).get("id") if program else row.get("program_id"),
        program_name=(program or {}).get("name") if program else None,
        program_category=(program or {}).get("category") if program else None,
        delivery_method=delivery_method,
        email=row.get("email"),
        max_uses=row.get("max_uses"),
        uses_remaining=row.get("uses_remaining"),
        expires_at=row.get("expires_at"),
        redeem_url=_redeem_url(row["code"]) if row.get("code") else None,
    )


def _program_response(row: dict) -> ProgramResponse:
    return ProgramResponse(
        id=row["id"],
        org_id=row["org_id"],
        name=row["name"],
        category=row["category"],
        description=row.get("description"),
        icon=row.get("icon"),
        instructor_label=row.get("instructor_label"),
        learner_label=row.get("learner_label"),
        course_count=row.get("course_count", 0),
        learner_count=row.get("learner_count", 0),
        instructor_count=row.get("instructor_count", 0),
    )


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
        program_name = None
        program_category = None
        registered_app_id = None
        app_launch_url = None
        if m.program_id:
            program = get_program(m.program_id)
            if program:
                program_name = program.get("name")
                program_category = program.get("category")
            apps = [a for a in list_registered_apps(m.program_id) if a.get("status") == "active"]
            if apps:
                registered_app_id = apps[0]["id"]
                app_launch_url = apps[0].get("launch_url")
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
                program_id=m.program_id,
                program_name=program_name,
                program_category=program_category,
                registered_app_id=registered_app_id,
                app_launch_url=app_launch_url,
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
        record_audit_event(
            "organization.created",
            org_id=org["id"],
            actor_user_id=auth["id"],
            scope_type="organization",
            scope_id=org["id"],
            metadata={"name": org["name"]},
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

    # Stored membership role uses the canonical "instructor" (Nexus addendum);
    # the public-facing "Coach"/"Teacher" word is derived from program category
    # in role_label(), not from this stored value.
    membership_role = "administrator" if req.signup_type == "administrator" else "instructor"
    add_membership(
        org_id=code_row["org_id"],
        profile_id=auth["id"],
        role=membership_role,
        stage_node_id=code_row.get("stage_node_id"),
        access="view",
        program_id=code_row.get("program_id"),
    )
    consume_join_code(req.join_code)
    record_audit_event(
        "member.joined",
        org_id=code_row["org_id"],
        actor_user_id=auth["id"],
        scope_type="organization",
        scope_id=code_row["org_id"],
        metadata={"role": membership_role, "via": "join_code"},
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


@router.post("/auth/launch-exchange")
def launch_exchange(req: LaunchExchangeRequest) -> dict:
    """Swap a short-lived launch token (from GET /api/apps/{id}/launch-context)
    for a real session access_token — replaces handing a raw platform session
    token to a downstream app via URL query string."""
    return exchange_launch_token(req.launch_token)


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
                "program_id": s.program_id,
                "children": [
                    {
                        "stage_type": c.stage_type,
                        "name": c.name,
                        "discord_url": c.discord_url,
                        "event_at": c.event_at.isoformat() if c.event_at else None,
                        "program_id": c.program_id,
                        "children": [],
                    }
                    for c in s.children
                ],
            }
            for s in req.initial_stages
        ],
        "discord_link": req.discord_link,
        "discord_permission_level": req.discord_permission_level,
        "programs": [
            {
                "name": p.name,
                "category": p.category,
                "description": p.description,
                "icon": p.icon,
                "instructor_label": p.instructor_label,
                "learner_label": p.learner_label,
                "stage_type": p.stage_type,
                "class_names": p.class_names,
            }
            for p in req.programs
        ],
    }
    result = setup_organization(org_id, payload)
    record_audit_event(
        "organization.setup_completed",
        org_id=org_id,
        actor_user_id=user.id,
        scope_type="organization",
        scope_id=org_id,
        metadata={"programs": len(req.programs), "has_challenge": req.has_challenge},
    )
    return result


@router.get("/orgs/{org_id}/programs", response_model=list[ProgramResponse])
def get_programs(org_id: str, user: PlatformUser = Depends(get_current_user)) -> list[ProgramResponse]:
    _require_supabase()
    _assert_org_access(user, org_id)
    return [_program_response(r) for r in list_programs(org_id)]


@router.post("/orgs/{org_id}/programs", response_model=ProgramResponse)
def post_program(
    org_id: str,
    req: ProgramInput,
    user: PlatformUser = Depends(get_current_user),
) -> ProgramResponse:
    _require_supabase()
    _assert_org_access(user, org_id, require_edit=True)
    row = create_program(
        org_id,
        req.name,
        req.category,
        description=req.description,
        icon=req.icon,
        instructor_label=req.instructor_label,
        learner_label=req.learner_label,
    )
    # Give the new program its own group scope, mirroring org_setup behavior.
    if req.category == "edu":
        add_stage_nodes(
            org_id,
            [{"stage_type": req.stage_type or "national", "name": req.name}],
            program_id=row["id"],
        )
    elif req.class_names:
        add_stage_nodes(
            org_id,
            [{"stage_type": "chapter", "name": cn} for cn in req.class_names],
            program_id=row["id"],
        )
    record_audit_event(
        "program.created",
        org_id=org_id,
        actor_user_id=user.id,
        scope_type="program",
        scope_id=row["id"],
        metadata={"name": row["name"], "category": row["category"]},
    )
    return _program_response(get_program(row["id"]) or row)


@router.patch("/orgs/{org_id}/theme", response_model=OrgResponse)
def patch_org_theme(
    org_id: str,
    req: OrgThemeUpdateRequest,
    user: PlatformUser = Depends(get_current_user),
) -> OrgResponse:
    _require_supabase()
    _assert_org_access(user, org_id, require_edit=True)
    org = update_org_theme(org_id, req.accent_color, req.logo_url)
    record_audit_event(
        "organization.theme_updated",
        org_id=org_id,
        actor_user_id=user.id,
        scope_type="organization",
        scope_id=org_id,
    )
    theme = (org.get("settings") or {}).get("theme") or {}
    return OrgResponse(
        id=org["id"],
        name=org["name"],
        slug=org["slug"],
        owner_id=org.get("owner_id"),
        theme_accent_color=theme.get("accent_color"),
        theme_logo_url=theme.get("logo_url"),
    )


@router.get("/orgs/{org_id}/integrations", response_model=list[IntegrationResponse])
def get_integrations(org_id: str, user: PlatformUser = Depends(get_current_user)) -> list[IntegrationResponse]:
    _require_supabase()
    _assert_org_access(user, org_id)
    return [
        IntegrationResponse(
            id=r["id"],
            organization_id=r["organization_id"],
            program_id=r.get("program_id"),
            integration_type=r["integration_type"],
            config=r.get("config") or {},
            permission_level=r.get("permission_level", "per_level"),
            status=r.get("status", "active"),
        )
        for r in list_integrations(org_id)
    ]


@router.post("/orgs/{org_id}/integrations", response_model=IntegrationResponse)
def post_integration(
    org_id: str,
    req: IntegrationInput,
    user: PlatformUser = Depends(get_current_user),
) -> IntegrationResponse:
    _require_supabase()
    _assert_org_access(user, org_id, require_edit=True)
    row = create_integration(org_id, req.integration_type, req.config, req.permission_level, req.program_id)
    return IntegrationResponse(
        id=row["id"],
        organization_id=row["organization_id"],
        program_id=row.get("program_id"),
        integration_type=row["integration_type"],
        config=row.get("config") or {},
        permission_level=row.get("permission_level", "per_level"),
        status=row.get("status", "active"),
    )


@router.post("/programs/{program_id}/join-codes", response_model=JoinCodeResponse)
def create_program_join_code_route(
    program_id: str,
    req: CreateJoinCodeRequest,
    user: PlatformUser = Depends(get_current_user),
) -> JoinCodeResponse:
    _require_supabase()
    program = get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _assert_org_access(user, program["org_id"], require_edit=True)

    kind = req.kind if req.kind != "student" else "teacher"
    row = create_program_join_code(
        program_id,
        kind,
        delivery_method=req.delivery_method,
        email=req.email,
        max_uses=req.max_uses,
        expires_at=req.expires_at.isoformat() if req.expires_at else None,
        created_by_user_id=user.id,
    )
    org = get_organization(program["org_id"])
    return _invitation_response(row, (org or {}).get("name", ""), None, program)


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
            program_id=r.get("program_id"),
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

    row = create_join_code(
        stage_id,
        req.kind,
        delivery_method=req.delivery_method,
        email=req.email,
        max_uses=req.max_uses,
        expires_at=req.expires_at.isoformat() if req.expires_at else None,
        created_by_user_id=user.id,
    )
    org = get_organization(stage["org_id"])
    org_name = (stage.get("organizations") or {}).get("name") or (org or {}).get("name", "")
    return _invitation_response(row, org_name, stage["name"], None)


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
    record_audit_event(
        "registration.student_joined",
        org_id=reg["org_id"],
        actor_user_id=user.id,
        scope_type="organization",
        scope_id=reg["org_id"],
        target_type="student_registration",
        target_id=reg["id"],
        metadata={"via": "join_code"},
    )
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

    program_infos = [
        ProgramInfo(
            id=p["id"],
            category=p["category"],
            instructor_label=p.get("instructor_label"),
            learner_label=p.get("learner_label"),
        )
        for p in list_programs(target_org_id)
    ]
    theme = (org.get("settings") or {}).get("theme") or {}

    return DashboardResponse(
        org_id=target_org_id,
        org_name=org["name"],
        role_label=role_label(user.memberships, target_org_id, all_stages, program_infos),
        active_stage_id=active,
        stages=stage_tabs,
        total_signups=len(registrations),
        students=students,
        theme_accent_color=theme.get("accent_color"),
        theme_logo_url=theme.get("logo_url"),
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
    record_audit_event(
        "member.added",
        org_id=org_id,
        actor_user_id=user.id,
        scope_type="organization",
        scope_id=org_id,
        target_type="membership",
        target_id=row["id"],
        metadata={"email": req.email, "role": req.role},
    )
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
    record_audit_event(
        "member.access_updated",
        org_id=row["org_id"],
        actor_user_id=user.id,
        scope_type="organization",
        scope_id=row["org_id"],
        target_type="membership",
        target_id=member_id,
        metadata={"access": req.access},
    )
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


# ── Audit log ────────────────────────────────────────────────────────────────
@router.get("/orgs/{org_id}/audit", response_model=list[AuditEventResponse])
def org_audit(
    org_id: str,
    limit: int = Query(50, le=200),
    user: PlatformUser = Depends(get_current_user),
) -> list[AuditEventResponse]:
    _assert_org_access(user, org_id)
    events = list_audit_events(org_id, limit)
    actor_ids = {e["actor_user_id"] for e in events if e.get("actor_user_id")}
    names: dict[str, str] = {}
    for aid in actor_ids:
        profile = get_profile(aid) or {}
        names[aid] = profile.get("display_name") or profile.get("name") or profile.get("email", "")
    return [
        AuditEventResponse(
            id=e["id"],
            organization_id=e.get("organization_id"),
            actor_user_id=e.get("actor_user_id"),
            actor_name=names.get(e.get("actor_user_id") or ""),
            action=e["action"],
            scope_type=e.get("scope_type"),
            scope_id=e.get("scope_id"),
            target_type=e.get("target_type"),
            target_id=e.get("target_id"),
            metadata=e.get("metadata") or {},
            created_at=e["created_at"],
        )
        for e in events
    ]


# ── Entitlements ─────────────────────────────────────────────────────────────
def _entitlement_response(row: dict) -> EntitlementResponse:
    return EntitlementResponse(
        id=row["id"],
        organization_id=row["organization_id"],
        subject_type=row.get("subject_type", "organization"),
        subject_id=row["subject_id"],
        module=row["module"],
        status=row.get("status", "active"),
        limits=row.get("limits") or {},
        starts_at=row.get("starts_at"),
        ends_at=row.get("ends_at"),
    )


@router.get("/orgs/{org_id}/entitlements", response_model=list[EntitlementResponse])
def org_entitlements(org_id: str, user: PlatformUser = Depends(get_current_user)) -> list[EntitlementResponse]:
    _assert_org_access(user, org_id)
    return [_entitlement_response(r) for r in ensure_default_entitlements(org_id)]


@router.put("/orgs/{org_id}/entitlements/{module}", response_model=EntitlementResponse)
def put_entitlement(
    org_id: str,
    module: ModuleKey,
    req: SetEntitlementRequest,
    user: PlatformUser = Depends(get_current_user),
) -> EntitlementResponse:
    _assert_org_access(user, org_id, require_edit=True)
    if module == "nexus":
        raise HTTPException(status_code=400, detail="The nexus module cannot be disabled")
    row = set_entitlement(org_id, module, req.status)
    record_audit_event(
        "entitlement.enabled" if req.status in ("active", "trial") else "entitlement.disabled",
        org_id=org_id,
        actor_user_id=user.id,
        scope_type="organization",
        scope_id=org_id,
        target_type="entitlement",
        target_id=row["id"],
        metadata={"module": module, "status": req.status},
    )
    return _entitlement_response(row)
