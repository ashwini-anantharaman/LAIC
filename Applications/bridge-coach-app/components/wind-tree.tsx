// The home screen's tree, with the leaves drifting in the air.
//
// The trunk and branches are drawn once and never move — they're painted
// artwork, and the five nests are positioned against them. So the leaves are not
// attached to anything that bends: each one drifts on its own, a small distance,
// as though the air is moving past it. An earlier version rotated whole bands of
// leaves together, which looked like the tree was swaying and read wrong against
// the rigid branches.
//
// Each leaf is its own sprite with a tight viewBox (from
// scripts/build-brand-vectors.mjs), so it is positioned at its own spot and any
// rotation happens about the LEAF's centre rather than the canopy's.
//
// Motion comes from three shared clocks rather than 47 independent animations:
// every leaf reads a clock and offsets it by its own phase, which gives variety
// for the cost of three timing loops. Only sin() of the raw clock angle is used
// (no fractional harmonics), so every value is continuous when the clock wraps —
// a fractional multiplier would visibly jump once per cycle.
//
// Only transforms animate, so this runs on the UI thread and no SVG is reparsed.

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";

import {
  LEAF_PAD,
  TREE_LEAVES,
  TREE_TRUNK_SVG,
  type LeafSprite,
} from "../constants/brand-vectors";

/** Design-space size of the tree artwork. */
const TREE = { width: 390, height: 720 } as const;

/** Cycle lengths in ms. Leaves are dealt across these for speed variety. */
const CLOCK_PERIODS = [2300, 2900, 3500];

/** Peak travel in design units, and peak rotation in degrees. */
const DRIFT_X = [0.7, 1.5] as const;
const DRIFT_Y = [0.5, 1.2] as const;
const ROTATE = [1.2, 3.2] as const;

/**
 * The artwork places leaves flush against the frame — the right-most sits at
 * x+w = 388.95 of 390 — and the screen clips at that boundary. Left unchecked,
 * drift pushes those leaves across the edge and back, so a sliver of leaf
 * blinks in and out and reads as the suit being cut off. Each leaf's travel is
 * therefore capped by the room it actually has.
 *
 * Rotation also swings a leaf's corners outside its box, by about
 * (diagonal/2)·sin(angle); that is reserved here too so the two effects can't
 * combine to cross the edge.
 */
function clampDrift(amp: number, roomBefore: number, roomAfter: number, rotationSweep: number) {
  const room = Math.max(0, Math.min(roomBefore, roomAfter) - rotationSweep);
  return Math.min(amp, room);
}

/** Stable pseudo-random in [0,1) from a leaf index — same jiggle every launch. */
function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const lerp = (range: readonly [number, number], t: number) =>
  range[0] + (range[1] - range[0]) * t;

function Leaf({
  sprite,
  clock,
  index,
  scale: s,
}: {
  sprite: LeafSprite;
  clock: SharedValue<number>;
  index: number;
  scale: number;
}) {
  // Per-leaf constants, resolved to plain numbers so the worklet closes over
  // values rather than objects.
  const rot = lerp(ROTATE, hash(index, 3));

  // How far this leaf's corners swing out of its own box when it rotates.
  const halfDiagonal = Math.hypot(sprite.w, sprite.h) / 2;
  const sweep = halfDiagonal * Math.sin((rot * Math.PI) / 180);

  // Room is measured to the leaf's INK, not its box: the box carries LEAF_PAD of
  // transparent margin on every side, so the visible edge is inset by that much.
  const inkLeft = sprite.x + LEAF_PAD;
  const inkTop = sprite.y + LEAF_PAD;
  const inkRight = sprite.x + sprite.w - LEAF_PAD;
  const inkBottom = sprite.y + sprite.h - LEAF_PAD;

  const ax =
    clampDrift(
      lerp(DRIFT_X, hash(index, 1)),
      inkLeft,
      TREE.width - inkRight,
      sweep,
    ) * s;
  const ay =
    clampDrift(
      lerp(DRIFT_Y, hash(index, 2)),
      inkTop,
      TREE.height - inkBottom,
      sweep,
    ) * s;

  const px = hash(index, 4) * Math.PI * 2;
  const py = hash(index, 5) * Math.PI * 2;
  const pr = hash(index, 6) * Math.PI * 2;

  const style = useAnimatedStyle(() => {
    const a = clock.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.sin(a + px) * ax },
        { translateY: Math.sin(a + py) * ay },
        { rotateZ: `${Math.sin(a + pr) * rot}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.leaf,
        { left: sprite.x * s, top: sprite.y * s, width: sprite.w * s, height: sprite.h * s },
        style,
      ]}
      pointerEvents="none"
    >
      <SvgXml xml={sprite.svg} width={sprite.w * s} height={sprite.h * s} />
    </Animated.View>
  );
}

export function WindTree({ scale }: { scale: number }) {
  // One clock per period; every leaf borrows one of them. Declared explicitly
  // rather than mapped, so these are unmistakably unconditional hook calls.
  const clockA = useSharedValue(0);
  const clockB = useSharedValue(0);
  const clockC = useSharedValue(0);
  const clocks = [clockA, clockB, clockC];

  useEffect(() => {
    [clockA, clockB, clockC].forEach((clock, i) => {
      clock.value = withRepeat(
        withTiming(1, { duration: CLOCK_PERIODS[i]!, easing: Easing.linear }),
        -1,
        false,
      );
    });
  }, [clockA, clockB, clockC]);

  return (
    <View
      style={[styles.host, { width: TREE.width * scale, height: TREE.height * scale }]}
      pointerEvents="none"
    >
      <SvgXml xml={TREE_TRUNK_SVG} width={TREE.width * scale} height={TREE.height * scale} />
      {TREE_LEAVES.map((sprite, i) => (
        <Leaf
          key={i}
          sprite={sprite}
          index={i}
          clock={clocks[i % clocks.length]}
          scale={scale}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "relative" },
  leaf: { position: "absolute" },
});
