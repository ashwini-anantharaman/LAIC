import type {
  AppShellConfig,
  AppType,
  ContentConfig,
  ContentPlatform,
  EditorTab,
  PreviewScreen,
  QuestionType,
  RegistrationPath,
} from "../types";

export const EDITOR_TABS: { id: EditorTab; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "start", label: "Start" },
  { id: "auth", label: "Auth" },
  { id: "onboarding", label: "Onboarding" },
  { id: "home", label: "Home" },
  { id: "content", label: "Content" },
];

export const PREVIEW_STEPS: { id: PreviewScreen; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "signin", label: "Sign In" },
  { id: "onboarding", label: "Onboard" },
  { id: "home", label: "Home" },
];

export const FIELD_TYPES: { value: QuestionType; label: string }[] = [
  { value: "single-choice", label: "Single choice" },
  { value: "multi-select", label: "Multi-select" },
  { value: "text", label: "Text" },
  { value: "boolean", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
];

export const REGISTRATION_PATHS: { value: RegistrationPath; label: string; hint: string }[] = [
  { value: "public", label: "Public signup", hint: "Anyone can create an account" },
  { value: "invite-code", label: "Invite code", hint: "Users enter a code to register" },
  { value: "admin-added", label: "Admin-added", hint: "Accounts are created by an admin" },
  { value: "bulk", label: "Bulk import", hint: "Accounts are imported in batch" },
];

export const APP_TYPES: AppType[] = ["learning", "challenge", "coaching", "community", "other"];

/** Choices-based questions are the only ones that carry an options list. */
export const CHOICE_TYPES: QuestionType[] = ["single-choice", "multi-select"];

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Replace {name} / {role} tokens in preview copy. */
export function interpolate(text: string, name: string, role: string): string {
  return text.replace(/\{name\}/g, name).replace(/\{role\}/g, role);
}

/** Preview glyph + copy for each connectable platform. */
export const PLATFORM_META: Record<ContentPlatform, { name: string; glyph: string }> = {
  learning: { name: "Learning Platform", glyph: "▤" },
  bridge: { name: "Bridge Platform", glyph: "♠" },
};

const DEFAULT_CONTENT: ContentConfig = {
  sectionTitle: "Your content",
  connections: [
    { platform: "learning", enabled: false, label: "My Courses", description: "Lessons, quizzes, and progress" },
    { platform: "bridge", enabled: false, label: "Play Bridge", description: "Practice at the table" },
  ],
};

/** Content section with a safe default — configs published before it existed have none. */
export function contentOf(config: AppShellConfig): ContentConfig {
  return config.content ?? structuredClone(DEFAULT_CONTENT);
}
