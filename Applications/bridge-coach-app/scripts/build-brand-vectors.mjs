// Regenerates constants/brand-vectors.ts from the SVGs in assets/svg.
//
//   node scripts/build-brand-vectors.mjs
//
// The SVGs are exported from the Figma file (zCABHj6P4zQcWtMuDJHqtf). Figma
// composites two background rects into a node export — a #F5F5F5 backdrop and
// the frame's own #FFF4D7 fill — which is what made the earlier PNG exports
// fully opaque. In SVG they are just elements, so this strips them.
//
// CRITICAL: the `fill="white"` rect inside <clipPath> is NOT a background. It is
// the clip geometry (its fill is ignored) and it clips art that overflows the
// frame. The assertions below fail loudly if a future export loses it.
//
// Note #FFF4D7 is also the tab icons' own fill colour, so the cream rect is only
// stripped when it is a full-bleed <rect> — never from a path.
//
// The tree is additionally SPLIT so wind can move the leaves independently of
// the trunk: the trunk is a single #421313 path and the leaves are 47 paths
// (#618C52 green, #F389AC pink), all with coordinates baked in and no
// transforms. Leaves are sorted by height and dealt into bands, so the home
// screen can sway the upper canopy harder than the lower — which is what makes
// it read as wind rather than a wobble.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgDir = join(root, "assets", "svg");
const outFile = join(root, "constants", "brand-vectors.ts");

/** file basename → exported const name. `tree.svg` is handled separately. */
const NAMES = {
  "hills.svg": "HILLS_SVG",
  "icon-challenge-card.svg": "ICON_CHALLENGE_CARD",
  "icon-bird-flight.svg": "ICON_BIRD_FLIGHT",
  "icon-learners.svg": "ICON_LEARNERS",
  "icon-card-plus.svg": "ICON_CARD_PLUS",
  "icon-card-play.svg": "ICON_CARD_PLAY",
  "icon-card-history.svg": "ICON_CARD_HISTORY",
  "icon-card-envelope.svg": "ICON_CARD_ENVELOPE",
  // Private Table's own glyph (Figma 870:752) — a table seen end-on. It had been
  // borrowing New Play's plus, which said "make one" on a card that also opens the
  // ones you already have.
  "icon-card-table.svg": "ICON_CARD_TABLE",
  "icon-assignments.svg": "ICON_ASSIGNMENTS",
  "icon-home.svg": "ICON_HOME",
  "icon-learn.svg": "ICON_LEARN",
  "icon-play.svg": "ICON_PLAY",
  "icon-coach.svg": "ICON_COACH",
  "icon-club.svg": "ICON_CLUB",
  "icon-analysis.svg": "ICON_ANALYSIS",
  "icon-avatar.svg": "ICON_AVATAR",
  "icon-cards.svg": "ICON_CARDS",
  "icon-gear.svg": "ICON_GEAR",
  "icon-menu.svg": "ICON_MENU",
  "icon-birdglyph.svg": "ICON_BIRD_GLYPH",
  "icon-pin.svg": "ICON_PIN",
  // Friends (Figma 851:434). The bell is the notification glyph only — its
  // count badge is a live number, so it is drawn as a view, not baked in here.
  // Recovered as SOURCES: these three had been hand-added straight into the
  // generated file, so the next regeneration silently dropped them.
  "icon-activity-doc.svg": "ICON_ACTIVITY_DOC",
  "icon-activity-add.svg": "ICON_ACTIVITY_ADD",
  "icon-archive-box.svg": "ICON_ARCHIVE_BOX",
  // Club home buttons + the members pill (Figma 850:361).
  "icon-swords.svg": "ICON_SWORDS",
  "icon-chat.svg": "ICON_CHAT",
  "icon-members.svg": "ICON_MEMBERS",
  "icon-friends.svg": "ICON_FRIENDS",
  "icon-friend-add.svg": "ICON_FRIEND_ADD",
  "icon-bell.svg": "ICON_BELL",
  "icon-search.svg": "ICON_SEARCH",
  // Coach tab (Figma 869:597). The Hire button's plus is stored on its OWN,
  // rebased to its glyph box, because the design draws it inside a filled green
  // circle — a two-colour export cannot be tinted, and the circle is a view.
  "icon-coach-assignments.svg": "ICON_COACH_ASSIGNMENTS",
  "icon-feedback-bubble.svg": "ICON_FEEDBACK_BUBBLE",
  "icon-plus.svg": "ICON_PLUS",
};

const TRUNK_FILL = "#421313";
const LEAF_FILLS = ["#618C52", "#F389AC"];
/**
 * Breathing room around each leaf sprite, in design units.
 *
 * This is not cosmetic. The home screen rotates each leaf by up to ~3.2°, which
 * swings its corners outside a tightly-cropped box by roughly
 * (diagonal/2)·sin(angle) — about 1 unit for the largest leaf. If anything in the
 * render path clips a sprite to its own bounds, those corners get shaved and the
 * suit looks cut off. 2.5 units covers the sweep with room to spare.
 */
const LEAF_PAD = 2.5;

/**
 * Drop SVG filters. react-native-svg's filter support is partial and a filter it
 * cannot resolve can drop the whole filtered group, so the geometry is kept and
 * the effect (a soft drop shadow on the challenge-card glyph) is discarded — far
 * better than a tile that renders empty on some devices.
 */
function stripFilters(svg) {
  let n = 0;
  svg = svg.replace(/\s*filter="url\(#[^)]*\)"/g, () => (n++, ""));
  svg = svg.replace(/<filter\b[\s\S]*?<\/filter>/g, () => (n++, ""));
  // A <defs> left holding nothing is noise.
  svg = svg.replace(/<defs>\s*<\/defs>/g, "");
  return { svg, filtersRemoved: n };
}

/**
 * Namespace every id in an export. SVG ids are document-global on the web
 * renderer, and Figma stamps the SAME ids into every export from one frame —
 * tree.svg and hills.svg both shipped `clip0_410_1880`. Whichever mounts
 * first wins every url(#…) lookup on the page, so the tree trunk was being
 * clipped by the HILLS' clip rect (which ends at y≈223 in tree space): the
 * whole lower tree vanished. A per-export prefix makes collisions impossible.
 */
function namespaceIds(svg, prefix) {
  return svg
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}_${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}_${id})`);
}

/** Strip only full-bleed background rects, never icon geometry. */
function stripBackgrounds(svg, file) {
  const hadClip = svg.includes("<clipPath");
  let removed = 0;
  svg = svg.replace(/<rect\b[^>]*fill="#F5F5F5"\s*\/>/g, () => (removed++, ""));
  svg = svg.replace(
    /<rect\b(?![^>]*\btransform=)[^>]*\bwidth="390"[^>]*fill="#FFF4D7"\s*\/>/g,
    () => (removed++, ""),
  );
  if (hadClip && !svg.includes("<clipPath")) {
    throw new Error(`${file}: clipPath was destroyed — refusing to write`);
  }
  return { svg, removed };
}

const flatten = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Bounding box of a path's `d`. The leaves use only M/C/L/Z, every one of which
 * takes x,y pairs, so reading the numbers as alternating coordinates is exact.
 * Bézier control points are included, which can only ever make the box larger
 * than the true outline — never smaller, so a leaf can't be clipped.
 */
function pathBBox(d) {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Split tree.svg into a trunk layer and LEAF_BANDS leaf layers. */
function splitTree() {
  const raw = readFileSync(join(svgDir, "tree.svg"), "utf8");
  const { svg } = stripBackgrounds(raw, "tree.svg");

  const openTag = svg.match(/<svg[^>]*>/)[0];
  const defs = svg.match(/<defs>[\s\S]*<\/defs>/)?.[0] ?? "";
  const clipId = svg.match(/clip-path="url\(#([^)]+)\)"/)?.[1];
  if (!clipId) throw new Error("tree.svg: clip-path wrapper not found");

  const paths = svg.match(/<path\b[^>]*\/>/g) ?? [];
  const trunk = paths.filter((p) => p.includes(`fill="${TRUNK_FILL}"`));
  const leaves = paths.filter((p) => LEAF_FILLS.some((f) => p.includes(`fill="${f}"`)));

  if (trunk.length !== 1) throw new Error(`tree.svg: expected 1 trunk path, got ${trunk.length}`);
  if (leaves.length < 20) throw new Error(`tree.svg: only ${leaves.length} leaves — export changed?`);
  if (trunk.length + leaves.length !== paths.length) {
    throw new Error(
      `tree.svg: ${paths.length - trunk.length - leaves.length} path(s) matched neither trunk nor leaf fill`,
    );
  }

  // The trunk keeps the clip wrapper — its roots run outside the frame.
  const trunkSvg = namespaceIds(
    flatten(`${openTag}<g clip-path="url(#${clipId})">${trunk.join("")}</g>${defs}</svg>`),
    "tree",
  );

  // Each leaf becomes its own sprite, cropped to its own box, so it can be
  // positioned and moved independently. A tight viewBox means rotation happens
  // about the LEAF's centre rather than the canopy's, and the sprite is small
  // enough that 47 of them stay cheap.
  const sprites = leaves.map((p) => {
    const d = p.match(/\bd="([^"]*)"/)[1];
    const { minX, minY, maxX, maxY } = pathBBox(d);
    const x = minX - LEAF_PAD;
    const y = minY - LEAF_PAD;
    const w = maxX - minX + LEAF_PAD * 2;
    const h = maxY - minY + LEAF_PAD * 2;
    const r = (n) => Math.round(n * 100) / 100;
    const svg = flatten(
      `<svg width="${r(w)}" height="${r(h)}" viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}" ` +
        `fill="none" xmlns="http://www.w3.org/2000/svg">${p}</svg>`,
    );
    return { svg, x: r(x), y: r(y), w: r(w), h: r(h) };
  });

  const areas = sprites.map((s) => s.w * s.h);
  console.log(
    `tree.svg            -> trunk + ${sprites.length} leaf sprites ` +
      `(box ${Math.round(Math.min(...areas))}–${Math.round(Math.max(...areas))} sq units)`,
  );

  return { trunkSvg, sprites };
}

const present = new Set(readdirSync(svgDir).filter((f) => f.endsWith(".svg")));
const lines = [
  "// GENERATED by scripts/build-brand-vectors.mjs — do not hand-edit.",
  "//",
  "// Vector artwork from the Figma wireframes, inlined so it renders through",
  "// react-native-svg: sharp at any pixel density and transparent by",
  "// construction. Each viewBox is in design units (the same 390-wide space the",
  "// home screen lays out in), so these scale with every other measurement.",
  "//",
  "// The tree arrives pre-split: TREE_TRUNK_SVG, plus TREE_LEAVES — one sprite",
  "// per leaf with its own tight viewBox and its position in design space, so",
  "// each leaf can drift on its own without the branches moving.",
  "//",
  "// Re-run the script after re-exporting any SVG.",
  "",
];

{
  const { trunkSvg, sprites } = splitTree();
  lines.push(`export const TREE_TRUNK_SVG = ${JSON.stringify(trunkSvg)};`, "");
  lines.push(
    "/**",
    " * Transparent margin baked into every leaf sprite, in design units. The ink",
    " * sits this far inside the box on all four sides — needed so a rotating leaf's",
    " * corners stay inside their own sprite, and required to reason about where a",
    " * leaf's visible edge actually is.",
    " */",
    `export const LEAF_PAD = ${LEAF_PAD};`,
    "",
    "/** One leaf: its own SVG, and where it sits in the 390x720 design space. */",
    "export type LeafSprite = { svg: string; x: number; y: number; w: number; h: number };",
    "",
    "export const TREE_LEAVES: LeafSprite[] = [",
    ...sprites.map(
      (s) =>
        `  { x: ${s.x}, y: ${s.y}, w: ${s.w}, h: ${s.h}, svg: ${JSON.stringify(s.svg)} },`,
    ),
    "];",
    "",
  );
}

for (const [file, name] of Object.entries(NAMES)) {
  if (!present.has(file)) {
    console.warn(`skip (missing): ${file}`);
    continue;
  }
  let { svg, removed } = stripBackgrounds(readFileSync(join(svgDir, file), "utf8"), file);
  const filtered = stripFilters(svg);
  svg = namespaceIds(filtered.svg, name.toLowerCase());
  if (/fill="#F5F5F5"/.test(svg)) throw new Error(`${file}: grey backdrop survived`);
  if (/filter=/.test(svg)) throw new Error(`${file}: a filter reference survived`);
  const flat = flatten(svg);
  lines.push(`export const ${name} = ${JSON.stringify(flat)};`, "");
  console.log(
    `${file.padEnd(26)}-> ${name.padEnd(20)} bg ${removed}, filters ${filtered.filtersRemoved}, ${flat.length} chars`,
  );
}

writeFileSync(outFile, lines.join("\n"));
console.log(`\nwrote ${outFile}`);
