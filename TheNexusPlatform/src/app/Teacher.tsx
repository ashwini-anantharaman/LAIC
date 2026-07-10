import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft, ArrowRight, Check, Upload, FileText, BookOpen,
  AlignLeft, Layers, Plus, X, Zap, Send, Star, RefreshCw, UserPlus,
  BarChart2, Trophy, Settings as SettingsIcon, LogOut, Copy,
} from "lucide-react";

import { OwlAnim, Shell, StatusBar, ObShell, Field, BRAND, type Nav } from "./shared";
import { api, type CreatedCourse, type IngestJobStatus, type Block, type BlockType, type StudentRecord, type TeacherBlock, type TeacherMeta, listMyOrgs } from "../services";
import { useBackendApi } from "../services/apiBase";
import type { OrgSummary } from "../services/platform";

const BLOCK_TYPES: { icon: React.ReactNode; label: BlockType }[] = [
  { icon: <FileText size={14} />, label: "Text" },
  { icon: <Layers size={14} />, label: "Flashcards" },
  { icon: <Zap size={14} />, label: "Animation" },
  { icon: <BookOpen size={14} />, label: "Quiz" },
];

type TeacherBlockType = TeacherBlock["type"];

const TEACHER_BLOCK_TYPES: { icon: React.ReactNode; label: TeacherBlockType; desc: string }[] = [
  { icon: <Layers size={14} />, label: "FlashcardSet", desc: "Multiple flashcards" },
  { icon: <BookOpen size={14} />, label: "MCQQuiz", desc: "Multiple-choice quiz" },
  { icon: <FileText size={14} />, label: "Flashcard", desc: "Single flashcard" },
];

function newFlashcard(): FlashcardItem {
  return { id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, front: "Term", back: "Definition" };
}

function newMCQ(): MCQItem {
  return { id: `mcq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, question: "Sample question?", choices: ["A", "B", "C", "D"], correctIndex: 1 };
}

function newTeacherBlock(type: TeacherBlockType, chapterIndex: number, position: number): TeacherBlock {
  if (type === "FlashcardSet") return { type, chapterIndex, position, cards: [newFlashcard(), newFlashcard()] };
  if (type === "MCQQuiz") return { type, chapterIndex, position, questions: [newMCQ()] };
  return { type, chapterIndex, position, cards: [newFlashcard()] };
}

// ── Teacher login ─────────────────────────────────────────────────────────────
export function TeacherLogin({ nav, onName }: { nav: Nav; onName: (n: string) => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await api.auth.signIn(email, pass, "teacher");
      onName(user.name);
      nav("t-ob1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-6 pt-4">
        <button onClick={() => nav("splash")} className="w-8 h-8 flex items-center justify-center -ml-1 mb-6">
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="flex flex-col items-start gap-1 mb-8">
          <OwlAnim className="w-20 h-20 object-contain mb-3" />
          <p className="text-[11px] font-semibold text-[#602424] uppercase tracking-widest">Educator</p>
          <h2 className="text-[28px] font-bold text-[#2c0312] tracking-tight leading-tight">Welcome, educator</h2>
          <p className="text-[14px] text-gray-500">Sign in to build and manage your courses</p>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@school.edu" />
          <Field label="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
          <button onClick={handleContinue} disabled={loading || !email || !pass} className="w-full py-4 rounded-2xl bg-[#602424] text-white text-[16px] font-semibold mt-2 active:scale-[0.98] transition-transform disabled:opacity-50">
            {loading ? "Signing in…" : "Continue"}
          </button>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>
      </div>
    </Shell>
  );
}

// ── Teacher onboarding 1: goals ─────────────────────────────────────────────
export function TeacherOb1({ nav, goals, onGoals }: { nav: Nav; goals: string; onGoals: (g: string) => void }) {
  return (
    <ObShell step={0} total={3} eyebrow="Question 1 of 3" onBack={() => nav("t-login")} onNext={() => nav("t-ob2")} nextLabel="Next">
      <h2 className="text-[24px] font-bold text-[#2c0312] tracking-tight mb-1">What are your goals for this class?</h2>
      <p className="text-[14px] text-gray-500 mb-6">Help our AI understand your teaching style and curriculum objectives.</p>
      <textarea
        value={goals}
        onChange={(e) => onGoals(e.target.value)}
        placeholder="e.g., Help students develop critical thinking in biology. I follow NGSS and want assessments that emphasize understanding over memorization…"
        className="w-full h-44 resize-none rounded-2xl border border-gray-200 bg-white p-4 text-[15px] outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 transition-all"
      />
    </ObShell>
  );
}

// ── Teacher onboarding 2: demographics ──────────────────────────────────────
function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] transition-all"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function TeacherOb2({
  nav, grade, subject, orgId, onGrade, onSubject, onOrgId,
}: {
  nav: Nav; grade: string; subject: string; orgId: string;
  onGrade: (g: string) => void; onSubject: (s: string) => void; onOrgId: (id: string) => void;
}) {
  const [size, setSize] = useState("");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  useEffect(() => {
    if (useBackendApi()) {
      listMyOrgs().then(setOrgs).catch(() => setOrgs([]));
    }
  }, []);

  return (
    <ObShell step={1} total={3} eyebrow="Question 2 of 3" onBack={() => nav("t-ob1")} onNext={() => nav("t-ob3")} nextLabel="Next" nextDisabled={!grade || !subject}>
      <h2 className="text-[24px] font-bold text-[#2c0312] tracking-tight mb-1">What is your class demographic?</h2>
      <p className="text-[14px] text-gray-500 mb-6">This helps us calibrate reading level and content complexity.</p>
      <div className="flex flex-col gap-4">
        {orgs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">Organization</label>
            <select
              value={orgId}
              onChange={(e) => onOrgId(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] transition-all"
            >
              <option value="">Select organization</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}
        <Select label="Grade Level(s)" value={grade} onChange={onGrade}
          options={["6th Grade", "7th Grade", "8th Grade", "9th Grade", "10th Grade", "11th Grade", "12th Grade", "College / University", "Mixed Grades"]} />
        <Select label="Subject" value={subject} onChange={onSubject}
          options={["Biology", "Chemistry", "Physics", "Mathematics", "English Literature", "History", "Computer Science", "Psychology", "Economics", "Other"]} />
        <Select label="Class Size" value={size} onChange={setSize}
          options={["1\u201310 students", "11\u201325 students", "26\u201340 students", "40+ students"]} />
        <Field label="Other details" placeholder="e.g., ESL learners, IEP accommodations…" />
      </div>
    </ObShell>
  );
}

// ── Teacher onboarding 3: challenge setup ───────────────────────────────────
export function TeacherOb3({ nav }: { nav: Nav }) {
  const [challengeName, setChallengeName] = useState("");
  const [date, setDate] = useState("");
  const [cert, setCert] = useState(false);
  const [format, setFormat] = useState<"remote" | "irl" | "">("");
  const [makeChallenge, setMakeChallenge] = useState<boolean | null>(null);

  return (
    <ObShell step={2} total={3} eyebrow="Question 3 of 3" onBack={() => nav("t-ob2")} onNext={() => nav("t-upload")} nextLabel="Continue" nextDisabled={makeChallenge === null}>
      <h2 className="text-[24px] font-bold text-[#2c0312] tracking-tight mb-1">Challenge setup</h2>
      <p className="text-[14px] text-gray-500 mb-6">Making a challenge for your students? If yes, fill in the fields.</p>
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          {([["Yes, challenge", true], ["No, just a course", false]] as const).map(([label, val]) => (
            <button key={label} onClick={() => setMakeChallenge(val)}
              className={`flex-1 py-3 rounded-xl border text-[13px] font-medium transition-all ${makeChallenge === val ? "border-[#602424] bg-[#f5ede8] text-[#602424]" : "border-gray-200 text-gray-600 bg-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {makeChallenge === true && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-4 overflow-hidden pt-1">
              <Field label="Challenge Name" value={challengeName} onChange={(e) => setChallengeName(e.target.value)} placeholder="Spring Biology Challenge" />
              <Field label="Date of Challenge" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-gray-700">Format</label>
                <div className="flex gap-3">
                  {(["remote", "irl"] as const).map((m) => (
                    <button key={m} onClick={() => setFormat(m)}
                      className={`flex-1 py-2.5 rounded-xl border text-[13px] font-medium transition-all ${format === m ? "border-[#602424] bg-[#f5ede8] text-[#602424]" : "border-gray-200 text-gray-600 bg-white"}`}>
                      {m === "irl" ? "In person" : "Remote"}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setCert(!cert)} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${cert ? "bg-[#602424] border-[#602424]" : "border-gray-300"}`}>
                  {cert && <Check size={12} className="text-white" />}
                </div>
                <span className="text-[14px] text-gray-700">Generate certificate on completion</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ObShell>
  );
}

// ── Upload materials ────────────────────────────────────────────────────────
const ACCEPTED = ".pdf,.txt,.md";

function UploadCard({ title, sub, files, uploading, onPick, tone }: {
  title: string; sub: string;
  files: { filename: string }[];
  uploading: boolean;
  onPick: () => void;
  tone: "green" | "blue";
}) {
  const toneCls = tone === "green" ? "bg-green-50 border-green-200 text-green-700" : "bg-blue-50 border-blue-200 text-blue-700";
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-3 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-900 text-[15px]">{title}</h3>
        <p className="text-[12px] text-gray-500 mt-0.5">{sub}</p>
      </div>
      <button onClick={onPick} disabled={uploading}
        className="border-2 border-dashed border-gray-200 rounded-xl p-5 flex flex-col items-center gap-2 hover:border-[#602424] hover:bg-[#fdf8f5] transition-all active:scale-[0.99] disabled:opacity-60">
        <Upload size={24} className="text-gray-400" />
        <p className="text-[13px] text-gray-500">{uploading ? "Uploading…" : "Tap to upload"}</p>
      </button>
      <div className="flex flex-wrap gap-1.5">
        <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-[11px] text-gray-600"><FileText size={12} />PDF</span>
        <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-[11px] text-gray-600"><AlignLeft size={12} />Plain text</span>
        <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-[11px] text-gray-600"><BookOpen size={12} />Markdown</span>
      </div>
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] border ${toneCls}`}>
              <span className="flex items-center gap-2"><FileText size={13} />{f.filename}</span>
              <Check size={13} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeacherUpload({
  nav, uploads, onAddUpload,
}: {
  nav: Nav;
  uploads: { uploadId: string; filename: string }[];
  onAddUpload: (u: { uploadId: string; filename: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    if (!api.teacher.uploadFile) {
      setError("Upload failed. Check your connection and try again.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const res = await api.teacher.uploadFile(file);
      onAddUpload({ uploadId: res.uploadId, filename: res.filename });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-5 pt-2 pb-6">
        <button onClick={() => nav("t-ob3")} className="w-8 h-8 flex items-center justify-center -ml-1 mb-3">
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <OwlAnim className="w-11 h-11 object-contain" />
          <div>
            <h2 className="text-[22px] font-bold text-[#2c0312] tracking-tight leading-tight">Upload materials</h2>
            <p className="text-[13px] text-gray-500">PDF, plain text, or markdown</p>
          </div>
        </div>
        <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        <div className="flex flex-col gap-4 flex-1">
          <UploadCard title="Course materials" sub="Grounds AI lessons in your curriculum"
            files={uploads} uploading={uploading} tone="green"
            onPick={() => inputRef.current?.click()} />
          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>
        <button onClick={() => nav("t-builder")} disabled={uploads.length === 0}
          className="w-full py-4 mt-4 rounded-2xl bg-[#602424] text-white text-[16px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50">
          <Zap size={17} /> Continue to builder
        </button>
      </div>
    </Shell>
  );
}

// ── Unit builder ────────────────────────────────────────────────────────────
export function TeacherBuilder({
  nav, teacherMeta, uploadIds, onCreated,
}: {
  nav: Nav;
  teacherMeta: TeacherMeta;
  uploadIds: string[];
  onCreated: (c: CreatedCourse) => void;
}) {
  const [chapters, setChapters] = useState<{ label: string; title: string }[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [teacherBlocks, setTeacherBlocks] = useState<TeacherBlock[]>([]);
  const [generating, setGenerating] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<IngestJobStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loadingChapters) {
      setLoadingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setLoadingSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loadingChapters]);

  useEffect(() => {
    if (!api.teacher.previewStructure || uploadIds.length === 0) {
      setChapters([{ label: "Chapter 1", title: teacherMeta.subject || "Introduction" }]);
      setLoadingChapters(false);
      return;
    }
    setLoadingChapters(true);
    api.teacher.previewStructure(uploadIds)
      .then((res) => {
        setChapters(res.chapters.length > 0 ? res.chapters : [{ label: "Chapter 1", title: teacherMeta.subject || "Introduction" }]);
      })
      .catch(() => {
        setChapters([{ label: "Chapter 1", title: teacherMeta.subject || "Introduction" }]);
      })
      .finally(() => setLoadingChapters(false));
  }, [uploadIds, teacherMeta.subject]);

  const chapterBlocks = teacherBlocks
    .map((b, i) => ({ block: b, index: i }))
    .filter(({ block }) => block.chapterIndex === currentChapter);

  const addBlock = (type: TeacherBlockType) => {
    const block = newTeacherBlock(type, currentChapter, chapterBlocks.length);
    setTeacherBlocks((prev) => [...prev, block]);
  };

  const moveBlock = (globalIndex: number, dir: -1 | 1) => {
    const chapterIndices = teacherBlocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.chapterIndex === currentChapter)
      .map(({ i }) => i);
    const pos = chapterIndices.indexOf(globalIndex);
    if (pos < 0) return;
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= chapterIndices.length) return;
    const a = chapterIndices[pos];
    const b = chapterIndices[targetPos];
    setTeacherBlocks((prev) => {
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const removeBlock = (globalIndex: number) => {
    setTeacherBlocks((prev) => prev.filter((_, i) => i !== globalIndex));
  };

  const generate = async () => {
    if (!api.teacher.createCourse) {
      setError("Course creation requires the backend.");
      return;
    }
    setGenerating(true);
    setIngestProgress(null);
    setError("");
    try {
      const units = chapters.map((ch) => ({
        moduleLabel: ch.label,
        concept: ch.title,
      }));
      const created = await api.teacher.createCourse(teacherMeta, uploadIds, units, teacherBlocks);
      onCreated(created);
      nav("t-app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create course");
    } finally {
      setGenerating(false);
      setIngestProgress(null);
    }
  };

  const current = chapters[currentChapter];

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-5 pt-2 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <OwlAnim className="w-10 h-10 object-contain" />
          <div>
            <h2 className="text-[20px] font-bold text-[#2c0312] tracking-tight leading-tight">Build your course</h2>
            <p className="text-[12px] text-gray-500">Chapters detected from your upload — add assessment blocks</p>
          </div>
        </div>

        {loadingChapters ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex items-center gap-3">
              <OwlAnim className="w-12 h-12 object-contain" />
              <p className="text-[14px] text-gray-500">Detecting chapters…</p>
            </div>
            <p className="text-[12px] text-gray-400 text-center max-w-xs">
              {loadingSeconds < 15
                ? "Scanning your PDF with AI — usually 10–30 seconds."
                : loadingSeconds < 45
                  ? "Still working — large PDFs can take up to a minute."
                  : "Taking longer than usual. Leave this open; it should finish soon."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4 overflow-x-auto -mx-5 px-5 pb-1">
              {chapters.map((ch, i) => (
                <button key={i} onClick={() => setCurrentChapter(i)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-medium transition-all ${currentChapter === i ? "bg-[#602424] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                  {ch.label}
                </button>
              ))}
            </div>

            <h3 className="text-[16px] font-bold text-[#2c0312] mb-1">{current?.label}: {current?.title}</h3>
            <p className="text-[12px] text-gray-500 mb-3">Auto-generated screens are woven in. Insert your own blocks below.</p>

            <div className="grid grid-cols-1 gap-2 mb-4">
              {TEACHER_BLOCK_TYPES.map((bt) => (
                <button key={bt.label} onClick={() => addBlock(bt.label)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 hover:border-[#602424] hover:text-[#602424] rounded-xl text-[13px] font-medium transition-all text-left">
                  <Plus size={13} /> {bt.icon}
                  <span className="flex-1">{bt.label.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className="text-[11px] text-gray-400">{bt.desc}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-3 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Auto (from PDF)</p>
                <p className="text-[12px] text-gray-500 mt-1">Content screens + flashcard checks every 4 screens + chapter MCQ</p>
              </div>

              {chapterBlocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-center">
                  <Plus size={28} className="text-gray-300 mb-2" />
                  <p className="text-gray-400 text-[13px]">No teacher blocks yet — add above</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {chapterBlocks.map(({ block, index: globalIndex }) => (
                    <div key={globalIndex} className="bg-white rounded-xl border border-gray-100 p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold text-[#602424] uppercase tracking-wide">
                          {block.type.replace(/([A-Z])/g, " $1").trim()}
                        </p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveBlock(globalIndex, -1)} className="px-2 py-1 text-gray-400 text-[12px]">↑</button>
                          <button onClick={() => moveBlock(globalIndex, 1)} className="px-2 py-1 text-gray-400 text-[12px]">↓</button>
                          <button onClick={() => removeBlock(globalIndex)} className="text-gray-300 hover:text-red-400"><X size={16} /></button>
                        </div>
                      </div>
                      {block.cards?.map((card, ci) => (
                        <div key={card.id} className="flex flex-col gap-1 mb-2">
                          <input value={card.front} onChange={(e) => {
                            setTeacherBlocks((prev) => prev.map((b, bi) => bi === globalIndex ? { ...b, cards: b.cards?.map((c, j) => j === ci ? { ...c, front: e.target.value } : c) } : b));
                          }} className="w-full text-[13px] px-2 py-1.5 rounded-lg border border-gray-200" placeholder="Front" />
                          <input value={card.back} onChange={(e) => {
                            setTeacherBlocks((prev) => prev.map((b, bi) => bi === globalIndex ? { ...b, cards: b.cards?.map((c, j) => j === ci ? { ...c, back: e.target.value } : c) } : b));
                          }} className="w-full text-[13px] px-2 py-1.5 rounded-lg border border-gray-200" placeholder="Back" />
                        </div>
                      ))}
                      {block.questions?.map((q, qi) => (
                        <div key={q.id} className="flex flex-col gap-1 mb-2">
                          <input value={q.question} onChange={(e) => {
                            setTeacherBlocks((prev) => prev.map((b, bi) => bi === globalIndex ? { ...b, questions: b.questions?.map((x, j) => j === qi ? { ...x, question: e.target.value } : x) } : b));
                          }} className="w-full text-[13px] px-2 py-1.5 rounded-lg border border-gray-200" placeholder="Question" />
                          {q.choices.map((c, ci) => (
                            <input key={ci} value={c} onChange={(e) => {
                              setTeacherBlocks((prev) => prev.map((b, bi) => bi === globalIndex ? {
                                ...b,
                                questions: b.questions?.map((x, j) => j === qi ? { ...x, choices: x.choices.map((ch, k) => k === ci ? e.target.value : ch) } : x),
                              } : b));
                            }} className="w-full text-[12px] px-2 py-1 rounded-lg border border-gray-100" placeholder={`Choice ${ci + 1}`} />
                          ))}
                        </div>
                      ))}
                      {(block.type === "FlashcardSet" || block.type === "Flashcard") && (
                        <button onClick={() => {
                          setTeacherBlocks((prev) => prev.map((b, bi) => bi === globalIndex ? { ...b, cards: [...(b.cards ?? []), newFlashcard()] } : b));
                        }} className="text-[12px] text-[#602424] font-medium mt-1">+ Add card</button>
                      )}
                      {block.type === "MCQQuiz" && (
                        <button onClick={() => {
                          setTeacherBlocks((prev) => prev.map((b, bi) => bi === globalIndex ? { ...b, questions: [...(b.questions ?? []), newMCQ()] } : b));
                        }} className="text-[12px] text-[#602424] font-medium mt-1">+ Add question</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}

            {generating && (
              <div className="mb-4 rounded-2xl border border-[#602424]/20 bg-white px-4 py-3">
                <p className="text-[13px] font-semibold text-[#602424]">Creating course…</p>
                <p className="text-[12px] text-gray-500 mt-1">Generation continues in the background after you enter the app.</p>
              </div>
            )}
            {generating && ingestProgress && (
              <div className="mb-4 rounded-2xl border border-[#602424]/20 bg-white p-4">
                <p className="text-[13px] font-semibold text-[#602424]">{ingestProgress.stage}</p>
                {ingestProgress.total > 0 && (
                  <>
                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-[#602424] transition-all duration-500"
                        style={{ width: `${Math.round((ingestProgress.current / ingestProgress.total) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Chapter {ingestProgress.current} of {ingestProgress.total}
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              {currentChapter > 0 && (
                <button onClick={() => setCurrentChapter(currentChapter - 1)} className="flex-1 py-3.5 rounded-2xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-700 active:scale-[0.98] transition-transform">
                  Previous
                </button>
              )}
              {currentChapter < chapters.length - 1 ? (
                <button onClick={() => setCurrentChapter(currentChapter + 1)} className="flex-1 py-3.5 rounded-2xl bg-[#602424] text-white text-[14px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5">
                  Next chapter <ArrowRight size={15} />
                </button>
              ) : (
                <button onClick={generate} disabled={generating} className="flex-1 py-3.5 rounded-2xl bg-[#602424] text-white text-[14px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 disabled:opacity-70">
                  {generating
                    ? ingestProgress?.stage ?? "Starting…"
                    : <><Zap size={15} /> Generate course</>}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

// ── Teacher app (bottom tab bar) ────────────────────────────────────────────
type TeacherTab = "lessons" | "dashboard" | "challenge" | "settings";

export function TeacherApp({ nav, joinCode, ingestJobId }: { nav: Nav; joinCode?: string; ingestJobId?: string }) {
  const [tab, setTab] = useState<TeacherTab>("lessons");
  const [copied, setCopied] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<IngestJobStatus | null>(null);
  const tabs: { id: TeacherTab; icon: React.ReactNode; label: string }[] = [
    { id: "lessons", icon: <BookOpen size={20} />, label: "Lessons" },
    { id: "dashboard", icon: <BarChart2 size={20} />, label: "Students" },
    { id: "challenge", icon: <Trophy size={20} />, label: "Challenge" },
    { id: "settings", icon: <SettingsIcon size={20} />, label: "Settings" },
  ];

  useEffect(() => {
    if (!ingestJobId || !api.teacher.pollIngestJob) return;
    let cancelled = false;
    api.teacher.pollIngestJob(ingestJobId, (status) => {
      if (!cancelled) setIngestProgress(status);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ingestJobId]);

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-1 pb-3">
        <div className="flex items-center gap-2.5">
          <OwlAnim className="w-9 h-9 object-contain" />
          <div>
            <p className="text-[15px] font-bold text-[#2c0312] leading-none">{BRAND}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Educator view</p>
          </div>
        </div>
        <button onClick={() => nav("splash")} className="text-gray-400 hover:text-[#602424]">
          <LogOut size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 pb-24 overflow-y-auto" style={{ maxHeight: "calc(100svh - 150px)" }}>
        {ingestProgress && ingestProgress.status === "running" && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-amber-900">{ingestProgress.stage}</p>
            {ingestProgress.total > 0 && (
              <p className="text-[12px] text-amber-800 mt-1">
                {ingestProgress.current} of {ingestProgress.total} chapters ready — students can open chapter 1 now.
              </p>
            )}
          </div>
        )}
        {ingestProgress && ingestProgress.status === "failed" && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-red-800">Generation failed</p>
            <p className="text-[12px] text-red-700 mt-1">{ingestProgress.error || "Try generating again."}</p>
          </div>
        )}
        {joinCode && (
          <div className="mb-4 bg-white rounded-2xl border border-[#602424]/20 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-[#602424] uppercase tracking-widest mb-1">Classroom code</p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[28px] font-bold tracking-[0.2em] text-[#2c0312]">{joinCode}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(joinCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#f5ede8] text-[#602424] text-[12px] font-medium"
              >
                <Copy size={14} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[12px] text-gray-500 mt-2">Students enter this code to join your course.</p>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {tab === "lessons" && <TeacherLessons />}
            {tab === "dashboard" && <TeacherDashboard />}
            {tab === "challenge" && <TeacherChallenge />}
            {tab === "settings" && <TeacherSettings />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom tab bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 px-2 pt-2 pb-6 flex justify-around">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="flex flex-col items-center gap-1 flex-1 py-1">
            <span className={tab === t.id ? "text-[#602424]" : "text-gray-400"}>{t.icon}</span>
            <span className={`text-[10px] font-medium ${tab === t.id ? "text-[#602424]" : "text-gray-400"}`}>{t.label}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

// ── Teacher: Lessons editor ─────────────────────────────────────────────────
const LESSON_UNITS = [
  "Unit 1: Introduction to Perception",
  "Unit 2: Sensory Systems",
  "Unit 3: Cognitive Biases",
];

function TeacherLessons() {
  const [unit, setUnit] = useState(0);
  const [focusBlock, setFocusBlock] = useState<BlockType | null>(null);
  const [chatMsg, setChatMsg] = useState("");
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([
    { from: "ai", text: "Hi! Tap a block, then tell me what to change." },
  ]);

  const blocks: Block[] = [
    { type: "Text", content: "Perception is the process by which your brain identifies, interprets, and organizes information from your senses." },
    { type: "Flashcards", content: "Front: Define perception \u2014 Back: The brain's process of interpreting sensory input" },
    { type: "Animation", content: "Sensory pathways diagram \u2014 eye \u2192 optic nerve \u2192 visual cortex" },
    { type: "Quiz", content: "What does perception allow us to do?  (B) Interpret the world \u2713" },
  ];

  const send = () => {
    if (!chatMsg.trim()) return;
    setMessages((m) => [...m,
      { from: "user", text: chatMsg },
      { from: "ai", text: `Updated the ${focusBlock || "selected"} block: "${chatMsg}". Change applied!` },
    ]);
    setChatMsg("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
        {LESSON_UNITS.map((u, i) => (
          <button key={i} onClick={() => setUnit(i)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${unit === i ? "bg-[#602424] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
            {u.split(":")[0]}
          </button>
        ))}
      </div>
      <h2 className="text-[17px] font-bold text-[#2c0312]">{LESSON_UNITS[unit]}</h2>

      <div className="flex flex-col gap-2.5">
        {blocks.map((b, i) => (
          <button key={i} onClick={() => setFocusBlock(b.type)}
            className={`text-left bg-white rounded-xl border p-3.5 transition-all ${focusBlock === b.type ? "border-[#602424] shadow-sm" : "border-gray-100"}`}>
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#602424] mb-1">
              {BLOCK_TYPES.find((t) => t.label === b.type)?.icon} {b.type}
            </span>
            <p className="text-[13px] text-gray-700 whitespace-pre-line">{b.content}</p>
          </button>
        ))}
      </div>

      {/* AI editor chat */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-gray-100">
          <p className="text-[13px] font-semibold text-gray-900">AI editor</p>
          {focusBlock && <p className="text-[11px] text-[#602424] mt-0.5 flex items-center gap-1"><Star size={10} /> Focused on {focusBlock}</p>}
        </div>
        <div className="p-3.5 flex flex-col gap-2.5 max-h-52 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"} gap-2`}>
              {m.from === "ai" && <OwlAnim className="w-6 h-6 object-contain self-end shrink-0" />}
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] ${m.from === "user" ? "bg-[#602424] text-white" : "bg-gray-100 text-gray-800"}`}>{m.text}</div>
            </div>
          ))}
        </div>
        <div className="p-2.5 border-t border-gray-100 flex gap-2">
          <input value={chatMsg} onChange={(e) => setChatMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask to edit any field…"
            className="flex-1 text-[13px] bg-gray-50 rounded-lg px-3 py-2 outline-none border border-gray-200 focus:border-[#602424]" />
          <button onClick={send} className="w-9 h-9 bg-[#602424] text-white rounded-lg flex items-center justify-center shrink-0"><Send size={14} /></button>
        </div>
      </div>

      <button className="w-full py-3.5 rounded-2xl bg-[#602424] text-white text-[14px] font-semibold active:scale-[0.98] transition-transform">
        Publish course
      </button>
    </div>
  );
}

// ── Teacher: Dashboard ──────────────────────────────────────────────────────
function TeacherDashboard() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  useEffect(() => { api.teacher.listStudents().then(setStudents); }, []);

  const color = (n: number) => (n >= 80 ? "bg-green-500" : n >= 60 ? "bg-yellow-400" : "bg-red-400");
  const textColor = (n: number) => (n >= 80 ? "text-green-600" : n >= 60 ? "text-yellow-600" : "text-red-500");
  const suggestions = [
    "Revisit Perception Basics with Noah \u2014 41% mastery. Add flashcard practice.",
    "Review Q5 in the Unit 1 quiz \u2014 3 students missed it; it may be ambiguous.",
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-gray-500">Live view of student mastery, understanding, and progress.</p>
      <div className="flex flex-col gap-2.5">
        {students.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#f5ede8] flex items-center justify-center font-bold text-[#602424] text-[14px] shrink-0">{s.name[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-gray-900 text-[14px] truncate">{s.name}</p>
                <span className={`text-[13px] font-bold ${textColor(s.mastery)}`}>{s.mastery}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color(s.mastery)}`} style={{ width: `${s.mastery}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="font-bold text-gray-900 text-[15px] mb-2.5 flex items-center gap-2"><Zap size={15} className="text-[#602424]" /> AI suggestions</h3>
        <div className="flex flex-col gap-2.5">
          {suggestions.map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#f5ede8] flex items-center justify-center shrink-0 mt-0.5"><Star size={11} className="text-[#602424]" /></div>
              <p className="text-[13px] text-gray-700 flex-1">{s}</p>
              <button className="text-[12px] font-semibold text-white bg-[#602424] px-3 py-1.5 rounded-lg shrink-0">Apply</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Teacher: Challenge details ──────────────────────────────────────────────
type ChallengeTab = "students" | "info" | "teachers";

function TeacherChallenge() {
  const [tab, setTab] = useState<ChallengeTab>("students");
  const [students, setStudents] = useState(["Ava Martinez", "Liam Chen", "Noah Patel"]);
  const [newStudent, setNewStudent] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {(["students", "info", "teachers"] as ChallengeTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-2 py-2 rounded-lg text-[12px] font-medium transition-all ${tab === t ? "bg-white text-[#602424] shadow-sm" : "text-gray-500"}`}>
            {t === "students" ? "Students" : t === "info" ? "Info" : "Teachers"}
          </button>
        ))}
      </div>

      {tab === "students" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="font-semibold text-[14px] mb-3">Registered ({students.length})</h3>
            <div className="flex flex-col gap-1.5 mb-3">
              {students.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-2 text-[13px]"><div className="w-7 h-7 rounded-full bg-[#f5ede8] flex items-center justify-center text-[11px] font-bold text-[#602424]">{s[0]}</div>{s}</span>
                  <button onClick={() => setStudents((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newStudent} onChange={(e) => setNewStudent(e.target.value)} placeholder="Add student…" className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-[#602424]" />
              <button onClick={() => { if (newStudent.trim()) { setStudents((p) => [...p, newStudent]); setNewStudent(""); } }} className="px-4 py-2 rounded-lg bg-[#602424] text-white text-[13px] font-semibold">Add</button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Student join link</p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
                <p className="text-[12px] text-[#602424] flex-1 truncate">lifeinai.center/join/BIO2024</p>
                <RefreshCw size={12} className="text-gray-400" />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Classroom code</p>
              <div className="bg-[#f5ede8] rounded-lg px-4 py-3 text-center">
                <p className="text-[22px] font-bold text-[#602424] tracking-widest">BIO2024</p>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "info" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-4">
          <h3 className="font-semibold text-[14px]">Challenge information</h3>
          <Field label="Name of challenge" defaultValue="Spring Biology Challenge" />
          <Field label="Date" type="date" defaultValue="2026-05-15" />
          <Field label="Location / Format" defaultValue="Remote" />
          <button className="self-end px-5 py-2.5 rounded-xl bg-[#602424] text-white text-[13px] font-semibold">Save changes</button>
        </div>
      )}

      {tab === "teachers" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-4">
          <h3 className="font-semibold text-[14px]">Add co-teachers</h3>
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Teacher join link</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
              <p className="text-[12px] text-[#602424] flex-1 truncate">lifeinai.center/teacher-join/BIO2024</p>
              <RefreshCw size={12} className="text-gray-400" />
            </div>
          </div>
          <div className="flex items-center justify-between py-2 px-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px]">
            <span className="flex items-center gap-2"><UserPlus size={14} className="text-yellow-600" />Dr. Williams (Pending)</span>
          </div>
          <div className="flex gap-2">
            <input placeholder="Invite by email…" className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-[#602424]" />
            <button className="px-4 py-2 rounded-lg bg-[#602424] text-white text-[13px] font-semibold">Invite</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Teacher: Settings ───────────────────────────────────────────────────────
type SettingsTab = "org" | "prompts";

function TeacherSettings() {
  const [tab, setTab] = useState<SettingsTab>("org");
  const grades = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {(["org", "prompts"] as SettingsTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-2 py-2 rounded-lg text-[12px] font-medium transition-all ${tab === t ? "bg-white text-[#602424] shadow-sm" : "text-gray-500"}`}>
            {t === "org" ? "Organization" : "AI prompts"}
          </button>
        ))}
      </div>

      {tab === "org" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-4">
          <h3 className="font-semibold text-[14px]">Organization details</h3>
          <Field label="Email" defaultValue="ms.johnson@school.edu" />
          <Field label="Full name" defaultValue="Ms. Johnson" />
          <Field label="Organization" defaultValue="Lincoln High School" />
          <button className="self-end px-5 py-2.5 rounded-xl bg-[#602424] text-white text-[13px] font-semibold">Save changes</button>
        </div>
      )}

      {tab === "prompts" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-gray-500">Edit AI prompts per grade level. Content regenerates from updated prompts.</p>
          {grades.map((g) => (
            <div key={g} className="bg-white rounded-xl border border-gray-100 p-3.5 flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-gray-800">{g}</p>
              <textarea rows={2} defaultValue={`Generate content for ${g} students with clear explanations, relatable examples, and level 2-3 questions.`}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] outline-none focus:border-[#602424] resize-none" />
            </div>
          ))}
          <button className="self-end px-5 py-2.5 rounded-xl bg-[#602424] text-white text-[13px] font-semibold flex items-center gap-1.5">
            <RefreshCw size={13} /> Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
