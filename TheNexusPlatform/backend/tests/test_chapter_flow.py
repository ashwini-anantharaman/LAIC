"""E2E-style tests for chapter screen learning (no Claude calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ingest import (
    DetectedChapter,
    ConceptOutlineItem,
    ChapterAssessmentsPayload,
    weave_chapter_steps,
    FLASHCARD_EVERY_N,
)
from app.schemas import (
    FlashcardItem,
    MCQItem,
    ScreenBeat,
    TeacherBlockInput,
    VoiceParagraphs,
)
from app.routers.learning import record_attempt
from app.schemas import AttemptRequest


def _beat(cid: str) -> ScreenBeat:
    p = VoiceParagraphs(paragraphs=[f"Paragraph about {cid}."])
    return ScreenBeat(conceptId=cid, conversational=p, summary=p, narrative=p)


def test_weave_inserts_flashcard_every_n_screens():
    chapter = DetectedChapter(label="Chapter 4", title="Perception", sourceText="x")
    beats = [_beat(f"c{i}") for i in range(8)]
    concepts = [ConceptOutlineItem(conceptId=f"c{i}", title=f"Topic {i}", summary="") for i in range(8)]
    assessments = ChapterAssessmentsPayload(
        flashcards=[FlashcardItem(id="fc1", front="Q", back="A")],
        mcq=[MCQItem(id="mcq1", question="Q?", choices=["a", "b"], correctIndex=0)],
    )
    steps = weave_chapter_steps(chapter, beats, concepts, assessments, [], 0)
    screen_count = sum(1 for s in steps if s.type == "screen")
    fc_count = sum(1 for s in steps if s.type == "flashcard_check")
    mcq_count = sum(1 for s in steps if s.type == "mcq")
    assert screen_count == 8
    assert fc_count == 8 // FLASHCARD_EVERY_N
    assert mcq_count == 1
    assert steps[0].type == "screen"
    assert steps[0].chapterLabel == "Chapter 4"


def test_weave_teacher_blocks_merged():
    chapter = DetectedChapter(label="Chapter 1", title="Intro", sourceText="x")
    beats = [_beat("c1"), _beat("c2")]
    concepts = [ConceptOutlineItem(conceptId="c1", title="T1", summary=""), ConceptOutlineItem(conceptId="c2", title="T2", summary="")]
    assessments = ChapterAssessmentsPayload(flashcards=[], mcq=[])
    teacher = [
        TeacherBlockInput(
            type="FlashcardSet",
            chapterIndex=0,
            position=1,
            cards=[FlashcardItem(id="tfc1", front="TF", back="TB")],
        )
    ]
    steps = weave_chapter_steps(chapter, beats, concepts, assessments, teacher, 0)
    types = [s.type for s in steps]
    assert "flashcard_check" in types
    teacher_step = next(s for s in steps if s.type == "flashcard_check" and s.source == "teacher")
    assert teacher_step.cards[0].front == "TF"


def test_bayesian_mastery_resurface_on_wrong():
    req = AttemptRequest(unitId="test-unit", itemId="fc1", itemType="flashcard", correct=False)
    res = record_attempt(req)
    assert res.mastery.wrongCount >= 1
    assert res.shouldResurface is True
    req2 = AttemptRequest(unitId="test-unit", itemId="fc1", itemType="flashcard", correct=True)
    res2 = record_attempt(req2)
    assert res2.mastery.alpha > res.mastery.alpha


if __name__ == "__main__":
    test_weave_inserts_flashcard_every_n_screens()
    test_weave_teacher_blocks_merged()
    test_bayesian_mastery_resurface_on_wrong()
    print("All chapter flow tests passed.")
