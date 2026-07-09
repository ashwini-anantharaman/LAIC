import { useState } from "react";
import { Calendar, Trophy, ArrowRight, Target, Clock } from "lucide-react";
import { useApp } from "../store/AppContext";
import { sf } from "../constants/studyFetchTheme";
import { daysUntil, downloadCertificate } from "../lib/ui-actions";

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function StudentChallengeScreen() {
  const { courseTitle, learner, concepts, setScreen, examDate, setExamDate, courseId } = useApp();
  const [dateModal, setDateModal] = useState(false);
  const [dateInput, setDateInput] = useState(examDate ?? "");

  const masteredCount = concepts.filter(
    (c) => (learner.conceptMastery[c.id] ?? "not-seen") === "mastered"
  ).length;
  const preparedCount = concepts.filter((c) => {
    const level = learner.conceptMastery[c.id] ?? "not-seen";
    return level === "mastered" || level === "understood" || level === "practiced";
  }).length;
  const masteryPct = concepts.length
    ? Math.round((preparedCount / concepts.length) * 100)
    : 0;
  const allMastered = concepts.length > 0 && masteredCount === concepts.length;
  const daysLeft = examDate ? daysUntil(examDate) : null;
  const challengeLabel = courseTitle ? `${courseTitle} challenge` : "Your challenge";

  const saveDate = () => {
    if (dateInput) setExamDate(dateInput);
    setDateModal(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Challenge</h1>
        <p className="text-sm text-gray-500 mt-1">
          {courseId ? `Prepare for the ${challengeLabel}` : "Join a course to track your challenge prep"}
        </p>
      </div>

      <div className="bg-white rounded-2xl border p-6 mb-5" style={{ borderColor: sf.border }}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} style={{ color: sf.blue }} />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Countdown to challenge</p>
        </div>

        {daysLeft !== null ? (
          <>
            <div className="flex items-end gap-3 mb-2">
              <p className="text-5xl font-black text-gray-900 leading-none">{daysLeft}</p>
              <p className="text-lg font-semibold text-gray-500 pb-1">days left</p>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Challenge day: <span className="font-semibold">{new Date(examDate!).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
            </p>
            <button
              type="button"
              onClick={() => { setDateInput(examDate ?? ""); setDateModal(true); }}
              className="text-sm font-semibold"
              style={{ color: sf.blue }}
            >
              Change challenge date
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Set your challenge date to start the countdown. Your instructor may have shared this when you joined the classroom.
            </p>
            <button
              type="button"
              onClick={() => setDateModal(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: sf.blue }}
            >
              Set challenge date
            </button>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border p-6 mb-5" style={{ borderColor: sf.border }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={18} style={{ color: sf.blue }} />
            <p className="text-sm font-bold text-gray-800">Challenge readiness</p>
          </div>
          <span className="text-sm font-bold" style={{ color: sf.blue }}>{masteryPct}%</span>
        </div>
        <ProgressBar value={masteryPct} color={sf.blue} />
        <p className="text-xs text-gray-500 mt-3">
          {preparedCount} of {concepts.length || "—"} units practiced · {masteredCount} mastered
        </p>
        {!courseId && (
          <p className="text-xs text-gray-400 mt-2">Open a course from My Sets to see unit progress.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setScreen("student-tools")}
        className="w-full rounded-2xl p-5 flex items-center justify-between font-semibold text-white mb-5 hover:opacity-95 transition-opacity"
        style={{ backgroundColor: sf.blue }}
      >
        <span>Practice for the challenge</span>
        <ArrowRight size={20} />
      </button>

      {allMastered && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-start gap-4">
          <Trophy className="w-8 h-8 text-emerald-600 shrink-0" />
          <div>
            <p className="font-bold text-emerald-800 mb-1">You&apos;re challenge-ready</p>
            <p className="text-sm text-emerald-700 mb-3">
              You&apos;ve mastered every unit in {courseTitle}. Download your completion certificate.
            </p>
            <button
              type="button"
              onClick={() => downloadCertificate(courseTitle ?? "Course", learner.name || "Student")}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
            >
              Download certificate
            </button>
          </div>
        </div>
      )}

      {dateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDateModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={20} className="text-gray-500" />
              <h3 className="font-bold text-gray-900">Challenge date</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">When is your competition or exam day?</p>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border mb-4 outline-none focus:border-blue-500"
              style={{ borderColor: sf.border }}
            />
            <button
              type="button"
              onClick={saveDate}
              disabled={!dateInput}
              className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
              style={{ backgroundColor: sf.blue }}
            >
              Save countdown
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
