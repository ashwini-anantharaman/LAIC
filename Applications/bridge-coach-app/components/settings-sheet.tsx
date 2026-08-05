// Settings — the sheet behind the gear in the top app bar.
//
// These are client-side play preferences; the Nexus API has no endpoint for
// them, so selections live in component state for the session. Persisting them
// (SecureStore, or a backend column) is a separate decision.

import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Type } from "../constants/theme";

const BIDDING_SYSTEMS = ["Simple SAYC", "Custom SAYC", "Custom 2/1"] as const;
type BiddingSystem = (typeof BIDDING_SYSTEMS)[number];

/** Design order: diamonds, clubs, hearts, spades. */
const SUITS = ["♦", "♣", "♥", "♠"] as const;

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function SettingsSheetBody() {
  const [system, setSystem] = useState<BiddingSystem>("Simple SAYC");
  const [acesLeft, setAcesLeft] = useState(true);

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <SectionLabel>Bidding System</SectionLabel>
      <View style={styles.card}>
        {BIDDING_SYSTEMS.map((option) => {
          const selected = option === system;
          return (
            <Pressable
              key={option}
              onPress={() => setSystem(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.radioRow,
                selected && styles.radioRowSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Card Order</SectionLabel>
      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          <Pressable
            onPress={() => setAcesLeft(true)}
            accessibilityRole="button"
            accessibilityState={{ selected: acesLeft }}
            style={[styles.segmentHalf, acesLeft && styles.segmentHalfActive]}
          >
            <Text style={styles.segmentText}>◂A</Text>
          </Pressable>
          <Pressable
            onPress={() => setAcesLeft(false)}
            accessibilityRole="button"
            accessibilityState={{ selected: !acesLeft }}
            style={[styles.segmentHalf, !acesLeft && styles.segmentHalfActive]}
          >
            <Text style={styles.segmentText}>A▸</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{acesLeft ? "Aces on left" : "Aces on right"}</Text>
      </View>

      <SectionLabel>Suit Order</SectionLabel>
      <View style={styles.segmentWrap}>
        <View style={styles.suitRow}>
          {SUITS.map((suit) => (
            <Text key={suit} style={styles.suit}>
              {suit}
            </Text>
          ))}
        </View>
        {/* The design invites dragging to reorder; reordering is not wired yet. */}
        <Text style={styles.hint}>Drag suits around</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 31, paddingBottom: 56 },
  sectionLabel: {
    fontFamily: Fonts.display,
    fontSize: Type.sectionLabel,
    color: Brand.cream,
    marginTop: 22,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Brand.green,
    borderWidth: 2,
    borderColor: Brand.cream,
    borderRadius: 14,
    padding: 12,
    gap: 9,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 0.871,
    borderColor: "transparent",
  },
  radioRowSelected: {
    backgroundColor: Brand.greenDark,
    borderColor: Brand.cream,
  },
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: Brand.cream },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Brand.cream,
  },
  optionLabel: {
    fontFamily: Fonts.body,
    fontSize: Type.optionLabel,
    color: Brand.white,
  },
  optionLabelSelected: {
    fontFamily: Fonts.bodySemibold,
    color: Brand.mutedOnDark,
  },
  segmentWrap: { alignItems: "center" },
  segment: {
    flexDirection: "row",
    alignSelf: "center",
    width: 222,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.729,
    borderColor: Brand.cream,
    backgroundColor: Brand.green,
    overflow: "hidden",
  },
  segmentHalf: { flex: 1, alignItems: "center", justifyContent: "center" },
  segmentHalfActive: {
    backgroundColor: Brand.greenDark,
    borderRadius: 11,
    borderWidth: 1.729,
    borderColor: Brand.cream,
  },
  segmentText: {
    fontFamily: Fonts.display,
    fontSize: 20.9,
    color: Brand.cream,
  },
  suitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    alignSelf: "center",
    width: 222,
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.729,
    borderColor: Brand.cream,
    backgroundColor: Brand.green,
  },
  suit: { fontSize: 22, color: Brand.cream },
  hint: {
    fontFamily: Fonts.body,
    fontSize: Type.hint,
    color: Brand.white,
    marginTop: 8,
  },
  pressed: { opacity: 0.7 },
});
