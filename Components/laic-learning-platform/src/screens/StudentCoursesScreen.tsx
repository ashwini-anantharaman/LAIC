import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "../store/AppContext";
import { Shell, StatusBar, OwlAnim } from "../components/owlwise/primitives";

export function StudentCoursesScreen() {
  const { setScreen, learner, concepts, courseId, studentEnrollments, loadCourse, joinCourseByCode } = useApp();
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
      setScreen("student-concept");
    } finally {
      setLoadingCourse(null);
    }
  };

  const firstName = learner.name.split(" ")[0] || "there";

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
      setJoinError(e instanceof Error ? e.message : "Could not join — check the code and try again.");
    } finally {
      setJoinBusy(false);
    }
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="px-6 pt-2 pb-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[13px] text-gray-500 font-medium">Good morning,</p>
            <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight leading-tight">
              {firstName === "there" ? "My courses" : firstName}
            </h2>
          </div>
          <OwlAnim className="w-12 h-12 object-contain" />
        </div>

        <button
          type="button"
          onClick={() => setJoining(true)}
          className="w-full mb-5 py-3.5 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 text-[14px] font-medium flex items-center justify-center gap-2 hover:border-[#602424] hover:text-[#602424] transition-all active:scale-[0.98]"
        >
          <span className="text-[20px] leading-none font-light">+</span> Join a course
        </button>

        {studentEnrollments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-600 mb-1">No courses yet</p>
            <p className="text-xs text-gray-400">Join with a classroom code or link from your teacher.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {studentEnrollments.map((course) => {
              const isActive = course.courseId === courseId;
              const pct = isActive ? progressPct : 0;
              return (
                <button
                  key={course.courseId}
                  type="button"
                  onClick={() => openCourse(course.courseId)}
                  disabled={!!loadingCourse}
                  className="w-full bg-white rounded-2xl border border-gray-100 p-5 text-left flex flex-col gap-3 active:scale-[0.98] transition-transform shadow-sm disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[#602424] uppercase tracking-widest">
                        {course.subject ?? "Course"}
                      </p>
                      <p className="text-[16px] font-semibold text-gray-900 mt-0.5 leading-snug">{course.title}</p>
                      <p className="text-[12px] text-gray-400 mt-1">
                        {course.instructorName}
                        {isActive && concepts.length > 0 ? ` · ${concepts.length} units` : ""}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#f5ede8] flex items-center justify-center shrink-0">
                      <ChevronRight size={16} className="text-[#602424]" />
                    </div>
                  </div>
                  {isActive && pct > 0 && (
                    <div>
                      <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
                        <span>Progress</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full bg-[#602424] rounded-full"
                        />
                      </div>
                    </div>
                  )}
                  {loadingCourse === course.courseId && (
                    <p className="text-xs text-gray-400">Loading…</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {joining && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-end z-50"
            onClick={() => setJoining(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.28, ease: [0.32, 0, 0.18, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#fdf8f5] rounded-t-3xl p-6 pb-10"
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
              <h3 className="text-[20px] font-bold text-[#2c0312] mb-2">Join a course</h3>
              <p className="text-[13px] text-gray-400 mb-4">
                Enter the classroom code from your teacher — or paste their join link.
              </p>
              <div className="flex flex-col gap-2">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setJoinError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && void submitJoin()}
                  placeholder="OWL-XXXXXX or link"
                  autoFocus
                  className="w-full py-4 px-4 rounded-2xl border-2 border-gray-200 bg-white text-[18px] font-bold text-center tracking-widest text-gray-800 outline-none focus:border-[#602424] transition-all"
                />
                {joinError && (
                  <p className="text-[13px] text-red-600 text-center px-2">{joinError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void submitJoin()}
                  disabled={joinBusy || !code.trim()}
                  className="w-full py-4 rounded-2xl bg-[#602424] text-white text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {joinBusy ? "Joining…" : "Join"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}
