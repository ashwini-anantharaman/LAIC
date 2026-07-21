// The Claude section extractor (Knowledge Rework §4): one-shot structured —
// a section yields complete, compilable items or lands in the failure report.
// LLM boundary: extraction assistance only; output is attributed, editable
// content citing exact passages. Claude NEVER decides bids or plays.

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionSection, ExtractorOutput, SectionExtractor } from "@bridge/kb";

export function extractionAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// The knowledge-language contract, spelled out for the model. Kept in one
// template so prompt and validator (the compiler) evolve together.
const LANGUAGE_REFERENCE = `
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
    "lowest_legal"|"discard_lowest","priority":number}]}
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
    "roundMin"?: number, "roundMax"?: number   // 1-based partnership round
  },
  "conditions": HandCondition,
  "action": {"type":"bid","level":1-7,"strain":"C"|"D"|"H"|"S"|"N"} |
            {"type":"pass"} | {"type":"double"} | {"type":"redouble"} |
            {"type":"bid_longest","among":["S","H"],"level"?:number} |
            {"type":"raise_partner","toLevel":number} |
            {"type":"first_legal_of","calls":[{"level":n,"strain":s}...]} |
            {"type":"bid_suit","suit":SuitRef,"level"?:number},  // cue-bid RHO's suit / rebid own suit
  "priority": number                 // lower fires first within the item's band
}

CallPattern = {"kind":"bid"|"pass"|"double"|"redouble"|"any_bid"|"any"|"none",
  "level"?:number,                   // shorthand for levelMin = levelMax = level
  "levelMin"?:number,"levelMax"?:number,"strains"?:["C"|"D"|"H"|"S"|"N"...]}

SuitRef = "S"|"H"|"D"|"C"|"partner_last_bid_suit"|"partner_first_bid_suit"|
  "own_longest_suit"|"own_first_bid_suit"|"own_last_bid_suit"|"rho_bid_suit"

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
  {"holds":{"suit":SuitRef,"rank":2-14}}                // a specific card (trump Q = rank 12)

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
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart)
      throw new Error("extractor returned no JSON object");
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as ExtractorOutput;
    if (!Array.isArray(parsed.items))
      throw new Error("extractor output missing items array");
    parsed.edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    return parsed;
  };
}
