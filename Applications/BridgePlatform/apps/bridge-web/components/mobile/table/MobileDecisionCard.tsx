// One decision card in the mobile feed sheet — the same English pass as the
// desktop DecisionEntry (buildRuleIndex-resolved labels/provenance, the full
// "Rules considered (N)" trace with matched/rejected rows, the context-skipped
// footer, the Held facts line, fallback/floor tags), restyled for the felt
// sheet. Server-only (the phrasing helpers read the pinned compile). Expand is
// a native <details> so no client state is needed; the Suggest form posts the
// real flagDecisionAction (+mobile=1) and "Fix at table →" links to the
// MOBILE fix overlay (/m/table/{id}?paused={seq}&fix={itemId}) — the phone
// flow never dumps users into desktop chrome; trace rows link the same way.

import type { SettingValue } from "@bridge/config";
import { callLabel, rankLabel, type LogicEvent, type Seat, type Suit } from "@bridge/events";
import Link from "next/link";
import { flagDecisionAction } from "@/app/bridge/table/actions";
import {
  becauseClause,
  humanReason,
  ruleLabel,
  type RuleInfo,
} from "@/components/table/decisionText";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export function MobileDecisionCard({
  event,
  sessionId,
  kbId,
  mySeat,
  rules,
  defaults,
  mode,
}: Readonly<{
  event: LogicEvent;
  sessionId: string;
  kbId: string;
  mySeat?: Seat;
  rules?: Map<string, RuleInfo>;
  defaults?: Record<string, SettingValue>;
  /** mode=learner passthrough, consistent with the page's mobileHref links. */
  mode?: string;
}>) {
  const chosen =
    event.category === "bid-logic-event"
      ? callLabel(event.chosen)
      : `${rankLabel(event.chosen.rank)}${GLYPH[event.chosen.suit]}`;
  const floor = event.reason.startsWith("ENGINE FLOOR");
  const human = event.reason === "human action";
  const matched = event.matchedRuleId ? rules?.get(event.matchedRuleId) : undefined;
  const itemId = matched?.rule.provenance.itemId ?? event.matchedRuleId?.split(".")[0];
  const values: Record<string, SettingValue> = {
    ...defaults,
    ...Object.fromEntries(event.citedSettings.map((s) => [s.key, s.value])),
  };
  const isBidPhase = event.category === "bid-logic-event";
  const samePhaseTotal = rules
    ? [...rules.values()].filter((info) =>
        isBidPhase ? info.kind === "auction" || info.kind === "forcing" : info.kind === "play",
      ).length
    : 0;
  const otherRuleCount = samePhaseTotal - event.trace.length;
  const held = event.facts.hcp !== undefined && (
    <>
      {" "}
      Held: {event.facts.hcp} HCP
      {event.facts.shape && `, ${event.facts.shape.join("=")} shape`}.
    </>
  );

  const [tagText, tagColor, tagBg] = floor
    ? ["engine floor", "#8a2d23", "#f6e2df"]
    : event.fallback
      ? ["fallback", "#a16207", "#fdf3df"]
      : human
        ? ["you", "#5e5749", "#f0ece2"]
        : ["matched", "#256e42", "#e3efe7"];

  const badgeBg = floor ? "#8a2d23" : event.seat === mySeat ? "#205e63" : "#1f5058";
  const modeSuffix = mode ? `&mode=${encodeURIComponent(mode)}` : "";
  const mobileFixHref = (fixItemId: string) =>
    `/m/table/${sessionId}?paused=${event.seq}&fix=${fixItemId}${modeSuffix}`;
  const fixHref = itemId ? mobileFixHref(itemId) : undefined;

  return (
    <details
      style={{
        border: "1px solid #e7e1d3",
        borderRadius: 13,
        background: "#fffefa",
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 13px",
          cursor: "pointer",
          listStyle: "none",
        }}
      >
        <span
          style={{
            display: "flex",
            width: 18,
            height: 18,
            flex: "none",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            background: badgeBg,
            color: "#fff",
            font: "700 10px var(--font-karla), sans-serif",
          }}
        >
          {event.seat}
        </span>
        <span style={{ font: "600 13px var(--font-karla), sans-serif", color: "#1d1a15" }}>
          {chosen}
        </span>
        <span
          style={{
            font: "400 11px var(--font-karla), sans-serif",
            color: "#7b7466",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {event.reason}
        </span>
        <span
          style={{
            flex: "none",
            font: "700 8px var(--font-karla), sans-serif",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: tagColor,
            background: tagBg,
            padding: "2px 6px",
            borderRadius: 5,
          }}
        >
          {tagText}
        </span>
      </summary>

      <div style={{ padding: "0 13px 12px", borderTop: "1px solid #f0ebe0" }}>
        {/* Full English sentence + Held facts (same phrasing as DecisionEntry). */}
        {event.matchedRuleId && (
          <p
            style={{
              font: "400 12.5px/1.5 var(--font-fraunces), serif",
              color: "#48423a",
              margin: "10px 0 0",
            }}
          >
            {matched?.kind === "fallback" ? (
              <>
                No agreement covered this — the fallback item{" "}
                <b>&ldquo;{matched.rule.provenance.itemTitle}&rdquo;</b> chose {chosen}.
              </>
            ) : matched?.kind === "forcing" ? (
              <>
                <b>
                  {event.seat} {chosen}
                </b>{" "}
                — pass wasn&apos;t available — {matched.rule.label}.{held}
              </>
            ) : matched ? (
              <>
                <b>
                  {event.seat} {chosen}
                </b>{" "}
                — {ruleLabel(matched)} (from &ldquo;{matched.rule.provenance.itemTitle}&rdquo;):{" "}
                {becauseClause(matched, values)}.{held}
              </>
            ) : (
              <>
                <b>
                  {event.seat} {chosen}
                </b>{" "}
                — <span title={event.matchedRuleId}>this rule</span>.{held}
              </>
            )}
          </p>
        )}
        {!event.matchedRuleId && (
          <p
            style={{
              font: "400 12.5px/1.5 var(--font-fraunces), serif",
              color: "#48423a",
              margin: "10px 0 0",
            }}
          >
            {event.reason}.{held}
          </p>
        )}

        {/* Rules considered — zebra trace, matched row highlighted green. */}
        {event.trace.length > 0 && (
          <div
            style={{
              marginTop: 9,
              border: "1px solid #ece7db",
              borderRadius: 9,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "#f6f3ec",
                padding: "5px 10px",
                font: "600 8.5px var(--font-karla), sans-serif",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "#a49d8e",
              }}
            >
              Rules considered ({event.trace.length})
            </div>
            {/* Each row links to the MOBILE fix overlay for its rule's item. */}
            {event.trace.map((t, i) => {
              const info = rules?.get(t.ruleId);
              const traceItemId = info?.rule.provenance.itemId ?? t.ruleId.split(".")[0] ?? t.ruleId;
              return (
                <Link
                  key={i}
                  href={mobileFixHref(traceItemId)}
                  title={`Edit this rule (${t.ruleId})`}
                  aria-label={`Open the rule ${info ? ruleLabel(info) : t.ruleId} in the fix editor`}
                  style={{
                    display: "flex",
                    gap: 6,
                    padding: "5px 10px",
                    font: "400 10.5px var(--font-karla), sans-serif",
                    textDecoration: "none",
                    ...(t.matched
                      ? { background: "#eef7f0", color: "#256e42" }
                      : { color: "#7b7466", background: i % 2 ? "#faf8f2" : "#fff" }),
                  }}
                >
                  <span style={{ flex: "none" }}>{t.matched ? "✓" : "·"}</span>
                  <span style={{ fontWeight: 500 }}>
                    {info ? ruleLabel(info) : t.ruleId.split(".").pop()}
                  </span>
                  <span style={{ color: "#a49d8e", fontWeight: 400 }}>
                    {" "}
                    — {humanReason(t)}
                  </span>
                </Link>
              );
            })}
            {rules && otherRuleCount > 0 && (
              <p
                style={{
                  borderTop: "1px solid #ece7db",
                  background: "#faf8f2",
                  padding: "5px 10px",
                  font: "400 9.5px/1.4 var(--font-karla), sans-serif",
                  color: "#a49d8e",
                  margin: 0,
                }}
              >
                {otherRuleCount} other {isBidPhase ? "bidding" : "play"} rules didn&apos;t apply to
                this position (different seat/auction context, or a set this player doesn&apos;t
                carry).
              </p>
            )}
          </div>
        )}

        {/* Candidate pool. */}
        {event.candidates.length > 1 && (
          <p
            style={{
              font: "400 11px var(--font-karla), sans-serif",
              color: "#7b7466",
              margin: "8px 0 0",
            }}
          >
            Pool:{" "}
            {event.candidates
              .map((c) =>
                typeof c === "string" ? callLabel(c) : `${rankLabel(c.rank)}${GLYPH[c.suit]}`,
              )
              .join(", ")}
          </p>
        )}
        {event.citedSettings.length > 0 && (
          <p
            style={{
              font: "400 11px var(--font-karla), sans-serif",
              color: "#7b7466",
              margin: "4px 0 0",
            }}
          >
            Settings consulted:{" "}
            {event.citedSettings.map((s) => `${s.label} = ${JSON.stringify(s.value)}`).join("; ")}
          </p>
        )}

        {/* Suggest a fix (inline note → flagDecisionAction) + Fix at table
            (the MOBILE fix overlay — view-first, then the phone editor). */}
        <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "flex-start" }}>
          <form
            action={flagDecisionAction}
            style={{ flex: 1, display: "flex", gap: 4, flexDirection: "column" }}
          >
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="seq" value={event.seq} />
            <input type="hidden" name="mobile" value="1" />
            {itemId && <input type="hidden" name="itemId" value={itemId} />}
            <input
              name="text"
              placeholder="What looks wrong?"
              aria-label="Suggest a fix"
              style={{
                width: "100%",
                border: "1px solid #d3ccbb",
                borderRadius: 8,
                padding: "6px 8px",
                font: "400 11px var(--font-karla), sans-serif",
                color: "#1d1a15",
              }}
            />
            <button
              type="submit"
              style={{
                border: "1px solid #d3ccbb",
                background: "#fff",
                borderRadius: 8,
                padding: "7px 0",
                font: "600 11px var(--font-karla), sans-serif",
                color: "#5e5749",
                cursor: "pointer",
              }}
            >
              🚩 Suggest
            </button>
          </form>
          {fixHref && (
            <Link
              href={fixHref}
              aria-label="Fix this rule at the table"
              style={{
                flex: 1,
                textAlign: "center",
                border: "none",
                background: "#205e63",
                borderRadius: 8,
                padding: "7px 0",
                font: "600 11px var(--font-karla), sans-serif",
                color: "#fff",
                textDecoration: "none",
                alignSelf: "flex-end",
              }}
            >
              Fix at table →
            </Link>
          )}
        </div>
      </div>
    </details>
  );
}
