// react-native-url-polyfill FIRST: @supabase/supabase-js builds request URLs and
// a websocket URL with the WHATWG URL API, which React Native's runtime only
// partially implements. Importing it here — before anything that reaches for
// Supabase — is the documented fix, and the failure without it is an obscure
// "URL.protocol is not implemented" at the first live read rather than anything
// pointing at the cause.
import "react-native-url-polyfill/auto";

import { useFonts } from "expo-font";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { ClubProvider } from "../lib/club-context";
import { LeaveVeilHost } from "../components/leave-veil";
import { TableWebViewHost } from "../components/table-host";
import { Brand, Colors } from "../constants/theme";

/** Routes reachable without a session (landing, login, register). */
const PUBLIC_ROOTS = new Set(["", "login", "register"]);

function AuthGate({ children }: { children: ReactNode }) {
  const { status, needsOnboarding, user } = useAuth();
  const segments = useSegments();

  const root = segments[0] ?? "";
  const onPublicRoute = PUBLIC_ROOTS.has(root);
  // The password is still the one a club typed. Until they replace it, that club
  // can sign in as them — and into their other clubs — so nothing else opens.
  const mustSetPassword = status === "signedIn" && user?.must_set_password === true;

  useEffect(() => {
    if (status === "loading") return;
    if (mustSetPassword) {
      if (root !== "set-password") router.replace("/set-password");
      return;
    }
    if (status === "signedIn" && (onPublicRoute || root === "set-password")) {
      // Fresh registrations go through onboarding once; sign-ins go home.
      router.replace(needsOnboarding ? "/onboarding" : "/home");
    } else if (status === "signedOut" && !onPublicRoute) {
      router.replace("/");
    }
  }, [status, onPublicRoute, needsOnboarding, mustSetPassword, root]);

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
  // Brand faces: Neco is the display type, General Sans the UI type. Converted
  // from the supplied .woff files to OpenType, which is what RN can load.
  const [fontsLoaded] = useFonts({
    "Neco-Bold": require("../assets/fonts/Neco-Bold.otf"),
    "Neco-Regular": require("../assets/fonts/Neco-Regular.otf"),
    "Neco-Medium": require("../assets/fonts/Neco-Medium.otf"),
    "GeneralSans-Regular": require("../assets/fonts/GeneralSans-Regular.otf"),
    "GeneralSans-Semibold": require("../assets/fonts/GeneralSans-Semibold.otf"),
    "GeneralSans-Light": require("../assets/fonts/GeneralSans-Light.otf"),
  });

  // Hold the first frame until the faces are in — otherwise every branded
  // screen paints in the system font and then reflows.
  if (!fontsLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={Colors.text} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <StatusBar style="dark" />
        <AuthGate>
          {/* Which club is being looked at — session-scoped, above the tabs so a
              switch is seen by every club screen at once. */}
          <ClubProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Brand.cream },
                // Every push fades (owner request 2026-08-12) — the same door
                // the board screens already use, so tab→screen→board reads as
                // one motion language instead of a hard cut.
                animation: "fade",
              }}
            />
            {/* THE persistent board WebView — booted once, then re-navigated
                per board; the table screen just shows/parks it. Above the
                stack while a board is on stage, under the exits' veil. */}
            <TableWebViewHost />
          </ClubProvider>
        </AuthGate>
      </AuthProvider>
      {/* The exits' cream veil — above the whole stack, so leaving any screen
          fades the same way arriving does. */}
      <LeaveVeilHost />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
});
