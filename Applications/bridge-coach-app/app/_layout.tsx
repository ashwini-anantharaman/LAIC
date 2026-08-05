import { useFonts } from "expo-font";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider, useAuth } from "../lib/auth-context";
import { Brand, Colors } from "../constants/theme";

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
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Brand.cream },
            }}
          />
        </AuthGate>
      </AuthProvider>
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
