// A person's face, wherever one is drawn.
//
// One component so the fallback is identical everywhere: when someone has no
// picture — or theirs hasn't loaded yet — the brand's avatar glyph stands in,
// tinted to suit whatever it sits on. A picture is a base64 data URL straight
// from the profile row, so it needs no fetch of its own.
//
// Pictures are circular here even though the source is square: the glyph they
// replace is a head-and-shoulders mark, and a square photo beside it would read
// as a different kind of thing.

import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { tintSvg } from "./svg-tint";
import { ICON_AVATAR } from "../constants/brand-vectors";

/** The glyph's natural proportions — a picture is drawn to the same box. */
export const AVATAR_RATIO = 29 / 28.121;

export const Avatar = memo(function Avatar({
  uri,
  width,
  height,
  /** The glyph's colour when there is no picture. */
  tint,
}: {
  uri?: string | null;
  width: number;
  height: number;
  tint: string;
}) {
  if (!uri) {
    return <SvgXml xml={tintSvg(ICON_AVATAR, tint)} width={width} height={height} />;
  }

  // Square, so the circle isn't an ellipse: the glyph's box is a shade wider
  // than tall, and a photo cropped square should fill the taller dimension.
  const size = Math.max(width, height);
  return (
    <View style={[styles.frame, { width, height }]}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        // Data URLs are already local; caching them again would only duplicate.
        cachePolicy="memory"
        transition={120}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center", overflow: "visible" },
});
