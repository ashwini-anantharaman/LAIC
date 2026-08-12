// SeatsPopup — bridge-table-ui/src/SeatsPopup.tsx ported 1:1 to RN (the
// shell: scrim, dark card, header, host-owned children), plus SeatsPanel
// (apps/bridge-web components/table/play/SeatsPanel.tsx) — the body the web
// page always puts inside it: a dark bordered box, one row per seat with the
// 16×16 teal badge and a white dropdown of candidates. Picking a candidate
// FORKS the board — the host handles the swap and navigation.

import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Seat } from "../../lib/vendor/table-kernel/table-kernel";
import { SEAT_BADGE } from "./table-tokens";

export function SeatsPopup({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      {/* Without the inner press-absorber every tap inside the card would
          reach the backdrop and dismiss the popup. */}
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#eef4f1" }}>Seats</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.close}>
            <Text style={{ color: "#dfe7e3", fontSize: 15, lineHeight: 17 }}>✕</Text>
          </Pressable>
        </View>
        {children}
      </Pressable>
    </Pressable>
  );
}

export interface SeatsRosterRow {
  playerId: string;
  name: string;
  validationStatus: string;
}

export function SeatsPanel({
  seatNames,
  roster,
  benOffered,
  pickedSeat,
  onPickSeat,
  onSwap,
}: {
  seatNames: Record<Seat, string>;
  roster: readonly SeatsRosterRow[];
  benOffered: boolean;
  pickedSeat: Seat | null;
  onPickSeat: (seat: Seat | null) => void;
  onSwap: (seat: Seat, playerId: string) => void;
}) {
  return (
    <ScrollView style={{ flexGrow: 0 }}>
      <View style={styles.panel}>
        <Text style={styles.panelCaption}>WHO SITS WHERE</Text>
        {(["N", "E", "S", "W"] as Seat[]).map((seat) => (
          <View key={seat}>
            <Pressable
              onPress={() => onPickSeat(pickedSeat === seat ? null : seat)}
              style={({ pressed }) => [styles.seatRow, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.seatBadge}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{seat}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: "#fff" }}>
                {seatNames[seat]}
              </Text>
              <Text style={{ color: "#dfe7e3", fontSize: 11 }}>{pickedSeat === seat ? "▴" : "▾"}</Text>
            </Pressable>
            {pickedSeat === seat && (
              <View style={styles.drop}>
                <Candidate label="Me" onPress={() => onSwap(seat, "me")} />
                {benOffered && <Candidate label="BEN (neural engine)" onPress={() => onSwap(seat, "ben")} />}
                {roster.map((p) => (
                  <Candidate
                    key={p.playerId}
                    label={p.validationStatus === "valid" ? p.name : `${p.name} (incomplete)`}
                    onPress={() => onSwap(seat, p.playerId)}
                  />
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Candidate({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.candidate, pressed && { backgroundColor: "#eee" }]}
    >
      <Text style={{ fontSize: 13, color: "#000" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,.5)",
  },
  card: {
    width: 320,
    maxWidth: "94%",
    backgroundColor: "#16211d",
    borderWidth: 1,
    borderColor: "#3a4a44",
    borderRadius: 9,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 14,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 5,
    backgroundColor: "#2a3a34",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    borderWidth: 1,
    borderColor: "#525252",
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,.4)",
    padding: 6,
    gap: 2,
  },
  panelCaption: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#d3ccbb",
    marginBottom: 2,
  },
  seatRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 4 },
  seatBadge: {
    width: 16,
    height: 16,
    borderRadius: 2,
    backgroundColor: SEAT_BADGE,
    alignItems: "center",
    justifyContent: "center",
  },
  drop: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d3d3d3",
    borderRadius: 4,
    padding: 4,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  candidate: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 3 },
});
