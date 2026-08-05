// Learn is ONE tab containing its own stack (list → concept detail) — this
// layout is what stops expo-router from surfacing learn/index and learn/[id]
// as separate tab bar entries.

import { Stack } from "expo-router";

export default function LearnLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
