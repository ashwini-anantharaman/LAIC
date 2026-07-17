# LAIC Learning Platform — Remaining Screens, Full Feature Spec

Every surface not already in the dedicated specs, organized **ROLE → TAB**. Read from
source. Already covered elsewhere: **Content Developer → Create** (the Course wizard and
the 10 object-type creators) and **Content Developer → Sources** and **Administrator →
People & Roles** — see `course-wizard-…`, `learning-objects-…`, `sources-tab-…`,
`people-roles-…`.

## Global chrome
Left sidebar nav is role-scoped:
- **Content Developer:** Home · Create · Sources · Object Library · My Submissions · Versions & Publishing · Author Analytics.
- **Object Reviewer:** Object Reviews. **Course Reviewer:** Course Reviews.
- **Administrator:** Program Overview · People & Roles · Courses & Assignments · Publishing & Governance.
- **Coach:** Coach. **Student:** Student.
Shared status values: **draft · in review · changes requested · approved · published** (+ archived). Scopes: **Private · Team · Program · Organization**.

---

# CONTENT DEVELOPER (dev)

## Content Developer → Home
- **Program banner:** theme icon + "{ORG} · {programType} program" + **{instance name}** + "Your workspace for building learning…", and three live stats: **objects · courses · sources**.
- **"What do you want to do?"** — six action cards: **Create a learning object** (→ Create), **Build a course** (→ course wizard), **Bring in sources** (→ Sources), **Object Library**, **My Submissions**, **Versions & Publishing**. Each card = icon + title + description + "Open →".
- **Recent objects** — up to 4 cards (icon, title, "{type} · updated {date}", status chip) + an "Object Library →" link. Hidden if none.

## Content Developer → Create
Header kicker "{instance name} · Content Developer", title **Create**. An instance chip card ("{N} object types · {N} specialized blocks enabled").
- **Learning objects** — grid of `TypeTile`s for each **enabled** object type (icon + name + description); clicking starts the Object Creator (see `learning-objects-feature-spec.md`). *(The Course tile / course wizard lives here too — see `course-wizard-feature-spec.md`.)*
- **Specialized blocks** — grid of team-built blocks enabled for this instance (e.g. Bridge Play, Bidding Sequence); clicking opens a modal explaining the block ("a coded component the {team} team built… isn't AI-generated") with a **live preview** of what the learner sees, and for Bridge blocks an interactive widget (BridgePlayWidget / BiddingWidget).
- **Tools & utilities** — grid of `UTILS` (e.g. Video script); clicking opens a `UtilityRunner`.
- Amber note: "Every object follows the same spine — **Sources → Mark up → Extract → Define → Build**… the types you see here come from **this instance's configuration**."

## Content Developer → Object Library
Header kicker "{program} · {subject}", title **Object Library**, sub "Every learning object in this program — including courses, which are composite objects…", right **＋ New course** (when enabled).
- **Filter bar:** search box + **Type** dropdown (All + every object type) + **Status** dropdown (All / draft / in review / changes requested / approved / published) + **Scope** dropdown (All / Private / Team / Program / Organization).
- **"Shared with {program}" card** (amber) — objects from *other* programs that are org-scoped + shared, each an `ObjRow` with an **Adopt & adapt** path.
- **Courses group** — heading "Courses · {N} · composite objects"; each course is a `CourseRow`: graduation icon, title (+ "· draft version" when applicable), "Course · {dev} · {N} modules · {N} lessons", a **composite** chip, status chip, **👁 View** (→ Course preview) and **✎ New draft / Edit** (New draft if live).
- **Object groups by type** — one section per type present ("{Type}s · {count}"), each object an `ObjRow`.
- **ObjRow** shows: type icon, title, owner, status chip, scope chip, reuse count, and actions (**View** → ObjPreview; **Edit**; and for shared/other-program objects, **Adopt**).
- Empty state: "No objects match these filters."

**Modal — Object preview (`ObjPreview`)**: title + "{type} · {owner}{· source program}"; scope + status chips; "Source: {citation}"; then either the rendered **content blocks** (if seeded) or a **"What's inside"** bullet list (blueprint or a type preset). For objects from another program: an amber note + **⑂ Adopt & adapt** ("makes an editable copy in {program}… without changing the original").

## Content Developer → My Submissions  (Review Queue)
Header "Instructor / Review Queue", sub "Items you've sent for review, plus block-level feedback…", right chip "{N} in review".
- **Feedback inbox** (`FeedbackInbox`) — open comments left by reviewers/coaches, grouped by target (course/object): each group card shows the target title, an "{N} open" chip, and each comment (avatar initials, author, role · date, "on {block}") with a **✓ Resolve** action.
- **"Submitted for review"** list — each submitted item: inbox icon, title, "{stage} · {when}", status chip. Empty state "Nothing in review."

## Content Developer → Versions & Publishing
Header "Instructor / Versions & Publishing", sub "Version history and publishing status. Courses go live only after administrator approval."
- A **table**: columns **Course / object · Version · Status · Date · Note** (status shown as a chip). Read-only history.

## Content Developer → Author Analytics
Header "Instructor / Author Analytics", sub "How your published content performs.", right chip "last 30 days".
- **Four stat cards:** Avg completion · Avg quiz score · AI drafts accepted · Published objects.
- **Per-object table:** columns **Object (+ type chip) · Views · Completion% · Signals** — Signals surfaces issues (e.g. "Q4 missed by 61% — review distractor B") with an alert icon, else "—".
- *(Caveat: analytics figures are illustrative/seeded in the prototype.)*

---

# OBJECT REVIEWER (objrev)

## Object Reviewer → Object Reviews
Header "{program} · Object Reviewer · Lee Park", title **Object Reviews**, sub "Individual learning objects submitted in this program… objects and courses have separate reviewers."
- **Queue** of objects with status *in review*: each row = type icon, title, "{type} · {owner} · {submitted}", an open-comment count chip, scope chip, **👁 Review**. Empty: "No objects waiting for review."
- Opening one → the **Review workspace** (shared, see below) in *review* mode, rendering the object's content block by block for block-level comments, with **Approve** / **Request changes**.

---

# COURSE REVIEWER (courserev)

## Course Reviewer → Course Reviews
Header "{program} · Course Reviewer · María Gómez", title **Course Reviews**, sub "Assembled courses awaiting sign-off… Approving passes the course to the administrator, who decides where it publishes."
- **Queue** of courses with status *in review*: row = graduation icon, title, "{N} modules · {N} lessons · by {dev}", open-comment count chip, **👁 Review**. Empty: "No courses waiting for review."
- Opening one → the **Review workspace** in *review* mode over the course's blocks; **Approve** (→ passes to administrator for audience/publishing) or **Request changes** (→ returns comments to the developer).

---

# ADMINISTRATOR (admin)
*(People & Roles is documented separately.)*

## Administrator → Program Overview
Header "{ORG} · Administrator · Dr. Amina Okafor", title "{program} — Program Overview", sub about administering one program with no cross-org sharing.
- **Org → program breadcrumb** chips (the current program highlighted).
- **Four stat cards:** Objects · Courses · People · Teams.
- **Object pipeline** card — a bar per status (draft / in review / changes requested / approved / published) with counts.
- **Recent activity** card — a short activity feed (drafted / approved / adopted / published lines).

## Administrator → Courses & Assignments
Header "{program} · Administrator", title **Courses & Assignments**, sub "…where a course begins its life before a developer picks it up.", right **＋ New course** (toast "New course created — assign a developer").
- **Course cards** — each: graduation icon, title, "{N} modules · {N} lessons", status chip; and a staffing row of chips: **Developer: {name}**, **Object reviewer: Lee Park**, **Course reviewer: María Gómez**, plus **⊕ Assign people** (toast "Assignment updated").

## Administrator → Publishing & Governance
Header "{program} · Administrator", title **Publishing & Governance**, sub "Approved work waits here until you decide who it reaches. This is the one place that answers 'published to whom?'"
- **Cards** for each course that is *approved* or *published*: title, "{N} modules · {N} lessons", status chip; an **Audience** line (shows the published audience or "not published yet"); and either **➤ Set audience & publish** (approved) or **⚙ Edit audience** (published).
- **Audience modal** (`AudienceModal`): title "Publish — choose the audience". Toggles:
  - **Share org-wide — all programs in {ORG}** ("Other programs can adopt & adapt it").
  - **Everyone in {program}** ("All teams in this program").
  - *If neither of the above:* a **specific teams** pill picker (e.g. Memory · Cognition · Biases).
  - **Coaches' students** ("Coaches… can assign it to their own students").
  - **Directly to enrolled students**.
  - A live **Audience → {summary}** readout; footer **Publish to this audience** (disabled until an audience is chosen).

---

# COACH (coach)

## Coach → Coach
Header "{program} · Coach · Jordan Blake", title **Coach**, sub "Coaches are teachers in the ecosystem. You assign published courses to your own students, follow how they're doing, go through the exact learner interactions yourself, and send feedback to the developer…", right **▶ Try the learner experience**.
- **Available to assign** — published course cards; each with **💬 Comment** (→ coach-mode review workspace, sends comments to the developer), **▶ Try** (→ learner runtime), **⊕ Assign** (→ assign modal).
- **My students** — roster table: avatar, name, a **progress bar** + %, and a **nudge** (send) button for students under 20%. Note "Progress is per-student: completion, quiz scores, and time on task."
- **The learner experience** panel — description + interaction chips (Ask AI · Quiz me · Flashcards · Reflections · Notes) + **▶ Open**.
- **Learner interaction settings — your cohort** — toggles that override course defaults *for this coach's students only*: **Ask-AI study panel · AI 'quiz me' · Learner-made flashcards · Private notes · Show question hints** + **Save for my students** (toast). Note: "the developer's published course is unchanged."
- **Assign modal** — "Assign — {course}"; a checklist of the roster; footer **Assign to {N}** (toast).
- **Comment flow** — opens the shared **Review workspace** in *coach* mode (block-level comments; the action is **Done — feedback sent** rather than approve/reject).

---

# STUDENT (student)

## Student → Student  ("My learning")
Header "{program} · Student · Riya Shah", title **My learning**, sub "Courses assigned by your coach or enrolled through your program. Pick up where you left off."
- **Featured assigned course** card (violet): domain chip + **assigned** chip, title, subtitle, "~{N} min", "{N} modules · {N} lessons", and **▶ Open course** (→ the learner runtime).
- **Also assigned** — cards for other courses; locked ones show a lock icon + "Unlocks after Module 1" and are dimmed.
- Info note pointing to the fully playable demo course.

### The Learner Runtime (the course player — shared with Coach "Try")
Launched by **Open course** / **Try the learner experience**. It's a full playable reader:
- **Course/module map** to pick a lesson or checkpoint; progress ring/bars.
- **Lesson player (`RtLessonPlayer`):** breadcrumb (course › module › lesson), a **required-block progress bar** ("{done}/{required} required"), an **Ask AI** button, the lesson title, then the content blocks rendered for learners:
  - rich text / concept card / source excerpt (read),
  - **questions** (`RtQuestion`) — answer to complete, feedback per policy,
  - **reflection** (`RtReflection`) — respond to complete,
  - quizzes and flashcard sets.
  - Required blocks gate lesson completion; **Prev / Next** move between lessons.
- **AI study panel (`RtAI`)** — a right-side drawer "AI study help" with quick prompts **Explain this · Give an example · Simplify · Quiz me** plus a free-text box; replies are "scoped to this lesson and its sources."
- Which helpers appear (**Ask-AI, Quiz-me, learner flashcards, notes, hints, feedback timing**) is governed by the **course's learner-interaction policy** (set in the Course wizard Step 7) and can be narrowed by the **coach's cohort settings**.

---

# SHARED COMPONENTS

## Review workspace (`ReviewWorkspace`) — used by Object Reviews, Course Reviews, and Coach comments
- Back link "← Back to queue"; title + meta chips + an "{N} open comments" chip.
- In **review mode**: an **Overall note** field + **Request changes** (attaches the note as an "Overall" comment and sets *changes requested*) and **Approve**. In **coach mode**: a single **Done — feedback sent**.
- The body renders each block as a card: a block label (with an amber dot if it has open comments), the block's rendered content (`RvBody`), and a **CommentBox** — an expandable thread of comments (avatar, author, role · date, resolved state) with an inline "Comment on this block…" input.

## Course preview (`CoursePreview`)
Opened from a `CourseRow` **View**: a read-only walk of the course's modules → lessons → blocks, with a way to open an individual reused object.

## Recurring chips/rows
- **StatusChip** (draft/in review/changes requested/approved/published), **ScopeChip** (Private/Team/Program/Organization), **ObjRow**, **CourseRow**, **TypeTile**.

---

## Honest caveats (prototype)
- **Author Analytics** and **Program Overview** activity/pipeline figures are seeded/illustrative, not computed from real usage.
- **Assignments and staffing** (Coach "Assign", Admin "Assign people", "New course") are stubs that fire toasts; nothing persists.
- **Coach cohort settings** and **per-source AI instructions** save via toast only.
- Role login is demo-only (persona switch), not real auth; permissions are displayed, not enforced.
- The fully playable runtime content is the seeded demo course; other listed courses are placeholders.