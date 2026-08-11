// Cross-platform confirm/notify.
//
// react-native-web ships Alert as an unimplemented stub: a buttoned
// Alert.alert renders NOTHING in the browser, so every confirm built on it
// was a silent no-op on the web build — tapping "Remove header" simply did
// nothing. These helpers keep the native dialogs on the phone and fall back
// to the browser's own confirm()/alert() on web.

import { Alert, Platform } from "react-native";

/** Ask before a destructive act; `onConfirm` runs only on a yes. */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/** Tell the person something went wrong (or right) — no choices. */
export function notify(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
