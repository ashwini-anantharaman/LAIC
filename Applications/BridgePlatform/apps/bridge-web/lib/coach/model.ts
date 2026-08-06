// The explanation layer: a model puts the answer into words a learner can reuse.
//
// An authority decides WHAT to play. This says WHY, and it exists because the
// authorities are bad writers. The guidelines hand back their own hardcoded
// sentence — which explains the card they REJECTED, not the ones they offered —
// and the solver hands back nothing at all. Neither was written for the person
// holding the cards.
//
// THREE THINGS IT IS NOT ALLOWED TO DO, all enforced in code rather than asked
// for in the prompt.
//
// 1. IT CANNOT SEE THE OTHER HANDS. It receives a VisiblePosition (visible.ts),
//    an object with no field for them. Hand a model the full deal and ask why a
//    card is right and it writes "because West has the Ace" — true, fluent, no
//    error raised, and the learner has been given a card off somebody else's
//    hand. There is no prompt that reliably prevents that. There is only not
//    sending it.
//
// 2. IT CANNOT CHANGE THE ANSWER. It is told which cards the authority chose and
//    may only explain those. Naming a different legal card as the play is a
//    validation failure, because a fluent second opinion silently overriding a
//    checked one is the worst outcome available here.
//
// 3. IT EXPLAINS THE SOLVER FROM COSTS, NEVER FROM CARDS. This used to be a flat
//    refusal — the solver's reasoning IS the hidden hands, so the model was not
//    asked, the panel said "worked out from the full deal" and stopped. Honest, and
//    useless: the learner is told an answer is right and given nothing to carry to
//    the next hand.
//
//    What crosses the boundary now is the COST TABLE — every legal card and the
//    tricks it takes. A trick count is a CONSEQUENCE, not a holding, and that is a
//    different category: "the A♠ takes nine, everything else eight" leaks no card
//    while carrying the one thing that makes an answer explicable, which is what
//    the alternatives would have cost. The hands themselves still never leave.
//
//    The residue is real, and named here rather than papered over: a model reading
//    a table can sometimes INFER a layout from it — "the ace must be offside" — and
//    that is a semantic leak with no card token in it for a regex to find.
//    `INFERS_LAYOUT` below catches the common phrasings. It is a guard, not a
//    proof, which is why the prompt asks for a reason the learner could reach from
//    their OWN cards rather than a narration of the search.
//
// Every failure degrades: no key, unreachable, refused, malformed, invalid — the
// panel keeps the authority's own wording. A missing explanation is a flourish
// that did not arrive, never an error a learner should see.

import Anthropic from "@anthropic-ai/sdk";

import { SEAT_NAME, step } from "./position";
import { leakedCards, type VisiblePosition } from "./visible";

export interface PlayExplanation {
  /** One or two sentences on why this card, written for a player. */
  why: string;
  /**
   * Why a card the authority ruled out is ruled out. The guidelines know this —
   * their own prose is about the rejected card — but they put it in the wrong
   * place, under the cards they kept.
   */
  notThis?: { label: string; why: string }[];
  /**
   * Set when the authority offered several cards it cannot separate. It explains
   * the tie; it never breaks it. Breaking it would be the model advising, and
   * nothing checks the model.
   */
  equivalent?: string;
}

export const modelConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Claude Opus 5 by default, overridable.
 *
 * This call sits behind a button someone is waiting on, so a smaller model is a
 * legitimate trade — but a deliberate one, which is why the default is the
 * capable model and the lever is an environment variable.
 */
const modelId = (): string => process.env.COACH_MODEL ?? "claude-opus-5";

/**
 * Adaptive thinking and the effort knob exist on the Claude 4.6+ line and are
 * REJECTED WITH A 400 by Haiku 4.5. This mattered in practice: `COACH_MODEL` is the
 * documented lever for trading quality against latency, and pointing it at haiku
 * made every call fail instantly — surfacing as `unreachable`, which reads as a
 * network problem, not a config one. The lever looked pulled and did nothing.
 */
const supportsAdaptive = (model: string): boolean => !/haiku/.test(model);

/** How long an explanation may be. It is a sentence at a card table, not an essay. */
const MAX_WHY = 320;

/**
 * The stable head of every request, and so the cached prefix — byte-identical on
 * every call, read at roughly a tenth of input price from the second request on.
 * Everything per-position rides in the user turn, after the breakpoint.
 */
const SYSTEM = `You put a bridge coach's answer into words a learner can reuse next time.

You are given a position exactly as the learner can see it — their own hand, dummy
if it is face up, every card already played, the auction — and the card or cards a
checked authority has already chosen. You are NOT given the other hands.

Your only job is to say WHY that card, in terms the learner could have reasoned to
themselves from what they can see.

HARD RULES. A response breaking any of these is discarded entirely:

- Do not change the answer. You may only explain the cards you were given. Never
  name a different legal card as the play, never hedge about whether the answer is
  right, never offer an alternative.
- Never mention a card that is not in the position you were given. If your
  explanation needs to know what an opponent holds, you do not have an
  explanation — say what CAN be seen instead.
- Always write cards with their suit symbol: 6♦, K♠, 10♥. Never as a bare run
  like Q97 or J10 or AK.
- If you were given several cards, the authority could not separate them. Say so
  in the "equivalent" field, and do not invent a reason to prefer one of them.
- If a PREFERRED card is named among them, that preference is bridge convention and
  not the authority's opinion: the cheapest card that does the job. Lead with that
  card and explain it in those terms — "the others are just as good, but there is no
  reason to spend a higher one". Never present it as the authority's choice.
- Explain the reason, not the rule's name. "A small card was led, so your honour
  isn't needed to win the trick" beats "second hand low applies here".
- Two sentences at most. The learner is mid-trick.

If a card the authority REJECTED was given to you, put one clause on why in
"notThis" — that is often the most useful thing on the screen, but it belongs
beside the rejected card and not underneath the chosen one.

SOMETIMES YOU ARE GIVEN A COST TABLE: every legal card and the number of tricks it
takes, from a solver that saw all four hands. You did not see them, and you must not
reconstruct them.

- The table tells you WHAT each card costs. It does not tell you why, and you must
  not guess. Never write that an opponent must hold a particular card, is void, is
  short, is long, has a suit stopped, or that anything sits well or badly, is onside
  or offside. Those are claims about hands you were not shown, and a response
  making one is discarded.
- Use the cost as the shape of the answer, then give the learner a reason they could
  have reached from their own cards and the bidding. "Cashing the A♠ first keeps the
  lead in the hand that still has diamonds to run" is useful. "The solver says nine
  tricks" is not — they have the verdict already; they asked why.
- Where several cards tie at the top, that tie is real: say they are interchangeable,
  in "equivalent". Do not pick between them yourself — but if a preferred card was
  named for you, lead with it, as convention rather than as calculation.
- Where every other card costs the same single trick, say that plainly and briefly
  rather than inventing a distinction between them.
- If you state what a card COSTS, the number must be the one in the table. Do not
  round it, soften it, or reach for "a trick" because it reads better. A wrong
  figure is discarded.`;

const SCHEMA = {
  type: "object",
  properties: {
    why: {
      type: "string",
      description: "One or two sentences on why this card, from what the learner can see.",
    },
    notThis: {
      type: "array",
      description: "Rejected cards, if any were given. One clause each.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "The rejected card, exactly as given." },
          why: { type: "string", description: "One clause on why it is worse." },
        },
        required: ["label", "why"],
        additionalProperties: false,
      },
    },
    equivalent: {
      type: "string",
      description: "Only when several cards were given: one clause saying they are interchangeable here.",
    },
  },
  required: ["why"],
  additionalProperties: false,
} as const;

/**
 * Language that asserts something about a hand the model was never shown.
 *
 * THE LEAK THIS CATCHES HAS NO CARD IN IT. Every other guard here scans for card
 * tokens; "the king must be offside" and "East is short in diamonds" contain none,
 * pass every one of them, and still hand the learner information from a hand they
 * cannot see. The opening was created deliberately — feeding the cost table is what
 * makes the solver explicable at all — so the risk it creates is met here.
 *
 * A LIST OF PHRASINGS IS NOT A PROOF, and pretending otherwise would be the actual
 * mistake. A model can leak the same fact in wording nobody enumerated. This raises
 * the cost of the common failures; the prompt asking for reasons drawn from the
 * learner's own cards is what lowers the rate.
 */
const INFERS_LAYOUT =
  /\b(?:must (?:hold|have|be)|offside|onside|marked with|(?:holds?|has|have) the (?:ace|king|queen|jack|ten)|finesse (?:works|fails|is on|is off)|lies? (?:well|badly)|lying (?:well|badly)|sits? (?:well|badly)|sitting (?:well|badly))\b/i;

/**
 * A claim about WHERE CARDS ARE — a void, a short suit, one holding sitting over
 * another. Leaks only when the hand in question is one the learner cannot see.
 *
 * SPLIT OUT FROM `INFERS_LAYOUT`, WHICH WAS WRONG ABOUT ALL OF THESE. Measured on
 * real positions, this family was the single largest cause of a learner getting a
 * card with no reason attached — and every sentence it killed deserved to be shown:
 *
 *   "You are void in spades and must discard, so throw a club."
 *   "Dummy's K♥ 10♥ 9♥ 8♥ sit over the lead, so your J♥ isn't needed."
 *   "Dummy still has K♦ Q♦ 5♦ behind your 7♦ 6♦ 3♦."
 *
 * Every one is about a hand the learner is looking at. Position and shape are not
 * secrets in themselves; they are secrets only about the two concealed hands, and
 * describing dummy sitting over the lead is the most ordinary explanation in bridge.
 *
 * `INFERS_LAYOUT` above keeps what cannot be innocent however it is phrased — an
 * offside king, a marked holding, a finesse that works, a queen sitting badly. Those
 * are conclusions about unseen cards, not descriptions of visible ones.
 *
 * (The same measurement caught `holds? the` matching "lets East HOLD THE TRICK",
 * which is about winning a trick and nothing to do with holding a card. It is now
 * scoped to holding a named honour.)
 */
const PLACEMENT_CLAIM =
  /\b(?:is|are|was|were)\s+(?:void|short|long)\b|\b(?:void|short|long)\s+in\b|\bsingleton\b|\bdoubleton\b|\bsits?\s+(?:over|under|behind)\b|\bsitting\s+(?:over|under|behind)\b|\bbehind\s+(?:you|your|my|the)\b|\bover\s+(?:your|my)\b/gi;

/** Hands the learner can see: their own, and dummy once it is down. */
const VISIBLE_SUBJECT = /\b(?:you|your|yours|dummy|dummy's|my|mine|hands?)\b/gi;

/** Where in `text` the last match of `re` begins, or -1. */
function lastIndexOfMatch(re: RegExp, text: string): number {
  let at = -1;
  for (const m of text.matchAll(re)) at = m.index;
  return at;
}

/**
 * Is this placement claim about a hand the learner is looking at?
 *
 * THE NEAREST SUBJECT WINS. Not "is a visible subject somewhere nearby", which was
 * the first attempt and which rejected a sentence this suite had asserted for
 * months: "The 2♦ West led is small, and your Q♦ sits behind dummy's 6♦." Every card
 * in it is visible — the 2♦ is on the table — but the word "West" appeared within
 * the window, so a mention of who LED became evidence of a claim about what West
 * HOLDS.
 *
 * Comparing positions instead reads the way the sentence does. "Your Q♦ sits behind
 * dummy's 6♦" attributes to `your`; "you can tell East is void in hearts" attributes
 * to `East` even though `you` also appears, and that one leaks.
 *
 * Word boundaries matter here too: `"east"` sits inside `"at least"`, and a substring
 * search would read that as naming an opponent.
 */
function aboutAVisibleHand(prose: string, at: number, pos: VisiblePosition): boolean {
  const before = prose.slice(0, at);
  const visible = lastIndexOfMatch(VISIBLE_SUBJECT, before);
  if (visible < 0) return false;
  const opponents = [
    SEAT_NAME[step(pos.seat, 1)],
    SEAT_NAME[step(pos.seat, 3)],
    "they",
    "them",
    "their",
    "opponents?",
    "defenders?",
    // Only an opponent when the learner is not the one declaring.
    ...(pos.role === "declarer" ? [] : ["declarer"]),
  ];
  return visible > lastIndexOfMatch(new RegExp(`\\b(?:${opponents.join("|")})\\b`, "gi"), before);
}

/**
 * Language that hedges about, or argues with, the answer it was given.
 *
 * "INSTEAD", "RATHER THAN" AND "HOWEVER" WERE REMOVED, on measurement. They are
 * CONTRAST markers, and contrast is how the correct answer gets explained: "play low
 * rather than waste the ace", "the 8♣ costs nothing, however you look at it". Both
 * sentences are exactly what a learner should read, and both were being discarded —
 * on real positions "rather than" was the single most common cause of a card arriving
 * with no reason attached.
 *
 * What is left is language that undermines the answer rather than explaining it: a
 * second option floated, a preference expressed for something else, doubt about
 * whether the answer is right at all.
 *
 * The real protection against the model CHANGING the answer is not this pattern but
 * the directed-play check below, which is exact: it looks for the model telling the
 * learner to play a specific card that is not the answer. This is the softer net for
 * tone, and a soft net set too wide catches nothing but good prose.
 */
const SECOND_GUESSING =
  /\b(but you could|could also|you could also|alternatively|another option|might be better|would be better|may be better|might prefer|would prefer|arguably|it depends|hard to say|some players|actually the)\b/i;

/**
 * A holding written without suit symbols — "Q97", "J10", "AK", "KQJ".
 *
 * A rank LETTER followed by more ranks, and not followed by a suit glyph. Both
 * halves are load-bearing. The first version was `[AKQJT2-9]{2,}` and missed the
 * exact notation that shipped once: "J10" is J, 1, 0 — and neither 1 nor 0 is in
 * that class, so it matched one character and fell straight through. Widening to
 * all digits instead flags "13" in "trick 1 of 13", so the anchor has to be the
 * letter. The lookahead is what keeps correctly-written "10♦" and "K♠" from
 * tripping it.
 */
const BARE_HOLDING = /\b[AKQJT][AKQJT0-9]+(?![♠♥♦♣])/;

/**
 * A claim about what something COSTS, with the number it claims.
 *
 * SCOPED TO COST VERBS deliberately. An earlier draft matched any "<number> trick"
 * phrase, which trips on "wastes the king on a trick the ace already wins" — "a
 * trick" there is the trick being played, not a price. The verb is what makes it a
 * cost claim, so the verb is required.
 */
const COST_CLAIM =
  /\b(?:cost|costs|costing|lose|loses|losing|gives?\s+up|giving\s+up|gives?\s+away|giving\s+away|throws?\s+away|throwing\s+away|concedes?|conceding|forfeits?|forfeiting)\s+(?:up\s+|away\s+)?(a|an|one|two|three|four|five|nothing|no\s+tricks?|[1-5])\s*(?:tricks?)?\b/gi;

const CLAIMED: Record<string, number> = {
  a: 1, an: 1, one: 1, "1": 1,
  two: 2, "2": 2,
  three: 3, "3": 3,
  four: 4, "4": 4,
  five: 5, "5": 5,
  nothing: 0,
};

/** How many tricks this card gives up against the best available. */
function costOf(
  card: string,
  scores: { card: string; tricks: number }[] | undefined,
): number | undefined {
  if (!scores?.length) return undefined;
  const entry = scores.find((s) => s.card === card);
  if (!entry) return undefined;
  return Math.max(...scores.map((s) => s.tricks)) - entry.tricks;
}

export interface ExplanationRejection {
  reason: "unconfigured" | "not-explainable" | "unreachable" | "refused" | "malformed" | "invalid";
  /** Which rule failed. Logged, never shown to a learner. */
  detail?: string;
  /**
   * The prose that was discarded. Logged, NEVER rendered — it failed a guard, and a
   * rejected explanation reaching a learner defeats the point of having one.
   *
   * It is here because "the coach sometimes has no reason" is impossible to diagnose
   * from a rule name alone: knowing a hedge fired says nothing about whether the
   * sentence deserved it.
   */
  raw?: string;
}

export interface ExplainInput {
  pos: VisiblePosition;
  /** The cards the authority chose, as labels. */
  best: string[];
  /**
   * Which of several tied cards to actually play, as a label.
   *
   * From convention rather than from the authority — see `preferOf` in advise.ts.
   * The distinction is in the prompt because a learner told "the solver prefers the
   * 8♣" has been misinformed about where the reason comes from.
   */
  prefer?: string;
  /** Which authority chose them. */
  source: "system" | "convention" | "solution";
  /** The authority's own wording, where it has any. Raw material, not the answer. */
  authorityBecause?: string;
  /** Legal cards the authority ruled out, so the model can say why. */
  rejected?: string[];
  /**
   * Every legal card with the tricks it takes. Required when `source` is
   * `solution`, because without it there is genuinely nothing to explain — the
   * solver publishes no reasoning of its own, only a verdict.
   */
  scores?: { card: string; tricks: number }[];
}

/**
 * At most a few rejected cards: one representative per cost tier, worst first.
 *
 * LATENCY LIVES IN THE OUTPUT. The call is output-bound — measured p50 barely moves
 * with thinking on or off, and prompt caching cannot touch it — and the output grows
 * with this list, because the model is asked for a clause per rejected card. A
 * position with ten legal cards produced ten near-identical clauses ("parting with a
 * trump costs two tricks", five times). Capping the list cut p90 by two seconds on
 * the same positions with identical validator survival.
 *
 * One card PER COST TIER is the principled cut, not just a shorter list: two cards
 * that cost the same trick count fail the same way, so the second clause carries
 * nothing. The highest-ranked card of each tier is kept because "why not the king?"
 * is the question a learner actually has; nobody asks why not the deuce.
 *
 * Tiers are ordered worst-first so the biggest mistake survives the cap. The full
 * table still goes to the model regardless — this trims what it is asked to WRITE,
 * not what it is allowed to know.
 */
export function capRejected(
  rejected: string[],
  scores: { card: string; tricks: number }[] | undefined,
  best: string[],
): string[] {
  if (rejected.length <= 3) return rejected;
  if (!scores?.length) return rejected.slice(0, 3);
  const chosen = new Set(best);
  const rejectable = new Set(rejected);
  const tiers = new Map<number, string>();
  // scores arrive best-first from DDS expansion order, but rank order within a tier
  // is not guaranteed — keep the highest-ranked card of each tier explicitly.
  // Labels write the ten as "10"; every other rank is its first character.
  const RANKS = "23456789TJQKA";
  const rankOf = (card: string) => RANKS.indexOf(card.startsWith("10") ? "T" : card[0]!);
  for (const s of scores) {
    if (chosen.has(s.card) || !rejectable.has(s.card)) continue;
    const held = tiers.get(s.tricks);
    if (held === undefined || rankOf(s.card) > rankOf(held)) tiers.set(s.tricks, s.card);
  }
  const capped = [...tiers.entries()]
    .sort((a, b) => a[0] - b[0]) // fewest tricks taken = costliest mistake, first
    .slice(0, 3)
    .map(([, card]) => card);
  return capped.length ? capped : rejected.slice(0, 3);
}

/**
 * The table as prose, best first.
 *
 * GROUPED BY TRICK COUNT rather than listed per card, and that is the whole point:
 * what a learner needs is "these two are equal, everything else drops a trick".
 * Thirteen lines of `card → n` invites the model to narrate the search instead,
 * and a narrated search is the one thing this must not produce.
 */
function costLines(scores: { card: string; tricks: number }[]): string {
  const byTricks = new Map<number, string[]>();
  for (const s of scores) {
    const tier = byTricks.get(s.tricks);
    if (tier) tier.push(s.card);
    else byTricks.set(s.tricks, [s.card]);
  }
  const tiers = [...byTricks.entries()].sort((a, b) => b[0] - a[0]);
  const top = tiers[0]?.[0] ?? 0;
  return tiers
    .map(([tricks, cards]) => {
      const cost = top - tricks;
      const label = cost === 0 ? "best" : cost === 1 ? "1 trick worse" : cost + " tricks worse";
      return `  ${tricks} tricks (${label}): ${cards.join(" ")}`;
    })
    .join("\n");
}

/**
 * Explain the play, or say why there is no explanation.
 *
 * `client` is injectable so the validator — the part that actually protects this —
 * is testable without a network or a key.
 */
export async function explainPlay(
  rawInput: ExplainInput,
  opts: { client?: Pick<Anthropic["messages"], "create">; timeoutMs?: number } = {},
): Promise<{ explanation: PlayExplanation } | ExplanationRejection> {
  // Capped BEFORE the prompt is built and BEFORE validation reads it, so the model
  // and the validator agree on which rejected cards exist. A notThis entry for a
  // card outside this list is dropped by the validator, which is correct: the
  // model was not asked about it.
  const input: ExplainInput = {
    ...rawInput,
    ...(rawInput.rejected?.length
      ? { rejected: capRejected(rawInput.rejected, rawInput.scores, rawInput.best) }
      : {}),
  };

  if (!input.best.length) return { reason: "not-explainable" };
  // The solver is explicable ONLY through its cost table. With no table there is no
  // material: it publishes a verdict and no reasoning, and a model asked "why is
  // this right" holding nothing but the answer will manufacture something. The
  // panel then falls back to "worked out from the full deal", which is at least true.
  if (input.source === "solution" && !input.scores?.length) {
    return { reason: "not-explainable", detail: "solver answer with no cost table" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!opts.client && !apiKey) return { reason: "unconfigured" };
  const messages = opts.client ?? new Anthropic({ apiKey: apiKey! }).messages;

  const user = [
    "Position (everything the learner can see):",
    JSON.stringify(input.pos, null, 1),
    "",
    `The answer to explain: ${input.best.join(" or ")}`,
    input.best.length > 1
      ? "The authority offered all of these and cannot separate them."
      : "",
    input.prefer
      ? `By convention the card to play is ${input.prefer} — the cheapest of the equals. That preference is convention, not the authority's.`
      : "",
    input.rejected?.length ? `Cards it ruled out: ${input.rejected.join(", ")}` : "",
    input.authorityBecause
      ? `The authority's own wording, which is written for a rulebook reader rather than a player — rewrite it, don't quote it:\n${input.authorityBecause}`
      : "",
    input.scores?.length
      ? `Cost table — tricks the playing side takes for each legal card, solved with all four hands. You were not shown those hands and must not reconstruct them:\n${costLines(input.scores)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let reply: Anthropic.Message;
  try {
    reply = await messages.create(
      {
        model: modelId(),
        max_tokens: 16000,
        // Adaptive at low effort rather than disabled on the models that have it:
        // with thinking off those can write a tool call into visible text or leak
        // internal tags. Measured, the thinking itself is not the latency — the
        // output is. Haiku rejects both knobs with a 400, so they are sent only
        // where they exist.
        ...(supportsAdaptive(modelId())
          ? {
              thinking: { type: "adaptive" as const },
              output_config: {
                effort: "low" as const,
                format: { type: "json_schema" as const, schema: SCHEMA },
              },
            }
          : { output_config: { format: { type: "json_schema" as const, schema: SCHEMA } } }),
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { timeout: opts.timeoutMs ?? 12_000 },
    );
  } catch {
    return { reason: "unreachable" };
  }

  // Check stop_reason BEFORE reading content: on a refusal `content` is empty or
  // partial, and indexing it unconditionally is how this crashes in production.
  if (reply.stop_reason === "refusal") return { reason: "refused" };

  const text = reply.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { reason: "malformed" };
  }
  return validateExplanation(parsed, input);
}

/**
 * The gate. Exported and pure, because models drift and a drifted explanation
 * should fail in a test rather than on a learner's screen.
 */
export function validateExplanation(
  raw: unknown,
  input: ExplainInput,
): { explanation: PlayExplanation } | ExplanationRejection {
  if (!raw || typeof raw !== "object") return { reason: "malformed" };
  const o = raw as Partial<PlayExplanation>;
  if (typeof o.why !== "string" || !o.why.trim()) return { reason: "malformed" };

  const rejected = new Set(input.rejected ?? []);
  const notThis = (o.notThis ?? []).filter(
    (n): n is { label: string; why: string } =>
      Boolean(n) && typeof n.label === "string" && typeof n.why === "string" && rejected.has(n.label),
  );
  const equivalent = typeof o.equivalent === "string" ? o.equivalent.trim() : "";
  const why = o.why.trim();
  const prose = [why, equivalent, ...notThis.map((n) => n.why)].join(" ");

  // Length: it appears under a card at a table.
  if (why.length > MAX_WHY) return { reason: "invalid", detail: `why is ${why.length} chars`, raw: why };

  // RULE 1 — no card the learner cannot see, and no bare holdings that would slip
  // past the glyph check. A model that writes "Q97" instead of "Q♦ 9♦ 7♦" is not
  // caught by a suit-symbol scan, which is exactly how an unseen holding gets
  // through: the notation, not the content, defeats the guard.
  if (BARE_HOLDING.test(prose)) {
    return { reason: "invalid", detail: `wrote a bare holding: ${BARE_HOLDING.exec(prose)?.[0]}`, raw: why };
  }
  const leaked = leakedCards(prose, input.pos);
  if (leaked.length) return { reason: "invalid", detail: `named unseen ${leaked.join(", ")}`, raw: why };

  // RULE 2 — it may not change the answer.
  //
  // Note what this does NOT check. Merely naming a card outside the answer is
  // fine and often the best part of the explanation — "the J♦ would be wasted
  // here" is exactly what a learner needs. An earlier version rejected any
  // non-chosen card and would have killed that sentence.
  //
  // What is actually forbidden is TELLING the learner to play one. And the
  // displayed answer is not in the model's output at all — the panel draws the
  // chips from the authority's `best` — so the model cannot change the answer,
  // only contradict it in prose. These two checks catch that.
  const best = new Set(input.best);
  // A card label is a rank plus a suit glyph — no regex metacharacters in either,
  // so it needs no escaping. Building the pattern from the label directly keeps
  // this readable; if labels ever gain punctuation this needs an escape step.
  const directed = (input.pos.legal ?? []).filter(
    (c) => !best.has(c) && new RegExp(`\\b(?:play|lead|use|choose)\\s+(?:the\\s+)?${c}`, "i").test(why),
  );
  if (directed.length) {
    return { reason: "invalid", detail: `told the learner to play ${directed.join(", ")}`, raw: why };
  }
  const hedge = SECOND_GUESSING.exec(why);
  if (hedge) return { reason: "invalid", detail: `hedges about the answer: "${hedge[0]}"`, raw: why };

  // RULE 2c — no claim about an unseen hand. Scoped to the whole prose rather than
  // just `why`, because "notThis" is where a rejected card invites exactly this
  // ("the J♦ loses to the king behind it").
  if (INFERS_LAYOUT.test(prose)) {
    return {
      reason: "invalid",
      detail: `inferred a hidden layout: ${INFERS_LAYOUT.exec(prose)?.[0]}`,
      raw: prose,
    };
  }
  for (const m of prose.matchAll(PLACEMENT_CLAIM)) {
    if (aboutAVisibleHand(prose, m.index, input.pos)) continue;
    return {
      reason: "invalid",
      detail: `placement claim about a hand it cannot see: "${m[0]}"`,
      raw: prose,
    };
  }

  // RULE 2b — a card from another suit cannot win THIS trick.
  //
  // Live failure: on a diamond lead the model wrote "letting your hand's Q♦/9♠
  // take care of the trick", naming a spade as the card that would win a diamond
  // trick. Every other rule passed — the spade was in a hand the learner can see,
  // nothing was ranked, the prose was specific and short. It was simply wrong
  // about bridge, which is the one thing a validator cannot check in general.
  //
  // This case it can. Scoped to winning verbs so a legitimate cross-suit remark
  // ("play low, you'll want the lead for your spades later") still passes.
  const led = input.pos.tricks.at(-1)?.plays[0]?.card.slice(-1);
  if (led) {
    const wrongSuit = [...(why.match(/(?:10|[2-9AKQJ])[♠♥♦♣]/g) ?? [])].filter(
      (c) => c.slice(-1) !== led,
    );
    const claimsWin = wrongSuit.filter((c) =>
      new RegExp(`${c}[^.]{0,40}\\b(?:take|takes|win|wins|winning|cover|covers|beat|beats|capture|captures)\\b`, "i").test(why),
    );
    if (claimsWin.length) {
      return {
        reason: "invalid",
        detail: `claimed ${claimsWin.join(", ")} wins a ${led} trick`,
      };
    }
  }

  // RULE 2d — A COST FIGURE MUST BE THE ONE IN THE TABLE.
  //
  // The model is handed exact trick counts, and the one thing it can do with an
  // exact number is get it wrong. "Costing a trick" about a card that throws two is
  // fluent, specific, sourced-looking and false, and no other rule here touches it:
  // the card is real, the suit is right, nothing hidden is named.
  //
  // Numbers are checkable, so they are checked. Scoped to `notThis`, where a card
  // label makes the expected figure unambiguous — a cost mentioned in `why` may
  // belong to any of several alternatives, and guessing which would invent
  // rejections rather than catch errors.
  for (const n of notThis) {
    const actual = costOf(n.label, input.scores);
    if (actual === undefined) continue;
    for (const m of n.why.matchAll(COST_CLAIM)) {
      const word = m[1]!.toLowerCase().replace(/\s+/g, " ");
      const claimed = word.startsWith("no ") ? 0 : CLAIMED[word];
      if (claimed === undefined) continue;
      if (claimed !== actual) {
        return {
          reason: "invalid",
          detail: `said ${n.label} costs ${claimed}, table says ${actual}`,
          raw: `${why} | notThis ${n.label}: ${n.why}`,
        };
      }
    }
  }

  // RULE 3 — say something from THIS deal. The anti-blandness guard.
  //
  // Any card actually in the deal counts, not just the chosen and rejected ones:
  // "let your Q♦ take care of the trick" is entirely specific to this position
  // even though the Q♦ is neither the answer nor an option. An earlier version
  // listed only best/rejected/auction and rejected exactly that sentence.
  const concrete = [
    ...input.best,
    ...(input.rejected ?? []),
    ...input.pos.auction.map((a) => a.call),
    ...input.pos.myHand.cards,
    ...(input.pos.dummy?.cards ?? []),
  ];
  if (!concrete.some((t) => prose.includes(t))) {
    return { reason: "invalid", detail: "nothing specific to this deal", raw: why };
  }

  return {
    explanation: {
      why,
      ...(notThis.length ? { notThis } : {}),
      // Only meaningful when the authority really did offer several.
      ...(equivalent && input.best.length > 1 ? { equivalent } : {}),
    },
  };
}
