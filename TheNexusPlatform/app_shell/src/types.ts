/**
 * App Shell Studio — the config an app shell is built from.
 *
 * This is the data record that makes one app (Brain Bee) behave and look
 * differently from another (Bridge Coach). The Studio edits it on the left and
 * previews the resulting app on the right; publishing would hand this record to
 * the runtime. It mirrors the older App_Shell_Implementation_Spec (roles, auth
 * methods, onboarding, home), which is what the Studio configures.
 */

export type AppCategory = "learning" | "bridge" | "activity";
export type AppType = "learning" | "challenge" | "coaching" | "community" | "other";
export type RegistrationPath = "public" | "invite-code" | "admin-added" | "bulk";
export type QuestionType =
  | "single-choice"
  | "multi-select"
  | "text"
  | "boolean"
  | "date"
  | "phone"
  | "email";

/** A start-screen role button (Student / Teacher / Player / Coach …). */
export interface Role {
  label: string;
  description: string;
}

/** Which sign-in identifiers the app offers. */
export interface AuthToggles {
  googleSSO: boolean;
  emailPassword: boolean;
  magicLink: boolean;
}

export interface OnboardingQuestion {
  prompt: string;
  type: QuestionType;
  required: boolean;
  /** Only meaningful for single-choice / multi-select. */
  options: string[];
}

export interface HomeTile {
  label: string;
  description: string;
  route: string;
}

export interface NavItem {
  label: string;
}

export interface HomeConfig {
  greeting: string;
  subtitle: string;
  tiles: HomeTile[];
  showFeed: boolean;
  feedLabel: string;
  navItems: NavItem[];
  activeNavIndex: number;
}

export interface AppShellConfig {
  id: string;
  name: string;
  tagline: string;
  appType: AppType;
  category: AppCategory;
  logoInitials: string;
  /** Data-URL of an uploaded logo; when set it wins over initials. */
  logoUrl?: string;
  accentColor: string;
  accentForeground: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  roles: Role[];
  registrationPath: RegistrationPath;
  requireApproval: boolean;
  authToggles: AuthToggles;
  onboardingQuestions: OnboardingQuestion[];
  onboardingOptional: boolean;
  homeConfig: HomeConfig;
}

/** A starting point for a brand-new app in the New-app picker. */
export interface Template {
  categoryId: AppCategory;
  label: string;
  description: string;
  taglineHint: string;
  accent: string;
  accentForeground: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  roles: Role[];
  registrationPath: RegistrationPath;
  requireApproval: boolean;
  authToggles: AuthToggles;
  onboardingQuestions: OnboardingQuestion[];
  onboardingOptional: boolean;
  homeConfig: HomeConfig;
  defaultInitials: string;
  defaultAppType: AppType;
}

/** Left-panel editor sections. */
export type EditorTab = "identity" | "start" | "auth" | "onboarding" | "home";
/** Preview stepper screens. */
export type PreviewScreen = "start" | "signin" | "onboarding" | "home";
