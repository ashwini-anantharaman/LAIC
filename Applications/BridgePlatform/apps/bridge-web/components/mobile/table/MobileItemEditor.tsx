"use client";

// Phone-native knowledge-item editor (fix-at-the-table, mobile). Posts the
// SAME server action with the SAME field names as the desktop ItemEditor —
// the form contract lives in lib/itemForm.ts and every name here mirrors it
// byte-for-byte (title, humanReadableText, rule{i}:label/…/actionType…,
// forcing{i}:…, lead{i}:…, play{i}:…, sig:…, fb:…, setting{i}:…, payloadJson,
// settingsJson, saveAs, plus the hidden returnTo/repinSessionId pair so a
// save recompiles, RE-PINS the session and returns to the mobile felt paused.
//
// Unlike the desktop editor the fields are UNCONTROLLED (defaultValue): the
// live-sentence narration is desktop polish; the parse only reads names, and
// itemForm ignores fields the chosen kind/action doesn't use, so rendering
// every input unconditionally is byte-compatible and much lighter on a phone.
// Client state is only what changes the rendered sections: the knowledgeType
// select and the "Add a rule" counters.

import type {
  AuctionAction,
  AuctionRuleSpec,
  CallPattern,
  ForcingRuleSpec,
  HandCondition,
  ItemPayload,
  KnowledgeItem,
  KnowledgeType,
  NumParam,
} from "@bridge/kb";
import { useState, type ReactNode } from "react";
import { TYPE_LABEL } from "@/components/kb/badges";

const FONT_KARLA = "var(--font-karla), sans-serif";

const INPUT: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e7e1d3",
  borderRadius: 10,
  padding: "10px 11px",
  font: `400 13px ${FONT_KARLA}`,
  color: "#1d1a15",
  background: "#fffefa",
  boxSizing: "border-box",
};
const MONO_INPUT: React.CSSProperties = { ...INPUT, fontFamily: "monospace", fontSize: 11 };
const LABEL: React.CSSProperties = {
  display: "block",
  margin: "0 0 3px",
  font: `600 10px ${FONT_KARLA}`,
  letterSpacing: ".04em",
  color: "#7b7466",
};
const CARD: React.CSSProperties = {
  border: "1px solid #e7e1d3",
  borderRadius: 13,
  background: "#fffefa",
  overflow: "hidden",
};
const BAND_HEAD: React.CSSProperties = {
  margin: "0 0 8px",
  font: `700 9px ${FONT_KARLA}`,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#5e5749",
};
const HINT: React.CSSProperties = {
  font: `400 10.5px/1.45 ${FONT_KARLA}`,
  color: "#a49d8e",
  margin: "0 0 8px",
};
const ROW2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

/** "18" | "$nt_range.low" as the desktop editor shows a NumParam. */
const showNum = (p: NumParam | undefined): string =>
  p === undefined
    ? ""
    : typeof p === "number"
      ? String(p)
      : `$${p.$setting}${p.field ? `.${p.field}` : ""}`;

interface TypedConditions {
  hcpMin?: NumParam;
  hcpMax?: NumParam;
  tpMin?: NumParam;
  balanced?: boolean;
  suits: { suit: string; min?: NumParam; max?: NumParam }[];
  overflow?: HandCondition;
}

/** Same decomposition as the desktop editor: typed subset or overflow → JSON. */
function decompose(cond: HandCondition): TypedConditions {
  const out: TypedConditions = { suits: [] };
  const parts = "all" in cond ? cond.all : [cond];
  if (!Array.isArray(parts)) return { suits: [], overflow: cond };
  const leftovers: HandCondition[] = [];
  for (const part of parts) {
    if ("hcp" in part) {
      out.hcpMin = part.hcp.min;
      out.hcpMax = part.hcp.max;
    } else if ("totalPoints" in part) {
      out.tpMin = part.totalPoints.min;
    } else if ("balanced" in part) {
      out.balanced = part.balanced;
    } else if (
      "suitLength" in part &&
      out.suits.length < 2 &&
      typeof part.suitLength.suit === "string"
    ) {
      out.suits.push({
        suit: part.suitLength.suit,
        min: part.suitLength.min,
        max: part.suitLength.max,
      });
    } else {
      leftovers.push(part);
    }
  }
  if (leftovers.length)
    out.overflow = leftovers.length === 1 ? leftovers[0]! : { all: leftovers };
  return out;
}

/** Action types the typed controls edit; others round-trip as JSON. */
const TYPED_ACTIONS = new Set([
  "bid",
  "pass",
  "double",
  "redouble",
  "raise_partner",
  "bid_longest",
  "bid_suit",
]);

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** One call-pattern row (kind + level range + strains). Field names are the
 *  itemForm contract: `{p}:{field}:kind|levelMin|levelMax|strains`. */
function PatternRow({
  p,
  field,
  title,
  pattern,
}: Readonly<{ p: string; field: string; title: string; pattern?: CallPattern }>) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr .7fr 1fr", gap: 6 }}>
      <Field label={title}>
        <select
          name={`${p}:${field}:kind`}
          defaultValue={pattern?.kind ?? "unset"}
          aria-label={title}
          style={INPUT}
        >
          <option value="unset">anything / not set</option>
          <option value="bid">a bid…</option>
          <option value="any_bid">any suit/NT bid</option>
          <option value="pass">a pass</option>
          <option value="double">a double</option>
          <option value="redouble">a redouble</option>
          <option value="none">no call yet</option>
        </select>
      </Field>
      <Field label="lvl ≥">
        <input
          name={`${p}:${field}:levelMin`}
          defaultValue={pattern?.levelMin?.toString() ?? ""}
          inputMode="numeric"
          style={INPUT}
        />
      </Field>
      <Field label="lvl ≤">
        <input
          name={`${p}:${field}:levelMax`}
          defaultValue={pattern?.levelMax?.toString() ?? ""}
          inputMode="numeric"
          style={INPUT}
        />
      </Field>
      <Field label="strains">
        <input
          name={`${p}:${field}:strains`}
          defaultValue={pattern?.strains?.join(",") ?? ""}
          placeholder="N or S,H"
          style={INPUT}
        />
      </Field>
    </div>
  );
}

const SUIT_OPTIONS = (
  <>
    <option value="">—</option>
    <option value="S">♠ spades</option>
    <option value="H">♥ hearts</option>
    <option value="D">♦ diamonds</option>
    <option value="C">♣ clubs</option>
    <option value="partner_last_bid_suit">partner&apos;s last bid suit</option>
    <option value="partner_first_bid_suit">partner&apos;s first bid suit</option>
    <option value="own_longest_suit">my longest suit</option>
    <option value="own_shortest_suit">my shortest suit</option>
    <option value="own_first_bid_suit">my first bid suit</option>
    <option value="own_last_bid_suit">my last bid suit</option>
    <option value="rho_bid_suit">RHO&apos;s bid suit</option>
    <option value="only_unbid_suit">the fourth (only unbid) suit</option>
  </>
);

/** The shared WHEN band — role/contest/rounds/patterns + judgment context. */
function WhenBand({
  p,
  context,
  fallbackRole,
}: Readonly<{ p: string; context?: import("@bridge/kb").AuctionContext; fallbackRole: string }>) {
  const moreOpen =
    Boolean(context?.ownLast || context?.lhoLast || context?.ownFirst || context?.partnerFirst) ||
    Boolean(
      context?.vulnerability ||
        context?.oppSuitsBidMin !== undefined ||
        context?.oppSuitsBidMax !== undefined ||
        context?.partnerCued !== undefined,
    );
  return (
    <div style={{ borderTop: "1px solid #f0ebe0", borderLeft: "3px solid #256e42", padding: "10px 12px" }}>
      <p style={BAND_HEAD}>
        When <span style={{ ...HINT, display: "inline", textTransform: "none", letterSpacing: 0 }}>— where in the auction this rule can fire</span>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={ROW2}>
          <Field label="My role">
            <select name={`${p}:role`} defaultValue={context?.role ?? fallbackRole} style={INPUT}>
              <option value="opening">opening — nobody has bid yet</option>
              <option value="opener">opener — rebidding my opening</option>
              <option value="responder">responder — partner opened</option>
              <option value="overcaller">overcaller — they opened</option>
              <option value="advancer">advancer — partner overcalled</option>
              <option value="any">any</option>
            </select>
          </Field>
          <Field label="Contested?">
            <select
              name={`${p}:contested`}
              defaultValue={
                context?.contested === true ? "yes" : context?.contested === false ? "no" : ""
              }
              style={INPUT}
            >
              <option value="">either</option>
              <option value="no">uncontested only</option>
              <option value="yes">contested only</option>
            </select>
          </Field>
        </div>
        <div style={ROW2}>
          <Field label="round ≥">
            <input
              name={`${p}:roundMin`}
              defaultValue={context?.roundMin?.toString() ?? ""}
              inputMode="numeric"
              style={INPUT}
            />
          </Field>
          <Field label="round ≤">
            <input
              name={`${p}:roundMax`}
              defaultValue={context?.roundMax?.toString() ?? ""}
              inputMode="numeric"
              style={INPUT}
            />
          </Field>
        </div>
        <PatternRow p={p} field="opening" title="Our opening was…" pattern={context?.opening} />
        <PatternRow
          p={p}
          field="partnerLast"
          title="Partner's last call was…"
          pattern={context?.partnerLast}
        />
        <PatternRow p={p} field="rhoLast" title="RHO's last call was…" pattern={context?.rhoLast} />
        <details open={moreOpen}>
          <summary
            style={{ cursor: "pointer", font: `500 11px ${FONT_KARLA}`, color: "#7b7466" }}
          >
            More auction context — my/LHO&apos;s calls, first calls, vulnerability, their suits
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <PatternRow p={p} field="ownLast" title="My last call was…" pattern={context?.ownLast} />
            <PatternRow p={p} field="lhoLast" title="LHO's last call was…" pattern={context?.lhoLast} />
            <PatternRow p={p} field="ownFirst" title="My first call was…" pattern={context?.ownFirst} />
            <PatternRow
              p={p}
              field="partnerFirst"
              title="Partner's first call was…"
              pattern={context?.partnerFirst}
            />
            <Field label="Vulnerability (relative)">
              <select
                name={`${p}:vulnerability`}
                defaultValue={context?.vulnerability ?? ""}
                style={INPUT}
              >
                <option value="">any</option>
                <option value="equal">equal</option>
                <option value="favorable">favorable — they are vul, we are not</option>
                <option value="unfavorable">unfavorable — we are vul, they are not</option>
              </select>
            </Field>
            <div style={ROW2}>
              <Field label="their suits ≥">
                <input
                  name={`${p}:oppSuitsBidMin`}
                  defaultValue={context?.oppSuitsBidMin?.toString() ?? ""}
                  inputMode="numeric"
                  style={INPUT}
                />
              </Field>
              <Field label="their suits ≤">
                <input
                  name={`${p}:oppSuitsBidMax`}
                  defaultValue={context?.oppSuitsBidMax?.toString() ?? ""}
                  inputMode="numeric"
                  style={INPUT}
                />
              </Field>
            </div>
            <Field label="Partner cue-bid their suit?">
              <select
                name={`${p}:partnerCued`}
                defaultValue={
                  context?.partnerCued === true ? "yes" : context?.partnerCued === false ? "no" : ""
                }
                style={INPUT}
              >
                <option value="">either</option>
                <option value="yes">yes — partner&apos;s bid is a cue</option>
                <option value="no">no</option>
              </select>
            </Field>
          </div>
        </details>
      </div>
    </div>
  );
}

/** Identity strip: label / key / priority / remove — shared by rule kinds. */
function IdentityStrip({
  p,
  label,
  ruleKey,
  priority,
  existing,
  newPlaceholder,
}: Readonly<{
  p: string;
  label: string;
  ruleKey: string;
  priority: number;
  existing: boolean;
  newPlaceholder: string;
}>) {
  return (
    <div
      style={{
        borderTop: "1px solid #f0ebe0",
        background: "#faf8f2",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Field label="Label — what the trace shows">
        <input
          name={`${p}:label`}
          defaultValue={label}
          placeholder={existing ? "" : newPlaceholder}
          style={INPUT}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <Field label="Key (stable id)">
          <input name={`${p}:key`} defaultValue={ruleKey} style={INPUT} />
        </Field>
        <Field label="Priority (lower fires first)">
          <input
            name={`${p}:priority`}
            type="number"
            defaultValue={priority}
            style={INPUT}
          />
        </Field>
        {existing && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              font: `500 11px ${FONT_KARLA}`,
              color: "#8a2d23",
              paddingBottom: 10,
            }}
          >
            <input type="checkbox" name={`${p}:remove`} aria-label="Remove this rule on save" />{" "}
            remove
          </label>
        )}
      </div>
    </div>
  );
}

/** One auction-rule card (mobile): identity, WHEN, AND-MY-HAND, THEN. */
function RuleCard({
  rule,
  index,
}: Readonly<{ rule: AuctionRuleSpec | null; index: number }>) {
  const p = `rule${index}`;
  const c = rule ? decompose(rule.conditions) : ({ suits: [] } as TypedConditions);
  const a: AuctionAction | undefined = rule?.action;
  const actionType = a ? (TYPED_ACTIONS.has(a.type) ? a.type : "json") : "bid";
  const actionLevel =
    a && "level" in a && a.level !== undefined
      ? String(a.level)
      : a?.type === "raise_partner"
        ? String(a.toLevel)
        : "";

  return (
    <details open={!rule || index === 0} style={CARD}>
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "11px 13px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "#a49d8e", fontSize: 11 }}>▸</span>
        <span style={{ font: `600 13px ${FONT_KARLA}`, color: "#1d1a15", flex: 1, minWidth: 0 }}>
          {rule?.label || "New rule — give it a label below"}
        </span>
        <span
          style={{
            flex: "none",
            font: `600 10px ${FONT_KARLA}`,
            background: "#f0ece2",
            color: "#5e5749",
            padding: "2px 7px",
            borderRadius: 6,
          }}
        >
          rule {index + 1}
        </span>
      </summary>

      <IdentityStrip
        p={p}
        label={rule?.label ?? ""}
        ruleKey={rule?.key ?? `r${index}`}
        priority={rule?.priority ?? 10}
        existing={Boolean(rule)}
        newPlaceholder="e.g. Open 1NT — blank rules are not saved"
      />

      <WhenBand p={p} context={rule?.context} fallbackRole="opening" />

      <div
        style={{
          borderTop: "1px solid #f0ebe0",
          borderLeft: "3px solid #a16207",
          padding: "10px 12px",
        }}
      >
        <p style={BAND_HEAD}>
          And my hand{" "}
          <span style={{ ...HINT, display: "inline", textTransform: "none", letterSpacing: 0 }}>
            — blank = no constraint
          </span>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={ROW2}>
            <Field label="HCP min">
              <input
                name={`${p}:hcpMin`}
                defaultValue={showNum(c.hcpMin)}
                placeholder="15 or $nt_range.low"
                style={INPUT}
              />
            </Field>
            <Field label="HCP max">
              <input
                name={`${p}:hcpMax`}
                defaultValue={showNum(c.hcpMax)}
                placeholder="17 or $nt_range.high"
                style={INPUT}
              />
            </Field>
          </div>
          <div style={ROW2}>
            <Field label="Points min (HCP+length)">
              <input name={`${p}:tpMin`} defaultValue={showNum(c.tpMin)} style={INPUT} />
            </Field>
            <Field label="Shape">
              <select
                name={`${p}:balanced`}
                defaultValue={c.balanced === true ? "yes" : c.balanced === false ? "no" : ""}
                style={INPUT}
              >
                <option value="">any shape</option>
                <option value="yes">balanced</option>
                <option value="no">unbalanced</option>
              </select>
            </Field>
          </div>
          {([0, 1] as const).map((i) => (
            <div
              key={i}
              style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr .8fr", gap: 6 }}
            >
              <Field label={i === 0 ? "Holding in suit…" : "…and also in suit"}>
                <select name={`${p}:suit${i}`} defaultValue={c.suits[i]?.suit ?? ""} style={INPUT}>
                  {SUIT_OPTIONS}
                </select>
              </Field>
              <Field label="at least">
                <input
                  name={`${p}:suit${i}Min`}
                  defaultValue={showNum(c.suits[i]?.min)}
                  style={INPUT}
                />
              </Field>
              <Field label="at most">
                <input
                  name={`${p}:suit${i}Max`}
                  defaultValue={showNum(c.suits[i]?.max)}
                  style={INPUT}
                />
              </Field>
            </div>
          ))}
          <details open={Boolean(c.overflow)}>
            <summary style={{ cursor: "pointer", font: `500 11px ${FONT_KARLA}`, color: "#7b7466" }}>
              Extra conditions (JSON)
              {c.overflow ? " — this rule uses conditions beyond the typed fields" : ""}
            </summary>
            <textarea
              name={`${p}:conditionsJson`}
              rows={3}
              defaultValue={c.overflow ? JSON.stringify(c.overflow, null, 1) : ""}
              aria-label="Extra conditions JSON"
              style={{ ...MONO_INPUT, marginTop: 6 }}
            />
          </details>
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #f0ebe0",
          borderLeft: "3px solid #5e5749",
          padding: "10px 12px",
        }}
      >
        <p style={BAND_HEAD}>
          Then{" "}
          <span style={{ ...HINT, display: "inline", textTransform: "none", letterSpacing: 0 }}>
            — the call to make (skipped if illegal); fill only the fields your action uses
          </span>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Field label="Action">
            <select name={`${p}:actionType`} defaultValue={actionType} style={INPUT}>
              <option value="bid">bid exactly (level + strain)</option>
              <option value="pass">pass</option>
              <option value="double">double</option>
              <option value="redouble">redouble</option>
              <option value="raise_partner">raise partner&apos;s suit (to level)</option>
              <option value="bid_longest">bid my longest among… (at level)</option>
              <option value="bid_suit">bid a contextual suit (cue bid / rebid my suit)</option>
              <option value="json">advanced — raw action JSON</option>
            </select>
          </Field>
          <div style={ROW2}>
            <Field label="Level / to level">
              <input
                name={`${p}:actionLevel`}
                type="number"
                defaultValue={actionLevel}
                style={INPUT}
              />
            </Field>
            <Field label="Strain (bid exactly)">
              <select
                name={`${p}:actionStrain`}
                defaultValue={a?.type === "bid" ? a.strain : "N"}
                style={INPUT}
              >
                <option value="C">♣ clubs</option>
                <option value="D">♦ diamonds</option>
                <option value="H">♥ hearts</option>
                <option value="S">♠ spades</option>
                <option value="N">NT</option>
              </select>
            </Field>
          </div>
          <div style={ROW2}>
            <Field label="Among suits (bid my longest)">
              <input
                name={`${p}:actionAmong`}
                defaultValue={a?.type === "bid_longest" ? a.among.join(",") : ""}
                placeholder="S,H"
                style={INPUT}
              />
            </Field>
            <Field label="Which suit (contextual)">
              <select
                name={`${p}:actionSuit`}
                defaultValue={a?.type === "bid_suit" ? a.suit : "rho_bid_suit"}
                style={INPUT}
              >
                <option value="rho_bid_suit">RHO&apos;s bid suit (cue bid)</option>
                <option value="lho_bid_suit">LHO&apos;s bid suit (advancer cue)</option>
                <option value="own_first_bid_suit">my first bid suit (rebid it)</option>
                <option value="own_last_bid_suit">my last bid suit</option>
                <option value="partner_first_bid_suit">partner&apos;s first bid suit</option>
                <option value="partner_last_bid_suit">partner&apos;s last bid suit</option>
                <option value="own_longest_suit">my longest suit</option>
                <option value="own_shortest_suit">my shortest suit (splinter)</option>
                <option value="only_unbid_suit">the fourth (only unbid) suit</option>
                <option value="S">♠ spades</option>
                <option value="H">♥ hearts</option>
                <option value="D">♦ diamonds</option>
                <option value="C">♣ clubs</option>
              </select>
            </Field>
          </div>
          <Field label="Action JSON (advanced action type only)">
            <input
              name={`${p}:actionJson`}
              defaultValue={a && !TYPED_ACTIONS.has(a.type) ? JSON.stringify(a) : ""}
              placeholder='{"type":"first_legal_of","calls":[{"level":3,"strain":"N"}]}'
              style={MONO_INPUT}
            />
          </Field>
        </div>
      </div>
    </details>
  );
}

/** One forcing-situation card: identity + WHEN (pass is not available). */
function ForcingCard({
  rule,
  index,
}: Readonly<{ rule: ForcingRuleSpec | null; index: number }>) {
  const p = `forcing${index}`;
  return (
    <details open={!rule || index === 0} style={CARD}>
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "11px 13px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "#a49d8e", fontSize: 11 }}>▸</span>
        <span style={{ font: `600 13px ${FONT_KARLA}`, color: "#1d1a15", flex: 1, minWidth: 0 }}>
          {rule?.label || "New forcing situation"}
        </span>
        <span
          style={{
            flex: "none",
            font: `600 10px ${FONT_KARLA}`,
            background: "#f0ece2",
            color: "#5e5749",
            padding: "2px 7px",
            borderRadius: 6,
          }}
        >
          no pass
        </span>
      </summary>
      <IdentityStrip
        p={p}
        label={rule?.label ?? ""}
        ruleKey={rule?.key ?? `f${index}`}
        priority={rule?.priority ?? 10}
        existing={Boolean(rule)}
        newPlaceholder="e.g. Two-over-one forces a rebid — blank rows are not saved"
      />
      <WhenBand p={p} context={rule?.context} fallbackRole="any" />
    </details>
  );
}

export function MobileItemEditor({
  kbId,
  item,
  action,
  hiddenFields,
}: Readonly<{
  kbId: string;
  item: KnowledgeItem | null;
  action: (formData: FormData) => Promise<void>;
  /** returnTo=/m/table/{id}?paused={seq} + repinSessionId — save → recompile → repin → felt. */
  hiddenFields?: Record<string, string>;
}>) {
  const payload: ItemPayload = item?.payload ?? { kind: "auction_rules", rules: [] };
  const auctionSpecs = payload.kind === "auction_rules" ? payload.rules : [];
  const forcingSpecs = payload.kind === "forcing_rules" ? payload.rules : [];
  const isForcing = payload.kind === "forcing_rules";
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>(
    item?.knowledgeType ?? "agreement",
  );
  const [extraRules, setExtraRules] = useState(item ? 0 : 1);
  const needsRules =
    !isForcing &&
    ["bidding_rule", "convention", "agreement", "exception"].includes(knowledgeType);

  const addButton = (text: string) => (
    <button
      type="button"
      onClick={() => setExtraRules((n) => n + 1)}
      aria-label={text}
      style={{
        border: "1px dashed #d3ccbb",
        background: "transparent",
        borderRadius: 10,
        padding: "10px 0",
        font: `600 12px ${FONT_KARLA}`,
        color: "#5e5749",
        cursor: "pointer",
      }}
    >
      {text}
    </button>
  );

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="kbId" value={kbId} />
      {item && <input type="hidden" name="itemId" value={item.itemId} />}
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <Field label="Title">
        <input name="title" required defaultValue={item?.title ?? ""} style={INPUT} />
      </Field>
      <Field label="What a player reads (the agreement, in plain words)">
        <textarea
          name="humanReadableText"
          rows={3}
          required
          defaultValue={item?.humanReadableText ?? ""}
          style={INPUT}
        />
      </Field>
      <div style={ROW2}>
        <Field label="Type">
          <select
            name="knowledgeType"
            value={knowledgeType}
            onChange={(e) => setKnowledgeType(e.target.value as KnowledgeType)}
            style={INPUT}
          >
            {Object.entries(TYPE_LABEL).map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phase">
          <select name="phase" defaultValue={item?.phase ?? "auction"} style={INPUT}>
            {["auction", "opening_lead", "declarer_play", "defense", "scoring"].map((ph) => (
              <option key={ph}>{ph}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={ROW2}>
        <Field label="Status (trust badge — never a gate)">
          <select name="status" defaultValue={item?.status ?? "draft"} style={INPUT}>
            {["draft", "reviewed", "approved", "deprecated"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Level tags (comma-separated)">
          <input
            name="supportedLevels"
            defaultValue={item?.supportedLevels.join(", ") ?? ""}
            style={INPUT}
          />
        </Field>
      </div>
      <Field label="Tags (comma-separated)">
        <input name="tags" defaultValue={item?.tags?.join(", ") ?? ""} style={INPUT} />
      </Field>
      <Field label="Internal notes (fellows only)">
        <textarea
          name="internalNotes"
          rows={2}
          defaultValue={item?.internalNotes ?? ""}
          style={INPUT}
        />
      </Field>

      {isForcing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={HINT}>
            Each situation is one sentence: <b>when</b> the auction looks like this, <b>then</b>{" "}
            pass is not an available call.
          </p>
          <input type="hidden" name="payloadKind" value="forcing_rules" />
          <input type="hidden" name="forcingCount" value={forcingSpecs.length + extraRules} />
          {forcingSpecs.map((rule, i) => (
            <ForcingCard key={rule.key} rule={rule} index={i} />
          ))}
          {Array.from({ length: extraRules }, (_, j) => (
            <ForcingCard key={`new${j}`} rule={null} index={forcingSpecs.length + j} />
          ))}
          {addButton("+ Add a forcing situation")}
        </div>
      )}

      {needsRules && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={HINT}>
            Each rule is one sentence: <b>when</b> the auction looks like this, <b>and</b> my hand
            looks like that, <b>then</b> make this call. Blank parts don&apos;t constrain anything.
          </p>
          <input type="hidden" name="ruleCount" value={auctionSpecs.length + extraRules} />
          {auctionSpecs.map((rule, i) => (
            <RuleCard key={rule.key} rule={rule} index={i} />
          ))}
          {Array.from({ length: extraRules }, (_, j) => (
            <RuleCard key={`new${j}`} rule={null} index={auctionSpecs.length + j} />
          ))}
          {addButton("+ Add a rule")}
        </div>
      )}

      {knowledgeType === "fallback_rule" && (
        <div style={{ ...CARD, padding: "12px 13px" }}>
          <p style={BAND_HEAD}>Fallback behavior</p>
          <div style={ROW2}>
            <Field label="Phase">
              <select
                name="fb:phase"
                defaultValue={payload.kind === "fallback" ? payload.fallback.phase : "auction"}
                style={INPUT}
              >
                <option value="auction">auction (pass)</option>
                <option value="opening_lead">opening lead</option>
                <option value="card_play">card play (lowest legal)</option>
              </select>
            </Field>
            <Field label="Lead style (opening-lead fallback)">
              <select
                name="fb:leadStyle"
                defaultValue={
                  payload.kind === "fallback" && payload.fallback.phase === "opening_lead"
                    ? payload.fallback.behavior
                    : "low_from_longest"
                }
                style={INPUT}
              >
                {[
                  "low_from_longest",
                  "fourth_best",
                  "top_of_sequence",
                  "low_from_honor",
                  "top_of_nothing",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}

      {knowledgeType === "signal_agreement" && (
        <div style={{ ...CARD, padding: "12px 13px" }}>
          <p style={BAND_HEAD}>Signals</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(
              [
                ["attitude", ["standard", "upside_down", "none"]],
                ["count", ["standard", "reverse", "none"]],
                ["firstDiscard", ["attitude", "count", "none"]],
              ] as const
            ).map(([field, options]) => (
              <Field key={field} label={field}>
                <select
                  name={`sig:${field}`}
                  defaultValue={
                    payload.kind === "signals"
                      ? (payload.signals[field] ?? options[0])
                      : options[0]
                  }
                  style={INPUT}
                >
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </div>
      )}

      {knowledgeType === "lead_agreement" && (
        <div style={{ ...CARD, padding: "12px 13px" }}>
          <p style={BAND_HEAD}>Lead rules</p>
          <input
            type="hidden"
            name="leadCount"
            value={(payload.kind === "lead_rules" ? payload.leads.length : 0) + 1}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...(payload.kind === "lead_rules" ? payload.leads : []), null].map((lead, i) => (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 8, alignItems: "end" }}
              >
                <Field label="Versus">
                  <select name={`lead${i}:versus`} defaultValue={lead?.versus ?? ""} style={INPUT}>
                    <option value="">— (skip)</option>
                    <option value="suit">suit contracts</option>
                    <option value="notrump">notrump</option>
                    <option value="any">any</option>
                  </select>
                </Field>
                <Field label="Style">
                  <select
                    name={`lead${i}:style`}
                    defaultValue={lead?.style ?? "fourth_best"}
                    style={INPUT}
                  >
                    {[
                      "fourth_best",
                      "top_of_sequence",
                      "low_from_honor",
                      "top_of_nothing",
                      "low_from_longest",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                {lead && (
                  <label
                    style={{
                      font: `500 11px ${FONT_KARLA}`,
                      color: "#8a2d23",
                      paddingBottom: 10,
                    }}
                  >
                    <input type="checkbox" name={`lead${i}:remove`} aria-label="Remove this lead rule" />{" "}
                    remove
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(knowledgeType === "declarer_technique" || knowledgeType === "defensive_technique") && (
        <div style={{ ...CARD, padding: "12px 13px" }}>
          <p style={BAND_HEAD}>Play rules</p>
          <input
            type="hidden"
            name="playCount"
            value={(payload.kind === "play_rules" ? payload.rules.length : 0) + 1}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...(payload.kind === "play_rules" ? payload.rules : []), null].map((rule, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Field label="Behavior">
                  <select name={`play${i}:behavior`} defaultValue={rule?.behavior ?? ""} style={INPUT}>
                    <option value="">— (skip)</option>
                    {[
                      "lowest_following",
                      "highest_following",
                      "win_cheaply",
                      "second_hand_low",
                      "third_hand_high",
                      "cover_honor",
                      "cash_winners",
                      "lowest_legal",
                      "discard_lowest",
                      "draw_trumps",
                      "finesse_toward_tenace",
                      "hold_up_stopper",
                      "duck_to_preserve_entry",
                      "establish_long_suit",
                      "ruff_loser",
                      "discard_loser_on_winner",
                      "cash_out_when_enough",
                      "return_partner_suit",
                      "hold_up_ace",
                      "overruff_or_discard",
                      "second_hand_rise_vs_honor",
                    ].map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr .8fr auto", gap: 8, alignItems: "end" }}>
                  <Field label="Position">
                    <select name={`play${i}:position`} defaultValue={rule?.position ?? "any"} style={INPUT}>
                      {["lead", "second", "third", "fourth", "any"].map((pos) => (
                        <option key={pos}>{pos}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Side">
                    <select name={`play${i}:side`} defaultValue={rule?.side ?? "any"} style={INPUT}>
                      {["declarer", "defense", "any"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <input
                      type="number"
                      name={`play${i}:priority`}
                      defaultValue={rule?.priority ?? 10}
                      style={INPUT}
                    />
                  </Field>
                  {rule && (
                    <label
                      style={{
                        font: `500 11px ${FONT_KARLA}`,
                        color: "#8a2d23",
                        paddingBottom: 10,
                      }}
                    >
                      <input type="checkbox" name={`play${i}:remove`} aria-label="Remove this play rule" />{" "}
                      remove
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(knowledgeType === "concept" || knowledgeType === "judgment_guideline") && (
        <p style={{ ...HINT, border: "1px solid #e7e1d3", borderRadius: 10, padding: "10px 12px" }}>
          Teaching content — this type carries no rules. The plain-words text above is the whole
          item; nothing here plays at the table.
        </p>
      )}

      {/* Inline settings the item exposes — same setting{i}:* contract. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="hidden" name="settingCount" value={(item?.settings.length ?? 0) + 1} />
        {[...(item?.settings ?? []), null].map((spec, i) => (
          <div key={spec?.key ?? `new${i}`} style={{ ...CARD, padding: "12px 13px" }}>
            <p style={BAND_HEAD}>
              {spec ? `Setting — ${spec.label}` : "New setting (leave key empty to skip)"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={ROW2}>
                <Field label="Key">
                  <input name={`setting${i}:key`} defaultValue={spec?.key ?? ""} style={INPUT} />
                </Field>
                <Field label="Label">
                  <input name={`setting${i}:label`} defaultValue={spec?.label ?? ""} style={INPUT} />
                </Field>
              </div>
              <div style={ROW2}>
                <Field label="Control">
                  <select
                    name={`setting${i}:control`}
                    defaultValue={spec?.control ?? "toggle"}
                    style={INPUT}
                  >
                    {["toggle", "range_hcp", "number", "single_select", "multi_select"].map((c2) => (
                      <option key={c2}>{c2}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Role">
                  <select
                    name={`setting${i}:role`}
                    defaultValue={spec?.role ?? "parameter"}
                    style={INPUT}
                  >
                    <option value="enable">enable (on/off gate)</option>
                    <option value="parameter">parameter ($setting)</option>
                  </select>
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                {spec?.control === "range_hcp" ? (
                  <>
                    <Field label="Default low">
                      <input
                        name={`setting${i}:defaultLow`}
                        type="number"
                        defaultValue={(spec.default as { low: number }).low}
                        style={INPUT}
                      />
                    </Field>
                    <Field label="Default high">
                      <input
                        name={`setting${i}:defaultHigh`}
                        type="number"
                        defaultValue={(spec.default as { high: number }).high}
                        style={INPUT}
                      />
                    </Field>
                  </>
                ) : spec?.control === "toggle" || !spec ? (
                  <label style={{ font: `500 12px ${FONT_KARLA}`, color: "#1d1a15" }}>
                    <input
                      name={`setting${i}:default`}
                      type="checkbox"
                      defaultChecked={Boolean(spec?.default ?? true)}
                      aria-label="Setting default (on/off)"
                    />{" "}
                    default on
                  </label>
                ) : (
                  <Field label="Default">
                    <input
                      name={`setting${i}:default`}
                      defaultValue={String(spec?.default ?? "")}
                      style={INPUT}
                    />
                  </Field>
                )}
                {spec && (
                  <label
                    style={{ font: `500 11px ${FONT_KARLA}`, color: "#8a2d23", paddingBottom: 10 }}
                  >
                    <input type="checkbox" name={`setting${i}:remove`} aria-label="Remove this setting" />{" "}
                    remove
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <details>
        <summary style={{ cursor: "pointer", font: `500 11px ${FONT_KARLA}`, color: "#7b7466" }}>
          Advanced: raw payload / settings JSON (overrides the typed fields when filled)
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <textarea
            name="payloadJson"
            rows={6}
            placeholder={JSON.stringify(item?.payload ?? { kind: "auction_rules", rules: [] })}
            aria-label="Raw payload JSON"
            style={MONO_INPUT}
          />
          <textarea
            name="settingsJson"
            rows={3}
            placeholder={JSON.stringify(item?.settings ?? [])}
            aria-label="Raw settings JSON"
            style={MONO_INPUT}
          />
        </div>
      </details>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="submit"
          name="saveAs"
          value="existing"
          style={{
            border: "none",
            background: "#205e63",
            color: "#fff",
            borderRadius: 10,
            padding: 13,
            font: `600 13px ${FONT_KARLA}`,
            cursor: "pointer",
          }}
        >
          {item ? "Save and update this table" : "Create knowledge item"}
        </button>
        {item && (
          <button
            type="submit"
            name="saveAs"
            value="new"
            style={{
              border: "1px solid #d3ccbb",
              background: "#fff",
              color: "#5e5749",
              borderRadius: 10,
              padding: 12,
              font: `600 12px ${FONT_KARLA}`,
              cursor: "pointer",
            }}
          >
            Save as new knowledge item
          </button>
        )}
        <p style={HINT}>
          Saves land on the item&apos;s current draft and recompile the knowledge base
          immediately — this table re-pins to the fresh rules and comes back paused.
        </p>
      </div>
    </form>
  );
}
