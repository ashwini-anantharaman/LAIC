// ResultCard — bridge-table-ui/src/ResultCard.tsx ported 1:1 to RN. The
// finished board's card in the centre: the result line, the score, the trick
// tally (or the host's own detail), one optional onward action and its note.
// The web's href action becomes an onPress — the only rewiring.

import { Pressable, StyleSheet, Text, View } from "react-native";

export interface ResultCardAction {
  label: string;
  onPress: () => void;
}

export function ResultCard({
  line,
  score,
  detail,
  action,
  actionNote,
  accent,
}: {
  line: string;
  score: string;
  detail: string;
  action?: ResultCardAction;
  actionNote?: string;
  accent: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: "#000", textAlign: "center" }}>
        {line || "Board complete"}
      </Text>
      {score ? (
        <Text style={{ fontSize: 18, color: "#444", marginTop: 4, textAlign: "center" }}>{score}</Text>
      ) : null}
      {detail ? (
        <Text style={{ fontSize: 15, color: "#666", marginTop: 6, textAlign: "center" }}>{detail}</Text>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            {
              height: 48,
              marginTop: 14,
              borderRadius: 6,
              backgroundColor: accent,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text numberOfLines={1} style={{ color: "#fff", fontSize: 19, fontWeight: "700" }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
      {actionNote ? (
        <Text style={{ fontSize: 13, color: "#666", marginTop: 6, textAlign: "center" }}>{actionNote}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#7d7d7d",
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
});
