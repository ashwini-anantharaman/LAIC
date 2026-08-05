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
  /** Optional one-line helper under the question. */
  helper?: string;
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

/** A stat in the hero strip (e.g. Sessions 47). */
export interface HomeStat {
  value: string;
  label: string;
}

/** A swipeable hero card — the "Continue / Learn" carousel from the design. */
export interface HomeCard {
  eyebrow?: string;
  title: string;
  description?: string;
  cta?: string;
}

/** A real activity-feed row (e.g. "Quiz: Fractions"). */
export interface FeedItem {
  title: string;
  subtitle?: string;
  meta?: string;
}

export interface HomeConfig {
  greeting: string;
  subtitle: string;
  tiles: HomeTile[];
  showFeed: boolean;
  feedLabel: string;
  navItems: NavItem[];
  activeNavIndex: number;
  /** Optional rich content from the templates. When present, the home renders
   * the designed layout (stat strip / carousel / real feed); when absent it
   * falls back to the tiles grid so older configs still render. */
  stats?: HomeStat[];
  cards?: HomeCard[];
  feedItems?: FeedItem[];
}

/** A platform the app's content section can connect to. */
export type ContentPlatform = "learning" | "bridge";

/**
 * One connected platform in the content section. In the published app this
 * becomes a launch card: the learner taps it and enters that platform's
 * learner view via the Nexus launch handoff (token → session). The prototype
 * previews that flow with a mock platform screen.
 */
export interface ContentConnection {
  platform: ContentPlatform;
  enabled: boolean;
  label: string;
  description: string;
}

export interface ContentConfig {
  sectionTitle: string;
  connections: ContentConnection[];
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
  welcomeImageUrl?: string;
  roles: Role[];
  registrationPath: RegistrationPath;
  requireApproval: boolean;
  authToggles: AuthToggles;
  onboardingQuestions: OnboardingQuestion[];
  onboardingOptional: boolean;
  homeConfig: HomeConfig;
  /** Optional so configs published before the content section still open. */
  content?: ContentConfig;
  /**
   * Which program sign-up gate powers "Create an account". Chosen in Publish
   * from the program's participant gates (stored as the gate's slug). Empty =
   * auto-use the program's participant sign-up gate. `signupGateUrl` is the
   * legacy explicit-URL override, still honored if present.
   */
  signupGateSlug?: string;
  signupGateUrl?: string;
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
  welcomeImageUrl?: string;
  roles: Role[];
  registrationPath: RegistrationPath;
  requireApproval: boolean;
  authToggles: AuthToggles;
  onboardingQuestions: OnboardingQuestion[];
  onboardingOptional: boolean;
  homeConfig: HomeConfig;
  content?: ContentConfig;
  defaultInitials: string;
  defaultAppType: AppType;
}

/** Left-panel editor sections. */
export type EditorTab = "identity" | "start" | "auth" | "onboarding" | "home" | "content";
/** Preview stepper screens ("platform" is reached from a content card, not the stepper). */
export type PreviewScreen = "start" | "signin" | "onboarding" | "home" | "platform";
