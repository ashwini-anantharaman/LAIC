// The top app bar plus the sheets it opens, in one piece so every branded screen
// gets identical chrome instead of re-wiring it.
//
// All three header actions are now sheets that rise from the bottom — Menu,
// Profile and Settings — so the header behaves consistently rather than mixing a
// pushed screen with two sheets.

import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_BAR_HEIGHT, BrandAppBar } from "./brand-app-bar";
import { useBrandSheets } from "./use-brand-sheets";
import { Brand } from "../constants/theme";

export function BrandChrome({
  showWordmark = false,
  /** Rendered under the bar, inside the safe area. */
  children,
}: {
  showWordmark?: boolean;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { open, sheets } = useBrandSheets(insets.top + APP_BAR_HEIGHT);

  return (
    <View style={styles.host}>
      <View style={{ paddingTop: insets.top }}>
        <BrandAppBar
          showWordmark={showWordmark}
          onMenu={() => open("menu")}
          onSettings={() => open("settings")}
          onProfile={() => open("profile")}
        />
      </View>

      {children}

      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: Brand.cream },
});
