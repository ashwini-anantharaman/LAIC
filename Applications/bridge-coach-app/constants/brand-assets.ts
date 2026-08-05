// Raster brand art. Everything that is genuinely a vector now lives in
// ./brand-vectors.ts and renders through react-native-svg — the tree, the
// hills+sun, and every tab / app-bar icon. Only hand-painted raster art and two
// tiny glyphs remain here.
//
// These files are @1x (1 pixel per logical point), so they are upscaled on a 2x
// or 3x screen. The nest and owl originals inside Figma are far larger (the nest
// upload is 3277x4096 RGBA), so they can be re-cut sharp; these two glyphs are
// 14pt and drawn dimmed, where it does not read.

export const BrandArt = {
  /** One empty nest — the tappable destination for each section (151x92). */
  nest: require("../assets/images/brand/nest.png"),
} as const;

/**
 * The owl's blink cycle: eyes open, mid, closed. All three are cropped to the
 * SAME bounding box (1429x1901+239+344 in the supplied frames) so the owl does
 * not shift between frames — only its eyes change. Index 0 is the resting pose.
 */
export const OwlFrames = [
  require("../assets/images/brand/owl-1.png"),
  require("../assets/images/brand/owl-2.png"),
  require("../assets/images/brand/owl-3.png"),
] as const;

export const BrandIcons = {
  /** Pencil on each Profile field (14x14, rendered at 45% opacity). */
  editPencil: require("../assets/images/brand/edit-pencil-profile.png"),
  /** Camera badge on the Profile avatar (14x13). */
  photoBadge: require("../assets/images/brand/photo-icon-profile.png"),
} as const;
