import type { AppCategory, Template } from "../types";

/**
 * The three starting templates offered in the New-app picker. Each pre-fills
 * roles, auth, onboarding, and a default home screen; the user configures on top.
 */
export const TEMPLATES: Template[] = [
  {
    categoryId: "learning",
    label: "Learning",
    description: "Courses, quizzes, and structured learning flows for students and their teachers.",
    taglineHint: "Learn smarter, every day",
    accent: "#F59E0B",
    accentForeground: "#1a0800",
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
        { label: "Start Learning", description: "Pick up where you left off", route: "/learn" },
        { label: "My Progress", description: "See your stats", route: "/progress" },
        { label: "Explore", description: "Find new content", route: "/explore" },
        { label: "Leaderboard", description: "See your ranking", route: "/leaderboard" },
      ],
      showFeed: true,
      feedLabel: "Recent Activity",
      navItems: [{ label: "Home" }, { label: "Learn" }, { label: "Progress" }, { label: "Profile" }],
      activeNavIndex: 0,
    },
    content: {
      sectionTitle: "Your content",
      connections: [
        { platform: "learning", enabled: true, label: "My Courses", description: "Lessons, quizzes, and progress" },
        { platform: "bridge", enabled: false, label: "Play Bridge", description: "Practice at the table" },
      ],
    },
    defaultInitials: "LN",
    defaultAppType: "learning",
  },
  {
    categoryId: "bridge",
    label: "Bridge",
    description: "Play sessions, hand analysis, and club management — built around the game.",
    taglineHint: "Master the game of bridge",
    accent: "#0D9488",
    accentForeground: "#ffffff",
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
    content: {
      sectionTitle: "Play & learn",
      connections: [
        { platform: "bridge", enabled: true, label: "Play Bridge", description: "Your table and your player" },
        { platform: "learning", enabled: false, label: "Bridge Lessons", description: "Courses from your coach" },
      ],
    },
    defaultInitials: "BR",
    defaultAppType: "coaching",
  },
  {
    categoryId: "activity",
    label: "Activity",
    description: "Programs, events, and community organizers — for members and the people who run things.",
    taglineHint: "Your community, organized",
    accent: "#6366F1",
    accentForeground: "#ffffff",
    welcomeTitle: "Welcome — let's get you set up",
    welcomeSubtitle: "Tell us how you're joining.",
    roles: [
      { label: "Member", description: "Join programs and track your activity" },
      { label: "Organizer", description: "Create and manage programs" },
    ],
    registrationPath: "invite-code",
    requireApproval: false,
    authToggles: { googleSSO: true, emailPassword: false, magicLink: true },
    onboardingQuestions: [
      {
        prompt: "What brings you here?",
        type: "single-choice",
        required: true,
        options: ["Join a program", "Track my activity", "Organize events", "Stay connected"],
      },
    ],
    onboardingOptional: true,
    homeConfig: {
      greeting: "Hi, {name}!",
      subtitle: "What's on today?",
      tiles: [
        { label: "Programs", description: "Browse & join programs", route: "/programs" },
        { label: "My Activity", description: "Track your sessions", route: "/activity" },
        { label: "Community", description: "Connect with others", route: "/community" },
      ],
      showFeed: true,
      feedLabel: "Recent Activity",
      navItems: [{ label: "Home" }, { label: "Programs" }, { label: "Activity" }, { label: "Profile" }],
      activeNavIndex: 0,
    },
    content: {
      sectionTitle: "Your content",
      connections: [
        { platform: "learning", enabled: false, label: "My Courses", description: "Lessons, quizzes, and progress" },
        { platform: "bridge", enabled: false, label: "Play Bridge", description: "Practice at the table" },
      ],
    },
    defaultInitials: "AC",
    defaultAppType: "community",
  },
];

export const templateFor = (id: AppCategory): Template =>
  TEMPLATES.find((t) => t.categoryId === id) ?? TEMPLATES[0];
