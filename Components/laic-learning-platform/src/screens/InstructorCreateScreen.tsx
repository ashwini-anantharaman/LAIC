import { useState, useEffect } from "react";
import {
  FileText, Upload, Plus, Search, Check, X, ArrowRight,
  HelpCircle, Zap, Star, Video, Link2, Sparkles,
  GitBranch, Youtube, RefreshCw, AlertCircle,
  Layers, BookMarked, Mic, SlidersHorizontal, Brain, MessageCircle,
} from "lucide-react";
import type { ContentMode, BlockType, ContentBlock } from "../types";
import { CONTENT_MODES } from "../constants/ui";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { formatSourceDetail, formatError } from "../lib/format";
import { extractYouTubeId } from "../lib/youtube";
import {
  BLOCK_PALETTE,
  InstructorBlockChrome,
} from "../lib/content-blocks";

type CreateStep = "sources" | "structure" | "build" | "done";

const FILE_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.mp3,.wav,.m4a,.webm";

const SOURCE_TYPES = [
  { icon: FileText, label: "PDF / DOCX", sub: "docs, slides", kind: "file" as const, accept: ".pdf,.doc,.docx,.ppt,.pptx" },
  { icon: Youtube, label: "Video link", sub: "auto-transcribed", kind: "url" as const, urlType: "Video", placeholder: "Paste a YouTube or video URL…" },
  { icon: Link2, label: "Article / URL", sub: "web embed", kind: "url" as const, urlType: "URL", placeholder: "Paste an article or web page URL…" },
  { icon: SlidersHorizontal, label: "Quizlet", sub: "import set", kind: "url" as const, urlType: "Quizlet", placeholder: "Paste a Quizlet set URL…" },
  { icon: GitBranch, label: "Google Drive", sub: "share link", kind: "url" as const, urlType: "Drive", placeholder: "Paste a public Google Drive share link…" },
  { icon: Mic, label: "Notes / Audio", sub: "voice upload", kind: "file" as const, accept: ".txt,.md,.mp3,.wav,.m4a,.webm" },
];

const CORE_LESSON_TYPES: BlockType[] = ["Text", "Animation", "MCQ", "Flashcard"];

type PendingBlockInput = { type: "Video"; url: string; start: string; end: string };

export function InstructorCreateScreen() {
  const {
    createStep, setCreateStep, currentModuleIndex, setCurrentModuleIndex,
    modules, addBlockToModule, addBlocksToModule, removeBlockFromModule, reorderModules,
    ragSources, ragStatus, uploadRAGFile, addRAGUrl, removeRAGSource, instructor, setDefaultModes,
    publishCourse, setScreen, courseId, courseTitle, prerequisiteGraph, draftCourseStructure, syncCourse,
    refreshRagStatus, generateAllModules, refreshDashboard,
    pendingBuild, clearPendingBuild, duplicateModule,
  } = useApp();
  const [activeTab, setActiveTab] = useState<"ai-draft" | "rag">("ai-draft");
  const [dragOver, setDragOver] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [ragQuery, setRagQuery] = useState("");
  const [ragAnswer, setRagAnswer] = useState<{ answer: string; citations: string; ragChunks?: number } | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [urlEntry, setUrlEntry] = useState<{ type: string; placeholder: string } | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [generatingBlock, setGeneratingBlock] = useState<BlockType | null>(null);
  const [pendingInput, setPendingInput] = useState<PendingBlockInput | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [enteringBuild, setEnteringBuild] = useState(false);
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const [dragModuleIdx, setDragModuleIdx] = useState<number | null>(null);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [lessonStatus, setLessonStatus] = useState("");
  const [lessonWarning, setLessonWarning] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateAllStatus, setGenerateAllStatus] = useState("");
  const [generateAllSummary, setGenerateAllSummary] = useState<string | null>(null);
  const enabledModes = instructor.defaultModes;

  const currentModule = modules[currentModuleIndex];

  const generateFullLesson = async () => {
    if (!courseId || !currentModule) throw new Error("No course or module loaded");
    setBlockError(null);
    setLessonWarning(null);
    setPendingInput(null);
    setGeneratingLesson(true);
    setLessonStatus("Planning lesson from your sources…");
    try {
      const result = await Agents.conceptTutor.generateModuleLesson(
        courseId,
        currentModule.name,
        {
          chapter: currentModule.chapter,
          prereqs: currentModule.prereqs,
        }
      );
      if (result.meta?.warnings?.length || result.meta?.ragChunks !== undefined) {
        const parts: string[] = [];
        if (result.meta.ragChunks !== undefined) {
          parts.push(
            result.meta.ragChunks > 0
              ? `Used ${result.meta.ragChunks} source chunk(s) from: ${(result.meta.ragCitations ?? []).join(", ") || "your uploads"}.`
              : "No indexed source chunks were retrieved — upload course material and wait until sources show Ready."
          );
        }
        if (result.meta.warnings?.length) parts.push(...result.meta.warnings);
        setLessonWarning(parts.join(" "));
      }
      setLessonStatus("Saving Text, 3D Animation, MCQ & Flashcards…");
      const rawBlocks = Array.isArray(result.blocks) ? result.blocks : [];
      if (rawBlocks.length === 0) {
        throw new Error("Lesson generation returned no blocks — try again.");
      }
      const blocks: ContentBlock[] = rawBlocks.map((b) => ({
        id: "",
        type: b.type as BlockType,
        label: b.label,
        title: b.title,
        content: b.content,
      }));
      await addBlocksToModule(currentModuleIndex, blocks);
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "Failed to generate lesson");
      throw e;
    } finally {
      setGeneratingLesson(false);
      setLessonStatus("");
    }
  };

  const pickAndUpload = (accept?: string) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setUploadError(null);
      setUploading(true);
      try {
        await uploadRAGFile(f);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const submitUrl = async () => {
    const url = urlValue.trim();
    if (!url || !urlEntry) return;
    if (urlEntry.type === "Video" && !extractYouTubeId(url)) {
      setUploadError("Invalid YouTube link — paste a full watch URL (youtube.com/watch?v=…) with an 11-character video id.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      await addRAGUrl(url, urlEntry.type);
      setUrlValue("");
      setUrlEntry(null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Failed to add URL");
    } finally {
      setUploading(false);
    }
  };

  const handleSourceTypeClick = (s: (typeof SOURCE_TYPES)[number]) => {
    setUploadError(null);
    if (s.kind === "file") {
      pickAndUpload(s.accept);
    } else {
      setUrlEntry({ type: s.urlType, placeholder: s.placeholder });
      setUrlValue("");
    }
  };

  const toggleMode = (m: ContentMode) => setDefaultModes({ ...enabledModes, [m]: !enabledModes[m] });

  useEffect(() => {
    if (createStep !== "sources" || !courseId) return;
    refreshRagStatus().catch(() => {});
  }, [createStep, courseId, refreshRagStatus]);

  useEffect(() => {
    if (createStep !== "build") return;
    let cancelled = false;
    setEnteringBuild(true);
    syncCourse()
      .catch(() => {})
      .finally(() => { if (!cancelled) setEnteringBuild(false); });
    return () => { cancelled = true; };
  }, [createStep, syncCourse]);

  const enterBuildStep = () => {
    setBlockError(null);
    setPendingInput(null);
    setCurrentModuleIndex(0);
    setCreateStep("build");
  };

  const runGenerateAll = async () => {
    setGeneratingAll(true);
    setGenerateAllSummary(null);
    setGenerateAllStatus("Starting generation…");
    try {
      const result = await generateAllModules((done, total, name) => {
        setGenerateAllStatus(
          name
            ? `Generating module ${done + 1} of ${total}: “${name}”… (text, animation, video, quiz, test, flashcards)`
            : `Finishing up… (${total}/${total})`
        );
      });
      const parts: string[] = [];
      if (result.generated) parts.push(`${result.generated} module(s) generated`);
      if (result.skipped) parts.push(`${result.skipped} already built (skipped)`);
      if (result.failed.length) {
        parts.push(`${result.failed.length} failed: ${result.failed.map((f) => f.name).join(", ")} — open those modules and retry.`);
      }
      setGenerateAllSummary(parts.join(" · "));
      if (result.generated > 0 || result.skipped > 0) {
        setCurrentModuleIndex(0);
        setCreateStep("build");
      }
    } catch (e) {
      setGenerateAllSummary(e instanceof Error ? e.message : "Course generation failed");
    } finally {
      setGeneratingAll(false);
      setGenerateAllStatus("");
    }
  };

  const generateAndAddBlock = async (
    type: BlockType,
    label: string,
    extra?: { description?: string; url?: string; start?: string; end?: string }
  ) => {
    if (!courseId || !currentModule) throw new Error("No course or module loaded");
    setBlockError(null);
    setAddingBlock(true);
    setGeneratingBlock(type);
    try {
      let content: Record<string, unknown> = {};
      let title = label;

      switch (type) {
        case "Reflection": {
          const res = await Agents.conceptTutor.generateReflectionPrompt(courseId, currentModule.name);
          content = res;
          title = "Reflection prompt";
          break;
        }
        case "Test": {
          const res = await Agents.conceptTutor.generateTest(courseId, currentModule.name);
          content = res as unknown as Record<string, unknown>;
          title = res.title;
          break;
        }
        case "Video": {
          const url = extra?.url?.trim() ?? "";
          if (!url) throw new Error("Enter a video URL");
          content = {
            url,
            startSeconds: Number(extra?.start) || 0,
            endSeconds: extra?.end ? Number(extra.end) : undefined,
          };
          title = "Video clip";
          break;
        }
      }

      await addBlockToModule(currentModuleIndex, { id: "", type, label, title, content });
      setPendingInput(null);
    } finally {
      setAddingBlock(false);
      setGeneratingBlock(null);
    }
  };

  const handleAddBlock = async (type: BlockType, label: string) => {
    if (CORE_LESSON_TYPES.includes(type)) {
      try {
        await generateFullLesson();
      } catch {
        /* blockError set in generateFullLesson */
      }
      return;
    }
    if (type === "Video") {
      setPendingInput({ type: "Video", url: "", start: "0", end: "" });
      return;
    }
    try {
      await generateAndAddBlock(type, label);
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "Failed to generate block");
    }
  };

  useEffect(() => {
    if (!pendingBuild) return;
    const { moduleIndex, action } = pendingBuild;
    setCurrentModuleIndex(moduleIndex);
    clearPendingBuild();

    if (action.kind === "upload") {
      setCreateStep("sources");
      return;
    }
    if (action.kind === "structure") {
      setCreateStep("structure");
      return;
    }
    if (action.kind === "copy-module") {
      void duplicateModule(action.sourceIndex);
      return;
    }
    if (action.kind === "video") {
      setCreateStep("build");
      setPendingInput({ type: "Video", url: "", start: "0", end: "" });
      return;
    }
    if (action.kind === "full-lesson") {
      setCreateStep("build");
      window.setTimeout(() => {
        void generateFullLesson().catch(() => undefined);
      }, 0);
      return;
    }
    if (action.kind === "add-block") {
      setCreateStep("build");
      window.setTimeout(() => {
        void handleAddBlock(action.blockType, action.blockLabel).catch(() => undefined);
      }, 0);
    }
  }, [pendingBuild, clearPendingBuild, duplicateModule, setCreateStep, setCurrentModuleIndex]);

  const submitPendingInput = async () => {
    if (!pendingInput) return;
    try {
      await generateAndAddBlock("Video", "Video clip", {
        url: pendingInput.url,
        start: pendingInput.start,
        end: pendingInput.end,
      });
    } catch (e) {
      setBlockError(e instanceof Error ? e.message : "Failed to add block");
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await syncCourse();
      await publishCourse();
      await refreshDashboard();
      setScreen("instructor-course");
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Failed to publish course");
    } finally {
      setPublishing(false);
    }
  };

  const chapterCount = new Set(modules.map((m) => m.chapter).filter(Boolean)).size;
  const canGenerateStructure = (ragStatus?.chunkCount ?? 0) > 0;
  const generateDisabledReason =
    uploading ? "Finish uploading first"
    : !ragStatus ? "Checking source status…"
    : ragStatus.chunkCount === 0 && ragStatus.indexingCount > 0
      ? "Sources are still indexing — this can take up to a minute"
    : ragStatus.chunkCount === 0 && ragStatus.errorCount > 0
      ? "Fix failed sources above, then try again"
    : ragStatus.chunkCount === 0
      ? "Upload at least one source and wait until it shows Ready"
    : null;

  const currentBlocks = modules[currentModuleIndex]?.blocks ?? [];
  const builtCount = modules.filter(m => m.blocks.length > 0).length;

  const WIZARD_STEPS = [
    { id: "sources",   label: "Add sources" },
    { id: "structure", label: "Review structure" },
    { id: "build",     label: "Build modules" },
    { id: "done",      label: "Publish" },
  ];
  const stepIdx = WIZARD_STEPS.findIndex(s => s.id === createStep);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Wizard progress bar */}
      <div className="border-b border-[#e8ddd6] bg-white px-8 py-3 shrink-0">
        <div className="flex items-center gap-0">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < stepIdx ? "bg-[#602424] text-white"
                    : i === stepIdx ? "bg-[#602424] text-white ring-4 ring-[#e8ddd6]"
                    : "bg-[#e8ddd6] text-[#62748e]"
                }`}>
                  {i < stepIdx ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs font-semibold ${i === stepIdx ? "text-white" : i < stepIdx ? "text-[#602424]" : "text-[#62748e]"}`}>
                  {s.label}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`w-10 h-0.5 mx-3 rounded-full transition-all ${i < stepIdx ? "bg-[#602424]" : "bg-[#e8ddd6]"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 1: Add Sources ── */}
      {createStep === "sources" && (
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="max-w-2xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-xl font-bold text-white">Add your source material</h1>
              <p className="text-sm text-[#62748e] mt-1">Everything you add feeds one shared AI — it drafts the full course structure from all your sources together.</p>
              {ragStatus && (
                <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  ragStatus.chunkCount > 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : ragStatus.indexingCount > 0
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-[#f8fafc] border-[#e8ddd6] text-[#62748e]"
                }`}>
                  {ragStatus.chunkCount > 0 ? (
                    <p><strong>RAG active:</strong> {ragStatus.chunkCount} indexed chunk{ragStatus.chunkCount === 1 ? "" : "s"} from {ragStatus.readyCount} source{ragStatus.readyCount === 1 ? "" : "s"}. Lesson generation and queries use this material.</p>
                  ) : ragStatus.indexingCount > 0 ? (
                    <p><strong>Indexing…</strong> {ragStatus.indexingCount} source(s) still processing. Wait for Ready before generating lessons.</p>
                  ) : ragStatus.errorCount > 0 ? (
                    <p><strong>Indexing failed</strong> on {ragStatus.errorCount} source(s). Remove and re-upload, or check the error detail below.</p>
                  ) : (
                    <p><strong>No indexed sources yet.</strong> Upload PDFs or URLs — content is chunked, embedded, and retrieved when you generate lessons or query sources.</p>
                  )}
                </div>
              )}
            </div>

            {/* Source type grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {SOURCE_TYPES.map(s => (
                <button key={s.label} type="button" disabled={uploading}
                  onClick={() => handleSourceTypeClick(s)}
                  className="flex items-center gap-3 px-4 py-3.5 bg-white border border-[#e8ddd6] rounded-2xl hover:border-[#602424] hover:bg-[#e8ddd6]/40 transition-all text-left group disabled:opacity-60">
                  <div className="w-8 h-8 rounded-xl bg-[#f8fafc] border border-[#e8ddd6] flex items-center justify-center shrink-0 group-hover:border-[#602424] group-hover:bg-[#e8ddd6] transition-colors">
                    <s.icon className="w-4 h-4 text-[#62748e] group-hover:text-[#602424] transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#314158]">{s.label}</p>
                    <p className="text-[10px] text-[#62748e]">{s.sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {urlEntry && (
              <div className="mb-4 flex gap-2">
                <input
                  type="url"
                  value={urlValue}
                  onChange={e => setUrlValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") submitUrl(); }}
                  placeholder={urlEntry.placeholder}
                  autoFocus
                  className="flex-1 px-4 py-2.5 text-sm border border-[#e8ddd6] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#602424]/30 focus:border-[#602424]"
                />
                <button type="button" onClick={submitUrl} disabled={uploading || !urlValue.trim()}
                  className="px-4 py-2.5 bg-[#602424] text-white text-sm font-semibold rounded-xl hover:bg-[#602424] disabled:opacity-60">
                  Add
                </button>
                <button type="button" onClick={() => { setUrlEntry(null); setUrlValue(""); }}
                  className="px-3 py-2.5 text-[#62748e] hover:text-[#62748e]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {(uploadError || uploading) && (
              <p className={`text-sm mb-4 ${uploadError ? "text-red-600" : "text-[#62748e] animate-pulse"}`}>
                {uploadError ?? "Uploading and indexing… (embedding may take up to a minute)"}
              </p>
            )}

            {/* Drop zone */}
            {ragSources.length === 0 ? (
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={async e => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (!f) return;
                  setUploadError(null);
                  setUploading(true);
                  try { await uploadRAGFile(f); } catch (err) {
                    setUploadError(err instanceof Error ? err.message : "Upload failed");
                  } finally { setUploading(false); }
                }}
                onClick={() => pickAndUpload(FILE_ACCEPT)}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all mb-6 ${
                  dragOver ? "border-[#602424] bg-[#e8ddd6]/60" : "border-[#e8ddd6] bg-[#f8fafc]/60 hover:border-[#602424] hover:bg-[#e8ddd6]/30"
                }`}>
                <Upload className="w-10 h-10 text-[#602424] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#314158] mb-1">Drop files here, or click to browse</p>
                <p className="text-xs text-[#62748e]">PDF · DOCX · PPTX · YouTube link · Article URL · up to 50 MB per file</p>
              </div>
            ) : (
              <div className="mb-6 space-y-2">
                <p className="text-xs font-bold text-[#62748e] uppercase tracking-wider mb-3">Sources added</p>
                {ragSources.map((src) => (
                  <div key={src.id} className="flex items-center gap-3 bg-white border border-[#e8ddd6] rounded-xl px-4 py-3">
                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${
                      src.status === "ready" ? "bg-green-50 border-green-200"
                        : src.status === "error" ? "bg-red-50 border-red-200"
                        : "bg-amber-50 border-amber-200"
                    }`}>
                      {src.status === "ready" ? <Check className="w-3.5 h-3.5 text-green-600" />
                        : src.status === "error" ? <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        : <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#314158] truncate">{src.name}</p>
                      <p className={`text-xs ${src.status === "error" ? "text-red-500" : "text-[#62748e]"}`}>
                        {src.type} · {formatSourceDetail(src.detail)} {src.status !== "ready" && src.status !== "error" && `(${src.status}…)`}
                      </p>
                    </div>
                    <button onClick={() => removeRAGSource(src.id)} className="text-[#602424] hover:text-red-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => pickAndUpload(FILE_ACCEPT)} disabled={uploading}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border border-dashed border-[#e8ddd6] rounded-xl text-xs text-[#62748e] hover:border-[#602424] hover:text-[#602424] transition-colors disabled:opacity-60">
                  <Plus className="w-3.5 h-3.5" /> Add another file
                </button>
              </div>
            )}

            {/* Secondary tabs: AI prompt + RAG */}
            <div className="flex border-b border-[#e8ddd6] mb-5">
              {([
                { id: "ai-draft" as const, label: "🧠 AI Draft prompt", icon: Brain },
                { id: "rag" as const, label: "💬 Query sources (RAG)", icon: MessageCircle },
              ]).map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
                    activeTab === tab.id ? "border-[#602424] text-[#9d5b8a]" : "border-transparent text-[#62748e] hover:text-[#314158]"
                  }`}>
                  <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "ai-draft" && (
              <div>
                <div className="bg-[#e8ddd6] border border-[#e8ddd6] rounded-2xl p-4 mb-4 flex gap-3">
                  <Sparkles className="w-5 h-5 text-[#602424] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-[#9d5b8a] mb-0.5">AI Course Drafter</p>
                    <p className="text-xs text-[#602424] leading-relaxed">Describe your teaching goals — AI will generate the full chapter + module structure from your uploaded sources.</p>
                  </div>
                </div>
                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Create a course from my uploaded sources. Break it into chapters for high-school students. Use a conversational style."
                  rows={4}
                  className="w-full border border-[#e8ddd6] rounded-2xl px-4 py-3 text-sm text-[#314158] placeholder:text-[#62748e] focus:outline-none focus:ring-2 focus:ring-[#602424]/20 focus:border-[#602424] resize-none transition-all" />
              </div>
            )}

            {activeTab === "rag" && (
              <div>
                <div className="flex gap-2 mb-3">
                  <input value={ragQuery} onChange={e => { setRagQuery(e.target.value); setRagAnswer(null); }}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && ragQuery.trim()) {
                        setRagLoading(true);
                        try {
                          setRagAnswer(await Agents.conceptTutor.queryRAG(ragSources, ragQuery, courseId!));
                        } catch (err) {
                          setRagAnswer({
                            answer: err instanceof Error ? err.message : "RAG query failed",
                            citations: "",
                            ragChunks: 0,
                          });
                        } finally {
                          setRagLoading(false);
                        }
                      }
                    }}
                    placeholder="What themes or arguments appear in my uploaded material?"
                    className="flex-1 border border-[#e8ddd6] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#602424]/20 focus:border-[#602424] transition-all placeholder:text-[#62748e]" />
                  <button onClick={async () => {
                    if (!ragQuery.trim()) return;
                    setRagLoading(true);
                    try {
                      setRagAnswer(await Agents.conceptTutor.queryRAG(ragSources, ragQuery, courseId!));
                    } catch (err) {
                      setRagAnswer({
                        answer: err instanceof Error ? err.message : "RAG query failed",
                        citations: "",
                        ragChunks: 0,
                      });
                    } finally {
                      setRagLoading(false);
                    }
                  }}
                    className="px-4 py-2.5 bg-[#602424] text-white text-sm font-bold rounded-xl hover:bg-[#602424] transition-colors flex items-center gap-2">
                    <Search className="w-3.5 h-3.5" /> Query
                  </button>
                </div>
                {ragAnswer && (
                  <div className="bg-white border border-[#e8ddd6] rounded-2xl p-4">
                    <p className="text-sm text-[#314158] leading-relaxed mb-2">{ragAnswer.answer}</p>
                    <p className="text-xs text-[#62748e]">
                      {ragAnswer.ragChunks !== undefined && `${ragAnswer.ragChunks} chunk(s) retrieved · `}
                      {ragAnswer.citations || "No citations"}
                    </p>
                  </div>
                )}
                {ragLoading && <p className="text-xs text-[#62748e] animate-pulse">Querying RAG namespace…</p>}
              </div>
            )}

            <div className="mt-8 flex flex-col items-end gap-3 pb-16">
              {draftError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 max-w-md text-right">
                  {draftError}
                </p>
              )}
              {!draftLoading && generateDisabledReason && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 max-w-md text-right">
                  {generateDisabledReason}
                </p>
              )}
              {draftLoading && draftStatus && (
                <p className="text-xs text-[#62748e] animate-pulse max-w-md text-right">{draftStatus}</p>
              )}
              <button
                type="button"
                disabled={draftLoading || uploading || !canGenerateStructure}
                onClick={async () => {
                  setDraftError(null);
                  setDraftLoading(true);
                  setDraftStatus(
                    canGenerateStructure
                      ? "Generating course structure with AI… (usually 20–40 seconds)"
                      : "Waiting for sources to finish indexing…"
                  );
                  try {
                    await draftCourseStructure(aiPrompt);
                  } catch (e) {
                    setDraftError(formatError(e, "Failed to generate course structure"));
                  } finally {
                    setDraftLoading(false);
                    setDraftStatus(null);
                  }
                }}
                className="px-6 py-3 text-white rounded-xl font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[#602424]/25"
                style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>
                {draftLoading ? (
                  <>Generating structure… <RefreshCw className="w-4 h-4 animate-spin" /></>
                ) : (
                  <>Generate course structure <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Review Structure ── */}
      {createStep === "structure" && (
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="max-w-2xl mx-auto px-8 py-8">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-[#602424]" />
              <span className="text-xs font-bold text-[#602424] uppercase tracking-wider">AI-generated from your sources</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-1">{courseTitle} — Course structure</h1>
            <p className="text-sm text-[#62748e] mb-5 leading-relaxed">Review the modules below. Rename any of them, then hit <strong>Start building</strong> to add content block-by-block.</p>

            {/* Prereq graph */}
            {prerequisiteGraph.length > 0 && (
            <div className="bg-white border border-[#e8ddd6] rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-3.5 h-3.5 text-[#602424]" />
                <span className="text-xs font-bold text-[#62748e]">AI-suggested prerequisite graph</span>
              </div>
              <div className="flex flex-wrap gap-y-2 gap-x-1 items-center text-xs">
                {prerequisiteGraph.map(({ from, to }, i) => (
                  <span key={`${from}-${to}`} className="flex items-center gap-1">
                    <span className="bg-[#e8ddd6] border border-[#e8ddd6] text-[#9d5b8a] px-2 py-0.5 rounded-full font-medium">{from}</span>
                    <ArrowRight className="w-3 h-3 text-[#62748e] shrink-0" />
                    <span className="bg-[#e8ddd6] border border-[#e8ddd6] text-[#9d5b8a] px-2 py-0.5 rounded-full font-medium">{to}</span>
                    {i < prerequisiteGraph.length - 1 && <span className="text-[#e8ddd6] ml-1">·</span>}
                  </span>
                ))}
              </div>
            </div>
            )}

            {[...new Set(modules.map(m => m.chapter || "General"))].map(chapter => (
              <div key={chapter} className="mb-5">
                <p className="text-xs font-bold text-[#62748e] uppercase tracking-wider mb-2 px-1">{chapter}</p>
                <div className="space-y-2">
                  {modules.filter(m => m.chapter === chapter).map((mod, modIdx) => {
                    const globalIdx = modules.findIndex(m => m.id === mod.id);
                    return (
                    <div key={mod.id}
                      draggable
                      onDragStart={() => setDragModuleIdx(globalIdx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => { if (dragModuleIdx !== null) { reorderModules(dragModuleIdx, globalIdx); setDragModuleIdx(null); } }}
                      className="flex items-center gap-3 bg-white border border-[#e8ddd6] rounded-xl px-4 py-3 hover:border-[#602424] transition-colors">
                      <span className="text-[#602424] select-none cursor-grab">⠿</span>
                      <div className="flex-1">
                        <input defaultValue={mod.name}
                          className="text-sm font-semibold text-[#314158] bg-transparent focus:outline-none focus:bg-[#e8ddd6] focus:px-2 rounded-lg transition-all w-full" />
                        {mod.prereqs.length > 0 && (
                          <p className="text-[10px] text-[#62748e] mt-0.5">Requires: {mod.prereqs.join(", ")}</p>
                        )}
                      </div>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${mod.blocks.length > 0 ? "bg-[#10b981]" : "bg-[#e8ddd6]"}`} />
                    </div>
                  );})}
                </div>
              </div>
            ))}

            {/* Mode toggles */}
            <div className="bg-[#f8fafc] border border-[#e8ddd6] rounded-2xl p-4 mb-8">
              <p className="text-xs font-bold text-[#62748e] mb-3 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#62748e]" />
                Default explanation modes — applies to all modules
              </p>
              <div className="flex gap-2">
                {(Object.entries(CONTENT_MODES) as [ContentMode, typeof CONTENT_MODES[ContentMode]][]).map(([id, { emoji, label }]) => (
                  <button key={id} onClick={() => toggleMode(id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                      enabledModes[id] ? "border-[#602424] bg-[#e8ddd6] text-[#9d5b8a]" : "border-[#e8ddd6] text-[#62748e] opacity-60"
                    }`}>
                    <span>{emoji}</span> {label}
                    {enabledModes[id] ? <span className="text-[10px]">✓</span> : null}
                  </button>
                ))}
              </div>
            </div>

            {(generateAllStatus || generateAllSummary) && (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                generatingAll
                  ? "bg-[#e8ddd6] border-[#e8ddd6] text-[#602424]"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              }`}>
                {generatingAll ? (
                  <p className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    {generateAllStatus}
                  </p>
                ) : (
                  <p>{generateAllSummary}</p>
                )}
                {generatingAll && (
                  <p className="text-xs mt-1 opacity-80">Each module takes ~30–60s. Keep this tab open.</p>
                )}
              </div>
            )}

            <div className="flex justify-between items-center gap-3">
              <button onClick={() => setCreateStep("sources")} disabled={generatingAll}
                className="px-5 py-2.5 bg-white border border-[#e8ddd6] text-[#314158] rounded-xl text-sm font-semibold hover:bg-[#f8fafc] transition-colors disabled:opacity-60">
                ← Back
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={enterBuildStep} disabled={enteringBuild || generatingAll}
                  className="px-5 py-2.5 bg-white border border-[#e8ddd6] text-[#314158] rounded-xl text-sm font-semibold hover:bg-[#f8fafc] transition-colors disabled:opacity-60">
                  {enteringBuild ? "Loading…" : "Build module-by-module"}
                </button>
                <button type="button" onClick={() => void runGenerateAll()} disabled={generatingAll || enteringBuild}
                  className="px-6 py-2.5 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-60 shadow-md shadow-[#602424]/25"
                  style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}>
                  {generatingAll ? (
                    <>Generating all modules… <RefreshCw className="w-4 h-4 animate-spin" /></>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate all modules <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Build Modules ── */}
      {createStep === "build" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Structure sidebar */}
          <aside className="w-56 border-r border-[#e8ddd6] bg-white flex flex-col shrink-0">
            <div className="px-4 py-4 border-b border-[#e8ddd6] shrink-0">
              <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-[#62748e] font-['Playfair_Display',serif]">Structure</p>
              <p className="text-xs text-[#62748e] mt-1">{modules.length} modules · {chapterCount || 1} chapters</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:none]">
              {[...new Set(modules.map(m => m.chapter || "General"))].map(chapter => (
                <div key={chapter} className="mb-4">
                  <p className="text-[10px] font-semibold text-[#62748e] uppercase tracking-wide px-2 mb-1.5">{chapter}</p>
                  {modules.filter(m => (m.chapter || "General") === chapter).map((m) => {
                    const i = modules.findIndex(x => x.id === m.id);
                    return (
                      <button key={m.id} onClick={() => setCurrentModuleIndex(i)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors mb-0.5 ${
                          currentModuleIndex === i
                            ? "bg-[#e8ddd6] text-[#9d5b8a] font-semibold border border-[#602424]"
                            : "text-[#57534e] hover:bg-[#fdf8f5] font-medium"
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.blocks.length > 0 ? "bg-[#22c55e]" : "bg-[#d6d3d1]"}`} />
                        <span className="truncate text-left">{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e8ddd6] bg-white shrink-0 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#62748e] font-medium">{modules[currentModuleIndex]?.chapter}</p>
                <h2 className="text-base font-bold text-white">{modules[currentModuleIndex]?.name}</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#62748e]">
                <span>{currentBlocks.length}/6 done</span>
                <div className="w-20 h-0.5 bg-[#e7e5e4] rounded-full overflow-hidden">
                  <div className="h-full bg-[#602424] rounded-full transition-all"
                    style={{ width: `${(currentBlocks.length / 6) * 100}%` }} />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {pendingInput && (
                <div className="max-w-lg mb-6 bg-white border-2 border-[#602424] rounded-2xl p-5">
                  <p className="text-sm font-bold text-white mb-1">Embed a video clip</p>
                  <p className="text-xs text-[#62748e] mb-3">Paste a YouTube URL and set start/end timestamps (seconds).</p>
                  <input
                    type="url"
                    value={pendingInput.url}
                    onChange={e => setPendingInput({ ...pendingInput, url: e.target.value })}
                    placeholder="https://youtube.com/watch?v=…"
                    className="w-full border border-[#e8ddd6] rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#602424]/20"
                  />
                  <div className="flex gap-3 mb-3">
                    <label className="flex-1 text-xs text-[#62748e]">
                      Start (sec)
                      <input type="number" min={0} value={pendingInput.start}
                        onChange={e => setPendingInput({ ...pendingInput, start: e.target.value })}
                        className="w-full mt-1 border border-[#e8ddd6] rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="flex-1 text-xs text-[#62748e]">
                      End (sec, optional)
                      <input type="number" min={0} value={pendingInput.end}
                        onChange={e => setPendingInput({ ...pendingInput, end: e.target.value })}
                        className="w-full mt-1 border border-[#e8ddd6] rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={submitPendingInput} disabled={addingBlock}
                      className="px-4 py-2 bg-[#602424] text-white text-sm font-semibold rounded-xl hover:bg-[#602424] disabled:opacity-60">
                      {addingBlock ? "Adding…" : "Add video"}
                    </button>
                    <button type="button" onClick={() => setPendingInput(null)} disabled={addingBlock}
                      className="px-4 py-2 text-sm text-[#62748e] hover:text-[#314158]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {currentBlocks.length === 0 && !pendingInput ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#e8ddd6] flex items-center justify-center mb-4">
                    {generatingLesson ? <RefreshCw className="w-6 h-6 text-[#602424] animate-spin" /> : <Sparkles className="w-6 h-6 text-[#602424]" />}
                  </div>
                  <p className="text-sm font-semibold text-[#62748e] mb-1">
                    {generatingLesson ? (lessonStatus || "Generating full lesson…") : "Module is empty"}
                  </p>
                  <p className="text-xs text-[#62748e] max-w-sm mb-4">
                    {generatingLesson
                      ? "AI is planning your lesson, then generating Text, Animation, MCQ, and Flashcards in parallel."
                      : "Generate all core blocks at once — text, animation, quiz, and flashcards — aligned to your sources."}
                  </p>
                  {!generatingLesson && (
                    <button
                      type="button"
                      onClick={() => generateFullLesson().catch(() => {})}
                      className="px-5 py-2.5 bg-[#602424] text-white text-sm font-bold rounded-xl hover:bg-[#602424] transition-all flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Generate full lesson
                    </button>
                  )}
                </div>
              ) : currentBlocks.length > 0 ? (
                <div className="max-w-[720px] mx-auto w-full">
                  <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest mb-4">
                    Lesson preview — drag to reorder
                  </p>
                  <div className="space-y-6">
                  {currentBlocks.map((block, i) => {
                    const palette = BLOCK_PALETTE.find(b => b.type === block.type)!;
                    return (
                      <InstructorBlockChrome
                        key={block.id || i}
                        block={block}
                        index={i}
                        palette={palette}
                        dragTarget={dragTarget}
                        onDragTarget={setDragTarget}
                        onRemove={() => removeBlockFromModule(currentModuleIndex, i)}
                        moduleName={currentModule?.name ?? "Module"}
                      />
                    );
                  })}
                  <button type="button" onClick={() => handleAddBlock("Text", "Text explanation")} disabled={addingBlock || generatingLesson}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-[#e8ddd6] rounded-xl text-xs text-[#62748e] hover:border-[#602424] hover:text-[#602424] transition-colors disabled:opacity-60">
                    <Plus className="w-3.5 h-3.5" /> Add block
                  </button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Module nav footer */}
            <div className="border-t border-[#e8ddd6] bg-white px-6 py-4 flex items-center justify-between shrink-0">
              <button onClick={() => setCurrentModuleIndex(m => Math.max(0, m - 1))} disabled={currentModuleIndex === 0}
                className="px-4 py-2 bg-white border border-[#e8ddd6] text-[#314158] rounded-xl text-sm font-semibold hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                ← Previous
              </button>
              <span className="text-xs text-[#62748e] font-medium">
                Module {currentModuleIndex + 1} of {modules.length}
              </span>
              {currentModuleIndex < modules.length - 1 ? (
                <button onClick={() => setCurrentModuleIndex(m => m + 1)}
                  className="px-4 py-2 bg-[#602424] text-white rounded-xl text-sm font-bold hover:bg-[#602424] transition-all flex items-center gap-2">
                  Next module <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={() => setCreateStep("done")}
                  className="px-4 py-2 bg-[#602424] text-white rounded-full text-sm font-bold hover:bg-[#602424] transition-all flex items-center gap-2">
                  <Check className="w-3.5 h-3.5" /> Finish & publish
                </button>
              )}
            </div>
          </div>

          {/* Block palette */}
          <aside className="w-56 border-l border-[#e8ddd6] bg-[#fdf8f5] flex flex-col shrink-0">
            <div className="px-4 py-4 border-b border-[#e8ddd6] shrink-0">
              <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-[#62748e] font-['Playfair_Display',serif]">Blocks</p>
              <p className="text-[10px] text-[#62748e] mt-1">Drag or click to add</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 [scrollbar-width:none]">
              {blockError && (
                <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mb-2">{blockError}</p>
              )}
              {lessonWarning && !generatingLesson && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2">{lessonWarning}</p>
              )}
              <button
                type="button"
                disabled={generatingLesson || addingBlock || enteringBuild}
                onClick={() => generateFullLesson().catch(() => {})}
                className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#602424] text-white rounded-full text-xs font-bold hover:bg-[#602424] transition-all disabled:opacity-60">
                {generatingLesson ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {lessonStatus || "Generating…"}</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Generate full lesson</>
                )}
              </button>
              {BLOCK_PALETTE.map(b => (
                <button key={b.type} type="button" disabled={addingBlock || generatingLesson || enteringBuild}
                  onClick={() => handleAddBlock(b.type, b.label)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 border border-[#e8ddd6] bg-white rounded-xl text-left transition-all active:scale-95 disabled:opacity-60 hover:border-[#602424] hover:bg-[#e8ddd6]/30">
                  <span className="text-sm shrink-0">{b.emoji || ""}{!b.emoji && <b.icon className="w-4 h-4 inline text-[#62748e]" />}</span>
                  <div>
                    <p className="text-xs font-semibold text-[#314158] leading-tight">
                      {generatingLesson && CORE_LESSON_TYPES.includes(b.type)
                        ? "Bundled…"
                        : generatingBlock === b.type
                        ? "Generating…"
                        : b.label}
                    </p>
                    <p className="text-[10px] text-[#62748e] leading-tight mt-0.5">{b.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {createStep === "done" && (
        <div className="flex-1 flex items-center justify-center bg-[#fdf8f5] p-8">
          <div className="bg-white border border-[#e8ddd6] rounded-3xl p-10 text-center max-w-md w-full">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">{courseTitle || "Your course"} is ready!</h2>
            <p className="text-sm text-[#62748e] mb-6 leading-relaxed">
              {modules.length} modules across {chapterCount || 1} chapter{chapterCount === 1 ? "" : "s"}. Students enrolled in LAIC will see this course immediately.
            </p>
            <div className="bg-[#f8fafc] border border-[#e8ddd6] rounded-2xl p-4 mb-6 text-left">
              {modules.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 py-1.5 border-b border-[#e8ddd6] last:border-0">
                  <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="text-sm text-[#314158] flex-1">{m.name}</span>
                  <span className="text-xs text-[#62748e]">{m.blocks.length} blocks</span>
                </div>
              ))}
            </div>
            {publishError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-4">{publishError}</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setCreateStep("build")} disabled={publishing}
                className="flex-1 py-2.5 bg-white border border-[#e8ddd6] text-[#314158] rounded-xl font-semibold text-sm hover:bg-[#f8fafc] transition-colors disabled:opacity-60">
                Edit course
              </button>
              <button type="button" onClick={handlePublish} disabled={publishing}
                className="flex-1 py-2.5 bg-[#602424] text-white rounded-xl font-bold text-sm hover:bg-[#602424] transition-colors disabled:opacity-60">
                {publishing ? "Publishing…" : "Publish to students"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
