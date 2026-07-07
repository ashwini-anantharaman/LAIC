import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Play, FileText, CheckSquare, Pencil, Check, Circle } from "lucide-react";
import { PROGRAMS, DEMO_LEARNER_PROGRAM, DEMO_LEARNER_ID, CONTENT_KIND_META, type ContentKind, type Course } from "./data";
import {
  BASE, BORDER, MUTED, FAINT, FONT_HEAD, FONT_BODY,
  Card, Eyebrow, Badge, PrimaryBtn, ProgressBar, slide,
} from "./ui";

const program = PROGRAMS.find((p) => p.id === DEMO_LEARNER_PROGRAM)!;
const learner = program.learners.find((l) => l.id === DEMO_LEARNER_ID)!;

const KIND_ICON: Record<ContentKind, typeof Play> = {
  video: Play, reading: FileText, quiz: CheckSquare, activity: Pencil, artifact: FileText,
};

// ─── Course viewer (accessing created content) ─────────────────────────────────

function CourseViewer({ course, onBack }: { course: Course; onBack: () => void }) {
  const [done, setDone] = useState<Set<string>>(new Set([course.objects[0]?.id]));
  const [active, setActive] = useState(course.objects[0]?.id ?? "");
  const activeObj = course.objects.find((o) => o.id === active);
  const pct = Math.round((done.size / Math.max(course.objects.length, 1)) * 100);

  return (
    <motion.div {...slide} className="max-w-5xl mx-auto px-6 md:px-12 py-10">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 w-fit focus:outline-none group" style={{ color: MUTED, fontFamily: FONT_BODY }}>
        <ArrowLeft size={15} className="group-hover:text-white transition-colors" /><span className="group-hover:text-white/80 transition-colors">My courses</span>
      </button>
      <h1 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{course.title}</h1>
      <p className="mt-1 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>{course.summary} · by {course.coach}</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 max-w-xs"><ProgressBar pct={pct} tint={program.accent} /></div>
        <span className="text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{pct}% complete</span>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-6">
            <Badge tone="neutral">{activeObj && CONTENT_KIND_META[activeObj.kind].label}</Badge>
            <h2 className="mt-3 text-2xl font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{activeObj?.title}</h2>
            <div className="mt-5 rounded-xl aspect-video flex items-center justify-center" style={{ background: `${program.accent}18`, border: `1px solid ${BORDER}` }}>
              {activeObj && (() => { const I = KIND_ICON[activeObj.kind]; return <I size={40} color={program.accent} />; })()}
            </div>
            <p className="mt-5 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", fontFamily: FONT_BODY }}>
              This is where the learner experiences the content the coach created — video playback, reading, an interactive quiz or a hands-on activity. ({activeObj?.duration})
            </p>
            <div className="mt-6">
              <PrimaryBtn Icon={Check} onClick={() => setDone((prev) => new Set(prev).add(active))}>
                {done.has(active) ? "Completed" : "Mark complete"}
              </PrimaryBtn>
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-2">
          <Eyebrow>Lessons</Eyebrow>
          {course.objects.map((o) => {
            const on = o.id === active;
            const complete = done.has(o.id);
            return (
              <button key={o.id} onClick={() => setActive(o.id)} className="text-left rounded-xl p-3 flex items-center gap-3 transition-colors focus:outline-none" style={{ background: on ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${on ? "rgba(255,255,255,0.16)" : BORDER}` }}>
                {complete ? <Check size={16} color="#5fd39a" /> : <Circle size={16} color={FAINT} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate" style={{ fontFamily: FONT_BODY }}>{o.title}</p>
                  <p className="text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>{CONTENT_KIND_META[o.kind].label} · {o.duration}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function LearnerApp() {
  const [open, setOpen] = useState<Course | null>(null);
  const enrolled = program.courses.filter((c) => learner.enrolledCourseIds.includes(c.id));
  const available = program.courses.filter((c) => c.status === "published" && !learner.enrolledCourseIds.includes(c.id));

  if (open) return <div style={{ background: BASE, minHeight: "100vh" }}><CourseViewer course={open} onBack={() => setOpen(null)} /></div>;

  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      <motion.div {...slide} className="max-w-5xl mx-auto px-6 md:px-12 py-10">
        <Eyebrow>Learner · {program.name}</Eyebrow>
        <h1 className="mt-2 text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Hi, {learner.name.split(" ")[0]}</h1>
        <p className="mt-2 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>Pick up where you left off, or enroll in something new.</p>

        <div className="mt-10">
          <h2 className="text-lg font-semibold text-white mb-4" style={{ fontFamily: FONT_HEAD }}>Continue learning</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrolled.map((c) => (
              <Card key={c.id} hover onClick={() => setOpen(c)} className="p-5 flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{c.title}</h3>
                  <p className="mt-1 text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>by {c.coach} · {c.objects.length} lessons</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1"><ProgressBar pct={learner.progress} tint={program.accent} /></div>
                  <span className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>{learner.progress}%</span>
                </div>
                <PrimaryBtn Icon={Play} className="w-full">Resume</PrimaryBtn>
              </Card>
            ))}
          </div>
        </div>

        {available.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-white mb-1" style={{ fontFamily: FONT_HEAD }}>Choose a course</h2>
            <p className="text-sm mb-4" style={{ color: MUTED, fontFamily: FONT_BODY }}>Available in {program.name}.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {available.map((c) => (
                <Card key={c.id} className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{c.title}</h3>
                    <p className="mt-1 text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{c.summary}</p>
                    <p className="mt-2 text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>by {c.coach} · {c.objects.length} lessons</p>
                  </div>
                  <button onClick={() => setOpen(c)} className="px-4 h-10 rounded-xl text-xs font-semibold focus:outline-none transition-colors flex-shrink-0" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}>Enroll</button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
