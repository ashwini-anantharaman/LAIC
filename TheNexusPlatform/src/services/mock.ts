import rubinVase from "../imports/InteractiveMode-1/97b20c55a0746afbe29344ee6e519a924f9a40c8.png";
import type { Course, StudentRecord, UnitContent } from "./types";

// ── Mock courses ────────────────────────────────────────────────────────────
export const MOCK_COURSES: Course[] = [
  {
    id: "bio",
    subject: "AP Biology",
    unitTitle: "Perception & the Nervous System",
    teacher: "Ms. Johnson",
    units: 4,
    progress: 38,
  },
  {
    id: "hist",
    subject: "World History",
    unitTitle: "The Industrial Revolution",
    teacher: "Mr. Davis",
    units: 6,
    progress: 0,
  },
];

// ── Mock unit content (the "generated" lesson, one concept across all modes) ──
export const MOCK_UNIT: UnitContent = {
  unitId: "bio-u1",
  moduleLabel: "Module 1",
  concept: "Perception",
  progress: 38,
  // Instructor generated all three explanation modes but no animation yet.
  availableModes: ["conversational", "summary", "narrative"],
  hasInteractive: false,

  conversational: {
    question: "What is Perception?",
    bubbles: [
      {
        text: "Let's talk about perception! Perception is your brain taking in stuff from your senses — what you see, hear, and smell — and figuring out what it all means.",
      },
      {
        image: rubinVase,
        caption:
          "Here's a cool example: some people see this Rubin Vase as two faces, others see a goblet. Same picture, different perception!",
      },
      {
        text: "So the big idea: your brain isn't just recording the world, it's actively making sense of it. Pretty wild, right?",
      },
    ],
  },

  summary: {
    title: "Perception",
    lead: undefined,
    paragraphs: [
      "The word perception comes from the Latin perceptio, meaning \u201Cgathering\u201D or \u201Creceiving.\u201D",
      "Perception is the process by which your brain identifies, interprets, and organizes information from your senses. Your sense organs \u2014 eyes, ears, and nose \u2014 take in information from the world around you, and your brain sorts through it and makes sense of it. This is what allows you to understand and form a picture of your environment.",
      "Because the brain interprets rather than simply records, context and prior experience shape the final percept. Two observers can receive identical sensory input and arrive at different conclusions.",
    ],
    figure: {
      image: rubinVase,
      caption: "Fig 1. The Rubin Vase can be perceived as two faces, or a goblet.",
    },
  },

  narrative: {
    title: "Perception",
    lead: "Imagine walking into a kitchen\u2026",
    paragraphs: [
      "\u2026and instantly smelling something amazing. Before you even think about it, your brain already knows: cookies. It catches the smell, hears the clink of a baking sheet, feels the warmth in the air, and pieces it all together in an instant.",
      "That's perception \u2014 taking the raw world and turning it into something meaningful, like recognizing a friend's face in a crowd or knowing a song from its first note.",
      "It's also why two people at the same concert remember different moments: each brain builds its own version of the experience from the same sounds.",
    ],
    figure: {
      image: rubinVase,
      caption: "Do you see two faces or a vase? Your brain decides.",
    },
  },

  assistantReply: {
    conversational:
      "Great question! Think of it this way: two people can look at the same thing and see something completely different \u2014 your past experiences shape what you perceive.",
    summary:
      "The key insight is that perception is an active process \u2014 the brain constructs a model of reality rather than passively receiving it. Context, expectation, and experience all shape the outcome.",
    narrative:
      "Picture two friends watching the same movie \u2014 one remembers the music, the other the colors. Same film, different perception, because each brain highlights what matters to it.",
  },
};

// ── Mock student roster (teacher dashboard) ─────────────────────────────────
export const MOCK_STUDENTS: StudentRecord[] = [
  { id: "s1", name: "Ava Martinez", mastery: 88, understanding: 82, progress: 95, status: "ahead" },
  { id: "s2", name: "Liam Chen", mastery: 64, understanding: 70, progress: 60, status: "on-track" },
  { id: "s3", name: "Noah Patel", mastery: 41, understanding: 38, progress: 30, status: "at-risk" },
  { id: "s4", name: "Sofia Rossi", mastery: 76, understanding: 74, progress: 80, status: "on-track" },
];
