// The owl by the Coach nest, cycling its three frames continuously.
//
// This is a jiggle, not a blink: the frames run 1 → 2 → 3 → 1 … forever at a
// steady 8 fps, the way a hand-drawn loop does, so the owl always looks alive.
// (An earlier version treated frame 3 as "eyes closed" and fired an occasional
// blink with long pauses — that was the wrong read of the frames, and it made the
// owl stop moving between blinks.)
//
// The frames are cropped to a SHARED bounding box, so the silhouette never
// shifts — the supplied art already agreed on 1429x1901+239+344 and the build
// keeps it that way. All three are mounted and toggled by opacity rather than
// swapping one `source`, which would decode on first use and flash.

import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { OwlFrames } from "../constants/brand-assets";

/** Frames per second for the loop. */
const FPS = 8;

export function JigglingOwl({ width, height }: { width: number; height: number }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % OwlFrames.length),
      1000 / FPS,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <View style={{ width, height }} pointerEvents="none">
      {OwlFrames.map((source, i) => (
        <Image
          key={i}
          source={source}
          style={[styles.frame, { width, height, opacity: i === frame ? 1 : 0 }]}
          contentFit="contain"
          // A cross-fade would smear the frames into each other and kill the
          // hand-drawn snap.
          transition={0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", left: 0, top: 0 },
});
