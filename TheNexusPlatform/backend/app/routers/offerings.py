"""Program Offering + Registered App admin CRUD, plus the registration approval
queue. User-session auth (Depends(get_current_user)) — distinct from
routers/hook.py's app-key auth used by external apps to push signups."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..platform_auth import PlatformUser, get_current_user
from ..platform_db import (
    approve_registration,
    check_module_access,
    create_launch_token,
    create_offering,
    create_participant,
    create_registered_app,
    create_registration,
    get_offering,
    get_profile,
    get_profile_by_email,
    get_program,
    get_registered_app,
    get_registration,
    list_offerings,
    list_participants,
    list_registered_apps,
    list_registrations,
    record_audit_event,
    reject_registration,
    revoke_app,
    rotate_app_api_key,
    set_offering_status,
    update_offering,
    update_registered_app,
)
from ..platform_permissions import is_offering_admin
from ..schemas_platform import (
    AdminAddRegistrationRequest,
    AppCreate,
    AppLaunchContextResponse,
    AppResponse,
    AppUpdate,
    AppWithKeyResponse,
    OfferingCreate,
    OfferingResponse,
    OfferingUpdate,
    ParticipantResponse,
    RegistrationResponse,
    SignupFieldDef,
)

router = APIRouter(prefix="/api", tags=["offerings"])


def _require_offering_admin(user: PlatformUser, org_id: str, program_id: Optional[str]) -> None:
    if not is_offering_admin(user.memberships, org_id, program_id):
        raise HTTPException(status_code=403, detail="Offering admin access required")


def _require_org_member(user: PlatformUser, org_id: str) -> None:
    if not any(m.org_id == org_id for m in user.memberships):
        raise HTTPException(status_code=403, detail="Not a member of this organization")


def _offering_response(row: dict) -> OfferingResponse:
    return OfferingResponse(
        id=row["id"],
        organization_id=row["organization_id"],
        program_id=row["program_id"],
        stage_node_id=row.get("stage_node_id"),
        name=row["name"],
        slug=row["slug"],
        offering_type=row["offering_type"],
        status=row.get("status", "draft"),
        description=row.get("description"),
        start_date=row.get("start_date"),
        end_date=row.get("end_date"),
        registration_open=row.get("registration_open", False),
        approval_mode=row.get("approval_mode", "manual_approve"),
        signup_fields=[SignupFieldDef(**f) for f in (row.get("signup_fields") or [])],
        platform_module=row.get("platform_module", "nexus_only"),
        registered_app_id=row.get("registered_app_id"),
        external_runtime_url=row.get("external_runtime_url"),
        participant_label_singular=row.get("participant_label_singular"),
        participant_label_plural=row.get("participant_label_plural"),
        metadata=row.get("metadata") or {},
        registration_count=row.get("registration_count", 0),
        pending_count=row.get("pending_count", 0),
        participant_count=row.get("participant_count", 0),
    )


def _app_response(row: dict) -> AppResponse:
    return AppResponse(
        id=row["id"],
        organization_id=row["organization_id"],
        program_id=row.get("program_id"),
        offering_id=row.get("offering_id"),
        app_name=row["app_name"],
        app_slug=row["app_slug"],
        key_prefix=row.get("key_prefix"),
        allowed_identifiers=row.get("allowed_identifiers", "email"),
        status=row.get("status", "active"),
        launch_url=row.get("launch_url"),
        launch_context=row.get("launch_context") or {},
    )


def _registration_response(row: dict) -> RegistrationResponse:
    return RegistrationResponse(
        id=row["id"],
        organization_id=row["organization_id"],
        program_id=row.get("program_id"),
        offering_id=row["offering_id"],
        stage_node_id=row.get("stage_node_id"),
        registered_app_id=row.get("registered_app_id"),
        registration_source=row.get("registration_source", "app_hook"),
        email=row.get("email"),
        phone=row.get("phone"),
        name=row.get("name"),
        age=row.get("age"),
        user_id=row.get("user_id"),
        status=row["status"],
        field_data=row.get("field_data") or {},
        reviewed_by_user_id=row.get("reviewed_by_user_id"),
        reviewed_at=row.get("reviewed_at"),
        created_at=row["created_at"],
    )


# ── Offerings ────────────────────────────────────────────────────────────
@router.get("/programs/{program_id}/offerings", response_model=list[OfferingResponse])
def get_offerings(program_id: str, user: PlatformUser = Depends(get_current_user)) -> list[OfferingResponse]:
    program = get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _require_org_member(user, program["org_id"])
    return [_offering_response(r) for r in list_offerings(program_id)]


@router.post("/programs/{program_id}/offerings", response_model=OfferingResponse)
def post_offering(
    program_id: str,
    req: OfferingCreate,
    user: PlatformUser = Depends(get_current_user),
) -> OfferingResponse:
    program = get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _require_offering_admin(user, program["org_id"], program_id)
    row = create_offering(
        program["org_id"],
        program_id,
        req.name,
        req.offering_type,
        slug=req.slug,
        stage_node_id=req.stage_node_id,
        description=req.description,
        start_date=req.start_date.isoformat() if req.start_date else None,
        end_date=req.end_date.isoformat() if req.end_date else None,
        registration_open=req.registration_open,
        approval_mode=req.approval_mode,
        signup_fields=[f.model_dump() for f in req.signup_fields] if req.signup_fields else None,
        platform_module=req.platform_module,
        registered_app_id=req.registered_app_id,
        external_runtime_url=req.external_runtime_url,
        participant_label_singular=req.participant_label_singular,
        participant_label_plural=req.participant_label_plural,
        metadata=req.metadata,
    )
    record_audit_event(
        "offering.created",
        org_id=program["org_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=row["id"],
        metadata={"name": row["name"], "offering_type": row["offering_type"]},
    )
    return _offering_response(row)


@router.get("/offerings/{offering_id}", response_model=OfferingResponse)
def get_offering_route(offering_id: str, user: PlatformUser = Depends(get_current_user)) -> OfferingResponse:
    row = get_offering(offering_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_org_member(user, row["organization_id"])
    return _offering_response(row)


@router.patch("/offerings/{offering_id}", response_model=OfferingResponse)
def patch_offering(
    offering_id: str,
    req: OfferingUpdate,
    user: PlatformUser = Depends(get_current_user),
) -> OfferingResponse:
    row = get_offering(offering_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_offering_admin(user, row["organization_id"], row["program_id"])
    patch = req.model_dump(exclude_unset=True)
    if patch.get("signup_fields") is not None:
        patch["signup_fields"] = [
            f if isinstance(f, dict) else f.model_dump() for f in patch["signup_fields"]
        ]
    for date_key in ("start_date", "end_date"):
        if patch.get(date_key) is not None and hasattr(patch[date_key], "isoformat"):
            patch[date_key] = patch[date_key].isoformat()
    updated = update_offering(offering_id, patch)
    record_audit_event(
        "offering.updated",
        org_id=row["organization_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=offering_id,
        metadata={"fields": sorted(patch.keys())},
    )
    return _offering_response(updated)


@router.post("/offerings/{offering_id}/publish", response_model=OfferingResponse)
def publish_offering(offering_id: str, user: PlatformUser = Depends(get_current_user)) -> OfferingResponse:
    row = get_offering(offering_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_offering_admin(user, row["organization_id"], row["program_id"])
    updated = set_offering_status(offering_id, "open")
    record_audit_event(
        "offering.published",
        org_id=row["organization_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=offering_id,
        metadata={"name": row["name"]},
    )
    return _offering_response(updated)


@router.post("/offerings/{offering_id}/close", response_model=OfferingResponse)
def close_offering(offering_id: str, user: PlatformUser = Depends(get_current_user)) -> OfferingResponse:
    row = get_offering(offering_id)
    if not row:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_offering_admin(user, row["organization_id"], row["program_id"])
    updated = set_offering_status(offering_id, "closed")
    record_audit_event(
        "offering.closed",
        org_id=row["organization_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=offering_id,
        metadata={"name": row["name"]},
    )
    return _offering_response(updated)


# ── Registered Apps ──────────────────────────────────────────────────────
@router.get("/programs/{program_id}/apps", response_model=list[AppResponse])
def get_apps(program_id: str, user: PlatformUser = Depends(get_current_user)) -> list[AppResponse]:
    program = get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _require_org_member(user, program["org_id"])
    return [_app_response(r) for r in list_registered_apps(program_id)]


@router.post("/programs/{program_id}/apps", response_model=AppWithKeyResponse)
def post_app(
    program_id: str,
    req: AppCreate,
    user: PlatformUser = Depends(get_current_user),
) -> AppWithKeyResponse:
    program = get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _require_offering_admin(user, program["org_id"], program_id)
    row, raw_key = create_registered_app(
        program["org_id"],
        program_id,
        req.app_name,
        app_slug=req.app_slug,
        offering_id=req.offering_id,
        allowed_identifiers=req.allowed_identifiers,
        launch_url=req.launch_url,
        launch_context=req.launch_context,
    )
    record_audit_event(
        "registered_app.created",
        org_id=program["org_id"],
        actor_user_id=user.id,
        scope_type="program",
        scope_id=program_id,
        target_type="registered_app",
        target_id=row["id"],
        metadata={"app_name": row["app_name"], "app_slug": row["app_slug"]},
    )
    return AppWithKeyResponse(**_app_response(row).model_dump(), api_key=raw_key)


@router.get("/apps/{app_id}", response_model=AppResponse)
def get_app_route(app_id: str, user: PlatformUser = Depends(get_current_user)) -> AppResponse:
    row = get_registered_app(app_id)
    if not row:
        raise HTTPException(status_code=404, detail="App not found")
    _require_org_member(user, row["organization_id"])
    return _app_response(row)


@router.patch("/apps/{app_id}", response_model=AppResponse)
def patch_app(app_id: str, req: AppUpdate, user: PlatformUser = Depends(get_current_user)) -> AppResponse:
    row = get_registered_app(app_id)
    if not row:
        raise HTTPException(status_code=404, detail="App not found")
    _require_offering_admin(user, row["organization_id"], row.get("program_id"))
    patch = req.model_dump(exclude_unset=True)
    updated = update_registered_app(app_id, patch)
    record_audit_event(
        "registered_app.updated",
        org_id=row["organization_id"],
        actor_user_id=user.id,
        target_type="registered_app",
        target_id=app_id,
        metadata={"fields": sorted(patch.keys())},
    )
    return _app_response(updated)


@router.post("/apps/{app_id}/rotate-key", response_model=AppWithKeyResponse)
def rotate_key(app_id: str, user: PlatformUser = Depends(get_current_user)) -> AppWithKeyResponse:
    row = get_registered_app(app_id)
    if not row:
        raise HTTPException(status_code=404, detail="App not found")
    _require_offering_admin(user, row["organization_id"], row.get("program_id"))
    updated, raw_key = rotate_app_api_key(app_id)
    record_audit_event(
        "registered_app.key_rotated",
        org_id=row["organization_id"],
        actor_user_id=user.id,
        target_type="registered_app",
        target_id=app_id,
        metadata={"app_name": row["app_name"]},
    )
    return AppWithKeyResponse(**_app_response(updated).model_dump(), api_key=raw_key)


@router.post("/apps/{app_id}/revoke", response_model=AppResponse)
def revoke_app_route(app_id: str, user: PlatformUser = Depends(get_current_user)) -> AppResponse:
    row = get_registered_app(app_id)
    if not row:
        raise HTTPException(status_code=404, detail="App not found")
    _require_offering_admin(user, row["organization_id"], row.get("program_id"))
    updated = revoke_app(app_id)
    record_audit_event(
        "registered_app.revoked",
        org_id=row["organization_id"],
        actor_user_id=user.id,
        target_type="registered_app",
        target_id=app_id,
        metadata={"app_name": row["app_name"]},
    )
    return _app_response(updated)


@router.get("/apps/{app_id}/launch-context", response_model=AppLaunchContextResponse)
def launch_context(app_id: str, user: PlatformUser = Depends(get_current_user)) -> AppLaunchContextResponse:
    row = get_registered_app(app_id)
    if not row:
        raise HTTPException(status_code=404, detail="App not found")
    _require_org_member(user, row["organization_id"])
    # Entitlement gate: the offering's platform module must be enabled for the org.
    module = "nexus_only"
    if row.get("offering_id"):
        offering = get_offering(row["offering_id"])
        if offering:
            module = offering.get("platform_module", "nexus_only")
    if not check_module_access(row["organization_id"], module):
        raise HTTPException(
            status_code=403,
            detail=f"The {module} module is disabled for this organization. Enable it in organization settings.",
        )
    token_row, raw_token = create_launch_token(app_id, user.id)
    membership = next((m for m in user.memberships if m.org_id == row["organization_id"]), None)
    context = {
        "organization_id": row["organization_id"],
        "program_id": row.get("program_id"),
        "offering_id": row.get("offering_id"),
        "group_id": membership.stage_node_id if membership else None,
        "role": membership.role if membership else None,
    }
    return AppLaunchContextResponse(
        app_slug=row["app_slug"],
        launch_url=row.get("launch_url"),
        launch_token=raw_token,
        expires_at=token_row["expires_at"],
        context=context,
    )


# ── Participants ─────────────────────────────────────────────────────────
@router.get("/offerings/{offering_id}/participants", response_model=list[ParticipantResponse])
def get_participants(
    offering_id: str,
    user: PlatformUser = Depends(get_current_user),
) -> list[ParticipantResponse]:
    offering = get_offering(offering_id)
    if not offering:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_offering_admin(user, offering["organization_id"], offering["program_id"])

    result = []
    for p in list_participants(offering_id):
        # Resolve a display name/email: linked profile first, else the
        # registration the participant came from (hook signups often have no
        # Nexus user yet).
        display_name = None
        email = None
        if p.get("user_id"):
            profile = get_profile(p["user_id"]) or {}
            display_name = profile.get("display_name") or profile.get("name")
            email = profile.get("email")
        if (not display_name or not email) and p.get("registration_id"):
            reg = get_registration(p["registration_id"]) or {}
            display_name = display_name or reg.get("name")
            email = email or reg.get("email")
        result.append(
            ParticipantResponse(
                id=p["id"],
                organization_id=p["organization_id"],
                program_id=p.get("program_id"),
                offering_id=p["offering_id"],
                stage_node_id=p.get("stage_node_id"),
                user_id=p.get("user_id"),
                participant_type=p.get("participant_type", "learner"),
                status=p.get("status", "active"),
                registration_id=p.get("registration_id"),
                display_name=display_name,
                email=email,
                created_at=p["created_at"],
            )
        )
    return result


# ── Registration admin (approval queue, direct add) ─────────────────────
@router.get("/offerings/{offering_id}/registrations", response_model=list[RegistrationResponse])
def get_registrations(
    offering_id: str,
    status: Optional[str] = Query(None),
    user: PlatformUser = Depends(get_current_user),
) -> list[RegistrationResponse]:
    offering = get_offering(offering_id)
    if not offering:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_offering_admin(user, offering["organization_id"], offering["program_id"])
    return [_registration_response(r) for r in list_registrations(offering_id, status)]


@router.post("/offerings/{offering_id}/registrations/admin-add", response_model=RegistrationResponse)
def admin_add_registration(
    offering_id: str,
    req: AdminAddRegistrationRequest,
    user: PlatformUser = Depends(get_current_user),
) -> RegistrationResponse:
    offering = get_offering(offering_id)
    if not offering:
        raise HTTPException(status_code=404, detail="Offering not found")
    _require_offering_admin(user, offering["organization_id"], offering["program_id"])

    profile = get_profile_by_email(req.email)
    row = create_registration(
        offering["organization_id"],
        offering_id,
        program_id=offering.get("program_id"),
        stage_node_id=req.stage_node_id or offering.get("stage_node_id"),
        registration_source="admin_add",
        email=req.email,
        phone=req.phone,
        name=req.name,
        age=req.age,
        user_id=profile["id"] if profile else None,
        status="directly_added",
        field_data=req.field_data,
        created_by_user_id=user.id,
    )
    create_participant(
        offering["organization_id"],
        offering_id,
        program_id=offering.get("program_id"),
        stage_node_id=row.get("stage_node_id"),
        user_id=row.get("user_id"),
        participant_type=req.participant_type,
        added_by_user_id=user.id,
        registration_id=row["id"],
    )
    record_audit_event(
        "registration.admin_added",
        org_id=offering["organization_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=offering_id,
        target_type="registration",
        target_id=row["id"],
        metadata={"email": req.email, "participant_type": req.participant_type},
    )
    return _registration_response(row)


@router.post("/registrations/{registration_id}/approve", response_model=RegistrationResponse)
def approve_registration_route(
    registration_id: str,
    user: PlatformUser = Depends(get_current_user),
) -> RegistrationResponse:
    reg = get_registration(registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    _require_offering_admin(user, reg["organization_id"], reg.get("program_id"))
    result = approve_registration(registration_id, user.id)
    record_audit_event(
        "registration.approved",
        org_id=reg["organization_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=reg["offering_id"],
        target_type="registration",
        target_id=registration_id,
        metadata={"name": reg.get("name"), "email": reg.get("email")},
    )
    return _registration_response(result["registration"])


@router.post("/registrations/{registration_id}/reject", response_model=RegistrationResponse)
def reject_registration_route(
    registration_id: str,
    user: PlatformUser = Depends(get_current_user),
) -> RegistrationResponse:
    reg = get_registration(registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    _require_offering_admin(user, reg["organization_id"], reg.get("program_id"))
    result = reject_registration(registration_id, user.id)
    record_audit_event(
        "registration.rejected",
        org_id=reg["organization_id"],
        actor_user_id=user.id,
        scope_type="offering",
        scope_id=reg["offering_id"],
        target_type="registration",
        target_id=registration_id,
        metadata={"name": reg.get("name"), "email": reg.get("email")},
    )
    return _registration_response(result)
