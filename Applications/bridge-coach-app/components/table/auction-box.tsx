// AuctionBox — bridge-table-ui/src/AuctionBox.tsx ported 1:1 to RN. The
// central auction grid: a four-column head (vulnerable seats on red, the
// dealer tinted and dotted) over dealer-aligned call rows, pinned to the
// newest call. The host shapes the head flags, the padded rows and the
// "you deal" empty line; this leaf draws them.

import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { Seat } from "../../lib/vendor/table-kernel/table-kernel";
import { DEALER_TINT, GREY, callColor, callText } from "./table-tokens";

export interface AuctionBoxSizing {
  width: number;
  headFont: number;
  cellFont: number;
  radius?: number;
  cellMinH?: number;
  /** Ceiling for the content-sized grid — the phone hands it the band. */
  maxH?: number;
  /** RESERVE this many call rows, always (the phone's fixed grid). */
  rowsVisible?: number;
}

const ROW_GAP = 3;
const ROWS_PAD = 3;

/** Border-box height of a rows area holding exactly `rows` call rows. */
export function auctionRowsBoxH(rows: number, rowH: number): number {
  return rows * rowH + Math.max(0, rows - 1) * ROW_GAP + ROWS_PAD * 2;
}

export interface AuctionHead {
  seat: Seat;
  vul: boolean;
  isDealer: boolean;
}

export interface AuctionBoxProps {
  bg: string;
  m: AuctionBoxSizing;
  heads: readonly AuctionHead[];
  rows: readonly ({ call: string } | null)[][];
  dealerCol: number;
  emptyText?: string | null;
}

export function AuctionBox({ bg, m, heads, rows, dealerCol, emptyText = null }: AuctionBoxProps) {
  // Older calls scroll off the top — the newest call is the one the grid
  // follows (the web pins scrollTop to scrollHeight per new row).
  const rowsRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    rowsRef.current?.scrollToEnd({ animated: false });
  }, [rows.length]);

  const rowH = m.cellMinH ?? Math.round(m.cellFont * 1.15) + 4;
  const reservedH =
    m.rowsVisible != null && m.rowsVisible > 0 ? auctionRowsBoxH(m.rowsVisible, rowH) : undefined;

  return (
    <View
      style={[
        styles.box,
        {
          width: m.width,
          maxHeight: m.maxH ?? 340,
          backgroundColor: bg,
          borderRadius: m.radius ?? 0,
        },
      ]}
    >
      <View style={styles.head}>
        {heads.map((head) => (
          <View
            key={head.seat}
            style={{
              flex: 1,
              paddingVertical: 2,
              backgroundColor: head.vul ? "#cc1111" : head.isDealer ? DEALER_TINT : "#fff",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: m.headFont,
                lineHeight: Math.round(m.headFont * 1.1),
                fontWeight: "700",
                color: head.vul ? "#fff" : "#000",
              }}
            >
              {head.seat}
              {head.isDealer ? " •" : ""}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView
        ref={rowsRef}
        style={reservedH != null ? { height: reservedH, flexGrow: 0, flexShrink: 1 } : { flexShrink: 1 }}
        contentContainerStyle={{ paddingVertical: ROWS_PAD, paddingHorizontal: 5, gap: ROW_GAP }}
      >
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 4 }}>
            {[0, 1, 2, 3].map((j) => {
              const e = row[j] ?? null;
              return (
                <View
                  key={j}
                  style={{
                    flex: 1,
                    borderRadius: 3,
                    paddingVertical: 2,
                    minHeight: m.cellMinH ?? 0,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: e ? (j === dealerCol ? DEALER_TINT : GREY) : "transparent",
                  }}
                >
                  {e ? (
                    <Text
                      style={{
                        fontSize: m.cellFont,
                        lineHeight: Math.round(m.cellFont * 1.15),
                        color: callColor(e.call),
                      }}
                    >
                      {callText(e.call)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
        {emptyText != null && (
          <Text style={{ textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }}>
            {emptyText}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  head: { flexDirection: "row", gap: 2, padding: 2 },
});
