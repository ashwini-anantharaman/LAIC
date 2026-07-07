"""Supabase Auth JWT verification and platform user context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .platform_permissions import Membership
from .supabase_client import create_ephemeral_client, require_admin_client, require_client

_bearer = HTTPBearer(auto_error=False)


@dataclass
class PlatformUser:
    id: str
    email: str
    display_name: Optional[str]
    role: str
    memberships: list[Membership]


def _row_to_membership(row: dict, stage_row: Optional[dict] = None) -> Membership:
    return Membership(
        id=row["id"],
        org_id=row["org_id"],
        profile_id=row["profile_id"],
        role=row["role"],
        stage_node_id=row.get("stage_node_id"),
        access=row.get("access", "view"),
        stage_path=stage_row.get("path") if stage_row else None,
        stage_type=stage_row.get("stage_type") if stage_row else None,
    )


def verify_token(token: str) -> dict:
    client = require_admin_client()
    try:
        resp = client.auth.get_user(token)
        if resp is None or resp.user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {
            "id": resp.user.id,
            "email": resp.user.email or "",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def load_platform_user(user_id: str, email: str) -> PlatformUser:
    from .platform_db import _use_local
    from . import platform_local_store as local

    if _use_local():
        profile = local.local_get_profile(user_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
        membership_rows = local.local_get_memberships(user_id)
        stage_map: dict[str, dict] = {}
        for m in membership_rows:
            org_id = m.get("org_id")
            if org_id:
                for s in local.local_list_stage_nodes(org_id):
                    stage_map[s.id] = s.__dict__
        memberships = [
            _row_to_membership(m, stage_map.get(m["stage_node_id"]) if m.get("stage_node_id") else None)
            for m in membership_rows
        ]
        return PlatformUser(
            id=user_id,
            email=email or profile.get("email", ""),
            display_name=profile.get("display_name") or profile.get("name"),
            role=profile.get("role", "student"),
            memberships=memberships,
        )

    client = require_client()

    profile_resp = client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    profiles = profile_resp.data or []
    if not profiles:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    profile = profiles[0]
    memberships_resp = (
        client.table("org_memberships").select("*").eq("profile_id", user_id).execute()
    )
    membership_rows = memberships_resp.data or []

    stage_ids = [m["stage_node_id"] for m in membership_rows if m.get("stage_node_id")]
    stage_map: dict[str, dict] = {}
    if stage_ids:
        stages_resp = client.table("stage_nodes").select("*").in_("id", stage_ids).execute()
        for s in stages_resp.data or []:
            stage_map[s["id"]] = s

    memberships = [
        _row_to_membership(m, stage_map.get(m["stage_node_id"]) if m.get("stage_node_id") else None)
        for m in membership_rows
    ]

    return PlatformUser(
        id=user_id,
        email=email or profile.get("email", ""),
        display_name=profile.get("display_name") or profile.get("name"),
        role=profile.get("role", "student"),
        memberships=memberships,
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> PlatformUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    auth = verify_token(credentials.credentials)
    return load_platform_user(auth["id"], auth["email"])


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[PlatformUser]:
    if credentials is None or not credentials.credentials:
        return None
    try:
        auth = verify_token(credentials.credentials)
        return load_platform_user(auth["id"], auth["email"])
    except HTTPException:
        return None


def create_auth_user(email: str, password: str) -> dict:
    client = require_admin_client()
    try:
        resp = client.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
            }
        )
        if resp.user is None:
            raise HTTPException(status_code=400, detail="Failed to create user")
        return {"id": resp.user.id, "email": resp.user.email or email}
    except HTTPException:
        raise
    except Exception as exc:
        msg = str(exc)
        if "already" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail="Email already registered") from exc
        raise HTTPException(status_code=400, detail=f"Signup failed: {msg}") from exc


def sign_in_user(email: str, password: str) -> dict:
    # Ephemeral client so login never overwrites the admin client's service-role session.
    client = create_ephemeral_client()
    try:
        resp = client.auth.sign_in_with_password({"email": email, "password": password})
        if resp.session is None or resp.user is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {
            "id": resp.user.id,
            "email": resp.user.email or email,
            "access_token": resp.session.access_token,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid credentials") from exc
