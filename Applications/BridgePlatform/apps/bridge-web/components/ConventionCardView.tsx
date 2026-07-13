import type { SettingValue } from "@bridge/config";
import type { ConventionCard } from "@bridge/profiles";
import { formatSettingValue } from "./SettingControl";

/**
 * The convention card as a card (prototype parity, ACBL spirit): a printable
 * two-column document generated from the resolved configuration — never
 * hand-edited. Settings that differ from the package defaults are highlighted
 * amber, exactly like the prototype's off-base marks; agreements gated off by
 * the configuration render struck-through.
 */
export function ConventionCardView({
  card,
  defaults,
  subtitle,
}: Readonly<{
  card: ConventionCard;
  /** Package-default values — the baseline for off-base highlighting. */
  defaults: Record<string, SettingValue>;
  subtitle?: string;
}>) {
  const offBase = (key: string, value: SettingValue) =>
    JSON.stringify(defaults[key]) !== JSON.stringify(value);

  return (
    <div className="convention-card overflow-hidden rounded-xl border-2 border-emerald-900/70 bg-[#fffdf6] shadow-md print:border-black print:shadow-none">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-emerald-900/70 bg-emerald-900 px-5 py-3 text-emerald-50 print:bg-white print:text-black">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-200/70 print:text-neutral-500">
            Convention card
          </p>
          <h2 className="font-serif text-xl font-medium text-white print:text-black">
            {card.profileName}
          </h2>
        </div>
        <div className="text-right text-[11px] text-emerald-200/70 print:text-neutral-500">
          {subtitle && <p>{subtitle}</p>}
          <p>
            {card.packageRef.packageId}@{card.packageRef.version} · config{" "}
            <span className="font-mono">{card.resolvedValueHash}</span>
          </p>
        </div>
      </header>

      <div className="border-b border-dashed border-neutral-300 px-5 py-2.5">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="font-medium uppercase tracking-wide text-neutral-500">
            Agreements
          </span>
          {card.settings
            .filter((s) => !s.uiOnly || offBase(s.key, s.value))
            .map((s) => (
              <span
                key={s.key}
                className={
                  offBase(s.key, s.value)
                    ? "rounded bg-amber-100 px-1.5 py-0.5 text-amber-900"
                    : "text-neutral-600"
                }
                title={offBase(s.key, s.value) ? "Differs from the package default" : undefined}
              >
                {s.label}: <span className="font-medium">{formatSettingValue(s.value)}</span>
              </span>
            ))}
          {(() => {
            const hidden = card.settings.filter((s) => s.uiOnly && !offBase(s.key, s.value)).length;
            return hidden > 0 ? (
              <span className="text-neutral-400">
                + {hidden} recorded agreement{hidden === 1 ? "" : "s"} at their defaults
              </span>
            ) : null;
          })()}
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
        {card.sections.map((section) => (
          <div key={section.title} className="break-inside-avoid">
            <h3 className="mb-1.5 border-b border-neutral-200 pb-1 font-serif text-sm font-semibold text-emerald-900">
              {section.title}
            </h3>
            <ul className="space-y-1 text-[13px] leading-snug">
              {section.entries.map((e) => (
                <li
                  key={e.ruleId}
                  className={
                    e.active
                      ? "flex items-baseline justify-between gap-2"
                      : "flex items-baseline justify-between gap-2 text-neutral-400"
                  }
                >
                  <span className={e.active ? "" : "line-through"}>{e.label}</span>
                  <span className="shrink-0 text-[10px] text-neutral-400">
                    {e.active
                      ? e.settingKeys.some((k) => offBase(k, card.settings.find((s) => s.key === k)?.value as SettingValue))
                        ? "modified"
                        : ""
                      : "off"}
                  </span>
                </li>
              ))}
              {section.entries.length === 0 && (
                <li className="text-neutral-400">no agreements in this section</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <footer className="border-t border-dashed border-neutral-300 px-5 py-2 text-[10px] text-neutral-400">
        Generated from the configuration — every line resolves to a cited, readable rule.
        Struck lines are gated off by these agreements; amber marks differ from the package
        defaults.
      </footer>
    </div>
  );
}
