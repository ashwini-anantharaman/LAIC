import { useState } from "react";
import { useApp } from "../store/AppContext";
import { laic } from "../components/laic/ui";
import { CONTENT_MODES } from "../constants/ui";
import type { ContentMode } from "../types";

export function StudentSettingsScreen() {
  const { learner, updateLearner } = useApp();
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [captions, setCaptions] = useState(true);

  const toggleMode = (mode: ContentMode) => {
    updateLearner({ defaultMode: mode });
  };

  return (
    <div className={`flex-1 overflow-y-auto p-6 ${laic.font}`} style={{ backgroundColor: "#f0f2fa" }}>
      <div className="max-w-2xl mx-auto space-y-5">
        <section className="bg-white rounded-2xl border border-[#eef2ff] p-6 shadow-sm">
          <p className={`${laic.labelCaps} mb-4`}>Default explanation mode</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CONTENT_MODES) as [ContentMode, (typeof CONTENT_MODES)[ContentMode]][]).map(
              ([id, { emoji, label }]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleMode(id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                    learner.defaultMode === id
                      ? "bg-[#432dd7] text-white"
                      : "bg-[#f5f5f4] text-[#62748e] hover:bg-[#eef2ff]"
                  }`}
                >
                  <span>{emoji}</span>
                  {label}
                </button>
              )
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-[#eef2ff] p-6 shadow-sm">
          <p className={`${laic.labelCaps} mb-4`}>Accessibility</p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-[#314158] block mb-2">Font size</label>
              <div className="flex gap-2">
                {(["sm", "md", "lg"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setFontSize(size)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold capitalize ${
                      fontSize === size ? "bg-[#432dd7] text-white" : "bg-[#f5f5f4] text-[#62748e]"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            {[
              { label: "High contrast mode", value: highContrast, set: setHighContrast },
              { label: "Reduced motion", value: reducedMotion, set: setReducedMotion },
              { label: "Always show captions & transcripts", value: captions, set: setCaptions },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-semibold text-[#314158]">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  onClick={() => set(!value)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    value ? "bg-[#432dd7]" : "bg-[#e2e8f0]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      value ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
