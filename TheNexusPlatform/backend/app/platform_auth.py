"""Supabase Auth JWT verification and platform user context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import platform_local_store as local
from .config import get_settings
from .platform_permissions import Membership
from .supabase_client import create_ephemeral_client, require_admin_client, require_client

_bearer = HTTPBearer(auto_error=False)


def _demo_mode() -> bool:
    """Run the whole platform locally (demo mode) when Supabase isn't configured
    OR isn't reachable / not migrated. Mirrors platform_db's local-store fallback
    so auth and data storage always agree on which backend is in use."""
    if not get_settings().supabase_enabled:
        return True
    from . import platform_db  # lazy import to avoid a circular dependency

    try:
        return platform_db._use_local()
    except Exception:
        return True


@dataclass
class PlatformUser:
    id: str
    email: str
    display_name: Optional[str]
    role: str
    memberships: list[Membership]


_ROLE_ALIASES = {"teacher": "instructor"}


def _row_to_membership(row: dict, stage_row: Optional[dict] = None) -> Membership:
    return Membership(
        id=row["id"],
        org_id=row["org_id"],
        profile_id=row["profile_id"],
        role=_ROLE_ALIASES.get(row["role"], row["role"]),
        stage_node_id=row.get("stage_node_id"),
        access=row.get("access", "view"),
        stage_path=stage_row.get("path") if stage_row else None,
        stage_type=stage_row.get("stage_type") if stage_row else None,
        program_id=row.get("program_id"),
    )


def verify_token(token: str) -> dict:
    if _demo_mode():
        user = local.local_auth_get_user(token)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user
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
    if _demo_mode():
        return local.local_auth_create_user(email, password)
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


@dataclass
class AuthenticatedApp:
    """Resolved identity for a Registered App calling the signup hook. A distinct
    principal type from PlatformUser — an app's API key, not a user session."""

    id: str
    organization_id: str
    program_id: Optional[str]
    offering_id: Optional[str]
    app_slug: str
    allowed_identifiers: str
    status: str
    launch_url: Optional[str]
    launch_context: dict


def get_authenticated_app(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> AuthenticatedApp:
    """Bearer-token auth for /api/hook/* — a per-app API key, verified against
    registered_apps.api_key_hash. Separate from get_current_user by design.
    TODO(rate-limit): no throttling infra exists in this repo yet; add a per-app
    rate limit here before the hook is exposed to untrusted third-party apps."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="App API key required")
    from . import platform_db

    row = platform_db.get_registered_app_by_hash(local.hash_api_key(credentials.credentials))
    if not row or row.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked app API key")
    return AuthenticatedApp(
        id=row["id"],
        organization_id=row["organization_id"],
        program_id=row.get("program_id"),
        offering_id=row.get("offering_id"),
        app_slug=row["app_slug"],
        allowed_identifiers=row.get("allowed_identifiers", "email"),
        status=row["status"],
        launch_url=row.get("launch_url"),
        launch_context=row.get("launch_context") or {},
    )


def exchange_launch_token(raw_token: str) -> dict:
    """Swap a short-lived, single-use launch token (minted by
    GET /api/apps/{id}/launch-context for one specific user) for a real session
    access_token. Deliberately simple — no OAuth/PKCE: the token was already tied
    to a user_id at issuance, so a successful consume just mints that user a fresh
    session. Replaces handing a long-lived platform session token in a URL."""
    from . import platform_db

    consumed = platform_db.consume_launch_token(raw_token)
    if not consumed:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired launch token")
    user_id = consumed["user_id"]

    if _demo_mode():
        # Demo-mode access tokens are the user id itself (see local_auth_sign_in).
        return {"access_token": user_id}

    profile = platform_db.get_profile(user_id)
    email = (profile or {}).get("email")
    if not email:
        raise HTTPException(status_code=500, detail="Could not resolve user for launch token")
    try:
        admin = require_admin_client()
        link = admin.auth.admin.generate_link({"type": "magiclink", "email": email})
        token_hash = link.properties.hashed_token
        ephemeral = create_ephemeral_client()
        verified = ephemeral.auth.verify_otp({"token_hash": token_hash, "type": "magiclink"})
        if verified.session is None:
            raise HTTPException(status_code=500, detail="Failed to mint session from launch token")
        return {"access_token": verified.session.access_token}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to exchange launch token: {exc}") from exc


def sign_in_user(email: str, password: str) -> dict:
    if _demo_mode():
        return local.local_auth_sign_in(email, password)
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
