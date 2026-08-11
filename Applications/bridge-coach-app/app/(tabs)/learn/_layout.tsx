// Learn is ONE tab containing its own stack — this layout is what stops
// expo-router from surfacing its screens as separate tab bar entries. The
// reader itself lives OUTSIDE the tabs (app/learn-object/[id].tsx): a
// full-screen route, so the tab bar never floats over the content.

import { Stack } from "expo-router";

export default function LearnLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
