import type {
  User, LearningObject, Course, Source,
  ReviewItem, Person, Version, LearnerProgress,
} from './types';

export const USERS: User[] = [
  { id: 'demo-cd', name: 'Course Dev Demo', initials: 'CD', email: '1@gmail.com', role: 'content-developer', program: 'bridge' },
  { id: 'sam', name: 'Sam Rivera', initials: 'SR', email: 'sam@laic.org', role: 'content-developer', program: 'bridge' },
  { id: 'lee', name: 'Lee Park', initials: 'LP', email: 'lee@laic.org', role: 'object-reviewer', program: 'bridge' },
  { id: 'maria', name: 'María Gómez', initials: 'MG', email: 'maria@laic.org', role: 'course-reviewer', program: 'bridge' },
  { id: 'amina', name: 'Dr. Amina Okafor', initials: 'AO', email: 'amina@laic.org', role: 'administrator', program: 'bridge' },
  { id: 'jordan', name: 'Jordan Blake', initials: 'JB', email: 'jordan@laic.org', role: 'coach', program: 'bridge' },
  { id: 'riya', name: 'Riya Shah', initials: 'RS', email: 'riya@laic.org', role: 'student', program: 'bridge' },
  { id: 'chen', name: 'Chen Wei', initials: 'CW', email: 'chen@laic.org', role: 'content-developer', program: 'bridge' },
];

export const SOURCES: Source[] = [
  {
    id: 'src-1', title: 'How to Play Bridge', kind: 'pdf', pages: 6,
    domain: 'ACBL Bridge Guide', primary: true, addedBy: 'Chen Wei', addedAt: '2026-06-10',
  },
  {
    id: 'src-2', title: 'Bridge Basics — Video Transcript', kind: 'video-transcript', duration: '5 min',
    domain: 'Bridge Education Network', primary: false, addedBy: 'Sam Rivera', addedAt: '2026-06-12',
  },
];

export const OBJECTS: LearningObject[] = [
  {
    id: 'obj-1', type: 'lesson', title: 'Tricks & Trumps',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'published', scope: 'bridge', reuseCount: 3,
    description: 'Learn how tricks are won and lost, and what it means for a suit to be trump. Covers card ranking, suit following, and the power of the trump suit.',
    estimatedTime: '45 min', tags: ['fundamentals', 'tricks', 'trump'],
    sourceIds: ['src-1'], createdAt: '2026-06-15', updatedAt: '2026-07-01',
    blocks: [
      {
        id: 'b1', type: 'rich-text',
        content: { text: 'A **trick** consists of four cards — one from each player, played in clockwise order. The player who plays the highest card of the led suit wins the trick, *unless* a trump card is played.' },
      },
      {
        id: 'b2', type: 'concept-card',
        content: {
          term: 'High Card Points (HCP)',
          definition: 'A shorthand for evaluating hand strength. Ace = 4, King = 3, Queen = 2, Jack = 1. A deck contains 40 HCP total.',
          example: '♠ A K Q J = 10 HCP in one suit alone.',
        },
      },
      {
        id: 'b3', type: 'rich-text',
        content: { text: '## Suit Ranking\n\nSuits rank from lowest to highest: ♣ (clubs) < ♦ (diamonds) < ♥ (hearts) < ♠ (spades) < NT (Notrump). This ranking matters only for bidding — during play, any trump beats any non-trump.' },
      },
      {
        id: 'b4', type: 'bridge-play',
        content: {
          title: 'Win the Trick',
          description: 'North leads the ♠7. Which card should South play to win the trick?',
          trump: '♥', north: '♠7', east: '♠Q', south: ['♠A', '♠2', '♥3'], west: '♠K',
          correctAnswer: '♠A',
          explanation: 'The ♠A is the highest spade, winning the trick outright. Playing ♥3 would ruff but wastes a precious trump.',
        },
      },
      {
        id: 'b5', type: 'question',
        content: {
          question: 'How many tricks make up a complete bridge deal?',
          type: 'multiple-choice', options: ['8', '10', '13', '16'], correct: 2,
          explanation: 'Each player holds 13 cards; each trick uses one per player → exactly 13 tricks per deal.',
        },
      },
    ],
  },
  {
    id: 'obj-2', type: 'lesson', title: 'The Two Phases of a Deal',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'draft', scope: 'bridge', reuseCount: 1,
    description: 'Bridge has two distinct phases: the auction (bidding) and the play. Understanding each phase is key to developing your game.',
    estimatedTime: '30 min', tags: ['fundamentals', 'bidding', 'play'],
    sourceIds: ['src-1', 'src-2'], createdAt: '2026-06-18', updatedAt: '2026-07-05',
    blocks: [
      {
        id: 'b6', type: 'rich-text',
        content: { text: 'Every bridge deal has two phases:\n\n**Phase 1 — The Auction:** Players bid to win the right to name the trump suit (or notrump) and declare how many tricks they\'ll win.\n\n**Phase 2 — The Play:** Declarer\'s partner (the **dummy**) lays cards face-up. Declarer plays both hands to try to make the contract.' },
      },
      {
        id: 'b7', type: 'bidding-sequence',
        content: {
          title: 'A Simple Auction',
          seats: ['N', 'E', 'S', 'W'],
          bids: [
            { seat: 'N', bid: '1♠', explanation: 'Opens with 5+ spades and 12+ HCP' },
            { seat: 'E', bid: 'Pass', explanation: 'Fewer than 12 HCP — better to wait' },
            { seat: 'S', bid: '2♠', explanation: '3-card spade support and 6–9 HCP' },
            { seat: 'W', bid: 'Pass', explanation: 'Still insufficient strength' },
            { seat: 'N', bid: '4♠', explanation: 'Partner showed support — bid game' },
            { seat: 'E', bid: 'Pass', explanation: '' },
            { seat: 'S', bid: 'Pass', explanation: '' },
            { seat: 'W', bid: 'Pass', explanation: 'Auction ends — contract is 4♠ by North' },
          ],
          finalContract: '4♠ by North',
        },
      },
    ],
  },
  {
    id: 'obj-3', type: 'lesson', title: 'How Bidding Works',
    ownerId: 'sam', ownerName: 'Sam Rivera',
    status: 'draft', scope: 'bridge', reuseCount: 0,
    description: 'The auction is a conversation between partners. Learn the levels, suits, and how bids communicate hand strength and distribution.',
    estimatedTime: '40 min', tags: ['bidding', 'auction'],
    sourceIds: ['src-1'], createdAt: '2026-06-20', updatedAt: '2026-07-08', blocks: [],
  },
  {
    id: 'obj-4', type: 'lesson', title: 'Opening the Bidding',
    ownerId: 'sam', ownerName: 'Sam Rivera',
    status: 'draft', scope: 'bridge', reuseCount: 0,
    description: 'When and how to open the bidding. Covers the 12-point threshold, suit selection, and the 1NT opening.',
    estimatedTime: '35 min', tags: ['bidding', 'opening', 'HCP'],
    sourceIds: ['src-1', 'src-2'], createdAt: '2026-06-22', updatedAt: '2026-07-08', blocks: [],
  },
  {
    id: 'obj-5', type: 'concept-card', title: 'Trump vs Notrump',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'published', scope: 'bridge', reuseCount: 5,
    description: 'Side-by-side explanation of trump contracts versus notrump, and when each is preferable.',
    estimatedTime: '10 min', tags: ['trump', 'notrump', 'concept'],
    sourceIds: ['src-1'], createdAt: '2026-06-14', updatedAt: '2026-06-28',
    blocks: [
      { id: 'cc1', type: 'concept-card', content: { term: 'Trump Contract', definition: 'One suit is designated trump. Any trump card beats all others. Allows you to ruff losers in side suits.', example: 'Contract: 4♠ — any spade (even ♠2) beats any other suit\'s ace.' } },
      { id: 'cc2', type: 'concept-card', content: { term: 'Notrump Contract', definition: 'No trump suit. Tricks won purely by the highest card of the led suit.', example: 'Contract: 3NT — only high cards and long-suit tricks count; no ruffing.' } },
    ],
  },
  {
    id: 'obj-6', type: 'flashcard-set', title: 'Bridge Terms',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'published', scope: 'bridge', reuseCount: 8,
    description: 'Essential bridge vocabulary — 12 key terms every new player needs to know cold.',
    estimatedTime: '15 min', tags: ['vocabulary', 'terms'],
    sourceIds: ['src-1', 'src-2'], createdAt: '2026-06-13', updatedAt: '2026-07-02',
    blocks: [
      {
        id: 'fs1', type: 'flashcard-set',
        content: {
          cards: [
            { front: 'Trick', back: 'Four cards played, one from each player in clockwise order. Won by the highest card of the led suit, or the highest trump.' },
            { front: 'Trump', back: 'The designated suit whose cards beat all other suits during that deal.' },
            { front: 'HCP', back: 'High Card Points — A=4, K=3, Q=2, J=1. Full deck = 40 HCP.' },
            { front: 'Contract', back: 'The final bid: how many tricks above 6 (the "book") the declaring side commits to winning.' },
            { front: 'Declarer', back: 'The player who first named the contract\'s suit. Plays both their hand and dummy\'s.' },
            { front: 'Dummy', back: 'Declarer\'s partner. After the opening lead, dummy\'s cards are laid face-up for all to see.' },
            { front: 'Ruff', back: 'To play a trump card on a trick when you cannot follow the led suit.' },
            { front: 'Finesse', back: 'Leading toward an honor, hoping the opponent on your right holds the missing higher honor.' },
            { front: 'Game', back: 'A contract large enough to earn a game bonus: 3NT, 4♥, 4♠, 5♣, or 5♦.' },
            { front: 'Slam', back: '6-level (small slam, 12 tricks) or 7-level (grand slam, all 13 tricks) contract.' },
            { front: 'NT', back: 'Notrump — no trump suit designated. Tricks won only by high cards and long suits.' },
            { front: 'Suit', back: 'One of four: ♣ clubs, ♦ diamonds, ♥ hearts, ♠ spades. Each has 13 cards.' },
          ],
        },
      },
    ],
  },
  {
    id: 'obj-7', type: 'quiz', title: 'Basics Checkpoint',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'approved', scope: 'bridge', reuseCount: 4,
    description: 'Five questions covering HCP, trick-winning, suit ranking, and contract types. Use after Module 1.',
    estimatedTime: '10 min', tags: ['quiz', 'fundamentals', 'checkpoint'],
    sourceIds: ['src-1'], createdAt: '2026-06-16', updatedAt: '2026-07-01',
    blocks: [
      {
        id: 'q1', type: 'quiz',
        content: {
          questions: [
            { question: 'How many HCP does an Ace have?', type: 'multiple-choice', options: ['1', '2', '3', '4'], correct: 3, explanation: 'A=4, K=3, Q=2, J=1.' },
            { question: 'Suit ranking lowest to highest?', type: 'multiple-choice', options: ['♠ ♥ ♦ ♣', '♣ ♦ ♥ ♠', '♥ ♠ ♣ ♦', '♦ ♣ ♠ ♥'], correct: 1, explanation: 'Clubs < Diamonds < Hearts < Spades (alphabetical C-D-H-S).' },
            { question: 'Tricks needed to make 3NT?', type: 'multiple-choice', options: ['7', '8', '9', '10'], correct: 2, explanation: '6 (book) + 3 = 9 tricks.' },
            { question: 'Cards dealt to each player?', type: 'multiple-choice', options: ['10', '11', '12', '13'], correct: 3, explanation: '52 ÷ 4 = 13 cards each.' },
            { question: 'What does "ruff" mean?', type: 'multiple-choice', options: ['Lead the highest card', 'Play a trump when void', 'Discard a loser', 'Win with the ace'], correct: 1, explanation: 'Ruffing = playing a trump when unable to follow suit.' },
          ],
        },
      },
    ],
  },
  {
    id: 'obj-8', type: 'tutorial', title: 'How to Play a Hand',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'published', scope: 'bridge', reuseCount: 2,
    description: 'Step-by-step walkthrough of playing a complete hand as declarer — counting winners, drawing trumps, entry management.',
    estimatedTime: '50 min', tags: ['play', 'declarer', 'tutorial'],
    sourceIds: ['src-1', 'src-2'], createdAt: '2026-06-19', updatedAt: '2026-07-04', blocks: [],
  },
  {
    id: 'obj-9', type: 'summary', title: 'Cram Sheet',
    ownerId: 'sam', ownerName: 'Sam Rivera',
    status: 'draft', scope: 'bridge', reuseCount: 0,
    description: 'One-page reference: HCP table, suit rankings, game thresholds, and common conventions at a glance.',
    estimatedTime: '5 min', tags: ['reference', 'summary', 'HCP'],
    sourceIds: ['src-1'], createdAt: '2026-06-25', updatedAt: '2026-07-07', blocks: [],
  },
  {
    id: 'obj-10', type: 'reflection', title: 'Your First Deal',
    ownerId: 'sam', ownerName: 'Sam Rivera',
    status: 'draft', scope: 'bridge', reuseCount: 0,
    description: 'A guided reflection on your first complete bridge deal. What did you plan? What surprised you?',
    estimatedTime: '15 min', tags: ['reflection', 'metacognition'],
    sourceIds: [], createdAt: '2026-06-26', updatedAt: '2026-07-07', blocks: [],
  },
  {
    id: 'obj-11', type: 'scenario', title: 'Plan the Play',
    ownerId: 'sam', ownerName: 'Sam Rivera',
    status: 'in-review', scope: 'bridge', reuseCount: 1,
    description: 'You\'re in 4♠ with ♠AKJ10x opposite ♠Qxx. What is your plan before playing card one?',
    estimatedTime: '20 min', tags: ['scenario', 'declarer play', 'planning'],
    sourceIds: ['src-1'], createdAt: '2026-06-28', updatedAt: '2026-07-10', blocks: [],
  },
  {
    id: 'obj-12', type: 'assignment', title: 'Explain a Contract',
    ownerId: 'sam', ownerName: 'Sam Rivera',
    status: 'draft', scope: 'bridge', reuseCount: 0,
    description: 'Pick any contract from your practice deals this week and write a short explanation of why you bid it and what your plan was.',
    estimatedTime: '25 min', tags: ['assignment', 'writing', 'contract'],
    sourceIds: [], createdAt: '2026-07-01', updatedAt: '2026-07-10', blocks: [],
  },
  {
    id: 'obj-13', type: 'drill', title: 'Level → Tricks',
    ownerId: 'chen', ownerName: 'Chen Wei',
    status: 'published', scope: 'bridge', reuseCount: 6,
    description: 'Rapid-fire drill: given a contract level, say how many tricks you need. Build automatic recall.',
    estimatedTime: '8 min', tags: ['drill', 'tricks', 'levels'],
    sourceIds: [], createdAt: '2026-06-15', updatedAt: '2026-07-01', blocks: [],
  },
];

export const COURSES: Course[] = [
  {
    id: 'course-1', title: 'Learn to Play Bridge',
    authorId: 'chen', authorName: 'Chen Wei',
    status: 'published',
    description: 'A complete beginner\'s journey from never having held a bridge card to comfortably playing rubber bridge with friends.',
    estimatedTotal: '6h 30m', learnerCount: 24, scope: 'bridge',
    modules: [
      {
        id: 'mod-1', title: 'The Basics',
        lessons: [
          { id: 'les-1', title: 'Introduction to Bridge', objectId: undefined, status: 'completed', estimatedTime: '20 min' },
          { id: 'les-2', title: 'Tricks & Trumps', objectId: 'obj-1', status: 'in-progress', estimatedTime: '45 min' },
          { id: 'les-3', title: 'The Two Phases of a Deal', objectId: 'obj-2', status: 'not-started', estimatedTime: '30 min' },
        ],
      },
      {
        id: 'mod-2', title: 'The Language of Bidding',
        lessons: [
          { id: 'les-4', title: 'How Bidding Works', objectId: 'obj-3', status: 'not-started', estimatedTime: '40 min' },
          { id: 'les-5', title: 'Opening the Bidding', objectId: 'obj-4', status: 'not-started', estimatedTime: '35 min' },
          { id: 'les-6', title: 'Responding to Partner', objectId: undefined, status: 'not-started', estimatedTime: '40 min' },
        ],
      },
      {
        id: 'mod-3', title: 'Playing the Hand',
        lessons: [
          { id: 'les-7', title: 'How to Play a Hand', objectId: 'obj-8', status: 'not-started', estimatedTime: '50 min' },
          { id: 'les-8', title: 'Plan the Play', objectId: 'obj-11', status: 'not-started', estimatedTime: '20 min' },
          { id: 'les-9', title: 'Entry Management', objectId: undefined, status: 'not-started', estimatedTime: '35 min' },
        ],
      },
      {
        id: 'mod-4', title: 'Mastery & Review',
        lessons: [
          { id: 'les-10', title: 'Basics Checkpoint', objectId: 'obj-7', status: 'not-started', estimatedTime: '10 min' },
          { id: 'les-11', title: 'Cram Sheet & Reflect', objectId: 'obj-9', status: 'not-started', estimatedTime: '20 min' },
        ],
      },
    ],
  },
  {
    id: 'course-2', title: 'Bidding Foundations',
    authorId: 'chen', authorName: 'Chen Wei',
    status: 'in-review',
    description: 'A focused course on Standard American bidding: opening bids, responses, and common conventions.',
    estimatedTotal: '4h', learnerCount: 0, scope: 'bridge',
    modules: [
      {
        id: 'mod-5', title: 'Opening Bids',
        lessons: [
          { id: 'les-12', title: 'Opening the Bidding', objectId: 'obj-4', status: 'not-started', estimatedTime: '35 min' },
          { id: 'les-13', title: '1NT Opening', objectId: undefined, status: 'not-started', estimatedTime: '30 min' },
        ],
      },
      {
        id: 'mod-6', title: 'Responding',
        lessons: [
          { id: 'les-14', title: 'Responding to 1 of a Major', objectId: undefined, status: 'not-started', estimatedTime: '40 min' },
          { id: 'les-15', title: 'Responding to 1NT', objectId: undefined, status: 'not-started', estimatedTime: '35 min' },
        ],
      },
    ],
  },
];

export const REVIEWS: ReviewItem[] = [
  {
    id: 'rev-1', objectId: 'obj-11', type: 'object', title: 'Plan the Play',
    objectType: 'scenario', submittedBy: 'Sam Rivera', submittedAt: '2026-07-10',
    status: 'in-review',
    comments: [
      { id: 'cmt-1', authorId: 'lee', authorName: 'Lee Park', authorRole: 'Object Reviewer', blockId: undefined, content: 'Great scenario. Could you add a "stop and plan" prompt before the bridge play widget?', resolved: false, createdAt: '2026-07-11' },
    ],
  },
  {
    id: 'rev-2', courseId: 'course-2', type: 'course', title: 'Bidding Foundations',
    submittedBy: 'Chen Wei', submittedAt: '2026-07-09',
    status: 'pending', comments: [],
  },
];

export const PEOPLE: Person[] = [
  { id: 'sam', name: 'Sam Rivera', initials: 'SR', email: 'sam@laic.org', role: 'content-developer', assignedCourses: [] },
  { id: 'lee', name: 'Lee Park', initials: 'LP', email: 'lee@laic.org', role: 'object-reviewer', assignedCourses: [] },
  { id: 'maria', name: 'María Gómez', initials: 'MG', email: 'maria@laic.org', role: 'course-reviewer', assignedCourses: [] },
  { id: 'amina', name: 'Dr. Amina Okafor', initials: 'AO', email: 'amina@laic.org', role: 'administrator', assignedCourses: [] },
  { id: 'jordan', name: 'Jordan Blake', initials: 'JB', email: 'jordan@laic.org', role: 'coach', assignedCourses: ['course-1'] },
  { id: 'riya', name: 'Riya Shah', initials: 'RS', email: 'riya@laic.org', role: 'student', assignedCourses: ['course-1'] },
  { id: 'chen', name: 'Chen Wei', initials: 'CW', email: 'chen@laic.org', role: 'content-developer', assignedCourses: [] },
];

export const VERSIONS: Version[] = [
  { id: 'v1', objectId: 'obj-1', objectTitle: 'Tricks & Trumps', versionNumber: 1, status: 'draft', createdAt: '2026-06-15', createdBy: 'Chen Wei', isLive: false, notes: 'Initial draft' },
  { id: 'v2', objectId: 'obj-1', objectTitle: 'Tricks & Trumps', versionNumber: 2, status: 'in-review', createdAt: '2026-06-22', createdBy: 'Chen Wei', isLive: false, notes: 'Added bridge play widget' },
  { id: 'v3', objectId: 'obj-1', objectTitle: 'Tricks & Trumps', versionNumber: 3, status: 'published', createdAt: '2026-07-01', createdBy: 'Chen Wei', isLive: true, notes: 'Approved and live' },
  { id: 'v4', objectId: 'obj-6', objectTitle: 'Bridge Terms', versionNumber: 1, status: 'published', createdAt: '2026-07-02', createdBy: 'Chen Wei', isLive: true, notes: 'Initial 12-card set' },
  { id: 'v5', objectId: 'obj-11', objectTitle: 'Plan the Play', versionNumber: 1, status: 'in-review', createdAt: '2026-07-10', createdBy: 'Sam Rivera', isLive: false, notes: 'Submitted for review' },
];

export const LEARNER_PROGRESS: LearnerProgress[] = [
  {
    learnerId: 'riya', learnerName: 'Riya Shah', courseId: 'course-1',
    completedLessons: ['les-1'], currentLessonId: 'les-2',
    quizScores: {}, overallPercent: 9, lastActive: '2026-07-16',
  },
];

export function getTodaysFocus(learnerId: string) {
  const progress = LEARNER_PROGRESS.find(p => p.learnerId === learnerId);
  if (!progress) return null;
  const course = COURSES.find(c => c.id === progress.courseId);
  if (!course) return null;
  for (const mod of course.modules) {
    const lesson = mod.lessons.find(l => l.id === progress.currentLessonId);
    if (lesson) {
      const obj = OBJECTS.find(o => o.id === lesson.objectId);
      return { lesson, obj, course, module: mod, progress };
    }
  }
  return null;
}

export function getNextUp(learnerId: string) {
  const progress = LEARNER_PROGRESS.find(p => p.learnerId === learnerId);
  if (!progress) return null;
  const course = COURSES.find(c => c.id === progress.courseId);
  if (!course) return null;
  let foundCurrent = false;
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      if (foundCurrent) return { lesson, module: mod, course };
      if (lesson.id === progress.currentLessonId) foundCurrent = true;
    }
  }
  return null;
}
