/**
 * The app's skin, as CSS, for pages shown inside a WebView.
 *
 * An embedded surface arrives in its own visual language — its own greys, its own
 * system font — and reads as a browser dropped into a screen. This restates the
 * two things that carry the app's identity: the type pair and the ground colour.
 *
 * WHY IT LIVES HERE AND NOT IN THE EMBEDDED APP
 * The page is a separate deployment on its own release cycle. Injecting means the
 * app can dress it without coordinating a change there, and without waiting for it
 * to ship. The cost is that these rules must beat the page's own, so they lean on
 * !important — heavy-handed in a stylesheet you own, correct in one you are
 * layering over someone else's.
 *
 * FONTS ARE SAME-ORIGIN
 * The learning platform already serves both families from /fonts, so @font-face
 * points at relative paths on the page's own host. No base64 (the six faces are
 * ~440 kB), and no cross-origin font fetch to be blocked. `local()` is tried first
 * so a face already installed is not downloaded again.
 *
 * WHAT IT DOES NOT TOUCH
 * Layout, spacing and component structure are the embedded page's business. Only
 * type and ground are restated — the smallest change that removes the seam.
 */
import { Brand } from "./theme";

/**
 * The type rule, as the brand defines it:
 *   Neco         — headings, buttons, anything bold
 *   General Sans — body and subheadings
 */
export const EMBED_SKIN_CSS = `
/* ── The two families, from the page's own origin ────────────────────────── */
@font-face {
  font-family: 'NecoApp';
  src: local('Neco Bold'), url('/fonts/Neco-Bold.otf') format('opentype');
  font-weight: 700; font-display: swap;
}
@font-face {
  font-family: 'NecoApp';
  src: local('Neco Medium'), url('/fonts/Neco-Medium.otf') format('opentype');
  font-weight: 500 600; font-display: swap;
}
@font-face {
  font-family: 'GeneralSansApp';
  src: local('General Sans'), url('/fonts/GeneralSans-Regular.otf') format('opentype');
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: 'GeneralSansApp';
  src: local('General Sans Semibold'), url('/fonts/GeneralSans-Semibold.otf') format('opentype');
  font-weight: 500 600; font-display: swap;
}

/* ── Ground ──────────────────────────────────────────────────────────────── */
/* The page paints a blue-grey gradient on several nested wrappers, so the ground
   is set on the elements that carry it rather than on <body> alone. Backgrounds
   are cleared to 'none' first: a gradient would otherwise still sit on top of a
   background-color. */
html, body {
  background: ${Brand.cream} !important;
  background-image: none !important;
}
/* ONLY the elements that actually carry the gradient. An earlier version cleared
   background-image on every element, which would also have wiped legitimate
   background images (icons, textures) — a blanket rule dressed up as a targeted
   one. Solid fills are left alone: the white cards and the coloured bid chips are
   design, not chrome. */
body [style*="linear-gradient"],
body [style*="gradient"],
body [class*="bg-gradient"],
body [class*="min-h-screen"] {
  background-image: none !important;
  background-color: ${Brand.cream} !important;
}

/* ── Type: body and subheadings ──────────────────────────────────────────── */
/* The FAMILY is forced widely, because the page sets it per-element. The COLOUR is
   not: it is set once on body and left to inherit. Forcing a colour on every span
   and div would repaint text that is deliberately light — the white PASS on a green
   bid chip — into dark ink on a dark fill, i.e. invisible. */
body {
  color: ${Brand.ink} !important;
}
body,
p, li, td, th, span, div, label, input, textarea, select, small, blockquote, figcaption {
  font-family: 'GeneralSansApp', system-ui, sans-serif !important;
}

/* ── Type: headings, buttons, bold ───────────────────────────────────────── */
h1, h2, h3, h4, h5, h6,
button, [role="button"], .btn,
b, strong, th {
  font-family: 'NecoApp', Georgia, serif !important;
}
/* Neco carries its own weight; the browser must not synthesise a bolder one. */
h1, h2, h3, h4, h5, h6, b, strong { font-synthesis: none; }

/* ── The reader's sticky toolbar ──────────────────────────────────────────── */
/* The bar above the content (title, "10 min · concept-card", Glossary / Ask AI)
   is the embedded reader's own, and it arrives a pale blue-grey — the one seam
   left once the page around it is cream. It becomes the app's maroon, which is
   what the tab bar and the sheets already use.

   Matched on the bar's OWN inline style rather than on Tailwind classes alone:
   .sticky.top-0 is generic enough to catch other things, while the translucent
   blue-grey fill and the 16px backdrop blur are specific to this bar. If the
   reader restyles it, these selectors stop matching and the bar simply returns to
   its own colour — a visible no-op rather than a mangled header. */
body div[style*="242,245,248"],
body div[style*="blur(16px)"] {
  background: ${Brand.maroon} !important;
  border-bottom-color: rgba(255, 244, 215, 0.22) !important;
}

/* Its text has inline colours (#0B1220 title, #9AA3AF meta) that only an
   !important rule can beat. The title goes cream-white; the meta line stays a step
   quieter so the hierarchy survives the change. */
body div[style*="242,245,248"] > div > p,
body div[style*="blur(16px)"] > div > p {
  color: ${Brand.cream} !important;
}
body div[style*="242,245,248"] > div > p + p,
body div[style*="blur(16px)"] > div > p + p {
  color: rgba(255, 244, 215, 0.72) !important;
}

/* The Glossary and Ask AI pills keep their pale fills and dark labels: they are
   white-on-maroon buttons now, which reads correctly and stays legible. Forcing
   their text white would have put white on a white pill. */

/* Buttons keep their own fills — only the face changes, so an action still reads
   as an action. */
button, [role="button"] { color: inherit !important; }
`;
