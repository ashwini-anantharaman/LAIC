import type { AppShellConfig } from "../../types";

export function StartScreen({ config, onPickRole }: { config: AppShellConfig; onPickRole: (role: string) => void }) {
  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-3">
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <div
          className="grid h-14 w-14 place-items-center overflow-hidden rounded-[18px] text-base font-bold shadow-lg"
          style={{
            background: config.logoUrl ? "transparent" : config.accentColor,
            color: config.accentForeground,
          }}
        >
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            config.logoInitials
          )}
        </div>
        <div className="mt-1 text-center">
          <h1 className="text-[17px] font-bold leading-tight tracking-tight text-gray-900">{config.name || "My App"}</h1>
          <p className="mt-0.5 text-[10px] text-gray-400">{config.tagline}</p>
        </div>
      </div>

      <div>
        {(config.welcomeTitle || config.welcomeSubtitle) && (
          <div className="mb-3 text-center">
            {config.welcomeTitle && (
              <p className="text-[12px] font-semibold leading-snug text-gray-800">{config.welcomeTitle}</p>
            )}
            {config.welcomeSubtitle && <p className="mt-0.5 text-[10px] text-gray-400">{config.welcomeSubtitle}</p>}
          </div>
        )}
        <div className="space-y-2.5">
          {config.roles.map((r, i) => (
            <div key={`${r.label}-${i}`}>
              <button
                type="button"
                onClick={() => onPickRole(r.label)}
                className="w-full rounded-xl py-2.5 text-sm font-semibold transition-transform active:scale-[0.98]"
                style={{ background: config.accentColor, color: config.accentForeground }}
              >
                {r.label}
              </button>
              {r.description && <p className="mt-1 px-1 text-center text-[9px] text-gray-400">{r.description}</p>}
            </div>
          ))}
          {config.roles.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 py-4 text-center text-[10px] text-gray-400">
              No roles yet — add one in the Start tab.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
