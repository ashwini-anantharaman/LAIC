export interface MembershipSummary {
  id: string;
  org_id: string;
  org_name: string;
  role: string;
  access: "view" | "edit";
  program_id?: string;
  program_name?: string;
  program_category?: "game" | "edu";
}

export interface MeResponse {
  id: string;
  email: string;
  display_name?: string;
  role: string;
  memberships: MembershipSummary[];
}

export interface ScenarioStep {
  narration: string;
  dialogue?: string | null;
}

export interface Scenario {
  id: string;
  program_id: string;
  game_type: string;
  prompt: string;
  title: string;
  setup: string;
  steps: ScenarioStep[];
  outcome: string;
  created_at: string;
}
