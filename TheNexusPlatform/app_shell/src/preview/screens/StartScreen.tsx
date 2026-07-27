import { useState } from "react";
import type { AppShellConfig } from "../../types";
import { PAL, Icon, labelIcon } from "../kit";

/** Welcome / role select — hero + radio-select role cards + Continue. */
export function StartScreen({ config, onPickRole }: { config: AppShellConfig; onPickRole: (role: string) => void }) {
  const accent = config.accentColor;
  const [selected, setSelected] = useState(config.roles[0]?.label ?? "");
  const hero = config.welcomeImageUrl || config.logoUrl || null;

  return (
    <div className="flex h-full flex-col" style={{ background: PAL.surface }}>
      {/* Hero */}
      <div className="relative flex-shrink-0" style={{ height: 260 }}>
        {hero ? (
          <img src={hero} alt="" className="h-full w-full object-cover" style={{ opacity: config.welcomeImageUrl ? 1 : 0.5 }} />
        ) : (
          <div className="h-full w-full" style={{ background: `radial-gradient(120% 100% at 70% 15%, ${accent}66, transparent 60%), ${PAL.surface}` }} />
        )}
        <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(14,19,32,0.35) 0%, transparent 32%, rgba(14,19,32,0.85) 82%, ${PAL.surface} 100%)` }} />
        <div className="absolute inset-x-6 bottom-5">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: accent }}>
              {[config.name, config.tagline].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h1 className="text-[27px] font-semibold leading-[1.1] tracking-tight" style={{ color: PAL.ink }}>{config.welcomeTitle || "Welcome"}</h1>
        </div>
      </div>

      {/* Roles */}
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-4">
        {config.welcomeSubtitle && <p className="text-[13px] leading-relaxed" style={{ color: PAL.slate }}>{config.welcomeSubtitle}</p>}
        <div className="mt-5 space-y-2.5">
          {config.roles.map((r, i) => {
            const on = selected === r.label;
            return (
              <button
                key={`${r.label}-${i}`}
                type="button"
                onClick={() => setSelected(r.label)}
                className="flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition-colors"
                style={{ background: on ? `${accent}18` : PAL.card, border: `1.5px solid ${on ? accent : PAL.hairline}` }}
              >
                <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl" style={{ background: PAL.chip }}>
                  <Icon name={labelIcon(r.label)} size={21} color="#C3CCDD" stroke={1.4} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold" style={{ color: PAL.ink }}>{r.label}</span>
                  {r.description && <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: PAL.slate }}>{r.description}</span>}
                </span>
                <span className="grid flex-shrink-0 place-items-center rounded-full" style={{ width: 22, height: 22, background: on ? accent : "transparent", border: `1.5px solid ${on ? accent : PAL.muted}` }}>
                  {on && <Icon name="check" size={12} color={config.accentForeground} stroke={2} />}
                </span>
              </button>
            );
          })}
          {config.roles.length === 0 && (
            <p className="rounded-2xl py-5 text-center text-[11px]" style={{ border: `1px dashed ${PAL.hairline}`, color: PAL.muted }}>
              No roles yet — add one in the Start tab.
            </p>
          )}
        </div>

        <div className="flex-1" />
        <button
          onClick={() => onPickRole(selected || config.roles[0]?.label || "")}
          disabled={!selected && config.roles.length > 0}
          className="h-12 rounded-full text-[15px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: PAL.ink, color: "#0B0F1A" }}
        >
          Continue
        </button>
        <p className="mt-3 text-center text-[12px]" style={{ color: PAL.muted }}>By continuing you agree to our Terms</p>
      </div>
    </div>
  );
}
