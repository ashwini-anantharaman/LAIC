// The small conversation under a practice deal — somewhere to ask about the hand.
//
// A compact cousin of the Club chat screen: the same bubble idiom (green from
// others with a "Name ∘ Coach" label, maroon from you on the right) at a smaller
// size, because this sits inside a screen rather than owning one. No pinning and
// no avatars — at this scale they would crowd a two-line question.
//
// It scrolls within itself so the deal's description above it stays put.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Brand, Fonts } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import { loadDealThread, sendDealMessage, type DealChatMessage } from "../lib/deal-chat";
import { useIsCoach } from "../lib/use-is-coach";

const BUBBLE = { radius: 12, padH: 12, padV: 9, font: 13, offset: 3, gap: 14, maxWidth: 250 };
const COMPOSER = { height: 38, radius: 100, padH: 16 };

export function DealChat({
  /** Which deal's thread to show — switching it swaps the conversation. */
  dealKey,
  scale: s,
}: {
  dealKey: string;
  scale: number;
}) {
  const { user } = useAuth();
  const coach = useIsCoach();
  const [messages, setMessages] = useState<DealChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const scroller = useRef<ScrollView>(null);

  // Swap threads when the carousel moves to another deal.
  useEffect(() => {
    setMessages(loadDealThread(dealKey));
    setDraft("");
  }, [dealKey]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages(
      sendDealMessage(dealKey, text, {
        name: user?.display_name?.trim() || user?.email || "You",
        standing: coach ? "Coach" : "Learner",
      }),
    );
  }, [draft, dealKey, user, coach]);

  return (
    <View style={styles.host}>
      <ScrollView
        ref={scroller}
        style={styles.thread}
        contentContainerStyle={{ paddingTop: 4 * s, paddingBottom: 8 * s }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
        // The composer below owns the taps that land on it.
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <Text style={[styles.empty, { fontSize: 13 * s }]}>
            No questions about this deal yet.
          </Text>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={{
                marginBottom: BUBBLE.gap * s,
                alignItems: m.mine ? "flex-end" : "flex-start",
              }}
            >
              {/* Your own bubbles need no label — the side says who wrote them. */}
              {m.mine ? null : (
                <Text style={[styles.label, { fontSize: 11.5 * s, marginBottom: 3 * s }]}>
                  {m.author_name} ∘ {m.author_standing}
                </Text>
              )}
              <View style={{ maxWidth: BUBBLE.maxWidth * s }}>
                <View
                  style={{
                    position: "absolute",
                    left: BUBBLE.offset * s,
                    top: BUBBLE.offset * s,
                    right: -BUBBLE.offset * s,
                    bottom: -BUBBLE.offset * s,
                    borderRadius: BUBBLE.radius * s,
                    backgroundColor: m.mine ? "#220a0b" : Brand.rowShadow,
                  }}
                />
                <View
                  style={{
                    borderRadius: BUBBLE.radius * s,
                    backgroundColor: m.mine ? Brand.maroon : Brand.green,
                    paddingHorizontal: BUBBLE.padH * s,
                    paddingVertical: BUBBLE.padV * s,
                  }}
                >
                  <Text style={[styles.bubbleText, { fontSize: BUBBLE.font * s }]}>{m.body}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {
            height: COMPOSER.height * s,
            borderRadius: COMPOSER.radius * s,
            paddingHorizontal: COMPOSER.padH * s,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about this deal"
          placeholderTextColor="rgba(255,244,215,0.6)"
          style={[styles.input, { fontSize: BUBBLE.font * s }]}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <Pressable
          onPress={send}
          hitSlop={12}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={({ pressed }) => [{ opacity: draft.trim() ? 1 : 0.4 }, pressed && styles.pressed]}
        >
          <Text style={[styles.send, { fontSize: BUBBLE.font * s }]}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  thread: { flex: 1 },
  label: { fontFamily: Fonts.body, color: "rgba(31,31,31,0.7)" },
  bubbleText: { fontFamily: Fonts.body, color: Brand.white },
  empty: { fontFamily: Fonts.body, color: "rgba(31,31,31,0.5)", paddingTop: 8 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Brand.green,
  },
  input: { flex: 1, fontFamily: Fonts.body, color: Brand.cream, paddingVertical: 0 },
  send: { fontFamily: Fonts.bodySemibold, color: Brand.cream },
  pressed: { opacity: 0.6 },
});
