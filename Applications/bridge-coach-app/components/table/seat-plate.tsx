// SeatPlate — bridge-table-ui/src/SeatPlate.tsx ported 1:1 to RN. The
// identity plate under a hand: colour strip, seat badge, name, DEALER mark
// and a right-aligned tag. The host decides the plate's background (human
// gold / acting pale / grey) and width; this leaf only draws it.

import { StyleSheet, Text, View } from "react-native";

import type { Seat } from "../../lib/vendor/table-kernel/table-kernel";
import { DEALER_RING, SEAT_BADGE } from "./table-tokens";

export interface SeatPlateMetrics {
  height?: number;
  badge?: number;
  font?: number;
  tagFont?: number;
  /** Name/tag weight. Default 400/400 — the phone tier asks for bold. */
  weight?: number;
}

export interface SeatPlateProps {
  seat: Seat;
  name: string;
  tag?: string;
  strip?: string;
  bg: string;
  width: number;
  isDealer: boolean;
  metrics?: SeatPlateMetrics;
}

export function SeatPlate({
  seat,
  name,
  tag,
  strip,
  bg,
  width,
  isDealer,
  metrics = {},
}: SeatPlateProps) {
  const h = metrics.height ?? 22;
  const badge = metrics.badge ?? 20;
  const font = metrics.font ?? 15;
  const tagFont = metrics.tagFont ?? 11;
  const weight = String(metrics.weight ?? 400) as "400" | "700";
  return (
    <View
      style={[
        styles.plate,
        {
          width,
          height: h,
          backgroundColor: bg,
          borderColor: isDealer ? DEALER_RING : "transparent",
        },
      ]}
    >
      <View style={{ width: 6, backgroundColor: strip ?? "transparent" }} />
      <View
        style={{
          width: badge,
          height: badge,
          alignSelf: "center",
          backgroundColor: SEAT_BADGE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: font - 1, fontWeight: "700", color: "#fff" }}>{seat}</Text>
      </View>
      <Text
        numberOfLines={1}
        style={{ alignSelf: "center", flexShrink: 1, fontSize: font, fontWeight: weight, color: "#000" }}
      >
        {name}
      </Text>
      {isDealer ? (
        <Text
          style={{
            alignSelf: "center",
            paddingHorizontal: 2,
            fontSize: tagFont,
            fontWeight: "700",
            color: "#7a5a12",
          }}
        >
          DEALER
        </Text>
      ) : null}
      <Text
        style={{
          marginLeft: "auto",
          alignSelf: "center",
          fontSize: tagFont,
          fontWeight: weight,
          color: "#555",
        }}
      >
        {tag ?? ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 5,
    paddingRight: 3,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 2,
    elevation: 2,
  },
});
