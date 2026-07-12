"""Bridge context endpoint mapping tests (no Supabase needed — auth is
dependency-overridden with synthetic PlatformUsers)."""

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.platform_auth import PlatformUser, get_current_user
from app.platform_permissions import Membership


def _user(role: str | None, email: str = "u@example.com", stage: str | None = "stage-1") -> PlatformUser:
    memberships = []
    if role is not None:
        memberships = [Membership(
            id="m1", org_id="org-abc", profile_id="u1", role=role,
            stage_node_id=stage, access="view",
        )]
    return PlatformUser(id="u1", email=email, display_name="U", role="student", memberships=memberships)


def _ctx(user: PlatformUser) -> dict:
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        client = TestClient(app)
        resp = client.get("/api/platform/bridge/context")
        assert resp.status_code == 200, resp.text
        return resp.json()
    finally:
        app.dependency_overrides.clear()


def test_student_maps_to_learner_with_org_and_group_scope():
    ctx = _ctx(_user("student"))
    assert ctx["roles"] == ["bridge_learner"]
    assert ctx["accessLevel"] == "learner"
    assert ctx["programId"] == "bridge_program"
    assert ctx["programOrganizationId"] == "org-abc"
    assert ctx["groupId"] == "stage-1"
    assert "bridge.progress.read_own" in ctx["permissions"]


def test_teacher_maps_to_coach_and_owner_to_org_admin():
    assert _ctx(_user("teacher"))["roles"] == ["bridge_coach"]
    admin = _ctx(_user("owner"))
    assert admin["roles"] == ["bridge_org_admin"]
    assert admin["accessLevel"] == "admin"


def test_config_seeded_program_roles():
    settings = get_settings()
    settings.bridge_program_admin_emails = "paul@example.com"
    settings.bridge_reviewer_emails = "rhea@example.com"
    try:
        paul = _ctx(_user(None, email="paul@example.com"))
        assert paul["roles"] == ["bridge_program_admin"]
        assert paul["accessLevel"] == "admin"
        assert paul["programOrganizationId"] is None  # program-wide scope

        rhea = _ctx(_user(None, email="rhea@example.com"))
        assert set(rhea["roles"]) == {"bridge_reviewer", "bridge_fellow"}
        assert rhea["accessLevel"] == "reviewer"

        # Org-scoped user who is ALSO program admin keeps program-wide power
        # but the shape stays valid.
        both = _ctx(_user("student", email="paul@example.com"))
        assert "bridge_program_admin" in both["roles"] and "bridge_learner" in both["roles"]
        assert both["accessLevel"] == "admin"
    finally:
        settings.bridge_program_admin_emails = ""
        settings.bridge_reviewer_emails = ""


def test_no_memberships_is_guest():
    ctx = _ctx(_user(None))
    assert ctx["roles"] == ["bridge_guest"]
    assert ctx["accessLevel"] == "guest"
