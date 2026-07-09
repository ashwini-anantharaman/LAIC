import { useEffect, useRef, useState } from "react";
import type { ContentPolicy, StudioCourseData } from "../../learning/types";
import { isSkeletonStudio } from "../../learning/load-studio";
import { friendlyGenerationError } from "../../../shared/studio/skeleton";
import type { RAGSource } from "../../types";
import { AgentAPI, DataAPI } from "../../lib/api";
import { useApp } from "../../store/AppContext";
import "./studio.css";

const POLICY_LABEL: Record<ContentPolicy, string> = {
  strict: "Strict — source only",
  generate: "Allow supplementary generation",
  open: "Allow open questions",
};

const POLICY_DESC: Record<ContentPolicy, string> = {
  strict:
    "Content and the tutor stay strictly within the uploaded source. Off-topic questions are declined and redirected.",
  generate:
    "The platform may add helpful extra explanations, examples and questions beyond the exact source.",
  open:
    "The student chatbot may answer questions beyond the source, noting when it goes further.",
};

const SRC_ICON: Record<string, string> = {
  PDF: "📄",
  DOCX: "📝",
  Video: "🎬",
  URL: "🔗",
  Text: "📃",
  Audio: "🎧",
  File: "📎",
};

const SRC_STATUS_LABEL: Record<RAGSource["status"], string> = {
  ready: "Ready",
  indexing: "Indexing…",
  transcribing: "Transcribing…",
  error: "Failed",
};

function sourceReady(sources: RAGSource[]) {
  return sources.some((s) => s.status === "ready");
}

type Props = {
  policy: ContentPolicy;
  onPolicyChange: (p: ContentPolicy) => void;
  onComplete: (studio: StudioCourseData) => void;
  onBack: () => void;
  initialStep?: number;
  resumeGenerate?: boolean;
  autoStartGenerate?: boolean;
};

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

export function StudioOnboarding({
  policy,
  onPolicyChange,
  onComplete,
  onBack,
  initialStep = 1,
  resumeGenerate = false,
  autoStartGenerate = false,
}: Props) {
  const { courseId, ragSources, uploadRAGFile, addRAGUrl, removeRAGSource, showToast, refreshSources } = useApp();
  const [step, setStep] = useState(initialStep);
  const [genPhase, setGenPhase] = useState(0);
  const [genWaiting, setGenWaiting] = useState(false);
  const [genMessage, setGenMessage] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [inputMode, setInputMode] = useState<"link" | "text" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canContinue = ragSources.length > 0;
  const hasReadySource = sourceReady(ragSources);
  const failedSources = ragSources.filter((s) => s.status === "error");
  const indexingSources = ragSources.filter((s) => s.status === "indexing" || s.status === "transcribing");

  useEffect(() => {
    if (!resumeGenerate || !courseId) return;
    setStep(3);
    setGenPhase(3);
    setGenWaiting(true);
    setGenMessage("Resuming course generation…");

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const status = await AgentAPI.studioGenerateStatus(courseId);
          if (status.progress) setGenMessage(status.progress);
          if (status.status === "done") {
            const studio =
              status.studio ?? (await DataAPI.getStudio(courseId).catch(() => null));
            if (studio?.pages?.length && !isSkeletonStudio(studio)) {
              onComplete(studio);
              return;
            }
          }
          if (status.status === "error") {
            setGenError(friendlyGenerationError(status.error ?? "Generation failed"));
            showToast(status.error ?? "Generation failed");
            setGenWaiting(false);
            return;
          }
          const saved = await DataAPI.getStudio(courseId).catch(() => null);
          if (saved?.pages?.length && !isSkeletonStudio(saved)) {
            onComplete(saved);
            return;
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [resumeGenerate, courseId, onComplete, showToast]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !courseId) return;
    for (const file of Array.from(files)) {
      try {
        await uploadRAGFile(file);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Upload failed");
      }
    }
    await refreshSources();
  };

  const handleAddUrl = async () => {
    if (!courseId) return;
    const url = urlInput.trim();
    if (!url) return;
    try {
      await addRAGUrl(url, /youtube\.com|youtu\.be/i.test(url) ? "youtube" : "link");
      setUrlInput("");
      setInputMode(null);
      await refreshSources();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not add link");
    }
  };

  const handleAddText = async () => {
    if (!courseId) return;
    const text = textInput.trim();
    if (!text) return;
    try {
      await DataAPI.pasteSourceText(courseId, text);
      setTextInput("");
      setInputMode(null);
      await refreshSources();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not add text");
    }
  };

  const handleRecord = async () => {
    if (!courseId) return;
    try {
      await DataAPI.registerSource(courseId, `Lecture recording (${20 + Math.floor(Math.random() * 40)}:00)`, "Audio");
      await refreshSources();
      setInputMode(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not add recording");
    }
  };

  const runGenerate = async () => {
    if (!courseId) return;
    const onFail = () => setStep(autoStartGenerate ? 3 : 2);
    setGenError(null);
    setGenPhase(0);
    setGenWaiting(false);
    setGenMessage("Starting generation…");
    const timer = window.setInterval(() => {
      setGenPhase((p) => {
        const next = Math.min(p + 1, 3);
        if (next >= 3) setGenWaiting(true);
        return next;
      });
    }, 520);

    const stop = () => clearInterval(timer);

    try {
      await AgentAPI.generateStudioCourse(
        courseId,
        policy,
        "Build a structured course from the uploaded sources. If the source is a multi-chapter textbook, preserve its chapter structure with one module per chapter."
      );

      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        const status = await AgentAPI.studioGenerateStatus(courseId);
        if (status.progress) setGenMessage(status.progress);
        if (status.moduleIndex && status.moduleTotal) {
          setGenPhase(Math.min(3, Math.floor((status.moduleIndex / status.moduleTotal) * 3)));
        }

        if (status.status === "done") {
          const studio =
            status.studio ??
            (await DataAPI.getStudio(courseId).catch(() => null));
          stop();
          setGenPhase(3);
          if (!studio?.pages?.length || isSkeletonStudio(studio)) {
            const msg = friendlyGenerationError(
              "Generation finished but returned placeholder content only — check API credits and sources."
            );
            setGenError(msg);
            showToast(msg);
            setGenWaiting(false);
            return;
          }
          onComplete(studio);
          return;
        }

        if (status.status === "error") {
          stop();
          const msg = friendlyGenerationError(status.error ?? "Generation failed");
          setGenError(msg);
          showToast(msg);
          setGenWaiting(false);
          return;
        }

        if (status.status === "idle") {
          const saved = await DataAPI.getStudio(courseId).catch(() => null);
          if (saved?.pages?.length && !isSkeletonStudio(saved)) {
            stop();
            setGenPhase(3);
            onComplete(saved);
            return;
          }
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      stop();
      showToast("Generation is taking longer than expected — check back in a minute or retry.");
      onFail();
    } catch (e) {
      stop();
      const msg = friendlyGenerationError(e instanceof Error ? e.message : "Generation failed");
      setGenError(msg);
      showToast(msg);
      setGenWaiting(false);
    }
  };

  useEffect(() => {
    if (!autoStartGenerate || !courseId) return;
    setStep(3);
    void (async () => {
      await refreshSources();
      void runGenerate();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when opened from skeleton banner
  }, [autoStartGenerate, courseId]);

  return (
    <div className="studio-root">
      <div className="studio-onb">
        <div className="studio-onb-in">
          <div className="studio-brand">
            <span className="o">🦉</span> Owlwise Studio
          </div>

          <div className="studio-onb-steps">
            {[["Sources", 1], ["Content policy", 2], ["Generate", 3]].map(([label, n]) => (
              <div key={label} className={`studio-onb-step${step === n ? " on" : ""}`}>
                <span className="n">{n}</span>
                {label}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="studio-onb-card">
              <div className="studio-onb-kick">New course · add sources</div>
              <h1>Add your source material</h1>
              <p className="studio-onb-sub">
                PDFs, Word docs, slides, spreadsheets, images, audio, video, web &amp; YouTube links, or pasted text.
                Owlwise reads them all and builds the course.
              </p>
              <div
                className="studio-drop"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleFiles(e.dataTransfer.files);
                }}
              >
                <div className="ic">
                  <UploadIcon />
                </div>
                <div className="studio-drop-title">Add source material</div>
                <div className="studio-drop-hint">
                  click to add or drop files · PDF · Word · slides · sheets · images · audio · video
                </div>
                <button
                  type="button"
                  className="studio-browse"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                >
                  or browse files
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,image/*,audio/*,video/*"
                  style={{ display: "none" }}
                  onChange={(e) => void handleFiles(e.target.files)}
                />
              </div>
              <div className="studio-srcmethods">
                <button
                  type="button"
                  className={`studio-srcm${inputMode === "link" ? " on" : ""}`}
                  onClick={() => setInputMode(inputMode === "link" ? null : "link")}
                >
                  🔗 Add link / YouTube
                </button>
                <button
                  type="button"
                  className={`studio-srcm${inputMode === "text" ? " on" : ""}`}
                  onClick={() => setInputMode(inputMode === "text" ? null : "text")}
                >
                  📋 Paste text
                </button>
                <button type="button" className="studio-srcm" onClick={() => void handleRecord()}>
                  🎙 Record audio
                </button>
              </div>
              {inputMode === "link" && (
                <div className="studio-srcinput">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://…  or a YouTube link"
                  />
                  <button type="button" onClick={() => void handleAddUrl()}>
                    Add
                  </button>
                </div>
              )}
              {inputMode === "text" && (
                <div className="studio-srcinput">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    rows={3}
                    placeholder="Paste lecture notes or any text…"
                  />
                  <button type="button" onClick={() => void handleAddText()}>
                    Add
                  </button>
                </div>
              )}
              <div className="studio-srclist">
                {ragSources.map((s: RAGSource) => (
                  <div key={s.id} className={`studio-srcitem${s.status === "error" ? " err" : ""}`}>
                    <div className="si-ic">{SRC_ICON[s.type] ?? "📎"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="studio-srcname">{s.name}</div>
                      <div className="studio-srckind">
                        {s.type} · <span className={`studio-srcstatus ${s.status}`}>{SRC_STATUS_LABEL[s.status]}</span>
                      </div>
                      {s.status === "error" && s.detail ? (
                        <div className="studio-srcerr">{s.detail}</div>
                      ) : null}
                    </div>
                    <button type="button" className="studio-tbtn" onClick={() => void removeRAGSource(s.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="studio-srchint">
                {failedSources.length > 0
                  ? "One or more sources failed — remove them, fix the issue, and re-upload before generating."
                  : indexingSources.length > 0
                    ? "Sources are still indexing — wait until at least one shows Ready."
                    : hasReadySource
                      ? "At least one source is ready. Images are placed into matching lessons on generate."
                      : canContinue
                        ? "Waiting for sources to finish indexing…"
                        : "Add at least one source to continue."}
              </p>
              <div className="studio-onb-actions">
                <button type="button" className="studio-btn ghost" onClick={onBack}>
                  ← Classrooms
                </button>
                <button
                  type="button"
                  className="studio-btn primary"
                  disabled={!canContinue || !hasReadySource || indexingSources.length > 0}
                  onClick={() => setStep(2)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="studio-onb-card">
              <div className="studio-onb-kick">Guardrails</div>
              <h1>How much freedom?</h1>
              <p className="studio-onb-sub">
                This controls what the platform generates and what the student chatbot may answer.
              </p>
              {(["strict", "generate", "open"] as ContentPolicy[]).map((p) => (
                <div
                  key={p}
                  className={`studio-pol${policy === p ? " on" : ""}`}
                  onClick={() => onPolicyChange(p)}
                  onKeyDown={(e) => e.key === "Enter" && onPolicyChange(p)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="rd" />
                  <div>
                    <div className="pt">{POLICY_LABEL[p]}</div>
                    <div className="pd">{POLICY_DESC[p]}</div>
                  </div>
                </div>
              ))}
              <div className="studio-onb-actions">
                <button type="button" className="studio-btn ghost" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button
                  type="button"
                  className="studio-btn primary"
                  onClick={() => {
                    setStep(3);
                    void runGenerate();
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="studio-onb-card" style={{ textAlign: "center" }}>
              {genError ? (
                <>
                  <div className="studio-onb-kick" style={{ color: "var(--warn, #f59e0b)" }}>
                    Generation failed
                  </div>
                  <h1>Could not build course</h1>
                  <p className="studio-onb-sub" style={{ color: "var(--text)" }}>
                    {genError}
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="studio-btn primary"
                      onClick={() => {
                        setGenError(null);
                        void refreshSources();
                        setStep(1);
                      }}
                    >
                      Back to sources
                    </button>
                    <button type="button" className="studio-btn" onClick={() => setStep(2)}>
                      Back to policy
                    </button>
                    <button type="button" className="studio-btn" onClick={() => void runGenerate()}>
                      Retry
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="studio-onb-kick">Generating</div>
                  <h1>Building your course</h1>
                  <p className="studio-onb-sub">
                    Reading {ragSources.length} source{ragSources.length !== 1 ? "s" : ""}, grouping concepts, drafting blocks
                    {ragSources.some((s) => s.type === "File") ? ", and placing your images" : ""}.
                  </p>
                  <div className="studio-proc">
                    {[
                      "Ingesting sources (docs, media, links)…",
                      "Grouping into pages & drafting blocks…",
                      "Building checks & mastery quizzes…",
                      "Placing images into matching lessons…",
                    ].map((label, i) => (
                      <div key={label} className={`studio-proc-line${genPhase >= i ? " on" : ""}`}>
                        <span className="tk" />
                        {label}
                      </div>
                    ))}
                  </div>
                  {genWaiting && (
                    <p className="studio-onb-sub" style={{ marginTop: 18, marginBottom: 0 }}>
                      {genMessage ||
                        "Building modules from your sources — this can take a few minutes. Please keep this tab open."}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
