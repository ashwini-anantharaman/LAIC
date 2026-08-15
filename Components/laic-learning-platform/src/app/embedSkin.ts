/**
 * The BirdBridge app's skin, applied BY THIS APP when it boots embedded
 * (?embed=1) inside the club app.
 *
 * The club app's native WebView injects this same sheet from its own side
 * (bridge-coach-app/constants/embed-skin.ts) — but its WEB build shows the
 * reader in a cross-origin <iframe>, where the same-origin policy forbids the
 * host styling our document, so on the web the seam stayed: the reader wore
 * this platform's own greys inside the app's cream. The only place that can
 * dress a cross-origin embed is the embed itself, which is what this is.
 * Keep the two sheets in step — same rules, same reasoning, one per side of
 * the origin boundary.
 *
 * WHAT IT RESTATES (and nothing more): the type pair and the ground colour —
 * the two things that carry the app's identity. Layout, spacing and the
 * reader's own coloured cards are design, not chrome, and are left alone.
 * The rules lean on !important because they must beat this app's own styles.
 *
 * The four faces are served from OUR /fonts (copied from the app's brand
 * assets); `local()` first so an installed face is not re-downloaded.
 */

/** BirdBridge brand, restated literally — the app's constants/theme.ts values. */
const CREAM = '#fff4d7';
const INK = '#1f1f1f';

const EMBED_SKIN_CSS = `
/* ── The two families, from this app's own origin ────────────────────────── */
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
/* The page paints greys/gradients on several nested wrappers, so the ground is
   set on the elements that carry it rather than on <body> alone. */
html, body {
  background: ${CREAM} !important;
  background-image: none !important;
}
body [style*="linear-gradient"],
body [style*="gradient"],
body [class*="bg-gradient"],
body [class*="min-h-screen"] {
  background-image: none !important;
  background-color: ${CREAM} !important;
}
/* Tailwind's grey page grounds, cleared to the cream — sweeping in scope but
   narrow in effect: only greys that read as CHROME, never the reader's own
   coloured meaning/why-it-matters cards. */
body [class*="bg-gray-50"], body [class*="bg-gray-100"],
body [class*="bg-slate-50"], body [class*="bg-slate-100"],
body [class*="bg-neutral-50"], body [class*="bg-neutral-100"] {
  background-color: ${CREAM} !important;
}

/* ── Type: body and subheadings ──────────────────────────────────────────── */
/* The FAMILY is forced widely, because the page sets it per-element. The COLOUR
   is set once on body and left to inherit — forcing it everywhere would repaint
   text that is deliberately light. */
body {
  color: ${INK} !important;
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
h1, h2, h3, h4, h5, h6, b, strong { font-synthesis: none; }

/* Buttons keep their own fills AND their own text colour — only the face changes,
   so an action still reads as an action.
 *
 * This used to force the colour to inherit, which contradicted the sentence above it:
 * body is forced to the ink, so every button inherited DARK text — including the ones
 * that set light text on a dark fill themselves. In the reader that mostly went
 * unnoticed, because its buttons are dark-on-cream anyway. On an authoring screen it
 * produced black text on a black pill and grey on near-black: unreadable, and
 * unreadable in a way that looked like the app's own styling. */
button, [role="button"] {
  font-family: 'NecoApp', Georgia, serif !important;
}
`;

/** Idempotent: keyed on an id, appended last so it wins ties on specificity. */
export function applyEmbedSkin(): void {
  if (typeof document === 'undefined') return;
  const id = 'app-embed-skin';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
  }
  el.textContent = EMBED_SKIN_CSS;
  (document.head || document.documentElement).appendChild(el);
}
