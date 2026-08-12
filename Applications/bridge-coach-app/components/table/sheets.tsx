// The native table's sheets (Part II Phase E): the ☰ settings, the seats
// panel, the hand-record viewer, and the challenge standings overlay. Each
// is a bottom sheet in the app's own clothes; every row's PRESENCE is the
// server's control answer — the sheets draw what they're handed.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand, Fonts, Radius } from "../../constants/theme";
import type { TableBootstrap } from "../../lib/table/session-store";
import {
  callLabel,
  nextSkin,
  skinLabel,
  type Card,
  type GameState,
  type Seat,
} from "../../lib/vendor/table-kernel/table-kernel";
import { SUIT_GLYPH, rankText, suitColor } from "./cards";

function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const inner = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {inner}
    </Pressable>
  ) : (
    <View style={styles.row}>{inner}</View>
  );
}

// ── ☰ Settings ───────────────────────────────────────────────────────────────

export function SettingsSheet({
  visible,
  onClose,
  bootstrap,
  showAll,
  onToggleHands,
  beatMs,
  onBeat,
  confirmBids,
  onConfirmBids,
  onSkin,
}: {
  visible: boolean;
  onClose: () => void;
  bootstrap: TableBootstrap;
  showAll: boolean;
  onToggleHands: () => void;
  beatMs: number;
  onBeat: (ms: number) => void;
  confirmBids: boolean;
  onConfirmBids: () => void;
  onSkin: () => void;
}) {
  const speedLabel = beatMs === 350 ? "Fast" : beatMs === 1500 ? "Slow" : "Normal";
  const nextSpeed = beatMs === 1500 ? 350 : beatMs === 350 ? 750 : 1500;
  return (
    <Sheet visible={visible} title="Table settings" onClose={onClose}>
      {bootstrap.canSeeAllHands && (
        <Row label="Show all four hands" value={showAll ? "On" : "Off"} onPress={onToggleHands} />
      )}
      <Row label="Robot speed" value={speedLabel} onPress={() => onBeat(nextSpeed)} />
      <Row label="Confirm bids" value={confirmBids ? "On" : "Off"} onPress={onConfirmBids} />
      {bootstrap.control["table.skin_settings"] && (
        <Row
          label="Skin"
          value={skinLabel(bootstrap.appearance.skin)}
          onPress={onSkin}
        />
      )}
    </Sheet>
  );
}

/** The next skin in the deck's order — the ☰ row cycles like the web's. */
export function cycleSkin(bootstrap: TableBootstrap) {
  return nextSkin(bootstrap.appearance.skin);
}

// ── Seats ────────────────────────────────────────────────────────────────────

export function SeatsSheet({
  visible,
  onClose,
  bootstrap,
  pickedSeat,
  onPickSeat,
  onSwap,
}: {
  visible: boolean;
  onClose: () => void;
  bootstrap: TableBootstrap;
  pickedSeat: Seat | null;
  onPickSeat: (seat: Seat | null) => void;
  onSwap: (seat: Seat, playerId: string) => void;
}) {
  return (
    <Sheet visible={visible} title="Who sits where" onClose={onClose}>
      <Text style={styles.hint}>
        Swapping a seat forks the board — same cards, new lineup; this table stays as it
        was.
      </Text>
      {(["N", "E", "S", "W"] as Seat[]).map((seat) => (
        <View key={seat}>
          <Row
            label={`${seat} — ${bootstrap.seatNames[seat]}`}
            value={pickedSeat === seat ? "▴" : "change ▾"}
            onPress={() => onPickSeat(pickedSeat === seat ? null : seat)}
          />
          {pickedSeat === seat && (
            <View style={styles.options}>
              <Option label="Me" onPress={() => onSwap(seat, "me")} />
              {bootstrap.benOffered && (
                <Option label="BEN (neural engine)" onPress={() => onSwap(seat, "ben")} />
              )}
              {bootstrap.roster.map((p) => (
                <Option
                  key={p.playerId}
                  label={p.validationStatus === "valid" ? p.name : `${p.name} (incomplete)`}
                  onPress={() => onSwap(seat, p.playerId)}
                />
              ))}
            </View>
          )}
        </View>
      ))}
    </Sheet>
  );
}

function Option({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}>
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

// ── The hand-record viewer ───────────────────────────────────────────────────

const SUIT_ORDER = ["S", "H", "D", "C"] as const;

function HandBlock({ seat, name, cards }: { seat: Seat; name: string; cards: Card[] }) {
  return (
    <View style={styles.handBlock}>
      <Text style={styles.handSeat}>
        {seat} · {name}
      </Text>
      {SUIT_ORDER.map((suit) => {
        const ranks = cards
          .filter((c) => c.suit === suit)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankText(c.rank))
          .join(" ");
        return (
          <Text key={suit} style={styles.handLine} numberOfLines={1}>
            <Text style={{ color: suitColor(suit) }}>{SUIT_GLYPH[suit]}</Text>
            {` ${ranks || "—"}`}
          </Text>
        );
      })}
    </View>
  );
}

export function HandsViewerSheet({
  visible,
  onClose,
  bootstrap,
  state,
}: {
  visible: boolean;
  onClose: () => void;
  bootstrap: TableBootstrap;
  state: GameState;
}) {
  const tricks: { seat: Seat; card: Card }[][] = [];
  for (const t of state.tricks) if (t.plays.length) tricks.push(t.plays);
  return (
    <Sheet visible={visible} title={`Board ${bootstrap.board.number}`} onClose={onClose}>
      <Text style={styles.hint}>
        dealer {bootstrap.board.dealer} · vul {bootstrap.board.vul}
        {state.contract
          ? ` · ${callLabel(`${state.contract.level}${state.contract.strain}`)} by ${state.contract.declarer}`
          : ""}
      </Text>

      {/* The DEALT hands, as the server let this viewer see them. */}
      <View style={{ alignItems: "center" }}>
        <HandBlock seat="N" name={bootstrap.seatNames.N} cards={bootstrap.dealtHands.N} />
      </View>
      <View style={styles.compassRow}>
        <HandBlock seat="W" name={bootstrap.seatNames.W} cards={bootstrap.dealtHands.W} />
        <HandBlock seat="E" name={bootstrap.seatNames.E} cards={bootstrap.dealtHands.E} />
      </View>
      <View style={{ alignItems: "center" }}>
        <HandBlock seat="S" name={bootstrap.seatNames.S} cards={bootstrap.dealtHands.S} />
      </View>

      {state.auction.length > 0 && (
        <>
          <Text style={styles.section}>THE AUCTION</Text>
          <View style={styles.wrapRow}>
            {state.auction.map((a, i) => (
              <Text key={i} style={styles.chip}>
                {a.seat} {callLabel(a.call)}
              </Text>
            ))}
          </View>
        </>
      )}

      {tricks.length > 0 && (
        <>
          <Text style={styles.section}>THE PLAY</Text>
          {tricks.map((plays, i) => (
            <Text key={i} style={styles.trickLine}>
              <Text style={styles.trickNo}>{`${i + 1}.  `}</Text>
              {plays
                .map((p) => `${p.seat} ${rankText(p.card.rank)}${SUIT_GLYPH[p.card.suit]}`)
                .join("   ")}
            </Text>
          ))}
        </>
      )}
    </Sheet>
  );
}

// ── Challenge standings overlay ──────────────────────────────────────────────

export function ChallengeOverlay({
  visible,
  onClose,
  challenge,
}: {
  visible: boolean;
  onClose: () => void;
  challenge: NonNullable<TableBootstrap["challenge"]>;
}) {
  const { standings, boards, subtitle } = challenge;
  return (
    <Sheet visible={visible} title="Standings" onClose={onClose}>
      <Text style={styles.hint}>{subtitle}</Text>

      {boards.length > 0 && (
        <View style={styles.boardsRow}>
          {boards.map((b) => (
            <View key={b.boardNo} style={[styles.boardCell, b.current && styles.boardCellNow]}>
              <Text style={styles.boardCellNo}>{b.boardNo}</Text>
              <Text style={styles.boardCellText}>{b.text || "·"}</Text>
            </View>
          ))}
        </View>
      )}

      {standings.rows.length === 0 ? (
        <Text style={styles.hint}>
          {standings.emptyLabel ?? "Nobody has finished every board yet."}
        </Text>
      ) : (
        <>
          <View style={styles.standingsHead}>
            <Text style={styles.standingsHeadText}>PLAYER</Text>
            <Text style={styles.standingsHeadText}>{standings.scoringLabel.toUpperCase()}</Text>
          </View>
          {standings.rows.map((r, i) => (
            <View key={i} style={[styles.standingsRow, r.isYou && styles.standingsRowYou]}>
              <Text style={styles.standingsRank}>{r.rank ?? ""}</Text>
              <Text style={[styles.standingsName, r.isYou && { fontFamily: Fonts.bodySemibold }]} numberOfLines={1}>
                {r.name}
                {r.isYou ? "  (you)" : ""}
              </Text>
              <Text style={styles.standingsTotal}>{r.total}</Text>
            </View>
          ))}
          {standings.benRow ? (
            <View style={[styles.standingsRow, { opacity: 0.65 }]}>
              <Text style={styles.standingsRank} />
              <Text style={styles.standingsName}>BEN</Text>
              <Text style={styles.standingsTotal}>{standings.benRow.total}</Text>
            </View>
          ) : null}
          {standings.note ? <Text style={styles.hint}>{standings.note}</Text> : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(42,5,6,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Brand.cream,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: 20,
    maxHeight: "82%",
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sheetTitle: { flex: 1, fontFamily: Fonts.display, fontSize: 20, color: Brand.ink },
  sheetClose: { fontSize: 18, color: Brand.ink, padding: 4 },
  hint: { fontFamily: Fonts.body, fontSize: 12.5, lineHeight: 18, color: "#7b7466", marginBottom: 8 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#e7e1d3",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  rowLabel: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },
  rowValue: { fontFamily: Fonts.body, fontSize: 13, color: "#5e5749" },

  options: { paddingLeft: 12, gap: 6, marginTop: 6 },
  option: {
    backgroundColor: Brand.green,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  optionText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.white },

  handBlock: { minWidth: 120, marginVertical: 6 },
  handSeat: { fontFamily: Fonts.bodySemibold, fontSize: 11, color: "#a49d8e", marginBottom: 2 },
  handLine: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 20, color: Brand.ink },
  compassRow: { flexDirection: "row", justifyContent: "space-between" },

  section: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: "#a49d8e",
    marginTop: 14,
    marginBottom: 6,
  },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    fontFamily: Fonts.bodySemibold,
    fontSize: 12.5,
    color: Brand.ink,
    backgroundColor: "#f1ede3",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
  },
  trickLine: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 21, color: Brand.ink },
  trickNo: { color: "#a49d8e", fontFamily: Fonts.bodySemibold },

  boardsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  boardCell: {
    minWidth: 40,
    alignItems: "center",
    backgroundColor: "#fffefa",
    borderWidth: 1,
    borderColor: "#e7e1d3",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  boardCellNow: { borderColor: "#0d707c", borderWidth: 2 },
  boardCellNo: { fontFamily: Fonts.bodySemibold, fontSize: 10, color: "#a49d8e" },
  boardCellText: { fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: Brand.ink },

  standingsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingHorizontal: 4,
  },
  standingsHeadText: { fontFamily: Fonts.bodySemibold, fontSize: 10, letterSpacing: 1.4, color: "#a49d8e" },
  standingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee7d6",
  },
  standingsRowYou: { backgroundColor: "#f1ede3", borderRadius: 8 },
  standingsRank: { width: 22, fontFamily: Fonts.bodySemibold, fontSize: 12.5, color: "#a49d8e" },
  standingsName: { flex: 1, fontFamily: Fonts.body, fontSize: 13.5, color: Brand.ink },
  standingsTotal: { fontFamily: Fonts.bodySemibold, fontSize: 13.5, color: Brand.ink },
});
