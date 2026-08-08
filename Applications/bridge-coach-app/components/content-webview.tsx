import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

/** Renders external platform content inside the app (native). */
export function ContentWebView({
  url,
  onUrlChange,
  onHostMessage,
}: {
  url: string;
  /** Fires as the user navigates inside the embed (native only — the web
   *  iframe is cross-origin and cannot be observed). */
  onUrlChange?: (url: string) => void;
  /** Structured messages posted BY the embedded page to its host (e.g. the
   *  LP's "play this board" request). */
  onHostMessage?: (data: unknown) => void;
}) {
  return (
    <WebView
      source={{ uri: url }}
      style={styles.webview}
      // The embedded pages are designed surfaces that manage their own
      // scaling; native bounce/overscroll only ever leaves the table sitting
      // displaced. (Zoom itself is disabled by the pages' viewport meta.)
      bounces={false}
      overScrollMode="never"
      contentInsetAdjustmentBehavior="never"
      onNavigationStateChange={(e) => onUrlChange?.(e.url)}
      onMessage={(e) => {
        if (!onHostMessage) return;
        try {
          onHostMessage(JSON.parse(e.nativeEvent.data));
        } catch {
          // Non-JSON message — not ours.
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
