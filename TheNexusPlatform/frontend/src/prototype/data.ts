// Mock data for the LAIC platform prototype.
// Mirrors the platform architecture: an Organization owns Programs; each Program
// has a Learning Platform (courses/content authored by coaches) and an Application
// (tracks learners, performance, community). No backend — this is prototype data.

export type Persona = "organization" | "coach" | "learner";

export type ContentKind = "video" | "reading" | "quiz" | "activity" | "artifact";

export interface LearningObject {
  id: string;
  title: string;
  kind: ContentKind;
  duration: string;
  // A "content artifact" produced on the learning platform that the Application
  // Configuration templates can pull in.
  usableInApp?: boolean;
}

export interface Course {
  id: string;
  title: string;
  summary: string;
  coach: string;
  status: "published" | "draft";
  learners: number;
  objects: LearningObject[];
}

export interface Coach {
  id: string;
  name: string;
  role: string;
  courses: number;
}

export interface Learner {
  id: string;
  name: string;
  enrolledCourseIds: string[];
  progress: number; // 0-100
}

export interface Program {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  accent: string;
  coaches: Coach[];
  courses: Course[];
  learners: Learner[];
}

// ── Application Configuration templates ────────────────────────────────────────
// The Organization picks a template, then has a *restricted* ability to modify it:
// some blocks are locked by the template; editable blocks can be toggled and can
// bind to content artifacts produced by the program's learning platform.

export type BlockKind = "hero" | "content-feed" | "leaderboard" | "community" | "tracker" | "resource-list";

export interface TemplateBlock {
  id: string;
  kind: BlockKind;
  label: string;
  description: string;
  locked: boolean;        // template-enforced — org cannot remove/edit structure
  bindsContent: boolean;  // can be filled from learning-platform content artifacts
}

export interface AppTemplate {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  blocks: TemplateBlock[];
}

export const APP_TEMPLATES: AppTemplate[] = [
  {
    id: "tmpl-tracker",
    name: "Progress Tracker",
    tagline: "Track learners, surface performance, keep a resource shelf.",
    emoji: "📊",
    blocks: [
      { id: "b1", kind: "hero", label: "Program Header", description: "Program name, logo & description", locked: true, bindsContent: false },
      { id: "b2", kind: "tracker", label: "Learner Progress", description: "Auto-synced completion & scores", locked: true, bindsContent: false },
      { id: "b3", kind: "content-feed", label: "Featured Content", description: "Pin content artifacts from the program", locked: false, bindsContent: true },
      { id: "b4", kind: "resource-list", label: "Resource Shelf", description: "Downloadable readings & activities", locked: false, bindsContent: true },
    ],
  },
  {
    id: "tmpl-community",
    name: "Community Hub",
    tagline: "A social space with feed, leaderboard and shared resources.",
    emoji: "💬",
    blocks: [
      { id: "b1", kind: "hero", label: "Program Header", description: "Program name, logo & description", locked: true, bindsContent: false },
      { id: "b2", kind: "community", label: "Community Feed", description: "Posts, comments & announcements", locked: true, bindsContent: false },
      { id: "b3", kind: "leaderboard", label: "Leaderboard", description: "Ranked learner performance", locked: false, bindsContent: false },
      { id: "b4", kind: "content-feed", label: "Shared Content", description: "Publish content artifacts to members", locked: false, bindsContent: true },
    ],
  },
  {
    id: "tmpl-showcase",
    name: "Content Showcase",
    tagline: "A learner-facing catalog of published courses & artifacts.",
    emoji: "🎬",
    blocks: [
      { id: "b1", kind: "hero", label: "Program Header", description: "Program name, logo & description", locked: true, bindsContent: false },
      { id: "b2", kind: "content-feed", label: "Course Catalog", description: "All published courses in the program", locked: false, bindsContent: true },
      { id: "b3", kind: "resource-list", label: "Artifact Library", description: "Reusable learning objects", locked: false, bindsContent: true },
      { id: "b4", kind: "tracker", label: "My Progress", description: "Per-learner completion view", locked: true, bindsContent: false },
    ],
  },
];

// ── Programs ───────────────────────────────────────────────────────────────────

export const PROGRAMS: Program[] = [
  {
    id: "prog-bridge",
    name: "Bridge Program",
    tagline: "Foundations of contract bridge, from bidding to endgame.",
    emoji: "♠",
    accent: "#c9556b",
    coaches: [
      { id: "c1", name: "Dana Whitfield", role: "Lead Coach", courses: 2 },
      { id: "c2", name: "Marcus Lee", role: "Coach", courses: 1 },
    ],
    courses: [
      {
        id: "crs-b1", title: "Bidding Fundamentals", summary: "Opening bids, responses & the point-count system.",
        coach: "Dana Whitfield", status: "published", learners: 24,
        objects: [
          { id: "o1", title: "Welcome & Overview", kind: "video", duration: "6 min" },
          { id: "o2", title: "The Point-Count System", kind: "reading", duration: "12 min", usableInApp: true },
          { id: "o3", title: "Opening Bids Quiz", kind: "quiz", duration: "10 q" },
          { id: "o4", title: "Bidding Practice Hand", kind: "activity", duration: "20 min", usableInApp: true },
        ],
      },
      {
        id: "crs-b2", title: "Defensive Play", summary: "Signaling, discards and defeating the contract.",
        coach: "Dana Whitfield", status: "published", learners: 18,
        objects: [
          { id: "o5", title: "Signaling Basics", kind: "video", duration: "9 min", usableInApp: true },
          { id: "o6", title: "Discard Patterns", kind: "reading", duration: "8 min" },
        ],
      },
      {
        id: "crs-b3", title: "Endgame Technique", summary: "Squeezes, endplays and counting.",
        coach: "Marcus Lee", status: "draft", learners: 0,
        objects: [
          { id: "o7", title: "Counting the Hand", kind: "video", duration: "11 min" },
        ],
      },
    ],
    learners: [
      { id: "l1", name: "Ava Chen", enrolledCourseIds: ["crs-b1", "crs-b2"], progress: 74 },
      { id: "l2", name: "Ben Ortiz", enrolledCourseIds: ["crs-b1"], progress: 40 },
      { id: "l3", name: "Priya Nair", enrolledCourseIds: ["crs-b1", "crs-b2"], progress: 92 },
    ],
  },
  {
    id: "prog-dance",
    name: "Dance Program",
    tagline: "Movement, choreography and performance craft.",
    emoji: "💃",
    accent: "#8f6ae0",
    coaches: [{ id: "c3", name: "Sofia Reyes", role: "Lead Coach", courses: 1 }],
    courses: [
      {
        id: "crs-d1", title: "Contemporary Foundations", summary: "Core technique, floorwork & phrasing.",
        coach: "Sofia Reyes", status: "published", learners: 31,
        objects: [
          { id: "o8", title: "Warm-up Routine", kind: "video", duration: "14 min", usableInApp: true },
          { id: "o9", title: "Floorwork Drills", kind: "activity", duration: "25 min" },
          { id: "o10", title: "Phrasing & Musicality", kind: "reading", duration: "7 min", usableInApp: true },
        ],
      },
    ],
    learners: [
      { id: "l4", name: "Mia Kovac", enrolledCourseIds: ["crs-d1"], progress: 55 },
      { id: "l5", name: "Leo Tanaka", enrolledCourseIds: ["crs-d1"], progress: 20 },
    ],
  },
  {
    id: "prog-mindai",
    name: "MindAI Program",
    tagline: "Applied AI literacy and hands-on model building.",
    emoji: "🧠",
    accent: "#5aa0e6",
    coaches: [
      { id: "c4", name: "Dr. Ada Osei", role: "Lead Coach", courses: 2 },
    ],
    courses: [
      {
        id: "crs-m1", title: "AI Literacy 101", summary: "How modern models work, in plain language.",
        coach: "Dr. Ada Osei", status: "published", learners: 47,
        objects: [
          { id: "o11", title: "What is a Model?", kind: "video", duration: "10 min", usableInApp: true },
          { id: "o12", title: "Prompting Patterns", kind: "reading", duration: "15 min", usableInApp: true },
          { id: "o13", title: "Prompt Lab", kind: "activity", duration: "30 min", usableInApp: true },
          { id: "o14", title: "Concept Check", kind: "quiz", duration: "12 q" },
        ],
      },
      {
        id: "crs-m2", title: "Build Your First Model", summary: "A guided, no-code model-building project.",
        coach: "Dr. Ada Osei", status: "draft", learners: 0,
        objects: [
          { id: "o15", title: "Dataset Basics", kind: "reading", duration: "9 min" },
        ],
      },
    ],
    learners: [
      { id: "l6", name: "Noah Kim", enrolledCourseIds: ["crs-m1"], progress: 88 },
      { id: "l7", name: "Zara Ali", enrolledCourseIds: ["crs-m1"], progress: 63 },
      { id: "l8", name: "Owen Blake", enrolledCourseIds: ["crs-m1"], progress: 12 },
    ],
  },
];

export const ORG_NAME = "Life in AI Center";

// The learner persona is demoed as this fixed learner inside the Bridge program.
export const DEMO_LEARNER_ID = "l1";
export const DEMO_LEARNER_PROGRAM = "prog-bridge";
// The coach persona is demoed as this coach, assigned to the Bridge program.
export const DEMO_COACH_PROGRAM = "prog-bridge";
export const DEMO_COACH_NAME = "Dana Whitfield";

export const CONTENT_KIND_META: Record<ContentKind, { label: string; emoji: string }> = {
  video: { label: "Video", emoji: "▶" },
  reading: { label: "Reading", emoji: "📄" },
  quiz: { label: "Quiz", emoji: "✓" },
  activity: { label: "Activity", emoji: "✎" },
  artifact: { label: "Artifact", emoji: "◆" },
};
