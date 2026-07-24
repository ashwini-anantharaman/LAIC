// Shared rule→English renderer: turns SAVED rule specs into the same
// plain-English sentences the item editor narrates live. No "use client" —
// pure functions over the typed language, importable from server components
// and from the client editor alike.

import type { SettingValue } from "@bridge/config";
import type {
  AuctionAction,
  AuctionContext,
  AuctionRuleSpec,
  CallPattern,
  ForcingRuleSpec,
  HandCondition,
  LeadSpec,
  NumParam,
  PlayRuleSpec,
} from "@bridge/kb";
import type { ReactNode } from "react";

export const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redGlyph = (s: string) => s === "H" || s === "D";

export function Glyph({ s }: Readonly<{ s: string }>) {
  return <span className={redGlyph(s) ? "text-[var(--madder)]" : ""}>{SUIT_GLYPH[s] ?? s}</span>;
}

export const joinNodes = (parts: ReactNode[], sep = ", "): ReactNode =>
  parts.map((part, i) => (
    <span key={i}>
      {i > 0 && sep}
      {part}
    </span>
  ));

/** Human name for a SuitRef (or any raw suit string); empty → null. */
export function suitRefName(ref: string): ReactNode {
  if (!ref) return null;
  if (ref === "partner_last_bid_suit") return "partner's suit";
  if (ref === "partner_first_bid_suit") return "partner's first suit";
  if (ref === "own_longest_suit") return "my longest suit";
  if (ref === "own_shortest_suit") return "my shortest suit";
  if (ref === "own_first_bid_suit") return "my first suit";
  if (ref === "own_last_bid_suit") return "my last bid suit";
  if (ref === "rho_bid_suit") return "RHO's suit";
  if (ref === "lho_bid_suit") return "LHO's suit";
  if (ref === "only_unbid_suit") return "the fourth (only unbid) suit";
  if (ref === "agreed_suit") return "the agreed suit";
  return <Glyph s={ref} />;
}

/**
 * A numeric parameter as text. With `values`, a $setting ref resolves the way
 * the engine does (number, or HcpRange via `field`) and shows its origin —
 * "15 (nt_range)"; unresolved refs show as-is ("$nt_range.low").
 */
export function numParamText(
  p: NumParam | undefined,
  values?: Record<string, SettingValue>,
): string | null {
  if (p === undefined) return null;
  if (typeof p === "number") return String(p);
  const value = values?.[p.$setting];
  if (typeof value === "number") return `${value} (${p.$setting})`;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const range = value as { low: number; high: number };
    const n = p.field === "high" ? range.high : range.low;
    if (typeof n === "number") return `${n} (${p.$setting})`;
  }
  return `$${p.$setting}${p.field ? `.${p.field}` : ""}`;
}

function strainNodes(strains: readonly string[] | undefined): ReactNode | null {
  if (!strains?.length) return null;
  return strains.map((s, i) => (
    <span key={i}>
      {i > 0 && "/"}
      {s === "N" ? "NT" : <Glyph s={s} />}
    </span>
  ));
}

/** English for a saved call pattern (the editor narrates drafts; this the spec). */
export function callPatternText(p: CallPattern | undefined): ReactNode | null {
  if (!p) return null;
  if (p.kind === "pass") return "a pass";
  if (p.kind === "double") return "a double";
  if (p.kind === "redouble") return "a redouble";
  if (p.kind === "none") return "no call yet";
  if (p.kind === "any") return "any call";
  const strains = strainNodes(p.strains);
  // `level` is shorthand for levelMin = levelMax.
  const min = p.levelMin ?? p.level;
  const max = p.levelMax ?? p.level;
  // The crisp special case: exactly one level and strains → "1NT".
  if (min !== undefined && min === max && strains)
    return (
      <>
        {min}
        {strains}
      </>
    );
  return (
    <>
      a bid
      {min !== undefined && max !== undefined && min !== max && ` at the ${min}–${max} level`}
      {min !== undefined && max === undefined && ` at the ${min} level or higher`}
      {min === undefined && max !== undefined && ` up to the ${max} level`}
      {min !== undefined && min === max && ` at the ${min} level`}
      {strains && <> in {strains}</>}
    </>
  );
}

const ROLE_TEXT: Record<string, string | null> = {
  opening: "nobody has bid yet",
  opener: "I opened and it's my rebid",
  responder: "partner opened",
  overcaller: "the opponents opened",
  advancer: "partner acted over their opening",
  any: null,
};

export function contextPhrases(ctx: AuctionContext | undefined): ReactNode[] {
  const when: ReactNode[] = [];
  if (!ctx) return when;
  if (ROLE_TEXT[ctx.role]) when.push(ROLE_TEXT[ctx.role]);
  const opening = callPatternText(ctx.opening);
  if (opening) when.push(<>our opening was {opening}</>);
  const partner = callPatternText(ctx.partnerLast);
  if (partner) when.push(<>partner&apos;s last call was {partner}</>);
  const rho = callPatternText(ctx.rhoLast);
  if (rho) when.push(<>RHO&apos;s last call was {rho}</>);
  const ownLast = callPatternText(ctx.ownLast);
  if (ownLast) when.push(<>my last call was {ownLast}</>);
  const lho = callPatternText(ctx.lhoLast);
  if (lho) when.push(<>LHO&apos;s last call was {lho}</>);
  const ownFirst = callPatternText(ctx.ownFirst);
  if (ownFirst) when.push(<>my first call was {ownFirst}</>);
  const partnerFirst = callPatternText(ctx.partnerFirst);
  if (partnerFirst) when.push(<>partner&apos;s first call was {partnerFirst}</>);
  if (ctx.contested === true) when.push("the auction is contested");
  if (ctx.contested === false) when.push("the opponents are silent");
  if (ctx.roundMin !== undefined || ctx.roundMax !== undefined)
    when.push(
      ctx.roundMin !== undefined && ctx.roundMax !== undefined
        ? `in rounds ${ctx.roundMin}–${ctx.roundMax}`
        : ctx.roundMin !== undefined
          ? `from round ${ctx.roundMin}`
          : `up to round ${ctx.roundMax}`,
    );
  if (ctx.vulnerability === "equal") when.push("at equal vulnerability");
  if (ctx.vulnerability === "favorable") when.push("at favorable vulnerability");
  if (ctx.vulnerability === "unfavorable") when.push("vulnerable against not");
  if (ctx.oppSuitsBidMin !== undefined && ctx.oppSuitsBidMax !== undefined)
    when.push(`the opponents have bid ${ctx.oppSuitsBidMin}–${ctx.oppSuitsBidMax} suits`);
  else if (ctx.oppSuitsBidMin !== undefined)
    when.push(`the opponents have bid ${ctx.oppSuitsBidMin}+ suits`);
  else if (ctx.oppSuitsBidMax !== undefined)
    when.push(
      `the opponents have bid at most ${ctx.oppSuitsBidMax} suit${ctx.oppSuitsBidMax === 1 ? "" : "s"}`,
    );
  if (ctx.partnerCued === true) when.push("partner cue-bid their suit");
  if (ctx.partnerCued === false) when.push("partner did not cue-bid");
  if (ctx.askInProgress) when.push(`partner's ${ctx.askInProgress} ask is awaiting my reply`);
  return when;
}

/** "15–17", "15+", "at most 17", or null when unconstrained. */
function rangeText(
  min: NumParam | undefined,
  max: NumParam | undefined,
  values?: Record<string, SettingValue>,
): string | null {
  const lo = numParamText(min, values);
  const hi = numParamText(max, values);
  if (lo && hi) return lo === hi ? lo : `${lo}–${hi}`;
  if (lo) return `${lo}+`;
  if (hi) return `at most ${hi}`;
  return null;
}

const RANK_CHAR: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

export function conditionPhrases(
  cond: HandCondition | undefined,
  values?: Record<string, SettingValue>,
): ReactNode[] {
  if (!cond) return [];
  if ("all" in cond) return cond.all.flatMap((c) => conditionPhrases(c, values));
  if ("any" in cond) {
    const parts = cond.any.flatMap((c) => conditionPhrases(c, values));
    return parts.length ? [<>either {joinNodes(parts, " or ")}</>] : [];
  }
  if ("not" in cond) {
    const parts = conditionPhrases(cond.not, values);
    return parts.length ? [<>not ({joinNodes(parts)})</>] : [];
  }
  if ("hcp" in cond) {
    const r = rangeText(cond.hcp.min, cond.hcp.max, values);
    return r ? [`${r} HCP`] : [];
  }
  if ("totalPoints" in cond) {
    const r = rangeText(cond.totalPoints.min, cond.totalPoints.max, values);
    return r ? [`${r} total points`] : [];
  }
  if ("suitLength" in cond) {
    const name = suitRefName(cond.suitLength.suit);
    const r = rangeText(cond.suitLength.min, cond.suitLength.max, values);
    return [r ? <>{r} cards in {name}</> : <>some length in {name}</>];
  }
  if ("longestSuitAmong" in cond)
    return [
      <>
        longest suit among{" "}
        {joinNodes(
          cond.longestSuitAmong.suits.map((s) => <Glyph key={s} s={s} />),
          "/",
        )}
      </>,
    ];
  if ("balanced" in cond) return [cond.balanced ? "a balanced hand" : "an unbalanced hand"];
  if ("suitQuality" in cond)
    return [
      <>
        {cond.suitQuality.quality === "two_of_top_three"
          ? "two of the top three honors"
          : "three of the top five honors"}{" "}
        in {suitRefName(cond.suitQuality.suit)}
      </>,
    ];
  if ("hasStopperIn" in cond) return [<>a stopper in {suitRefName(cond.hasStopperIn.suit)}</>];
  if ("aces" in cond || "kings" in cond) {
    const spec = "aces" in cond ? cond.aces : cond.kings;
    const noun = "aces" in cond ? "aces" : "kings";
    const lo = numParamText(spec.min, values);
    const hi = numParamText(spec.max, values);
    if (lo && hi && lo === hi) return [`exactly ${lo} ${noun}`];
    const r = rangeText(spec.min, spec.max, values);
    return r ? [`${r} ${noun}`] : [];
  }
  if ("keycards" in cond) {
    const r = rangeText(cond.keycards.min, cond.keycards.max, values);
    return r ? [<>{r} keycards for {suitRefName(cond.keycards.suit)}</>] : [];
  }
  if ("holds" in cond)
    return [
      <>
        the {suitRefName(cond.holds.suit)}
        {RANK_CHAR[cond.holds.rank] ?? cond.holds.rank}
      </>,
    ];
  if ("playingTricks" in cond) {
    const r = rangeText(cond.playingTricks.min, cond.playingTricks.max, values);
    return r ? [`${r} playing tricks`] : [];
  }
  // ---- partnership constructs (Pillar A) -----------------------------------
  if ("partnerShownHcp" in cond) {
    const r = rangeText(cond.partnerShownHcp.min, cond.partnerShownHcp.max, values);
    return r ? [`partner has shown ${r} HCP`] : [];
  }
  if ("partnerShownLength" in cond) {
    const r = rangeText(cond.partnerShownLength.min, cond.partnerShownLength.max, values);
    return [
      r ? (
        <>partner has shown {r} cards in {suitRefName(cond.partnerShownLength.suit)}</>
      ) : (
        <>partner has shown length in {suitRefName(cond.partnerShownLength.suit)}</>
      ),
    ];
  }
  if ("combinedHcp" in cond) {
    const r = rangeText(cond.combinedHcp.min, cond.combinedHcp.max, values);
    return r ? [`${r} combined HCP`] : [];
  }
  if ("combinedKeycards" in cond) {
    const r = rangeText(cond.combinedKeycards.min, cond.combinedKeycards.max, values);
    return r ? [`${r} combined keycards`] : [];
  }
  if ("keycardsMissing" in cond) {
    const r = rangeText(cond.keycardsMissing.min, cond.keycardsMissing.max, values);
    return r ? [`${r} keycards missing`] : [];
  }
  if ("fitEstablished" in cond) {
    const which = cond.fitEstablished.suit;
    const where =
      which === "any_major" ? (
        "a major"
      ) : which === undefined || which === "any" ? (
        "any suit"
      ) : (
        suitRefName(which)
      );
    const n = numParamText(cond.fitEstablished.minCombined, values) ?? "8";
    return [<>a {n}+ card fit in {where}</>];
  }
  if ("unshownSupport" in cond) {
    const n = numParamText(cond.unshownSupport.min, values);
    return [
      <>
        undisclosed {n ? `${n}+ ` : ""}support in {suitRefName(cond.unshownSupport.suit)}
      </>,
    ];
  }
  return [];
}

export function actionSentence(a: AuctionAction): ReactNode {
  switch (a.type) {
    case "pass":
      return "pass";
    case "double":
      return "double";
    case "redouble":
      return "redouble";
    case "raise_partner":
      return <>raise partner to the {a.toLevel} level</>;
    case "bid_longest":
      return (
        <>
          bid my longest of{" "}
          {joinNodes(
            a.among.map((s) => <Glyph key={s} s={s} />),
            "/",
          )}
          {a.level !== undefined ? ` at the ${a.level} level` : " at the cheapest level"}
        </>
      );
    case "first_legal_of":
      return (
        <>
          bid the first legal of{" "}
          {joinNodes(
            a.calls.map((c, i) => (
              <span key={i}>
                {c.level}
                {c.strain === "N" ? "NT" : <Glyph s={c.strain} />}
              </span>
            )),
          )}
        </>
      );
    case "bid_suit":
      return (
        <>
          bid {suitRefName(a.suit)}
          {a.level !== undefined ? ` at the ${a.level} level` : " at the cheapest level"}
        </>
      );
    default:
      return (
        <>
          bid {a.level}
          {a.strain === "N" ? "NT" : <Glyph s={a.strain} />}
        </>
      );
  }
}

export function auctionRuleSentence(
  r: AuctionRuleSpec,
  values?: Record<string, SettingValue>,
): ReactNode {
  const when = contextPhrases(r.context);
  const hand = conditionPhrases(r.conditions, values);
  return (
    <>
      <b>When</b> {when.length ? joinNodes(when) : "it's my turn (no constraints)"}
      {hand.length > 0 && (
        <>
          , <b>and I hold</b> {joinNodes(hand)}
        </>
      )}
      , <b>then</b> {actionSentence(r.action)}.
    </>
  );
}

export function forcingRuleSentence(r: ForcingRuleSpec): ReactNode {
  const when = contextPhrases(r.context);
  return (
    <>
      <b>When</b> {when.length ? joinNodes(when) : "it's my turn (no constraints)"},{" "}
      <b>then</b> pass is not an available call.
    </>
  );
}

const LEAD_STYLE_LABEL: Record<LeadSpec["style"], string> = {
  fourth_best: "fourth best",
  top_of_sequence: "top of a sequence",
  low_from_honor: "low from an honor",
  top_of_nothing: "top of nothing",
  low_from_longest: "low from the longest suit",
};

export function leadSentence(l: LeadSpec): ReactNode {
  const versus =
    l.versus === "notrump"
      ? "Against notrump"
      : l.versus === "suit"
        ? "Against suit contracts"
        : "Against any contract";
  return `${versus}, lead ${LEAD_STYLE_LABEL[l.style]}`;
}

export function playRuleSentence(s: PlayRuleSpec): ReactNode {
  const side =
    s.side === "declarer" ? "As declarer" : s.side === "defense" ? "On defense" : "Either side";
  return `${side}, in ${s.position} seat: ${s.behavior.replace(/_/g, " ")} (priority ${s.priority}).`;
}
