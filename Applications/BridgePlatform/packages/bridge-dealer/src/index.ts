/**
 * @bridge/dealer
 *
 * Constrained deal generation (execution plan Phase 6, deviation 3): seeded
 * candidate deals -> cheap structural pre-filter -> EVALUATOR filter (the
 * published system package itself is the oracle: a constrained seat's
 * systemic action, evaluated in opening position, must satisfy the scope) ->
 * tagged boards with full lineage (seed, spec, package version, teaching
 * scope item). Deterministic: same (seed, spec, package version) -> same set.
 *
 * This is what makes "deal only hands where 1NT is not the systemic action"
 * expressible: structural filters can't know what a system WOULD bid — the
 * interpreter can.
 */

import type { SettingValue } from "@bridge/config";
import {
  hcp,
  initialState,
  interpretBid,
  isBalanced,
  suitCounts,
  type BoardInput,
  type BridgeRulePackage,
} from "@bridge/engine";
import {
  mulberry32,
  type Call,
  type Card,
  type Rank,
  type Seat,
  type Suit,
} from "@bridge/events";

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

export interface HandConstraint {
  hcp?: { min?: number; max?: number };
  suitLength?: Array<{ suit: Suit; min?: number; max?: number }>;
  balanced?: boolean;
}

export interface EvaluatorFilterSpec {
  /** "dealer" resolves to the spec's dealer seat; "all" to all four seats. */
  seats: Seat[] | "all" | "dealer";
  /**
   * Each constrained seat is evaluated IN OPENING POSITION (empty auction):
   * "what would this seat's systemic action be if it opened the bidding?"
   */
  requireSystemicActionIn?: Call[];
  rejectIfSystemicActionIn?: Call[];
}

export interface DealConstraintSpec {
  seed: number;
  count: number;
  dealer?: Seat; // default "N"
  namePrefix?: string;
  structural?: Partial<Record<Seat, HandConstraint>>;
  evaluatorFilter?: EvaluatorFilterSpec;
  /** Teaching-scope knowledge item id, recorded as lineage on every board. */
  scopeItemId?: string;
  targetConceptIds?: string[];
  /** Rejection-sampling budget per accepted board (default 500). Fails loudly. */
  maxAttemptsPerDeal?: number;
}

export interface GeneratedBoard extends BoardInput {
  tags: string[];
  targetConceptIds: string[];
  lineage: {
    specSeed: number;
    attemptIndex: number;
    scopeItemId?: string;
    packageRef?: { packageId: string; version: string };
  };
}

export interface DealGenerationReport {
  boards: GeneratedBoard[];
  attempts: number;
  /** boards accepted / candidates tried. Low rates flag near-infeasible specs. */
  acceptanceRate: number;
  packageRef?: { packageId: string; version: string };
  spec: DealConstraintSpec;
}

export interface PackageContext {
  pkg: BridgeRulePackage;
  values: Record<string, SettingValue>;
}

// ---------------------------------------------------------------------------
// Candidate dealing (deterministic per attempt index)
// ---------------------------------------------------------------------------

function candidateDeal(specSeed: number, attemptIndex: number): Record<Seat, Card[]> {
  // One RNG stream per candidate, derived from (specSeed, attemptIndex) so a
  // set is reproducible AND individual boards keep their identity when the
  // spec's count changes.
  const rng = mulberry32((specSeed * 0x9e3779b1 + attemptIndex) >>> 0);
  const deck: Card[] = [];
  for (const s of ["S", "H", "D", "C"] as Suit[])
    for (const r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as Rank[])
      deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  const order: Seat[] = ["N", "E", "S", "W"];
  deck.forEach((c, i) => hands[order[Math.floor(i / 13)]!]!.push(c));
  return hands;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function meetsStructural(hand: Card[], c: HandConstraint): boolean {
  if (c.hcp) {
    const h = hcp(hand);
    if (h < (c.hcp.min ?? 0) || h > (c.hcp.max ?? 40)) return false;
  }
  if (c.suitLength) {
    const counts = suitCounts(hand);
    for (const sl of c.suitLength) {
      const len = counts[sl.suit];
      if (len < (sl.min ?? 0) || len > (sl.max ?? 13)) return false;
    }
  }
  if (c.balanced !== undefined && isBalanced(hand) !== c.balanced) return false;
  return true;
}

const resolveSeats = (spec: EvaluatorFilterSpec, dealer: Seat): Seat[] =>
  spec.seats === "all" ? ["N", "E", "S", "W"] : spec.seats === "dealer" ? [dealer] : spec.seats;

/**
 * A constrained seat's systemic OPENING action under the package. The seat is
 * treated as dealer of an empty auction — "if this hand had to act first,
 * what would the system do?"
 */
export function systemicOpeningAction(
  hands: Record<Seat, Card[]>,
  seat: Seat,
  ctx: PackageContext,
): Call {
  const state = initialState("dealer-probe", seat, "none", hands);
  return interpretBid(state, seat, { pkg: ctx.pkg, values: ctx.values }).action;
}

export interface BoardViolation {
  boardName: string;
  seat: Seat;
  action: Call;
  problem: string;
}

function evaluatorViolations(
  hands: Record<Seat, Card[]>,
  boardName: string,
  filter: EvaluatorFilterSpec,
  dealer: Seat,
  ctx: PackageContext,
): BoardViolation[] {
  const out: BoardViolation[] = [];
  for (const seat of resolveSeats(filter, dealer)) {
    const action = systemicOpeningAction(hands, seat, ctx);
    if (filter.requireSystemicActionIn && !filter.requireSystemicActionIn.includes(action))
      out.push({
        boardName,
        seat,
        action,
        problem: `systemic action ${action} not in required set [${filter.requireSystemicActionIn.join(", ")}]`,
      });
    if (filter.rejectIfSystemicActionIn?.includes(action))
      out.push({ boardName, seat, action, problem: `systemic action ${action} is forbidden` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generation + verification
// ---------------------------------------------------------------------------

export function generateConstrainedBoards(
  spec: DealConstraintSpec,
  ctx?: PackageContext,
): DealGenerationReport {
  if (spec.evaluatorFilter && !ctx)
    throw new Error("evaluatorFilter requires a PackageContext (pkg + resolved values)");
  const dealer = spec.dealer ?? "N";
  const maxAttempts = (spec.maxAttemptsPerDeal ?? 500) * spec.count;
  const boards: GeneratedBoard[] = [];
  let attempts = 0;

  while (boards.length < spec.count) {
    if (attempts >= maxAttempts)
      throw new Error(
        `Deal constraints look infeasible: ${boards.length}/${spec.count} boards after ${attempts} candidates ` +
          `(acceptance rate ${(boards.length / Math.max(attempts, 1)).toFixed(4)}). Loosen the spec or raise maxAttemptsPerDeal.`,
      );
    const attemptIndex = attempts++;
    const hands = candidateDeal(spec.seed, attemptIndex);

    let ok = true;
    for (const [seat, constraint] of Object.entries(spec.structural ?? {}) as Array<
      [Seat, HandConstraint]
    >) {
      if (!meetsStructural(hands[seat], constraint)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const name = `${spec.namePrefix ?? "Constrained"} #${boards.length + 1} (seed ${spec.seed})`;
    if (spec.evaluatorFilter && ctx) {
      if (evaluatorViolations(hands, name, spec.evaluatorFilter, dealer, ctx).length) continue;
    }

    boards.push({
      name,
      dealer,
      vul: "none",
      hands,
      tags: spec.scopeItemId ? [`scope:${spec.scopeItemId}`] : [],
      targetConceptIds: spec.targetConceptIds ?? [],
      lineage: {
        specSeed: spec.seed,
        attemptIndex,
        scopeItemId: spec.scopeItemId,
        packageRef: ctx ? { packageId: ctx.pkg.packageId, version: ctx.pkg.version } : undefined,
      },
    });
  }

  return {
    boards,
    attempts,
    acceptanceRate: boards.length / attempts,
    packageRef: ctx ? { packageId: ctx.pkg.packageId, version: ctx.pkg.version } : undefined,
    spec,
  };
}

/** Re-run every filter over stored boards (acceptance verification). */
export function verifyBoards(
  boards: readonly GeneratedBoard[],
  spec: DealConstraintSpec,
  ctx?: PackageContext,
): BoardViolation[] {
  const dealer = spec.dealer ?? "N";
  const out: BoardViolation[] = [];
  for (const board of boards) {
    for (const [seat, constraint] of Object.entries(spec.structural ?? {}) as Array<
      [Seat, HandConstraint]
    >) {
      if (!meetsStructural(board.hands[seat], constraint))
        out.push({ boardName: board.name, seat, action: "-", problem: "structural constraint violated" });
    }
    if (spec.evaluatorFilter && ctx)
      out.push(...evaluatorViolations(board.hands, board.name, spec.evaluatorFilter, dealer, ctx));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Teaching-scope translation
// ---------------------------------------------------------------------------

export interface TeachingScopeFields {
  scopeId: string;
  levelBand?: string;
  evaluatorFilter: EvaluatorFilterSpec;
  targetConceptIds?: string[];
}

/**
 * Build a spec from a teaching_scope knowledge item's structuredFields.scope
 * (the scope is reviewed content; the spec is its executable form).
 */
export function specFromTeachingScope(
  scopeItemId: string,
  scope: TeachingScopeFields,
  options: { seed: number; count: number; dealer?: Seat; namePrefix?: string },
): DealConstraintSpec {
  return {
    seed: options.seed,
    count: options.count,
    dealer: options.dealer,
    namePrefix: options.namePrefix ?? "Level practice",
    evaluatorFilter: scope.evaluatorFilter,
    scopeItemId,
    targetConceptIds: scope.targetConceptIds ?? [],
  };
}
