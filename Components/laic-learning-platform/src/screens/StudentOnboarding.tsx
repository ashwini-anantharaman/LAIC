import { useState } from "react";
import { Check } from "lucide-react";
import type { ContentMode } from "../types";
import { useApp } from "../store/AppContext";
import { ObShell } from "../components/owlwise/primitives";
import { OWLWISE_TO_CONTENT } from "../constants/owlwiseTheme";
import type { OwlwiseMode } from "../constants/owlwiseTheme";

const GRADES = ["6th", "7th", "8th", "9th", "10th", "11th", "12th", "College"];

const VISUAL_OPTIONS = [
  {
    id: "newspaper",
    label: "Newspaper",
    desc: "Dense, article-style layout with rich typography",
  },
  {
    id: "interactive",
    label: "Chat",
    desc: "Conversational, message-based learning",
  },
];

const STYLE_OPTIONS: { id: OwlwiseMode | "instructor"; label: string; desc: string }[] = [
  { id: "interactive", label: "Interactive", desc: "Message-by-message, like a conversation with a tutor" },
  { id: "summary", label: "Summary", desc: "Concise newspaper-style articles covering the key ideas" },
  { id: "narrative", label: "Narrative", desc: "Story-driven content that brings concepts to life" },
  { id: "instructor", label: "As your teacher designed it", desc: "Exactly how your instructor put it together" },
];

export function StudentOnboarding() {
  const { updateLearner, saveLearnerOnboarding, setScreen } = useApp();
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState("");
  const [visual, setVisual] = useState("");
  const [style, setStyle] = useState<OwlwiseMode | "instructor" | "">("");

  const finish = () => {
    const defaultMode: ContentMode =
      style === "instructor" || !style
        ? "conversational"
        : OWLWISE_TO_CONTENT[style];
    updateLearner({
      age: grade,
      goal: visual === "newspaper" ? "Textbook-style reading" : "Conversational learning",
      defaultMode,
      sessionLength: "30 min",
    });
    void saveLearnerOnboarding();
  };

  if (step === 0) {
    return (
      <ObShell step={0} total={3} onBack={() => setScreen("login")} onNext={() => setStep(1)} nextDisabled={!grade}>
        <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">What grade are you in?</h2>
        <p className="text-[14px] text-gray-500 mb-8">
          We use this to set the right reading level and content depth.
        </p>
        <div className="grid grid-cols-4 gap-2.5">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={`py-3.5 rounded-xl text-[14px] font-medium border transition-all active:scale-95 ${
                grade === g
                  ? "bg-[#602424] text-white border-[#602424]"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </ObShell>
    );
  }

  if (step === 1) {
    return (
      <ObShell step={1} total={3} onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!visual}>
        <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">How do you like to read?</h2>
        <p className="text-[14px] text-gray-500 mb-8">
          This sets your default reading layout. You can switch any time.
        </p>
        <div className="flex flex-col gap-3">
          {VISUAL_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setVisual(o.id)}
              className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                visual === o.id ? "border-[#602424]" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex-1">
                <p className="font-semibold text-[15px] text-gray-900">{o.label}</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{o.desc}</p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  visual === o.id ? "bg-[#602424] border-[#602424]" : "border-gray-300"
                }`}
              >
                {visual === o.id && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
            </button>
          ))}
        </div>
      </ObShell>
    );
  }

  return (
    <ObShell
      step={2}
      total={3}
      onBack={() => setStep(1)}
      onNext={finish}
      nextLabel="Start learning"
      nextDisabled={!style}
    >
      <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">How do you learn best?</h2>
      <p className="text-[14px] text-gray-500 mb-8">You can always switch formats mid-lesson.</p>
      <div className="flex flex-col gap-2.5">
        {STYLE_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setStyle(o.id)}
            className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
              style === o.id ? "border-[#602424]" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex-1">
              <p className="font-semibold text-[15px] text-gray-900">{o.label}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{o.desc}</p>
            </div>
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                style === o.id ? "bg-[#602424] border-[#602424]" : "border-gray-300"
              }`}
            >
              {style === o.id && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
          </button>
        ))}
      </div>
    </ObShell>
  );
}
