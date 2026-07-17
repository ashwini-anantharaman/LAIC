# Learning Objects — Full Creation Feature Spec (every object type)

What happens when you click **each learning-object tile** in **Create**. The **Course**
tile opens the Course Wizard (documented separately in `course-wizard-feature-spec.md`).
**All ten other types** open the same **Object Creator** pipeline — the only thing that
changes per type is the **Define** step's configurator (`CONFIG_SCHEMA`) and what gets
generated. Everything below is captured from source; nothing omitted.

## The ten object-type tiles (Create grid)
Each tile = icon + name + one-line description; clicking it starts the Object Creator for that type.
1. **Lesson** — "Multi-part teaching unit: intro, explanations, example, checks, reflection, recap."
2. **Tutorial** — "Longer, multi-section walkthrough — can run several pages."
3. **Quiz** — "Question set with feedback and a pass mark."
4. **Flashcard set** — "Front/back recall cards."
5. **Concept card** — "One concept explained several ways."
6. **Summary** — "Concise recap of a section."
7. **Reflection** — "Open prompts for the learner."
8. **Scenario** — "Decision-point activity with branches."
9. **Assignment** — "A written task with a rubric."
10. **Drill** — "Repeated practice set."
(*Video script* and other utilities live under Tools, not here — they produce aids, not learner objects.)

---

## The shared Object Creator pipeline
Header: back link **← Back to Create**; a **New {type}** chip; caption "every object starts from its sources".

**Step rail** (4 steps, pill row; earlier steps clickable once passed):
**1 Sources → 2 Mark up → 3 Extract → 4 Define.** Each step shows an icon, title, and one-line sub:
- Sources — "Pick what this object draws on"
- Mark up — "Comment on what matters"  *(skippable)*
- Extract — "Pull the content into shape"  *(skippable)*
- Define — "Objective, audience, approach"

**Bottom action bar:** **← Back / Cancel**; center caption "Step {n} of 4 · {optional — you can skip on steps 2 & 3}"; a **Skip** button on Mark up & Extract; primary **Next →**, which on the Define step becomes **✦ Generate {noun}**.

### STEP 1 — Sources
- **Source pool** dropdown — choose a pool/folder from this program (shows kind + item count). If none: "No pools in {program} yet — create one in Sources first. You can still continue and add sources later."
- **Source rows** (multi-select; check box): each shows title, a **{kind}** chip, a **role** chip (**Primary** "Drives the object" / **Supporting** "Backs it up" / **Reference** "Might use"), page count, and an optional note. Non-reference sources are pre-selected.
- **References** — "extra links you might pull from later": a URL input + **＋ Add**; added links list with delete.

### STEP 2 — Mark up  *(optional)*
Amber intro: "Read the source and **highlight what matters** — mark passages to use, support, ignore, or note, and add margin comments… **search to highlight every match at once** or let **AI suggest highlights**… Your highlights become the **commented-sources** artifact. Optional — you can skip."
- **Source tabs** — one per selected source, each with a live highlight count.
- **Highlight-as** tag selector (choose before clicking text):
  - **Use** (amber), **Support** (sky), **Ignore** (rose, struck-through), **Note** (violet).
  - Caption: "Click a sentence to highlight · click again to clear."
- **Find in document…** field + **Highlight all** (highlights every matching sentence in the current tag color).
- **AI suggest** box: "What should AI look for? (optional)" + **✦ Suggest** — proposes highlights (shown dashed). A banner then reads "AI suggested N highlights here (dashed) — review, then **Accept all** or **Dismiss**."
- **Document reader** (serif, scrollable, header shows source title + kind + "p. 1"): every sentence is click-to-highlight; matches glow sky; AI suggestions show amber dashed ring.
- **Highlights & comments** side panel: each mark shows its tag chip (or "AI suggestion" + **✓ Accept**), the quoted sentence, a **comment** field, and a remove (✕).

### STEP 3 — Extract  *(optional)*
Explainer: "**Extraction distills your marked-up sources into the exact content units this object is built from.** … you turn what you highlighted into a short list of discrete, editable pieces (a definition, a key point, an example…). Nothing is guessed from the raw pile; it comes from your markup."
Three ways to create content units:
- **"N highlights carried from Mark up"** card → **→ Pull into content units** (deterministic; converts your Use/Support marks 1:1).
- **Shape with AI** box: instruction input ("e.g. one definition + one example, short") + **Extract**.
- **Write one yourself** → **＋ Add manually**.
- **Extracted content units** list — each unit card has: an index, a **kind** dropdown (**Definition · Key point · Example · Quote · Fact · Procedure**), a "from which source…" field, a **✎ from highlight** badge if pulled from markup, a delete, and the passage textarea. Footer: "These N units become the raw material the {type} is generated from."
- Empty state: "No content units yet. **Pull from your highlights** above (the usual path), shape some with AI, or add one by hand."

### STEP 4 — Define  (the per-type configurator)
Top (all types):
- **Title** — input (placeholder "e.g. {Type} on synaptic plasticity").
- **Visibility when created** — dropdown of scopes: **Private** (Only me) · **Team** (My team) · **Program** (Everyone in this program) · **Organization** (All programs in the org).
Then the **type-specific groups** (below).
Bottom: **What will be generated** — a live blueprint chip list built from your composition choices, e.g. "N parts · drawing on X extract(s) + Y source(s). Everything editable after generating."

**Field control types used below:**
*area* = textarea · *text* = single-line · *pick* = single-select pills · *multi* = multi-select pills · *sel* = dropdown · *bool* = On/Off toggle · *num* = −/+ stepper.

---

## Per-type Define configurators (every field, option, and default)

### Lesson
- **Intent** — note "What are you actually trying to teach?"
  - Learning objective *(area)* — "After this lesson, the learner can…"
  - Concept(s) to focus on *(text)*
  - Audience *(pick)*: Middle school · High school*(default)* · College · Adult · Mixed
  - Level *(pick)*: Intro · Basic*(default)* · Intermediate · Advanced
  - Voice *(pick)*: Plain & friendly*(default)* · Neutral / academic · Encouraging · Socratic
- **Teaching approach**
  - How it should teach *(pick)*: Explain → check*(default)* · Story / case-based · Inquiry (question-first) · Worked example
  - Open with *(pick)*: Surprising fact*(default)* · Real-world question · Short story · Direct framing
  - Depth *(pick)*: Quick (~5 min) · Standard (~10)*(default)* · Deep (~20)
  - Address a common misconception *(bool, default On)*
- **What to include** *(these drive the blueprint)*
  - Explanation sections *(num 1–5, default 2)*
  - Worked examples *(num 0–3, default 1)*
  - Source excerpts *(num 0–3, default 1)*
  - Knowledge checks *(num 0–5, default 2)*
  - Reflection prompts *(num 0–2, default 1)*
  - End with a summary *(bool, default On)*

### Tutorial
- **Intent**
  - Learning objective *(area)* — "what the learner can do after the whole tutorial"
  - Overall topic *(text)*
  - Audience *(pick, default High school)*
  - Level *(pick, default Basic)*
- **Structure**
  - Sections / sub-lessons *(num 2–8, default 3)*
  - Progression *(pick)*: Linear build-up*(default)* · Prerequisite chain · Themed clusters
  - Depth per section *(pick)*: Overview · Standard*(default)* · In-depth
  - End with *(pick)*: End quiz · End assignment · Recap only*(default)* · None
- **Per section**
  - Checks per section *(num 0–3, default 1)*
  - Source excerpts (total) *(num 0–3, default 1)*
  - Include a worked example *(bool, default On)*

### Quiz
- **Intent** — note "What should this quiz verify, and for whom?"
  - What it should verify *(area)*
  - Purpose *(pick)*: Formative check*(default)* · Readiness gate · Diagnostic
  - Concepts to assess *(text)*
  - Level *(pick, default Basic)*
- **Question design**
  - Question types *(multi)*: Multiple choice*(default)* · True/false*(default)* · Multi-select · Short answer · Scenario
  - Cognitive levels *(multi)*: Recall*(default)* · Understand*(default)* · Apply · Analyze
  - Difficulty mix *(pick)*: Mostly easy · Balanced*(default)* · Mostly hard · Ramped easy→hard
  - Wrong answers *(pick)*: Plausible common errors*(default)* · Straightforward
- **Scoring & feedback**
  - Number of questions *(num 3–20, default 8)*
  - Pass mark *(sel)*: 50% · 60% · 70%*(default)* · 80% · 90%
  - Show explanations *(sel)*: Immediately · After attempt*(default)* · After completion · Never
  - Write per-question explanations *(bool, default On)*

### Flashcard set
- **Intent**
  - What to memorise *(text)*
  - Audience *(pick, default High school)*
  - Level *(pick, default Basic)*
- **Card design**
  - Card content *(pick)*: Key terms → definitions*(default)* · Concept → example · Question → answer · Image → label
  - Pull cards from *(pick)*: Glossary / key terms in source*(default)* · Concepts I focus on · Mixed
  - Review direction *(pick)*: Front→back*(default)* · Back→front · Both
  - Add memory hooks *(bool, default Off)*
- **Set**
  - Number of cards *(num 5–30, default 12)*

### Concept card
- **Intent**
  - The concept *(text)*
  - Audience *(pick, default High school)*
  - Level *(pick, default Basic)*
  - Voice *(pick, default Plain & friendly)*
- **How to represent it** — note "A concept lands when learners see it more than one way."
  - Include *(multi)*: Formal definition · Everyday analogy*(default)* · Worked example · Visual suggestion · Common misconception*(default)*
  - Analogy should relate to… *(text)* — "optional — e.g. sports, cooking, everyday life"
  - Length per view *(pick)*: Tight · Standard*(default)* · Expanded

### Summary
- **Intent**
  - What to summarise *(text)*
  - Audience *(pick, default High school)*
- **Format**
  - Shape *(pick)*: TL;DR paragraph · Key points*(default)* · Exam-cram sheet · Abstract
  - Length *(pick)*: Short · Medium*(default)* · Long
  - Number of key points *(num 3–10, default 5)*

### Reflection
- **Intent**
  - Reflection goal *(pick)*: Connect to experience · Self-assess understanding · Apply to real life*(default)* · Plan next steps
  - Audience *(pick, default High school)*
  - Voice *(pick, default Encouraging)*
- **Prompt design**
  - Style *(pick)*: Open-ended*(default)* · Guided with sentence starters · Before / after structured
  - Who sees answers *(pick)*: Private to learner*(default)* · Instructor-visible
  - Number of prompts *(num 1–5, default 2)*
  - Include sentence starters *(bool, default Off)*

### Scenario
- **Intent**
  - What it exercises *(area)* — "the skill, bias, or concept the learner practises"
  - Skill / concept *(text)* — "e.g. spotting confirmation bias"
  - Level *(pick, default Intermediate)*
- **The situation**
  - Setting / situation *(area)* — "sketch the scenario the learner steps into"
  - Structure *(pick)*: Linear · Branching decisions*(default)*
  - Framing *(pick)*: Realistic case*(default)* · Roleplay · Abstract
  - Debrief *(pick)*: Model reasoning · Feedback per choice · Both*(default)*
  - Decision points *(num 1–6, default 3)*

### Assignment
- **Intent**
  - Learning objective *(area)* — "what the learner demonstrates by doing this"
  - Audience *(pick, default High school)*
  - Level *(pick, default Intermediate)*
- **The task**
  - Task type *(pick)*: Short essay*(default)* · Analysis · Problem set · Project · Critique
  - Deliverable *(pick)*: Written text*(default)* · File upload · Structured form
  - Expected length *(sel)*: ~150 words · ~300 words*(default)* · ~500 words · ~800 words
  - Require source citations *(bool, default On)*
- **Requirements & rubric**
  - Requirements *(num 2–6, default 3)*
  - Rubric criteria *(num 2–6, default 3)*

### Drill
- **Intent**
  - Skill to drill *(text)* — "the one narrow skill this reinforces"
  - Level *(pick, default Basic)*
- **Practice design**
  - Item format *(pick)*: Recognition · Recall*(default)* · Application
  - Difficulty *(pick)*: Flat · Easy → hard*(default)*
  - Feedback *(pick)*: Immediate*(default)* · End only
  - Timed *(bool, default Off)*
  - Repeat until mastery *(bool, default Off)*
  - Number of items *(num 5–30, default 15)*

---

## After "Generate" — the Object Editor
Pressing **✦ Generate {noun}** opens the generated draft in the Object Editor:
- Back link **← Back to Create**; chips **{Type}**, **✦ generated draft**, and the scope chip.
- **Editable title** (large).
- **Brief card** — "what this was generated to do": an editable **objective** textarea, a **Focus:** line, brief chips (audience, level, voice, approach/purpose/goal/format, depth), the pool chip, and a **provenance line**: "Built from N sources · M marked up · K extracts · R references".
- Caption: "N parts generated to match that brief. Edit any field by hand, use the per-part **AI** menu, or **Edit with AI** to change everything at once."
- **Generated part cards** — one per part; each supports inline field editing, a per-part **AI** menu, **regenerate**, and **delete**.
- **Bottom bar:** **✦ Edit with AI** (opens a whole-object AI editor), caption "N parts · edits autosave to this draft", **✎ Save draft** (creates the object with status *draft*), and **➤ Submit for review** (creates it with status *in review*).

So, unlike a course (which ends at *administrator approval*), a standalone object ends at either **Save draft** or **Submit for review** — objects don't require administrator approval to publish; they become reusable once approved/published by a reviewer.

---

## Shared reference values
- **Audiences:** Middle school · High school · College · Adult · Mixed
- **Levels:** Intro · Basic · Intermediate · Advanced
- **Voices:** Plain & friendly · Neutral / academic · Encouraging · Socratic
- **Scopes:** Private (Only me) · Team (My team) · Program (Everyone in this program) · Organization (All programs in the org)
- **Mark-up tags:** Use · Support · Ignore · Note
- **Source roles:** Primary · Supporting · Reference
- **Extract kinds:** Definition · Key point · Example · Quote · Fact · Procedure

## Traps a design tool tends to miss here
- All ten non-course tiles share ONE pipeline; only **Step 4 (Define)** differs per type — that's ten distinct configurators, each with its own groups/fields/defaults (above).
- **Mark up** and **Extract** are optional/skippable but are full screens (sentence-level highlighting with four tag colors, search-highlight-all, AI suggestions with accept/dismiss, per-mark comments; then extraction into typed content units).
- The **Define** step's controls are mixed types (pills, multi-pills, dropdowns, toggles, steppers) — not a flat form.
- Generation opens a **separate editable draft screen** (Object Editor) with per-part AI/regenerate and a whole-object "Edit with AI"; the two exits are **Save draft** and **Submit for review** (no administrator-approval gate, unlike courses).