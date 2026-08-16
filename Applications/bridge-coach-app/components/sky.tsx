// The home screen's sky: blue at the top, warm cream by the time the branches
// reach the sun.
//
// The design draws this as a #FFF4D7 rectangle from y=320 to y=751 with a 70px
// Gaussian blur laid over a flat #A3CCD4 field. That is not something to
// reproduce literally — react-native-svg's filter support is partial, and a
// 70px blur over a full screen is expensive to composite every frame — but a
// blurred rectangle IS a gradient, and an exactly computable one: blurring a
// step edge with a Gaussian gives its cumulative distribution, so the cream's
// opacity at a given y is
//
//     Φ((y − 320) / 70) − Φ((y − 751) / 70)
//
// The stops below are that function sampled across the frame, which is why they
// bunch around y≈320 (offset 0.38) where the transition actually happens.
//
// The lower edge is deliberately NOT carried through: past y≈0.62 the real
// function fades back toward blue, but the hills and the sun are opaque from
// y=625 down and cover all of it, so the layer simply stays cream. Following the
// curve there would only risk a blue seam peeking out below the hills.
//
// Drawn as cream-over-blue rather than as a two-colour ramp so the stops carry
// one number each (the opacity) instead of a hand-mixed colour per stop.

import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";

import { Brand } from "../constants/theme";

/** [offset, cream opacity] — Φ((y−320)/70) − Φ((y−751)/70), sampled. */
const STOPS: readonly (readonly [number, number])[] = [
  [0.0, 0],
  [0.142, 0.002],
  [0.189, 0.011],
  [0.236, 0.043],
  [0.283, 0.127],
  [0.33, 0.284],
  [0.377, 0.5],
  [0.425, 0.716],
  [0.472, 0.873],
  [0.519, 0.957],
  [0.566, 0.989],
  [0.62, 1],
  [1.0, 1],
];

export function Sky({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="skyCream" x1="0" y1="0" x2="0" y2="1">
          {STOPS.map(([offset, opacity]) => (
            <Stop
              key={offset}
              offset={offset}
              stopColor={Brand.cream}
              stopOpacity={opacity}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={Brand.sky} />
      <Rect width="100%" height="100%" fill="url(#skyCream)" />
    </Svg>
  );
}
