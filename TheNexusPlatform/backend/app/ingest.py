"""Ingest pipeline: PDF text -> chapters -> concept screens -> assessments -> woven steps."""

import re
import uuid
from typing import Optional

from pydantic import BaseModel, Field

from .claude import call_claude_json
from .prompts import MODE_PROMPTS
from .rag import retrieve_context, retrieve_from_text
from .schemas import (
    ChapterModule,
    FlashcardCheckStep,
    FlashcardItem,
    MCQItem,
    MCQStep,
    ModuleStructure,
    ScreenBeat,
    ScreenStep,
    TeacherBlockInput,
    VoiceParagraphs,
)

FLASHCARD_EVERY_N = 4


class DetectedChapter(BaseModel):
    label: str
    title: str
    sourceText: str


class ConceptOutlineItem(BaseModel):
    conceptId: str
    title: str
    summary: str


class ConceptOutline(BaseModel):
    concepts: list[ConceptOutlineItem]


class ScreenBeatPayload(BaseModel):
    conceptId: str
    conversational: VoiceParagraphs
    summary: VoiceParagraphs
    narrative: VoiceParagraphs


class ChapterScreensPayload(BaseModel):
    screens: list[ScreenBeatPayload]


class ChapterAssessmentsPayload(BaseModel):
    flashcards: list[FlashcardItem]
    mcq: list[MCQItem]


class ChapterFullPayload(BaseModel):
    """Single-call chapter generation: concepts, screens, and assessments."""

    concepts: list[ConceptOutlineItem]
    screens: list[ScreenBeatPayload]
    flashcards: list[FlashcardItem]
    mcq: list[MCQItem]


class ChapterOutlineItem(BaseModel):
    label: str
    title: str


class ChapterOutlineResult(BaseModel):
    chapters: list[ChapterOutlineItem]


_TOC_PATTERN = re.compile(r"(?im)^CHAPTER\s+(\d+)\s+(.+?)\s+(\d+)\s*$")


def _parse_toc_outline(source_text: str) -> list[ChapterOutlineItem]:
    """Parse a table-of-contents block when chapter headings are listed together."""
    head = source_text[:80000]
    matches = list(_TOC_PATTERN.finditer(head))
    if len(matches) < 3:
        return []
    span = matches[-1].start() - matches[0].start()
    if span > 15000:
        return []
    return [
        ChapterOutlineItem(label=f"Chapter {int(m.group(1))}", title=m.group(2).strip())
        for m in matches
    ]


def _is_toc_region(text: str, pos: int) -> bool:
    window = text[max(0, pos - 500) : pos + 500]
    return window.upper().count("CHAPTER") > 3


def _chapter_num_from_label(label: str, index: int) -> int:
    match = re.search(r"(\d+)", label)
    return int(match.group(1)) if match else index + 1


def _find_chapter_body_start(text: str, chapter_num: int, title: str, min_pos: int) -> int:
    title_clean = re.sub(r"\s+", " ", title.strip())
    title_esc = re.escape(title_clean)
    patterns = [
        rf"(?i){title_esc}\s+{chapter_num}\b",
        rf"(?i)CHAPTER\s*{chapter_num}\s+{title_esc}",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text[min_pos:]):
            abs_pos = min_pos + match.start()
            if _is_toc_region(text, abs_pos):
                continue
            return abs_pos

    short = re.escape(title_clean[:20])
    for match in re.finditer(short, text[min_pos:], re.I):
        abs_pos = min_pos + match.start()
        if _is_toc_region(text, abs_pos):
            continue
        return abs_pos
    return min_pos


def split_source_by_outline(
    source_text: str,
    outline: list[ChapterOutlineItem],
) -> list[DetectedChapter]:
    if not outline:
        return [DetectedChapter(label="Chapter 1", title="Course Material", sourceText=source_text.strip())]
    if len(outline) == 1:
        item = outline[0]
        return [DetectedChapter(label=item.label, title=item.title, sourceText=source_text.strip())]

    starts: list[int] = []
    min_pos = 5000
    for index, item in enumerate(outline):
        chapter_num = _chapter_num_from_label(item.label, index)
        start = _find_chapter_body_start(source_text, chapter_num, item.title, min_pos)
        starts.append(start)
        min_pos = start + 500

    chapters: list[DetectedChapter] = []
    for index, item in enumerate(outline):
        start = starts[index]
        end = starts[index + 1] if index + 1 < len(starts) else len(source_text)
        body = source_text[start:end].strip()
        if not body:
            body = source_text[start : start + 12000].strip()
        chapters.append(DetectedChapter(label=item.label, title=item.title, sourceText=body))
    return chapters


def detect_chapter_outline(source_text: str) -> list[ChapterOutlineItem]:
    """Fast chapter list for the builder preview (titles only, no full text split)."""
    text = source_text[:20000]
    if len(text.strip()) < 100:
        return [ChapterOutlineItem(label="Chapter 1", title="Introduction")]

    result = call_claude_json(
        "You detect textbook chapter boundaries. Output only valid JSON.",
        f"""Scan this textbook-style content and list its chapters.
Look for patterns like "Chapter N", numbered unit headings, and major topic shifts.
Return chapter labels and titles ONLY — do not include chapter body text.

Content:
---
{text}
---

Return JSON: {{ "chapters": [ {{ "label": "Chapter 1", "title": "..." }} ] }}""",
        ChapterOutlineResult,
        max_tokens=1200,
    )
    return result.chapters if result.chapters else [
        ChapterOutlineItem(label="Chapter 1", title="Course Material")
    ]


def detect_chapters(source_text: str) -> list[DetectedChapter]:
    text = source_text
    if len(text.strip()) < 100:
        return [
            DetectedChapter(
                label="Chapter 1",
                title="Introduction",
                sourceText=text.strip(),
            )
        ]

    outline = _parse_toc_outline(text)
    if not outline:
        outline = detect_chapter_outline(text)
    return split_source_by_outline(text, outline)


def _chapter_context(
    chapter: DetectedChapter,
    upload_ids: Optional[list[str]] = None,
    extra_query: str = "",
) -> str:
    query = f"{chapter.title} {chapter.label} {extra_query}".strip()
    body = chapter.sourceText.strip()

    # Prefer passages from this chapter's detected body (avoids cross-chapter RAG noise).
    if len(body) > 300:
        scoped = retrieve_from_text(body, query, top_k=6, max_chars=7000)
        if scoped:
            return scoped

    if upload_ids:
        context = retrieve_context(upload_ids, query, top_k=8, max_chars=7000)
        if context:
            return context
        from .supabase_client import _get_upload_text_by_ids

        combined = _get_upload_text_by_ids(upload_ids)
        if combined:
            return retrieve_from_text(combined, query, top_k=8, max_chars=7000)

    return body[:7000] if body else ""


def generate_chapter_content(
    chapter: DetectedChapter,
    grade: Optional[str],
    upload_ids: Optional[list[str]] = None,
) -> tuple[list[ConceptOutlineItem], list[ScreenBeat], ChapterAssessmentsPayload]:
    """One Claude call for concepts + screens + assessments, using RAG context."""
    context = _chapter_context(chapter, upload_ids)
    grade_note = f"Target grade: {grade}." if grade else ""

    result = call_claude_json(
        "You are an expert curriculum designer. Output only valid JSON.",
        f"""Build a complete lesson for "{chapter.label}: {chapter.title}".
{grade_note}

Using ONLY the source passages below — do not introduce topics, examples, or facts that are not supported by the text:
1. Break the chapter into 6-8 concepts (conceptId like "c1", short title, one-line summary).
2. Write one learning screen per concept in three voices:
   - conversational: {MODE_PROMPTS['conversational']}
   - summary: {MODE_PROMPTS['summary']}
   - narrative: {MODE_PROMPTS['narrative']}
   Each voice: 1-2 short paragraphs (~60-120 words). Same facts, different tone.
3. Create 4 flashcards (id, front, back) and 4 MCQs (id, question, choices[4], correctIndex, explanation).

Source passages:
---
{context}
---

Return JSON:
{{ "concepts": [ {{ "conceptId": "c1", "title": "...", "summary": "..." }} ],
   "screens": [ {{ "conceptId": "c1",
      "conversational": {{ "paragraphs": ["..."] }},
      "summary": {{ "paragraphs": ["..."] }},
      "narrative": {{ "paragraphs": ["..."] }}
   }} ],
   "flashcards": [...],
   "mcq": [...] }}""",
        ChapterFullPayload,
        max_tokens=12000,
    )

    beats: list[ScreenBeat] = []
    for screen in result.screens:
        beats.append(
            ScreenBeat(
                conceptId=screen.conceptId,
                conversational=screen.conversational,
                summary=screen.summary,
                narrative=screen.narrative,
            )
        )

    assessments = ChapterAssessmentsPayload(flashcards=result.flashcards, mcq=result.mcq)
    return result.concepts, beats, assessments


def outline_concepts(chapter: DetectedChapter, grade: Optional[str]) -> list[ConceptOutlineItem]:
    grade_note = f"Target grade: {grade}." if grade else ""
    result = call_claude_json(
        "You are a curriculum designer breaking content into bite-sized concepts.",
        f"""Break this chapter into MANY small concepts (aim for 6-12). Cover ALL material — do not skip topics.
{grade_note}
Chapter: {chapter.label} — {chapter.title}

---
{chapter.sourceText[:14000]}
---

Return JSON: {{ "concepts": [ {{ "conceptId": "c1", "title": "short title", "summary": "what this beat covers" }} ] }}""",
        ConceptOutline,
        max_tokens=3000,
    )
    return result.concepts


def generate_screens(
    chapter: DetectedChapter,
    concepts: list[ConceptOutlineItem],
    grade: Optional[str],
) -> list[ScreenBeat]:
    concepts_json = [{"conceptId": c.conceptId, "title": c.title, "summary": c.summary} for c in concepts]
    grade_note = f"Target grade: {grade}." if grade else ""

    result = call_claude_json(
        "You generate bite-sized learning screens in three voices. Output only valid JSON.",
        f"""Generate one screen per concept for chapter "{chapter.label}: {chapter.title}".
{grade_note}

Voices:
- conversational: {MODE_PROMPTS['conversational']}
- summary: {MODE_PROMPTS['summary']}
- narrative: {MODE_PROMPTS['narrative']}

Rules:
- Each screen: 1-2 short paragraphs per voice (~60-120 words each).
- Preserve depth — do not skip concepts. Same facts in all three voices, different tone.
- Use the chapter source for accuracy.

Concepts: {concepts_json}

Chapter excerpt:
---
{chapter.sourceText[:10000]}
---

Return JSON:
{{ "screens": [
  {{ "conceptId": "c1",
     "conversational": {{ "paragraphs": ["..."] }},
     "summary": {{ "paragraphs": ["..."] }},
     "narrative": {{ "paragraphs": ["..."] }}
  }}
] }}""",
        ChapterScreensPayload,
        max_tokens=8000,
    )

    beats: list[ScreenBeat] = []
    for s in result.screens:
        beats.append(
            ScreenBeat(
                conceptId=s.conceptId,
                conversational=s.conversational,
                summary=s.summary,
                narrative=s.narrative,
            )
        )
    return beats


def generate_assessments(chapter: DetectedChapter, concepts: list[ConceptOutlineItem]) -> ChapterAssessmentsPayload:
    concept_titles = [c.title for c in concepts]
    return call_claude_json(
        "You create study assessments grounded in source material. Output only valid JSON.",
        f"""For chapter "{chapter.title}", create:
- 4 flashcards (id, front, back) for inline review
- 4 MCQ questions (id, question, choices[4], correctIndex, explanation)

Concepts covered: {concept_titles}

Source:
---
{chapter.sourceText[:8000]}
---

Return JSON: {{ "flashcards": [...], "mcq": [...] }}
Each flashcard/mcq needs a unique id like "fc1", "mcq1".""",
        ChapterAssessmentsPayload,
        max_tokens=4000,
    )


def _ensure_ids(items: list, prefix: str) -> None:
    for i, item in enumerate(items):
        if isinstance(item, FlashcardItem) and not item.id:
            item.id = f"{prefix}fc{i}"
        elif isinstance(item, MCQItem) and not item.id:
            item.id = f"{prefix}mcq{i}"


def weave_chapter_steps(
    chapter: DetectedChapter,
    beats: list[ScreenBeat],
    concepts: list[ConceptOutlineItem],
    assessments: ChapterAssessmentsPayload,
    teacher_blocks: list[TeacherBlockInput],
    chapter_index: int,
) -> list[ScreenStep | FlashcardCheckStep | MCQStep]:
    title_map = {c.conceptId: c.title for c in concepts}
    steps: list[ScreenStep | FlashcardCheckStep | MCQStep] = []
    content_count = 0
    fc_pool = list(assessments.flashcards)
    fc_idx = 0

    for beat in beats:
        steps.append(
            ScreenStep(
                chapterLabel=chapter.label,
                sectionTitle=title_map.get(beat.conceptId, beat.conceptId),
                beat=beat,
            )
        )
        content_count += 1

        if content_count % FLASHCARD_EVERY_N == 0 and fc_pool:
            batch = fc_pool[fc_idx : fc_idx + 2] or fc_pool[:2]
            fc_idx = (fc_idx + 2) % max(len(fc_pool), 1)
            steps.append(FlashcardCheckStep(cards=batch, source="standard"))

    # Teacher blocks for this chapter
    for block in teacher_blocks:
        if block.chapterIndex != chapter_index:
            continue
        insert_at = min(block.position, len(steps))
        if block.type == "FlashcardSet" and block.cards:
            steps.insert(insert_at, FlashcardCheckStep(cards=block.cards, source="teacher"))
        elif block.type == "Flashcard" and block.cards:
            steps.insert(insert_at, FlashcardCheckStep(cards=block.cards[:1], source="teacher"))
        elif block.type == "MCQQuiz" and block.questions:
            steps.insert(insert_at, MCQStep(questions=block.questions, source="teacher"))

    if assessments.mcq:
        steps.append(MCQStep(questions=assessments.mcq, source="standard"))

    return steps


def ingest_chapter(
    unit_id: str,
    chapter: DetectedChapter,
    grade: Optional[str],
    teacher_blocks: list[TeacherBlockInput],
    chapter_index: int = 0,
    upload_ids: Optional[list[str]] = None,
) -> ChapterModule:
    if upload_ids:
        concepts, beats, assessments = generate_chapter_content(chapter, grade, upload_ids)
    else:
        concepts = outline_concepts(chapter, grade)
        beats = generate_screens(chapter, concepts, grade)
        assessments = generate_assessments(chapter, concepts)

    if not concepts:
        concepts = [ConceptOutlineItem(conceptId="c1", title=chapter.title, summary=chapter.title)]

    if not beats:
        fallback = _chapter_context(chapter, upload_ids)[:400] or chapter.sourceText[:400]
        beats = [
            ScreenBeat(
                conceptId="c1",
                conversational=VoiceParagraphs(paragraphs=[fallback]),
                summary=VoiceParagraphs(paragraphs=[fallback]),
                narrative=VoiceParagraphs(paragraphs=[fallback]),
            )
        ]
    for i, fc in enumerate(assessments.flashcards):
        if not fc.id:
            assessments.flashcards[i] = FlashcardItem(id=f"fc{i}", front=fc.front, back=fc.back)
    for i, q in enumerate(assessments.mcq):
        if not q.id:
            assessments.mcq[i] = MCQItem(
                id=f"mcq{i}",
                question=q.question,
                choices=q.choices,
                correctIndex=q.correctIndex,
                explanation=q.explanation,
            )

    steps = weave_chapter_steps(chapter, beats, concepts, assessments, teacher_blocks, chapter_index)

    return ChapterModule(
        chapterId=str(uuid.uuid4()),
        label=chapter.label,
        title=chapter.title,
        steps=steps,
    )


def ingest_unit_from_text(
    unit_id: str,
    source_text: str,
    grade: Optional[str],
    teacher_blocks: Optional[list[TeacherBlockInput]] = None,
    chapter_index: int = 0,
) -> ModuleStructure:
    """Ingest one unit from source text (uses first detected chapter or full text)."""
    blocks = teacher_blocks or []
    chapters = detect_chapters(source_text)
    chapter = chapters[chapter_index] if chapter_index < len(chapters) else chapters[0]
    mod = ingest_chapter(unit_id, chapter, grade, blocks, chapter_index)
    return ModuleStructure(unitId=unit_id, chapters=[mod], teacherBlocks=blocks)


def ingest_course_from_uploads(
    unit_ids: list[str],
    source_text: str,
    grade: Optional[str],
    teacher_blocks: Optional[list[TeacherBlockInput]] = None,
) -> list[ModuleStructure]:
    """Detect chapters and create one module structure per unit/chapter."""
    blocks = teacher_blocks or []
    detected = detect_chapters(source_text)
    structures: list[ModuleStructure] = []

    for i, unit_id in enumerate(unit_ids):
        chapter = detected[i] if i < len(detected) else detected[-1]
        mod = ingest_chapter(unit_id, chapter, grade, blocks, i)
        structures.append(ModuleStructure(unitId=unit_id, chapters=[mod], teacherBlocks=blocks))

    return structures
