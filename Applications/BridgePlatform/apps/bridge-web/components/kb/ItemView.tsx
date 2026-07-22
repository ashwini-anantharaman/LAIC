// Read-only knowledge view (view-first items): the saved payload rendered as
// the same plain-English sentences the editor narrates live, plus a read-only
// settings section. Server component — pure rendering over ruleEnglish.

import type { SettingValue } from "@bridge/config";
import type { KnowledgeItem, SettingSpec } from "@bridge/kb";
import type { ReactNode } from "react";
import {
  actionSentence,
  auctionRuleSentence,
  forcingRuleSentence,
  leadSentence,
  playRuleSentence,
} from "./ruleEnglish";

const CONTROL_LABEL: Record<SettingSpec["control"], string> = {
  toggle: "toggle",
  single_select: "single select",
  multi_select: "multi select",
  range_hcp: "HCP range",
  number: "number",
};

/** A setting default as compact text — HcpRange as "15–17", boolean as on/off. */
function settingDefaultText(spec: SettingSpec): string {
  const v = spec.default;
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (v && typeof v === "object") {
    const range = v as { low?: number; high?: number };
    if (typeof range.low === "number" && typeof range.high === "number")
      return `${range.low}–${range.high}`;
  }
  return String(v);
}

const card = "rounded-xl border border-neutral-200 bg-[var(--card)] p-4 shadow-sm";
const chip =
  "rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600";

function RuleList({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="space-y-3">{children}</div>;
}

const humanize = (s: string) => s.replace(/_/g, " ");

const FALLBACK_PHASE_LABEL: Record<string, string> = {
  auction: "In the auction",
  opening_lead: "On opening lead",
  card_play: "In card play",
};

/** The saved machine payload, rendered read-only (spec §6 view mode). */
export function ItemView({ item }: Readonly<{ item: KnowledgeItem }>) {
  // $setting refs resolve against the item's own declared defaults — the same
  // values a fresh player sees before any overrides.
  const values: Record<string, SettingValue> = Object.fromEntries(
    item.settings.map((s) => [s.key, s.default]),
  );
  const enable = item.settings.find((s) => s.role === "enable");
  const gate = enable && (
    <>
      {" "}
      · gated by <span className="font-mono">{enable.key}</span> (default{" "}
      {enable.default ? "on" : "off"})
    </>
  );

  const p = item.payload;
  let body: ReactNode;
  if (p.kind === "auction_rules") {
    body = (
      <RuleList>
        {[...p.rules]
          .sort((a, b) => a.priority - b.priority)
          .map((rule) => (
            <section key={rule.key} className={card}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium">{rule.label}</h4>
                <span className={chip}>{actionSentence(rule.action)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                {auctionRuleSentence(rule, values)}
              </p>
              <p className="mt-2 text-[11px] text-neutral-400">
                key <span className="font-mono">{rule.key}</span> · priority {rule.priority}
                {gate}
              </p>
            </section>
          ))}
      </RuleList>
    );
  } else if (p.kind === "forcing_rules") {
    body = (
      <RuleList>
        {[...p.rules]
          .sort((a, b) => a.priority - b.priority)
          .map((rule) => (
            <section key={rule.key} className={card}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium">{rule.label}</h4>
                <span className={chip}>no pass</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                {forcingRuleSentence(rule)}
              </p>
              <p className="mt-2 text-[11px] text-neutral-400">
                key <span className="font-mono">{rule.key}</span> · priority {rule.priority}
                {gate}
              </p>
            </section>
          ))}
      </RuleList>
    );
  } else if (p.kind === "lead_rules") {
    body = (
      <section className={card}>
        <ul className="space-y-1.5 text-sm leading-relaxed text-neutral-700">
          {p.leads.map((lead, i) => (
            <li key={i}>{leadSentence(lead)}</li>
          ))}
        </ul>
      </section>
    );
  } else if (p.kind === "play_rules") {
    body = (
      <section className={card}>
        <ul className="space-y-1.5 text-sm leading-relaxed text-neutral-700">
          {[...p.rules]
            .sort((a, b) => a.priority - b.priority)
            .map((rule, i) => (
              <li key={i}>{playRuleSentence(rule)}</li>
            ))}
        </ul>
      </section>
    );
  } else if (p.kind === "signals") {
    body = (
      <section className={card}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {(
            [
              ["Attitude", p.signals.attitude],
              ["Count", p.signals.count],
              ["First discard", p.signals.firstDiscard],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-neutral-500">{label}</dt>
              <dd className="text-neutral-700">
                {value ? humanize(value) : <span className="text-neutral-400">not specified</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  } else if (p.kind === "fallback") {
    body = (
      <section className={card}>
        <p className="text-sm leading-relaxed text-neutral-700">
          {FALLBACK_PHASE_LABEL[p.fallback.phase] ?? p.fallback.phase}, when nothing else
          applies: {humanize(p.fallback.behavior)}.
        </p>
      </section>
    );
  } else {
    body = (
      <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        Teaching content — this item carries no machine rules.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {body}

      {item.settings.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Settings
          </h3>
          <div className="space-y-3">
            {item.settings.map((spec) => (
              <div key={spec.key} className={card}>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-medium">{spec.label}</h4>
                  <span className={chip}>{spec.key}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-neutral-500">Control</dt>
                  <dd className="text-neutral-700">{CONTROL_LABEL[spec.control]}</dd>
                  <dt className="text-neutral-500">Role</dt>
                  <dd className="text-neutral-700">
                    {spec.role === "enable" ? "enable (on/off gate)" : "parameter"}
                  </dd>
                  <dt className="text-neutral-500">Default</dt>
                  <dd className="text-neutral-700">{settingDefaultText(spec)}</dd>
                </dl>
                {spec.description && (
                  <p className="mt-2 text-xs text-neutral-500">{spec.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
