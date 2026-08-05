// BirdBridge design system.
//
// Sourced from the Figma wireframes (file zCABHj6P4zQcWtMuDJHqtf): the home
// tree screen, and the Profile / Settings sheets. The `Colors` keys that
// predate the rebrand are kept and remapped onto the new palette so every
// existing screen inherits the brand without being touched.

/** Raw brand palette — the literal values the design uses. */
export const Brand = {
  /** Page background: warm cream. */
  cream: "#fff4d7",
  /** Sheets and the tab bar scrim: deep maroon. */
  maroon: "#541015",
  /** Inputs and selectable cards: forest green. */
  green: "#105431",
  /** A selected row inside a green card: near-black green. */
  greenDark: "#06140d",
  /** Body ink on cream. */
  ink: "#1f1f1f",
  /** Softer near-black used for icon glyphs. */
  iconDark: "#292929",
  /** Muted text on a dark surface. */
  mutedOnDark: "#dedede",
  /** The card sitting behind each playing card, giving it a stacked edge. */
  cardShadow: "#2a0506",
  /** The darker green sitting behind a leaderboard row, same trick on green. */
  rowShadow: "#052a20",
  /** The translucent wash that forms the floating tab bar. */
  tabWash: "rgba(255,185,185,0.2)",
  /** Scrim under the tab wash so cream labels stay legible on any screen. */
  tabScrim: "rgba(84,16,21,0.72)",
  white: "#ffffff",
} as const;

export const Colors = {
  // ── Pre-existing keys, remapped onto the brand ──────────────────────────
  text: Brand.ink,
  textMuted: "#6b7280",
  background: Brand.cream,
  border: "#e5e7eb",
  cardBackground: Brand.white,
  primary: Brand.maroon,
  primaryText: Brand.cream,

  // ── Brand-specific surfaces ────────────────────────────────────────────
  /** Text that sits on maroon or green. */
  onDark: Brand.cream,
  sheet: Brand.maroon,
  field: Brand.green,
  fieldSelected: Brand.greenDark,
  fieldBorder: Brand.cream,
  danger: "#b91c1c",
};

export const Spacing = {
  screen: 24,
  card: 16,
};

export const Radius = {
  card: 16,
  button: 999,
  /** Sheets and the tab bar. */
  sheet: 44,
  tabBar: 20,
  /** Profile / settings field cards. */
  field: 12,
};

/**
 * The tab bar floats over the content (67pt tall, 20pt off the bottom), so any
 * scrollable or bottom-anchored content inside a tab must reserve this much
 * room or it hides underneath.
 */
export const TAB_BAR_CLEARANCE = 96;

/**
 * Font families. The names are the `useFonts` keys registered in the root
 * layout — NOT the PostScript names. Neco is the display face (headings,
 * nest labels, the wordmark); General Sans is the UI/body face.
 */
export const Fonts = {
  /** The main title of a screen, and the BirdBridge wordmark. */
  display: "Neco-Bold",
  /**
   * Section headings and card titles — one step down from the title. Neco Medium
   * rather than Regular: the Clubs frame specifies Medium and it holds up better
   * at heading size, so the token carries it app-wide instead of one screen
   * drifting from the rest.
   */
  heading: "Neco-Medium",
  displayMedium: "Neco-Medium",
  /** Subheadings and body copy. */
  body: "GeneralSans-Regular",
  bodySemibold: "GeneralSans-Semibold",
  bodyLight: "GeneralSans-Light",
} as const;

/** Type scale taken from the designs. */
export const Type = {
  wordmark: 25.9,
  sheetTitle: 25.9,
  /** A screen's main title — Fonts.display (Neco Bold). */
  screenTitle: 25.9,
  /** A section heading within a screen — Fonts.heading (Neco Regular). */
  sectionHeading: 19.12,
  /** Playing-card title and corner index. */
  cardTitle: 16.44,
  /** Playing-card body copy — Fonts.body. */
  cardBody: 9.56,
  /** Club blurb and challenge details — Fonts.body. */
  clubDetail: 16.26,
  nestLabel: 18,
  sectionLabel: 16.95,
  fieldLabel: 15.74,
  fieldValue: 16,
  optionLabel: 13.06,
  tabLabel: 12.24,
  hint: 12.35,
} as const;
