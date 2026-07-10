from typing import Literal, Optional

from pydantic import BaseModel, Field

Mode = Literal["conversational", "summary", "narrative"]


# ── Content model (mirrors src/services/types.ts) ────────────────────────────
class Figure(BaseModel):
    image: Optional[str] = None  # Claude generates text only in v1; usually omitted
    caption: str


class Bubble(BaseModel):
    text: Optional[str] = None
    image: Optional[str] = None
    caption: Optional[str] = None


class ConversationalContent(BaseModel):
    question: str
    bubbles: list[Bubble]


class ArticleContent(BaseModel):
    title: str
    lead: Optional[str] = None
    paragraphs: list[str]
    figure: Optional[Figure] = None


class AssistantReply(BaseModel):
    conversational: str
    summary: str
    narrative: str


class UnitContent(BaseModel):
    unitId: str
    moduleLabel: str = "Module 1"
    concept: str
    progress: int = 0
    availableModes: list[Mode] = Field(default_factory=lambda: ["conversational", "summary", "narrative"])
    hasInteractive: bool = False
    conversational: ConversationalContent
    summary: ArticleContent
    narrative: ArticleContent
    assistantReply: AssistantReply


# ── Request bodies ───────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    unitId: str
    topic: str
    grade: Optional[str] = None
    courseId: Optional[str] = None
    moduleLabel: Optional[str] = None
    progress: Optional[int] = None


class AssistantRequest(BaseModel):
    unitId: str
    topic: str
    mode: Mode
    question: str
    courseId: Optional[str] = None
    history: list[dict] = Field(default_factory=list)


class AssistantResponse(BaseModel):
    reply: str


# The subset of UnitContent that Claude is asked to fill in. The router adds the
# non-generated metadata (unitId, moduleLabel, progress, availableModes, etc.).
class GeneratedPayload(BaseModel):
    concept: str
    conversational: ConversationalContent
    summary: ArticleContent
    narrative: ArticleContent
    assistantReply: AssistantReply


# ── Upload / course API models ────────────────────────────────────────────────
class UploadResponse(BaseModel):
    uploadId: str
    filename: str
    textLength: int


class UnitInput(BaseModel):
    moduleLabel: str
    concept: str


class CreateCourseRequest(BaseModel):
    subject: str
    unitTitle: str
    grade: Optional[str] = None
    goals: Optional[str] = None
    teacherName: Optional[str] = None
    orgId: Optional[str] = None
    stageNodeId: Optional[str] = None
    teacherProfileId: Optional[str] = None
    uploadIds: list[str] = Field(default_factory=list)
    units: list[UnitInput] = Field(default_factory=list)
    teacherBlocks: list["TeacherBlockInput"] = Field(default_factory=list)


class CourseUnitResponse(BaseModel):
    id: str
    moduleLabel: str
    concept: str
    position: int = 0


class CreateCourseResponse(BaseModel):
    courseId: str
    joinCode: str
    subject: str
    unitTitle: str
    teacher: str
    units: list[CourseUnitResponse]
    ingestJobId: Optional[str] = None


class IngestJobStatus(BaseModel):
    status: str
    stage: str
    current: int = 0
    total: int = 0
    error: Optional[str] = None


class CourseDetailResponse(BaseModel):
    id: str
    subject: str
    unitTitle: str
    teacher: str
    units: int
    progress: int = 0
    joinCode: Optional[str] = None
    grade: Optional[str] = None
    unitList: list[CourseUnitResponse] = Field(default_factory=list)


class EnrollRequest(BaseModel):
    displayName: str = "Student"
    profileId: Optional[str] = None
    joinCode: Optional[str] = None


class PreviewStructureRequest(BaseModel):
    uploadIds: list[str] = Field(default_factory=list)


# ── Module structure (chapter screen learning) ───────────────────────────────
class VoiceParagraphs(BaseModel):
    paragraphs: list[str]


class ScreenBeat(BaseModel):
    conceptId: str
    conversational: VoiceParagraphs
    summary: VoiceParagraphs
    narrative: VoiceParagraphs
    figure: Optional[Figure] = None


class FlashcardItem(BaseModel):
    id: str
    front: str
    back: str


class MCQItem(BaseModel):
    id: str
    question: str
    choices: list[str]
    correctIndex: int
    explanation: Optional[str] = None


class ScreenStep(BaseModel):
    type: Literal["screen"] = "screen"
    chapterLabel: str
    sectionTitle: Optional[str] = None
    beat: ScreenBeat


class FlashcardCheckStep(BaseModel):
    type: Literal["flashcard_check"] = "flashcard_check"
    cards: list[FlashcardItem]
    source: Literal["standard", "teacher"] = "standard"


class MCQStep(BaseModel):
    type: Literal["mcq"] = "mcq"
    questions: list[MCQItem]
    source: Literal["standard", "teacher"] = "standard"


ModuleStep = ScreenStep | FlashcardCheckStep | MCQStep


class ChapterModule(BaseModel):
    chapterId: str
    label: str
    title: str
    steps: list[ScreenStep | FlashcardCheckStep | MCQStep]


class TeacherBlockInput(BaseModel):
    type: Literal["FlashcardSet", "MCQQuiz", "Flashcard"]
    chapterIndex: int = 0
    position: int = 0  # insert after this step index within chapter
    cards: list[FlashcardItem] = Field(default_factory=list)
    questions: list[MCQItem] = Field(default_factory=list)


class ModuleStructure(BaseModel):
    unitId: str
    chapters: list[ChapterModule]
    teacherBlocks: list[TeacherBlockInput] = Field(default_factory=list)


class ItemMastery(BaseModel):
    itemId: str
    alpha: float = 1.0
    beta: float = 1.0
    wrongCount: int = 0
    lastResult: Optional[Literal["correct", "incorrect"]] = None


class AttemptRequest(BaseModel):
    unitId: str
    itemId: str
    itemType: Literal["flashcard", "mcq"]
    correct: bool
    studentId: str = "local-student"


class AttemptResponse(BaseModel):
    mastery: ItemMastery
    shouldResurface: bool
