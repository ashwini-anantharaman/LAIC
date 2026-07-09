# LAIC Learning Platform Implementation Plan v2

**Scope:** Learning Platform Workstream  
**Focus of this revision:** Learning objects, Learning Studio implementation, and student-facing learning runtime/interactions  
**Prepared for:** MindBrainAI Nexus / Life in AI Center implementation workstreams  
**Primary near-term uses:** Brain Bee course app, MindAI Bee course/challenge learning app, Bridge learning-content support

---

## 1. Purpose

This document defines the implementation plan for the **LAIC Learning Platform** with emphasis on three practical questions:

1. **What are the learning objects?**  
   Courses, modules, lessons, tutorials, sections, blocks, quizzes, flashcards, assignments, activities, scenarios, drills, assessments, and reusable educational assets.

2. **How does the Learning Studio create and manage them?**  
   A human course developer, instructor, or coach uses the Studio to import source material, select useful source units, ask AI for drafts, edit/review the output, assemble structured learning objects, preview the learner experience, and publish versioned course packages.

3. **How does the student experience them?**  
   A learner enters a program-specific app shell, opens a course or learning path, studies structured content, answers questions, uses constrained AI help when enabled, completes activities, submits reflections or assignments, reviews flashcards, and accumulates domain-isolated progress.

This version intentionally does **not** expand into full coaching architecture. Real-time coaching, postmortem coaching, bridge gameplay evaluation, and deep adaptive coach reasoning belong to the **Coaching Platform** and **Bridge Platform** workstreams. The Learning Platform provides learning content, course delivery, basic tutoring interactions, and progress signals.

---

## 2. Controlling Design Corrections

### 2.1 MindAI Bee Scope

MindAI Bee should be treated as an **InsightX-like learning + quiz/challenge system**. It is not MindStory, StageX, or VibeApp. The Learning Platform should support MindAI Bee through:

- concept-based study materials,
- tutorials,
- practice questions,
- scenario questions,
- reflection prompts,
- AI tutor support,
- challenge-readiness checks,
- question banks,
- and progress tracking.

### 2.2 Course Developer Is Central

The Learning Platform is not a fully automated “upload PDF and magically create perfect course” system.

The implementation model is:

```text
Source Material
  + Human Course Developer
  + AI Authoring Assistance
  + Review / Versioning
  = Published Learning Objects
```

AI helps with extraction, summarization, quiz generation, examples, flashcards, concept cards, and reflection prompts. The human course developer decides what is included, how it is sequenced, what is mandatory, and what is published.

### 2.3 Same Structural Model, Domain-Isolated Progress

The platform should use a common implementation pattern for learner progress, but the meaning of progress is domain-specific.

```text
Common learner identity
  -> Brain Bee progress space
  -> MindAI Bee progress space
  -> Bridge progress space
  -> future program progress spaces
```

A learner’s Bridge skill progress must not appear in a Brain Bee dashboard. A learner’s Brain Bee course consumption must not appear in Bridge skill dashboards. Cross-domain aggregation should be opt-in, admin-level, and designed later.

---

## 3. Scope Boundary

### 3.1 Learning Platform Owns

The Learning Platform owns:

- source document import for learning content,
- Learning Studio authoring workflows,
- learning object library,
- course/module/lesson/block modeling,
- tutorials and learning paths,
- quizzes and question banks,
- flashcards,
- assignments,
- reflection prompts,
- learning activities,
- student-facing course player,
- basic AI tutor/study interactions inside learning content,
- course progress tracking,
- content review/versioning/publishing,
- app shell integration for learning content,
- a knowledge retrieval endpoint (`/retrieve`) that serves approved, source-bound `KnowledgeChunk`s to the Coaching Platform (see §7.5),
- and integration contracts for domain activities such as Bridge practice.

### 3.2 Learning Platform Does Not Own

The Learning Platform does not own:

- Nexus-level organization onboarding, app access, invitations, phone/email registration, or memberships,
- full MindAI Bee chapter/regional/national competition administration,
- official Brain Bee administration,
- Bridge table runtime, deals, bidding/play engine, AI player, BEN integration, or event-sourced gameplay,
- deep real-time coaching, live hints, adaptive coach runtime, or postmortem coaching,
- a marketplace, social community, or advanced class network in the first implementation.

### 3.3 Boundary Summary

```text
Nexus Platform
  Owns: organizations, programs, app shells, access, registration, membership, roles

Learning Platform
  Owns: source-to-learning-object authoring, publishing, course runtime, learning progress,
        and a /retrieve knowledge endpoint the coach queries for grounding (§7.5)

Bridge Platform
  Owns: bridge runtime, boards, tables, player profiles, convention configuration, BEN player

Coaching Platform
  Owns: deep coach runtime, learner context package, intervention policy, postmortem coach
```

---

## 4. Learning Object Philosophy

Learning objects should be:

### 4.1 Purpose-Specific

Each learning object should have a clear educational purpose.

| Object | Primary Purpose |
|---|---|
| Lesson | Teach one concept or small cluster of concepts |
| Tutorial | Teach a cohesive topic through multiple lessons/blocks |
| Drill | Reinforce a narrow skill through repetition |
| Practice Activity | Apply knowledge in a controlled task |
| Quiz | Check understanding or readiness |
| Assessment | Measure competency more formally |
| Flashcard | Support recall and quick review |
| Assignment | Capture extended reasoning, written work, or submission |
| Reflection | Encourage metacognition and personal application |
| Postmortem Template | Structure reflection after a completed domain activity |
| Learning Path | Sequence objects toward a learning goal |

### 4.2 Reusable

A learning object should be reusable across:

- courses,
- apps,
- programs,
- age levels,
- organizations,
- instructors/coaches,
- and future domains.

Example:

```text
Concept: Memory
  -> Brain Bee module
  -> MindAI Bee module on human learning
  -> future AI literacy course
```

Example:

```text
Bridge lesson: Stayman Overview
  -> Beginner Bridge Course
  -> Coach-created 1NT Tutorial
  -> Bridge flashcard deck
  -> Bridge practice path
```

### 4.3 Composable

Small objects should combine into larger experiences.

```text
Learning Block
  -> Lesson
  -> Tutorial
  -> Module
  -> Course
  -> Learning Path
  -> App / Program Experience
```

### 4.4 Human-Readable and Machine-Usable

Every published object should be understandable to a human author/reviewer and structured enough for software to render, search, reuse, and track.

### 4.5 Source-Aware

A learning object created from a PDF, chapter, book, article, bridge document, or prior curriculum should preserve source references.

This supports:

- quality review,
- copyright review,
- future correction,
- source-bounded AI tutoring,
- and traceability.

---

## 5. Two Complementary Hierarchies

The uploaded learning-object material uses an educational hierarchy such as:

```text
Bridge Knowledge
  -> Lesson
  -> Tutorial
  -> Module
  -> Learning Path
  -> Coaching Program
```

For implementation, LAIC should support this educational hierarchy while also using a practical runtime hierarchy:

```text
Course
  -> Module
    -> Lesson
      -> Section
        -> Learning Block
```

These are not contradictory. The platform should treat them as two views over the same object library.

### 5.1 Authoring / Repository View

The repository stores reusable objects:

```text
Learning Object Library
  -> Lessons
  -> Tutorials
  -> Quizzes
  -> Questions
  -> Flashcard Sets
  -> Assignments
  -> Activities
  -> Drills
  -> Guided Scenarios
  -> Practice Hands / Domain Activity References
  -> Assessments
  -> Reflection Prompts
  -> Postmortem Templates
```

### 5.2 Course Runtime View

A published course assembles selected objects into a sequence:

```text
Course Package
  -> Module 1
    -> Lesson 1
      -> Blocks
    -> Lesson 2
      -> Blocks
  -> Module 2
    -> Tutorial Reference
    -> Quiz
    -> Assignment
```

### 5.3 Why Both Are Needed

- The repository enables reuse, search, editing, review, and versioning.
- The course runtime gives students a clean ordered experience.
- A tutorial can be reused in multiple courses.
- A quiz can be reused as practice in one course and as a checkpoint in another.
- A bridge drill description can live in the Learning Platform while the actual bridge board runtime lives in the Bridge Platform.

---

## 6. Core Object Vocabulary

### 6.1 Learning Artifact

A **learning artifact** is any durable educational object created, imported, generated, reviewed, or published by the platform.

Examples:

- source excerpt,
- explanation block,
- concept card,
- lesson,
- tutorial,
- quiz,
- flashcard deck,
- assignment,
- scenario,
- reflection prompt,
- image annotation,
- bridge practice hand descriptor,
- postmortem template.

### 6.2 Learning Object

A **learning object** is a structured learning artifact that can be inserted into a learner-facing experience.

All learning objects should share this base structure:

```ts
type LearningObjectBase = {
  id: string;
  organizationId: string;
  programId?: string;
  domainId: string;
  objectType: LearningObjectType;
  title: string;
  description?: string;
  status: "draft" | "in_review" | "approved" | "published" | "archived";
  visibility: "private" | "organization" | "program" | "public";
  version: string;
  authorUserId: string;
  reviewerUserIds?: string[];
  sourceReferences?: SourceReference[];
  conceptIds?: string[];
  skillIds?: string[];
  estimatedMinutes?: number;
  difficulty?: "intro" | "basic" | "intermediate" | "advanced";
  createdAt: string;
  updatedAt: string;
};
```

```ts
type LearningObjectType =
  | "course"
  | "module"
  | "lesson"
  | "tutorial"
  | "section"
  | "block"
  | "quiz"
  | "question"
  | "flashcard_set"
  | "assignment"
  | "activity"
  | "guided_scenario"
  | "drill"
  | "practice_hand_reference"
  | "assessment"
  | "reflection_prompt"
  | "postmortem_template";
```

---

## 7. Source Objects and Ingestion for Learning Content

### 7.1 Source Document

```ts
type SourceDocument = {
  id: string;
  organizationId: string;
  programId?: string;
  domainId?: string;
  title: string;
  sourceType:
    | "pdf"
    | "docx"
    | "markdown"
    | "text"
    | "slides"
    | "image"
    | "video"
    | "audio"
    | "web_capture";
  origin: "uploaded" | "manual" | "imported" | "linked";
  author?: string;
  publisher?: string;
  copyrightStatus:
    | "owned"
    | "licensed"
    | "permission_granted"
    | "public_domain"
    | "internal_study_only"
    | "needs_review"
    | "unknown";
  storageUri: string;
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
};
```

### 7.2 Parsed Source Unit

```ts
type ParsedSourceUnit = {
  id: string;
  sourceDocumentId: string;
  unitType:
    | "chapter"
    | "section"
    | "heading"
    | "paragraph"
    | "table"
    | "image"
    | "caption"
    | "list"
    | "equation"
    | "example"
    | "callout"
    | "question"
    | "glossary_term";
  parentUnitId?: string;
  orderIndex: number;
  rawText?: string;
  normalizedText?: string;
  imageUri?: string;
  pageStart?: number;
  pageEnd?: number;
  sourceLocator?: string;
};
```

### 7.3 Source Reference

```ts
type SourceReference = {
  sourceDocumentId: string;
  sourceUnitId?: string;
  pageStart?: number;
  pageEnd?: number;
  quoteText?: string;
  useType: "quoted" | "summarized" | "adapted" | "inspired_by";
  reviewerNote?: string;
};
```

### 7.4 Studio Source Workflow

```text
Upload source
  -> parse into source units
  -> show original/source-view beside parsed units
  -> course developer selects useful units
  -> choose authoring action
       use as excerpt
       summarize
       rewrite at grade level
       create concept card
       generate quiz questions
       generate flashcards
       generate reflection prompt
       create assignment
       create scenario activity
  -> AI drafts output if requested
  -> course developer edits
  -> reviewer approves if needed
  -> object enters Learning Object Library
```

### 7.5 Knowledge Retrieval Endpoint (`/retrieve`) for the Coach

The Learning Platform is the system of record for course knowledge, so it — not
the coach — owns turning published learning objects and their approved source
units into queryable knowledge and serving them. It exposes a single retrieval
endpoint the **Coaching Platform** calls whenever it needs grounding material
for an answer, hint, or explanation:

```text
POST /api/retrieve
```

**Why the coach does not own this.** The coach is a single, reusable engine that
must work across multiple platforms, knowledge bases, and activities — Brain
Bee, MindAI Bee, Bridge, and future domains. If it embedded its own retrieval or
bound itself to one platform's knowledge store, it would have to be re-built for
each platform and each new body of knowledge. Instead the coach depends only on
one `retrieve()` contract and stays ignorant of *how* or *where* knowledge is
produced; every platform (or embedded domain) implements that one contract over
its own store. The Learning Platform's implementation is this endpoint; an
embedded app such as Bridge may satisfy the identical contract from a bundled,
offline package. **One contract, many producers** — this is what keeps the coach
reusable rather than platform-specific.

**Request contract** (`RetrievalRequest`). Carries the scope guardrail so the
platform never returns out-of-scope content:

```ts
type RetrievalRequest = {
  domainId: string;                    // e.g. "brain_bee", "mindai_bee", "bridge"
  knowledgeScopeId?: string;           // the coach instance's approved scope
  text?: string;                       // semantic query
  conceptIds?: string[];               // tag query
  skillIds?: string[];
  chunkType?: string;                  // progressive disclosure by hint level
  allowedLearningObjectIds?: string[]; // restrict to these published objects
  allowedSourceIds?: string[];         // restrict to these source documents
  forbiddenConceptIds?: string[];
  topK?: number;
  scope?: "current" | "all" | string[]; // course scope; "all" (cross-course) off by default
};
```

**Response contract** (`KnowledgeChunk[]`). Each chunk is source-bound and
citable, reusing the platform's existing `SourceReference` (§7.3) so answers can
show the learner where the material came from:

```ts
type KnowledgeChunk = {
  id: string;
  schemaVersion: string;               // versioned; adapters reject unknown majors
  content: string;
  conceptIds: string[];
  skillIds: string[];
  chunkType: "rule" | "example" | "explanation"
           | "misconception" | "hint_template" | "drill_prompt";
  difficulty?: "beginner" | "intermediate" | "advanced";
  scopeId?: string;
  citation?: SourceReference;          // §7.3 — source binding + page/quote for the learner
  score?: number;
};
```

**Pipeline the platform owns:** published learning object / approved source unit
→ chunk → tag (`conceptIds`/`skillIds`/`chunkType`, with a safe `explanation`
default when auto-tagging is uncertain) → embed → store → serve via `/retrieve`.
The coach only calls `retrieve()`. If a dedicated RAG/retrieval service is
introduced later, the Learning Platform proxies to it transparently — the coach
contract does not change.

**Scope and isolation:** `/retrieve` must honor `domainId` and
`knowledgeScopeId` and never return content outside the requesting coach
instance's approved scope. Cross-course retrieval (`scope: "all"`) is off by
default and gated by the same admin policy as domain-isolated progress (§16.4).

---

## 8. Course, Module, Lesson, and Section Models

### 8.1 Course

A course is the largest student-facing learning package managed by the Learning Platform.

```ts
type Course = LearningObjectBase & {
  objectType: "course";
  slug: string;
  audienceLevel?: "middle_school" | "high_school" | "college" | "adult" | "mixed";
  appIds?: string[];
  currentVersionId?: string;
  defaultCompletionPolicy: "all_required_lessons" | "all_modules" | "manual";
};
```

Examples:

- Brain Bee Memory Course
- Brain Bee Chapter 4 Study Course
- MindAI Bee Cognitive Biases Course
- MindAI Bee Challenge Preparation Course
- Bridge Opening Bids Course

### 8.2 Module

A module groups related lessons/tutorials/activities.

```ts
type Module = LearningObjectBase & {
  objectType: "module";
  parentCourseVersionId?: string;
  orderIndex?: number;
  learningObjectives?: string[];
  prerequisiteObjectIds?: string[];
};
```

Examples:

- Brain Bee: Memory
- MindAI Bee: Cognitive Biases
- Bridge: Opening Bidding

### 8.3 Lesson

A lesson teaches one concept or small cluster of concepts.

```ts
type Lesson = LearningObjectBase & {
  objectType: "lesson";
  learningObjectives: string[];
  prerequisites?: string[];
  completionPolicy: "viewed" | "all_required_blocks" | "quiz_passed" | "manual";
  sections: LessonSection[];
};
```

### 8.4 Lesson Section

A section is a structural grouping inside a lesson.

```ts
type LessonSection = {
  id: string;
  lessonId: string;
  title?: string;
  orderIndex: number;
  blocks: LearningBlock[];
};
```

Example lesson structure:

```text
Lesson: Confirmation Bias
  Section: Hook
  Section: Intuition
  Section: Everyday Example
  Section: AI Example
  Section: Quick Check
  Section: Reflection
```

---

## 9. Learning Block Model

Learning blocks are the smallest rendered units in the student view.

```ts
type LearningBlock = LearningObjectBase & {
  objectType: "block";
  sectionId?: string;
  blockType: LearningBlockType;
  orderIndex: number;
  required: boolean;
  config: Record<string, unknown>;
  sourceReferences?: SourceReference[];
};
```

```ts
type LearningBlockType =
  | "rich_text"
  | "source_excerpt"
  | "summary"
  | "image"
  | "diagram"
  | "video"
  | "audio"
  | "concept_card"
  | "example"
  | "flashcard_set"
  | "quiz"
  | "single_question"
  | "assignment"
  | "reflection_prompt"
  | "scenario_activity"
  | "guided_ai_conversation"
  | "ai_explainer"
  | "domain_activity"
  | "external_embed";
```

### 9.1 Rich Text Block

```ts
type RichTextBlockConfig = {
  markdown: string;
  readingLevel?: "simple" | "standard" | "advanced";
};
```

### 9.2 Source Excerpt Block

```ts
type SourceExcerptBlockConfig = {
  sourceDocumentId: string;
  sourceUnitIds: string[];
  displayMode: "plain" | "quoted" | "annotated";
};
```

### 9.3 Summary Block

```ts
type SummaryBlockConfig = {
  summaryText: string;
  sourceUnitIds: string[];
  summaryStyle: "brief" | "student_friendly" | "detailed";
};
```

### 9.4 Image / Diagram Block

```ts
type ImageBlockConfig = {
  imageUri: string;
  altText?: string;
  caption?: string;
  sourceDocumentId?: string;
  sourcePage?: number;
  displaySize?: "small" | "medium" | "large" | "full_width";
  annotations?: Array<{
    label: string;
    x: number;
    y: number;
    note?: string;
  }>;
};
```

### 9.5 Concept Card Block

```ts
type ConceptCardBlockConfig = {
  conceptId?: string;
  conceptName: string;
  plainLanguageDefinition: string;
  formalDefinition?: string;
  everydayExample?: string;
  domainExample?: string;
  aiExample?: string;
  commonMisconception?: string;
  relatedConceptIds?: string[];
};
```

### 9.6 Example Block

```ts
type ExampleBlockConfig = {
  exampleType: "everyday" | "school" | "ai" | "bridge" | "neuroscience" | "custom";
  situation: string;
  explanation: string;
  relatedConceptIds?: string[];
};
```

### 9.7 Reflection Prompt Block

```ts
type ReflectionPromptBlockConfig = {
  prompt: string;
  responseType: "private_text" | "submitted_text" | "choice_plus_text";
  required: boolean;
  visibility: "learner_only" | "instructor" | "program_reviewer";
};
```

### 9.8 AI Explainer Block

```ts
type AIExplainerBlockConfig = {
  allowedContext: "current_block" | "current_lesson" | "current_module" | "whole_course";
  promptPolicyId: string;
  sourceBounded: boolean;
  allowExamples: boolean;
  allowAnalogies: boolean;
  allowQuizMe: boolean;
  allowFlashcardCreation: boolean;
  maxResponseLength: "short" | "medium" | "long";
};
```

The AI Explainer should retrieve approved course context and sources. It should not freely invent course content.

### 9.9 Domain Activity Block

```ts
type DomainActivityBlockConfig = {
  domainId: string;
  activityType: string;
  domainActivityId: string;
  launchMode: "inline" | "modal" | "external_app";
  completionSignal: "manual" | "domain_event" | "score";
  passContext?: Record<string, unknown>;
};
```

Example:

```text
Bridge lesson explains Stayman
  -> Domain Activity Block launches Bridge bidding practice
  -> Bridge Platform runs the board and events
  -> Learning Platform receives completion/progress signal
```

---

## 10. Tutorial Model

A tutorial teaches a cohesive topic and may contain multiple lessons, blocks, examples, and checks.

```ts
type Tutorial = LearningObjectBase & {
  objectType: "tutorial";
  targetLearnerLevel?: string;
  tutorialPurpose: "introduce" | "demonstrate" | "practice" | "review" | "prepare";
  lessonIds?: string[];
  blockIds?: string[];
  requiredObjectIds?: string[];
  recommendedFollowupObjectIds?: string[];
  completionCriteria: TutorialCompletionCriteria;
};
```

```ts
type TutorialCompletionCriteria = {
  requiredLessonsViewed?: boolean;
  requiredBlocksCompleted?: boolean;
  requiredQuizPassed?: boolean;
  requiredReflectionSubmitted?: boolean;
  minimumScorePercent?: number;
};
```

Recommended tutorial flow:

```text
Overview
  -> Learning Objectives
  -> Prerequisite Review
  -> Interactive Explanation
  -> Worked Examples
  -> Questions
  -> Guided Exercises
  -> Knowledge Check
  -> Summary
  -> Recommendations
```

For MindAI Bee, a tutorial should often follow:

```text
Hook
  -> Concept
  -> Intuition
  -> Example
  -> Exercise
  -> Reflection
```

---

## 11. Quiz, Question Bank, and Assessment Objects

### 11.1 Question Bank

Questions should be reusable across quizzes, practice sessions, and checkpoints.

```ts
type QuestionBank = {
  id: string;
  organizationId: string;
  programId?: string;
  domainId: string;
  title: string;
  description?: string;
  visibility: "private" | "organization" | "program" | "public";
  status: "draft" | "published" | "archived";
};
```

### 11.2 Question

```ts
type Question = LearningObjectBase & {
  objectType: "question";
  questionBankId?: string;
  questionType:
    | "multiple_choice"
    | "multiple_select"
    | "true_false"
    | "short_answer"
    | "fill_blank"
    | "matching"
    | "ordering"
    | "ranking"
    | "scenario"
    | "ai_critique"
    | "essay";
  prompt: string;
  options?: QuestionOption[];
  correctAnswer?: unknown;
  explanation?: string;
  difficultyLevel?: 1 | 2 | 3 | 4;
  scoringPolicy?: "auto" | "rubric" | "manual";
};
```

```ts
type QuestionOption = {
  id: string;
  text: string;
  isCorrect?: boolean;
  feedback?: string;
};
```

### 11.3 MindAI Bee Question Difficulty

MindAI Bee should use a simple four-level model:

```text
Level 1: Recognize
Level 2: Apply
Level 3: Analyze
Level 4: Synthesize
```

### 11.4 Quiz

```ts
type Quiz = LearningObjectBase & {
  objectType: "quiz";
  quizType: "practice" | "checkpoint" | "graded" | "diagnostic" | "final";
  questionSelectionMode: "fixed" | "random_from_bank" | "adaptive_basic";
  questionIds?: string[];
  timeLimitMinutes?: number;
  attemptsAllowed?: number;
  passingScorePercent?: number;
  showCorrectAnswers: "immediately" | "after_attempt" | "after_due_date" | "never";
  allowHints?: boolean;
};
```

### 11.5 Assessment

An assessment is more formal than a quiz. It may draw from multiple question banks and activities.

```ts
type Assessment = LearningObjectBase & {
  objectType: "assessment";
  assessmentType: "placement" | "module_completion" | "promotion" | "diagnostic" | "challenge_readiness";
  scopeObjectIds: string[];
  scoringPolicy: "auto" | "rubric" | "manual" | "hybrid";
  passingCriteria?: Record<string, unknown>;
  outputSignals: string[];
};
```

---

## 12. Flashcards, Assignments, Activities, and Reflections

### 12.1 Flashcard Set

```ts
type FlashcardSet = LearningObjectBase & {
  objectType: "flashcard_set";
  cardIds: string[];
  reviewMode: "simple" | "self_rating" | "spaced_repetition_later";
};
```

```ts
type Flashcard = {
  id: string;
  flashcardSetId: string;
  front: string;
  back: string;
  hint?: string;
  explanation?: string;
  conceptIds?: string[];
  difficulty?: "easy" | "medium" | "hard";
};
```

### 12.2 Assignment

```ts
type Assignment = LearningObjectBase & {
  objectType: "assignment";
  instructions: string;
  submissionType: "text" | "file" | "link" | "mixed";
  rubricId?: string;
  required: boolean;
  duePolicy?: "none" | "relative_to_enrollment" | "fixed_date";
};
```

### 12.3 Learning Activity

```ts
type LearningActivity = LearningObjectBase & {
  objectType: "activity";
  activityType:
    | "reflection"
    | "scenario_analysis"
    | "concept_sort"
    | "matching"
    | "guided_ai_conversation"
    | "domain_activity"
    | "custom";
  instructions: string;
  config: Record<string, unknown>;
  completionPolicy: "viewed" | "submitted" | "score" | "domain_signal";
};
```

### 12.4 Scenario Activity

Scenario activities are especially important for MindAI Bee.

```ts
type ScenarioActivityConfig = {
  scenarioText: string;
  characters?: string[];
  context: string;
  decisionPoint: string;
  possibleResponses?: string[];
  expectedReasoning?: string[];
  reflectionPrompt?: string;
  relatedConceptIds: string[];
};
```

Example:

```text
An AI assistant recommends a health article because many people shared it.
Question: What reasoning problem might be present?
Expected concepts: popularity is not evidence, verification, AI limitation, social influence.
```

---

## 13. Bridge-Specific Learning Objects Without Moving Bridge Runtime Into Learning Platform

Bridge learning content can use the common model, but bridge-specific practice must route to the Bridge Platform.

### 13.1 Bridge Learning Objects in the Learning Platform

The Learning Platform may store:

- bridge lessons,
- tutorials,
- learning paths,
- flashcards,
- quizzes,
- assignments,
- practice instructions,
- drill descriptors,
- postmortem templates,
- annotated PBN references,
- and domain activity launch configurations.

### 13.2 Bridge Runtime Outside Learning Platform

The Bridge Platform owns:

- bridge table,
- deal/board state,
- auction,
- card play,
- AI players,
- BEN player,
- convention configuration,
- game events,
- bridge-specific learner signals.

### 13.3 Bridge Domain Activity Contract

```ts
type BridgeLearningActivityLaunch = {
  launchId: string;
  learnerId: string;
  courseEnrollmentId: string;
  learningObjectId: string;
  bridgeActivityType: "bidding_drill" | "practice_hand" | "opening_lead" | "declarer_plan" | "review_hand";
  bridgeConfigId?: string;
  pbnId?: string;
  targetConceptIds?: string[];
  targetSkillIds?: string[];
  completionReturnUrl?: string;
};
```

```ts
type BridgeLearningActivityResult = {
  launchId: string;
  learnerId: string;
  status: "completed" | "abandoned";
  score?: number;
  summary?: string;
  bridgeSignalIds?: string[];
  completedAt: string;
};
```

The Learning Platform records completion and course progress. The Bridge Platform keeps detailed bridge events and bridge skill updates.

---

## 14. Learning Studio Implementation

The Learning Studio is the authoring and management environment for course developers, instructors, reviewers, bridge coaches, and program owners.

### 14.1 Studio Product Areas

```text
Learning Studio
│
├── Studio Dashboard
├── Source Library
├── Source Viewer / Extraction Workspace
├── Learning Object Library
├── Course Builder
├── Lesson / Block Editor
├── Quiz and Question Bank Builder
├── Flashcard Builder
├── Assignment / Activity Builder
├── AI Authoring Assistant
├── Review Queue
├── Version / Publishing Manager
├── Preview Mode
└── Analytics for Authors
```

### 14.2 Studio Dashboard

Dashboard should show:

- active courses,
- draft courses,
- recently edited objects,
- source documents awaiting processing,
- AI drafts awaiting review,
- review items,
- published versions,
- content quality warnings.

### 14.3 Source Library

Source Library should support:

- upload source,
- classify source,
- store license/copyright metadata,
- view parsing status,
- open source viewer,
- link source to courses or object library,
- archive/deprecate source.

### 14.4 Source Viewer / Extraction Workspace

The Source Viewer is central to the StudyFetch-like workflow.

Recommended layout:

```text
Left panel: original document / page preview
Middle panel: parsed source units
Right panel: authoring actions and draft output
Bottom/side: object insertion target
```

Course developer actions:

- select paragraph/image/table,
- mark as important,
- add source note,
- create excerpt block,
- summarize into a block,
- generate questions,
- generate flashcards,
- generate concept card,
- generate reflection prompt,
- create assignment,
- add to lesson outline,
- send to review.

### 14.5 Learning Object Library

The object library should be searchable by:

- title,
- object type,
- domain,
- program,
- concept,
- skill,
- difficulty,
- source,
- author,
- review status,
- published status,
- reuse count.

The library is the long-term educational repository. It should not be treated as a temporary draft list.

### 14.6 Course Builder

The Course Builder should support:

- create course,
- create course version,
- add modules,
- add lessons/tutorials,
- add sections,
- insert blocks,
- insert existing objects from library,
- reorder items,
- set required/optional flags,
- set completion policies,
- assign quizzes/activities,
- configure AI features,
- preview learner flow,
- publish.

### 14.7 Lesson / Block Editor

The block editor should allow:

- edit text,
- attach source references,
- add image captions and alt text,
- configure concept cards,
- configure AI explainer block,
- create inline quiz question,
- add reflection prompt,
- preview mobile rendering,
- preview desktop rendering.

### 14.8 Quiz and Question Bank Builder

Builder features:

- create question bank,
- add questions manually,
- generate questions from selected source units,
- tag concepts/difficulty,
- write explanations,
- configure correct answers,
- set feedback per option,
- build fixed quiz,
- build random quiz from bank,
- preview quiz as learner,
- approve/publish questions.

### 14.9 AI Authoring Assistant

AI assistant should be available as a side panel, not as the core source of truth.

AI actions:

```text
Selected source units
  -> Summarize
  -> Rewrite for grade level
  -> Create concept card
  -> Generate MCQs
  -> Generate scenario questions
  -> Generate flashcards
  -> Generate reflection questions
  -> Suggest lesson outline
  -> Suggest prerequisite concepts
  -> Identify misconceptions
```

Every AI output should become an editable draft.

```ts
type AIGeneratedDraft = {
  id: string;
  organizationId: string;
  sourceUnitIds: string[];
  targetObjectType: LearningObjectType;
  promptUsed: string;
  modelUsed?: string;
  outputJson: Record<string, unknown>;
  status: "draft" | "accepted" | "edited" | "rejected";
  acceptedObjectId?: string;
  generatedByUserId: string;
  createdAt: string;
};
```

### 14.10 Review Queue

Review queue should support:

- review draft object,
- compare with source references,
- comment,
- approve,
- request changes,
- reject,
- publish only approved objects when policy requires.

### 14.11 Version / Publishing Manager

Publishing creates a versioned runtime package.

```text
Draft objects
  -> reviewed/approved objects
  -> course version
  -> publication package
  -> runtime manifest
```

```ts
type CoursePublicationPackage = {
  id: string;
  courseId: string;
  courseVersionId: string;
  manifestUri?: string;
  contentHash: string;
  status: "building" | "published" | "failed" | "retired";
  publishedAt?: string;
  publishedByUserId?: string;
};
```

### 14.12 Preview Mode

Preview mode is required before publication.

Preview should support:

- student desktop view,
- student mobile view,
- lesson navigation,
- quiz attempt simulation,
- AI feature preview,
- completion rules preview,
- source citation preview where relevant.

---

## 15. Student View / Learning Runtime

The Learning Runtime is the learner-facing experience. It should be simple enough for students but structured enough to support progress tracking and AI assistance.

### 15.1 Runtime Product Areas

```text
Student Learning Runtime
│
├── App Entry / Course Access
├── Course Home
├── Continue Learning
├── Module View
├── Lesson Player
├── Block Renderer
├── Quiz Player
├── Flashcard Review
├── Assignment / Reflection Submission
├── AI Study Panel
├── Activity Launcher
├── Progress Dashboard
└── Recommendations / Next Steps
```

### 15.2 Course Home

Course Home should show:

- course title and description,
- progress percent,
- continue button,
- module list,
- required/optional indicators,
- due dates if applicable,
- recent quiz results,
- next recommended action,
- AI tutor availability if enabled.

### 15.3 Module View

Module View should show:

- module overview,
- learning objectives,
- list of lessons/tutorials/activities,
- completion status,
- estimated time,
- checkpoint quiz if present.

### 15.4 Lesson Player

Lesson Player should use a vertical block sequence optimized for mobile and desktop.

Student actions:

- read block,
- expand examples,
- answer inline question,
- ask AI help if enabled,
- complete reflection,
- launch activity,
- move next/previous,
- mark block/lesson complete.

Recommended layout:

```text
Top: course/module/lesson breadcrumb
Main: block content
Side/bottom: progress + AI help + notes
Footer: previous / next / complete
```

### 15.5 Standard Student Interaction Pattern

Most learning experiences should follow:

```text
Learn
  -> Check
  -> Practice
  -> Reflect
  -> Continue
```

Examples:

Brain Bee:

```text
Read explanation of memory
  -> answer quick question
  -> review diagram
  -> take short quiz
  -> continue module
```

MindAI Bee:

```text
Read scenario about confirmation bias
  -> identify the bias
  -> explain reasoning
  -> critique an AI response
  -> write reflection
```

Bridge:

```text
Read lesson on opening bids
  -> answer concept check
  -> launch bridge bidding activity
  -> receive completion signal
  -> continue tutorial
```

### 15.6 Quiz Player

Quiz Player should support:

- one question per page or all-at-once mode,
- progress through questions,
- autosave responses,
- hints if enabled,
- feedback timing policy,
- attempt submission,
- result summary,
- review explanations if allowed.

### 15.7 Flashcard Review

Flashcard review can start simple.

Student flow:

```text
See front
  -> think
  -> reveal back
  -> mark: knew / unsure / did not know
  -> next card
  -> review summary
```

Later, spaced repetition can be added.

### 15.8 Assignment and Reflection Submission

Assignments and reflections should support:

- text entry,
- autosave draft,
- submit,
- optional reviewer feedback,
- private-to-learner reflections,
- instructor-visible submissions where configured.

### 15.9 AI Study Panel

AI Study Panel should be course-bounded.

Student actions:

- explain this block,
- give me an example,
- simplify this,
- quiz me,
- help me understand why my answer was wrong,
- ask a question about this lesson.

AI should not be the only way to progress. Core course content must be explicit structured objects.

### 15.10 Activity Launcher

For domain activities, such as Bridge practice:

```text
Student clicks Start Activity
  -> Learning Runtime creates launch record
  -> Domain platform opens inline/modal/external
  -> Domain platform returns completion signal
  -> Learning progress updates
  -> Student sees next step
```

---

## 16. Student Interaction Events and Progress

### 16.1 Learning Event

```ts
type LearningEvent = {
  id: string;
  learnerId: string;
  organizationId: string;
  programId?: string;
  appId?: string;
  domainId: string;
  courseId?: string;
  courseVersionId?: string;
  objectType?: LearningObjectType;
  objectId?: string;
  eventType:
    | "course_started"
    | "course_completed"
    | "module_started"
    | "module_completed"
    | "lesson_started"
    | "lesson_completed"
    | "block_viewed"
    | "block_completed"
    | "inline_question_answered"
    | "quiz_started"
    | "quiz_submitted"
    | "flashcard_reviewed"
    | "assignment_submitted"
    | "reflection_submitted"
    | "ai_question_asked"
    | "ai_response_viewed"
    | "domain_activity_launched"
    | "domain_activity_completed";
  eventData?: Record<string, unknown>;
  occurredAt: string;
};
```

### 16.2 Course Progress

```ts
type CourseProgress = {
  id: string;
  courseEnrollmentId: string;
  learnerId: string;
  domainId: string;
  courseId: string;
  courseVersionId: string;
  percentComplete: number;
  completedModuleCount: number;
  completedLessonCount: number;
  quizAveragePercent?: number;
  lastActivityAt?: string;
  completedAt?: string;
};
```

### 16.3 Object Progress

```ts
type LearningObjectProgress = {
  id: string;
  courseEnrollmentId: string;
  learnerId: string;
  objectType: LearningObjectType;
  objectId: string;
  status: "not_started" | "in_progress" | "completed" | "submitted" | "passed" | "failed";
  score?: number;
  startedAt?: string;
  completedAt?: string;
  timeSpentSeconds?: number;
};
```

### 16.4 Domain-Isolated Progress Rule

Every event and progress object must include `domainId`, and preferably `programId` and `appId` when available.

```text
Brain Bee dashboard:
  query domainId = brain_bee

MindAI Bee dashboard:
  query domainId = mindai_bee

Bridge dashboard:
  query domainId = bridge
```

Do not create a generic student “skill mastery” dashboard that merges unrelated domains.

---

## 17. Program-Specific Student Experience

### 17.1 Brain Bee Course App

Near-term Brain Bee experience:

```text
Open app
  -> sign up / log in
  -> see one Brain Bee course
  -> continue where left off
  -> study modules based on chapters
  -> answer quizzes
  -> review flashcards
  -> ask AI lesson help if enabled
  -> see course progress
```

Progress depth:

- course completion,
- module completion,
- lesson completion,
- quiz scores,
- flashcard review,
- AI interaction count.

No deep learner modeling required initially.

### 17.2 MindAI Bee Learning / Challenge Preparation App

MindAI Bee experience:

```text
Open MindAI Bee app
  -> sign up / log in
  -> see assigned course/challenge prep
  -> study concept tutorials
  -> answer scenario questions
  -> complete reflection prompts
  -> take practice/checkpoint quizzes
  -> see readiness summary
```

Learning objects should emphasize:

- concept cards,
- scenario questions,
- AI critique questions,
- reflection prompts,
- practice quizzes,
- challenge-style checkpoints.

Progress depth:

- concept exposure,
- concept checks,
- quiz/checkpoint score,
- scenario attempts,
- reflection completion,
- readiness indicators.

Still no heavy coaching engine required in this workstream.

### 17.3 Bridge Learning Area

Bridge learning experience:

```text
Open Bridge app learning area
  -> select tutorial/course
  -> study explanation
  -> review flashcards
  -> answer quiz
  -> launch Bridge practice activity
  -> return to learning path
```

The Learning Platform should track learning content progress. The Bridge Platform should track bridge domain actions and detailed bridge skill signals.

---

## 18. Studio Workflows by Use Case

### 18.1 Brain Bee PDF Chapter to Course Module

```text
Course developer uploads Brain Bee chapter PDF
  -> parser extracts pages, headings, paragraphs, images
  -> developer selects important sections
  -> creates module: Memory
  -> creates lessons from key sections
  -> uses some paragraphs as source excerpts
  -> asks AI to create student-friendly summaries
  -> creates quiz questions from selected paragraphs
  -> creates flashcards for key terms
  -> previews student experience
  -> reviewer checks quality/source rights
  -> publishes module into Brain Bee course app
```

### 18.2 MindAI Bee Concept Tutorial

```text
Course developer creates concept: Confirmation Bias
  -> adds definition, intuition, examples, misconceptions
  -> asks AI to generate everyday/school/AI examples
  -> creates scenario question
  -> creates AI critique question
  -> creates reflection prompt
  -> assembles tutorial: Hook -> Intuition -> Example -> Exercise -> Reflection
  -> publishes into MindAI Bee course
```

### 18.3 Bridge Coach-Created Tutorial

```text
Bridge coach opens Studio or Bridge-specific Studio wrapper
  -> creates lesson: Stayman Overview
  -> adds concept card and explanation
  -> adds quiz questions
  -> inserts domain activity block for bidding practice
  -> preview confirms Bridge activity launch placeholder
  -> publishes to private coach group / organization / public library depending on access
```

---

## 19. Review, Versioning, and Knowledge Evolution

Every educational object should follow a lifecycle:

```text
Draft
  -> Review
  -> Approved
  -> Published
  -> Assigned / Used
  -> Evaluated
  -> Revised
  -> Archived
```

### 19.1 Review Item

```ts
type ReviewItem = {
  id: string;
  objectType: LearningObjectType;
  objectId: string;
  reviewerUserId?: string;
  status: "pending" | "approved" | "changes_requested" | "rejected";
  comments?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 19.2 Versioned Objects

Versioning is required because educational content changes over time. A learner who took version 1 of a course should not have their history broken when version 2 is published.

```ts
type LearningObjectVersion = {
  id: string;
  objectId: string;
  versionLabel: string;
  status: "draft" | "review" | "published" | "retired";
  changelog?: string;
  contentHash?: string;
  createdAt: string;
  publishedAt?: string;
};
```

---

## 20. Data Model Summary

Initial relational tables:

```text
source_documents
parsed_source_units
source_references
learning_objects
learning_object_versions
learning_object_relationships
courses
course_versions
modules
lessons
lesson_sections
learning_blocks
tutorials
question_banks
questions
question_options
quizzes
quiz_questions
quiz_attempts
quiz_responses
flashcard_sets
flashcards
flashcard_reviews
assignments
assignment_submissions
learning_activities
scenario_activities
assessments
reflection_prompts
postmortem_templates
learning_paths
learning_path_items
ai_generated_drafts
review_items
course_publication_packages
course_enrollments
learning_events
learning_object_progress
course_progress
common_learner_progress_signals
```

### 20.1 Learning Object Relationships

```ts
type LearningObjectRelationship = {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  relationshipType:
    | "contains"
    | "teaches"
    | "requires"
    | "reinforces"
    | "evaluates"
    | "recommends"
    | "references"
    | "replaces"
    | "forked_from";
  createdAt: string;
};
```

This supports a searchable educational graph without overbuilding a graph database immediately.

---

## 21. API Surface Focused on Studio and Student Runtime

### 21.1 Studio APIs

```text
POST   /api/studio/sources
GET    /api/studio/sources
GET    /api/studio/sources/:id
POST   /api/studio/sources/:id/parse
GET    /api/studio/sources/:id/units

POST   /api/studio/objects
GET    /api/studio/objects
GET    /api/studio/objects/:id
PATCH  /api/studio/objects/:id
POST   /api/studio/objects/:id/versions

POST   /api/studio/courses
GET    /api/studio/courses
GET    /api/studio/courses/:id
PATCH  /api/studio/courses/:id
POST   /api/studio/courses/:id/publish

POST   /api/studio/ai/summarize
POST   /api/studio/ai/rewrite
POST   /api/studio/ai/generate-questions
POST   /api/studio/ai/generate-flashcards
POST   /api/studio/ai/generate-concept-card
POST   /api/studio/ai/generate-reflection
POST   /api/studio/ai/suggest-lesson-outline

GET    /api/studio/review-items
POST   /api/studio/review-items
PATCH  /api/studio/review-items/:id
```

### 21.2 Student Runtime APIs

```text
GET    /api/runtime/courses/:courseId/manifest
GET    /api/runtime/enrollments
POST   /api/runtime/events
GET    /api/runtime/progress/:courseEnrollmentId
POST   /api/runtime/objects/:objectId/start
POST   /api/runtime/objects/:objectId/complete

POST   /api/runtime/quizzes/:quizId/start
POST   /api/runtime/quiz-attempts/:attemptId/responses
POST   /api/runtime/quiz-attempts/:attemptId/submit

POST   /api/runtime/flashcards/:flashcardId/review
POST   /api/runtime/assignments/:assignmentId/submit
POST   /api/runtime/reflections/:promptId/submit
POST   /api/runtime/ai/ask
```

### 21.3 Domain Activity APIs

```text
POST   /api/runtime/domain-activity/launch
POST   /api/runtime/domain-activity/completed
POST   /api/progress/signals
```

### 21.4 Knowledge Retrieval API (for the Coaching Platform)

```text
POST   /api/retrieve
```

Serves approved, source-bound `KnowledgeChunk`s to the coach against the
`RetrievalRequest` / `KnowledgeChunk` contract in §7.5, scoped by `domainId` +
`knowledgeScopeId`. This is the seam that lets one reusable coach ground its
answers in Learning Platform content without owning ingestion or storage; the
same contract is implemented by other platforms/domains over their own stores.

---

## 22. Implementation Architecture

### 22.1 Main Application Packages

```text
apps/
  learning-studio/
  learning-runtime/
  brainbee-app/
  mindai-app/

packages/
  learning-model/
  learning-renderers/
  learning-studio-components/
  learning-runtime-components/
  ai-authoring/
  source-ingestion/
  progress-events/
  domain-activity-contracts/
  ui-components/

workers/
  parse-source-worker/
  ai-generation-worker/
  publication-worker/
```

### 22.2 Block Renderer Architecture

```ts
type LearningBlockRenderer = {
  blockType: LearningBlockType;
  render: (props: {
    block: LearningBlock;
    runtimeContext: LearningRuntimeContext;
    emitEvent: (event: Partial<LearningEvent>) => Promise<void>;
  }) => JSX.Element;
};
```

This allows new block types without rewriting the course player.

### 22.3 Course Manifest Contract

```ts
type CourseManifest = {
  course: Course;
  version: LearningObjectVersion;
  modules: Module[];
  lessons: Lesson[];
  sections: LessonSection[];
  blocks: LearningBlock[];
  tutorials: Tutorial[];
  quizzes: Quiz[];
  questions: Question[];
  flashcardSets: FlashcardSet[];
  assignments: Assignment[];
  activities: LearningActivity[];
  assets: Array<{
    id: string;
    uri: string;
    assetType: string;
    altText?: string;
  }>;
};
```

The runtime should render the manifest. It should not reconstruct course structure by querying many tables for every lesson load.

---

## 23. AI Boundaries in Studio and Student Runtime

### 23.1 AI in Studio

AI may:

- extract key concepts,
- summarize source units,
- generate drafts,
- suggest questions,
- suggest examples,
- suggest reflection prompts,
- suggest lesson outlines.

AI may not directly publish content.

### 23.2 AI in Student Runtime

AI may:

- explain current lesson,
- simplify a block,
- give examples,
- ask practice questions,
- provide hints where configured,
- help reflect.

AI should be constrained by:

- course content,
- source references,
- app/program policy,
- question/quiz policy,
- and student safety/privacy rules.

### 23.3 AI Interaction Logging

```ts
type AIInteractionLog = {
  id: string;
  learnerId?: string;
  authorUserId?: string;
  contextType: "studio" | "runtime";
  courseId?: string;
  lessonId?: string;
  sourceUnitIds?: string[];
  promptPolicyId: string;
  userPrompt: string;
  modelResponse: string;
  createdObjectId?: string;
  createdAt: string;
};
```

---

## 24. Build Sequence

This is not a weekly schedule. It is the recommended implementation sequence.

### Sequence 1: Core Learning Object Model

Build:

- learning object base table/model,
- courses, modules, lessons, sections, blocks,
- object relationships,
- basic source references,
- simple manual course builder.

Outcome:

```text
A course developer can manually create a structured course with modules, lessons, and blocks.
```

### Sequence 2: Student Runtime Block Renderer

Build:

- course manifest API,
- course home,
- module view,
- lesson player,
- renderers for rich text, image, concept card, source excerpt, summary, reflection prompt,
- progress events.

Outcome:

```text
A student can take a simple course and progress is recorded.
```

### Sequence 3: Source Ingestion and Source Viewer

Build:

- source upload,
- PDF/DOCX/text parsing,
- parsed source units,
- source viewer,
- source unit selection,
- create source excerpt/summary block from selected unit.

Outcome:

```text
A course developer can upload a Brain Bee chapter and build lessons from selected source units.
```

### Sequence 4: AI-Assisted Authoring

Build:

- generate summary,
- generate concept card,
- generate questions,
- generate flashcards,
- generate reflection prompts,
- AI draft accept/edit/reject.

Outcome:

```text
The Learning Studio becomes a practical StudyFetch-like authoring environment with human-approved structured outputs.
```

### Sequence 5: Quiz, Flashcard, Assignment Runtime

Build:

- question bank,
- quiz builder,
- quiz player,
- quiz attempts/responses,
- flashcard sets/reviews,
- assignment/reflection submissions.

Outcome:

```text
Brain Bee and MindAI Bee courses support real learning checks and student interactions.
```

### Sequence 6: Review, Versioning, Publishing

Build:

- review queue,
- object approval,
- course versioning,
- publication package generation,
- preview mode.

Outcome:

```text
Courses can be reviewed and published as stable runtime packages.
```

### Sequence 7: AI Study Panel

Build:

- source-bounded AI ask,
- explain current block/lesson,
- quiz me on this section,
- AI interaction logging,
- course/app feature flags.

Outcome:

```text
Students receive AI-enabled learning help without turning the course into a generic chatbot.
```

### Sequence 8: App Shell Integration

Build:

- app config consumption,
- Brain Bee app shell course delivery,
- MindAI Bee app shell course delivery,
- enrollment integration,
- phone/email/access integration through Nexus where applicable.

Outcome:

```text
Learning content is delivered in real program-specific apps.
```

### Sequence 9: Domain Activity Integration

Build:

- domain activity block,
- Bridge activity launch contract,
- completion signal ingestion,
- generic placeholder renderer.

Outcome:

```text
Bridge learning content can include bridge-specific practice without moving Bridge runtime into the Learning Platform.
```

---

## 25. Acceptance Criteria for v1 Product Foundation

The Learning Platform foundation is acceptable when:

1. A course developer can create a course manually.
2. A course developer can upload a source document and select source units.
3. AI can draft summaries, questions, flashcards, and concept cards from selected source units.
4. AI drafts can be accepted, edited, or rejected.
5. A course can be published as a versioned manifest.
6. A student can open a course, complete lessons, answer quizzes, review flashcards, and submit reflections.
7. Student progress is recorded by domain/program/app.
8. Brain Bee-style course progress is shallow but functional.
9. MindAI Bee-style concept/scenario/reflection progress is supported.
10. Bridge content can include a domain activity block that routes to the Bridge Platform.
11. The system separates authoring, review, publication, runtime, and progress.
12. The system does not require deep coaching architecture to deliver the first learning apps.

---

## 26. Immediate Deliverables

### 26.1 Learning Studio MVP

```text
Manual course builder
Source upload and source viewer
AI-assisted summary/question/flashcard/concept generation
Learning object library
Course preview
Publish package
```

### 26.2 Student Runtime MVP

```text
Course home
Module list
Lesson player
Block renderers
Quiz player
Flashcard review
Reflection submission
Progress dashboard
AI study panel, if enabled
```

### 26.3 Brain Bee Course App

```text
Single course app shell
Login/registration through app/Nexus
Brain Bee course manifest
Course player
Quizzes
Flashcards
Progress
```

### 26.4 MindAI Bee Learning App

```text
MindAI Bee course/challenge prep shell
Concept tutorials
Scenario questions
AI critique questions
Reflection prompts
Checkpoints
Readiness summary
```

### 26.5 Bridge Learning Integration

```text
Bridge tutorials authored in Studio
Bridge flashcards/quizzes
Bridge domain activity block
Completion signal from Bridge Platform
No bridge runtime inside Learning Platform
```

---

## 27. Implementation Mental Model

```text
Learning Studio
  -> creates human-reviewed learning objects
  -> uses AI for drafts and extraction
  -> keeps source references and versions
  -> publishes runtime manifests

Student Runtime
  -> renders published learning objects
  -> guides students through Learn / Check / Practice / Reflect
  -> logs events and progress
  -> offers source-bounded AI help when enabled

App Shell
  -> controls where the course appears and who can access it

Domain Platforms
  -> provide special activities such as Bridge practice

Progress Layer
  -> records domain-isolated learning progress
```

Final formula:

```text
Source + Human Author + AI Drafting + Structured Learning Objects + Published Runtime + Student Events
= Reusable LAIC Learning Platform
```
