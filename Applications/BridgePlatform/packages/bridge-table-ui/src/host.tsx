"use client";

// The host adapter — the ONE seam between this component family and whatever
// application is mounting it.
//
// The table was always meant to travel: every leaf takes its data as props and
// hands its actions back through callbacks. Two things quietly broke that
// promise, because they reached for the framework instead of the caller —
// EdgeToolbar imported `next/link`, and SettingsMenu imported `next/navigation`.
// Either one drags Next into any bundle that wants a table, which is exactly
// what stops the table being dropped into a tutorial, a Vite app, or a Storybook.
//
// So both now ask the HOST. With no provider the defaults are plain web: an
// `<a>` and a `location` navigation, which work anywhere React runs. The Bridge
// app wraps its tables in <TableHostProvider> and passes Next's Link and its
// router, so client-side navigation there is unchanged.
//
// Context rather than props on purpose: PlayTable composes these leaves several
// levels down, and threading a Link component through every tier would put the
// framework back in the middle of the API.

import { createContext, useContext, type ElementType, type ReactNode } from "react";

export interface TableHost {
  /** Renders an anchor. Anything that accepts `href` — `a`, next/link, a Router link. */
  LinkComponent: ElementType;
  /**
   * Goes to `href`. `replace` is a same-page settings toggle (no history spam);
   * otherwise it is a real navigation.
   */
  navigate: (href: string, opts: { replace: boolean }) => void;
}

/** Plain-web defaults: no framework, no provider needed. */
export const DEFAULT_TABLE_HOST: TableHost = {
  LinkComponent: "a",
  navigate: (href, { replace }) => {
    if (typeof window === "undefined") return;
    if (replace) window.location.replace(href);
    else window.location.assign(href);
  },
};

const TableHostContext = createContext<TableHost>(DEFAULT_TABLE_HOST);

/** What the leaves call. Falls back to the plain-web host when unwrapped. */
export function useTableHost(): TableHost {
  return useContext(TableHostContext);
}

/**
 * Give the tables inside a host's own link + navigation. Partial: pass only the
 * piece you have and the other keeps its plain-web default.
 */
export function TableHostProvider({
  children,
  ...host
}: Readonly<Partial<TableHost> & { children: ReactNode }>) {
  const value: TableHost = {
    LinkComponent: host.LinkComponent ?? DEFAULT_TABLE_HOST.LinkComponent,
    navigate: host.navigate ?? DEFAULT_TABLE_HOST.navigate,
  };
  return <TableHostContext.Provider value={value}>{children}</TableHostContext.Provider>;
}
