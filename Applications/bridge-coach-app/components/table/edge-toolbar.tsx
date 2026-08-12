// EdgeToolbar — bridge-table-ui/src/EdgeToolbar.tsx ported 1:1 to RN. One
// slim bar on the top or bottom edge of the felt; a `spacer` item is a HARD
// SPLIT — everything after the last spacer is pinned to the far end. What
// does not fit moves into a `⋯` group with a popover (overflow, not scroll),
// with the same one-step-down / hysteresis measuring, driven by onLayout in
// place of the web's ResizeObserver + offsetWidth. hrefs become onPress —
// the host rewires navigation (the only transport change).

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export type ToolbarItem =
  | { kind: "chip"; label: string; value: string; color?: string; title?: string }
  | {
      kind: "button" | "icon";
      label: string;
      tone?: "plain" | "accent" | "warn" | "go";
      title?: string;
      disabled?: boolean;
      on?: (() => void) | null;
    }
  | { kind: "divider" }
  | { kind: "spacer" }
  /** Platform escape hatch: a pre-built node (pause/step/undo controls). */
  | { kind: "node"; node: ReactNode };

const DEFAULT_ACCENT = "#384bb3";
const TONES = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: DEFAULT_ACCENT, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" },
} as const;

// Hysteresis: dropped the moment it does not fit, restored only with real room.
const GIVE_BACK = 48;

export function EdgeToolbar({
  side,
  items,
  thickness = 44,
  condensed = false,
  bg = "rgba(9,22,17,.90)",
  accent = DEFAULT_ACCENT,
}: {
  side: "top" | "bottom";
  items: readonly ToolbarItem[];
  thickness?: number;
  condensed?: boolean;
  bg?: string;
  accent?: string;
}) {
  const [vis, setVis] = useState(99);
  const [open, setOpen] = useState(false);
  const trackW = useRef(0);
  const childW = useRef<number[]>([]);

  const tones =
    accent === DEFAULT_ACCENT
      ? TONES
      : { ...TONES, accent: { bg: accent, border: accent, color: "#fff" } };

  const t = thickness;
  // Host-priced bar: the control inside is t − 14 (the single-pricing rule).
  const ctrlH = Math.min(Math.round(t * 2.2), Math.max(Math.round(t * 0.68), t - 14, 0));
  const gap = condensed ? 5 : 7;
  const ctrlPad = Math.round(ctrlH * (condensed ? 0.17 : 0.4));
  const ctrlFont = Math.max(condensed ? 11 : 13, Math.round(ctrlH * (condensed ? 0.28 : 0.4)));
  const chipH = Math.round(ctrlH * 0.86);
  const chipLabelFont = Math.max(9, Math.round(ctrlH * 0.26));

  // A spacer is the hard split: everything after the LAST one is the pinned tail.
  let cut = -1;
  items.forEach((it, i) => {
    if (it.kind === "spacer") cut = i;
  });
  const leadRaw = cut < 0 ? items : items.slice(0, cut);
  const tailRaw = cut < 0 ? [] : items.slice(cut + 1);
  const n = leadRaw.length;

  const visC = Math.max(0, Math.min(vis, n));
  const hidden = leadRaw.slice(visC).filter((it) => it.kind !== "divider");
  const hasMore = hidden.length > 0;
  const openEff = open && hasMore;

  // Longest prefix that fits — one step down, incremental on the way back.
  const measure = useCallback(() => {
    const track = trackW.current;
    if (!track) return;
    const visM = Math.min(vis, n);
    let used = 0;
    let fits = 0;
    for (let i = 0; i < visM; i++) {
      const w = childW.current[i] ?? 0;
      used += w + (fits ? gap : 0);
      if (used <= track) fits++;
      else break;
    }
    if (fits < visM) setVis(fits);
    else if (track - used > GIVE_BACK && visM < n) setVis(visM + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis, n, gap]);

  // ── item renderers ────────────────────────────────────────────────────────
  const renderItem = (it: ToolbarItem, i: number, measured: boolean) => {
    const onLayout = measured
      ? (e: { nativeEvent: { layout: { width: number } } }) => {
          childW.current[i] = e.nativeEvent.layout.width;
          measure();
        }
      : undefined;
    if (it.kind === "spacer") return null;
    if (it.kind === "node")
      return (
        <View key={i} onLayout={onLayout} style={{ flexDirection: "row", alignItems: "center", gap }}>
          {it.node}
        </View>
      );
    if (it.kind === "divider")
      return (
        <View
          key={i}
          onLayout={onLayout}
          style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,.16)" }}
        />
      );
    if (it.kind === "chip")
      return (
        <View
          key={i}
          onLayout={onLayout}
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 5,
            paddingHorizontal: 8,
            height: chipH,
            borderRadius: 5,
            backgroundColor: "rgba(255,255,255,.07)",
          }}
        >
          {/* The condensed bar is the PHONE bar: it renders through the stage
              scale, where a 400-weight micro-label smears — bold it there. */}
          <Text
            style={{
              fontSize: chipLabelFont,
              fontWeight: condensed ? "700" : "400",
              letterSpacing: 0.09 * chipLabelFont,
              textTransform: "uppercase",
              color: condensed ? "#a3b7ae" : "#8fa39a",
            }}
          >
            {it.label}
          </Text>
          <Text
            style={{
              fontSize: ctrlFont,
              fontWeight: condensed ? "800" : "700",
              lineHeight: Math.round(ctrlFont * 1.05),
              color: it.color ?? "#eef4f1",
            }}
          >
            {it.value}
          </Text>
        </View>
      );
    const tone = tones[it.tone ?? "plain"];
    const dim = it.disabled === true;
    return (
      <Pressable
        key={i}
        onLayout={onLayout}
        disabled={dim || !it.on}
        onPress={dim ? undefined : (it.on ?? undefined)}
        accessibilityLabel={it.label}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: it.kind === "icon" ? ctrlH : undefined,
            height: ctrlH,
            paddingHorizontal: it.kind === "icon" ? 0 : ctrlPad,
            borderWidth: 1,
            borderColor: tone.border,
            borderRadius: 6,
            backgroundColor: tone.bg,
            opacity: dim ? 0.42 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: tone.color,
            fontSize: ctrlFont,
            fontWeight: it.kind === "icon" ? "400" : "700",
            lineHeight: Math.round(ctrlFont * 1.05),
          }}
        >
          {it.label}
        </Text>
      </Pressable>
    );
  };

  // In the popover, chips read as label/value rows; buttons go full-width.
  const renderPop = (it: ToolbarItem, i: number) => {
    if (it.kind === "divider" || it.kind === "spacer") return null;
    if (it.kind === "chip")
      return (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            paddingVertical: 6,
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#8fa39a" }}>
            {it.label}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: it.color ?? "#eef4f1" }}>{it.value}</Text>
        </View>
      );
    if (it.kind === "node")
      return (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          {it.node}
        </View>
      );
    const tone = tones[it.tone ?? "plain"];
    const dim = it.disabled === true;
    return (
      <Pressable
        key={i}
        disabled={dim || !it.on}
        onPress={
          dim
            ? undefined
            : () => {
                it.on?.();
                setOpen(false);
              }
        }
        style={{
          width: "100%",
          height: ctrlH,
          marginBottom: 4,
          paddingHorizontal: ctrlPad,
          borderWidth: 1,
          borderColor: tone.border,
          borderRadius: 6,
          backgroundColor: tone.bg,
          alignItems: "center",
          justifyContent: "center",
          opacity: dim ? 0.42 : 1,
        }}
      >
        <Text style={{ color: tone.color, fontSize: ctrlFont, fontWeight: "700" }}>{it.label}</Text>
      </Pressable>
    );
  };

  const barMinH = Math.max(t, ctrlH + 14);

  return (
    <View
      style={{
        width: "100%",
        height: condensed ? barMinH : undefined,
        minHeight: condensed ? undefined : barMinH,
        flexDirection: "row",
        alignItems: "center",
        gap,
        paddingVertical: 6,
        paddingHorizontal: condensed ? 8 : 10,
        backgroundColor: bg,
        ...(side === "top"
          ? { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,.13)" }
          : { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.13)" }),
      }}
    >
      {/* The measured lead track — shrinks instead of pushing the pinned half
          out; the ⋯ group, not a scroll strip, reveals what does not fit. */}
      <View
        onLayout={(e) => {
          trackW.current = e.nativeEvent.layout.width;
          measure();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap,
          overflow: "hidden",
          flexWrap: condensed ? "nowrap" : "wrap",
        }}
      >
        {leadRaw.slice(0, visC).map((it, i) => renderItem(it, i, true))}
      </View>

      {hasMore && (
        <View style={{ position: "relative" }}>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityLabel="More controls"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              height: ctrlH,
              paddingHorizontal: ctrlPad,
              borderWidth: 1,
              borderColor: openEff ? "#12909f" : "rgba(255,255,255,.18)",
              borderRadius: 6,
              backgroundColor: openEff ? "#0d707c" : "rgba(255,255,255,.10)",
            }}
          >
            <Text style={{ color: "#eef4f1", fontWeight: "700", fontSize: ctrlFont }}>⋯</Text>
            <Text style={{ color: "#eef4f1", fontSize: chipLabelFont, opacity: 0.8 }}>{hidden.length}</Text>
          </Pressable>
          {openEff && (
            <ScrollView
              style={{
                position: "absolute",
                ...(side === "bottom" ? { bottom: ctrlH + 12 } : { top: ctrlH + 12 }),
                right: 0,
                zIndex: 40,
                minWidth: Math.round(ctrlH * 4.2),
                maxHeight: Math.round(ctrlH * 7),
                padding: 8,
                borderRadius: 8,
                backgroundColor: "#0f1a16",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,.16)",
              }}
            >
              {hidden.map(renderPop)}
            </ScrollView>
          )}
        </View>
      )}

      {tailRaw.length > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap }}>
          {tailRaw.map((it, i) => renderItem(it, n + 1 + i, false))}
        </View>
      )}
    </View>
  );
}
