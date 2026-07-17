import type { AppShellConfig } from "../../types";
import { interpolate } from "../../data/constants";

const GLYPHS = ["◆", "◈", "▲", "●", "◇", "■", "☰", "❖"];

export function HomeScreen({ config, role }: { config: AppShellConfig; role: string }) {
  const h = config.homeConfig;
  const name = "Alex";
  const activeRole = role || config.roles[0]?.label || "Member";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 px-5 pb-4 pt-4" style={{ background: config.accentColor }}>
        <p className="text-[10px] font-semibold leading-snug" style={{ color: config.accentForeground, opacity: 0.6 }}>
          {config.name}
        </p>
        <h2 className="mt-0.5 text-[16px] font-bold leading-tight" style={{ color: config.accentForeground }}>
          {interpolate(h.greeting, name, activeRole) || "Welcome!"}
        </h2>
        {h.subtitle && (
          <p className="mt-0.5 text-[10px]" style={{ color: config.accentForeground, opacity: 0.7 }}>
            {interpolate(h.subtitle, name, activeRole)}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 pb-1 pt-3">
        {h.tiles.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {h.tiles.map((t, i) => (
              <div key={`${t.label}-${i}`} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="mb-1.5 text-sm" style={{ color: config.accentColor }}>
                  {GLYPHS[i % GLYPHS.length]}
                </div>
                <p className="text-[11px] font-semibold leading-tight text-gray-800">{t.label}</p>
                {t.description && <p className="mt-0.5 text-[9px] leading-snug text-gray-400">{t.description}</p>}
              </div>
            ))}
          </div>
        )}

        {h.showFeed && (
          <div className="mb-2 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-50 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{h.feedLabel || "Activity"}</p>
              <span className="text-[10px] text-gray-300">›</span>
            </div>
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-2.5 border-b border-gray-50 px-3 py-2.5 last:border-0">
                <div
                  className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[8px] font-bold"
                  style={{ background: `${config.accentColor}20`, color: config.accentColor }}
                >
                  {n}
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-700">Activity {n}</p>
                  <p className="text-[8px] text-gray-400">{n} day{n > 1 ? "s" : ""} ago</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {h.navItems.length > 0 && (
        <div className="flex flex-shrink-0 items-center border-t border-gray-100 px-2 py-2">
          {h.navItems.map((item, i) => {
            const on = i === h.activeNavIndex;
            return (
              <div key={`${item.label}-${i}`} className="flex flex-1 flex-col items-center gap-0.5 py-0.5">
                <div className="h-1 w-1 rounded-full" style={{ background: on ? config.accentColor : "transparent" }} />
                <span className="text-[8px] font-semibold" style={{ color: on ? config.accentColor : "#9ca3af" }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
