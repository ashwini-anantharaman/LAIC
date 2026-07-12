from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

SignupType = Literal["org", "administrator", "teacher", "student"]
StageType = Literal["international", "national", "state", "chapter"]
AccessLevel = Literal["view", "edit", "per_level"]
# Stored membership role. "teacher" is renamed to the canonical "instructor" per the
# Nexus addendum; the public-facing signup vocabulary ("Teacher"/"Coach" by category)
# still comes from role_label(), not from this stored value.
MembershipRole = Literal["owner", "administrator", "instructor"]
JoinCodeKind = Literal["student", "teacher", "administrator"]
PermissionRole = Literal["administrator", "teacher"]
ProgramCategory = Literal["game", "edu"]
DeliveryMethod = Literal["join_code", "email_direct"]
IntegrationType = Literal["discord"]
IntegrationPermissionLevel = Literal["can_edit", "can_view", "per_level"]


class ProgramInput(BaseModel):
    name: str
    category: ProgramCategory
    description: Optional[str] = None
    icon: Optional[str] = None
    # Configurable per-program overrides for the instructor/learner display words
    # (defaults are derived from category in role_label() when unset).
    instructor_label: Optional[str] = None
    learner_label: Optional[str] = None
    # Edu: which single stage level this program's admin group tree is rooted at.
    stage_type: Optional[StageType] = None
    # Game: flat "class" names for this program (no multi-level hierarchy).
    class_names: list[str] = Field(default_factory=list)


class ProgramResponse(BaseModel):
    id: str
    org_id: str
    name: str
    category: ProgramCategory
    description: Optional[str] = None
    icon: Optional[str] = None
    instructor_label: Optional[str] = None
    learner_label: Optional[str] = None
    course_count: int = 0
    learner_count: int = 0
    instructor_count: int = 0


class PerLevelOverrides(BaseModel):
    international: Optional[Literal["view", "edit"]] = None
    national: Optional[Literal["view", "edit"]] = None
    state: Optional[Literal["view", "edit"]] = None
    chapter: Optional[Literal["view", "edit"]] = None


class PermissionDefaultInput(BaseModel):
    default_access: AccessLevel
    per_level_overrides: Optional[dict[str, Literal["view", "edit"]]] = None


class StageNodeInput(BaseModel):
    stage_type: StageType
    name: str
    discord_url: Optional[str] = None
    event_at: Optional[datetime] = None
    program_id: Optional[str] = None
    children: list["StageNodeInput"] = Field(default_factory=list)


StageNodeInput.model_rebuild()


class OrgSignupRequest(BaseModel):
    signup_type: Literal["org"] = "org"
    org_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: Optional[str] = None


class MemberSignupRequest(BaseModel):
    signup_type: Literal["administrator", "teacher"]
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: Optional[str] = None
    join_code: str


class SignupRequest(BaseModel):
    signup_type: SignupType
    org_name: Optional[str] = None
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: Optional[str] = None
    join_code: Optional[str] = None


class AuthUserResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str
    access_token: str


class MembershipSummary(BaseModel):
    id: str
    org_id: str
    org_name: str
    role: MembershipRole
    stage_node_id: Optional[str] = None
    stage_name: Optional[str] = None
    stage_type: Optional[StageType] = None
    access: Literal["view", "edit"]
    program_id: Optional[str] = None
    program_name: Optional[str] = None
    program_category: Optional[ProgramCategory] = None
    registered_app_id: Optional[str] = None
    app_launch_url: Optional[str] = None


class MeResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str
    memberships: list[MembershipSummary] = Field(default_factory=list)


class CreateOrgRequest(BaseModel):
    name: str


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    owner_id: Optional[str] = None
    theme_accent_color: Optional[str] = None
    theme_logo_url: Optional[str] = None


class OrgThemeUpdateRequest(BaseModel):
    accent_color: Optional[str] = None
    logo_url: Optional[str] = None


class OrgSetupRequest(BaseModel):
    has_challenge: bool = False
    challenge_name: Optional[str] = None
    stage_types: list[StageType] = Field(default_factory=list)
    permission_defaults: dict[PermissionRole, PermissionDefaultInput] = Field(default_factory=dict)
    initial_stages: list[StageNodeInput] = Field(default_factory=list)
    discord_link: Optional[str] = None
    discord_permission_level: Optional[IntegrationPermissionLevel] = None
    programs: list[ProgramInput] = Field(default_factory=list)


class StageNodeResponse(BaseModel):
    id: str
    org_id: str
    parent_id: Optional[str] = None
    stage_type: StageType
    name: str
    depth: int
    path: str
    discord_url: Optional[str] = None
    event_at: Optional[datetime] = None
    qualifier_status: Optional[str] = None
    program_id: Optional[str] = None
    children: list["StageNodeResponse"] = Field(default_factory=list)


StageNodeResponse.model_rebuild()


class JoinCodeResponse(BaseModel):
    id: str
    code: Optional[str] = None
    kind: JoinCodeKind
    org_id: str
    stage_node_id: Optional[str] = None
    stage_name: Optional[str] = None
    org_name: str
    program_id: Optional[str] = None
    program_name: Optional[str] = None
    program_category: Optional[ProgramCategory] = None
    delivery_method: DeliveryMethod = "join_code"
    email: Optional[str] = None
    max_uses: Optional[int] = None
    uses_remaining: Optional[int] = None
    expires_at: Optional[datetime] = None
    redeem_url: Optional[str] = None


class CreateJoinCodeRequest(BaseModel):
    kind: JoinCodeKind = "student"
    delivery_method: DeliveryMethod = "join_code"
    email: Optional[EmailStr] = None
    max_uses: Optional[int] = None
    expires_at: Optional[datetime] = None


# ── Integration entity (generic — not hardcoded to Discord) ─────────────────
class IntegrationInput(BaseModel):
    integration_type: IntegrationType
    config: dict = Field(default_factory=dict)
    permission_level: IntegrationPermissionLevel = "per_level"
    program_id: Optional[str] = None


class IntegrationResponse(BaseModel):
    id: str
    organization_id: str
    program_id: Optional[str] = None
    integration_type: IntegrationType
    config: dict = Field(default_factory=dict)
    permission_level: IntegrationPermissionLevel
    status: str = "active"


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["administrator", "teacher"]
    stage_node_id: str
    access: Literal["view", "edit"] = "view"


class UpdateMemberRequest(BaseModel):
    access: Literal["view", "edit"]


class MemberResponse(BaseModel):
    id: str
    profile_id: str
    email: str
    display_name: Optional[str] = None
    role: MembershipRole
    stage_node_id: Optional[str] = None
    stage_name: Optional[str] = None
    access: Literal["view", "edit"]


class StudentRegistrationResponse(BaseModel):
    id: str
    profile_id: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    stage_node_id: str
    stage_name: str
    registered_at: datetime


class DashboardStageTab(BaseModel):
    id: str
    stage_type: StageType
    name: str
    signup_count: int = 0
    event_at: Optional[datetime] = None
    discord_url: Optional[str] = None
    qualifier_status: Optional[str] = None


class DashboardResponse(BaseModel):
    org_id: str
    org_name: str
    role_label: str
    active_stage_id: Optional[str] = None
    stages: list[DashboardStageTab] = Field(default_factory=list)
    total_signups: int = 0
    students: list[StudentRegistrationResponse] = Field(default_factory=list)
    theme_accent_color: Optional[str] = None
    theme_logo_url: Optional[str] = None


class OrgChallengeResponse(BaseModel):
    org_id: str
    org_name: str
    enabled: bool
    name: Optional[str] = None
    stage_types: list[StageType] = Field(default_factory=list)


class RegisterViaJoinCodeRequest(BaseModel):
    display_name: Optional[str] = None


# ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
OfferingType = Literal["course", "challenge", "app", "cohort", "class", "event", "assessment", "pilot"]
OfferingStatus = Literal["draft", "private_beta", "open", "closed", "completed", "archived"]
ApprovalMode = Literal["auto_approve", "manual_approve"]
PlatformModule = Literal["nexus_only", "learning", "coaching", "bridge", "mixed"]
AllowedIdentifiers = Literal["email", "phone", "both"]
AppStatus = Literal["active", "paused", "revoked"]
RegistrationSource = Literal["app_hook", "admin_add", "coach_add", "invite_link", "bulk_import"]
RegistrationStatus = Literal[
    "pending_review", "approved", "rejected", "waitlisted", "withdrawn", "directly_added"
]
ParticipantType = Literal["learner", "coach", "reviewer", "advisor", "volunteer", "organizer", "instructor"]
ParticipantStatus = Literal["active", "inactive", "completed", "removed"]
SignupFieldType = Literal["text", "number", "email", "phone", "select", "boolean"]


class SignupFieldDef(BaseModel):
    key: str
    label: str
    type: SignupFieldType = "text"
    required: bool = False
    options: Optional[list[str]] = None


DEFAULT_SIGNUP_FIELDS: list[dict] = [
    {"key": "name", "label": "Name", "type": "text", "required": True},
    {"key": "age", "label": "Age", "type": "number", "required": False},
    {"key": "email", "label": "Email", "type": "email", "required": True},
]


class OfferingCreate(BaseModel):
    name: str
    offering_type: OfferingType
    slug: Optional[str] = None
    stage_node_id: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_open: bool = False
    approval_mode: ApprovalMode = "manual_approve"
    signup_fields: Optional[list[SignupFieldDef]] = None
    platform_module: PlatformModule = "nexus_only"
    registered_app_id: Optional[str] = None
    external_runtime_url: Optional[str] = None
    participant_label_singular: Optional[str] = None
    participant_label_plural: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class OfferingUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[OfferingStatus] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_open: Optional[bool] = None
    approval_mode: Optional[ApprovalMode] = None
    signup_fields: Optional[list[SignupFieldDef]] = None
    platform_module: Optional[PlatformModule] = None
    registered_app_id: Optional[str] = None
    external_runtime_url: Optional[str] = None
    participant_label_singular: Optional[str] = None
    participant_label_plural: Optional[str] = None
    metadata: Optional[dict] = None


class OfferingResponse(BaseModel):
    id: str
    organization_id: str
    program_id: str
    stage_node_id: Optional[str] = None
    name: str
    slug: str
    offering_type: OfferingType
    status: OfferingStatus
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_open: bool
    approval_mode: ApprovalMode
    signup_fields: list[SignupFieldDef] = Field(default_factory=list)
    platform_module: PlatformModule
    registered_app_id: Optional[str] = None
    external_runtime_url: Optional[str] = None
    participant_label_singular: Optional[str] = None
    participant_label_plural: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    registration_count: int = 0
    pending_count: int = 0
    participant_count: int = 0


class AppCreate(BaseModel):
    app_name: str
    app_slug: Optional[str] = None
    offering_id: Optional[str] = None
    allowed_identifiers: AllowedIdentifiers = "email"
    launch_url: Optional[str] = None
    launch_context: dict = Field(default_factory=dict)


class AppUpdate(BaseModel):
    app_name: Optional[str] = None
    offering_id: Optional[str] = None
    allowed_identifiers: Optional[AllowedIdentifiers] = None
    status: Optional[AppStatus] = None
    launch_url: Optional[str] = None
    launch_context: Optional[dict] = None


class AppResponse(BaseModel):
    id: str
    organization_id: str
    program_id: Optional[str] = None
    offering_id: Optional[str] = None
    app_name: str
    app_slug: str
    key_prefix: Optional[str] = None
    allowed_identifiers: AllowedIdentifiers
    status: AppStatus
    launch_url: Optional[str] = None
    launch_context: dict = Field(default_factory=dict)


class AppWithKeyResponse(AppResponse):
    api_key: str


class AppLaunchContextResponse(BaseModel):
    app_slug: str
    launch_url: Optional[str] = None
    launch_token: str
    expires_at: datetime
    context: dict = Field(default_factory=dict)


class LaunchExchangeRequest(BaseModel):
    launch_token: str


class HookRegistrationRequest(BaseModel):
    offering_id: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    field_data: dict = Field(default_factory=dict)


class AdminAddRegistrationRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    stage_node_id: Optional[str] = None
    participant_type: ParticipantType = "learner"
    field_data: dict = Field(default_factory=dict)


class RegistrationResponse(BaseModel):
    id: str
    organization_id: str
    program_id: Optional[str] = None
    offering_id: str
    stage_node_id: Optional[str] = None
    registered_app_id: Optional[str] = None
    registration_source: RegistrationSource
    email: Optional[str] = None
    phone: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    user_id: Optional[str] = None
    status: RegistrationStatus
    field_data: dict = Field(default_factory=dict)
    reviewed_by_user_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime


class ParticipantResponse(BaseModel):
    id: str
    organization_id: str
    program_id: Optional[str] = None
    offering_id: str
    stage_node_id: Optional[str] = None
    user_id: Optional[str] = None
    participant_type: ParticipantType
    status: ParticipantStatus
    registration_id: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime


class SignupFieldsResponse(BaseModel):
    offering_id: str
    offering_name: str
    registration_open: bool
    fields: list[SignupFieldDef]


# ── Audit Log + Entitlements (Nexus v0.3 Sections 32 / 20) ──────────────────
ModuleKey = Literal["nexus", "learning", "coaching", "analytics"]
EntitlementStatus = Literal["active", "trial", "requested", "disabled"]


class AuditEventResponse(BaseModel):
    id: str
    organization_id: Optional[str] = None
    actor_user_id: Optional[str] = None
    actor_name: Optional[str] = None
    action: str
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


class EntitlementResponse(BaseModel):
    id: str
    organization_id: str
    subject_type: Literal["organization", "program", "offering"]
    subject_id: str
    module: ModuleKey
    status: EntitlementStatus
    limits: dict = Field(default_factory=dict)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class SetEntitlementRequest(BaseModel):
    status: EntitlementStatus
