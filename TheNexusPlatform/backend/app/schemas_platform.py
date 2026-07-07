from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

SignupType = Literal["org", "administrator", "teacher", "student"]
StageType = Literal["international", "national", "state", "chapter"]
AccessLevel = Literal["view", "edit", "per_level"]
MembershipRole = Literal["owner", "administrator", "teacher"]
JoinCodeKind = Literal["student", "teacher", "administrator"]
PermissionRole = Literal["administrator", "teacher"]


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


class OrgSetupRequest(BaseModel):
    has_challenge: bool = False
    challenge_name: Optional[str] = None
    stage_types: list[StageType] = Field(default_factory=list)
    permission_defaults: dict[PermissionRole, PermissionDefaultInput] = Field(default_factory=dict)
    initial_stages: list[StageNodeInput] = Field(default_factory=list)
    discord_link: Optional[str] = None


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
    children: list["StageNodeResponse"] = Field(default_factory=list)


StageNodeResponse.model_rebuild()


class JoinCodeResponse(BaseModel):
    id: str
    code: str
    kind: JoinCodeKind
    org_id: str
    stage_node_id: str
    stage_name: str
    org_name: str


class CreateJoinCodeRequest(BaseModel):
    kind: JoinCodeKind = "student"


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


class OrgChallengeResponse(BaseModel):
    org_id: str
    org_name: str
    enabled: bool
    name: Optional[str] = None
    stage_types: list[StageType] = Field(default_factory=list)


class RegisterViaJoinCodeRequest(BaseModel):
    display_name: Optional[str] = None
