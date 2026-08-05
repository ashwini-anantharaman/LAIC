// Headless browser/picker logic — the ONE behavior every library UI shares,
// with zero framework or platform dependencies. Web (React), mobile (React
// Native) and future hosts wrap this state machine in their own rendering:
// same shelves, same instance switching, same pick semantics, many skins.

import type { LibraryItem, LibraryPrincipal } from "./types";
import type { LibraryAccessPolicy } from "./access";
import { canPerform } from "./access";

/** Which instance the browser is looking at. */
export type LibraryView = "mine" | "program" | "org";

export interface LibraryBrowserState {
  view: LibraryView;
  kind: string | null;
  query: string;
  /** Selected item ids (picker mode). */
  selection: readonly string[];
}

export function initialBrowserState(kind: string | null = null): LibraryBrowserState {
  return { view: "mine", kind, query: "", selection: [] };
}

/** The instance tabs a principal may switch between (drives UI chips). */
export function availableViews(
  policy: LibraryAccessPolicy,
  principal: LibraryPrincipal,
): LibraryView[] {
  const views: LibraryView[] = ["mine"];
  if (canPerform(policy, principal, "view", { level: "program" })) views.push("program");
  if (canPerform(policy, principal, "view", { level: "org" })) views.push("org");
  return views;
}

export type LibraryBrowserEvent =
  | { type: "setView"; view: LibraryView }
  | { type: "setKind"; kind: string | null }
  | { type: "setQuery"; query: string }
  | { type: "toggleSelect"; id: string; multi?: boolean }
  | { type: "clearSelection" };

/** Pure reducer — hosts feed it into useReducer or their own store. */
export function browserReducer(
  state: LibraryBrowserState,
  event: LibraryBrowserEvent,
): LibraryBrowserState {
  switch (event.type) {
    case "setView":
      return { ...state, view: event.view, selection: [] };
    case "setKind":
      return { ...state, kind: event.kind };
    case "setQuery":
      return { ...state, query: event.query };
    case "toggleSelect": {
      const has = state.selection.includes(event.id);
      if (has) return { ...state, selection: state.selection.filter((s) => s !== event.id) };
      return { ...state, selection: event.multi ? [...state.selection, event.id] : [event.id] };
    }
    case "clearSelection":
      return { ...state, selection: [] };
  }
}

/** Client-side refinement applied on top of a service list() result. */
export function filterItems<C>(
  items: readonly LibraryItem<C>[],
  state: Pick<LibraryBrowserState, "kind" | "query">,
): LibraryItem<C>[] {
  const q = state.query.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!state.kind || i.kind === state.kind) &&
      (!q || i.name.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q))),
  );
}
