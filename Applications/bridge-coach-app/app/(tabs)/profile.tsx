import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton, Screen, ScreenHeader } from "../../components/ui";
import { Colors, Radius, Spacing } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { BridgeContext, getBridgeContextCached, isCoach } from "../../lib/bridge-role";
import { fetchMyCoach, MyCoach } from "../../lib/nexus";

export default function ProfileScreen() {
  const { user, token, signOut } = useAuth();
  const [context, setContext] = useState<BridgeContext | null>(null);
  const [myCoach, setMyCoach] = useState<MyCoach>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    getBridgeContextCached(token).then((ctx) => {
      if (!cancelled) setContext(ctx);
    });
    fetchMyCoach(token)
      .then((mine) => {
        if (!cancelled) setMyCoach(mine);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const initial = (user?.display_name || user?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const amCoach = isCoach(context);
  const rows: Array<{ label: string; value: string }> = [
    { label: "Name", value: user?.display_name || "—" },
    { label: "Email", value: user?.email ?? "—" },
    {
      label: "Role",
      value: context
        ? context.role_name || (amCoach ? "Coach" : "Learner")
        : "Learner",
    },
    ...(amCoach ? [] : [{ label: "My coach", value: myCoach?.name ?? "None yet" }]),
    { label: "Program", value: context?.program_name || "Bridge Program" },
    { label: "Organization", value: "Life in AI Center" },
  ];

  return (
    <Screen style={styles.screen}>
      <ScreenHeader title="Profile" />

      <View style={styles.body}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.card}>
          {rows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.row, i > 0 && styles.rowBorder]}
            >
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Sign out" onPress={signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.screen,
    paddingTop: 16,
    alignItems: "center",
    gap: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Colors.primaryText,
    fontSize: 28,
    fontWeight: "700",
  },
  card: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: Spacing.card,
    paddingVertical: 14,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  rowValue: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    textAlign: "right",
  },
  actions: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: 24,
  },
});
