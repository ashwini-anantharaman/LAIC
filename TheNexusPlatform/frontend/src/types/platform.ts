export type SignupType = "org" | "administrator" | "teacher" | "student";
export type StageKey = "international" | "national" | "state" | "chapter";
export type JoinCodeKind = "student" | "teacher" | "administrator";
export type Permission = "Can Edit" | "Can View" | "Per Level";

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  access_token: string;
}

export interface MembershipSummary {
  id: string;
  org_id: string;
  org_name: string;
  role: string;
  stage_node_id?: string;
  stage_name?: string;
  stage_type?: StageKey;
  access: "view" | "edit";
}

export interface MeResponse {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  memberships: MembershipSummary[];
}

export interface DashboardStageTab {
  id: string;
  stage_type: StageKey;
  name: string;
  signup_count: number;
  event_at?: string;
  discord_url?: string;
  qualifier_status?: string;
}

export interface DashboardData {
  org_id: string;
  org_name: string;
  role_label: string;
  active_stage_id?: string;
  stages: DashboardStageTab[];
  total_signups: number;
  students: Array<{
    id: string;
    profile_id: string;
    display_name?: string;
    email?: string;
    stage_node_id: string;
    stage_name: string;
    registered_at: string;
  }>;
}

export interface JoinCode {
  id: string;
  code: string;
  kind: JoinCodeKind;
  org_id: string;
  stage_node_id: string;
  stage_name: string;
  org_name: string;
}

export function permissionToApi(p: Permission): "view" | "edit" | "per_level" {
  if (p === "Can Edit") return "edit";
  if (p === "Can View") return "view";
  return "per_level";
}
