// ACBL-style convention card (owner requirement: always ACBL style). The
// classic look: bordered card stock, masthead, dense two-column section
// boxes with small-caps headers, red/black suit accents, struck entries for
// carried-but-off conventions, amber for off-default values. Printable.

import type { AcblCard } from "@bridge/kb";
import Link from "next/link";
import { formatSettingValue } from "./PlayerSettingControl";

export function AcblCardView({
  card,
  kbId,
}: Readonly<{ card: AcblCard; kbId: string }>) {
  const base = `/bridge/kb/${kbId}`;
  return (
    <div className="convention-card overflow-hidden rounded-sm border-2 border-neutral-900 bg-[#fffdf6] shadow-sm print:shadow-none">
      {/* Masthead */}
      <header className="border-b-2 border-neutral-900 px-4 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em]">
            <span className="text-[var(--madder)]">♥ ♦</span> ACBL Convention Card{" "}
            <span className="text-neutral-900">♠ ♣</span>
          </p>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">
            {card.kbName} · compile v{card.compileVersion}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">Names </span>
            <span className="font-serif text-base font-semibold">{card.playerName}</span>
          </p>
          <p className="text-sm">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              General approach{" "}
            </span>
            <span className="font-medium">{card.systemLabel}</span>
          </p>
        </div>
      </header>

      {/* Section boxes, two-column like the paper card */}
      <div className="grid gap-px bg-neutral-300 sm:grid-cols-2">
        {card.sections.map((section) => (
          <section key={section.id} className="break-inside-avoid bg-[#fffdf6] px-3 py-2">
            <h4 className="mb-1 border-b border-neutral-400 pb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-800">
              {section.title}
            </h4>
            {section.settings.length > 0 && (
              <p className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                {section.settings.map((s) => (
                  <span
                    key={s.key}
                    className={
                      s.offDefault
                        ? "rounded bg-amber-100 px-1 text-amber-900"
                        : "text-neutral-700"
                    }
                    title={s.offDefault ? "differs from the knowledge-base default" : undefined}
                  >
                    {s.label}:{" "}
                    <span className="font-semibold">{formatSettingValue(s.value)}</span>
                  </span>
                ))}
              </p>
            )}
            <ul className="space-y-0.5 text-[12px] leading-snug">
              {section.entries.map((entry) => (
                <li key={entry.ruleId} className="flex items-baseline gap-1.5">
                  <span
                    aria-hidden
                    className={
                      entry.on ? "text-[10px] text-neutral-900" : "text-[10px] text-neutral-300"
                    }
                  >
                    {entry.on ? "☒" : "☐"}
                  </span>
                  <Link
                    href={`${base}/items/${entry.itemId}`}
                    className={
                      entry.on
                        ? "hover:underline"
                        : "text-neutral-400 line-through hover:underline"
                    }
                    title={entry.itemTitle}
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
              {section.entries.length === 0 && (
                <li className="text-[11px] italic text-neutral-400">no agreements</li>
              )}
            </ul>
          </section>
        ))}

        {card.sections.length % 2 === 1 && <div aria-hidden className="bg-[#fffdf6]" />}
        {/* Defensive carding panel — the card's bottom strip */}
        <section className="break-inside-avoid bg-[#fffdf6] px-3 py-2 sm:col-span-2">
          <h4 className="mb-1 border-b border-neutral-400 pb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-800">
            Defensive Carding &amp; Leads
          </h4>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            {card.leads.map((lead, i) => (
              <span key={i} className={lead.on ? "" : "text-neutral-400 line-through"}>
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                  vs {lead.versus === "any" ? "all" : lead.versus}:{" "}
                </span>
                {lead.style}
              </span>
            ))}
            {card.leads.length === 0 && (
              <span className="text-[11px] italic text-neutral-400">no lead agreements</span>
            )}
            <span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                attitude:{" "}
              </span>
              {card.signals.attitude}
            </span>
            <span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">count: </span>
              {card.signals.count}
            </span>
            <span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                first discard:{" "}
              </span>
              {card.signals.firstDiscard}
            </span>
          </div>
        </section>
      </div>

      <footer className="border-t-2 border-neutral-900 px-4 py-1.5 text-[10px] text-neutral-500">
        Generated from the configuration — every line resolves to a cited capability. ☒ in
        force · ☐ carried but switched off
        {card.fallbacks.length > 0 && (
          <> · fallbacks: {card.fallbacks.map((f) => f.label).join("; ")}</>
        )}
      </footer>
    </div>
  );
}
