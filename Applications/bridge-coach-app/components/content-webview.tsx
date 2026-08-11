import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

/** Renders external platform content inside the app (native). */
export function ContentWebView({
  url,
  onUrlChange,
  onHostMessage,
  onLoadEnd,
  onError,
  injectedCSS,
}: {
  url: string;
  /** Fires as the user navigates inside the embed (native only — the web
   *  iframe is cross-origin and cannot be observed). */
  onUrlChange?: (url: string) => void;
  /** Structured messages posted BY the embedded page to its host (e.g. the
   *  LP's "play this board" request). */
  onHostMessage?: (data: unknown) => void;
  /** The embed finished loading (success or HTTP error page) — lets a host
   *  screen drop its spinner instead of showing one forever. */
  onLoadEnd?: () => void;
  /** The embed could not be reached at all. */
  onError?: () => void;
  /**
   * CSS to apply INSIDE the embedded page, so a web surface can be dressed to
   * match the app instead of reading as a browser dropped into a screen.
   *
   * Injected rather than requested from the page's own code because the page is
   * a separate deployment: this needs no coordination with it, and no release of
   * it. The trade is that the rules must out-specify the page's own — hence the
   * !important in the caller's sheet.
   */
  injectedCSS?: string;
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
      onLoadEnd={() => onLoadEnd?.()}
      onError={() => onError?.()}
      {...(injectedCSS
        ? {
            // BEFORE content loads, so the page's first paint is already ours —
            // injecting after load flashes the page's own colours first.
            injectedJavaScriptBeforeContentLoaded: _cssInjector(injectedCSS),
            // And again after: a client-rendered page (this one is) mounts its
            // own <style> tags during hydration, which can land after ours. Same
            // id, so re-running replaces rather than stacks.
            injectedJavaScript: _cssInjector(injectedCSS),
          }
        : {})}
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

/**
 * The injector: idempotent (keyed on an id), and appended LAST so it wins ties on
 * equal specificity. Kept to one statement chain because the string is evaluated
 * as-is in the page.
 */
function _cssInjector(css: string): string {
  const json = JSON.stringify(css);
  return `(function(){try{
    var id='app-skin';
    var el=document.getElementById(id);
    if(!el){el=document.createElement('style');el.id=id;}
    el.textContent=${json};
    (document.head||document.documentElement).appendChild(el);
  }catch(e){}})(); true;`;
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
