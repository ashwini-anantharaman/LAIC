import type { AppShellConfig } from "../types";

/** The three preset apps the Studio opens with (and the app switcher lists). */
export const PRESET_IDS = ["brain-bee", "mindai-bee", "bridge-coach"] as const;

export const PRESETS: AppShellConfig[] = [
  {
    id: "brain-bee",
    name: "Brain Bee",
    tagline: "Learn smarter, every day",
    appType: "learning",
    category: "learning",
    accentColor: "#F59E0B",
    accentForeground: "#1a0800",
    logoInitials: "BB",
    welcomeTitle: "What kind of learner are you?",
    welcomeSubtitle: "Choose a role to get started.",
    roles: [
      { label: "Student", description: "Access quizzes and track your progress" },
      { label: "Teacher", description: "Create content and monitor your class" },
    ],
    registrationPath: "public",
    requireApproval: false,
    authToggles: { googleSSO: true, emailPassword: true, magicLink: false },
    onboardingQuestions: [
      {
        prompt: "What best describes your learning goal?",
        type: "single-choice",
        required: true,
        options: ["Build a study habit", "Prep for an exam", "Explore a new subject", "Teach others"],
      },
    ],
    onboardingOptional: false,
    homeConfig: {
      greeting: "Hello, {name}!",
      subtitle: "Ready to learn today?",
      tiles: [
        { label: "Daily Quiz", description: "Test your knowledge", route: "/quiz" },
        { label: "My Progress", description: "Track your growth", route: "/progress" },
        { label: "Explore", description: "Browse new topics", route: "/explore" },
        { label: "Leaderboard", description: "See your ranking", route: "/leaderboard" },
      ],
      showFeed: true,
      feedLabel: "Recent Activity",
      navItems: [{ label: "Home" }, { label: "Quizzes" }, { label: "Progress" }, { label: "Profile" }],
      activeNavIndex: 0,
    },
  },
  {
    id: "mindai-bee",
    name: "MindAI Bee",
    tagline: "Challenge your mind with AI",
    appType: "challenge",
    category: "learning",
    accentColor: "#8B5CF6",
    accentForeground: "#ffffff",
    logoInitials: "MB",
    welcomeTitle: "Ready to challenge yourself?",
    welcomeSubtitle: "Tell us how you want to play.",
    roles: [
      { label: "Player", description: "Compete in daily challenges" },
      { label: "Coach", description: "Guide and track your players" },
    ],
    registrationPath: "invite-code",
    requireApproval: false,
    authToggles: { googleSSO: true, emailPassword: false, magicLink: true },
    onboardingQuestions: [
      {
        prompt: "How do you want to compete?",
        type: "single-choice",
        required: true,
        options: ["Solo challenge", "Ranked matches", "Practice mode", "Tournament play"],
      },
    ],
    onboardingOptional: false,
    homeConfig: {
      greeting: "Welcome back, {name}",
      subtitle: "Today's challenge is live",
      tiles: [
        { label: "Arena", description: "Enter today's challenge", route: "/arena" },
        { label: "Rankings", description: "See where you stand", route: "/rankings" },
        { label: "Practice", description: "Sharpen your skills", route: "/practice" },
        { label: "Replays", description: "Review past games", route: "/replays" },
      ],
      showFeed: true,
      feedLabel: "Recent Matches",
      navItems: [{ label: "Home" }, { label: "Arena" }, { label: "Rankings" }, { label: "Profile" }],
      activeNavIndex: 0,
    },
  },
  {
    id: "bridge-coach",
    name: "Bridge Coach",
    tagline: "Master the game of bridge",
    appType: "coaching",
    category: "bridge",
    accentColor: "#0D9488",
    accentForeground: "#ffffff",
    logoInitials: "BC",
    welcomeTitle: "How do you play?",
    welcomeSubtitle: "Select your role to continue.",
    roles: [
      { label: "Player", description: "Analyse hands and track your game" },
      { label: "Coach", description: "Review sessions and coach your team" },
      { label: "Club", description: "Manage members and club events" },
    ],
    registrationPath: "public",
    requireApproval: true,
    authToggles: { googleSSO: false, emailPassword: true, magicLink: false },
    onboardingQuestions: [
      {
        prompt: "What's your current bridge level?",
        type: "single-choice",
        required: true,
        options: ["Complete beginner", "Know the basics", "Club regular", "Tournament player"],
      },
    ],
    onboardingOptional: false,
    homeConfig: {
      greeting: "Good game, {name}",
      subtitle: "Logged in as {role}",
      tiles: [
        { label: "Hand Analysis", description: "Review your hands", route: "/hands" },
        { label: "Sessions", description: "Your recent sessions", route: "/sessions" },
        { label: "Club", description: "Members & events", route: "/club" },
        { label: "Bidding", description: "Practise bidding", route: "/bidding" },
      ],
      showFeed: true,
      feedLabel: "Session History",
      navItems: [{ label: "Home" }, { label: "Hands" }, { label: "Club" }, { label: "Profile" }],
      activeNavIndex: 0,
    },
  },
];

/** Deep clone so edits never mutate the shared preset objects. */
export const clonePresets = (): AppShellConfig[] =>
  PRESETS.map((p) => structuredClone(p));
