// The Club home's ACTIVITIES carousel (Figma 755:5669 and 755:5736).
//
// It replaces the single "Latest Challenge" tile. The latest challenge is still
// the FIRST card and still does exactly what it did — this is the same tile in a
// scroller, not a new surface. What the carousel adds is room: a club's home will
// carry more than challenges (the design shows an assignment beside one), and a
// trailing + for making them.
//
// Structure only, by request. Every card's behaviour comes from the caller, so
// wiring a real activity type later means adding an entry to the list it passes —
// no layout work.
//
// Measurements are the design's, in its 390-wide space, scaled by `s` like every
// other screen. The first card sits CENTRED at rest (its left edge lands at
// 117.3 = (390 - 155.469) / 2, which is the 114 the design draws), and the pitch
// to the next card is 180.

import { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { ChallengeTile } from "./challenge-tile";
import { ICON_ACTIVITY_ADD } from "../constants/brand-vectors";
import { Brand, Fonts } from "../constants/theme";

/** The design's numbers, in its 390-wide space. */
const D = {
  tile: 155.469,
  /** Card left edge to the next card's left edge. */
  pitch: 180,
  captionTop: 2,
  captionFont: 13.633,
  captionDot: 5.029,
  captionGap: 8,
  /** The + disc, and the gap from the last card's right edge to it. */
  add: 36,
  addGap: 32.5,
} as const;

/**
 * One thing on a club's home.
 *
 * `detail` is the half after the dot — "8 Boards" for a challenge. Omit it and
 * the caption is just the title, which is what the design's assignment shows.
 * No `onPress` renders a card that is visibly there but inert, which is how an
 * activity type that has no screen yet should read.
 */
export type Activity = {
  id: string;
  kind: "challenge" | "document";
  title: string;
  detail?: string;
  onPress?: () => void;
};

export function ActivityCarousel({
  activities,
  /** The screen's design-space scale — width / 390. */
  scale: s,
  onAdd,
}: {
  activities: Activity[];
  scale: number;
  onAdd?: () => void;
}) {
  const tile = D.tile * s;
  const gap = (D.pitch - D.tile) * s;
  // Centring the first card is what makes the resting state match the design.
  const sideInset = ((390 - D.tile) / 2) * s;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Snapping to the pitch means a card always comes to rest where the design
      // draws one, rather than mid-slide.
      snapToInterval={D.pitch * s}
      decelerationRate="fast"
      contentContainerStyle={{
        paddingLeft: sideInset,
        // Enough tail that the LAST card can still reach the centre, so the +
        // is never stranded against the screen edge.
        paddingRight: sideInset,
        gap,
        alignItems: "flex-start",
      }}
    >
      {activities.map((a) => (
        <ActivityCard key={a.id} activity={a} size={tile} scale={s} />
      ))}

      {onAdd ? (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add an activity"
          hitSlop={12}
          style={({ pressed }) => [
            {
              width: D.add * s,
              height: D.add * s,
              // Centred against the CARD, not the card-plus-caption block, so it
              // sits where the design puts it.
              marginTop: (tile - D.add * s) / 2,
              marginLeft: (D.addGap - (D.pitch - D.tile)) * s,
            },
            pressed && styles.pressed,
          ]}
        >
          <SvgXml xml={ICON_ACTIVITY_ADD} width={D.add * s} height={D.add * s} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/** One card and its caption. */
function ActivityCard({
  activity,
  size,
  scale: s,
}: {
  activity: Activity;
  size: number;
  scale: number;
}): ReactNode {
  return (
    <View style={{ width: size }}>
      <ChallengeTile
        size={size}
        variant={activity.kind === "document" ? "document" : "challenge"}
        {...(activity.onPress ? { onPress: activity.onPress } : {})}
      />
      <View
        style={[
          styles.caption,
          { width: size, gap: D.captionGap * s, paddingTop: D.captionTop * s },
        ]}
      >
        <Text style={[styles.detail, { fontSize: D.captionFont * s }]} numberOfLines={1}>
          {activity.title}
        </Text>
        {activity.detail ? (
          <>
            <View
              style={{
                width: D.captionDot * s,
                height: D.captionDot * s,
                borderRadius: (D.captionDot * s) / 2,
                backgroundColor: Brand.ink,
              }}
            />
            <Text style={[styles.detail, { fontSize: D.captionFont * s }]} numberOfLines={1}>
              {activity.detail}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  detail: { fontFamily: Fonts.body, color: Brand.ink },
  pressed: { opacity: 0.75 },
});
