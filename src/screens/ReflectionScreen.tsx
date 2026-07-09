import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { CONTENT_MODES } from "../constants/ui";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { CheckCircle } from "../components/laic/shared";
import { laic } from "../components/laic/ui";
import { student } from "../components/laic/studentTheme";

export function ReflectionScreen() {
  const {
    setScreen,
    completeReflection,
    learner,
    courseId,
    concepts,
    prerequisiteGraph,
    activeConceptId,
  } = useApp();
  const conceptId = learner.lastSessionConcept ?? activeConceptId ?? concepts[0]?.id ?? "";
  const concept = concepts.find((c) => c.id === conceptId);
  const conceptName = concept?.name ?? "this concept";

  const [answers, setAnswers] = useState(["", ""]);
  const [questions, setQuestions] = useState<string[]>([
    `What's one thing about ${conceptName} that genuinely surprised you?`,
    "What's still fuzzy or confusing? Be honest — it helps your AI tutor.",
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<
    Awaited<ReturnType<typeof Agents.planner.getPostReflectionRecommendation>> | null
  >(null);

  useEffect(() => {
    if (!courseId || !conceptName) return;
    Agents.conceptTutor
      .generateReflectionPrompt(courseId, conceptName)
      .then((res) => {
        const qs = [res.prompt, ...(res.followUpQuestions ?? [])].slice(0, 2);
        if (qs.length >= 1) setQuestions(qs);
      })
      .catch(console.error);
  }, [courseId, conceptName]);

  const handleSubmit = async () => {
    if (!courseId || !conceptId || busy) return;
    setBusy(true);
    try {
      const result = await Agents.reflection.submitSessionReflection(conceptId, answers, courseId);
      if (result.accepted) {
        completeReflection(conceptId);
        const rec = await Agents.planner.getPostReflectionRecommendation(
          conceptId,
          learner,
          prerequisiteGraph,
          concepts.map((c) => ({ id: c.id, name: c.name })),
          courseId
        );
        setRecommendation(rec);
        setSubmitted(true);
      } else {
        setFollowUp(result.followUp ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  const defaultMode = learner.defaultMode;

  return (
    <div className={`flex-1 ${student.bg} flex items-center justify-center p-8 overflow-y-auto font-['Nunito',sans-serif]`}>
      <div className={`${student.card} p-8 w-full max-w-lg shadow-sm`}>
        {!submitted ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-[#eef2ff] flex items-center justify-center text-xl">🪞</div>
              <div>
                <p className={`font-bold text-[#314158] ${laic.font}`}>Session reflection</p>
                <p className="text-xs text-[#62748e]">Reflection Agent · {conceptName}</p>
              </div>
            </div>
            <div className="bg-[#eef2ff] border border-[#eef2ff] rounded-2xl p-4 my-5">
              <p className={`text-sm font-bold text-[#314158] mb-1 ${laic.font}`}>Your session</p>
              <div className="flex items-center gap-4 text-xs text-[#62748e] flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {learner.sessionLength ?? "30 min"}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle /> Concept: {conceptName}
                </span>
                <span>
                  Mode: {CONTENT_MODES[defaultMode].emoji} {CONTENT_MODES[defaultMode].label}
                </span>
              </div>
            </div>
            <h2 className={`text-lg font-bold text-[#314158] mb-1 ${laic.font}`}>Before you go…</h2>
            <p className="text-sm text-[#62748e] mb-5 leading-relaxed">
              The Reflection Agent uses your answer to personalise future sessions and catch shallow understanding early.
            </p>
            <div className="space-y-4 mb-6">
              {questions.map((q, i) => (
                <div key={i}>
                  <label className="block text-sm font-semibold text-[#314158] mb-1.5">{q}</label>
                  <textarea
                    rows={3}
                    value={answers[i] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => {
                        const n = [...a];
                        n[i] = e.target.value;
                        return n;
                      })
                    }
                    className="w-full border border-[#eef2ff] rounded-xl px-3 py-2 text-sm text-[#314158] placeholder:text-[#62748e] focus:outline-none focus:ring-2 focus:ring-[#432dd7]/20 focus:border-[#f6339a] resize-none transition-all"
                    placeholder="Write freely — no right answer here…"
                  />
                </div>
              ))}
            </div>
            {followUp && <p className="text-sm text-[#f6339a] mb-4 italic">{followUp}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !answers.some((a) => a.trim())}
              className="w-full py-3 bg-[#432dd7] text-white rounded-full font-bold text-sm hover:bg-[#3730a3] transition-all disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit & continue →"}
            </button>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✨</div>
            <h2 className={`text-xl font-bold text-[#314158] mb-2 ${laic.font}`}>Reflection saved!</h2>
            <p className="text-sm text-[#62748e] mb-3 leading-relaxed">
              Your AI tutor will reference this in your next session.
            </p>
            {recommendation && (
              <div className="bg-[#eef2ff] border border-[#eef2ff] rounded-2xl p-4 mb-6 text-left">
                <p className="text-xs font-bold text-[#432dd7] mb-1">Planner Agent recommendation</p>
                <p className="text-sm text-[#314158]">
                  Next session: <strong>{recommendation.conceptName}</strong> in{" "}
                  <strong>
                    {CONTENT_MODES[recommendation.mode].emoji} {CONTENT_MODES[recommendation.mode].label}
                  </strong>{" "}
                  mode — {recommendation.reason}.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setScreen("student-courses")}
              className="px-8 py-3 bg-[#432dd7] text-white rounded-full font-bold text-sm hover:bg-[#3730a3] transition-all"
            >
              Back to courses
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
