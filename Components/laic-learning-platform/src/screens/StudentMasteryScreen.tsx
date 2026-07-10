import { Sparkles } from "lucide-react";
import { MASTERY } from "../constants/ui";
import { useApp } from "../store/AppContext";
import {
  student,
  MASTERY_STAT_COLOR,
  MASTERY_BADGE_BG,
  masteryProgress,
} from "../components/laic/studentTheme";
import type { MasteryLevel } from "../types";

function StatCard({ value, label, level }: { value: number; label: string; level: MasteryLevel }) {
  const color = MASTERY_STAT_COLOR[level];
  return (
    <div className={`${student.card} p-4 flex flex-col h-[88px] justify-between`}>
      <p className="text-[30px] font-black leading-none" style={{ color }}>{value}</p>
      <div className="flex items-center gap-1.5 pt-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold text-[#62748e]">{label}</span>
      </div>
    </div>
  );
}

function MasteryRow({ name, level }: { name: string; level: MasteryLevel }) {
  const color = MASTERY_STAT_COLOR[level];
  const { label } = MASTERY[level];
  const pct = masteryProgress(level);
  return (
    <div className={`flex items-center gap-4 px-5 py-4 ${student.rowBorder}`}>
      <span className="text-sm font-bold text-[#314158] w-36 shrink-0">{name}</span>
      <div className="flex-1 min-w-0">
        <div className="h-2.5 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shrink-0"
        style={{ backgroundColor: MASTERY_BADGE_BG[level], color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
    </div>
  );
}

export function StudentMasteryScreen() {
  const { learner, concepts, courseTitle } = useApp();

  const counts = {
    mastered: concepts.filter((c) => learner.conceptMastery[c.id] === "mastered").length,
    understood: concepts.filter((c) => learner.conceptMastery[c.id] === "understood").length,
    exposed: concepts.filter((c) => learner.conceptMastery[c.id] === "exposed").length,
    practiced: concepts.filter((c) => learner.conceptMastery[c.id] === "practiced").length,
    notStarted: concepts.filter(
      (c) => !learner.conceptMastery[c.id] || learner.conceptMastery[c.id] === "not-seen"
    ).length,
  };

  const nextConcept = concepts.find((c) => {
    const m = learner.conceptMastery[c.id] ?? "not-seen";
    return m === "practiced" || m === "understood";
  });

  return (
    <div className={`flex-1 overflow-y-auto ${student.bg} p-6`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard value={counts.mastered} label="Mastered" level="mastered" />
        <StatCard value={counts.understood} label="Understood" level="understood" />
        <StatCard value={counts.exposed + counts.practiced} label="Exposed" level="exposed" />
        <StatCard value={counts.notStarted} label="Not started" level="not-seen" />
      </div>

      <div className={`${student.card} overflow-hidden mb-5`}>
        <div className={`px-5 py-4 ${student.cardHeader}`}>
          <p className={student.cardHeaderText}>
            {courseTitle || "Course"} — Concept Mastery
          </p>
        </div>
        <div>
          {concepts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#62748e]">No concepts published yet.</p>
          ) : (
            concepts.map((c) => (
              <MasteryRow
                key={c.id}
                name={c.name}
                level={learner.conceptMastery[c.id] ?? "not-seen"}
              />
            ))
          )}
        </div>
      </div>

      {nextConcept && (
        <div className={`${student.card} p-5 flex items-start gap-4`}>
          <div className="w-10 h-10 rounded-xl bg-[#fef3c6] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div>
            <p className="text-base font-black text-[#1d293d]">Next milestone</p>
            <p className="text-sm text-[#62748e] mt-0.5">
              Practice <strong>{nextConcept.name}</strong> 2 more times to reach{" "}
              <strong className="text-[#10b981]">Mastered</strong>!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
