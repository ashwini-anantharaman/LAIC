"use client";

// embedBox / EmbedRoot — what stands between an embeddable component and the
// layout of a page nobody here has seen.
//
// THE ONE RULE THAT GOVERNS ALL OF THIS: an inline style beats any host
// selector, and a host's `!important` beats an inline style. Everything below
// is inline, so it defends against normal host CSS and NOT against `!important`.
//
// Measured against a host that is actively hostile — `display:flex` at 640×760,
// Georgia, 2.6 line-height, 1px tracking — with the drill as the component:
//
//   host rule on the component root    default        isolate
//   `flex: 1`                          611 in 760     567 in 760   HELD
//   `flex: 1 !important`               grow:1         grow:1       leaks
//   `align-self: stretch !important`   760 in 760     760 in 760   leaks
//   inherited font                     Georgia        system-ui    reset
//   inherited letter-spacing           1px            normal       reset
//
// Two things that table corrects about the obvious guesses. `flex: 1 !important`
// leaks along the MAIN axis, so in a row container it takes width, not height —
// the component gets wider and therefore SHORTER (429px), which looks like the
// defence working and is not. `align-self: stretch !important` is the one that
// pulls height, and it is why `alignSelf` below matters as much as `flex`.
// Colour is absent from the table on purpose: the leaves set their own inline,
// so a host's `color` never reached them even before this existed.
//
// A host determined to break this with `!important` can, and only a shadow root
// would stop them. That is deliberately not built: this family's animations
// live in a `<style href precedence>` that React hoists to document.head, which
// a shadow root cannot see, so every card lift and deal would silently stop.
// The trade is a boundary that holds against ordinary layout CSS — which is
// what integrations actually write — and does not cost the motion.
//
// Inherited properties flow in by default on purpose: a drill inside a lesson
// should look like it belongs to the lesson. `isolate` is for the host that
// wants the component to look identical everywhere instead.
//
// WHAT THIS CLOSES. A component's outermost element is a flex or grid ITEM in
// the host's container, so the HOST decided its box: a host who wrote `flex: 1`
// around it got it stretched to fill space it never asked for, with the slack
// painted in whatever that component draws at its edges. `flex: "none"` is set
// inline on the item itself, so it beats the container's rule. A host may still
// grow their OWN wrapper — the space then lands in their div, outside ours.
//
// WHY A STYLE AND NOT A WRAPPER COMPONENT. Nesting a div would have cost more
// than it bought. <PlayTable/> measures its own container with a ResizeObserver
// to size the felt, so an auto-height div between it and the box a host sized
// collapses the measurement; and <ChallengeCreator/>'s root is already
// `display: flex`. Merging the box into the root each component ALREADY has
// adds no node, breaks no height chain, and overrides nothing.
//
// NOT EVERY COMPONENT WANTS THIS. <BridgeTable/> and <ChallengePlayer/> are
// meant to fill a box the host sizes — that is what PlayTable's measurement is
// FOR — so pinning them to their content would fight the design rather than
// defend it. The box goes on the content-sized components; a host who wants a
// table fenced off puts <EmbedRoot> around it and sizes that.
//
// NONE OF THIS DEFENDS A FORK. An integrator who edits this package's source in
// their own tree — flipping a `flex` inside PlayTable, say — is already past
// every boundary a component can draw around itself. The answer there is a
// prop, or a rebase, not a wrapper.

import type { CSSProperties, ReactNode } from "react";

/** The stack the reset rebuilds with; only ever applied when isolating. */
const SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface EmbedBoxOptions {
  /**
   * Inherit NOTHING from the host page.
   *
   * `all: initial` drops every inherited property back to its initial value.
   * Off by default: with it off the block takes the host's typeface, which is
   * what a lesson wants; with it on the component looks the same on every page
   * whatever the surrounding font, colour or spacing. It is still an inline
   * declaration, so a host's `!important` rule outranks it.
   */
  isolate?: boolean;
  /** The typeface to rebuild with when `isolate` is on. */
  fontFamily?: string;
}

/**
 * Spread FIRST in a root's style, so the component's own declarations win.
 *
 * Key order is load-bearing: React writes inline styles in object order and
 * `all` is a shorthand that resets everything, so it has to be written before
 * anything that rebuilds the box — including the caller's own properties.
 */
export function embedBox({ isolate = false, fontFamily = SANS }: EmbedBoxOptions = {}): CSSProperties {
  return {
    ...(isolate
      ? {
          all: "initial" as const,
          fontFamily,
          // `all: initial` takes these to values the leaves already assume;
          // restated so the intent is legible rather than incidental.
          color: "#111827",
          lineHeight: "normal",
          textAlign: "left" as const,
          // A layout boundary as well as a style one: no margin collapses out
          // of it, and nothing inside it can reflow the host.
          contain: "layout style",
        }
      : {}),
    boxSizing: "border-box",
    // The defence against a host's `flex: 1` — measured: a plain `flex: 1` on
    // this element loses to it. (`flex: 1 !important` still wins; see above.)
    flex: "none",
    // The cross-axis twin, and the one that actually holds the HEIGHT: a flex
    // or grid container stretches its items by default, and this is what stops
    // the component being pulled to its host's height with the slack painted in
    // whatever it draws at its edges.
    alignSelf: "start",
    // A flex/grid item's automatic minimum size is its CONTENT, which lets a
    // wide table push the host's column wider instead of scrolling inside it.
    minWidth: 0,
  };
}

export interface EmbedRootProps extends EmbedBoxOptions {
  /** Merged last, so a host can still size the box deliberately. */
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/**
 * The same box as a wrapper, for hosts fencing off a component that does not
 * carry one itself — a <BridgeTable/> given a fixed height, say.
 */
export function EmbedRoot({ isolate, fontFamily, style, className, children }: Readonly<EmbedRootProps>) {
  return (
    <div className={className} style={{ ...embedBox({ isolate, fontFamily }), display: "block", ...style }}>
      {children}
    </div>
  );
}
