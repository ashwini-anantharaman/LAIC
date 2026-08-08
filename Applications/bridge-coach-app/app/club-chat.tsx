// Club chat — pushed from the Club tab's "Chat" button (Figma 630:5179).
//
// One thread per club. Everyone's messages sit on the left with their avatar and
// a "Name ∘ Coach" label above the bubble; your own sit on the right in maroon
// with no label, which is how iMessage tells the two apart without a legend.
//
// Long-press a message and a small menu drops down under it with Pin (or Unpin)
// — holding never pins outright, so a stray long-press costs nothing. The pin
// beside the title opens the club's pinned list. Pins are shared, not
// per-reader — the design shows one pin list per club.
//
// Pushed screen, so the app bar carries a back arrow and there is no tab bar;
// the composer takes that space.

import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { Avatar } from "../components/avatar";
import { BrandChrome, CONTENT_TOP_GAP } from "../components/brand-chrome";
import { BrandSheet } from "../components/brand-sheet";
import { tintSvg } from "../components/svg-tint";
import { ICON_PIN } from "../constants/brand-vectors";
import { Brand, Fonts, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { loadAvatars } from "../lib/avatar-store";
import { getRoleContext, primaryMembership } from "../lib/bridge-role";
import {
  loadThread,
  sendMessage,
  setPinned,
  type ClubChatMessage,
} from "../lib/club-chat";
import { useIsCoach } from "../lib/use-is-coach";

const DESIGN_WIDTH = 390;

/** Title row: "Chat" at x 25, the pin at x 104 — both under the app bar. */
const HEAD = { titleLeft: 25, titleTop: 0, pin: 23, pinLeft: 104, pinTop: 8 };
/** Incoming: avatar at x 25, bubble from x 90; the card behind is offset (4, 5). */
const IN = { avatarLeft: 25, avatarW: 41.3, avatarH: 40, bubbleLeft: 90, maxWidth: 214 };
/** Outgoing: bubble's right edge 21 short of the screen edge; behind offset (5, 4). */
const OUT = { right: 21, maxWidth: 214 };
const BUBBLE = { radius: 15, padH: 14, padV: 11, font: 13, offset: 5, gap: 26 };
const LABEL = { left: 100, font: 13, gap: 5 };
/** Composer: 329 x 40 pill at x 29, with its darker twin 6 below. */
const COMPOSER = { width: 329, height: 40, left: 29, radius: 100, offset: 6, padH: 22 };

const PIN_DARK = tintSvg(ICON_PIN, Brand.iconDark);
const PIN_ON_CREAM = tintSvg(ICON_PIN, Brand.iconDark);
const PIN_CREAM = tintSvg(ICON_PIN, Brand.cream);

/** A bubble's on-screen box, measured on long-press to place the menu. */
type Anchor = { x: number; y: number; width: number; height: number };

/** The drop-down: a dark card the width of a bubble's shorter side. */
const MENU = { width: 148, radius: 14, gap: 8, edge: 12 };

/** "Rahul ∘ Coach" — the design's separator is a ring operator, not a bullet. */
function authorLabel(m: ClubChatMessage): string {
  return `${m.author_name ?? "Member"} ∘ ${m.author_standing}`;
}

function Bubble({
  message,
  scale: s,
  onLongPress,
}: {
  message: ClubChatMessage;
  scale: number;
  /** Given the bubble's on-screen box, so the menu can drop under it. */
  onLongPress: (anchor: Anchor) => void;
}) {
  const box = useRef<View>(null);
  const mine = message.mine;
  const face = mine ? Brand.maroon : Brand.green;
  const behind = mine ? "#220a0b" : Brand.rowShadow;
  // Mine offsets right-and-down, theirs right-and-down too but from the left
  // edge — in the design the card behind always peeks below and to the right.
  const dx = (mine ? 5 : 4) * s;
  const dy = (mine ? 4 : 5) * s;

  return (
    <Pressable
      ref={box}
      onLongPress={() =>
        box.current?.measureInWindow((x, y, width, height) =>
          onLongPress({ x, y, width, height }),
        )
      }
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`${authorLabel(message)}: ${message.body}. Hold for options.`}
      style={({ pressed }) => [
        { maxWidth: (mine ? OUT.maxWidth : IN.maxWidth) * s },
        pressed && styles.pressed,
      ]}
    >
      {/* The card behind is a sibling so it can sit outside the face's clip. */}
      <View
        style={{
          position: "absolute",
          left: dx,
          top: dy,
          right: -dx,
          bottom: -dy,
          borderRadius: BUBBLE.radius * s,
          backgroundColor: behind,
        }}
      />
      <View
        style={{
          borderRadius: BUBBLE.radius * s,
          backgroundColor: face,
          paddingHorizontal: BUBBLE.padH * s,
          paddingVertical: BUBBLE.padV * s,
        }}
      >
        <Text style={[styles.bubbleText, { fontSize: BUBBLE.font * s }]}>{message.body}</Text>
      </View>
      {/* The marker hangs off the bubble's top-right, i.e. on the cream page —
          so it is the dark icon colour, not cream on cream. */}
      {message.pinned ? (
        <View style={{ position: "absolute", right: -3 * s, top: -10 * s }}>
          <SvgXml xml={PIN_ON_CREAM} width={14 * s} height={14 * s} />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ClubChatScreen() {
  const { token, user } = useAuth();
  const coach = useIsCoach();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const s = width / DESIGN_WIDTH;

  const [programId, setProgramId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ClubChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  /** author_profile_id -> picture, so each bubble carries its writer's face. */
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  /** The long-pressed message and where its bubble sits, or null for no menu. */
  const [menu, setMenu] = useState<{ message: ClubChatMessage; anchor: Anchor } | null>(null);
  const scroller = useRef<ScrollView>(null);

  // The club is the caller's own program, exactly as the Club tab resolves it.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getRoleContext(token).then((ctx) => {
      const primary = primaryMembership(ctx);
      if (!cancelled) setProgramId(primary?.program_id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token || !programId) return;
    try {
      const rows = await loadThread(token, programId);
      setMessages(rows);
      setError(null);
      // One request for every writer in the thread, and only for writers whose
      // face is not already known.
      setAvatars(new Map(await loadAvatars(token, rows.map((m) => m.author_profile_id))));
    } catch {
      setError("Couldn't load the chat.");
    }
  }, [token, programId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const author = useMemo(
    () => ({
      id: user?.id ?? "me",
      name: user?.display_name?.trim() || user?.email || "You",
      standing: coach ? "Coach" : "Learner",
    }),
    [user, coach],
  );

  async function send() {
    const text = draft.trim();
    if (!token || !programId || !text || sending) return;
    setSending(true);
    setDraft("");
    try {
      setMessages(await sendMessage(token, programId, text, author));
    } catch {
      setDraft(text); // put it back rather than losing what they typed
      setError("Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  function openMenu(message: ClubChatMessage, anchor: Anchor) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenu({ message, anchor });
  }

  async function togglePin(m: ClubChatMessage) {
    if (!token || !programId) return;
    setMenu(null);
    try {
      setMessages(await setPinned(token, programId, m.id, !m.pinned));
    } catch {
      setError("Couldn't change that pin.");
    }
  }

  const pinned = (messages ?? []).filter((m) => m.pinned);
  const rows = messages ?? [];

  return (
    <BrandChrome onBack={() => (router.canGoBack() ? router.back() : router.replace("/club"))}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ height: 44 * s, paddingTop: HEAD.titleTop * s }}>
          <Text style={[styles.title, { marginLeft: HEAD.titleLeft * s }]}>Chat</Text>
          <Pressable
            onPress={() => setPinsOpen(true)}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel={`Pinned messages (${pinned.length})`}
            style={({ pressed }) => [
              { position: "absolute", left: HEAD.pinLeft * s, top: HEAD.pinTop * s },
              pressed && styles.pressed,
            ]}
          >
            <SvgXml xml={PIN_DARK} width={HEAD.pin * s} height={HEAD.pin * s} />
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.thread}
          contentContainerStyle={{ paddingTop: 18 * s, paddingBottom: 18 * s }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
        >
          {messages == null ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={Brand.green} />
          ) : rows.length === 0 ? (
            <Text style={styles.empty}>
              No messages yet. Say hello to your club.
            </Text>
          ) : (
            rows.map((m) => (
              <View key={m.id} style={{ marginBottom: BUBBLE.gap * s }}>
                {m.mine ? (
                  <View style={{ alignItems: "flex-end", paddingRight: OUT.right * s }}>
                    <Bubble message={m} scale={s} onLongPress={(anchor) => openMenu(m, anchor)} />
                  </View>
                ) : (
                  <View>
                    <Text
                      style={[
                        styles.label,
                        { marginLeft: LABEL.left * s, fontSize: LABEL.font * s, marginBottom: LABEL.gap * s },
                      ]}
                      numberOfLines={1}
                    >
                      {authorLabel(m)}
                    </Text>
                    <View style={styles.incomingRow}>
                      <View style={{ marginLeft: IN.avatarLeft * s }}>
                        {/* Beside the bubble, on the cream page — so the
                            fallback glyph is the dark one. */}
                        <Avatar
                          uri={avatars.get(m.author_profile_id)}
                          width={IN.avatarW * s}
                          height={IN.avatarH * s}
                          tint={Brand.iconDark}
                        />
                      </View>
                      <View style={{ marginLeft: (IN.bubbleLeft - IN.avatarLeft - IN.avatarW) * s }}>
                        <Bubble message={m} scale={s} onLongPress={(anchor) => openMenu(m, anchor)} />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View
          style={{
            height: (COMPOSER.height + COMPOSER.offset) * s,
            marginBottom: Math.max(insets.bottom, 12 * s) + 8 * s,
          }}
        >
          <View
            style={[
              styles.composerShadow,
              {
                left: COMPOSER.left * s,
                top: COMPOSER.offset * s,
                width: COMPOSER.width * s,
                height: COMPOSER.height * s,
                borderRadius: COMPOSER.radius * s,
              },
            ]}
          />
          <View
            style={[
              styles.composerFace,
              {
                left: COMPOSER.left * s,
                width: COMPOSER.width * s,
                height: COMPOSER.height * s,
                borderRadius: COMPOSER.radius * s,
                paddingHorizontal: COMPOSER.padH * s,
              },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="birdMessage"
              placeholderTextColor="rgba(255,244,215,0.65)"
              style={[styles.input, { fontSize: BUBBLE.font * s }]}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              editable={!sending}
              multiline={false}
            />
            <Pressable
              onPress={() => void send()}
              hitSlop={12}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [
                { opacity: draft.trim() && !sending ? 1 : 0.4 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.send, { fontSize: BUBBLE.font * s }]}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* The long-press menu. Rendered at screen level, above the thread, and
          anchored under the bubble that was held — clamped so a bubble near an
          edge (or near the bottom) still gets a menu that is fully on screen. */}
      {menu ? (
        <View style={styles.menuHost}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenu(null)}
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              styles.menuCard,
              {
                width: MENU.width * s,
                borderRadius: MENU.radius * s,
                left: Math.min(
                  Math.max(MENU.edge * s, menu.anchor.x),
                  width - (MENU.width + MENU.edge) * s,
                ),
                top: menu.anchor.y + menu.anchor.height + MENU.gap * s,
              },
            ]}
          >
            <Pressable
              onPress={() => void togglePin(menu.message)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <SvgXml xml={PIN_CREAM} width={15 * s} height={15 * s} />
              <Text style={[styles.menuLabel, { fontSize: 15 * s }]}>
                {menu.message.pinned ? "Unpin" : "Pin"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <BrandSheet
        visible={pinsOpen}
        onClose={() => setPinsOpen(false)}
        title="Pinned"
        top={insets.top + CONTENT_TOP_GAP}
      >
        {pinned.length === 0 ? (
          <Text style={styles.sheetEmpty}>
            Nothing pinned yet. Hold a message in the chat to pin it here.
          </Text>
        ) : (
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {pinned.map((m) => (
              <View key={m.id} style={styles.pinRow}>
                <Text style={styles.pinAuthor}>{authorLabel(m)}</Text>
                <Text style={styles.pinBody}>{m.body}</Text>
                <Pressable
                  onPress={() => void togglePin(m)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Unpin: ${m.body}`}
                  style={({ pressed }) => [styles.unpin, pressed && styles.pressed]}
                >
                  <Text style={styles.unpinText}>Unpin</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </BrandSheet>
    </BrandChrome>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  title: { fontFamily: Fonts.display, fontSize: Type.screenTitle, color: Brand.ink },
  thread: { flex: 1 },
  incomingRow: { flexDirection: "row", alignItems: "flex-start" },
  label: { fontFamily: Fonts.body, color: Brand.ink },
  bubbleText: { fontFamily: Fonts.body, color: Brand.white },
  empty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
    lineHeight: 21,
  },
  error: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Brand.maroon,
    textAlign: "center",
    paddingTop: 12,
  },
  composerShadow: { position: "absolute", backgroundColor: Brand.rowShadow },
  composerFace: {
    position: "absolute",
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Brand.green,
  },
  input: { flex: 1, fontFamily: Fonts.body, color: Brand.cream, paddingVertical: 0 },
  send: { fontFamily: Fonts.bodySemibold, color: Brand.cream },
  sheetScroll: { flex: 1 },
  sheetEmpty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: "rgba(255,244,215,0.7)",
    lineHeight: 21,
    paddingTop: 18,
  },
  pinRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,244,215,0.16)" },
  pinAuthor: { fontFamily: Fonts.body, fontSize: 12.5, color: "rgba(255,244,215,0.7)" },
  pinBody: { fontFamily: Fonts.body, fontSize: 15, color: Brand.cream, paddingTop: 4, lineHeight: 21 },
  unpin: { alignSelf: "flex-start", paddingTop: 8 },
  unpinText: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: Brand.cream, opacity: 0.8 },
  /** Above the thread and the composer, below the sheets (which use 50). */
  menuHost: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  menuCard: {
    position: "absolute",
    backgroundColor: Brand.greenDark,
    paddingVertical: 4,
    // A real drop shadow, so the card reads as floating over the thread.
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemPressed: { opacity: 0.6 },
  menuLabel: { fontFamily: Fonts.bodySemibold, color: Brand.cream },
  pressed: { opacity: 0.7 },
});
