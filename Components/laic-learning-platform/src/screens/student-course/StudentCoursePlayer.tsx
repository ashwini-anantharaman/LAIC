import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudioBlock, StudioCourseData, StudioTool, StudySource } from "../../learning/types";
import { flattenScreens, getBlock, type StudioScreenRef } from "../../learning/studio-state";
import { BlockStage, type StudioBlockPreviewState } from "../studio/BlockStage";
import { SourceQuoteDrawer } from "../studio/SourceQuoteDrawer";
import { BLOCK_LABELS } from "../studio/studioTheme";
import { MasteryQuizPlayer } from "./MasteryQuizPlayer";
import {
  StudentReadOnlyDrawer,
  allFlashcards,
  collectAllQuestions,
} from "./student-course-utils";
import { useApp } from "../../store/AppContext";
import "../studio/studio.css";
import "./student-course.css";

type CourseSubview = "lesson" | "bank" | "cards";

function stepKindLabel(block: StudioBlock | null, pageIndex: number): string {
  if (!block) return "Lesson";
  const kinds: Record<string, string> = {
    hook: "The hook",
    study: block.type === "study" ? block.kind || "Study" : "Study",
    animation: "See it",
    quiz: "Prove it · mastery",
    case: "Case file",
    check: "Check yourself",
    flashcards: "Flashcards",
    reflection: "Reflection",
    image: "Image",
  };
  return `Module ${pageIndex + 1} · ${kinds[block.type] ?? BLOCK_LABELS[block.type]}`;
}

function lastScreenIndexForPage(screens: StudioScreenRef[], pageIndex: number): number {
  let last = -1;
  screens.forEach((s, i) => {
    if (s.pageIndex === pageIndex) last = i;
  });
  return last;
}

export function StudentCoursePlayer({
  studio,
  initialPageIndex = 0,
  onExit,
}: {
  studio: StudioCourseData;
  initialPageIndex?: number;
  onExit: () => void;
}) {
  const { courseId, setLessonCoachFocus } = useApp();
  const pages = studio.pages;
  const screens = useMemo(() => flattenScreens(pages), [pages]);

  const initialPos = useMemo(() => {
    const first = screens.findIndex((s) => s.pageIndex === initialPageIndex);
    return first >= 0 ? first : 0;
  }, [screens, initialPageIndex]);

  const [pos, setPos] = useState(initialPos);
  const [courseSubview, setCourseSubview] = useState<CourseSubview>("lesson");
  const [previewState, setPreviewState] = useState<StudioBlockPreviewState>({});
  const [quizMastered, setQuizMastered] = useState(false);
  const [drawerTool, setDrawerTool] = useState<StudioTool | null>(null);
  const [highlightVocab, setHighlightVocab] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [bankFilter, setBankFilter] = useState({ mod: "all", q: "" });
  const [sourceDrawer, setSourceDrawer] = useState<StudySource | null>(null);

  const current = screens[pos];
  const block = current ? getBlock(pages, current) : null;
  const pageIndex = current?.pageIndex ?? 0;
  const page = pages[pageIndex];

  useEffect(() => {
    setPos(initialPos);
  }, [initialPos]);

  useEffect(() => {
    setPreviewState({});
    setQuizMastered(false);
  }, [block?.id]);

  useEffect(() => {
    if (!page) {
      setLessonCoachFocus(null);
      return;
    }
    setLessonCoachFocus({
      conceptId: page.moduleId ?? page.id,
      conceptName: page.title,
    });
    return () => setLessonCoachFocus(null);
  }, [page?.id, page?.title, page?.moduleId, setLessonCoachFocus]);

  const openTool = (kind: StudioTool["kind"]) => {
    const tool = studio.tools.find((t) => t.kind === kind);
    if (tool) {
      setDrawerTool(tool);
      setHighlightVocab(null);
    }
  };

  const openVocab = (term: string) => {
    const tool = studio.tools.find((t) => t.kind === "vocab");
    if (tool) {
      setDrawerTool(tool);
      setHighlightVocab(term);
    }
  };

  const jumpToPage = (pi: number) => {
    const first = screens.findIndex((s) => s.pageIndex === pi);
    if (first >= 0) {
      setPos(first);
      setCourseSubview("lesson");
      setMapOpen(false);
    }
  };

  const continueDisabled = useMemo(() => {
    if (!block) return true;
    if (block.type === "study" && block.check && previewState.checkChoice == null) return true;
    if (block.type === "quiz") return !quizMastered;
    return false;
  }, [block, previewState, quizMastered]);

  const footerHint = useMemo(() => {
    if (!block) return "Ready when you are";
    if (block.type === "study" && block.check && previewState.checkChoice == null) {
      return "Answer the check to continue";
    }
    if (block.type === "quiz" && !quizMastered) return "Master all concepts to continue";
    return "Ready when you are";
  }, [block, previewState, quizMastered]);

  const allQuestions = useMemo(() => collectAllQuestions(studio), [studio]);
  const flashcards = useMemo(() => allFlashcards(studio), [studio]);

  const filteredBank = allQuestions.filter((item) => {
    const modOk = bankFilter.mod === "all" || item.module === bankFilter.mod;
    const q = bankFilter.q.toLowerCase();
    const qOk = !q || item.stem.toLowerCase().includes(q) || item.opts.some((o) => o.toLowerCase().includes(q));
    return modOk && qOk;
  });

  const handleContinue = () => {
    if (pos < screens.length - 1) setPos((p) => p + 1);
  };

  const handleBack = () => {
    if (pos > 0) setPos((p) => p - 1);
  };

  const onQuizMastered = useCallback((done: boolean) => setQuizMastered(done), []);

  return (
    <div className="student-course-root studio-root">
      <div className="sc-shell">
        <div className="sc-workarea">
          <div className="sc-app">
            <nav className="sc-rail" aria-label="Lesson tools">
              <button
                type="button"
                className={`sc-railbtn${courseSubview === "lesson" ? " on" : ""}`}
                onClick={() => setCourseSubview("lesson")}
                title="Lesson"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 5h16v14H4z" />
                  <path d="M4 9h16" />
                </svg>
                Lesson
              </button>
              <button
                type="button"
                className={`sc-railbtn${courseSubview === "bank" ? " on" : ""}`}
                onClick={() => setCourseSubview("bank")}
                title="Question bank"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M9 11a3 3 0 1 1 4 2.8c-.8.4-1 .8-1 1.7" />
                  <circle cx="12" cy="18" r=".6" fill="currentColor" />
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                </svg>
                Q-Bank
              </button>
              <button
                type="button"
                className={`sc-railbtn${courseSubview === "cards" ? " on" : ""}`}
                onClick={() => setCourseSubview("cards")}
                title="Flashcards"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="3" y="6" width="14" height="12" rx="2" />
                  <path d="M8 3h13v13" />
                </svg>
                Cards
              </button>
              <button type="button" className="sc-railbtn" onClick={() => openTool("cases")} title="Case Files">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 4h9l3 3h4v13H4z" />
                  <path d="M8 12h8M8 16h5" />
                </svg>
                Cases
              </button>
              <button type="button" className="sc-railbtn" onClick={() => openTool("vocab")} title="Vocabulary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" />
                  <path d="M9 8h7M9 12h5" />
                </svg>
                Vocab
              </button>
              <div className="sc-railspace" />
              <button type="button" className="sc-railbtn" onClick={() => setMapOpen(true)} title="Course map">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="6" cy="6" r="2" />
                  <circle cx="18" cy="12" r="2" />
                  <circle cx="7" cy="18" r="2" />
                  <path d="M8 6h6a2 2 0 0 1 2 2M16 12H9a2 2 0 0 0-2 2" />
                </svg>
                Map
              </button>
            </nav>

            {courseSubview === "lesson" ? (
              <div className="sc-main">
                <header className="sc-top">
                  <div className="sc-modrow">
                    {pages.map((p, i) => {
                      const done = lastScreenIndexForPage(screens, i) < pos;
                      const isCur = pageIndex === i;
                      return (
                        <span key={p.id} className={`m${isCur ? " cur" : ""}${done ? " done" : ""}`}>
                          {isCur ? <span className="dot">●</span> : null}
                          {p.title}
                        </span>
                      );
                    })}
                  </div>
                  <div className="sc-seg">
                    {pages.map((p, i) => {
                      const done = lastScreenIndexForPage(screens, i) < pos;
                      const isCur = pageIndex === i;
                      return (
                        <span key={p.id} className={`s${done ? " done" : ""}${isCur ? " cur" : ""}`}>
                          <i />
                        </span>
                      );
                    })}
                  </div>
                  <div className="sc-crumbs">
                    <span className="sc-stepkind">{stepKindLabel(block, pageIndex)}</span>
                    <button type="button" className="sc-exit" onClick={onExit}>
                      Exit to workspace
                    </button>
                  </div>
                </header>

                <div className="sc-stage">
                  <div className="sc-screen">
                    <div className="sc-wrap studio-fadein">
                      {block?.type === "quiz" ? (
                        <MasteryQuizPlayer block={block} pageTitle={page?.title ?? ""} onAllMastered={onQuizMastered} />
                      ) : block ? (
                        <BlockStage
                          block={block}
                          edit={false}
                          courseId={courseId ?? undefined}
                          onOpenSource={setSourceDrawer}
                          previewState={previewState}
                          onPreviewStateChange={setPreviewState}
                          onChange={() => {}}
                          onDelete={() => {}}
                          onMoveUp={() => {}}
                          onMoveDown={() => {}}
                          onVocabClick={openVocab}
                        />
                      ) : (
                        <p className="studio-empty">No lesson content yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <footer className="sc-bottom">
                  <span className="sc-hint">{footerHint}</span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" className="sc-btn ghost" disabled={pos <= 0} onClick={handleBack}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="sc-btn primary"
                      disabled={continueDisabled || pos >= screens.length - 1}
                      onClick={handleContinue}
                    >
                      {block?.type === "quiz" && !quizMastered ? "Master all concepts to continue" : "Continue"}
                    </button>
                  </div>
                </footer>
              </div>
            ) : courseSubview === "bank" ? (
              <div className="sc-main sc-subview">
                <div className="sc-page-head">
                  <h1>Question bank</h1>
                  <div className="ph-sub">{allQuestions.length} questions across your course</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <select
                      value={bankFilter.mod}
                      onChange={(e) => setBankFilter((f) => ({ ...f, mod: e.target.value }))}
                      style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 9, padding: "8px 12px" }}
                    >
                      <option value="all">All modules</option>
                      {pages.map((p) => (
                        <option key={p.id} value={p.title}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Search questions…"
                      value={bankFilter.q}
                      onChange={(e) => setBankFilter((f) => ({ ...f, q: e.target.value }))}
                      style={{ flex: 1, minWidth: 180, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 9, padding: "8px 12px" }}
                    />
                  </div>
                </div>
                <div className="sc-page-body">
                  {filteredBank.length === 0 ? (
                    <p style={{ color: "var(--dim)", textAlign: "center", padding: 40 }}>No questions match that search.</p>
                  ) : (
                    filteredBank.map((item, i) => (
                      <div key={i} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 13, padding: "16px 18px", margin: "10px 0" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--violet)", marginBottom: 7, textTransform: "uppercase" }}>
                          {item.kind} · {item.concept}
                        </div>
                        <div style={{ fontFamily: "var(--disp)", fontSize: 17, marginBottom: 10 }}>{item.stem}</div>
                        {item.opts.map((o, oi) => (
                          <div
                            key={oi}
                            style={{
                              display: "flex",
                              gap: 9,
                              padding: "7px 11px",
                              border: `1px solid ${oi === item.ans ? "var(--ok)" : "var(--line)"}`,
                              borderRadius: 8,
                              margin: "5px 0",
                              fontSize: 14,
                              background: oi === item.ans ? "rgba(66,201,138,.1)" : "transparent",
                            }}
                          >
                            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>{String.fromCharCode(65 + oi)}</span>
                            <span>{o}{oi === item.ans ? " ✓" : ""}</span>
                          </div>
                        ))}
                        {item.exp ? <p style={{ fontSize: 13, color: "var(--soft)", marginTop: 9, borderLeft: "3px solid var(--teal-d)", paddingLeft: 11 }}>{item.exp}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="sc-main sc-subview">
                <div className="sc-page-head">
                  <h1>Flashcards</h1>
                  <div className="ph-sub">{flashcards.length} cards · tap any card to flip</div>
                </div>
                <div className="sc-page-body">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                    {flashcards.map((c, i) => (
                      <Flashcard key={i} front={c.q} back={c.a} src={c.src} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <StudentReadOnlyDrawer open={!!drawerTool && !mapOpen} tool={drawerTool} highlightTerm={highlightVocab} onClose={() => setDrawerTool(null)} />

      {courseId ? (
        <SourceQuoteDrawer
          open={!!sourceDrawer}
          courseId={courseId}
          source={sourceDrawer}
          onClose={() => setSourceDrawer(null)}
        />
      ) : null}

      {mapOpen && (
        <>
          <div className="studio-scrim show" onClick={() => setMapOpen(false)} aria-hidden />
          <aside className="studio-drawer show">
            <div className="studio-drawer-h">
              <h3>Course map</h3>
              <button type="button" className="studio-drawer-x" onClick={() => setMapOpen(false)}>
                ×
              </button>
            </div>
            <div className="studio-drawer-b">
              {pages.map((p, i) => (
                <button key={p.id} type="button" className={`sc-map-item${pageIndex === i ? " cur" : ""}`} onClick={() => jumpToPage(i)}>
                  <strong>{i + 1}. {p.title}</strong>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>{p.blocks.length} blocks</div>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function Flashcard({ front, back, src }: { front: string; back: string; src: string }) {
  const [flip, setFlip] = useState(false);
  return (
    <div
      className={flip ? "gcard flip" : "gcard"}
      onClick={() => setFlip((f) => !f)}
      onKeyDown={(e) => e.key === "Enter" && setFlip((f) => !f)}
      role="button"
      tabIndex={0}
      style={{ height: 170, perspective: 1200, cursor: "pointer" }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", transition: "transform 0.5s", transformStyle: "preserve-3d", transform: flip ? "rotateY(180deg)" : undefined }}>
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 14, border: "1px solid var(--line)", padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", background: "var(--panel)" }}>
          <div style={{ position: "absolute", top: 9, left: 12, fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)", textTransform: "uppercase" }}>{src}</div>
          <div style={{ fontFamily: "var(--disp)", fontSize: 16 }}>{front}</div>
          <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim)", textTransform: "uppercase" }}>tap to flip</div>
        </div>
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 14, border: "1px solid var(--line)", padding: 16, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", background: "var(--panel2)", transform: "rotateY(180deg)" }}>
          <div style={{ fontSize: 14, color: "var(--soft)", lineHeight: 1.45 }}>{back}</div>
        </div>
      </div>
    </div>
  );
}
