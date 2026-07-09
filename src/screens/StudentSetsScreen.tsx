import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { useApp } from "../store/AppContext";
import { sf } from "../constants/studyFetchTheme";
import { OwlAnim } from "../components/owlwise/primitives";

export function StudentSetsScreen() {
  const {
    setScreen,
    learner,
    concepts,
    courseId,
    studentEnrollments,
    loadCourse,
    joinCourseByCode,
  } = useApp();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState<string | null>(null);

  const masteredCount = concepts.filter((c) =>
    ["mastered", "understood"].includes(learner.conceptMastery[c.id] ?? "not-seen")
  ).length;
  const progressPct = concepts.length ? Math.round((masteredCount / concepts.length) * 100) : 0;

  const openCourse = async (targetCourseId: string) => {
    setLoadingCourse(targetCourseId);
    try {
      await loadCourse(targetCourseId);
      setScreen("student-workspace");
    } finally {
      setLoadingCourse(null);
    }
  };

  const submitJoin = async () => {
    if (!code.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      const enrollment = await joinCourseByCode(code);
      setJoining(false);
      setCode("");
      await openCourse(enrollment.courseId);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Could not join — check the code.");
    } finally {
      setJoinBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Sets</h1>
          <p className="text-sm text-gray-500 mt-1">Your enrolled courses</p>
        </div>
        <button
          type="button"
          onClick={() => setJoining(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: sf.blue }}
        >
          Join course
        </button>
      </div>

      {studentEnrollments.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: sf.border }}>
          <OwlAnim className="w-16 h-16 mx-auto mb-4 object-contain" />
          <p className="font-semibold text-gray-700 mb-1">No courses yet</p>
          <p className="text-sm text-gray-500 mb-4">Join with a classroom code from your teacher.</p>
          <button
            type="button"
            onClick={() => setJoining(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: sf.blue }}
          >
            Join a course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {studentEnrollments.map((course) => {
            const isActive = course.courseId === courseId;
            const pct = isActive ? progressPct : 0;
            return (
              <button
                key={course.courseId}
                type="button"
                onClick={() => openCourse(course.courseId)}
                disabled={!!loadingCourse}
                className="bg-white rounded-2xl border p-5 text-left hover:shadow-md transition-all disabled:opacity-60"
                style={{ borderColor: isActive ? sf.blue : sf.border }}
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                  <GraduationCap size={20} className="text-gray-500" />
                </div>
                <p className="text-sm font-bold text-gray-900 truncate">{course.title}</p>
                <p className="text-xs text-gray-400 mt-1">{course.instructorName}</p>
                {isActive && (
                  <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: sf.blue }}
                    />
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  {isActive ? `${pct}% complete` : "Tap to open"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {joining && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setJoining(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Join a course</h3>
            <p className="text-sm text-gray-500 mb-4">Enter your classroom code from your teacher.</p>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setJoinError(null); }}
              onKeyDown={(e) => e.key === "Enter" && void submitJoin()}
              placeholder="OWL-XXXXXX"
              className="w-full px-4 py-3 rounded-xl border text-center font-bold tracking-widest mb-2 outline-none focus:border-blue-500"
              style={{ borderColor: sf.border }}
              autoFocus
            />
            {joinError && <p className="text-sm text-red-600 mb-2">{joinError}</p>}
            <button
              type="button"
              onClick={() => void submitJoin()}
              disabled={joinBusy || !code.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60"
              style={{ backgroundColor: sf.blue }}
            >
              {joinBusy ? "Joining…" : "Join"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
