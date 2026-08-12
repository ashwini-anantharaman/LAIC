// TrickArea — bridge-table-ui/src/TrickArea.tsx ported 1:1 to RN, CLUSTER
// variant (the phone tier's tight interlocking compass — the app always
// renders the phone tier, so the wide cross and stacked pills never mount).
// Geometry, paint order and the two-glyph "10" cap are the web's own, comment
// for comment; see the original for the full reasoning.
//
//      N top-centre        · the vertical pair TOUCHES: N's bottom edge IS
//   W          E             S's top edge, on the card's centre line
//      S bottom-centre     · the flanks straddle that seam, 0.7 card down

import { StyleSheet, Text, View } from "react-native";

import type { Card, Seat } from "../../lib/vendor/table-kernel/table-kernel";
import { GLYPH, RED, isRed, rankText } from "./table-tokens";

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

const CARD = { w: 56, h: 80 };
const flankTop = (h: number) => Math.round(h * 0.7);

/** The compass's box for a card box — two cards wide by two tall. */
export function clusterBox(card: { w: number; h: number } = CARD) {
  return { w: card.w * 2, h: card.h * 2 };
}

const clusterPos = (card: { w: number; h: number }): Record<Seat, { left: number; top: number }> => {
  const half = Math.round(card.w / 2);
  const fy = flankTop(card.h);
  return {
    N: { left: half, top: 0 },
    W: { left: 0, top: fy },
    E: { left: card.w, top: fy },
    S: { left: half, top: card.h },
  };
};

/** Paint order is SPATIAL, not play order: strictly top to bottom. */
const CLUSTER_ORDER: Seat[] = ["N", "W", "E", "S"];

export function TrickArea({
  plays,
  turn,
  scale = 1,
  card = CARD,
  index = { rank: 38, glyph: 30 },
}: {
  plays: readonly TrickPlay[];
  turn: Seat;
  scale?: number;
  card?: { w: number; h: number };
  index?: { rank: number; glyph: number };
}) {
  const box = clusterBox(card);
  const pos4 = clusterPos(card);
  // "10" is the only two-glyph rank; the cap only bites for a card too narrow
  // to hold one, where a clipped "10" would be worse than a small one.
  const twoGlyphCap = Math.floor((card.w - 11) / 1.12);
  return (
    <View
      style={{
        width: box.w * scale,
        height: box.h * scale,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: box.w, height: box.h, transform: [{ scale }] }}>
        {CLUSTER_ORDER.map((seat, z) => {
          const play = plays.find((p) => p.seat === seat);
          const pos = pos4[seat];
          const onTurn = seat === turn;
          const rank = play ? rankText(play.card.rank) : "";
          return (
            <View key={seat} style={{ position: "absolute", left: pos.left, top: pos.top, zIndex: z + 1 }}>
              {play ? (
                <View style={[styles.card, { width: card.w, height: card.h }]}>
                  {/* Bold face pinned to the card's TOP-LEFT — the strip the
                      paint order guarantees no neighbour covers. */}
                  <View style={{ position: "absolute", left: 4, top: 2, alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: rank.length > 1 ? Math.min(index.rank, twoGlyphCap) : index.rank,
                        lineHeight: Math.round(index.rank * 0.88),
                        fontWeight: "700",
                        letterSpacing: -0.02 * index.rank,
                        color: isRed(play.card.suit) ? RED : "#000",
                      }}
                    >
                      {rank}
                    </Text>
                    <Text
                      style={{
                        fontSize: index.glyph,
                        lineHeight: Math.round(index.glyph * 0.88),
                        fontWeight: "400",
                        color: isRed(play.card.suit) ? RED : "#000",
                      }}
                    >
                      {GLYPH[play.card.suit]}
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={{ width: card.w, height: card.h, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    style={{
                      width: onTurn ? 24 : 0,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: onTurn ? "rgba(255,255,255,.62)" : "transparent",
                    }}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#4a4a4a",
    borderRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 7,
    elevation: 5,
  },
});
