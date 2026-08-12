// BidColumns — bridge-table-ui/src/BidColumns.tsx ported 1:1 to RN. The
// suit-column bidding pad: five strain columns (NT first) each stacking
// levels 1..7, a PASS / X / XX row beneath, and a Confirm / Cancel row on top
// while a call is staged. Same plumbing as the tray: a legal cell fires
// onStage; onConfirm / onCancel resolve the staged call; illegal cells sit at
// opacity .3; a pending call freezes the whole pad. One geometry knob — cell.

import { Pressable, Text, View } from "react-native";

import { STRAIN_TINT, type Strain } from "../../lib/vendor/table-kernel/table-kernel";
import { callText } from "./table-tokens";

/** NT leads, then the four suits in ranking order — the design's column order. */
const COLUMN_ORDER: readonly Strain[] = ["N", "S", "H", "D", "C"];
const PAD_GLYPH: Record<Strain, string> = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" };
const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;
const BORDER = 2;
const CONFIRM_PAD = 2;
const DESIGN_CELL = 46;

/** The staged-call row, scaled — height fixed, only width drivers move. */
function confirmMetrics(cell: number) {
  const k = Math.min(1, cell / DESIGN_CELL);
  return {
    btnH: 38,
    btnFont: Math.max(11, Math.round(18 * k)),
    padX: Math.max(8, Math.round(16 * k)),
    callFont: Math.max(12, Math.round(20 * k)),
    gap: Math.max(6, Math.round(10 * k)),
  };
}

export interface BidColumnsProps {
  cell?: number;
  minCellH?: number;
  radius?: number;
  legalCalls: readonly string[];
  live: boolean;
  pending: string | null;
  onStage: (call: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BidColumns({
  cell = 46,
  minCellH = 0,
  radius = 5,
  legalCalls,
  live,
  pending,
  onStage,
  onConfirm,
  onCancel,
}: BidColumnsProps) {
  const gap = Math.round(cell * 0.13);
  const colPad = Math.round(cell * 0.11);
  const cellW = cell;
  const cellH = Math.max(Math.round(cell * 0.92), minCellH);
  const passW = Math.round(cell * 3.4);
  const levelFont = Math.round(cell * 0.62);
  const glyphFont = Math.round(cell * 0.42);
  const legal = new Set(legalCalls);
  const inert = pending != null;
  const cm = confirmMetrics(cell);

  const cellBtn = (strain: Strain, level: number) => {
    const call = `${level}${strain}`;
    const tint = STRAIN_TINT[strain];
    const isLegal = legal.has(call);
    const ok = live && !inert && isLegal;
    return (
      <Pressable
        key={call}
        disabled={!ok}
        onPress={ok ? () => onStage(call) : undefined}
        accessibilityLabel={`${level}${strain === "N" ? "NT" : strain}`}
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: cellW,
          height: cellH,
          opacity: isLegal ? 1 : 0.3,
        }}
      >
        <Text style={{ fontSize: levelFont, lineHeight: levelFont, fontWeight: "700", color: tint.ink }}>
          {level}
        </Text>
        <Text style={{ fontSize: glyphFont, lineHeight: glyphFont, fontWeight: "700", color: tint.ink }}>
          {PAD_GLYPH[strain]}
        </Text>
      </Pressable>
    );
  };

  const bottomBtn = (call: string, label: string, w: number, bg: string, border: string, font = levelFont) => {
    const isLegal = legal.has(call);
    const ok = live && !inert && isLegal;
    return (
      <Pressable
        key={call}
        disabled={!ok}
        onPress={ok ? () => onStage(call) : undefined}
        accessibilityLabel={call === "P" ? "Pass" : call === "X" ? "Double" : "Redouble"}
        style={{
          width: w,
          height: cellH,
          backgroundColor: bg,
          borderWidth: BORDER,
          borderColor: border,
          borderRadius: radius,
          alignItems: "center",
          justifyContent: "center",
          opacity: isLegal ? 1 : 0.3,
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: font,
            lineHeight: Math.round(font * 1.05),
            ...(call === "P" ? { letterSpacing: 0.04 * font } : {}),
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ alignItems: "center", gap }}>
      {pending != null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: cm.gap, paddingVertical: CONFIRM_PAD }}>
          <Text style={{ fontSize: cm.callFont, fontWeight: "700", color: "#12281f" }}>
            {callText(pending)}
          </Text>
          <Pressable
            onPress={onConfirm}
            style={{
              height: cm.btnH,
              paddingHorizontal: cm.padX,
              borderWidth: 1,
              borderColor: "#0c4b0b",
              borderRadius: radius,
              backgroundColor: "#116710",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: cm.btnFont, fontWeight: "700" }}>Confirm</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={{
              height: cm.btnH,
              paddingHorizontal: cm.padX,
              borderWidth: 1,
              borderColor: "#5e1c1c",
              borderRadius: radius,
              backgroundColor: "#8a3030",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: cm.btnFont, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: "row", gap }}>
        {COLUMN_ORDER.map((strain) => (
          <View
            key={strain}
            style={{
              gap,
              padding: colPad,
              backgroundColor: STRAIN_TINT[strain].bg,
              borderWidth: BORDER,
              borderColor: STRAIN_TINT[strain].edge,
              borderRadius: radius,
            }}
          >
            {LEVELS.map((l) => cellBtn(strain, l))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap }}>
        {bottomBtn("P", "Pass", passW, "#116710", "#0c4b0b")}
        {bottomBtn("X", "X", cellW, "#7a5b3a", "#5e4227")}
        {/* Two glyphs in a one-cell button: only the type shrinks. */}
        {bottomBtn("XX", "XX", cellW, "#2b6b73", "#1c4d53", Math.round(levelFont * 0.78))}
      </View>
    </View>
  );
}
