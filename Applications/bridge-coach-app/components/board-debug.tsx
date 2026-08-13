// TEMPORARY DIAGNOSTIC (2026-08-13): on-screen log strip for the discard-hang
// hunt. Published builds have no console, so the board chain's debug events
// render in an overlay instead — and PERSIST to SecureStore on every event,
// so a hard crash leaves its final moments readable on the next launch.
// REMOVE once the discard bug is fixed.

import * as SecureStore from "expo-secure-store";
import { useEffect, useReducer } from "react";
import { StyleSheet, Text, View } from "react-native";

const MAX_LINES = 10;
const STORE_KEY = "board_debug_tail";

const lines: string[] = [];
let previousSession: string[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// What the LAST run logged before it died — loaded once at boot, shown until
// this run logs its own first event alongside it.
SecureStore.getItemAsync(STORE_KEY)
  .then((stored) => {
    if (stored) {
      previousSession = JSON.parse(stored) as string[];
      notify();
    }
  })
  .catch(() => {});

/** Log a board-chain event: console (dev), overlay (published), and disk
 *  (crash post-mortem). */
export function boardDebug(msg: string, extra?: unknown): void {
  const t = new Date();
  const stamp = `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
  let suffix = "";
  if (extra !== undefined) {
    try {
      suffix = ` ${JSON.stringify(extra)}`;
    } catch {
      suffix = " [unserializable]";
    }
  }
  lines.push(`${stamp} ${msg}${suffix}`);
  if (lines.length > MAX_LINES) lines.shift();
  console.log(`[board-debug] ${msg}`, extra ?? "");
  // Fire-and-forget: a few hundred bytes per write, and every line flushed
  // means one more breadcrumb if the very next step is the crash.
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify(lines)).catch(() => {});
  notify();
}

/** The strip itself — mounted once at the root, above everything, untouchable. */
export function BoardDebugOverlay() {
  const [, force] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);

  if (lines.length === 0 && previousSession.length === 0) return null;
  return (
    <View style={styles.strip} pointerEvents="none">
      {previousSession.length > 0 && (
        <>
          <Text style={styles.marker}>── BEFORE LAST EXIT ──</Text>
          {previousSession.map((l, i) => (
            <Text key={`p${i}`} style={styles.prevLine} numberOfLines={2}>
              {l}
            </Text>
          ))}
          <Text style={styles.marker}>── THIS SESSION ──</Text>
        </>
      )}
      {lines.map((l, i) => (
        <Text key={i} style={styles.line} numberOfLines={2}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: "absolute",
    top: 40,
    left: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 6,
    padding: 6,
    // Above the veil (100) and the table host (10) — the strip outranks all.
    zIndex: 999,
    elevation: 999,
  },
  line: {
    color: "#7CFC9A",
    fontSize: 10,
    fontFamily: "monospace",
  },
  /** The dead session's tail — amber, so the two runs never blur together. */
  prevLine: {
    color: "#FFC868",
    fontSize: 10,
    fontFamily: "monospace",
  },
  marker: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "monospace",
  },
});
