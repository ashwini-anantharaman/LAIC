// Fix-at-the-table VIEW mode (mobile): the item as players read it, restyled
// for the phone sheet — title lives in the sheet header; here we render kind +
// status badges, the precedence band line, the plain-words agreement, the
// saved payload as the SAME English sentences the desktop ItemView shows
// (ruleEnglish helpers, server-side), and a read-only settings section with
// values. Server component — pure rendering, no client state.

import type { SettingValue } from "@bridge/config";
import type { KnowledgeItem, SettingSpec } from "@bridge/kb";
import type { ReactNode } from "react";
import { bandLine, TYPE_LABEL } from "@/components/kb/badges";
import {
  actionSentence,
  auctionRuleSentence,
  forcingRuleSentence,
  leadSentence,
  playRuleSentence,
} from "@/components/kb/ruleEnglish";

const FONT_KARLA = "var(--font-karla), sans-serif";
const FONT_FRAUNCES = "var(--font-fraunces), serif";

const CARD: React.CSSProperties = {
  border: "1px solid #e7e1d3",
  borderRadius: 13,
  background: "#fffefa",
  padding: "12px 13px",
};
const CHIP: React.CSSProperties = {
  font: `600 10px ${FONT_KARLA}`,
  background: "#f0ece2",
  color: "#5e5749",
  padding: "2px 7px",
  borderRadius: 6,
};
const SENTENCE: React.CSSProperties = {
  margin: "7px 0 0",
  font: `400 13px/1.55 ${FONT_FRAUNCES}`,
  color: "#48423a",
};
const FOOT: React.CSSProperties = {
  margin: "7px 0 0",
  font: `400 10px ${FONT_KARLA}`,
  color: "#a49d8e",
};

const STATUS_COLOR: Record<string, [string, string]> = {
  draft: ["#a16207", "#fdf3df"],
  reviewed: ["#205e63", "#e6f3f4"],
  approved: ["#256e42", "#e3efe7"],
  deprecated: ["#8a2d23", "#f6e2df"],
};

const humanize = (s: string) => s.replace(/_/g, " ");

const FALLBACK_PHASE_LABEL: Record<string, string> = {
  auction: "In the auction",
  opening_lead: "On opening lead",
  card_play: "In card play",
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

export function MobileFixView({ item }: Readonly<{ item: KnowledgeItem }>) {
  // $setting refs resolve against the item's own declared defaults — the same
  // values a fresh player sees before any overrides (mirrors desktop ItemView).
  const values: Record<string, SettingValue> = Object.fromEntries(
    item.settings.map((s) => [s.key, s.default]),
  );
  const band = bandLine(item.knowledgeType);
  const [statusColor, statusBg] = STATUS_COLOR[item.status] ?? ["#5e5749", "#f0ece2"];

  const p = item.payload;
  let body: ReactNode;
  if (p.kind === "auction_rules") {
    body = [...p.rules]
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => (
        <section key={rule.key} style={CARD}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <h4 style={{ margin: 0, font: `600 13px ${FONT_KARLA}`, color: "#1d1a15" }}>
              {rule.label}
            </h4>
            <span style={CHIP}>{actionSentence(rule.action)}</span>
          </div>
          <p style={SENTENCE}>{auctionRuleSentence(rule, values)}</p>
          <p style={FOOT}>
            key {rule.key} · priority {rule.priority}
          </p>
        </section>
      ));
  } else if (p.kind === "forcing_rules") {
    body = [...p.rules]
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => (
        <section key={rule.key} style={CARD}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <h4 style={{ margin: 0, font: `600 13px ${FONT_KARLA}`, color: "#1d1a15" }}>
              {rule.label}
            </h4>
            <span style={CHIP}>no pass</span>
          </div>
          <p style={SENTENCE}>{forcingRuleSentence(rule)}</p>
          <p style={FOOT}>
            key {rule.key} · priority {rule.priority}
          </p>
        </section>
      ));
  } else if (p.kind === "lead_rules") {
    body = (
      <section style={CARD}>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {p.leads.map((lead, i) => (
            <li key={i} style={{ ...SENTENCE, margin: i ? "5px 0 0" : 0 }}>
              {leadSentence(lead)}
            </li>
          ))}
        </ul>
      </section>
    );
  } else if (p.kind === "play_rules") {
    body = (
      <section style={CARD}>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {[...p.rules]
            .sort((a, b) => a.priority - b.priority)
            .map((rule, i) => (
              <li key={i} style={{ ...SENTENCE, margin: i ? "5px 0 0" : 0 }}>
                {playRuleSentence(rule)}
              </li>
            ))}
        </ul>
      </section>
    );
  } else if (p.kind === "signals") {
    body = (
      <section style={CARD}>
        {(
          [
            ["Attitude", p.signals.attitude],
            ["Count", p.signals.count],
            ["First discard", p.signals.firstDiscard],
          ] as const
        ).map(([label, value]) => (
          <p key={label} style={{ ...SENTENCE, margin: "3px 0" }}>
            <span style={{ color: "#7b7466", fontFamily: FONT_KARLA, fontSize: 11 }}>
              {label}:
            </span>{" "}
            {value ? humanize(value) : "not specified"}
          </p>
        ))}
      </section>
    );
  } else if (p.kind === "fallback") {
    body = (
      <section style={CARD}>
        <p style={{ ...SENTENCE, margin: 0 }}>
          {FALLBACK_PHASE_LABEL[p.fallback.phase] ?? p.fallback.phase}, when nothing else
          applies: {humanize(p.fallback.behavior)}.
        </p>
      </section>
    );
  } else {
    body = (
      <p
        style={{
          border: "1px dashed #d3ccbb",
          borderRadius: 13,
          padding: 14,
          font: `400 12px ${FONT_KARLA}`,
          color: "#a49d8e",
          margin: 0,
        }}
      >
        Teaching content — this item carries no machine rules.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* kind + status badges and the precedence band line */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={CHIP}>{TYPE_LABEL[item.knowledgeType]}</span>
        <span style={{ ...CHIP, color: statusColor, background: statusBg }}>{item.status}</span>
      </div>
      {band && (
        <p style={{ margin: 0, font: `400 11px ${FONT_KARLA}`, color: "#7b7466" }}>{band}</p>
      )}

      {/* the agreement, in plain words */}
      <p
        style={{
          margin: 0,
          font: `400 14px/1.55 ${FONT_FRAUNCES}`,
          color: "#1d1a15",
          borderLeft: "3px solid #205e63",
          paddingLeft: 10,
        }}
      >
        {item.humanReadableText}
      </p>

      {body}

      {item.settings.length > 0 && (
        <section>
          <h3
            style={{
              margin: "4px 0 8px",
              font: `600 10px ${FONT_KARLA}`,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#a49d8e",
            }}
          >
            Settings
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {item.settings.map((spec) => (
              <div key={spec.key} style={CARD}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <h4 style={{ margin: 0, font: `600 13px ${FONT_KARLA}`, color: "#1d1a15" }}>
                    {spec.label}
                  </h4>
                  <span style={CHIP}>{spec.key}</span>
                </div>
                <p style={{ ...FOOT, fontSize: 11, color: "#5e5749" }}>
                  {spec.control.replace(/_/g, " ")} ·{" "}
                  {spec.role === "enable" ? "enable (on/off gate)" : "parameter"} · default{" "}
                  {settingDefaultText(spec)}
                </p>
                {spec.description && <p style={FOOT}>{spec.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
