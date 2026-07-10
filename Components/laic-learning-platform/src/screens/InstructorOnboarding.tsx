import { useState } from "react";
import { Check } from "lucide-react";
import { useApp } from "../store/AppContext";
import { ObShell } from "../components/owlwise/primitives";

const GRADE_LEVELS = ["K-5", "6-8", "9-12", "College", "Mixed"];
const FORMAT_OPTIONS = ["In-person", "Remote", "Hybrid"];
const LOCATION_OPTIONS = ["School", "Home", "Community center", "Other"];

export function InstructorOnboarding() {
  const { updateInstructor, saveInstructorOnboarding, setScreen } = useApp();
  const [step, setStep] = useState(0);

  const [goals, setGoals] = useState("");
  const [grades, setGrades] = useState<string[]>([]);
  const [format, setFormat] = useState("");
  const [location, setLocation] = useState("");
  const [demographicOther, setDemographicOther] = useState("");

  const [challengeName, setChallengeName] = useState("");
  const [challengeDate, setChallengeDate] = useState("");
  const [generateCert, setGenerateCert] = useState(false);
  const [makingChallenge, setMakingChallenge] = useState<boolean | null>(null);

  const toggleGrade = (g: string) => {
    setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const finish = () => {
    updateInstructor({
      template: makingChallenge ? "Challenge" : "Standard",
      preferences: {
        autoGenerateModes: true,
        suggestPrereqGraph: true,
        recommendVideos: true,
        flagStrugglingStudents: true,
      },
    });
    void saveInstructorOnboarding();
  };

  if (step === 0) {
    return (
      <ObShell
        step={0}
        total={3}
        onBack={() => setScreen("login")}
        onNext={() => setStep(1)}
        nextDisabled={!goals.trim()}
      >
        <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">
          What are your goals and guidelines for this class?
        </h2>
        <p className="text-[14px] text-gray-500 mb-6">
          Tell Owlwise how you want content generated — tone, pacing, and any rules for your students.
        </p>
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="e.g. Focus on exam prep, keep language accessible, emphasize real-world applications…"
          rows={6}
          className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 resize-none"
        />
      </ObShell>
    );
  }

  if (step === 1) {
    return (
      <ObShell
        step={1}
        total={3}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={grades.length === 0 || !format}
      >
        <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">
          What is your class demographic?
        </h2>
        <p className="text-[14px] text-gray-500 mb-6">Select all grade levels you teach.</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {GRADE_LEVELS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGrade(g)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                grades.includes(g)
                  ? "bg-[#602424] text-white border-[#602424]"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="text-[13px] font-medium text-gray-700 mb-2">Class format</p>
        <div className="flex flex-col gap-2 mb-4">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex items-center justify-between p-4 rounded-2xl border-2 text-left transition-all ${
                format === f ? "border-[#602424]" : "border-gray-200 bg-white"
              }`}
            >
              <span className="font-semibold text-[15px] text-gray-900">{f}</span>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  format === f ? "bg-[#602424] border-[#602424]" : "border-gray-300"
                }`}
              >
                {format === f && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[13px] font-medium text-gray-700 mb-2">Location</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {LOCATION_OPTIONS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocation(l)}
              className={`py-3 rounded-xl text-sm font-medium border transition-all ${
                location === l
                  ? "bg-[#602424] text-white border-[#602424]"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          value={demographicOther}
          onChange={(e) => setDemographicOther(e.target.value)}
          placeholder="Other notes (optional)"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424]"
        />
      </ObShell>
    );
  }

  return (
    <ObShell
      step={2}
      total={3}
      onBack={() => setStep(1)}
      onNext={finish}
      nextLabel="Continue to upload"
      nextDisabled={makingChallenge === null}
    >
      <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">
        Are you making a challenge for your students?
      </h2>
      <p className="text-[14px] text-gray-500 mb-6">If yes, fill in the challenge details. If not, proceed.</p>

      <div className="flex gap-3 mb-6">
        {[
          { val: true, label: "Yes, set up a challenge" },
          { val: false, label: "No, just a regular course" },
        ].map(({ val, label }) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => setMakingChallenge(val)}
            className={`flex-1 p-4 rounded-2xl border-2 text-sm font-semibold transition-all ${
              makingChallenge === val ? "border-[#602424] bg-[#602424]/5 text-[#602424]" : "border-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {makingChallenge && (
        <div className="space-y-4">
          <div>
            <label className="text-[13px] font-medium text-gray-700">Challenge name</label>
            <input
              value={challengeName}
              onChange={(e) => setChallengeName(e.target.value)}
              placeholder="e.g. Brain Bee 2026"
              className="w-full mt-1.5 px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424]"
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-gray-700">Date of challenge</label>
            <input
              type="date"
              value={challengeDate}
              onChange={(e) => setChallengeDate(e.target.value)}
              className="w-full mt-1.5 px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424]"
            />
          </div>
          <label className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={generateCert}
              onChange={(e) => setGenerateCert(e.target.checked)}
              className="w-4 h-4 accent-[#602424]"
            />
            <span className="text-sm font-medium text-gray-800">Generate certificate at the end?</span>
          </label>
        </div>
      )}
    </ObShell>
  );
}
