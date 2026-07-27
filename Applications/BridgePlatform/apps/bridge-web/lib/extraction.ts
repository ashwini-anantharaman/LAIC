// The Claude section extractor (Knowledge Rework §4): one-shot structured —
// a section yields complete, compilable items or lands in the failure report.
// LLM boundary: extraction assistance only; output is attributed, editable
// content citing exact passages. Claude NEVER decides bids or plays.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ExtractionSection,
  ExtractorOutput,
  KbSourcePassage,
  SectionExtractor,
} from "@bridge/kb";
import { pageRangeOfPassages } from "@bridge/kb";
import {
  createVisionClient,
  slicePdf,
  type PageReading,
  type VisionClient,
  type VisionContentBlock,
} from "./visualIngest";
import {
  buildDedupeContext,
  buildSectionMapPrompt,
  mergeVisualOutputs,
  pagesInRange,
  parseSectionMapResponse,
  readingsFromPassages,
  sectionWindows,
  type VisualSection,
  type VisualWindowOutput,
} from "./visualSections";

export function extractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// The knowledge-language contract, spelled out for the model. Kept in one
// template so prompt and validator (the compiler) evolve together.
export const LANGUAGE_REFERENCE = `
You convert bridge system documentation into STRUCTURED knowledge items.

Return STRICT JSON (no markdown fences, no commentary) of shape:
{
  "items": [ExtractedItem...],
  "edges": [ExtractedEdge...]
}

ExtractedItem = {
  "localId": string,                 // section-local, e.g. "nt1"
  "title": string,                   // short, canonical, e.g. "1NT opening"
  "humanReadableText": string,       // 1-3 sentences a bridge player would read
  "knowledgeType": "concept"|"bidding_rule"|"convention"|"agreement"|
    "declarer_technique"|"defensive_technique"|"lead_agreement"|
    "signal_agreement"|"judgment_guideline"|"exception"|"fallback_rule",
  "phase": "auction"|"opening_lead"|"declarer_play"|"defense"|"scoring",
  "payload": ItemPayload,
  "settings": [SettingSpec...],      // optional; controls this item exposes
  "citedPassageOrdinals": [number...], // REQUIRED, the passages this came from
  "supportedLevels": [string...]     // optional advisory tags like "beginner"
}

ItemPayload — one of:
  {"kind":"auction_rules","rules":[AuctionRuleSpec...]}
  {"kind":"lead_rules","leads":[{"versus":"suit"|"notrump"|"any","style":
    "fourth_best"|"top_of_sequence"|"low_from_honor"|"top_of_nothing"|"low_from_longest"}]}
  {"kind":"signals","signals":{"attitude":"standard"|"upside_down"|"none",
    "count":"standard"|"reverse"|"none","firstDiscard":"attitude"|"count"|"none"}}
  {"kind":"play_rules","rules":[{"position":"lead"|"second"|"third"|"fourth"|"any",
    "side":"declarer"|"defense"|"any","behavior":"lowest_following"|"highest_following"|
    "win_cheaply"|"second_hand_low"|"third_hand_high"|"cover_honor"|"cash_winners"|
    "lowest_legal"|"discard_lowest"|"draw_trumps"|"finesse_toward_tenace"|
    "hold_up_stopper"|"duck_to_preserve_entry"|"establish_long_suit"|"ruff_loser"|
    "discard_loser_on_winner"|"cash_out_when_enough"|"return_partner_suit"|
    "hold_up_ace"|"overruff_or_discard"|"second_hand_rise_vs_honor","priority":number}]}
  {"kind":"forcing_rules","rules":[ForcingRuleSpec...]}  // auctions where PASS is not available
  {"kind":"none"}                    // concepts / judgment guidelines (teaching prose)

AuctionRuleSpec = {
  "key": string,                     // item-local, e.g. "open"
  "label": string,                   // trace label, e.g. "Open 1NT"
  "context": {
    "role": "opening"|"opener"|"responder"|"overcaller"|"advancer"|"any",
    "contested"?: boolean,
    "opening"?: CallPattern,         // the partnership's opening (responder/rebids)
    "partnerLast"?: CallPattern, "ownLast"?: CallPattern, "rhoLast"?: CallPattern,
    "lhoLast"?: CallPattern,                       // left-hand opponent's last call
    "ownFirst"?: CallPattern, "partnerFirst"?: CallPattern,  // each seat's FIRST non-pass call
    "roundMin"?: number, "roundMax"?: number,  // 1-based partnership round
    "vulnerability"?: "equal"|"favorable"|"unfavorable",  // relative to this seat
    "oppSuitsBidMin"?: number, "oppSuitsBidMax"?: number, // DISTINCT suits the opponents bid
    "partnerCued"?: boolean,           // partner's last bid is a cue of THEIR suit
    "askInProgress"?: string           // an ask with this id awaits my reply (partner's
                                       // last bid posed it) — e.g. "blackwood"; use on the
                                       // response rules so a natural/quantitative 4NT differs
  },
  "conditions": HandCondition,
  "action": {"type":"bid","level":1-7,"strain":"C"|"D"|"H"|"S"|"N"} |
            {"type":"pass"} | {"type":"double"} | {"type":"redouble"} |
            {"type":"bid_longest","among":["S","H"],"level"?:number} |
            {"type":"raise_partner","toLevel":number} |
            {"type":"first_legal_of","calls":[{"level":n,"strain":s}...]} |
            {"type":"bid_suit","suit":SuitRef,"level"?:number},  // cue-bid RHO's suit / rebid own
                                       // suit / bid the agreed suit ("bid_suit" + "agreed_suit")
  "priority": number,                // lower fires first within the item's band
  "shows"?: RuleShows,               // OPTIONAL: what this bid promises. Omit and the compiler
                                     // derives it from the conditions; give it when the bid shows
                                     // more than it tests (e.g. a raise showing 3+ trumps + points)
  "ask"?: RuleAsk                    // OPTIONAL: mark a Blackwood/RKCB/Gerber ASK and decode replies
}

RuleShows = {"hcp"?:{"min"?:number,"max"?:number},
  "tp"?:{"min"?:number,"max"?:number},        // total points
  "suits"?:[{"suit":"C"|"D"|"H"|"S","min"?:number,"max"?:number}...],
  "forcing"?:boolean}

RuleAsk = {"id":string,                        // e.g. "blackwood", matched by askInProgress
  "responses":{"<call>":{"keycards"?:[number...],"kings"?:[number...]}}}
  // Each of partner's possible replies → its meaning as a SET of values, so 5D = "1 or 4
  // keycards" is [1,4]. The engine decodes partner's actual reply into partnerShownKeycards.

CallPattern = {"kind":"bid"|"pass"|"double"|"redouble"|"any_bid"|"any"|"none",
  "level"?:number,                   // shorthand for levelMin = levelMax = level
  "levelMin"?:number,"levelMax"?:number,"strains"?:["C"|"D"|"H"|"S"|"N"...]}

ForcingRuleSpec = {"key":string,"label":string,"context":<same shape as AuctionRuleSpec.context>,
  "priority":number}
  // In a matching context the player may NOT pass: pass-realizing rules are
  // suppressed and, with nothing better, it bids its cheapest long suit.
  // Use for: two-over-one, new-suit-forcing, strong 2C, RONF, cue-bid raises,
  // Blackwood replies. NOT for merely invitational sequences.

SuitRef = "S"|"H"|"D"|"C"|"partner_last_bid_suit"|"partner_first_bid_suit"|
  "own_longest_suit"|"own_shortest_suit"|"own_first_bid_suit"|"own_last_bid_suit"|
  "rho_bid_suit"|"lho_bid_suit"|
  "only_unbid_suit"|  // the FOURTH suit when exactly three have been bid (fourth-suit-forcing)
  "agreed_suit"       // the partnership's agreed trump suit (a suit both named, else the best
                      // known 8-card combined fit) — use for "bid 6 of the fit suit"

HandCondition = {"all":[...]} | {"any":[...]} | {"not":...} |
  {"hcp":{"min"?:NumParam,"max"?:NumParam}} |
  {"totalPoints":{"min"?:NumParam,"max"?:NumParam}} |   // HCP + length points
  {"suitLength":{"suit":SuitRef,"min"?:NumParam,"max"?:NumParam}} |
  {"longestSuitAmong":{"suits":["S","H"...]}} |
  {"balanced":true|false} |
  {"suitQuality":{"suit":SuitRef,"quality":"two_of_top_three"|"three_of_top_five"}} |
  {"hasStopperIn":{"suit":SuitRef}} |
  {"aces":{"min"?:NumParam,"max"?:NumParam}} |          // Blackwood/Gerber responses
  {"kings":{"min"?:NumParam,"max"?:NumParam}} |
  {"keycards":{"suit":SuitRef,"min"?:NumParam,"max"?:NumParam}} |  // aces + that suit's K (RKCB)
  {"holds":{"suit":SuitRef,"rank":2-14}} |              // a specific card (trump Q = rank 12)
  {"playingTricks":{"min"?:NumParam,"max"?:NumParam}} | // A=1; K=1 with 2+ (0.5 alone); Q=0.5 with 3+;
                                                        // +1/card past 3rd in an honor-headed suit (preempt discipline)
  // Partnership checks (reason about the COMBINED hands — partner's shown state
  // comes from replaying the auction against these very rules' shows/ask):
  {"partnerShownHcp":{"min"?:NumParam,"max"?:NumParam}} |   // partner has PROMISED this HCP range
  {"partnerShownLength":{"suit":SuitRef,"min"?:NumParam,"max"?:NumParam}} | // …this suit length
  {"combinedHcp":{"min"?:NumParam,"max"?:NumParam}} |       // my HCP + partner's shown bound
  {"combinedKeycards":{"min"?:NumParam,"max"?:NumParam}} |  // my keycards + partner's decoded ask reply
  {"keycardsMissing":{"min"?:NumParam,"max"?:NumParam}} |   // 5 − combined (the sign-off test)
  {"fitEstablished":{"suit"?:SuitRef|"any"|"any_major","minCombined"?:NumParam}} | // combined length ≥ 8 (default)
  {"unshownSupport":{"suit":SuitRef,"min"?:NumParam}}       // I HOLD min+ but have not yet shown it (delayed support)

NumParam = number | {"$setting":"<setting key>","field"?:"low"|"high"}

SettingSpec = {"key":string,"label":string,
  "control":"toggle"|"single_select"|"multi_select"|"range_hcp"|"number",
  "role":"enable"|"parameter","default":value,"options"?:[{"value","label"}...],
  "min"?:number,"max"?:number,"description"?:string}

ExtractedEdge = {"fromLocalId":string,
  "edgeType":"requires"|"conflicts_with"|"teaches"|"exception_to",
  "toLocalId"?:string, "toExistingTitle"?:string, "toConceptId"?:string}

RULES:
- Every item MUST cite the passage ordinals it came from.
- A CONVENTION (artificial agreement like Stayman) should declare an "enable"
  toggle setting (e.g. key "stayman_on") so players can switch it on/off.
- Numeric ranges the document treats as an agreement (like a 1NT range)
  should be "parameter" settings referenced via {"$setting": key} so editors
  can retune them.
- Prefer several small items over one giant item. One agreement = one item;
  a convention's related bids (ask + opener's replies) belong in ONE item as
  multiple rules.
- If the section is prose, history, or examples with nothing structurally
  actionable, return {"items":[],"edges":[],"skippedReason":"..."}.
- If part of a section can't be expressed in this language, extract what can
  be and OMIT the rest (do not invent approximations that change meaning).
- knowledgeType "concept"/"judgment_guideline" use payload {"kind":"none"} —
  they are teaching content.
`;

/**
 * The extractor's JSON contract, parsed. Same discipline for text and slides:
 * slice the first "{" … last "}" (models like to preface), require an items
 * array, tolerate a missing edges array. Throwing here lands the section in the
 * job's failure report — it never half-lands.
 */
export function parseExtractorOutput(text: string): ExtractorOutput {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart)
    throw new Error("extractor returned no JSON object");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as ExtractorOutput;
  if (!Array.isArray(parsed.items))
    throw new Error("extractor output missing items array");
  parsed.edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  return parsed;
}

export function createClaudeExtractor(): SectionExtractor {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Extraction needs ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  return async (section: ExtractionSection): Promise<ExtractorOutput> => {
    const passagesBlock = section.passages
      .map((p) => `[passage ${p.ordinal}]\n${p.text}`)
      .join("\n\n");

    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: LANGUAGE_REFERENCE,
      messages: [
        {
          role: "user",
          content: `Section: "${section.anchor}"\n\n${passagesBlock}\n\nExtract the knowledge items for this section as strict JSON.`,
        },
      ],
    });
    const message = await stream.finalMessage();

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? b.text : ""))
      .join("");
    return parseExtractorOutput(text);
  };
}

// ===========================================================================
// VISUAL (slide-deck) extraction — section map, then section by section
// ===========================================================================
//
// The deck's meaning lives in tables, colour-coded rows, 2D matrices and card
// diagrams; a text layer destroys all of it. So the extractor sees the PIXELS:
// each window of the section is sent as a native PDF document block alongside
// the same LANGUAGE_REFERENCE the text extractor uses. Additive — the text path
// above is untouched.

/** Extraction model when the caller doesn't pass one (matches the text
 *  extractor). The wizard passes ingestModel(<option>).extractionModel. */
export const DEFAULT_VISUAL_EXTRACTION_MODEL = "claude-opus-4-8";
/** Section-map calls are cheap: a digest in, a table of contents out. */
export const DEFAULT_SECTION_MAP_MODEL = "claude-opus-4-8";

const VISUAL_MAX_TOKENS = 16000;
const SECTION_MAP_MAX_TOKENS = 4000;

function pdfDocumentBlock(bytes: Uint8Array): VisionContentBlock {
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from(bytes).toString("base64"),
    },
  };
}

async function askVision(input: {
  client: VisionClient;
  model: string;
  system: string;
  blocks: VisionContentBlock[];
  maxTokens: number;
}): Promise<string> {
  const stream = input.client.messages.stream({
    model: input.model,
    max_tokens: input.maxTokens,
    thinking: { type: "adaptive" },
    system: input.system,
    messages: [{ role: "user", content: input.blocks }],
  });
  const message = await stream.finalMessage();
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/** The "your JSON was malformed, re-emit it" nudge — one repair attempt, the
 *  same idiom the reading pass uses. */
function repairBlock(shape: string, previous: string): VisionContentBlock {
  return {
    type: "text",
    text:
      `Your previous reply was not parseable as the required JSON object. ` +
      `Re-emit it as STRICT JSON of shape ${shape}, with no prose and no markdown fences. ` +
      `Previous reply:\n\n${previous}`,
  };
}

// ---------------------------------------------------------------------------
// C1. The section map
// ---------------------------------------------------------------------------

export interface ProposeSectionsInput {
  /** Per-page readings from the reading pass (page, kind, title, transcript). */
  pageReadings?: PageReading[];
  /** …or the stored page passages (ordinal = page); readings are recovered. */
  passages?: readonly KbSourcePassage[];
  /** Defaults to the highest page number seen. */
  pageCount?: number;
  deckTitle?: string;
  /** The wizard passes its chosen option's READING model (the cheap one). */
  model?: string;
  client?: VisionClient;
}

/**
 * ONE cheap call over the page readings (their titles + opening lines, plus any
 * agenda/contents slides in full) proposing the deck's table of contents:
 * contiguous, non-overlapping, human-named sections covering every page. The
 * result is REPAIRED deterministically (validateSections) before it is returned,
 * so a sloppy proposal still yields an editable, complete map.
 *
 * Grouping already-transcribed text is a reading-grade task, so it runs on the
 * chosen option's READING model (Haiku on "balanced") — it is the cheap call in
 * the plan's cost table.
 */
export async function proposeSections(input: ProposeSectionsInput): Promise<VisualSection[]> {
  const readings = input.pageReadings ?? readingsFromPassages(input.passages ?? []);
  const pageCount = input.pageCount ?? readings.reduce((max, r) => Math.max(max, r.page), 0);
  if (pageCount < 1) return [];
  const client = input.client ?? createVisionClient();
  const model = input.model ?? DEFAULT_SECTION_MAP_MODEL;
  const { system, user } = buildSectionMapPrompt({
    readings,
    pageCount,
    ...(input.deckTitle ? { deckTitle: input.deckTitle } : {}),
  });
  const blocks: VisionContentBlock[] = [{ type: "text", text: user }];

  const first = await askVision({
    client,
    model,
    system,
    blocks,
    maxTokens: SECTION_MAP_MAX_TOKENS,
  });
  try {
    return parseSectionMapResponse(first, pageCount);
  } catch {
    const repaired = await askVision({
      client,
      model,
      system,
      blocks: [...blocks, repairBlock('{"sections":[{"title","fromPage","toPage"}]}', first)],
      maxTokens: SECTION_MAP_MAX_TOKENS,
    });
    return parseSectionMapResponse(repaired, pageCount);
  }
}

// ---------------------------------------------------------------------------
// C2. Per-section extraction from the slides themselves
// ---------------------------------------------------------------------------

/**
 * How to read a SLIDE, appended to LANGUAGE_REFERENCE. This is where the
 * quality lives: every table row is a candidate rule, row colour is semantics,
 * a matrix cell carries both of its axes, and a "DON'T USE" row must NOT become
 * a rule.
 */
export const SLIDE_EXTRACTION_GUIDANCE = `
THESE ARE SLIDES, NOT PROSE. The attached PDF holds the ACTUAL PAGES of a bridge
teaching deck. Read the pixels: the tables, the row colours, the matrices, the
card diagrams and the example hands. The same JSON contract above applies, with
two additions:

- "citedPassageOrdinals" for a slide deck are the PAGE NUMBERS of the slides the
  item came from (the user message lists this window's page numbers). One passage
  per page exists already, so [14] means "slide 14".
- ExtractedItem may also carry "internalNotes": string — fellow-facing working
  notes (example hands, warnings, anything you could not read). Never shown to
  players, so it is the right home for material that is not a rule.

HOW TO READ A BIDDING TABLE
- EVERY ROW IS A CANDIDATE RULE. A table of related bids is normally ONE item
  with one AuctionRuleSpec per row, "priority" ascending in the table's own
  top-to-bottom order (the deck orders rows from most to least specific).
- POINTS column -> {"hcp":{...}}. Use "totalPoints" instead when the column says
  total points, points with distribution, support points or dummy points.
  "16+" -> min only; "8-10" -> min and max; "up to 7" -> max only. A range the
  deck treats as an agreement (a 1NT range, a preempt style) becomes a
  "parameter" setting referenced as {"$setting":"<key>"}.
- SUIT LENGTH / SUPPORT column -> {"suitLength":{"suit":<SuitRef>,...}} on the
  RIGHT SuitRef, which is the whole point:
    "3+ support", "3+ trumps"      -> "partner_last_bid_suit" (or
                                      "partner_first_bid_suit" when the row is
                                      about opener's FIRST suit, and
                                      "agreed_suit" once a fit is agreed)
    "4+ M", "a four-card major"    -> one rule per major, or
                                      {"longestSuitAmong":{"suits":["S","H"]}}
    "5+ in your suit"              -> "own_longest_suit" / "own_first_bid_suit"
    "balanced"                     -> {"balanced":true}
    "shortness", "singleton"       -> a suitLength max
- BID column -> the "action". "raise to 3" -> {"type":"raise_partner","toLevel":3};
  "bid partner's suit" / "cue-bid their suit" / "bid the fit suit" ->
  {"type":"bid_suit","suit":<SuitRef>}; "pass" -> {"type":"pass"}.
- NOTE column -> the metadata, not prose to throw away: "forcing" ->
  "shows":{"forcing":true}; "game forcing", "invitational", "sign-off", "shows
  15+" -> "shows" (hcp/tp/suits/forcing) plus one clear sentence in
  "humanReadableText". When PASS must be suppressed in that auction (two-over-one,
  new-suit-forcing, a strong 2C, a Blackwood reply), ALSO emit a
  {"kind":"forcing_rules"} item whose context matches the auction.
- EXAMPLE / EXAMPLE HAND column -> "internalNotes" (e.g. "Slide 17 example:
  spades xxx, hearts KJx, diamonds xx, clubs QJxxx"). NEVER a rule and NEVER a
  condition — a sample hand is not an agreement.

ROW COLOUR IS SEMANTIC — ENCODE IT, DO NOT DESCRIBE IT
- Slide decks colour rows to carry meaning. This deck's convention (state what
  the slide or its legend actually says, and follow it): ORANGE / amber rows are
  FORCING for one round; GREEN rows are GAME-FORCING. A legend slide overrides
  any guess.
- An orange row -> "shows":{"forcing":true} on that rule, plus a
  {"kind":"forcing_rules"} item covering that context when partner may not pass.
- A green row -> "shows":{"forcing":true} and a "humanReadableText" that says
  game-forcing; where the colour implies a strength floor the deck states, put it
  in "shows" too.
- If a colour appears whose meaning the slide does not define, do NOT invent a
  meaning: extract the row without it and note the colour in "internalNotes".

2D MATRICES (support one axis, strength the other)
- ONE RULE PER CELL, with BOTH axes as conditions:
  {"all":[{"suitLength":{"suit":"partner_last_bid_suit","min":3}},
          {"hcp":{"min":10,"max":12}}]} and the cell's bid as the action.
- Name the axes in "humanReadableText". A blank, dashed or "-" cell is not a
  rule. A cell reading "pass" IS a rule ({"type":"pass"}).

COMBINED OPENER / RESPONDER STRENGTH TABLES
- Use the partnership predicates: {"combinedHcp":{"min":25}} for "25+ combined
  for game"; {"partnerShownHcp":{...}} / {"partnerShownLength":{...}} when the
  row keys off what PARTNER has already promised; {"fitEstablished":{...}} for
  "once we have a fit"; {"unshownSupport":{...}} for delayed support.

NEGATIVE AGREEMENTS ARE NOT RULES
- A row, box or slide marked "Undiscussed, DON'T USE THEM!", "not our
  agreement", "avoid" or similar must NOT produce rules for those sequences.
  Record it as an "internalNotes" warning on the item that covers that table
  (e.g. "Slide 31 marks the 2D and 2H responses as UNDISCUSSED - DON'T USE
  THEM; no rules extracted for them"), or, if no item covers it, as one
  "agreement" item with payload {"kind":"none"} that says so.

PLAY, DIAGRAM AND PROBABILITY SLIDES ARE NOT AUCTION RULES
- Card-position diagrams (finesses, holdups, safety plays) with a recommended
  line — often drawn as a green arrow or line — four-hand deal figures, and
  percentage/probability tables are TEACHING content:
  "declarer_technique" / "defensive_technique" / "concept" / "judgment_guideline".
- Payload {"kind":"play_rules"} only when the recommendation really is one of the
  listed behaviors (finesse_toward_tenace, hold_up_stopper, draw_trumps,
  duck_to_preserve_entry, third_hand_high, return_partner_suit, ...);
  {"kind":"lead_rules"} for opening-lead style; otherwise {"kind":"none"} with
  the technique explained in "humanReadableText".
- A probability table becomes ONE "judgment_guideline" item whose
  "humanReadableText" carries the numbers as printed. NEVER auction_rules.
- Signal agreements (attitude/count/first discard) use {"kind":"signals"}.

DISCIPLINE
- Title items the way the deck does, scoped enough to be unique across the deck
  ("1NT response to 1H/1S", not "Responses").
- Some pages of this window may also appear in the next window; extract a table
  only where this window shows it completely. A half-visible row is not a rule.
- Never invent a bid, a point range, a holding or a colour meaning that is not on
  the slides. If a cell is unreadable, omit that row and say so in
  "internalNotes".
- If this window is a title slide, an agenda, a quiz answer key or otherwise has
  nothing structurally actionable, return {"items":[],"edges":[],
  "skippedReason":"..."}.
`;

export interface VisualExtractionContext {
  kbId: string;
  sourceId: string;
  /** The WHOLE stored PDF; windows are sliced out of it here. */
  bytes: Uint8Array;
  /** Titles already in the KB — the model is told not to repeat them, and a
   *  repeat that slips through is dropped in the merge. */
  existingTitles?: string[];
  /** Setting keys already declared (KB-global; a second declaration would fail
   *  the compiler and lose the item). */
  existingSettingKeys?: string[];
  model?: string;
  client?: VisionClient;
  windowSize?: number;
  windowOverlap?: number;
  /** Injected in tests (no pdf-lib, no network in CI). */
  slicePages?: (bytes: Uint8Array, fromPage: number, toPage: number) => Promise<Uint8Array>;
}

export interface VisualSectionExtractionInput extends VisualExtractionContext {
  section: VisualSection;
}

/** The per-window user message. Pure, so the wiring is inspectable in tests. */
export function buildVisualExtractionUser(input: {
  section: VisualSection;
  windowPages: number[];
  dedupeContext: string;
}): string {
  const { section, windowPages } = input;
  const first = windowPages[0] ?? section.fromPage;
  const last = windowPages[windowPages.length - 1] ?? section.toPage;
  return [
    `Section: "${section.title}" — pages ${section.fromPage}-${section.toPage} of the deck.`,
    `The attached PDF holds this window's ${windowPages.length} page(s) in order: ${windowPages.join(", ")} (original deck page numbers ${first}-${last}).`,
    "",
    input.dedupeContext,
    "",
    `Extract the knowledge items visible on THESE SLIDES as strict JSON. Cite pages in "citedPassageOrdinals" using the original page numbers above.`,
  ].join("\n");
}

/**
 * Extract ONE named section of a slide deck. The section is split into windows
 * of ~6 pages with a 1-page overlap (a table that continues over a page break
 * is seen whole at least once); each window's PDF slice goes to the model as a
 * native document block — the PIXELS, not the transcription — with
 * LANGUAGE_REFERENCE + SLIDE_EXTRACTION_GUIDANCE as the system prompt and a
 * compact dedupe context in the user message. Windows are merged with duplicate
 * titles dropped, so a re-run or a neighbouring section cannot duplicate items.
 *
 * A window that will not parse (after one repair attempt) throws: the section
 * lands in the job's failure report and can be re-run. It never half-lands.
 */
export async function extractVisualSection(
  input: VisualSectionExtractionInput,
): Promise<ExtractorOutput> {
  const windows = sectionWindows(input.section, {
    ...(input.windowSize === undefined ? {} : { size: input.windowSize }),
    ...(input.windowOverlap === undefined ? {} : { overlap: input.windowOverlap }),
  });
  if (!windows.length)
    return {
      items: [],
      edges: [],
      skippedReason: `section "${input.section.title}" covers no pages`,
    };

  const client = input.client ?? createVisionClient();
  const model = input.model ?? DEFAULT_VISUAL_EXTRACTION_MODEL;
  const slice = input.slicePages ?? slicePdf;
  const system = `${LANGUAGE_REFERENCE}\n${SLIDE_EXTRACTION_GUIDANCE}`;

  // The dedupe context GROWS as windows land, so window 2 knows what window 1
  // already produced (the overlap page restates a table).
  const knownTitles = [...(input.existingTitles ?? [])];
  const knownSettingKeys = [...(input.existingSettingKeys ?? [])];
  const outputs: VisualWindowOutput[] = [];

  for (const window of windows) {
    const windowPages = pagesInRange(window.fromPage, window.toPage);
    const sliced = await slice(input.bytes, window.fromPage, window.toPage);
    const blocks: VisionContentBlock[] = [
      pdfDocumentBlock(sliced),
      {
        type: "text",
        text: buildVisualExtractionUser({
          section: input.section,
          windowPages,
          dedupeContext: buildDedupeContext({
            existingTitles: knownTitles,
            existingSettingKeys: knownSettingKeys,
          }),
        }),
      },
    ];

    const first = await askVision({
      client,
      model,
      system,
      blocks,
      maxTokens: VISUAL_MAX_TOKENS,
    });
    let output: ExtractorOutput;
    try {
      output = parseExtractorOutput(first);
    } catch {
      const repaired = await askVision({
        client,
        model,
        system,
        blocks: [...blocks, repairBlock('{"items":[...],"edges":[...]}', first)],
        maxTokens: VISUAL_MAX_TOKENS,
      });
      output = parseExtractorOutput(repaired);
    }

    outputs.push({ pages: windowPages, output });
    for (const item of output.items) {
      if (item?.title) knownTitles.push(item.title);
      for (const spec of item?.settings ?? []) if (spec?.key) knownSettingKeys.push(spec.key);
    }
  }

  return mergeVisualOutputs(outputs, {
    allowedOrdinals: pagesInRange(input.section.fromPage, input.section.toPage),
    ...(input.existingTitles ? { existingTitles: input.existingTitles } : {}),
    ...(input.existingSettingKeys ? { existingSettingKeys: input.existingSettingKeys } : {}),
  });
}

/**
 * The visual extractor as a plain SectionExtractor, so the existing
 * runExtraction/KbExtractionJob machinery drives it unchanged: a visual section
 * IS a section, carrying its page range (falling back to the min/max ordinal of
 * its page passages).
 */
export function createVisualSectionExtractor(
  context: VisualExtractionContext,
): SectionExtractor {
  return async (section: ExtractionSection): Promise<ExtractorOutput> => {
    const range = section.pageRange ?? pageRangeOfPassages(section.passages);
    if (!range)
      throw new Error(
        `visual extraction needs a page range: section "${section.anchor}" has no page passages`,
      );
    return extractVisualSection({
      ...context,
      section: { title: section.anchor, fromPage: range.fromPage, toPage: range.toPage },
    });
  };
}
