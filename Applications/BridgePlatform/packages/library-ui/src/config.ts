// LibraryConfig — the document a host feeds the drop-in library UI.
//
// The contract: config controls FEATURES (what surfaces exist) and DISPLAY
// (labels, order, theme, copy) — NEVER access. Hiding a button here does not
// grant or deny anything; the access policy is enforced server-side by
// library-core wherever the data actually lives.

export interface LibraryKindConfig {
  /** Shelf label ("Boards"). Defaults to the kind id. */
  label?: string;
  /** One-line hint under the shelf title. */
  hint?: string;
  /** Renderer id resolved against the host's renderer registry. */
  renderer?: string;
  /** Reserved shelves render an empty placeholder instead of items. */
  reserved?: boolean;
}

export interface LibraryConfig {
  /** Where items come from: a facade endpoint, or the host passes items in. */
  data?: {
    mode: "http" | "in-process";
    /** Facade base URL for http mode (GET ?view=&kind=). */
    endpoint?: string;
  };
  features?: {
    /** Kinds to show, in shelf order. Omit = whatever the data contains. */
    kinds?: string[];
    /** Show the search box. Default true. */
    search?: boolean;
    /** Picker mode: items are selectable and onPick fires. Default false. */
    pick?: boolean;
  };
  display?: {
    /** Title above the browser ("Library"). */
    title?: string;
    /** Subtitle/description line. */
    subtitle?: string;
    /** Copy for an empty shelf. */
    emptyState?: string;
    /** Per-kind labels/hints/renderers. */
    kinds?: Record<string, LibraryKindConfig>;
    /** Visual density. Default "comfortable". */
    density?: "comfortable" | "compact";
    theme?: {
      /** Accent color (chips, buttons). */
      accent?: string;
      /** Card/background tones. */
      background?: string;
      card?: string;
      text?: string;
      textMuted?: string;
      /** Corner radius in px for cards/chips. */
      radius?: number;
      /** CSS font-family for the browser. */
      font?: string;
    };
  };
}

/** Validate the shape loosely and fill defaults — a bad config should fail
 *  loudly at mount, not render garbage. Returns a normalized copy. */
export function normalizeConfig(raw: unknown): Required<Pick<LibraryConfig, "features" | "display">> & LibraryConfig {
  if (raw !== null && typeof raw !== "object") throw new Error("LibraryConfig must be an object");
  const cfg = (raw ?? {}) as LibraryConfig;
  if (cfg.data && cfg.data.mode === "http" && !cfg.data.endpoint) {
    throw new Error('LibraryConfig: data.mode "http" requires data.endpoint');
  }
  if (cfg.features?.kinds && !Array.isArray(cfg.features.kinds)) {
    throw new Error("LibraryConfig: features.kinds must be an array of kind ids");
  }
  return {
    ...cfg,
    features: { search: true, pick: false, ...cfg.features },
    display: { density: "comfortable", ...cfg.display },
  };
}
