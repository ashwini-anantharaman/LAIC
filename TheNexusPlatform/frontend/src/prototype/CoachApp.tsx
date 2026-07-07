import { useState } from "react";
import { motion } from "motion/react";
import {
  BookOpen, Users, Plus, ArrowLeft, Send, Copy, Check, GripVertical,
  Video, FileText, CheckSquare, Pencil, X,
} from "lucide-react";
import { PROGRAMS, DEMO_COACH_PROGRAM, DEMO_COACH_NAME, CONTENT_KIND_META, type ContentKind, type Course } from "./data";
import {
  BASE, BORDER, MUTED, FAINT, FONT_HEAD, FONT_BODY,
  Card, Eyebrow, Badge, PrimaryBtn, GhostBtn, Tabs, SectionTitle, EmptyHint, slide,
} from "./ui";

const program = PROGRAMS.find((p) => p.id === DEMO_COACH_PROGRAM)!;

const KIND_ICON: Record<ContentKind, typeof Video> = {
  video: Video, reading: FileText, quiz: CheckSquare, activity: Pencil, artifact: FileText,
};

// ─── Course builder (the coach's "creating courses" view) ──────────────────────

function CourseBuilder({ base, onBack }: { base: Course | null; onBack: () => void }) {
  const [title, setTitle] = useState(base?.title ?? "");
  const [summary, setSummary] = useState(base?.summary ?? "");
  const [objects, setObjects] = useState(base?.objects ?? []);
  const [adding, setAdding] = useState<ContentKind | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function addObject() {
    if (!adding || !draftTitle.trim()) return;
    setObjects((prev) => [...prev, { id: `new-${prev.length}`, title: draftTitle.trim(), kind: adding, duration: "—", usableInApp: adding !== "quiz" }]);
    setDraftTitle(""); setAdding(null);
  }

  return (
    <motion.div {...slide} className="max-w-4xl mx-auto px-6 md:px-12 py-10">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 w-fit focus:outline-none group" style={{ color: MUTED, fontFamily: FONT_BODY }}>
        <ArrowLeft size={15} className="group-hover:text-white transition-colors" /><span className="group-hover:text-white/80 transition-colors">Back to courses</span>
      </button>
      <Eyebrow>{base ? "Edit course" : "New course"} · {program.name}</Eyebrow>

      <input
        value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title"
        className="mt-3 w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-white/20 tracking-tight" style={{ fontFamily: FONT_HEAD }}
      />
      <input
        value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary of what learners will get out of this course"
        className="mt-2 w-full bg-transparent text-sm text-white/70 outline-none placeholder:text-white/20" style={{ fontFamily: FONT_BODY }}
      />

      <div className="mt-8">
        <SectionTitle sub="Add learning objects — videos, readings, quizzes and activities. Objects marked ◆ can be reused by the Organization's Application.">Course content</SectionTitle>
        <div className="flex flex-col gap-2">
          {objects.map((o, i) => {
            const Icon = KIND_ICON[o.kind];
            return (
              <Card key={o.id} className="p-3.5 flex items-center gap-3">
                <GripVertical size={16} color={FAINT} />
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}><Icon size={15} color="rgba(255,255,255,0.7)" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate" style={{ fontFamily: FONT_BODY }}>{o.title}</p>
                  <p className="text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>{CONTENT_KIND_META[o.kind].label} · {o.duration}</p>
                </div>
                {o.usableInApp && <Badge tone="violet">◆ App-ready</Badge>}
                <button onClick={() => setObjects((prev) => prev.filter((_, j) => j !== i))} className="text-white/25 hover:text-white/60 transition-colors focus:outline-none"><X size={15} /></button>
              </Card>
            );
          })}
          {objects.length === 0 && <EmptyHint>No content yet — add your first learning object below.</EmptyHint>}
        </div>

        {adding ? (
          <Card className="mt-3 p-3 flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-md" style={{ background: "rgba(255,255,255,0.06)", color: MUTED, fontFamily: FONT_BODY }}>{CONTENT_KIND_META[adding].label}</span>
            <input autoFocus value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addObject()} placeholder="Title…" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" style={{ fontFamily: FONT_BODY }} />
            <GhostBtn onClick={addObject}>Add</GhostBtn>
            <button onClick={() => { setAdding(null); setDraftTitle(""); }} className="text-white/30 hover:text-white/60 focus:outline-none"><X size={16} /></button>
          </Card>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["video", "reading", "quiz", "activity"] as ContentKind[]).map((k) => (
              <button key={k} onClick={() => setAdding(k)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors focus:outline-none" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.65)", fontFamily: FONT_BODY }}>
                <Plus size={13} /> {CONTENT_KIND_META[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex gap-3">
        <PrimaryBtn>Publish course</PrimaryBtn>
        <GhostBtn>Save draft</GhostBtn>
      </div>
    </motion.div>
  );
}

// ─── Invite learners ────────────────────────────────────────────────────────────

function InvitePanel() {
  const [email, setEmail] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const code = "BRDG-" + "7F2K";

  function invite() {
    if (!email.trim()) return;
    setInvited((prev) => [email.trim(), ...prev]);
    setEmail("");
  }
  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3"><Send size={15} color={MUTED} /><Eyebrow>Invite learners by email</Eyebrow></div>
        <p className="text-xs mb-4" style={{ color: MUTED, fontFamily: FONT_BODY }}>Learners are assigned to this program by your invitation.</p>
        <div className="flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} placeholder="learner@email.com" className="flex-1 h-11 px-4 rounded-xl text-sm text-white outline-none" style={{ background: "#222228", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }} />
          <PrimaryBtn onClick={invite} Icon={Send}>Invite</PrimaryBtn>
        </div>
        {invited.length > 0 && (
          <div className="mt-4 flex flex-col gap-1.5">
            {invited.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.55)", fontFamily: FONT_BODY }}><Check size={13} color="#5fd39a" /> Invitation sent to {e}</div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-5">
        <Eyebrow>Or share a join code</Eyebrow>
        <p className="text-xs mt-2 mb-4" style={{ color: MUTED, fontFamily: FONT_BODY }}>Anyone with this code can join {program.name} as a learner.</p>
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
          <span className="text-2xl font-bold tracking-[0.15em] text-white" style={{ fontFamily: FONT_HEAD }}>{code}</span>
          <button onClick={copyCode} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] focus:outline-none" style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}>
            {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function CoachApp() {
  const [tab, setTab] = useState("courses");
  const [building, setBuilding] = useState<{ base: Course | null } | null>(null);
  const myCourses = program.courses.filter((c) => c.coach === DEMO_COACH_NAME);

  if (building) return <div style={{ background: BASE, minHeight: "100vh" }}><CourseBuilder base={building.base} onBack={() => setBuilding(null)} /></div>;

  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      <motion.div {...slide} className="max-w-5xl mx-auto px-6 md:px-12 py-10">
        <Eyebrow>Coach workspace · assigned program</Eyebrow>
        <div className="flex items-end justify-between flex-wrap gap-4 mt-2 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${program.accent}22`, border: `1px solid ${program.accent}55` }}>{program.emoji}</div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{program.name}</h1>
              <p className="mt-1 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>Welcome, {DEMO_COACH_NAME} — create courses & invite learners.</p>
            </div>
          </div>
          <PrimaryBtn Icon={Plus} onClick={() => setBuilding({ base: null })}>Create course</PrimaryBtn>
        </div>

        <div className="mb-8">
          <Tabs active={tab} onChange={setTab} tabs={[
            { key: "courses", label: "My Courses", Icon: BookOpen },
            { key: "learners", label: "Learners", Icon: Users },
          ]} />
        </div>

        {tab === "courses" && (
          <div className="flex flex-col gap-3">
            {myCourses.map((c) => (
              <Card key={c.id} hover onClick={() => setBuilding({ base: c })} className="p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{c.title}</h4>
                    <Badge tone={c.status === "published" ? "green" : "amber"}>{c.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{c.summary}</p>
                  <p className="mt-2 text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>{c.objects.length} learning objects · {c.learners} enrolled</p>
                </div>
                <Pencil size={16} color={FAINT} />
              </Card>
            ))}
          </div>
        )}

        {tab === "learners" && (
          <div className="flex flex-col gap-6">
            <InvitePanel />
            <div>
              <SectionTitle>Roster</SectionTitle>
              <Card className="p-2">
                {program.learners.map((l, i) => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-3" style={{ borderBottom: i < program.learners.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white/80" style={{ background: "rgba(255,255,255,0.08)", fontFamily: FONT_HEAD }}>{l.name.split(" ").map((n) => n[0]).join("")}</div>
                      <div>
                        <p className="text-sm text-white" style={{ fontFamily: FONT_BODY }}>{l.name}</p>
                        <p className="text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>{l.enrolledCourseIds.length} courses · {l.progress}% complete</p>
                      </div>
                    </div>
                    <Badge tone={l.progress >= 75 ? "green" : "neutral"}>{l.progress}%</Badge>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
