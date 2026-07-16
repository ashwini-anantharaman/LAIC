import type { AppCategory } from "../types";
import { TEMPLATES } from "../data/templates";

/** The New-app flow: choose a template to pre-fill a fresh config. */
export function NewAppPicker({ onPick, onCancel }: { onPick: (category: AppCategory) => void; onCancel: () => void }) {
  return (
    <div className="flex flex-1 flex-col overflow-auto" style={{ backgroundColor: "var(--studio-bg)" }}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-8 py-16">
        <div className="mb-10">
          <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.25)" }}>
            New app
          </p>
          <h1 className="mb-2 text-2xl font-bold" style={{ color: "rgba(255,255,255,0.82)" }}>
            Choose a template
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            Each template pre-fills roles, auth methods, onboarding, and a default home screen. You configure everything on top.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.categoryId}
              onClick={() => onPick(t.categoryId)}
              className="group flex flex-col overflow-hidden rounded-2xl text-left transition-all duration-200"
              style={{ backgroundColor: "#131318", border: "1px solid rgba(255,255,255,0.07)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${t.accent}45`;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div className="relative flex items-center justify-center py-9" style={{ backgroundColor: `${t.accent}10` }}>
                <div
                  className="grid h-12 w-12 place-items-center rounded-2xl text-lg font-bold"
                  style={{ backgroundColor: t.accent, color: t.accentForeground }}
                >
                  {t.defaultInitials}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {t.label}
                  </h3>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.accent }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {t.description}
                </p>
                <div className="space-y-1 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.22)" }}>
                      Roles
                    </span>
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {t.roles.map((r) => r.label).join(" · ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.22)" }}>
                      Tiles
                    </span>
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {t.homeConfig.tiles.length} quick actions
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-xs font-semibold transition-colors" style={{ color: t.accent }}>
                    Use this template
                  </span>
                  <span style={{ color: t.accent }}>→</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            ‹ Back to studio
          </button>
        </div>
      </div>
    </div>
  );
}
