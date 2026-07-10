import { useEffect } from "react";
import { Edit2, Pencil, BookOpen, CheckCircle2 } from "lucide-react";
import type { MasteryLevel } from "../types";
import { MASTERY } from "../constants/ui";
import { useApp } from "../store/AppContext";
import {
  laic,
  SectionHead,
  StatCard,
  LaicPanel,
  ThinBar,
  HeatmapCell,
  MasteryLegend,
  OutlineAction,
} from "../components/laic/ui";

export function TeacherDashboardScreen() {
  const {
    concepts,
    dashboardData,
    refreshDashboard,
    courseId,
    courseTitle,
    coursePublished,
    instructorCourses,
    modules,
    loadCourse,
    openCourseEditor,
  } = useApp();

  useEffect(() => {
    if (!courseId) return;
    refreshDashboard();
    const id = setInterval(() => refreshDashboard(), 12_000);
    return () => clearInterval(id);
  }, [courseId, refreshDashboard]);

  const summary = dashboardData?.summary;
  const heatmapRows = dashboardData?.students ?? [];
  const misconceptionLog = dashboardData?.misconceptionLog ?? [];
  const modeUsage = dashboardData?.modeUsage ?? [];
  const conceptProgress = dashboardData?.conceptProgress ?? [];
  const suggestions = dashboardData?.suggestions ?? [];
  const totalEnrolled = summary?.totalEnrolled ?? 0;
  const displayTitle = summary?.courseTitle ?? courseTitle;
  const modeSwitchTotal =
    dashboardData?.totalModeSwitches ?? modeUsage.reduce((n, m) => n + m.switchedAwayCount, 0);

  const activeConceptIds = new Set(
    heatmapRows.flatMap((s) =>
      Object.entries(s.levels)
        .filter(([, level]) => level && level !== "not-seen")
        .map(([id]) => id)
    )
  );
  const heatmapConcepts =
    activeConceptIds.size > 0
      ? concepts.filter((c) => activeConceptIds.has(c.id))
      : concepts.slice(0, 8);

  const engagementItems = (
    conceptProgress.filter((c) => c.engagedPercent > 0).length > 0
      ? conceptProgress.filter((c) => c.engagedPercent > 0)
      : conceptProgress
  ).slice(0, 5);

  const topMode = modeUsage.reduce(
    (best, m) => (m.switchedAwayPercent > (best?.switchedAwayPercent ?? 0) ? m : best),
    modeUsage[0]
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "#fdf8f5", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <SectionHead
          title="Analytics."
          meta={`${displayTitle} · ${totalEnrolled} student${totalEnrolled === 1 ? "" : "s"}`}
        />

        <LaicPanel title="Your courses" className="mb-6">
          {instructorCourses.length === 0 ? (
            <p className="text-sm text-[#62748e]">No courses yet — create one from Lessons.</p>
          ) : (
            <div className="space-y-2">
              {instructorCourses.map((course) => {
                const active = course.id === courseId;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => loadCourse(course.id).catch(console.error)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                      active
                        ? "border-[#602424] bg-[#fdf8f5]"
                        : "border-[#e8ddd6] bg-white hover:border-[#602424]/30"
                    }`}
                  >
                    <BookOpen className={`w-4 h-4 shrink-0 ${active ? "text-[#602424]" : "text-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#314158] truncate">{course.title}</p>
                      {active && (
                        <p className="text-xs text-[#62748e] mt-0.5">
                          {concepts.length} units · {modules.length} modules
                        </p>
                      )}
                    </div>
                    {course.published ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Published
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0">
                        Draft
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {coursePublished && courseId && (
            <p className="text-xs text-[#62748e] mt-4">
              Students can join with your classroom code from Challenge Details.
            </p>
          )}
        </LaicPanel>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            value={totalEnrolled ? `${summary?.activeThisWeek ?? 0}/${totalEnrolled}` : "0"}
            label="Active students"
          />
          <StatCard value={`+${summary?.avgMasteryPercent ?? 0}%`} label="Avg mastery gain" />
          <StatCard value={String(modeSwitchTotal || 0)} label="AI interactions" />
          <StatCard value={String(summary?.conceptsMasteredTotal ?? 0)} label="Concepts mastered" />
        </div>

        <LaicPanel title="Mastery heatmap" className="mb-6">
          <div className="flex justify-end mb-5 -mt-2">
            <MasteryLegend />
          </div>
          {heatmapRows.length === 0 ? (
            <p className="text-sm text-[#62748e] py-8 text-center">
              No enrolled students yet. Publish your course to enroll the class.
            </p>
          ) : heatmapConcepts.length === 0 ? (
            <p className="text-sm text-[#62748e] py-8 text-center">
              {concepts.length === 0
                ? "Publish your course to create learning units for students."
                : "No student activity on these units yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={`text-left ${laic.labelCaps} pb-4 pr-4 w-24`}>Student</th>
                    {heatmapConcepts.map((c) => (
                      <th key={c.id} className={`${laic.labelCaps} pb-4 px-1 text-center font-normal`}>
                        <div className="max-w-[80px] truncate mx-auto" title={c.name}>
                          {c.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapRows.map(({ userId, name, levels }) => (
                    <tr key={userId}>
                      <td className="py-3 pr-4 text-[#62748e] font-medium whitespace-nowrap">{name}</td>
                      {heatmapConcepts.map((c) => (
                        <td key={c.id} className="py-3 px-1">
                          <div className="flex justify-center">
                            <HeatmapCell level={levels[c.id] as MasteryLevel} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LaicPanel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <LaicPanel
            title="Misconceptions"
            badge={
              (summary?.recentMisconceptionCount ?? 0) > 0 ? (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                  {summary!.recentMisconceptionCount} new
                </span>
              ) : undefined
            }
          >
            {misconceptionLog.length === 0 ? (
              <p className="text-sm text-[#62748e]">No misconceptions logged yet.</p>
            ) : (
              <div className="space-y-4">
                {misconceptionLog.map((m, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 mt-2 ${
                        m.severity === "high"
                          ? "bg-red-400"
                          : m.severity === "medium"
                            ? "bg-amber-400"
                            : "bg-[#d6d3d1]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#314158]">{m.issue}</p>
                      <p className="text-xs text-[#62748e] mt-0.5">
                        {m.conceptName} · {m.studentCount} student{m.studentCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openCourseEditor}
                      className="flex items-center gap-1 text-xs font-semibold text-[#62748e] border border-[#d6d3d1] rounded-full px-2.5 py-1 hover:bg-[#f0f2fa] shrink-0"
                    >
                      <Pencil className="w-2.5 h-2.5" /> Fix
                    </button>
                  </div>
                ))}
              </div>
            )}
          </LaicPanel>

          <LaicPanel title="Mode usage">
            <p className="text-xs text-[#62748e] mb-4 -mt-2">Switched away from ↓</p>
            {modeUsage.every((m) => m.switchedAwayCount === 0) ? (
              <p className="text-sm text-[#62748e]">No mode switches recorded yet.</p>
            ) : (
              <div className="space-y-4">
                {modeUsage.map((m) => (
                  <div key={m.mode}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-[#62748e]">{m.modeLabel}</span>
                      <span className="text-[#f6339a] font-medium">{m.switchedAwayPercent}%</span>
                    </div>
                    <ThinBar value={m.switchedAwayPercent} color="#f6339a" />
                  </div>
                ))}
                {topMode && topMode.switchedAwayPercent >= 40 && (
                  <div className="bg-[#eef2ff] border border-[#f6339a] rounded-xl p-3 mt-2">
                    <p className="text-xs text-[#9d174d]">
                      {topMode.modeLabel} has high abandonment — try enabling Conversational by
                      default.
                    </p>
                  </div>
                )}
              </div>
            )}
          </LaicPanel>

          <LaicPanel title="Engagement timeline">
            {engagementItems.length === 0 ? (
              <p className="text-sm text-[#62748e]">No engagement data yet.</p>
            ) : (
              <div className="space-y-4">
                {engagementItems.map((item) => {
                  const pct = item.engagedPercent;
                  const stalled = pct < 50;
                  return (
                    <div key={item.conceptId} className="flex items-center gap-4">
                      <span className="text-sm text-[#62748e] w-32 shrink-0 truncate">{item.name}</span>
                      <div className="flex-1">
                        <ThinBar
                          value={pct}
                          color={stalled ? "#fde047" : "#22c55e"}
                        />
                      </div>
                      <span className="text-sm text-[#62748e] w-10 text-right">{pct}%</span>
                      {stalled && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          stall
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </LaicPanel>

          <LaicPanel title="AI suggestions" titleClassName="text-[#602424]">
            {suggestions.length === 0 ? (
              <p className="text-sm text-[#62748e]">
                Suggestions appear once students start learning.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-[#eef2ff]/60 border border-[#f6339a] rounded-xl p-3"
                  >
                    <p className="text-sm text-[#9d5b8a] flex-1 leading-relaxed">{s.text}</p>
                    <OutlineAction onClick={openCourseEditor}>{s.action}</OutlineAction>
                  </div>
                ))}
              </div>
            )}
          </LaicPanel>
        </div>
      </div>
    </div>
  );
}
