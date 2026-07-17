import { useState } from "react";
import type { AppShellConfig, PreviewScreen } from "../types";
import { PREVIEW_STEPS } from "../data/constants";
import { PhoneFrame } from "../preview/PhoneFrame";
import { AppPreview } from "../preview/AppPreview";

/** The right-hand live preview: a stepper + phone, re-rendering as config edits. */
export function StudioPreview({ config }: { config: AppShellConfig }) {
  const [screen, setScreen] = useState<PreviewScreen>("start");
  const [role, setRole] = useState("");

  function jump(s: PreviewScreen) {
    if (s !== "start" && !role) setRole(config.roles[0]?.label ?? "");
    setScreen(s);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden">
      <PhoneFrame size="sm">
        <AppPreview config={config} screen={screen} role={role} onScreen={setScreen} onRole={setRole} />
      </PhoneFrame>

      <div className="flex items-center gap-5">
        {PREVIEW_STEPS.map((s) => {
          const on = screen === s.id;
          return (
            <button key={s.id} onClick={() => jump(s.id)} className="group flex flex-col items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full transition-all duration-200"
                style={{ backgroundColor: on ? config.accentColor : "rgba(255,255,255,0.15)", transform: on ? "scale(1.5)" : "scale(1)" }}
              />
              <span
                className="text-[7px] font-semibold uppercase tracking-wider transition-colors"
                style={{ color: on ? config.accentColor : "rgba(255,255,255,0.18)" }}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[8px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.12)", fontFamily: "'DM Mono', monospace" }}>
        tap to navigate · click dots to jump
      </p>
    </div>
  );
}
