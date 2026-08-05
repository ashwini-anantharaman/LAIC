import { router, Stack, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { Colors } from "../constants/theme";

/** Routes reachable without a session (landing, login, register). */
const PUBLIC_ROOTS = new Set(["", "login", "register"]);

function AuthGate({ children }: { children: ReactNode }) {
  const { status, needsOnboarding } = useAuth();
  const segments = useSegments();

  const root = segments[0] ?? "";
  const onPublicRoute = PUBLIC_ROOTS.has(root);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "signedIn" && onPublicRoute) {
      // Fresh registrations go through onboarding once; sign-ins go home.
      router.replace(needsOnboarding ? "/onboarding" : "/home");
    } else if (status === "signedOut" && !onPublicRoute) {
      router.replace("/");
    }
  }, [status, onPublicRoute, needsOnboarding]);

  if (status === "loading") {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={Colors.text} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#ffffff" },
          }}
        />
      </AuthGate>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
});
