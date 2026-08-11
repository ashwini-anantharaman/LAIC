// The result card's ONWARD action — a challenge board's "Next board", drawn on
// the canvas rather than in a band the host stacks around the table.
//
// No JSX here: the file is a .test.ts so the workspace's single vitest config
// picks it up, so elements are built with createElement.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultCard } from "./ResultCard";

const base = { line: "4S by South, made 4", score: "+620", detail: "NS 10 - EW 3" };

describe("ResultCard", () => {
  it("draws no action when the host has none — an ordinary board ends quietly", () => {
    const html = renderToStaticMarkup(createElement(ResultCard, base));
    expect(html).not.toContain("<a");
    expect(html).toContain("4S by South, made 4");
  });

  it("draws the way onward as a real link, sized to be pressed", () => {
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        ...base,
        action: { label: "Next board", href: "/bridge/challenges/chl_x/play" },
        actionNote: "3 boards left",
        accent: "#0d707c",
      }),
    );
    expect(html).toContain('href="/bridge/challenges/chl_x/play"');
    expect(html).toContain("Next board");
    expect(html).toContain("3 boards left");
    expect(html).toMatch(/height:48px/);
    // It wears the table's accent, not a colour of its own.
    expect(html).toContain("#0d707c");
  });

  it("keeps the note attached to the action, never floating alone", () => {
    const html = renderToStaticMarkup(
      createElement(ResultCard, { ...base, actionNote: "3 boards left" }),
    );
    expect(html).not.toContain("3 boards left");
  });

  it("still names itself when the board carries no headline", () => {
    const html = renderToStaticMarkup(
      createElement(ResultCard, { line: "", score: "", detail: "NS 7 - EW 6" }),
    );
    expect(html).toContain("Board complete");
  });
});
