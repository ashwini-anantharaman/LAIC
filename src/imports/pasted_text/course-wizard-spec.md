# Course Learning Object — Full Wizard Feature Spec (Steps 1–8)

Every screen, title, field, control, option, toggle, chip, button, and banner from
the moment you click the **Course** learning object until you click **Submit for
administrator approval**. Nothing omitted. (The generated demo content is the
Brain-Facts seed — H.M., memory, synapses — but all *features* below are
program-agnostic and identical for Bridge or any program.)

---

## Entry point
Clicking the **Course** tile in **Create** (or "New course") opens the full-screen
**Course Wizard**. It is a single flow with 8 steps. Nothing is written to the
library until Step 8 submit.

## Persistent chrome (shown on every step)

**Top header bar** (white, sticky):
- Back link: **← Object Library** (exits the wizard).
- Flow title: **New course from a source**.
- Right chip: **▤ N source(s)** — live count of picked sources.

**Stepper bar** (sticky, horizontal, scrollable) — 8 pills with a chevron between each:
1. **Source** (upload icon)
2. **Structure** — carries a small amber **NEW** badge
3. **Skeleton** (layers icon)
4. **Generate** (wand icon)
5. **Editor** (pencil icon)
6. **Review** (eye icon)
7. **Interactions** (settings icon)
8. **Publish** (send icon)
- Active step = dark pill with amber number chip. Completed = check + green chip.
Future (unreached) steps are disabled/greyed and not clickable. You can click back
to any already-reached step.

**Bottom action bar** (fixed, white):
- **← Back** button (disabled on Step 1).
- Center caption: **Step {n} of 8 · {step name}**.
- Right primary button, label changes per step:
  - Step 1 → **Design structure →**
  - Step 2 → **Parse source →**
  - Step 3 → **Confirm outline →**
  - Step 4 → **Generate content →**
  - Step 5 → **Open review →**
  - Step 6 → **Set interactions →**
  - Step 7 → **Go to publish →**
  - Step 8 → (no next; uses the in-page **Submit** button; after submit shows **✓ Finish**)
- On Step 8 before submit, the right side shows a chip: **use "Submit" above**.

---

## STEP 1 — Source
**Kicker:** New course · step 1
**Title:** Choose your source(s)
**Subtitle:** Pick one or more from your Source Library, or upload new material. Sources are reusable across every course and tool — upload once, use many times.

**Left column — source list.** Each source is a selectable row (multi-select; toggles violet when on):
- Check icon (checked square when selected / empty square when not).
- File icon tile.
- Source **title** (bold).
- Metadata line (mono): **{filename} · {pages}p**.
- Right: a **{kind}** chip (e.g. pdf) and the **{domain}** label beneath.
- Sources flagged `primary` are pre-selected when the wizard opens.

**Right column (sticky) — "Add a source" card:**
- Heading: **Add a source**.
- Text: "Upload PDF / DOCX / slides / text. Saved to your library so you can reuse it — upload several at once."
- **Upload dropzone** (dashed border): file input (multiple) — "Drop files or click to upload". On upload it adds the source and auto-selects it.
- **or name a source…** text field + a **＋ (FolderPlus)** button to add a named source (auto-selected).
- Below the card: a live counter — "**{N}** selected · pick several to combine them into one build."

**Gate:** the Next button is disabled until at least one source is selected.

---

## STEP 2 — Structure (Design your course)
**Kicker:** New course · step 2
**Title:** Design your course
**Subtitle:** Set the shape, the names, and the teaching decisions behind the course. Everything here is optional and editable — nothing is generated until the next step.

Two columns: a stack of setting cards (left) and a sticky live **preview** (right).

### Card: Course identity  (icon: graduation cap)
- **Title** — text input, placeholder "Name your course (optional)".
- **Subtitle** — text input, placeholder "One line on what it covers".
- **Who is it for?** (users icon) — segmented buttons: **Beginners · Intermediate · Advanced · Mixed level** (default *Mixed level*).

### Card: Source parsing & teaching approach  (icon: wand)
- Two selectable method cards:
  - **Parse by table of contents** — "Follow the source's own chapters and section headings."
  - **Let AI parse & recommend** — "AI proposes a pedagogical structure from the content." (default)
- **How should content be organized?** (compass) — four approach cards (single select):
  - **Concept-first** — "Explain the idea, then apply it" (default)
  - **Case-based** — "Anchor each topic in a real case"
  - **Problem-based** — "Open with a problem to solve"
  - **Spiral review** — "Revisit ideas with growing depth"

### Card: Define your hierarchy  (icon: list-tree)
Note text: "Turn levels on or off and rename them to fit your subject. It doesn't have to be Modules → Lessons → Checkpoints — only the innermost level is required."
Four **level rows**, each with an on/off toggle (except the required content level) + an editable name field:
- **Top grouping level** — toggle (default OFF), name default **Part**. Hint: "Optional — e.g. Part, Unit, Strand".
- **Grouping level** — toggle (default ON), name default **Module**. Hint: "e.g. Module, Chapter, Topic — turn off for a flat list".
- **Content level** — always on (cannot toggle), name default **Lesson**. Hint: "The teachable pieces — e.g. Lesson, Page, Section".
- **Assessment points** — toggle (default ON), name default **Checkpoint**. Hint: "Optional — e.g. Checkpoint, Quiz, Milestone".

### Card: The learning experience  (icon: route)
- **How do learners move through it?** — three progression cards (single select):
  - **Linear (in order)** — "Learners move step by step" (default)
  - **Open (any order)** — "Learners choose where to start"
  - **Unlock by prerequisite** — "Later parts unlock as earlier ones finish"
- **Lesson length** (timer) — segmented: **Short (~5 min) · Standard lessons · In-depth (20 min+)** (default *Standard lessons*).
- Toggle: **Draft learning objectives for each {module/lesson}** (default ON) — hint "Adds a short 'what you'll be able to do' at the start." (label adapts to the enabled grouping name.)

### Card: Assessment & completion  (icon: award)
- Toggle: **Open with a diagnostic check** (default OFF) — "A short quiz up front to gauge what learners already know."
- Toggle: **Finish with a capstone / final** (default OFF) — "A culminating assessment that ties the whole course together."
- Toggle: **Issue a certificate on completion** (default OFF) — "Award a certificate when the learner meets the criteria."
  - When ON, reveals **Completion criteria** dropdown: **Finish all lessons & checkpoints · Pass every checkpoint · Score 80%+ overall**.

### Right column — "Your structure" preview (sticky)
- Label: **Your structure**.
- A dark mono chip showing the live hierarchy path, e.g. `Part › Module › Lesson (+ Checkpoint)`.
- Summary rows: **Parsing** (Table of contents / AI recommends), **Approach**, **For** (audience), **Flow** (progression), **Pace** (pacing).
- Feature chips when enabled: **objectives / diagnostic / capstone / certificate**.
- Amber info note: "The parser drafts an outline in exactly this shape. A diagnostic or capstone is added straight into the outline; objectives are drafted into each {module}."

---

## STEP 3 — Skeleton (parsed outline)
**Kicker:** New course · step 3
**Title:** Here's the outline the parser produced
**Subtitle:** Parsed {from the source's table of contents / with AI recommendations}, in the structure you designed. Rename, add, or remove anything — then confirm.
**Header right button:** **↻ Regenerate** (re-parses; toast "Re-parsed — fresh outline generated").

**Left — the editable outline tree** (recursive/nested):
- **Group nodes** (modules/parts): layers icon + a **{level name}** chip + editable title. If it came from a source range, an amber mono **{source ref}** (e.g. "Ch.4 pp.32–35"). Per-group actions: **✎ rename**, **🗑 delete**. Inside each innermost group, an inline **＋ Add {lesson}** link.
- **Item nodes** (lessons): book icon + **{level name}** chip + editable title + **✎ rename** + **🗑 delete**.
- **Assessment nodes** (checkpoints): list-checks icon (amber) + chip + editable title + rename/delete.
- Titles edit inline (click pencil → input; Enter or blur saves).
- If grouping is on: a dashed **＋ Add {module}** button at the bottom adds a new top-level group.

**Right (sticky) — "Parsed into" card:** live counts — **{Module} groups**, **{Lesson} items**, **{Checkpoint}s**.
Info note: "Nothing has been written yet. You approve this outline, then choose what to generate for each item."

---

## STEP 4 — Generate (choose what to generate per item)
**Kicker:** New course · step 4
**Title:** Choose what to generate for each item
**Subtitle:** For every item, pick what the AI should produce. You don't choose block types — the AI decides those from what you ask for.

**Left — grouped item list.** Each group is a card headed by its module title. Under it, every leaf item shows:
- Icon (book for lessons, list-checks for checkpoints) + item title + a **{level name}** chip + a right-aligned "**{N} selected**" count.
- A row of multi-select "generate" pills (dark when selected, with a check):
  **Full lesson · Summary · Quiz questions · Flashcards · Concept cards · Reflection prompts · Scenario activity · Assignment · Video script**.
  (Checkpoints default to *Quiz*; lessons default to *Full lesson*.)

**Right (sticky):**
- **Teaching preferences** card — three dropdowns:
  - **Teaching style**: Conversational · Textbook · Concise / bulleted · Q&A · Scenario-first.
  - **Reading level**: Middle school · High school · General adult · Advanced.
  - **Depth**: Overview · Standard · Deep dive.
  (Level/Depth auto-seed from the Step 2 audience & pacing choices.)
- **Apply to all items** card — quick-add pills that add a type to every lesson at once: **+ Full lesson · + Quiz questions · + Flashcards**.
- Amber note: "The AI selects block types automatically based on what you asked it to generate."

Pressing **Generate content →** runs generation and advances to the editor.

---

## STEP 5 — Editor (course editor)
**Kicker:** New course · step 5
**Title:** Course editor
**Subtitle:** Everything the AI generated is here. Edit any block manually or with AI, reorder or delete, and add new blocks. Quizzes and flashcards open their builders.
**Header right chip:** **✦ {N} blocks generated**.

**Left (sticky) — lesson tree:** modules as labels; under each, every lesson/checkpoint/reused-object as a clickable row (icon by kind) with a per-lesson block count; selected row is dark.

**Right — selected lesson:**
- Lesson title + its module chip. Reused objects also show a **▤ reused** chip.

**Per-block card** (`BlockCard`) — each block has:
- Header: block-type icon + **{type} label** chip + **✦ AI-drafted** chip.
- Header actions (right):
  - For **quiz** / **flashcard_set** blocks: **⚙ Open quiz builder** / **⚙ Open flashcard builder**.
  - For all other blocks: **✦ Ask AI** and **✎ Edit** toggles.
  - **↑ up**, **↓ down** (reorder), **🗑 delete**.
- **Read view** rendered per type: rich_text (title + serif body), summary (quoted serif), concept_card (Concept label, plain-language line, "Misconception:" line), source_excerpt (amber-bordered quote + mono citation), single_question / scenario (prompt + options with ✓ on correct), reflection (prompt + visibility chip), assignment (title + body), video_script (title + mono script), image (placeholder), quiz ("{N} questions · passing {x} · {n} attempts"), flashcard_set ("{N} cards · self-rated review").
- **Edit mode** (pencil): inline title/concept inputs where relevant + a textarea for the primary field (+ a "Common misconception…" field for concept cards) + a **✓ Save** button (toast "Block saved").
- **Ask-AI mode** (sparkles): quick instruction chips — **Make it simpler · Tighten · More vivid · Match reading level** — plus a free-text "Tell the AI how to change this block…" input. AI replies appear in a chat thread with an **✓ Apply this** button per suggestion (toast "Applied AI edit").

**Add controls** (below blocks, for authored lessons):
- **＋ Add block ▾** — dropdown of block types: **rich text · concept card · source excerpt · question · reflection · summary · image · quiz · flashcards · scenario · assignment · video script** (toast "{type} block added").
- **✦ Generate a block with AI** (amber) — adds an AI-drafted block (toast "AI generated a new block from the source").
- **▤ Use object from library** — opens the Library Picker.

**Reused-object lessons** render differently: an amber panel showing the object icon, type chip, scope chip, "Reused from the Object Library — this stays linked to the original object; edits happen in the library, not here.", the source line, a "What's inside" chip list (blueprint), and a **🗑 Remove from course** button.

### Quiz Builder modal (opens over the editor)
Title **Quiz & Question Bank Builder** + the block title. Three columns:
- **Question bank** (left): list of questions (type chip + difficulty **L#** chip + prompt preview); **＋ Add** to append a new multiple-choice question.
- **Question editor** (center): **Type** dropdown — *multiple_choice, multiple_select, true_false, short_answer, fill_blank, matching, ordering, ranking, scenario, ai_critique, essay*; **Prompt** textarea; **Options** each with a "mark correct" radio, editable text, a **✓ correct** chip, and a per-option **feedback** field.
- **Quiz settings** (right): **Type** (practice · checkpoint · graded · final), **Attempts**, **Passing**, feedback timing / hints (per block settings).
- Footer: **Cancel** / **✓ Done — save to lesson** (toast "Quiz saved to lesson").

### Flashcard Builder modal
Title **Flashcard Builder** + block title. A grid of card editors, each with **Front**, **Back** (textarea), **Hint**, and a delete. A dashed **＋ Add card** tile. A **Review mode** selector: **simple · self rating · spaced repetition**. Footer: **Cancel** / **✓ Done — save to lesson** (toast "Flashcards saved to lesson").

### Library Picker modal
Title **Use an object from the Object Library**, sub "Insert a reviewed, reusable object into '{module}'. It stays linked to the original — no copy is made." A search box; rows of reusable objects (icon, title, type chip, scope chip, status chip, "reused in {N}") each with **＋ Add**. Empty state: "No reusable objects in this program yet. Objects become reusable here once they're published or approved." Footer: **Done**.

---

## STEP 6 — Review
**Kicker:** New course · step 6
**Title:** Review the course
**Subtitle:** A last look before it goes for approval. Expand any lesson to see its blocks; jump back to the editor to change anything.

- **Four stat cards:** **Modules · Lessons · Blocks · Flashcards** (live totals).
- **Course design card** (compass) + subtitle, with chips: audience, approach, progression, pacing, and (when enabled) **objectives / diagnostic / capstone / certificate · {completion criteria}**.
- **Module list:** each module card (with its source ref) lists every lesson/checkpoint row and, on the right, chips for the distinct block types in that lesson.
- **Green banner:** "Content review complete on your side. Next, set learner interactions, then submit for administrator approval."

---

## STEP 7 — Learner interactions
**Kicker:** New course · step 7
**Title:** Learner interactions
**Subtitle:** Enable or disable what students can do in this course. Off means hidden entirely in the student view — not greyed out.

Two cards of toggles:

**AI & study tools:**
- **Ask-AI study panel** (default ON) — hint "explain · example · simplify · why wrong".
- **AI 'quiz me'** (default ON).
- **Learner-made flashcards** (default OFF).
- **Private notes** (default ON).

**Navigation & feedback:**
- **Require completion in order** (default ON; auto-set from the Step 2 progression choice).
- **Allow skipping optional items** (default OFF).
- **Show question hints** (default ON).
- **Feedback timing** dropdown: **Immediately after each answer · After the attempt · After completion · Never show answers** (default *After the attempt*).

---

## STEP 8 — Publish (submit for administrator approval)
**Kicker:** New course · step 8
**Title:** Publish upon administrator review
**Subtitle:** Teachers submit; the organization administrator gives final approval before anything reaches students.

**Card:**
- **Publication type** — radio options:
  - **Course** — "Full structured course with modules, lessons, and checkpoints." (default)
  - **Learning package** — "A small assignable bundle."
  - **Standalone objects** — "Publish objects individually."
- **Note to the administrator** — textarea (prefilled "Initial release, content reviewed.").
- Primary button: **➤ Submit for administrator approval**.
- Fine print: "You can't publish directly — the administrator makes the final call. This keeps a human quality gate before students see anything."

**After submit (confirmation state):**
- Amber clipboard icon.
- Heading: **Submitted for administrator approval**.
- Text: "'{course title}' has gone to the organization administrator. It publishes to learners only once they approve it."
- Chips: **in review** status + the program chip.
- Footer note: "Track it under **Versions & Publishing** or **Review Queue**. Use 'Finish' below to return to the Object Library."
- Bottom bar now shows **✓ Finish** (returns to the library). Toast on submit: "Submitted for administrator approval".

---

## Notes for whoever rebuilds this (why Figma missed things)
- Steps **2, 4, 5, 7** each carry a **sticky side panel** (preview / preferences / lesson tree) — easy to miss; they're integral.
- The **hierarchy is fully renameable and level-toggleable** (Part/Module/Lesson/Checkpoint are defaults, not fixed).
- Step 5 is not a static list — every block has **read / Edit / Ask-AI** modes, reorder/delete, and **quiz & flashcard blocks open dedicated builder modals**; plus **Add block**, **Generate with AI**, and **Use object from library** (reused objects render as linked panels, not editable blocks).
- Generation is driven by **"what to generate" pills per item**, not block-type picking.
- Publishing is a **submit-for-approval** gate (no direct publish); there's a distinct **submitted** confirmation state.