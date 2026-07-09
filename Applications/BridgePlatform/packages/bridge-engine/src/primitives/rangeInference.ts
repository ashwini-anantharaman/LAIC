// COMPLEX PRIMITIVE `range_inference`, ported from the bridgebot prototype
// (src/player/constraints.ts, the "judgment layer" constraint store).
//
// Walks the auction and, for each seat, infers the point/shape range shown so
// far — interpreting each call ONLY via the config's own definitions. Calls
// the config doesn't define are no-ops (they add no inference), keeping
// attribution honest. `cited` records which config settings produced each
// seat's range so decisions can cite them.
//
// PROVENANCE NOTE: the per-call interpretations below reference setting keys
// from the prototype registry (nt1_range, major_min_length, ...). Those
// setting definitions are prototype-derived content — before any published
// package binds a rule to this primitive, Phase 3+ must re-derive the
// interpretations as cited knowledge items (see COMPLEX_PRIMITIVES.specifiedBy).

import type { HcpRange, SettingValue } from "@bridge/config";
import {
  isContractBid,
  partnerOf,
  sameSide,
  type AuctionCall,
  type Seat,
  type Suit,
} from "@bridge/events";

export interface SeatRange {
  hcpMin: number;
  hcpMax: number;
  suitMin: Record<Suit, number>;
  /** True once the seat has made at least one range-constraining call. */
  constrained: boolean;
  cited: Set<string>;
}

const fresh = (): SeatRange => ({
  hcpMin: 0,
  hcpMax: 40,
  suitMin: { C: 0, D: 0, H: 0, S: 0 },
  constrained: false,
  cited: new Set(),
});

export function inferRanges(
  auction: AuctionCall[],
  values: Record<string, SettingValue>,
): Record<Seat, SeatRange> {
  const r: Record<Seat, SeatRange> = { N: fresh(), E: fresh(), S: fresh(), W: fresh() };
  const str = (k: string) => String(values[k]);
  const range = (k: string) => values[k] as HcpRange;

  const narrow = (seat: Seat, min: number, max: number, keys: string[]) => {
    const sr = r[seat];
    sr.hcpMin = Math.max(sr.hcpMin, min);
    sr.hcpMax = Math.min(sr.hcpMax, max);
    sr.constrained = true;
    for (const k of keys) sr.cited.add(k);
  };
  const suit = (seat: Seat, s: Suit, min: number) => {
    r[seat].suitMin[s] = Math.max(r[seat].suitMin[s], min);
  };

  let opening: AuctionCall | null = null;
  const responded = new Set<Seat>();

  for (const c of auction) {
    const seat = c.seat;
    if (c.call === "P") {
      if (!opening) narrow(seat, 0, 11, ["system_base"]); // couldn't open
      else if (opening.seat === partnerOf(seat) && !responded.has(seat)) {
        narrow(seat, 0, 5, ["system_base"]); // couldn't respond
        responded.add(seat);
      }
      continue;
    }
    if (c.call === "X") {
      if (opening && !sameSide(opening.seat, seat) && isContractBid(opening.call) && opening.call[1] !== "N")
        narrow(seat, 12, 40, ["system_base"]); // takeout double
      continue;
    }
    if (c.call === "XX" || !isContractBid(c.call)) continue;

    if (!opening) {
      // ---- opening bids, per the config's opening definitions ----
      opening = c;
      const call = c.call;
      if (call === "1N" && values.nt1_range !== undefined)
        narrow(seat, range("nt1_range").low, range("nt1_range").high, ["nt1_range"]);
      else if (call === "2N" && values.nt2_range !== undefined)
        narrow(seat, range("nt2_range").low, range("nt2_range").high, ["nt2_range"]);
      else if (call === "1H" || call === "1S") {
        narrow(seat, 12, 21, ["major_min_length"]);
        suit(seat, call[1] as Suit, Number(values.major_min_length ?? 5));
      } else if (call === "1C" || call === "1D") {
        narrow(seat, 12, 21, ["one_diamond_min_length"]);
        suit(seat, call[1] as Suit, call === "1D" ? Number(values.one_diamond_min_length ?? 3) : 2);
      } else if (call === "2C" && str("forcing_opening") === "2c_strong_artificial")
        narrow(seat, 22, 40, ["forcing_opening"]);
      else if ((call === "2H" || call === "2S") && str("open_2hs") === "weak") {
        narrow(seat, 5, 10, ["open_2hs"]);
        suit(seat, call[1] as Suit, 6);
      } else if (call === "2D" && str("open_2d") === "weak") {
        narrow(seat, 5, 10, ["open_2d"]);
        suit(seat, "D", 6);
      } else if (call[0] === "3" && call[1] !== "N") {
        narrow(seat, 5, 10, ["system_base"]);
        suit(seat, call[1] as Suit, 7);
      }
      continue;
    }

    const isResponse = opening.seat === partnerOf(seat) && !responded.has(seat);
    if (isResponse) {
      responded.add(seat);
      const oCall = opening.call;
      const oSuit = oCall[1] !== "N" ? (oCall[1] as Suit) : null;
      const call = c.call;
      if (oCall === "1N") {
        if (call === "2C" && str("nt_stayman") !== "off") narrow(seat, 8, 40, ["nt_stayman"]);
        else if ((call === "2D" || call === "2H") && values.nt_jacoby_transfers === true)
          suit(seat, call === "2D" ? "H" : "S", 5);
        else if (call === "3N") narrow(seat, 10, 15, ["nt1_range"]);
      } else if (oSuit && call === `2${oSuit}`) {
        // single raise
        const constructive = str("major_single_raise") === "constructive" && (oSuit === "H" || oSuit === "S");
        narrow(seat, constructive ? 8 : 6, 9, [constructive ? "major_single_raise" : "system_base"]);
        suit(seat, oSuit, 3);
      } else if (oSuit && call === `3${oSuit}`) {
        const style = str(oSuit === "H" || oSuit === "S" ? "major_double_raise" : "minor_double_raise");
        if (style === "limit") narrow(seat, 10, 12, ["major_double_raise"]);
        else if (style === "weak") narrow(seat, 0, 6, ["major_double_raise"]);
        suit(seat, oSuit, oSuit === "H" || oSuit === "S" ? 3 : 4);
      } else if (call === "2N" && oSuit && (oSuit === "H" || oSuit === "S") && values.major_jacoby_2nt === true) {
        narrow(seat, 13, 40, ["major_jacoby_2nt"]);
        suit(seat, oSuit, 4);
      } else if (call === "1N") {
        narrow(seat, 6, 10, [oSuit === "C" || oSuit === "D" ? "minor_1nt_response_range" : "major_1nt_response"]);
      } else if (call[0] === "1") {
        narrow(seat, 6, 40, ["system_base"]);
        if (call[1] !== "N") suit(seat, call[1] as Suit, 4);
      }
      continue;
    }

    // ---- direct-seat actions over their opening ----
    if (!sameSide(opening.seat, seat)) {
      const call = c.call;
      if (call === "1N" && values.nt_overcall_direct_range !== undefined)
        narrow(
          seat,
          range("nt_overcall_direct_range").low,
          range("nt_overcall_direct_range").high,
          ["nt_overcall_direct_range"],
        );
      else if (call[0] === "1" && call[1] !== "N") {
        narrow(seat, 8, 16, ["system_base"]);
        suit(seat, call[1] as Suit, 5);
      }
    }
  }

  return r;
}
