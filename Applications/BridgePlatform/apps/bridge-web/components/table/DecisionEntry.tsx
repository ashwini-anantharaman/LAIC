// One decision in the verification rail (2026-07-16 rework, English pass
// 2026-07-22): what was chosen, why — phrased from the pinned compile's rule
// labels and provenance instead of raw ruleIds — with the full rule trace
// and one-line flagging. Server-only.

import type { SettingValue } from "@bridge/config";
import {
  callLabel,
  rankLabel,
  type LogicEvent,
  type Suit,
} from "@bridge/events";
import Link from "next/link";
import { flagDecisionAction } from "@/app/bridge/table/actions";
import {
  becauseClause,
  humanReason,
  ruleLabel,
  type RuleInfo,
} from "@/components/table/decisionText";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export function DecisionEntry({
  event,
  sessionId,
  kbId,
  fixBase,
  rules,
  defaults,
}: Readonly<{
  event: LogicEvent;
  sessionId: string;
  kbId: string;
  /** Session URL — when set, decisions offer "fix at the table" (overlay). */
  fixBase?: string;
  /** ruleId → compiled rule, from the session's PINNED compile. Absent (old
   *  sessions whose compile went missing) falls back to id-free phrasing. */
  rules?: Map<string, RuleInfo>;
  defaults?: Record<string, SettingValue>;
}>) {
  const chosen =
    event.category === "bid-logic-event"
      ? callLabel(event.chosen)
      : `${rankLabel(event.chosen.rank)}${GLYPH[event.chosen.suit]}`;
  const floor = event.reason.startsWith("ENGINE FLOOR");
  const human = event.reason === "human action";
  const matched = event.matchedRuleId ? rules?.get(event.matchedRuleId) : undefined;
  const itemId = matched?.rule.provenance.itemId ?? event.matchedRuleId?.split(".")[0];
  // $setting refs resolve against the KB defaults, overridden by whatever the
  // decision actually consulted (attribution honesty: cited beats default).
  const values: Record<string, SettingValue> = {
    ...defaults,
    ...Object.fromEntries(event.citedSettings.map((s) => [s.key, s.value])),
  };
  const held = event.facts.hcp !== undefined && (
    <>
      {" "}
      Held: {event.facts.hcp} HCP
      {event.facts.shape && `, ${event.facts.shape.join("=")} shape`}.
    </>
  );
  return (
    <details className="rounded border border-neutral-200 bg-[var(--card)] px-3 py-2">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-2 text-sm">
        <span className="font-mono text-xs text-neutral-400">#{event.seq}</span>
        <span className="font-medium">{event.seat}</span>
        <span>{chosen}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{event.reason}</span>
        {floor ? (
          <span className="rounded bg-red-50 px-1.5 text-[10px] uppercase tracking-wide text-[color:var(--color-invalid)]">
            engine floor
          </span>
        ) : event.fallback ? (
          <span className="rounded bg-amber-50 px-1.5 text-[10px] uppercase tracking-wide text-[color:var(--color-draft)]">
            fallback item
          </span>
        ) : human ? (
          <span className="rounded bg-neutral-100 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
            human
          </span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2 text-xs">
        {event.matchedRuleId && (
          <p>
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
            {itemId && (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/bridge/kb/${kbId}/items/${itemId}`}
                  className="text-emerald-800 underline-offset-2 hover:underline"
                >
                  open the knowledge item →
                </Link>
                {fixBase && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      href={`${fixBase}?paused=${event.seq}&fix=${itemId}`}
                      className="font-medium text-emerald-800 underline-offset-2 hover:underline"
                    >
                      fix at the table →
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
        )}
        {event.candidates.length > 1 && (
          <p className="text-neutral-500">
            Pool:{" "}
            {event.candidates
              .map((c) =>
                typeof c === "string" ? callLabel(c) : `${rankLabel(c.rank)}${GLYPH[c.suit]}`,
              )
              .join(", ")}
          </p>
        )}
        {event.citedSettings.length > 0 && (
          <p className="text-neutral-500">
            Settings consulted:{" "}
            {event.citedSettings.map((s) => `${s.label} = ${JSON.stringify(s.value)}`).join("; ")}
          </p>
        )}
        {event.trace.length > 0 && (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-neutral-500">
            {event.trace.map((t, i) => {
              const info = rules?.get(t.ruleId);
              return (
                <li key={i}>
                  {t.matched ? "✓" : "·"}{" "}
                  <span title={t.ruleId}>
                    {info ? ruleLabel(info) : t.ruleId.split(".").pop()}
                  </span>{" "}
                  — {humanReason(t)}
                </li>
              );
            })}
          </ul>
        )}
        <form
          action={flagDecisionAction}
          className="flex items-end gap-2 border-t border-[var(--line)] pt-2"
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="seq" value={event.seq} />
          {itemId && <input type="hidden" name="itemId" value={itemId} />}
          <label className="flex-1">
            <span className="mb-0.5 block text-neutral-400">Flag this decision</span>
            <input
              name="text"
              placeholder="What looks wrong?"
              className="w-full rounded border border-neutral-300 px-1.5 py-1"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-2 py-1 hover:border-emerald-400"
          >
            Flag
          </button>
        </form>
      </div>
    </details>
  );
}
