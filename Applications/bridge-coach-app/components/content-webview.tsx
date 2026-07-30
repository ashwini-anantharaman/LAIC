import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

/** Renders external platform content inside the app (native). */
export function ContentWebView({
  url,
  onUrlChange,
}: {
  url: string;
  /** Fires as the user navigates inside the embed (native only — the web
   *  iframe is cross-origin and cannot be observed). */
  onUrlChange?: (url: string) => void;
}) {
  return (
    <WebView
      source={{ uri: url }}
      style={styles.webview}
      onNavigationStateChange={(e) => onUrlChange?.(e.url)}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
