import type { MasteryLevel } from "../types/mastery.js";

const LEVEL_SCORE: Record<string, number> = {
  "not-seen": 0,
  exposed: 25,
  practiced: 50,
  understood: 75,
  mastered: 100,
};

const MODE_LABELS: Record<string, string> = {
  textbook: "📖 Textbook",
  "real-world": "🌍 Real World",
  conversational: "💡 Conversational",
};

export interface DashboardStudent {
  userId: string;
  name: string;
  levels: Record<string, string>;
  bktScores: Record<string, number>;
}

export interface DashboardSummary {
  courseTitle: string;
  totalEnrolled: number;
  activeThisWeek: number;
  avgMasteryPercent: number;
  conceptsMasteredTotal: number;
  recentMisconceptionCount: number;
}

export interface MisconceptionSummary {
  conceptId: string;
  conceptName: string;
  issue: string;
  studentCount: number;
  severity: "high" | "medium" | "low";
}

export interface ModeUsageRow {
  mode: string;
  modeLabel: string;
  switchedAwayCount: number;
  switchedAwayPercent: number;
}

export interface ConceptProgressRow {
  conceptId: string;
  name: string;
  engagedPercent: number;
  masteredPercent: number;
}

export interface QuizStruggleRow {
  questionId: string;
  questionPreview: string;
  conceptId: string;
  conceptName: string;
  wrongAttempts: number;
  studentCount: number;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function masteryScore(level: string): number {
  return LEVEL_SCORE[level] ?? 0;
}

export function buildDashboardAnalytics(input: {
  courseTitle: string;
  enrollments: { user_id: string; profiles?: { display_name: string } | null }[];
  mastery: {
    user_id: string;
    concept_id: string;
    level: string;
    bkt_score?: number;
    updated_at?: string;
    profiles?: { display_name: string } | null;
  }[];
  misconceptions: {
    user_id: string;
    concept_id: string;
    question_id: string;
    wrong_answer: string;
    description?: string | null;
    created_at?: string;
  }[];
  modeSwitches: {
    user_id: string;
    from_mode: string;
    to_mode: string;
    created_at?: string;
  }[];
  reflections: { user_id: string; concept_id: string; created_at?: string }[];
  concepts: { id: string; name: string }[];
}) {
  const conceptNames = Object.fromEntries(input.concepts.map((c) => [c.id, c.name]));
  const weekAgo = daysAgo(7);

  const students: DashboardStudent[] = input.enrollments.map((e) => ({
    userId: e.user_id,
    name: e.profiles?.display_name ?? `Student ${e.user_id.slice(0, 6)}`,
    levels: {},
    bktScores: {},
  }));

  const studentById = new Map(students.map((s) => [s.userId, s]));

  for (const m of input.mastery) {
    let student = studentById.get(m.user_id);
    if (!student) {
      student = {
        userId: m.user_id,
        name: m.profiles?.display_name ?? `Student ${m.user_id.slice(0, 6)}`,
        levels: {},
        bktScores: {},
      };
      students.push(student);
      studentById.set(m.user_id, student);
    }
    student.levels[m.concept_id] = m.level;
    student.bktScores[m.concept_id] = Number(m.bkt_score ?? 0);
  }

  const activeIds = new Set<string>();
  for (const m of input.mastery) {
    if (m.updated_at && m.updated_at >= weekAgo) activeIds.add(m.user_id);
  }
  for (const r of input.reflections) {
    if (r.created_at && r.created_at >= weekAgo) activeIds.add(r.user_id);
  }
  for (const s of input.modeSwitches) {
    if (s.created_at && s.created_at >= weekAgo) activeIds.add(s.user_id);
  }
  for (const m of input.misconceptions) {
    if (m.created_at && m.created_at >= weekAgo) activeIds.add(m.user_id);
  }

  const enrolled = students.length;
  const conceptIds = input.concepts.map((c) => c.id);

  let scoreSum = 0;
  let scoreCount = 0;
  let conceptsMasteredTotal = 0;

  for (const m of input.mastery) {
    scoreSum += masteryScore(m.level);
    scoreCount++;
    if (m.level === "mastered") conceptsMasteredTotal++;
  }

  const avgMasteryPercent = scoreCount ? Math.round(scoreSum / scoreCount) : 0;

  for (const student of students) {
    for (const cid of conceptIds) {
      // ensure heatmap levels map includes defaults
      if (!student.levels[cid]) student.levels[cid] = "not-seen";
    }
  }

  const miscGroups = new Map<
    string,
    { conceptId: string; issue: string; users: Set<string> }
  >();
  for (const m of input.misconceptions) {
    const issue = m.description?.trim() || m.wrong_answer?.trim() || "Unknown misconception";
    const key = `${m.concept_id}::${issue}`;
    if (!miscGroups.has(key)) {
      miscGroups.set(key, { conceptId: m.concept_id, issue, users: new Set() });
    }
    miscGroups.get(key)!.users.add(m.user_id);
  }

  const misconceptionLog: MisconceptionSummary[] = [...miscGroups.values()]
    .map((g) => {
      const count = g.users.size;
      return {
        conceptId: g.conceptId,
        conceptName: conceptNames[g.conceptId] ?? g.conceptId,
        issue: g.issue,
        studentCount: count,
        severity: (count >= 3 ? "high" : count >= 2 ? "medium" : "low") as MisconceptionSummary["severity"],
      };
    })
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 8);

  const recentMisconceptionCount = input.misconceptions.filter(
    (m) => m.created_at && m.created_at >= weekAgo
  ).length;

  const fromModeCounts: Record<string, number> = {
    textbook: 0,
    "real-world": 0,
    conversational: 0,
  };
  for (const s of input.modeSwitches) {
    if (s.from_mode in fromModeCounts) fromModeCounts[s.from_mode]++;
  }
  const totalSwitches = Object.values(fromModeCounts).reduce((a, b) => a + b, 0);

  const modeUsage: ModeUsageRow[] = (["textbook", "real-world", "conversational"] as const).map(
    (mode) => ({
      mode,
      modeLabel: MODE_LABELS[mode] ?? mode,
      switchedAwayCount: fromModeCounts[mode],
      switchedAwayPercent: totalSwitches
        ? Math.round((fromModeCounts[mode] / totalSwitches) * 100)
        : 0,
    })
  );

  const conceptProgress: ConceptProgressRow[] = input.concepts.map((c) => {
    let engaged = 0;
    let mastered = 0;
    for (const student of students) {
      const level = (student.levels[c.id] ?? "not-seen") as MasteryLevel;
      if (level !== "not-seen") engaged++;
      if (level === "mastered") mastered++;
    }
    const denom = enrolled || 1;
    return {
      conceptId: c.id,
      name: c.name,
      engagedPercent: Math.round((engaged / denom) * 100),
      masteredPercent: Math.round((mastered / denom) * 100),
    };
  });

  const quizGroups = new Map<
    string,
    { questionId: string; conceptId: string; preview: string; users: Set<string>; count: number }
  >();
  for (const m of input.misconceptions) {
    const key = m.question_id || `${m.concept_id}::${m.wrong_answer}`;
    if (!quizGroups.has(key)) {
      quizGroups.set(key, {
        questionId: m.question_id,
        conceptId: m.concept_id,
        preview: m.description?.slice(0, 80) || m.wrong_answer?.slice(0, 80) || "Quiz question",
        users: new Set(),
        count: 0,
      });
    }
    const g = quizGroups.get(key)!;
    g.count++;
    g.users.add(m.user_id);
  }

  const quizStruggles: QuizStruggleRow[] = [...quizGroups.values()]
    .map((g) => ({
      questionId: g.questionId,
      questionPreview: g.preview,
      conceptId: g.conceptId,
      conceptName: conceptNames[g.conceptId] ?? g.conceptId,
      wrongAttempts: g.count,
      studentCount: g.users.size,
    }))
    .sort((a, b) => b.wrongAttempts - a.wrongAttempts)
    .slice(0, 6);

  const summary: DashboardSummary = {
    courseTitle: input.courseTitle,
    totalEnrolled: enrolled,
    activeThisWeek: activeIds.size,
    avgMasteryPercent,
    conceptsMasteredTotal,
    recentMisconceptionCount,
  };

  return {
    summary,
    students,
    misconceptionLog,
    modeUsage,
    conceptProgress,
    quizStruggles,
    totalModeSwitches: totalSwitches,
  };
}
