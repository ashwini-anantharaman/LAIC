import { useEffect } from "react";
import { Plus, BarChart2 } from "lucide-react";
import type { MasteryLevel } from "../types";
import { MASTERY } from "../constants/ui";
import { useApp } from "../store/AppContext";
import { ow } from "../components/owlwise/instructorUi";

function MasteryPip({ level }: { level: MasteryLevel }) {
  const { color, label } = MASTERY[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0"
      style={{ color, backgroundColor: `${color}22`, borderColor: `${color}55` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function InstructorHomeScreen() {
  const {
    setScreen,
    concepts,
    instructor,
    courseTitle,
    courseId,
    dashboardData,
    refreshDashboard,
    startNewCourse,
  } = useApp();

  useEffect(() => {
    if (!courseId) return;
    refreshDashboard();
    const id = setInterval(() => refreshDashboard(), 15_000);
    return () => clearInterval(id);
  }, [courseId, refreshDashboard]);

  const summary = dashboardData?.summary;
  const conceptProgress = dashboardData?.conceptProgress ?? [];
  const snapshotConcepts =
    conceptProgress.filter((c) => c.engagedPercent > 0).slice(0, 12).length > 0
      ? conceptProgress.filter((c) => c.engagedPercent > 0).slice(0, 12)
      : conceptProgress.slice(0, 8);
  const enrolled = summary?.totalEnrolled ?? 0;
  const displayTitle = summary?.courseTitle ?? courseTitle;

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: ow.bg }}>
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: ow.heading }}>
            Overview
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            Good morning, {instructor.name || "Instructor"} — {displayTitle} has{" "}
            {summary?.activeThisWeek ?? 0} student{(summary?.activeThisWeek ?? 0) === 1 ? "" : "s"} active this week.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { value: String(enrolled), label: "Students enrolled" },
            { value: String(concepts.length), label: "Concepts published" },
            { value: `${summary?.avgMasteryPercent ?? 0}%`, label: "Avg class mastery" },
          ].map((s) => (
            <div key={s.label} className={`${ow.card} p-5`}>
              <p className="text-2xl font-bold" style={{ color: ow.heading }}>
                {s.value}
              </p>
              <p className={ow.label + " mt-1"}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            type="button"
            onClick={() => startNewCourse().catch(console.error)}
            className="rounded-2xl p-7 text-left text-white active:scale-[0.98] transition-transform"
            style={{ backgroundColor: ow.burgundy }}
          >
            <Plus className="w-6 h-6 mb-5 opacity-80" />
            <h3 className="text-xl font-bold mb-1">Create Course</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Upload sources, AI-draft modules, build block by block.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setScreen("instructor-dashboard")}
            className={`${ow.card} p-7 text-left hover:border-[#602424]/30 transition-colors`}
          >
            <BarChart2 className="w-6 h-6 mb-5 text-gray-400" />
            <h3 className="text-xl font-bold mb-1" style={{ color: ow.heading }}>
              Analytics
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Mastery heatmap, misconceptions, mode usage, engagement.
            </p>
          </button>
        </div>

        <div className={`${ow.card} p-6`}>
          <p className={ow.label + " mb-4"}>Class snapshot · {displayTitle}</p>
          {snapshotConcepts.length === 0 ? (
            <p className="text-sm text-gray-500">
              No student progress yet. Publish the course and have students enroll.
            </p>
          ) : (
            <div className="space-y-4">
              {snapshotConcepts.map((c) => {
                const pct = c.engagedPercent;
                const level: MasteryLevel =
                  pct >= 80 ? "mastered" : pct >= 60 ? "understood" : pct >= 40 ? "practiced" : pct >= 15 ? "exposed" : "not-seen";
                return (
                  <div key={c.conceptId} className="flex items-center gap-4">
                    <span className="text-sm text-gray-500 w-36 shrink-0 truncate">{c.name}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ow.burgundy }} />
                    </div>
                    <MasteryPip level={level} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
