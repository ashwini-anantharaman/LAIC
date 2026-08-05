import type { AppCategory, Template } from "../types";

/**
 * The starting templates in the New-app picker. Each pre-fills roles, auth,
 * onboarding, a home screen, and content connections; the user configures on
 * top. Content + accents are derived from the Multi-App Shells design set
 * (Learning / Bridge / Community), adapted to the shell config shape.
 */
export const TEMPLATES: Template[] = [
  {
    categoryId: "learning",
    label: "Learning",
    description: "Courses, quizzes, and daily study — for students and the teachers who guide them.",
    taglineHint: "Learn smarter, every day",
    accent: "#F59E0B",
    accentForeground: "#1a0800",
    welcomeTitle: "What kind of learner are you?",
    welcomeSubtitle: "You can switch roles later from your profile.",
    roles: [
      { label: "Student", description: "Take courses and track your progress" },
      { label: "Teacher", description: "Create content and monitor your class" },
    ],
    registrationPath: "public",
    requireApproval: false,
    authToggles: { googleSSO: true, emailPassword: true, magicLink: false },
    onboardingQuestions: [
      {
        prompt: "What best describes your learning goal?",
        helper: "We use this to order your daily plan.",
        type: "single-choice",
        required: true,
        options: ["Build a study habit", "Prep for an exam", "Explore a new subject", "Teach others"],
      },
    ],
    onboardingOptional: false,
    homeConfig: {
      greeting: "Hi, {name}",
      subtitle: "Algebra Basics · lesson 4 of 9",
      cards: [
        { eyebrow: "Continue", title: "Learn", description: "Lesson 4 of 9 · The Normal Curve · 12 min left", cta: "Resume lesson" },
        { eyebrow: "Due tomorrow", title: "Practice", description: "Fractions quiz · 8 questions · 10 min", cta: "Start quiz" },
        { eyebrow: "This term", title: "Progress", description: "Algebra Basics 68% · 3 of 5 modules done", cta: "See breakdown" },
      ],
      tiles: [
        { label: "Continue learning", description: "Pick up where you left off", route: "/learn" },
        { label: "Practice", description: "Quick quiz to stay sharp", route: "/practice" },
        { label: "My Progress", description: "Streaks and mastery", route: "/progress" },
        { label: "Explore", description: "Browse new subjects", route: "/explore" },
      ],
      showFeed: true,
      feedLabel: "This week",
      feedItems: [
        { title: "Quiz: Fractions", subtitle: "8 questions · Algebra Basics", meta: "Tomorrow" },
        { title: "New lesson from Mr. Chen", subtitle: "Solving Linear Equations", meta: "2h ago" },
        { title: "Earned 'Consistent' badge", subtitle: "10 days in a row", meta: "Yesterday" },
      ],
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
    description: "Play, analyse hands, and coach — built around the game, with lessons from your coach.",
    taglineHint: "Master the game of bridge",
    accent: "#0D9488",
    accentForeground: "#ffffff",
    welcomeTitle: "How do you play?",
    welcomeSubtitle: "Your role sets up your table and your stats.",
    roles: [
      { label: "Player", description: "Analyse hands and track your game" },
      { label: "Coach", description: "Review sessions with your students" },
      { label: "Club", description: "Manage members and club events" },
    ],
    registrationPath: "public",
    requireApproval: true,
    authToggles: { googleSSO: false, emailPassword: true, magicLink: false },
    onboardingQuestions: [
      {
        prompt: "What's your current bridge level?",
        helper: "This calibrates hand difficulty and coach notes.",
        type: "single-choice",
        required: true,
        options: ["Complete beginner", "Know the basics", "Club regular", "Tournament player"],
      },
    ],
    onboardingOptional: false,
    homeConfig: {
      greeting: "Good game, {name}",
      subtitle: "Logged in as {role} · Ashgrove Bridge Club",
      stats: [
        { value: "47", label: "Sessions" },
        { value: "62%", label: "Average" },
        { value: "78%", label: "Best" },
      ],
      cards: [
        { eyebrow: "4 seats · your level", title: "Play", description: "Duplicate pairs · 12 boards · about 45 min", cta: "Take a seat" },
        { eyebrow: "Last deal", title: "Analyse", description: "4♥ by South, made 11 · +1 against par", cta: "Review the deal" },
        { eyebrow: "With Elena Petrova", title: "Coaching", description: "Slam bidding · 6 deals prepared for you", cta: "Open session" },
      ],
      tiles: [
        { label: "Hand Analysis", description: "Review your last deal", route: "/hands" },
        { label: "Sessions", description: "Your recent games", route: "/sessions" },
        { label: "Club", description: "Members & events", route: "/club" },
        { label: "Bidding", description: "Practise your system", route: "/bidding" },
      ],
      showFeed: true,
      feedLabel: "Your sessions",
      feedItems: [
        { title: "Tuesday Pairs", subtitle: "24 boards · with Helen Whitmore", meta: "58%" },
        { title: "Coaching w/ Elena Petrova", subtitle: "Slam bidding · 6 deals", meta: "1h ago" },
        { title: "Club Championship", subtitle: "Entry confirmed · Table 3", meta: "Sat 7:00 PM" },
      ],
      navItems: [{ label: "Home" }, { label: "Hands" }, { label: "Club" }, { label: "Profile" }],
      activeNavIndex: 0,
    },
    content: {
      sectionTitle: "Play & learn",
      connections: [
        { platform: "bridge", enabled: true, label: "Play Bridge", description: "Your table, your player, your coach's settings" },
        { platform: "learning", enabled: true, label: "Bridge Lessons", description: "Courses from your coach" },
      ],
    },
    defaultInitials: "BC",
    defaultAppType: "coaching",
  },
  {
    categoryId: "activity",
    label: "Community",
    description: "Programs, events, and members — for the people who join and the organizers who run things.",
    taglineHint: "Your community, organized",
    accent: "#6366F1",
    accentForeground: "#ffffff",
    welcomeTitle: "Welcome — let's get you set up.",
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
        helper: "Pick one — it only shapes what we surface first.",
        type: "single-choice",
        required: true,
        options: ["Join a program", "Track my activity", "Organize events", "Stay connected"],
      },
    ],
    onboardingOptional: true,
    homeConfig: {
      greeting: "Hi, {name}",
      subtitle: "3 things happening today",
      cards: [
        { eyebrow: "Up next · Today 6:00 PM", title: "Community Yoga", description: "Riverside Studio, Hall B · +18 going", cta: "You're going" },
        { eyebrow: "12 members · Mon & Thu", title: "Spring Running Club", description: "Easy 5K loops along the river", cta: "Open program" },
        { eyebrow: "Starts Mon · 6 spots left", title: "Beginner Pottery", description: "Hands-on studio class", cta: "Join" },
      ],
      tiles: [
        { label: "Programs", description: "Browse & join programs", route: "/programs" },
        { label: "My Activity", description: "Track your sessions", route: "/activity" },
        { label: "Community", description: "Connect with members", route: "/community" },
        { label: "Events", description: "What's coming up", route: "/events" },
      ],
      showFeed: true,
      feedLabel: "Recent activity",
      feedItems: [
        { title: "Marcus joined Spring Running Club", subtitle: "Say hello 👋", meta: "2h ago" },
        { title: "New event: Book Swap", subtitle: "Saturday · Community Hall", meta: "Yesterday" },
        { title: "You RSVP'd to Community Yoga", subtitle: "Today 6:00 PM", meta: "Yesterday" },
      ],
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
    defaultInitials: "GA",
    defaultAppType: "community",
  },
];

export const templateFor = (id: AppCategory): Template =>
  TEMPLATES.find((t) => t.categoryId === id) ?? TEMPLATES[0];
