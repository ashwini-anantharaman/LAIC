import { useState } from "react";
import { useApp } from "../store/AppContext";
import { ow } from "../components/owlwise/instructorUi";

type Tab = "organization" | "prompts";

export function InstructorSettingsScreen() {
  const { instructor } = useApp();
  const [tab, setTab] = useState<Tab>("organization");

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: ow.bg }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex gap-1 bg-white rounded-2xl border border-[#e8ddd6] p-1 mb-5 shadow-sm">
          {([
            { id: "organization" as const, label: "Organization Details" },
            { id: "prompts" as const, label: "AI Prompts" },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tab === t.id ? ow.tabActive : ow.tabIdle
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "organization" && (
          <div className={`${ow.card} p-6 space-y-4`}>
            <div>
              <label className={ow.label + " mb-1 block"}>Display name</label>
              <input defaultValue={instructor.name} className={ow.input} />
            </div>
            <div>
              <label className={ow.label + " mb-1 block"}>Organization</label>
              <input placeholder="Your school or organization" className={ow.input} />
            </div>
            <div>
              <label className={ow.label + " mb-1 block"}>Email</label>
              <input type="email" placeholder="you@school.edu" className={ow.input} />
            </div>
            <div>
              <label className={ow.label + " mb-1 block"}>New password</label>
              <input type="password" placeholder="••••••••" className={ow.input} />
            </div>
            <button type="button" className={ow.btn} style={ow.btnStyle}>
              Save changes
            </button>
          </div>
        )}

        {tab === "prompts" && (
          <div className={`${ow.card} p-6 space-y-4`}>
            <p className="text-sm text-gray-500 font-medium">
              Customize system prompts by grade level. Overrides apply to all AI generation for this course.
            </p>
            {["Elementary (K-5)", "Middle School", "High School", "College", "Adult"].map((grade) => (
              <div key={grade}>
                <label className={ow.label + " mb-1 block"}>{grade}</label>
                <textarea className={ow.textarea + " h-20"} placeholder="Default system prompt..." />
              </div>
            ))}
            <button type="button" className={ow.btn} style={ow.btnStyle}>
              Save prompts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
