Build a polished, front-end-only prototype of the **LAIC Learning Platform** — an authoring-and-delivery tool where a team creates "learning objects" (lessons, quizzes, flashcards, courses…) from source material, reviews and publishes them, and delivers them to learners. It's one configured instance of a multi-program platform; seed it as the **Bridge** program run by **Life in AI Center (LAIC)**.

No backend. Use realistic in-memory mock data (typed) and a **role switcher** in the top bar so I can preview every role. Make it responsive and keyboard-friendly. Prioritize a beautiful, cohesive, premium UI — not generic shadcn defaults.

## Stack & conventions
- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, lucide-react icons, framer-motion for subtle motion.
- Load fonts with `next/font`. Keep all state in React (no localStorage). Centralize mock data in `/lib/data.ts` with clean types.
- One `RoleSwitcher` + `ProgramSwitcher` in the top bar drive which nav and screens render.

## Design system — soft, calm, glassy (match the reference)
The whole app should feel like the reference screenshot: serene, airy, premium — a soft sky-blue gradient world with big rounded white cards, frosted-glass accents, near-black text, and solid black pill buttons. **Mobile-first** for learner views; the same language scales up to desktop for the authoring tools. Set these as the theme / CSS variables; do **not** ship the default shadcn theme.

- **Background:** a soft, desaturated vertical gradient — muted sky/steel blue at the top (~`#A9BBCB`) fading to near-white (~`#F2F5F8`) at the bottom. Calm and low-contrast. Optionally a faint blurred blue glow behind the header. This gradient is the app canvas on every screen.
- **Surfaces:** large white cards, very rounded (`rounded-[28px]`), with soft diffuse shadows — e.g. `shadow-[0_12px_40px_-12px_rgba(30,50,80,0.18)]`, never harsh. Generous inner padding.
- **Glass / frosted:** secondary chrome is translucent frosted glass — `bg-white/55` + `backdrop-blur-xl` + a hairline `border-white/50`. Use it for the top "Overall progress" pill, the week strip, icon buttons, overlays/sheets, and the bottom prompt bar.
- **Primary button:** a solid near-black pill — `bg-[#0B0F1A]`, white text, `rounded-full`, comfortable padding — often with a small colored glyph chip on the left (like the rounded-square play icon in the reference). Black pills are the hero CTAs everywhere: "Start task", "Publish", "Submit for review".
- **Accent:** program accent **emerald** `#059669`, used *sparingly* for progress rings, active dots, and small indicators — the palette stays mostly neutral blue-gray + white + black. A single warm **amber** only for the "highlighter" mark in the authoring mark-up step.
- **Status colors (soft pills with a leading dot):** draft = slate/gray, in review = amber, changes requested = orange, approved = sky, published = emerald, archived = zinc.
- **Text:** near-black headings `#0B1220`; secondary gray `#6B7280`; tertiary `#9AA3AF`. Large headings are bold with tight leading (like "Study Typography Fundamentals"). Section labels are small, **sentence-case**, gray, medium weight ("Today's focus", "Next Up", "This week") — soft and quiet, NOT uppercase mono kickers.
- **Type:** one clean, neutral, humanist sans throughout — **Geist** (or Inter) for everything, tight tracking on big headings. No serif and no decorative display face; the calm comes from spacing, weight, and roundness, not ornament. Geist Mono only for tiny metadata/IDs if ever needed.
- **Shape & density:** cards `rounded-[24–28px]`, pills `rounded-full`, controls `rounded-2xl`. Airy, generous whitespace, very few borders — prefer soft shadow + the gradient to separate things rather than hairlines.
- **Motion:** gentle and iOS-like — soft spring transitions (framer-motion). Cards ease/scale in, sheets slide up from the bottom, progress rings animate on mount. 200–300ms, nothing snappy or aggressive.
- **Signature pieces to build and reuse (straight from the reference):** a **"Today"-style header** (big title + date + a frosted icon button, top-right); a translucent **progress pill** (ring + label + %); a large **focus card** (small label, avatar top-right, big title, description, black pill CTA, muted time estimate like "2h"); a **Next Up** row; a horizontal **week strip** (M–S with dates, the current day in a solid white rounded cell, tiny task dots under days); and a frosted **prompt bar** pinned to the bottom ("I want to become…"). These define the look — carry their styling across every screen.
- **Polish:** beautiful empty states (soft icon + one sentence + black pill). Skeletons on first mount. Toasts as frosted pills, bottom-center. A ⌘K palette for navigation.

## Global layout
- **Left sidebar** (frosted glass on the gradient, not dark): LAIC wordmark + program chip at top; role-specific nav items with lucide icons, the active item a solid white rounded cell with soft shadow; user chip + "Log out" pinned at the bottom. On mobile this collapses to a bottom tab bar / sheet.
- **Top bar:** a "Today"-style area — screen title + context line, a `ProgramSwitcher` (Bridge · Brain Bee · MindAI) and `RoleSwitcher` (the six roles) as frosted pills, plus a frosted ⌘K icon button on the right.
- **Login / org portal** (first screen): the soft blue gradient canvas with a centered **frosted glass** sign-in card (rounded-[28px], backdrop-blur). LAIC wordmark + one-line mission, a cosmetic email/password field group, a black pill **Sign in** (→ Administrator), then a quiet "demo test logins — one tap" list of persona rows as frosted pills (avatar initials, name, "Bridge · Role", chevron) — 3 featured, the rest under an "All roles" disclosure. Keep it calm and glassy rather than a browser-chrome mock.

## Roles & screens

**1) Content Developer** — nav: Home, Create, Sources, Object Library, My Submissions, Versions & Publishing, Author Analytics.
- *Home:* hub of large action cards routing to the screens below, plus small counts (objects, pending reviews, drafts).
- *Create:* a grid of "learning object" tiles — Course, Lesson, Tutorial, Quiz, Flashcard set, Concept card, Summary, Reflection, Scenario, Assignment, Drill, Video script — each an icon + name + one-line description + "Define & configure →". Below, a row of **specialized block** tiles (team-built): "Bridge play" and "Bidding sequence". Tapping the **Course** tile opens the Course Wizard; other tiles open the Object Creator.
- *Object Creator (flow, stepper):* Sources → **Mark up** (highlight passages in a source, amber highlighter) → **Extract** (marked passages become typed content units: definition/key point/example/quote) → **Define** (objective, audience, approach) → **Build** (assemble typed content blocks). Ends in a full-screen block editor; "Submit for review" / "Publish".
- *Course Wizard (flow, stepper):* Sources → Design (audience, approach, hierarchy names, pacing, objectives/diagnostic/capstone/certificate toggles) → Skeleton (modules → lessons; a lesson can reuse an existing object) → Generate → Review → **Learner interactions** (toggles: Ask-AI, Quiz-me, create flashcards, notes, require order, show hints, explanation timing) → Publish.
- *Sources:* searchable source library + collections/pools; each source shows kind (PDF/slides/audio/video/transcript/link), pages, domain, "primary" flag; an "Add source" modal with drag-drop + link paste.
- *Object Library:* all objects grouped by type, with search + filters (Type / Status / Scope). Rows show icon, title, owner, status pill, scope, reuse count. Actions: Preview (opens a clean read view rendering the object's blocks), New draft, Edit. A "Shared with Bridge from other programs" strip you can Adopt from. **Courses appear here too** as a "Courses" group of composite objects. (Do NOT add a separate My Courses tab.)
- *My Submissions:* the dev's review items with stage + status + a feedback/comment thread.
- *Versions & Publishing:* per object/course, a version timeline (draft/in-review/approved/published), a live-version pointer, and a Publish action that lets you pick an audience.
- *Author Analytics:* tasteful charts — views, completion rate, quiz score distribution, most-reused objects.

**2) Object Reviewer** — nav: Object Reviews. A queue of submitted objects; open the read view and leave **block-level comments** (a comment pinned to a specific block, with author, role, open/resolved state); Approve / Request changes.

**3) Course Reviewer** — nav: Course Reviews. Same pattern for courses; comment per section/lesson; Approve / Request changes.

**4) Administrator** — nav: Program Overview, People & Roles, Courses & Assignments, Publishing & Governance.
- *Program Overview:* instance config — enabled object types (toggles), specialized blocks with a two-level gate (enabled to instance + admin-visible to authors), a display-only metering card (used / limit), theme.
- *People & Roles:* a roles table with per-action permissions (create objects, edit, mark-up/extract, submit for review, comment, repo read, preview as learner) and object-type scoping; a "New role" editor; assign people to roles.
- *Courses & Assignments:* governance over courses and who they're assigned to.
- *Publishing & Governance:* what's live across the program; approval queue; unpublish / re-point live version.

**5) Coach** — nav: Coach. Learner roster; assign a published course/object (pins the version); per-learner progress and interaction history.

**6) Student** — nav: Student. This is where the reference screenshot lives — build the learner home as that exact **"Today" dashboard**: the gradient canvas, a "Today" + date header with a frosted settings icon, a frosted **Overall progress** pill (ring + %), a large white **focus card** ("Today's focus" label, avatar, big lesson title, description, a black **Start task** pill with a small glyph chip + a muted time estimate), a **Next Up** row, a **This week** strip (M–S dates, current day highlighted, task dots), and a frosted **prompt bar** at the bottom ("I want to become…"). Tapping Start task opens a calm learner **reader** that renders content block-by-block, with quiz blocks (feedback), the two specialized interactive widgets (a "win the trick" bridge board and a step-through bidding auction), notes, and an "Ask AI" affordance — all gated by the course's learner-interaction policy.

## Reusable components to build well
`StatusPill` (dot + label), `SoftLabel` (small sentence-case gray label), `SectionHeader`, `Chip`, `Card` (rounded-[28px] + soft shadow), `GlassButton`/`GlassPill` (frosted), `ProgressPill` (ring + %), `FocusCard`, `WeekStrip`, `PromptBar` (frosted bottom bar), `Stepper`, `ObjectRow`, `CourseRow`, `CommandPalette` (⌘K), `RoleSwitcher`, `ProgramSwitcher`, `Sheet`/`Modal` (slide-up, frosted), `CommentThread`, `BlockRenderer` (renders: rich text, concept card, source excerpt, single question, quiz, flashcard set, reflection, summary, scenario, assignment, image, specialized block), `Toasts` (frosted, bottom-center), `EmptyState`, `Skeleton`.

## Mock data (seed it richly — Bridge program)
- **Courses:** "Learn to Play Bridge" (published, 4 modules, 11 lessons), "Bidding Foundations" (in review).
- **Objects across every type:** lessons "Tricks & Trumps", "The Two Phases of a Deal", "How Bidding Works", "Opening the Bidding" (draft); concept card "Trump vs Notrump"; flashcard set "Bridge Terms" (12 cards); quiz "Basics Checkpoint" (5 questions with feedback); tutorial "How to Play a Hand"; summary "Cram Sheet"; reflection "Your First Deal"; scenario "Plan the Play"; assignment "Explain a Contract"; drill "Level → Tricks".
- **Sources:** "How to play bridge" (guide, PDF, 6 pages, primary) and "Bridge basics" (video transcript, 5 min).
- **People / roles:** Sam Rivera (Content Developer), Lee Park (Object Reviewer), María Gómez (Course Reviewer), Dr. Amina Okafor (Administrator), Jordan Blake (Coach), Riya Shah (Student); course author "Chen Wei".
- Make the grounded content real (High Card Points A=4/K=3/Q=2/J=1; suit rank ♣<♦<♥<♠<NT; win-the-trick logic) so nothing reads as lorem ipsum.

## Build priority (if you can't do everything at once)
1. Global shell + design system + login portal + role/program switchers.
2. Content Developer: Object Library, Create grid, Sources.
3. Object Creator + Course Wizard steppers.
4. Review screens with block-level comments; Versions & Publishing.
5. Admin (Program Overview, People & Roles), Coach, Student reader with the two interactive bridge widgets.
6. Author Analytics + ⌘K palette + polish pass (motion, empty states, skeletons).

Deliver it looking genuinely designed and calm — soft blue gradient, big rounded frosted-glass cards, near-black pill buttons, clean Geist type, gentle spring motion — exactly the serene, premium feel of the reference screenshot, applied consistently across every screen.
