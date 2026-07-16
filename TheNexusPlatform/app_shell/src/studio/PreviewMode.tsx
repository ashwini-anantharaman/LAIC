import { useState } from "react";
import type { AppShellConfig, PreviewScreen } from "../types";
import { PREVIEW_STEPS } from "../data/constants";
import { PhoneFrame } from "../preview/PhoneFrame";
import { AppPreview } from "../preview/AppPreview";

/** Full-screen, distraction-free walkthrough of the configured app. */
export function PreviewMode({ config, onExit }: { config: AppShellConfig; onExit: () => void }) {
  const [screen, setScreen] = useState<PreviewScreen>("start");
  const [role, setRole] = useState("");

  function jump(s: PreviewScreen) {
    if (s !== "start" && !role) setRole(config.roles[0]?.label ?? "");
    setScreen(s);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: "#08080c" }}>
      <button
        onClick={onExit}
        className="absolute left-5 top-5 z-10 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
        style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        ‹ Back to studio
      </button>

      <div className="absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2">
        <div
          className="grid h-4 w-4 place-items-center overflow-hidden rounded text-[7px] font-bold"
          style={{ backgroundColor: config.logoUrl ? "transparent" : config.accentColor, color: config.accentForeground }}
        >
          {config.logoUrl ? <img src={config.logoUrl} alt="" className="h-full w-full object-cover" /> : config.logoInitials}
        </div>
        <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
          {config.name || "Preview"}
        </span>
        <span className="rounded px-1.5 py-0.5 font-mono text-[9px]" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }}>
          preview
        </span>
      </div>

      <PhoneFrame size="lg">
        <AppPreview config={config} screen={screen} role={role} onScreen={setScreen} onRole={setRole} />
      </PhoneFrame>

      <div className="mt-6 flex items-center gap-2 rounded-full px-2 py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {PREVIEW_STEPS.map((s) => {
          const on = screen === s.id;
          return (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
              style={on ? { backgroundColor: "#fff", color: "#111" } : { color: "rgba(255,255,255,0.4)" }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
