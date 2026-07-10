import { useEffect, useState, type DragEvent } from "react";

import type { InlineCheck, QuizConcept, StudioBlock, StudySource } from "../../learning/types";
import { BLOCK_META } from "./studioTheme";
import { Eadd, Ef, EfHtml, Elabel, InlineCheckEditor, OptionRows, StudyBodyHtml } from "./EditFields";
import "./studio.css";

export type StudioBlockPreviewState = {
  checkChoice?: number | null;
  quizChoices?: Record<string, number>;
  flippedCards?: number[];
};

export type BlockStageProps = {
  block: StudioBlock;
  edit: boolean;
  previewState?: StudioBlockPreviewState;
  onPreviewStateChange?: (state: StudioBlockPreviewState) => void;
  onChange: (block: StudioBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddBlock?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  onFocusField?: (label: string, value: string) => void;
  onVocabClick?: (term: string) => void;
  courseId?: string;
  onOpenSource?: (src: StudySource) => void;
};

function PreviewCheck({
  stem,
  options,
  answer,
  explanation,
  selected,
  onSelect,
  label = "Check yourself · one question",
}: {
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
  selected: number | null;
  onSelect: (index: number) => void;
  label?: string;
}) {
  const resolved = selected !== null;

  return (
    <div className="studio-qcheck">
      <div className="lab">{label}</div>
      <div className="studio-qstem">{stem}</div>
      {options.map((option, index) => {
        const isCorrect = resolved && index === answer;
        const isWrong = resolved && selected === index && index !== answer;
        return (
          <button
            key={`${option}-${index}`}
            type="button"
            className={`studio-opt${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}`}
            disabled={resolved}
            onClick={() => onSelect(index)}
          >
            <span className="k">{String.fromCharCode(65 + index)}</span>
            {option}
          </button>
        );
      })}
      {resolved ? (
        <div
          className={`studio-feedback show ${selected === answer ? "good" : "moved"}`}
          style={{ display: "block" }}
        >
          {selected === answer ? "✓ Correct. " : "✗ Not quite. "}
          {explanation}
        </div>
      ) : null}
    </div>
  );
}

function normalizeInlineCheck(check: InlineCheck | null): InlineCheck {
  return (
    check ?? {
      concept: "Key idea",
      stem: "What should the learner notice?",
      opts: ["Option A", "Option B", "Option C", "Option D"],
      ans: 0,
      exp: "Explain why this is right.",
    }
  );
}

function quizQuestionId(concept: QuizConcept, index: number) {
  return `${concept.id}-${index}`;
}

function SourceCitationButton({ src, onOpen }: { src: StudySource; onOpen?: (src: StudySource) => void }) {
  return (
    <button type="button" className="studio-srcbtn" onClick={() => onOpen?.(src)}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 5h13v15H4z" />
        <path d="M8 3h13v15" />
      </svg>
      {src.cite || "Source"} · p.{src.page ?? "—"}
    </button>
  );
}

function ImageDropZone({
  courseId,
  src,
  alt,
  onUploaded,
}: {
  courseId?: string;
  src: string | null;
  alt: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    if (!courseId) {
      setError("Save the course before uploading images.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (PNG, JPG, GIF, or WebP).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { AgentAPI } = await import("../../lib/api");
      const { url } = await AgentAPI.uploadStudioImage(courseId, file);
      onUploaded(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  return (
    <>
      {src ? (
        <img className="studio-imgfig" src={src} alt={alt} />
      ) : (
        <label
          className="studio-imgdrop"
          style={{
            borderColor: dragOver ? "var(--teal)" : undefined,
            background: dragOver ? "rgba(63,208,192,.06)" : undefined,
            cursor: uploading ? "wait" : "pointer",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div style={{ fontSize: 24 }}>🖼</div>
          {uploading ? "Uploading…" : "Drag and drop an image here, or click to browse"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
        </label>
      )}
      {error ? <p style={{ color: "#ffb6c6", fontSize: 13, marginTop: 8 }}>{error}</p> : null}
      {src ? (
        <button
          type="button"
          className="studio-addblock"
          style={{ marginTop: 10 }}
          onClick={() => onUploaded("")}
        >
          Replace image
        </button>
      ) : null}
    </>
  );
}

export function BlockStage({
  block,
  edit,
  previewState,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddBlock,
  onFocusField,
  onVocabClick,
  onPreviewStateChange,
  courseId,
  onOpenSource,
}: BlockStageProps) {
  const meta = BLOCK_META[block.type];
  const [checkChoice, setCheckChoice] = useState<number | null>(previewState?.checkChoice ?? null);
  const [quizChoices, setQuizChoices] = useState<Record<string, number>>(previewState?.quizChoices ?? {});
  const [flippedCards, setFlippedCards] = useState<number[]>(previewState?.flippedCards ?? []);

  const emitPreview = (patch: Partial<StudioBlockPreviewState>) => {
    onPreviewStateChange?.({
      checkChoice,
      quizChoices,
      flippedCards,
      ...patch,
    });
  };

  useEffect(() => {
    setCheckChoice(previewState?.checkChoice ?? null);
    setQuizChoices(previewState?.quizChoices ?? {});
    setFlippedCards(previewState?.flippedCards ?? []);
  }, [block.id, previewState]);

  return (
    <div className="studio-fadein">
      {edit && (
        <div className="studio-blockbar">
          <span className="studio-bt" style={{ color: meta.c }}>
            <span className="studio-dot" style={{ background: meta.c }} />
            {meta.label}
          </span>
          <span className="studio-sp" />
          <button type="button" className="studio-mini" onClick={onMoveUp} aria-label="Move block up">
            ↑
          </button>
          <button type="button" className="studio-mini" onClick={onMoveDown} aria-label="Move block down">
            ↓
          </button>
          <button type="button" className="studio-mini" onClick={onDelete} aria-label="Delete block">
            🗑
          </button>
          {onAddBlock && (
            <button type="button" className="studio-addblock" onClick={(e) => onAddBlock(e)}>
              ＋ Add block
            </button>
          )}
        </div>
      )}

      <div>
        {block.type === "hook" &&
          (edit ? (
            <div className="studio-center">
              <div className="studio-kick">A curious question</div>
              <h1 className="studio-big">
                <textarea
                  className="studio-ef blk"
                  rows={2}
                  value={block.q}
                  onChange={(e) => onChange({ ...block, q: e.target.value })}
                  onFocus={() => onFocusField?.("the hook question", block.q)}
                />
              </h1>
              <p className="studio-lede" style={{ maxWidth: 560, margin: "14px auto 0" }}>
                <textarea
                  className="studio-ef blk"
                  rows={2}
                  value={block.sub}
                  onChange={(e) => onChange({ ...block, sub: e.target.value })}
                  onFocus={() => onFocusField?.("the hook subtitle", block.sub)}
                />
              </p>
              <p className="studio-editnote">
                Every dotted field is editable — type directly, or tap it and ask the assistant.
              </p>
            </div>
          ) : (
            <div className="studio-center">
              <div className="studio-kick">Opening move</div>
              <h1 className="studio-big">{block.q}</h1>
              <p className="studio-lede" style={{ maxWidth: 560, margin: "14px auto 0" }}>
                {block.sub}
              </p>
            </div>
          ))}

        {block.type === "study" &&
          (edit ? (
            <>
              <div className="studio-kick">
                <Ef
                  value={block.kind}
                  label="the section label"
                  onChange={(kind) => onChange({ ...block, kind })}
                  onFocusField={onFocusField}
                />
              </div>
              <h2 className="studio-mid">
                <Ef
                  value={block.title}
                  label="the heading"
                  block
                  onChange={(title) => onChange({ ...block, title })}
                  onFocusField={onFocusField}
                />
              </h2>
              <EfHtml
                value={block.html}
                label="the lesson text"
                onChange={(html) => onChange({ ...block, html })}
                onFocusField={onFocusField}
                onVocabClick={onVocabClick}
              />
              <div className="studio-srcbtn" style={{ display: "inline-flex" }}>
                📄{" "}
                <Ef
                  value={block.src.cite}
                  label="the source"
                  onChange={(cite) => onChange({ ...block, src: { ...block.src, cite } })}
                  onFocusField={onFocusField}
                />
                {" · p."}
                <Ef
                  value={String(block.src.page ?? "")}
                  label="the page"
                  onChange={(page) =>
                    onChange({
                      ...block,
                      src: { ...block.src, page: page.trim() ? Number(page) : undefined },
                    })
                  }
                  onFocusField={onFocusField}
                />
              </div>
              {block.src.page ? (
                <SourceCitationButton src={block.src} onOpen={onOpenSource} />
              ) : null}
              {block.check ? (
                <InlineCheckEditor
                  check={block.check}
                  onChange={(check) => onChange({ ...block, check })}
                  onRemove={() => onChange({ ...block, check: null })}
                  onFocusField={onFocusField}
                />
              ) : (
                <Eadd onClick={() => onChange({ ...block, check: normalizeInlineCheck(null) })}>
                  + Add an inline check to this lesson
                </Eadd>
              )}
            </>
          ) : (
            <>
              <div className="studio-kick">{block.kind}</div>
              <h2 className="studio-mid">{block.title}</h2>
              <StudyBodyHtml html={block.html} onVocabClick={onVocabClick} />
              <SourceCitationButton src={block.src} onOpen={onOpenSource} />
              {block.check ? (
                <PreviewCheck
                  stem={block.check.stem}
                  options={block.check.opts}
                  answer={block.check.ans}
                  explanation={block.check.exp}
                  selected={checkChoice}
                  onSelect={(index) => {
                    setCheckChoice(index);
                    emitPreview({ checkChoice: index });
                  }}
                />
              ) : null}
            </>
          ))}

        {block.type === "check" &&
          (edit ? (
            <>
              <div className="studio-kick">Check question</div>
              <div className="studio-qcheck">
                <Elabel>Concept</Elabel>
                <Ef
                  value={block.concept}
                  label="the concept"
                  onChange={(concept) => onChange({ ...block, concept })}
                  onFocusField={onFocusField}
                />
                <Elabel>Question</Elabel>
                <Ef
                  value={block.stem}
                  label="the question"
                  block
                  className="studio-qstem"
                  onChange={(stem) => onChange({ ...block, stem })}
                  onFocusField={onFocusField}
                />
                <OptionRows
                  options={block.opts}
                  answer={block.ans}
                  onChangeOptions={(opts) => onChange({ ...block, opts })}
                  onChangeAnswer={(ans) => onChange({ ...block, ans })}
                  onDeleteOption={(i) => {
                    const opts = block.opts.filter((_, idx) => idx !== i);
                    onChange({ ...block, opts, ans: Math.min(block.ans, Math.max(0, opts.length - 1)) });
                  }}
                  onFocusField={onFocusField}
                />
                <Eadd onClick={() => onChange({ ...block, opts: [...block.opts, "New option"] })}>+ option</Eadd>
                <Elabel>Explanation</Elabel>
                <Ef
                  value={block.exp}
                  label="the explanation"
                  block
                  onChange={(exp) => onChange({ ...block, exp })}
                  onFocusField={onFocusField}
                />
              </div>
            </>
          ) : (
            <>
              <div className="studio-kick">Check yourself</div>
              <PreviewCheck
                stem={block.stem}
                options={block.opts}
                answer={block.ans}
                explanation={block.exp}
                selected={checkChoice}
                onSelect={(index) => {
                  setCheckChoice(index);
                  emitPreview({ checkChoice: index });
                }}
              />
            </>
          ))}

        {block.type === "quiz" &&
          (edit ? (
            <>
              <div className="studio-kick">Prove it · mastery quiz</div>
              <p className="studio-editnote" style={{ marginTop: 0 }}>
                Each concept must be mastered by the student. Add questions so the retry loop has material.
              </p>
              {block.concepts.map((concept, conceptIndex) => (
                <div key={concept.id} className="studio-qcheck">
                  <div className="lab" style={{ color: "var(--rose)" }}>
                    Concept {conceptIndex + 1} ·{" "}
                    <Ef
                      value={concept.name}
                      label="the concept name"
                      onChange={(name) => {
                        const next = [...block.concepts];
                        next[conceptIndex] = { ...concept, name };
                        onChange({ ...block, concepts: next });
                      }}
                      onFocusField={onFocusField}
                    />
                  </div>
                  {concept.pool.map((item, poolIndex) => (
                    <div
                      key={quizQuestionId(concept, poolIndex)}
                      style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 11, margin: "8px 0" }}
                    >
                      <Ef
                        value={item.stem}
                        label="a quiz question"
                        block
                        className="studio-qstem"
                        onChange={(stem) => {
                          const next = [...block.concepts];
                          const pool = [...concept.pool];
                          pool[poolIndex] = { ...item, stem };
                          next[conceptIndex] = { ...concept, pool };
                          onChange({ ...block, concepts: next });
                        }}
                        onFocusField={onFocusField}
                      />
                      <OptionRows
                        options={item.opts}
                        answer={item.ans}
                        onChangeOptions={(opts) => {
                          const next = [...block.concepts];
                          const pool = [...concept.pool];
                          pool[poolIndex] = { ...item, opts };
                          next[conceptIndex] = { ...concept, pool };
                          onChange({ ...block, concepts: next });
                        }}
                        onChangeAnswer={(ans) => {
                          const next = [...block.concepts];
                          const pool = [...concept.pool];
                          pool[poolIndex] = { ...item, ans };
                          next[conceptIndex] = { ...concept, pool };
                          onChange({ ...block, concepts: next });
                        }}
                        onFocusField={onFocusField}
                      />
                      <Elabel>Why</Elabel>
                      <Ef
                        value={item.exp}
                        label="the explanation"
                        block
                        onChange={(exp) => {
                          const next = [...block.concepts];
                          const pool = [...concept.pool];
                          pool[poolIndex] = { ...item, exp };
                          next[conceptIndex] = { ...concept, pool };
                          onChange({ ...block, concepts: next });
                        }}
                        onFocusField={onFocusField}
                      />
                    </div>
                  ))}
                  <Eadd
                    onClick={() => {
                      const next = [...block.concepts];
                      next[conceptIndex] = {
                        ...concept,
                        pool: [...concept.pool, { stem: "New question?", opts: ["A", "B", "C", "D"], ans: 0, exp: "Why." }],
                      };
                      onChange({ ...block, concepts: next });
                    }}
                  >
                    + question
                  </Eadd>
                </div>
              ))}
              <Eadd
                onClick={() =>
                  onChange({
                    ...block,
                    concepts: [
                      ...block.concepts,
                      {
                        id: crypto.randomUUID(),
                        name: "New concept",
                        pool: [{ stem: "New question?", opts: ["A", "B", "C", "D"], ans: 0, exp: "Why." }],
                      },
                    ],
                  })
                }
              >
                + concept
              </Eadd>
            </>
          ) : (
            <div className="studio-grid">
              {block.concepts.map((concept) => (
                <div key={concept.id} className="studio-preview-card studio-grid">
                  <div className="studio-inline">
                    <span className="studio-pill">Concept set</span>
                    <strong>{concept.name}</strong>
                  </div>
                  {concept.pool.map((item, index) => {
                    const questionKey = quizQuestionId(concept, index);
                    const selected = quizChoices[questionKey];
                    return (
                      <div key={questionKey} className="studio-grid">
                        <h3 className="studio-blocktitle">{item.stem}</h3>
                        {item.opts.map((option, optionIndex) => {
                          const answered = selected !== undefined;
                          const correct = answered && optionIndex === item.ans;
                          const wrong = answered && selected === optionIndex && optionIndex !== item.ans;
                          return (
                            <button
                              key={`${questionKey}-${optionIndex}`}
                              type="button"
                              className="studio-choice"
                              data-active={selected === optionIndex}
                              data-correct={correct}
                              data-wrong={wrong}
                              onClick={() =>
                                setQuizChoices((current) => {
                                  const next = { ...current, [questionKey]: optionIndex };
                                  emitPreview({ quizChoices: next });
                                  return next;
                                })
                              }
                            >
                              <strong>{String.fromCharCode(65 + optionIndex)}</strong>
                              <span>{option}</span>
                            </button>
                          );
                        })}
                        {selected !== undefined ? (
                          <p className="studio-help">
                            {selected === item.ans ? "Correct." : "Try again."} {item.exp}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

        {block.type === "case" &&
          (edit ? (
            <>
              <div className="studio-kick" style={{ color: block.color }}>
                Case file
              </div>
              <h2 className="studio-mid">
                <Ef
                  value={block.name}
                  label="the case name"
                  block
                  onChange={(name) => onChange({ ...block, name })}
                  onFocusField={onFocusField}
                />
              </h2>
              <Elabel>Tag</Elabel>
              <Ef
                value={block.tag}
                label="the tag"
                onChange={(tag) => onChange({ ...block, tag })}
                onFocusField={onFocusField}
              />
              <Elabel>Evidence</Elabel>
              {block.rows.map(([left, right], rowIndex) => (
                <div key={rowIndex} className="studio-erow">
                  <Ef
                    value={left}
                    label="a field"
                    onChange={(v) => {
                      const rows = [...block.rows];
                      rows[rowIndex] = [v, right];
                      onChange({ ...block, rows });
                    }}
                    onFocusField={onFocusField}
                  />
                  <span className="ot">
                    <Ef
                      value={right}
                      label="a value"
                      onChange={(v) => {
                        const rows = [...block.rows];
                        rows[rowIndex] = [left, v];
                        onChange({ ...block, rows });
                      }}
                      onFocusField={onFocusField}
                    />
                  </span>
                  <button
                    type="button"
                    className="studio-rm"
                    onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== rowIndex) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <Eadd onClick={() => onChange({ ...block, rows: [...block.rows, ["Field", "Value"]] })}>+ row</Eadd>
              <Elabel>What it proved</Elabel>
              <Ef
                value={block.lesson}
                label="the takeaway"
                block
                onChange={(lesson) => onChange({ ...block, lesson })}
                onFocusField={onFocusField}
              />
            </>
          ) : (
            <>
              <div className="studio-kick" style={{ color: block.color }}>
                Case file · {block.tag}
              </div>
              <h2 className="studio-mid">{block.name}</h2>
              <div className="studio-casebig">
                {block.rows.map(([left, right], index) => (
                  <div key={index} className="studio-cbrow">
                    <div className="studio-cbk">{left}</div>
                    <div className="studio-cbv">{right}</div>
                  </div>
                ))}
              </div>
              {block.lesson ? <p className="studio-lede" style={{ fontSize: 15, marginTop: 14 }}>{block.lesson}</p> : null}
            </>
          ))}

        {block.type === "animation" &&
          (edit ? (
            <>
              <div className="studio-kick">See it · brain animation</div>
              <h2 className="studio-mid">
                <Ef
                  value={block.title}
                  label="the animation title"
                  block
                  onChange={(title) => onChange({ ...block, title })}
                  onFocusField={onFocusField}
                />
              </h2>
              {block.steps.map((step, index) => (
                <div key={`${step.region}-${index}`} className="studio-stepitem">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span className="studio-elabel" style={{ margin: 0 }}>
                      Step {index + 1}
                    </span>
                    <input
                      className="studio-regionsel"
                      value={step.region}
                      onChange={(e) => {
                        const steps = [...block.steps];
                        steps[index] = { ...step, region: e.target.value };
                        onChange({ ...block, steps });
                      }}
                    />
                    <button
                      type="button"
                      className="studio-mini"
                      style={{ marginLeft: "auto" }}
                      onClick={() => onChange({ ...block, steps: block.steps.filter((_, i) => i !== index) })}
                    >
                      🗑
                    </button>
                  </div>
                  <Ef
                    value={step.head}
                    label="the step heading"
                    block
                    className="studio-qstem"
                    onChange={(head) => {
                      const steps = [...block.steps];
                      steps[index] = { ...step, head };
                      onChange({ ...block, steps });
                    }}
                    onFocusField={onFocusField}
                  />
                  <Ef
                    value={step.text}
                    label="the step text"
                    block
                    onChange={(text) => {
                      const steps = [...block.steps];
                      steps[index] = { ...step, text };
                      onChange({ ...block, steps });
                    }}
                    onFocusField={onFocusField}
                  />
                </div>
              ))}
              <Eadd
                onClick={() =>
                  onChange({
                    ...block,
                    steps: [...block.steps, { region: "cortex", head: "New step", text: "Describe this region." }],
                  })
                }
              >
                + step
              </Eadd>
            </>
          ) : (
            <>
              <div className="studio-kick">See it · this is a brain</div>
              <h2 className="studio-mid">{block.title}</h2>
              {block.steps.map((step, index) => (
                <div key={`${step.region}-${index}`} style={{ marginTop: index ? 14 : 0 }}>
                  <h4 className="studio-mid" style={{ fontSize: 19, marginBottom: 4 }}>
                    {step.head}
                  </h4>
                  <p className="studio-lede" style={{ fontSize: 15 }}>
                    {step.text}
                  </p>
                </div>
              ))}
            </>
          ))}

        {block.type === "flashcards" &&
          (edit ? (
            <>
              <div className="studio-kick">Flashcards</div>
              {block.cards.map(([front, back], index) => (
                <div key={index} className="studio-stepitem">
                  <Elabel>Front {index + 1}</Elabel>
                  <Ef
                    value={front}
                    label="a card front"
                    block
                    onChange={(v) => {
                      const cards = [...block.cards];
                      cards[index] = [v, back];
                      onChange({ ...block, cards });
                    }}
                    onFocusField={onFocusField}
                  />
                  <Elabel>Back</Elabel>
                  <Ef
                    value={back}
                    label="a card back"
                    block
                    onChange={(v) => {
                      const cards = [...block.cards];
                      cards[index] = [front, v];
                      onChange({ ...block, cards });
                    }}
                    onFocusField={onFocusField}
                  />
                  <button
                    type="button"
                    className="studio-mini"
                    style={{ marginTop: 6 }}
                    onClick={() => onChange({ ...block, cards: block.cards.filter((_, i) => i !== index) })}
                  >
                    🗑 remove
                  </button>
                </div>
              ))}
              <Eadd onClick={() => onChange({ ...block, cards: [...block.cards, ["Front", "Back"]] })}>+ card</Eadd>
            </>
          ) : (
            <div className="studio-cardstack">
              {block.cards.map(([front, back], index) => {
                const flipped = flippedCards.includes(index);
                return (
                  <button
                    key={`${front}-${index}`}
                    type="button"
                    className="studio-flashcard"
                    onClick={() =>
                      setFlippedCards((current) =>
                        current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
                      )
                    }
                  >
                    <div className="studio-flashcard-face">
                      <span className="studio-flashcard-kicker">{flipped ? "Answer" : "Prompt"}</span>
                      <h3 className="studio-blocktitle">{flipped ? back : front}</h3>
                      <p className="studio-help">{flipped ? "Tap to show the front again." : "Tap to flip the card."}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}

        {block.type === "reflection" &&
          (edit ? (
            <>
              <div className="studio-kick">Reflection</div>
              <Elabel>Prompt (no right answer)</Elabel>
              <Ef
                value={block.prompt}
                label="the reflection prompt"
                block
                className="studio-qstem"
                onChange={(prompt) => onChange({ ...block, prompt })}
                onFocusField={onFocusField}
              />
            </>
          ) : (
            <>
              <div className="studio-kick">Reflection</div>
              <h2 className="studio-mid">{block.prompt}</h2>
            </>
          ))}

        {block.type === "image" &&
          (edit ? (
            <>
              <div className="studio-kick">Image</div>
              <ImageDropZone
                courseId={courseId}
                src={block.src}
                alt={block.alt}
                onUploaded={(url) => onChange({ ...block, src: url.trim() ? url : null })}
              />
              <Elabel>Caption</Elabel>
              <Ef
                value={block.caption}
                label="the caption"
                block
                onChange={(caption) => onChange({ ...block, caption })}
                onFocusField={onFocusField}
              />
            </>
          ) : (
            <>
              <div className="studio-kick">Figure</div>
              {block.src ? (
                <img className="studio-imgfig" src={block.src} alt={block.alt} />
              ) : (
                <div className="studio-imgdrop">No image</div>
              )}
              <p className="studio-lede" style={{ fontSize: 14, marginTop: 10 }}>
                {block.caption}
              </p>
            </>
          ))}
      </div>
    </div>
  );
}
