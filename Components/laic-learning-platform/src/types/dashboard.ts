export interface DashboardSummary {
  courseTitle: string;
  totalEnrolled: number;
  activeThisWeek: number;
  avgMasteryPercent: number;
  conceptsMasteredTotal: number;
  recentMisconceptionCount: number;
}

export interface DashboardStudent {
  userId: string;
  name: string;
  levels: Record<string, string>;
  bktScores: Record<string, number>;
}

export interface DashboardMisconception {
  conceptId: string;
  conceptName: string;
  issue: string;
  studentCount: number;
  severity: "high" | "medium" | "low";
}

export interface DashboardModeUsage {
  mode: string;
  modeLabel: string;
  switchedAwayCount: number;
  switchedAwayPercent: number;
}

export interface DashboardConceptProgress {
  conceptId: string;
  name: string;
  engagedPercent: number;
  masteredPercent: number;
}

export interface DashboardQuizStruggle {
  questionId: string;
  questionPreview: string;
  conceptId: string;
  conceptName: string;
  wrongAttempts: number;
  studentCount: number;
}

export interface DashboardPayload {
  summary?: DashboardSummary;
  students?: DashboardStudent[];
  misconceptionLog?: DashboardMisconception[];
  modeUsage?: DashboardModeUsage[];
  conceptProgress?: DashboardConceptProgress[];
  quizStruggles?: DashboardQuizStruggle[];
  suggestions?: { text: string; action: string }[];
  fetchedAt?: string;
  totalModeSwitches?: number;
}
