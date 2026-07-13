// Predicate library: the named, content-free building blocks that data-driven
// rules reference. Primitives here implement standard hand-evaluation and
// auction mechanics; the CONTENT (which predicates a rule combines, with what
// parameters) lives in knowledge packages. Complex multi-step logic that pure
// data can't express lives in src/primitives instead.

import type { SettingValue } from "@bridge/config";
import {
  isContractBid,
  isMajor,
  isMinor,
  partnerOf,
  type AuctionCall,
  type Card,
  type Seat,
  type Suit,
} from "@bridge/events";
import { hcp, isBalanced, suitCounts } from "../hand";
import type { HandConstraintExpr, HandPredicateRef } from "./schema";

export interface PredicateContext {
  hand: Card[];
  auction: AuctionCall[];
  seat: Seat;
  values: Record<string, SettingValue>;
}

type PredicateFn = (ctx: PredicateContext, params: Record<string, unknown>) => boolean;

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export const PREDICATES: Record<string, PredicateFn> = {
  /** params: { min?: number, max?: number } */
  hcpRange: ({ hand }, params) => {
    const h = hcp(hand);
    return h >= num(params.min, 0) && h <= num(params.max, 40);
  },

  /** params: { suit: "C"|"D"|"H"|"S", min?: number, max?: number } */
  suitLength: ({ hand }, params) => {
    const suit = params.suit as Suit;
    const len = suitCounts(hand)[suit];
    if (len === undefined) return false;
    return len >= num(params.min, 0) && len <= num(params.max, 13);
  },

  /** params: { among: "majors"|"minors"|"all", min: number } — longest suit in the group. */
  longestAmong: ({ hand }, params) => {
    const among = params.among as "majors" | "minors" | "all";
    const counts = suitCounts(hand);
    const suits = (Object.keys(counts) as Suit[]).filter((s) =>
      among === "majors" ? isMajor(s) : among === "minors" ? isMinor(s) : true,
    );
    const longest = Math.max(...suits.map((s) => counts[s]));
    return longest >= num(params.min, 0);
  },

  /** Balanced shape: 4-3-3-3, 4-4-3-2, or 5-3-3-2. */
  balanced: ({ hand }) => isBalanced(hand),

  /**
   * params: { min: number } — at least `min` cards in the suit of partner's
   * most recent contract bid (false when partner hasn't bid a suit).
   */
  supportForPartner: ({ hand, auction, seat }, params) => {
    const partner = partnerOf(seat);
    for (let i = auction.length - 1; i >= 0; i--) {
      const c = auction[i]!;
      if (c.seat === partner && isContractBid(c.call) && c.call[1] !== "N") {
        return suitCounts(hand)[c.call[1] as Suit] >= num(params.min, 3);
      }
    }
    return false;
  },
};

export const KNOWN_PREDICATES: ReadonlySet<string> = new Set(Object.keys(PREDICATES));

const isRef = (e: HandConstraintExpr): e is HandPredicateRef => "predicate" in e;

/**
 * Setting-valued parameter (the prototype's numeric_parameter binding, as
 * data): `{ $setting: "nt1_range", field: "low" }` resolves to the RESOLVED
 * configuration value at decision time — so a coach's HCP range genuinely
 * drives the rule, deterministically and citably.
 */
export interface SettingParamRef {
  $setting: string;
  /** For HcpRange values: which end of the range. */
  field?: "low" | "high";
}

const isSettingRef = (v: unknown): v is SettingParamRef =>
  typeof v === "object" && v !== null && "$setting" in v;

export function resolveParams(
  params: Record<string, unknown>,
  values: Record<string, SettingValue>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (isSettingRef(v)) {
      const resolved = values[v.$setting];
      out[k] =
        v.field && typeof resolved === "object" && resolved !== null && !Array.isArray(resolved)
          ? (resolved as { low: number; high: number })[v.field]
          : resolved;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Every setting key referenced via $setting anywhere in the expression. */
export function collectSettingParamRefs(expr: HandConstraintExpr): string[] {
  if ("all" in expr) return expr.all.flatMap(collectSettingParamRefs);
  if ("any" in expr) return expr.any.flatMap(collectSettingParamRefs);
  if ("not" in expr) return collectSettingParamRefs(expr.not);
  return Object.values(expr.params ?? {})
    .filter(isSettingRef)
    .map((v) => v.$setting);
}

export function evalConstraint(expr: HandConstraintExpr, ctx: PredicateContext): boolean {
  if ("all" in expr) return expr.all.every((e) => evalConstraint(e, ctx));
  if ("any" in expr) return expr.any.some((e) => evalConstraint(e, ctx));
  if ("not" in expr) return !evalConstraint(expr.not, ctx);
  const fn = PREDICATES[expr.predicate];
  if (!fn) throw new Error(`Unknown predicate "${expr.predicate}" (validate the package first)`);
  return fn(ctx, resolveParams(expr.params ?? {}, ctx.values));
}

/**
 * Width of the first hcpRange predicate in the expression (for the
 * "narrowest" selection policy). Null when the rule states no HCP range.
 */
export function hcpRangeWidth(expr: HandConstraintExpr): number | null {
  if ("all" in expr) {
    for (const e of expr.all) {
      const w = hcpRangeWidth(e);
      if (w !== null) return w;
    }
    return null;
  }
  if ("any" in expr || "not" in expr) return null;
  if (isRef(expr) && expr.predicate === "hcpRange") {
    const min = num(expr.params?.min, 0);
    const max = num(expr.params?.max, 40);
    return max - min;
  }
  return null;
}
