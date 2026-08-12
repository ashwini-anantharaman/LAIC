// SettingsMenu — bridge-table-ui/src/SettingsMenu.tsx ported 1:1 to RN.
// The ☰ table-settings overlay: white card pinned top-left, the skin's
// accent as the header band, one bordered row per setting with its current
// value right-aligned in accent. The web's href/action rows all become `on`
// callbacks here — the host owns applying the change; the menu STAYS OPEN
// across it, exactly as the web menu does across its refresh.

import { Pressable, StyleSheet, Text, View } from "react-native";

export interface SettingsItem {
  label: string;
  /** Current value, shown right-aligned in the accent color. */
  value: string;
  on?: () => void;
}

export function SettingsMenu({
  title = "Table settings",
  accent = "#384bb3",
  items,
  onClose,
}: {
  title?: string;
  accent?: string;
  items: readonly SettingsItem[];
  onClose: () => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,.35)" }]} onPress={onClose} />
      <View style={styles.card}>
        <View style={{ backgroundColor: accent, paddingVertical: 6, paddingHorizontal: 10 }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>{title}</Text>
        </View>
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.on}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#f2f2f2" }]}
          >
            <Text style={{ fontSize: 16, color: "#000", flexShrink: 1 }}>{item.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: accent }}>{item.value}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 12,
    top: 12,
    width: 268,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#7d7d7d",
    borderRadius: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 9,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e2e2",
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
});
