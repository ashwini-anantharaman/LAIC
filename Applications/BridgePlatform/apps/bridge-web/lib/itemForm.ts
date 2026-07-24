// Typed item-editor form parsing (Knowledge Rework §6): each knowledgeType
// gets purpose-built controls whose FormData round-trips into the typed
// payload. The "advanced" raw-JSON field, when non-empty, wins outright —
// the compiler validates whatever comes out either way (last-good protects
// the KB from anything malformed).

import type {
  AuctionAction,
  AuctionContext,
  AuctionRuleSpec,
  CallPattern,
  ForcingRuleSpec,
  HandCondition,
  ItemPayload,
  KnowledgePhase,
  KnowledgeType,
  LeadSpec,
  NumParam,
  PlayRuleSpec,
  RuleAsk,
  RuleShows,
  SettingSpec,
  Strain,
} from "@bridge/kb";

const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string): number | undefined => {
  const raw = str(fd, key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** "18" → 18; "$nt_range.low" → {$setting:"nt_range",field:"low"}. */
function numParam(raw: string): NumParam | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith("$")) {
    const [key, field] = t.slice(1).split(".");
    if (!key) return undefined;
    return field === "low" || field === "high" ? { $setting: key, field } : { $setting: key };
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function callPattern(fd: FormData, prefix: string): CallPattern | undefined {
  const kind = str(fd, `${prefix}:kind`);
  if (!kind || kind === "unset") return undefined;
  const pattern: CallPattern = { kind: kind as CallPattern["kind"] };
  const levelMin = num(fd, `${prefix}:levelMin`);
  const levelMax = num(fd, `${prefix}:levelMax`);
  const strains = str(fd, `${prefix}:strains`);
  if (levelMin !== undefined) pattern.levelMin = levelMin;
  if (levelMax !== undefined) pattern.levelMax = levelMax;
  if (strains) pattern.strains = strains.split(",").map((s) => s.trim()) as Strain[];
  return pattern;
}

/** The typed condition subset the form edits directly; deeper trees use JSON. */
function conditions(fd: FormData, prefix: string): HandCondition {
  const all: HandCondition[] = [];
  const hcpMin = numParam(str(fd, `${prefix}:hcpMin`));
  const hcpMax = numParam(str(fd, `${prefix}:hcpMax`));
  if (hcpMin !== undefined || hcpMax !== undefined)
    all.push({ hcp: { ...(hcpMin !== undefined && { min: hcpMin }), ...(hcpMax !== undefined && { max: hcpMax }) } });
  const tpMin = numParam(str(fd, `${prefix}:tpMin`));
  const tpMax = numParam(str(fd, `${prefix}:tpMax`));
  if (tpMin !== undefined || tpMax !== undefined)
    all.push({
      totalPoints: { ...(tpMin !== undefined && { min: tpMin }), ...(tpMax !== undefined && { max: tpMax }) },
    });
  const balanced = str(fd, `${prefix}:balanced`);
  if (balanced === "yes") all.push({ balanced: true });
  if (balanced === "no") all.push({ balanced: false });
  for (const i of [0, 1]) {
    const suit = str(fd, `${prefix}:suit${i}`);
    if (!suit) continue;
    const min = numParam(str(fd, `${prefix}:suit${i}Min`));
    const max = numParam(str(fd, `${prefix}:suit${i}Max`));
    if (min !== undefined || max !== undefined)
      all.push({
        suitLength: {
          suit: suit as never,
          ...(min !== undefined && { min }),
          ...(max !== undefined && { max }),
        },
      });
  }
  // Partnership rows (Pillar A) — combined HCP, a declared fit, partner's
  // shown length. Field names are the stable contract with ItemEditor.tsx.
  const combHcpMin = numParam(str(fd, `${prefix}:combinedHcpMin`));
  const combHcpMax = numParam(str(fd, `${prefix}:combinedHcpMax`));
  if (combHcpMin !== undefined || combHcpMax !== undefined)
    all.push({
      combinedHcp: {
        ...(combHcpMin !== undefined && { min: combHcpMin }),
        ...(combHcpMax !== undefined && { max: combHcpMax }),
      },
    });
  const fitSuit = str(fd, `${prefix}:fitSuit`);
  if (fitSuit) {
    const fitMin = numParam(str(fd, `${prefix}:fitMin`));
    all.push({
      fitEstablished: {
        suit: fitSuit as never,
        ...(fitMin !== undefined && { minCombined: fitMin }),
      },
    });
  }
  const psSuit = str(fd, `${prefix}:psSuit`);
  if (psSuit) {
    const psMin = numParam(str(fd, `${prefix}:psLenMin`));
    if (psMin !== undefined)
      all.push({ partnerShownLength: { suit: psSuit as never, min: psMin } });
  }
  const extra = str(fd, `${prefix}:conditionsJson`);
  if (extra) all.push(JSON.parse(extra) as HandCondition);
  return all.length === 1 ? all[0]! : { all };
}

function auctionAction(fd: FormData, prefix: string): AuctionAction {
  const type = str(fd, `${prefix}:actionType`);
  switch (type) {
    case "pass":
      return { type: "pass" };
    case "double":
      return { type: "double" };
    case "redouble":
      return { type: "redouble" };
    case "raise_partner":
      return { type: "raise_partner", toLevel: num(fd, `${prefix}:actionLevel`) ?? 2 };
    case "bid_longest": {
      const among = (str(fd, `${prefix}:actionAmong`) || "S,H")
        .split(",")
        .map((s) => s.trim()) as ("S" | "H" | "D" | "C")[];
      const level = num(fd, `${prefix}:actionLevel`);
      return { type: "bid_longest", among, ...(level !== undefined && { level }) };
    }
    case "bid_suit": {
      const level = num(fd, `${prefix}:actionLevel`);
      return {
        type: "bid_suit",
        suit: (str(fd, `${prefix}:actionSuit`) || "rho_bid_suit") as never,
        ...(level !== undefined && { level }),
      };
    }
    // Round-trip escape: actions beyond the typed dropdown (first_legal_of…)
    // ride through as JSON so editing an item never corrupts them.
    case "json":
      return JSON.parse(str(fd, `${prefix}:actionJson`) || '{"type":"pass"}') as AuctionAction;
    default:
      return {
        type: "bid",
        level: num(fd, `${prefix}:actionLevel`) ?? 1,
        strain: (str(fd, `${prefix}:actionStrain`) || "N") as Strain,
      };
  }
}

function auctionContext(fd: FormData, p: string): AuctionContext {
  const context: AuctionContext = {
    role: (str(fd, `${p}:role`) || "any") as AuctionContext["role"],
  };
  const contested = str(fd, `${p}:contested`);
  if (contested === "yes") context.contested = true;
  if (contested === "no") context.contested = false;
  const opening = callPattern(fd, `${p}:opening`);
  if (opening) context.opening = opening;
  const partnerLast = callPattern(fd, `${p}:partnerLast`);
  if (partnerLast) context.partnerLast = partnerLast;
  const rhoLast = callPattern(fd, `${p}:rhoLast`);
  if (rhoLast) context.rhoLast = rhoLast;
  const ownLast = callPattern(fd, `${p}:ownLast`);
  if (ownLast) context.ownLast = ownLast;
  const lhoLast = callPattern(fd, `${p}:lhoLast`);
  if (lhoLast) context.lhoLast = lhoLast;
  const ownFirst = callPattern(fd, `${p}:ownFirst`);
  if (ownFirst) context.ownFirst = ownFirst;
  const partnerFirst = callPattern(fd, `${p}:partnerFirst`);
  if (partnerFirst) context.partnerFirst = partnerFirst;
  const roundMin = num(fd, `${p}:roundMin`);
  const roundMax = num(fd, `${p}:roundMax`);
  if (roundMin !== undefined) context.roundMin = roundMin;
  if (roundMax !== undefined) context.roundMax = roundMax;
  const vulnerability = str(fd, `${p}:vulnerability`);
  if (vulnerability === "equal" || vulnerability === "favorable" || vulnerability === "unfavorable")
    context.vulnerability = vulnerability;
  const oppSuitsBidMin = num(fd, `${p}:oppSuitsBidMin`);
  const oppSuitsBidMax = num(fd, `${p}:oppSuitsBidMax`);
  if (oppSuitsBidMin !== undefined) context.oppSuitsBidMin = oppSuitsBidMin;
  if (oppSuitsBidMax !== undefined) context.oppSuitsBidMax = oppSuitsBidMax;
  const partnerCued = str(fd, `${p}:partnerCued`);
  if (partnerCued === "yes") context.partnerCued = true;
  if (partnerCued === "no") context.partnerCued = false;
  return context;
}

function auctionRules(fd: FormData): AuctionRuleSpec[] {
  const count = num(fd, "ruleCount") ?? 0;
  const rules: AuctionRuleSpec[] = [];
  for (let i = 0; i < count; i++) {
    const p = `rule${i}`;
    if (str(fd, `${p}:remove`) === "on") continue;
    const label = str(fd, `${p}:label`);
    if (!label) continue;
    // Meaning metadata (Pillar A): a compact JSON box each — exotic shapes and
    // ask/response tables ride through verbatim. Empty = omit (compiler derives
    // `shows` from conditions).
    const showsRaw = str(fd, `${p}:showsJson`);
    const askRaw = str(fd, `${p}:askJson`);
    rules.push({
      key: str(fd, `${p}:key`) || `r${i}`,
      label,
      context: auctionContext(fd, p),
      conditions: conditions(fd, p),
      action: auctionAction(fd, p),
      priority: num(fd, `${p}:priority`) ?? 10,
      ...(showsRaw && { shows: JSON.parse(showsRaw) as RuleShows }),
      ...(askRaw && { ask: JSON.parse(askRaw) as RuleAsk }),
    });
  }
  return rules;
}

function forcingRules(fd: FormData): ForcingRuleSpec[] {
  const count = num(fd, "forcingCount") ?? 0;
  const rules: ForcingRuleSpec[] = [];
  for (let i = 0; i < count; i++) {
    const p = `forcing${i}`;
    if (str(fd, `${p}:remove`) === "on") continue;
    const label = str(fd, `${p}:label`);
    if (!label) continue;
    rules.push({
      key: str(fd, `${p}:key`) || `f${i}`,
      label,
      context: auctionContext(fd, p),
      priority: num(fd, `${p}:priority`) ?? 10,
    });
  }
  return rules;
}

function leadRules(fd: FormData): LeadSpec[] {
  const count = num(fd, "leadCount") ?? 0;
  const leads: LeadSpec[] = [];
  for (let i = 0; i < count; i++) {
    const versus = str(fd, `lead${i}:versus`);
    const style = str(fd, `lead${i}:style`);
    if (versus && style && str(fd, `lead${i}:remove`) !== "on")
      leads.push({ versus: versus as LeadSpec["versus"], style: style as LeadSpec["style"] });
  }
  return leads;
}

function playRules(fd: FormData): PlayRuleSpec[] {
  const count = num(fd, "playCount") ?? 0;
  const rules: PlayRuleSpec[] = [];
  for (let i = 0; i < count; i++) {
    const behavior = str(fd, `play${i}:behavior`);
    if (!behavior || str(fd, `play${i}:remove`) === "on") continue;
    rules.push({
      position: (str(fd, `play${i}:position`) || "any") as PlayRuleSpec["position"],
      side: (str(fd, `play${i}:side`) || "any") as PlayRuleSpec["side"],
      behavior: behavior as PlayRuleSpec["behavior"],
      priority: num(fd, `play${i}:priority`) ?? 10,
    });
  }
  return rules;
}

export function parsePayload(fd: FormData, knowledgeType: KnowledgeType): ItemPayload {
  const advanced = str(fd, "payloadJson");
  if (advanced) return JSON.parse(advanced) as ItemPayload;

  // Forcing-rules items share knowledgeTypes with auction rules; the editor
  // marks them so their payload family survives the round-trip.
  if (str(fd, "payloadKind") === "forcing_rules")
    return { kind: "forcing_rules", rules: forcingRules(fd) };

  switch (knowledgeType) {
    case "concept":
    case "judgment_guideline":
      return { kind: "none" };
    case "lead_agreement":
      return { kind: "lead_rules", leads: leadRules(fd) };
    case "signal_agreement":
      return {
        kind: "signals",
        signals: {
          attitude: (str(fd, "sig:attitude") || "standard") as never,
          count: (str(fd, "sig:count") || "standard") as never,
          firstDiscard: (str(fd, "sig:firstDiscard") || "attitude") as never,
        },
      };
    case "declarer_technique":
    case "defensive_technique":
      return { kind: "play_rules", rules: playRules(fd) };
    case "fallback_rule": {
      const phase = str(fd, "fb:phase") || "auction";
      if (phase === "auction") return { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } };
      if (phase === "opening_lead")
        return {
          kind: "fallback",
          fallback: {
            phase: "opening_lead",
            behavior: (str(fd, "fb:leadStyle") || "low_from_longest") as never,
          },
        };
      return { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } };
    }
    default:
      return { kind: "auction_rules", rules: auctionRules(fd) };
  }
}

export function parseSettings(fd: FormData): SettingSpec[] {
  const advanced = str(fd, "settingsJson");
  if (advanced) return JSON.parse(advanced) as SettingSpec[];
  const count = num(fd, "settingCount") ?? 0;
  const specs: SettingSpec[] = [];
  for (let i = 0; i < count; i++) {
    const p = `setting${i}`;
    const key = str(fd, `${p}:key`);
    if (!key || str(fd, `${p}:remove`) === "on") continue;
    const control = (str(fd, `${p}:control`) || "toggle") as SettingSpec["control"];
    let defaultValue: SettingSpec["default"];
    if (control === "toggle") defaultValue = str(fd, `${p}:default`) === "on";
    else if (control === "range_hcp")
      defaultValue = {
        low: num(fd, `${p}:defaultLow`) ?? 0,
        high: num(fd, `${p}:defaultHigh`) ?? 40,
      };
    else if (control === "number") defaultValue = num(fd, `${p}:default`) ?? 0;
    else defaultValue = str(fd, `${p}:default`);
    specs.push({
      key,
      label: str(fd, `${p}:label`) || key,
      control,
      role: (str(fd, `${p}:role`) || "parameter") as SettingSpec["role"],
      default: defaultValue,
      ...(num(fd, `${p}:min`) !== undefined && { min: num(fd, `${p}:min`) }),
      ...(num(fd, `${p}:max`) !== undefined && { max: num(fd, `${p}:max`) }),
    });
  }
  return specs;
}

export function parseCommon(fd: FormData): {
  title: string;
  humanReadableText: string;
  knowledgeType: KnowledgeType;
  phase: KnowledgePhase;
  status: "draft" | "reviewed" | "approved" | "deprecated";
  supportedLevels: string[];
  internalNotes: string | undefined;
  tags: string[] | undefined;
} {
  return {
    title: str(fd, "title"),
    humanReadableText: str(fd, "humanReadableText"),
    knowledgeType: str(fd, "knowledgeType") as KnowledgeType,
    phase: str(fd, "phase") as KnowledgePhase,
    status: (str(fd, "status") || "draft") as never,
    supportedLevels: str(fd, "supportedLevels")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    internalNotes: str(fd, "internalNotes") || undefined,
    tags: (() => {
      const t = str(fd, "tags").split(",").map((s) => s.trim()).filter(Boolean);
      return t.length ? t : undefined;
    })(),
  };
}
