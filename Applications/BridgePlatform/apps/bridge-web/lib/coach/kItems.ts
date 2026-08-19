// The K item library — every card the Know panel could ever show, declared
// once (owner direction 2026-08-18, catalogue approved same day).
//
// K items are organized by TAG, not by view. A tag names a teaching situation
// ("opening-bid", "trump-management"), and the items carrying it form its
// collection. The point is curated deals: what appears on the learner's flip
// cards is a curriculum decision. One item may carry many tags; it is defined
// exactly once. Views (me / partner / … / advanced) are demoted to an optional
// layout hint.
//
// A curated deal names its lesson in ITEMS (owner direction 2026-08-19): the
// coach picks the cards, and the tags are how they FILTER the catalogue while
// picking — `kItemsForIds` is that selection, `kItemsForTags` the filter (and
// the whole lesson for every deal authored before the picker existed).
//
// Every item declares an epistemic TIER — what it takes for the card to
// exist, and how much it can be trusted:
//
//   FACT      directly visible (own hand, dummy once up, tricks won);
//             cannot be wrong.
//   PROOF     deduced with certainty (show-outs, arithmetic); cannot be
//             wrong, only missing.
//   READ      needs bidding-system / KB knowledge ("1NT shows 15–17").
//   JUDGMENT  model inference ("the ♠K is likely on your right").
//
// FACT and PROOF are buildable inside the coach's deterministic layer today
// (the think.ts guarantee). READ and JUDGMENT items are DECLARED so the
// catalogue is complete on day one — the KB and model layers light them up
// later — but `buildable` filters them out until a producer exists. This file
// is pure data: it computes no values, reads no game state, and imports
// nothing, so it can be consumed anywhere (server routes included) without
// dragging the engine along.

/* ───────────────────────── tags ───────────────────────── */

export type KPhase = "auction" | "play";
export type KTier = "FACT" | "PROOF" | "READ" | "JUDGMENT";
/** Layout hint only — tags organize, views merely place. */
export type KView = "me" | "partner" | "partnership" | "theirs" | "advanced";

interface KTagShape {
  tag: string;
  /** How the tag is written for a human — the lesson's name on screen. */
  label: string;
  phases: readonly KPhase[];
  /** One line a curate UI can show the coach when they pick tags. */
  description: string;
}

/**
 * The teaching situations. Declaration order is the syllabus order — simplest
 * auction ideas first, then the play, then the habits that span both.
 *
 * `safety-plays` deliberately has NO items yet: its knowledge is advice-shaped
 * ("play the ace first in case…"), and advice belongs to the hints surface,
 * never the Know panel. The tag exists so curated deals can name the topic;
 * the kItems.test.ts census pins the emptiness so filling it is a decision.
 */
export const K_TAGS = [
  // the auction
  { tag: "hand-evaluation", label: "Hand evaluation", phases: ["auction"], description: "Sizing up your own thirteen cards before anyone speaks." },
  { tag: "opening-bid", label: "Opening bids", phases: ["auction"], description: "Deciding whether, and what, to open." },
  { tag: "responding", label: "Responding", phases: ["auction"], description: "Answering partner's opening bid." },
  { tag: "opener-rebid", label: "Opener's rebid", phases: ["auction"], description: "Opener's second bid — completing the picture of the hand." },
  { tag: "responder-rebid", label: "Responder's rebid", phases: ["auction"], description: "Responder's second bid — placing the final contract." },
  { tag: "notrump-bidding", label: "Notrump bidding", phases: ["auction"], description: "1NT openings and the auctions that follow them." },
  { tag: "overcalls", label: "Overcalls", phases: ["auction"], description: "Bidding a suit after the opponents open." },
  { tag: "takeout-doubles", label: "Takeout doubles", phases: ["auction"], description: "Doubling for takeout and answering one." },
  { tag: "competitive-auctions", label: "Competitive auctions", phases: ["auction"], description: "Both sides bidding — judging whose hand it is." },
  { tag: "preempts", label: "Preempts", phases: ["auction"], description: "Weak twos and threes — trading safety for obstruction." },
  { tag: "invitational-bidding", label: "Invitational bidding", phases: ["auction"], description: "Game tries: inviting, accepting, declining." },
  { tag: "slam-bidding", label: "Slam bidding", phases: ["auction"], description: "Exploring for twelve tricks — controls and keycards." },
  // the play
  { tag: "opening-lead", label: "The opening lead", phases: ["play"], description: "Choosing the first card of the defence." },
  { tag: "declarer-planning", label: "Declarer's plan", phases: ["play"], description: "The pause at trick one: counting winners and losers, making a plan." },
  { tag: "trump-management", label: "Trump management", phases: ["play"], description: "Drawing trumps, keeping trumps, ruffing." },
  { tag: "suit-establishment", label: "Establishing a suit", phases: ["play"], description: "Turning long suits into extra tricks." },
  { tag: "finesses", label: "Finesses", phases: ["play"], description: "Winning tricks with cards that aren't the highest." },
  { tag: "entries", label: "Entries", phases: ["play"], description: "Getting to the hand that holds the winners." },
  { tag: "holdup-play", label: "Hold-up play", phases: ["play"], description: "Refusing a trick on purpose to cut the defenders apart." },
  { tag: "defensive-play", label: "Defence", phases: ["play"], description: "Second- and third-hand play — defending as a pair." },
  { tag: "signaling", label: "Signalling", phases: ["play"], description: "Attitude and count — talking to partner through your cards." },
  { tag: "discarding", label: "Discarding", phases: ["play"], description: "What to throw when you can't follow suit." },
  { tag: "endplays", label: "Endplays", phases: ["play"], description: "Forcing an opponent to give you a trick." },
  { tag: "safety-plays", label: "Safety plays", phases: ["play"], description: "Guarding the contract against bad breaks." },
  // both phases
  { tag: "counting-the-hand", label: "Counting the hand", phases: ["auction", "play"], description: "The arithmetic habit: points, suits, and tricks accounted for." },
  { tag: "scoring-the-contract", label: "The score", phases: ["auction", "play"], description: "Knowing the target and what making or failing is worth." },
] as const satisfies readonly KTagShape[];

export type KTag = (typeof K_TAGS)[number]["tag"];
export type KTagDef = (typeof K_TAGS)[number];

const TAG_BY_NAME = new Map<string, KTagDef>(K_TAGS.map((t) => [t.tag, t]));

export const isKTag = (x: unknown): x is KTag =>
  typeof x === "string" && TAG_BY_NAME.has(x);

export const kTag = (tag: KTag): KTagDef => TAG_BY_NAME.get(tag)!;

/**
 * How a list of names is written on screen. Two join with "and"; past that the
 * list would stop being a name, so the rest become a count.
 */
function nameList(labels: readonly string[]): string {
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
}

/**
 * How a lesson made of these tags is written on screen — "Trump management",
 * "Finesses and Entries".
 */
export const lessonName = (tags: readonly KTag[]): string =>
  nameList(tags.filter(isKTag).map((t) => kTag(t).label));

/**
 * The tolerant read for tags arriving from storage — the curatedJson
 * discipline: a curated deal saved before a tag existed (or after one is
 * renamed) yields whatever still parses, never an error. Unknowns drop
 * ALONE, order survives, duplicates collapse.
 */
export function parseKTags(raw: unknown): KTag[] {
  if (!Array.isArray(raw)) return [];
  const out: KTag[] = [];
  for (const t of raw) if (isKTag(t) && !out.includes(t)) out.push(t);
  return out;
}

/* ───────────────────────── items ───────────────────────── */

interface KItemShape {
  id: string;
  /** The card front's headline — two or three words, stable. */
  title: string;
  /** Every teaching situation this item belongs to. */
  tags: readonly KTag[];
  phases: readonly KPhase[];
  tier: KTier;
  /** Layout hint for the Game State panel. Absent = no natural home. */
  view?: KView;
  /** When the card can exist — a sentence for authors and, later, tooltips. */
  when: string;
  /** The teacher's why — one line on why a learner tracks this. */
  why: string;
  /** Absent = core. "later" suits intermediate learners; future mastery
   *  gating (Owlwise) keys off this, but nothing gates on it yet. */
  progression?: "later";
}

/**
 * The catalogue. Declaration order is the canonical teaching order within a
 * collection — `kItemsForTags` preserves it, so the registry, not the caller,
 * decides what a learner meets first.
 *
 * Two ids deliberately absorb old splits: `hcp` covers what looking.ts shows
 * as "HCP" (auction) and "HCP dealt" (play); `tricks-needed` covers both
 * "to make" and "to set" — the learner's side flips the sentence, not the
 * item. Two overlaps are deliberately KEPT: `trumps-out` beside `still-out`
 * (a permanent slot in suit contracts vs a rotating focus suit) and
 * `partner-ceiling` beside `partner-shown-points` (the certain bound vs the
 * system-promised range — different tiers, different trust).
 */
export const K_ITEMS = [
  /* ── both phases ── */
  {
    id: "hcp", title: "HCP", tier: "FACT", phases: ["auction", "play"], view: "me",
    tags: ["hand-evaluation", "opening-bid", "responding", "overcalls", "takeout-doubles", "notrump-bidding", "invitational-bidding", "counting-the-hand"],
    when: "Always — own hand.",
    why: "Almost every bidding decision, and much of the play, starts from knowing your own strength.",
  },
  {
    id: "distribution", title: "Distribution", tier: "FACT", phases: ["auction", "play"], view: "me",
    tags: ["hand-evaluation", "opening-bid", "preempts", "notrump-bidding", "opening-lead"],
    when: "Always — own hand.",
    why: "Shape decides between suit and notrump auctions, and suggests what to lead.",
  },
  {
    id: "shape", title: "Shape", tier: "FACT", phases: ["auction", "play"], view: "me",
    tags: ["hand-evaluation", "opening-bid", "notrump-bidding"],
    when: "Always — own hand.",
    why: "Names the family the hand belongs to, which names the auctions it belongs in.",
  },
  {
    id: "longest-suit", title: "Longest suit", tier: "FACT", phases: ["auction", "play"], view: "me",
    tags: ["opening-bid", "overcalls", "preempts", "opening-lead", "suit-establishment"],
    when: "Always — own hand.",
    why: "The suit you would open, overcall, preempt in — and often the suit to lead or establish.",
  },
  {
    id: "vulnerability", title: "Vulnerability", tier: "FACT", phases: ["auction", "play"],
    tags: ["preempts", "overcalls", "competitive-auctions", "scoring-the-contract"],
    when: "Always — board condition.",
    why: "The stakes calibrate how bold a preempt, overcall, or sacrifice can be.",
  },

  /* ── the auction ── */
  {
    id: "total-points", title: "Total points", tier: "FACT", phases: ["auction"], view: "me",
    tags: ["hand-evaluation", "opening-bid", "responding", "invitational-bidding"],
    when: "Always — uses the counting method being taught (HCP + length).",
    why: "The number the opening-bid rules are written in.",
  },
  {
    id: "quick-tricks", title: "Quick tricks", tier: "FACT", phases: ["auction"], view: "me", progression: "later",
    tags: ["hand-evaluation", "overcalls", "takeout-doubles"],
    when: "Always — defined formula over your own honours.",
    why: "The honest measure behind sound overcalls and takeout doubles.",
  },
  {
    id: "losing-trick-count", title: "Losers", tier: "FACT", phases: ["auction"], view: "me", progression: "later",
    tags: ["hand-evaluation", "invitational-bidding", "slam-bidding"],
    when: "Always — defined formula; most useful once a fit exists.",
    why: "Once a fit is found, losers predict trick-taking better than points do.",
  },
  {
    id: "stoppers", title: "Stoppers", tier: "FACT", phases: ["auction"], view: "me",
    tags: ["notrump-bidding", "responding"],
    when: "Always — the HOLDING is the fact (A, K-x, Q-x-x…); whether it truly holds the suit is judgment, and the sentence must stay on the fact side.",
    why: "Notrump contracts live or die on stopping the suit they attack.",
  },
  {
    id: "seat-position", title: "Your seat", tier: "FACT", phases: ["auction"], view: "me",
    tags: ["opening-bid", "preempts", "competitive-auctions"],
    when: "Always — from the dealer and the calls so far.",
    why: "The same hand opens in third seat and passes in first; position is part of evaluation.",
  },
  {
    id: "points-out-there", title: "Points out there", tier: "PROOF", phases: ["auction"], view: "advanced",
    tags: ["counting-the-hand", "opening-bid", "competitive-auctions"],
    when: "Always — 40 minus your own HCP.",
    why: "The first counting habit — your strength only means something against what's missing.",
  },
  {
    id: "partner-ceiling", title: "Partner's ceiling", tier: "PROOF", phases: ["auction"], view: "partner",
    tags: ["responding", "counting-the-hand"],
    when: "Always — 40 minus your own HCP; the certain bound, next to partner-shown-points' promised range.",
    why: "A hard upper bound that needs no system knowledge; partner's hand is already partly known.",
  },
  {
    id: "partner-shown-points", title: "Partner's points", tier: "READ", phases: ["auction", "play"], view: "partner",
    tags: ["responding", "opener-rebid", "responder-rebid", "notrump-bidding", "slam-bidding", "counting-the-hand", "opening-lead", "defensive-play"],
    when: "Once partner has made a bid the system gives a range to; persists into the play.",
    why: "The single most useful thing an auction tells you — and it stays true all through the play.",
  },
  {
    id: "partner-shown-suits", title: "Partner's suits", tier: "READ", phases: ["auction", "play"], view: "partner",
    tags: ["responding", "opener-rebid", "competitive-auctions", "opening-lead"],
    when: "Once partner has bid a suit the system gives a length to.",
    why: "Known length is where fits come from — and \"lead partner's suit\" needs to know which suit that is.",
  },
  {
    id: "partner-shown-shape", title: "Partner's shape", tier: "READ", phases: ["auction", "play"], view: "partner",
    tags: ["responding", "notrump-bidding", "counting-the-hand"],
    when: "Once partner's bidding implies a shape family.",
    why: "Shape knowledge turns two hands into one combined picture.",
  },
  {
    id: "partner-denials", title: "Partner ruled out", tier: "READ", phases: ["auction"], view: "partner",
    tags: ["responding", "opener-rebid", "responder-rebid"],
    when: "Once a system agreement makes a call exclude something.",
    why: "What a bid didn't say is half of what it said; beginners miss the negative inferences.",
  },
  {
    id: "combined-points", title: "Our points", tier: "READ", phases: ["auction"], view: "partnership",
    tags: ["responding", "invitational-bidding", "slam-bidding", "notrump-bidding"],
    when: "Once partner has shown a range — your FACT plus their READ.",
    why: "Contracts are bid on the combined count, not on either hand alone.",
  },
  {
    id: "known-fit", title: "Our fit", tier: "READ", phases: ["auction"], view: "partnership",
    tags: ["responding", "opener-rebid", "invitational-bidding"],
    when: "Once shown length plus your own length reaches eight.",
    why: "The eight-card fit is the load-bearing concept of suit bidding.",
  },
  {
    id: "zone", title: "Where we're headed", tier: "READ", phases: ["auction"], view: "partnership",
    tags: ["responding", "invitational-bidding", "slam-bidding"],
    when: "Once a combined range exists; thresholds come from the method taught.",
    why: "Converts the combined count into the decision the auction is actually about.",
  },
  {
    id: "forcing-status", title: "Last bid was", tier: "READ", phases: ["auction"],
    tags: ["responding", "opener-rebid", "responder-rebid", "slam-bidding"],
    when: "Whenever the system classifies the last bid as forcing, invitational, or sign-off.",
    why: "Passing a forcing bid is the classic beginner accident; this card prevents it before it exists.",
  },
  {
    id: "opening-range", title: "Worth an opening?", tier: "READ", phases: ["auction"], view: "me",
    tags: ["opening-bid", "hand-evaluation"],
    when: "Before your first call; the threshold is a taught rule, so READ, not FACT.",
    why: "Connects the evaluation cards to the decision in front of the learner.",
  },
  {
    id: "their-shown-points", title: "Their points", tier: "READ", phases: ["auction", "play"], view: "theirs",
    tags: ["competitive-auctions", "overcalls", "defensive-play", "counting-the-hand"],
    when: "Once an opponent has made a bid with a known range.",
    why: "Their announced strength bounds what partner can hold — and later, where the missing honours sit.",
  },
  {
    id: "their-shown-suits", title: "Their suits", tier: "READ", phases: ["auction", "play"], view: "theirs",
    tags: ["competitive-auctions", "overcalls", "opening-lead", "defensive-play"],
    when: "Once an opponent has bid a suit with known length.",
    why: "Which suits are theirs — what to outbid, what not to lead into.",
  },
  {
    id: "keycard-answer", title: "Keycards shown", tier: "READ", phases: ["auction"], view: "partner", progression: "later",
    tags: ["slam-bidding"],
    when: "During an ace-asking sequence the system defines.",
    why: "Slam auctions collapse without remembering what the reply meant.",
  },

  /* ── the play ── */
  {
    id: "my-role", title: "Your role", tier: "FACT", phases: ["play"], view: "me",
    tags: ["declarer-planning", "defensive-play"],
    when: "Once the contract is settled.",
    why: "The role decides which cards matter and whose cards you command.",
  },
  {
    id: "contract-target", title: "The target", tier: "FACT", phases: ["play"], view: "partnership",
    tags: ["scoring-the-contract", "declarer-planning", "defensive-play"],
    when: "Always in play; defenders see the mirror — the tricks that beat it.",
    why: "The whole play is measured against this one number, and beginners genuinely forget it.",
  },
  {
    id: "our-tricks", title: "Our tricks", tier: "FACT", phases: ["play"], view: "partnership",
    tags: ["scoring-the-contract", "declarer-planning", "defensive-play"],
    when: "Always in play.",
    why: "The running score of the side you're on.",
  },
  {
    id: "their-tricks", title: "Their tricks", tier: "FACT", phases: ["play"], view: "theirs",
    tags: ["scoring-the-contract"],
    when: "Always in play.",
    why: "How close they are to setting you — or you to setting them.",
  },
  {
    id: "tricks-needed", title: "Still needed", tier: "PROOF", phases: ["play"], view: "partnership",
    tags: ["declarer-planning", "defensive-play", "scoring-the-contract"],
    when: "Always in play — target minus tricks won; the learner's side flips the sentence (to make / to set), not the item.",
    why: "Arguably the most useful number in the play, and it's pure subtraction.",
  },
  {
    id: "tricks-remaining", title: "Tricks left", tier: "FACT", phases: ["play"], view: "advanced",
    tags: ["counting-the-hand", "endplays"],
    when: "Always in play.",
    why: "\"4 of the last 6\" is a different problem from \"4 of the last 12.\"",
  },
  {
    id: "points-hidden", title: "Points hidden", tier: "PROOF", phases: ["play"], view: "advanced",
    tags: ["counting-the-hand", "defensive-play", "finesses"],
    when: "Always in play — 40 minus the hands you may see.",
    why: "The defender's best inference engine — every honour that shows up narrows where the rest live.",
  },
  {
    id: "still-out", title: "Still out", tier: "PROOF", phases: ["play"], view: "advanced",
    tags: ["counting-the-hand", "suit-establishment"],
    when: "Focus suit — the led suit mid-trick, else your longest.",
    why: "Counting one suit accurately is the gateway skill to counting the hand.",
  },
  {
    id: "trumps-out", title: "Trumps out", tier: "PROOF", phases: ["play"], view: "advanced",
    tags: ["trump-management", "declarer-planning"],
    when: "Suit contracts only — still-out's special case, kept as a permanent slot rather than a turn at being the focus suit.",
    why: "\"Have the trumps gone?\" decides when the rest of the plan is safe.",
  },
  {
    id: "my-trumps", title: "My trumps", tier: "FACT", phases: ["play"], view: "me",
    tags: ["trump-management"],
    when: "Suit contracts only.",
    why: "Your ruffing power and your control, in one number.",
  },
  {
    id: "combined-trumps", title: "Our trumps", tier: "PROOF", phases: ["play"], view: "partnership",
    tags: ["trump-management", "declarer-planning"],
    when: "Declarer only, once dummy is face up — deterministic then, dummy is visible.",
    why: "The fit you bid on, now countable — it fixes the trump-drawing arithmetic.",
  },
  {
    id: "combined-hcp", title: "Our HCP", tier: "PROOF", phases: ["play"], view: "partnership",
    tags: ["declarer-planning", "counting-the-hand"],
    when: "Declarer only, once dummy is face up.",
    why: "Tells declarer exactly how much the defence has, which shapes every finesse decision.",
  },
  {
    id: "show-out-partner", title: "Partner has none", tier: "PROOF", phases: ["play"], view: "partner",
    tags: ["counting-the-hand", "defensive-play", "discarding"],
    when: "After partner fails to follow a led suit. Same mechanism as show-out-opponent; two ids because they file to different sides.",
    why: "A show-out is a certainty about a hidden hand — the purest inference in the game.",
  },
  {
    id: "show-out-opponent", title: "They have none", tier: "PROOF", phases: ["play"], view: "theirs",
    tags: ["counting-the-hand", "trump-management", "finesses"],
    when: "After an opponent fails to follow a led suit.",
    why: "One show-out places an entire suit; finesses and drops stop being guesses.",
  },
  {
    id: "winning-so-far", title: "Winning so far", tier: "PROOF", phases: ["play"], view: "advanced",
    tags: ["defensive-play", "trump-management"],
    when: "Mid-trick only.",
    why: "Visible to anyone, easy to lose track of — and third-hand decisions hang on it.",
  },
  {
    id: "sure-winners", title: "Sure tricks", tier: "PROOF", phases: ["play"], view: "partnership",
    tags: ["declarer-planning", "suit-establishment"],
    when: "Declarer only, once dummy is up. PROOF holds ONLY under the strict definition — top cards that win by rank, blockage-free suits; the moment it counts on a break or an entry it is JUDGMENT, and the producer must not cross that line.",
    why: "Declarer planning is taught as \"count sure tricks, find the rest\" — this is the first half.",
  },
  {
    id: "missing-honours", title: "Missing honours", tier: "PROOF", phases: ["play"], view: "advanced",
    tags: ["finesses", "suit-establishment"],
    when: "Focus suit — pure subtraction over visible and played cards.",
    why: "Names the exact cards a finesse or a drop is fighting.",
  },
  {
    id: "length-tricks", title: "Length tricks", tier: "JUDGMENT", phases: ["play"], view: "partnership",
    tags: ["suit-establishment", "declarer-planning"],
    when: "Model layer — depends on how suits break.",
    why: "The second half of declarer planning — where the missing tricks come from.",
  },
  {
    id: "dummy-entries", title: "Dummy entries", tier: "JUDGMENT", phases: ["play"], view: "partnership",
    tags: ["entries", "finesses", "suit-establishment"],
    when: "Declarer only. A conservative floor might be provable; the useful number depends on play order, so it starts as JUDGMENT.",
    why: "The winners are worthless if you can't get to them; entry counting is where plans die.",
  },
  {
    id: "honour-location", title: "Honour location", tier: "JUDGMENT", phases: ["play"], view: "theirs",
    tags: ["finesses"],
    when: "Model layer — inference from auction and play so far; stated as likelihood, never certainty.",
    why: "Which way to finesse is the question; this is the evidence.",
  },
  {
    id: "danger-hand", title: "Danger hand", tier: "JUDGMENT", phases: ["play"], view: "theirs",
    tags: ["holdup-play", "declarer-planning"],
    when: "Model layer.",
    why: "The organizing idea behind holdups and avoidance play.",
  },
  {
    id: "break-odds", title: "Suit break", tier: "JUDGMENT", phases: ["play"], view: "advanced", progression: "later",
    tags: ["suit-establishment", "trump-management"],
    when: "Model layer — the odds table is math, but choosing when it applies is judgment.",
    why: "The standard odds behind \"play for the normal break.\"",
  },
  {
    id: "partner-signal", title: "Partner's signal", tier: "READ", phases: ["play"], view: "partner",
    tags: ["signaling", "defensive-play", "discarding"],
    when: "Defenders, once a signalling agreement exists in the KB.",
    why: "Defence is a conversation; this card translates partner's side of it.",
  },
  {
    id: "lead-meaning", title: "Partner's lead", tier: "READ", phases: ["play"], view: "partner",
    tags: ["opening-lead", "signaling", "defensive-play", "counting-the-hand"],
    when: "Defenders, from trick one, per the lead agreements in the KB.",
    why: "The opening lead is the defence's first message; reading it starts the count.",
  },
  {
    id: "declarer-shape-read", title: "Declarer's shape", tier: "JUDGMENT", phases: ["play"], view: "theirs", progression: "later",
    tags: ["counting-the-hand", "defensive-play"],
    when: "Model layer — combines auction reads with the play record.",
    why: "Reconstructing the closed hand is what expert defence is; this card models the habit.",
  },
] as const satisfies readonly KItemShape[];

export type KItemId = (typeof K_ITEMS)[number]["id"];
export type KItemDef = (typeof K_ITEMS)[number];

/* ───────────────────────── lookup & selection ───────────────────────── */

const byId = new Map<string, KItemDef>(K_ITEMS.map((k) => [k.id, k]));

export const isKItemId = (x: unknown): x is KItemId =>
  typeof x === "string" && byId.has(x);

export const kItem = (id: KItemId): KItemDef => byId.get(id)!;

/**
 * The tolerant read for item ids arriving from storage or an authoring form —
 * `parseKTags`'s discipline, applied one level down: unknown ids drop ALONE
 * (a deal picked against a newer catalogue keeps the cards this build still
 * has), order survives, duplicates collapse.
 */
export function parseKItemIds(raw: unknown): KItemId[] {
  if (!Array.isArray(raw)) return [];
  const out: KItemId[] = [];
  for (const id of raw) if (isKItemId(id) && !out.includes(id)) out.push(id);
  return out;
}

/**
 * How a lesson made of hand-picked cards is written on screen — "HCP and
 * Distribution", "HCP, Shape and 3 more". Used only when the coach picked
 * cards without naming a topic; a lesson with tags is named by them.
 */
export const itemsName = (ids: readonly KItemId[]): string =>
  nameList(kItemsForIds(parseKItemIds(ids)).map((k) => k.title));

/** The tiers the deterministic layer can produce today — think.ts's
 *  "can be missing but never wrong" guarantee, as a filter. */
export const BUILDABLE_TIERS: ReadonlySet<KTier> = new Set(["FACT", "PROOF"]);

export const isBuildable = (k: Pick<KItemDef, "tier">): boolean =>
  BUILDABLE_TIERS.has(k.tier);

export interface KSelection {
  /** Keep only items live in this phase. */
  phase?: KPhase;
  /** Keep only items a producer can emit today (FACT / PROOF). */
  buildableOnly?: boolean;
}

/**
 * A curated deal's collection: every item carrying any of `tags`, in REGISTRY
 * order (the canonical teaching order — the caller's tag order never reorders
 * cards), each item once no matter how many chosen tags it carries.
 */
export function kItemsForTags(tags: readonly KTag[], sel: KSelection = {}): KItemDef[] {
  const chosen = new Set<string>(tags);
  return K_ITEMS.filter((k) => k.tags.some((t) => chosen.has(t)) && passes(k, sel));
}

/** One tag's collection — `kItemsForTags` with one tag, for readability. */
export const kItemsForTag = (tag: KTag, sel: KSelection = {}): KItemDef[] =>
  kItemsForTags([tag], sel);

/**
 * A HAND-PICKED collection: the items named by `ids`, in REGISTRY order.
 *
 * The counterpart to `kItemsForTags` for the authoring direction the studio
 * actually offers (owner direction 2026-08-19: the coach picks the CARDS, and
 * tags only filter the choosing). The caller's pick order is deliberately not
 * honoured — a learner working through a lesson meets the cards in the
 * catalogue's teaching order, the same one a tag-selected lesson uses.
 */
export function kItemsForIds(ids: readonly KItemId[], sel: KSelection = {}): KItemDef[] {
  const chosen = new Set<string>(ids);
  return K_ITEMS.filter((k) => chosen.has(k.id) && passes(k, sel));
}

const passes = (k: KItemDef, sel: KSelection): boolean =>
  (!sel.phase || (k.phases as readonly KPhase[]).includes(sel.phase)) &&
  (!sel.buildableOnly || isBuildable(k));
