"""The Signup Hook — apps push registrations here using a per-app API key.

Distinct from routers/platform.py (user-session auth) and routers/offerings.py
(admin CRUD, also user-session auth): every endpoint here authenticates via
Depends(get_authenticated_app) — a Registered App's API key, not a user token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..platform_auth import AuthenticatedApp, get_authenticated_app
from ..platform_db import (
    approve_registration,
    create_registration,
    get_offering,
    get_registration,
    record_audit_event,
)
from ..schemas_platform import (
    HookRegistrationRequest,
    RegistrationResponse,
    SignupFieldDef,
    SignupFieldsResponse,
)

router = APIRouter(prefix="/api/hook", tags=["hook"])


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


def _resolve_offering(app: AuthenticatedApp, offering_id: str) -> dict:
    offering = get_offering(offering_id)
    if not offering or offering["organization_id"] != app.organization_id:
        raise HTTPException(status_code=404, detail="Offering not found")
    if app.offering_id and app.offering_id != offering_id:
        raise HTTPException(status_code=403, detail="This app is not registered for that offering")
    return offering


def _validate_field_data(offering: dict, field_data: dict) -> None:
    for f in offering.get("signup_fields") or []:
        if f.get("required") and not field_data.get(f["key"]):
            raise HTTPException(status_code=400, detail=f"Missing required field: {f['key']}")


@router.get("/signup-fields", response_model=SignupFieldsResponse)
def signup_fields(
    appSlug: str = Query(...),
    offeringId: str = Query(...),
    app: AuthenticatedApp = Depends(get_authenticated_app),
) -> SignupFieldsResponse:
    if appSlug != app.app_slug:
        raise HTTPException(status_code=403, detail="App slug does not match the provided API key")
    offering = _resolve_offering(app, offeringId)
    fields = [SignupFieldDef(**f) for f in (offering.get("signup_fields") or [])]
    return SignupFieldsResponse(
        offering_id=offering["id"],
        offering_name=offering["name"],
        registration_open=offering.get("registration_open", False),
        fields=fields,
    )


@router.post("/registrations", response_model=RegistrationResponse)
def submit_registration(
    req: HookRegistrationRequest,
    app: AuthenticatedApp = Depends(get_authenticated_app),
) -> RegistrationResponse:
    offering = _resolve_offering(app, req.offering_id)
    if not offering.get("registration_open") or offering.get("status") not in ("open", "private_beta"):
        raise HTTPException(status_code=400, detail="This offering is not accepting registrations")

    if app.allowed_identifiers == "email" and not req.email:
        raise HTTPException(status_code=400, detail="This app requires an email")
    if app.allowed_identifiers == "phone" and not req.phone:
        raise HTTPException(status_code=400, detail="This app requires a phone number")

    field_data = dict(req.field_data or {})
    field_data.setdefault("name", req.name)
    field_data.setdefault("age", req.age)
    field_data.setdefault("email", req.email)
    _validate_field_data(offering, field_data)

    row = create_registration(
        app.organization_id,
        offering["id"],
        program_id=offering.get("program_id"),
        stage_node_id=offering.get("stage_node_id"),
        registered_app_id=app.id,
        registration_source="app_hook",
        email=req.email,
        phone=req.phone,
        name=req.name,
        age=req.age,
        field_data=field_data,
        status="pending_review",
    )

    record_audit_event(
        "registration.hook_received",
        org_id=app.organization_id,
        scope_type="offering",
        scope_id=offering["id"],
        target_type="registration",
        target_id=row["id"],
        metadata={"app_slug": app.app_slug, "name": req.name, "email": req.email},
    )

    if offering.get("approval_mode") == "auto_approve":
        result = approve_registration(row["id"], reviewer_id=None)
        row = result["registration"]
        record_audit_event(
            "registration.approved",
            org_id=app.organization_id,
            scope_type="offering",
            scope_id=offering["id"],
            target_type="registration",
            target_id=row["id"],
            metadata={"auto": True, "app_slug": app.app_slug},
        )

    return _registration_response(row)


@router.get("/registrations/{registration_id}", response_model=RegistrationResponse)
def get_registration_status(
    registration_id: str,
    app: AuthenticatedApp = Depends(get_authenticated_app),
) -> RegistrationResponse:
    row = get_registration(registration_id)
    if not row or row.get("organization_id") != app.organization_id:
        raise HTTPException(status_code=404, detail="Registration not found")
    return _registration_response(row)
