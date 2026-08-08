// Render checks for the challenge family. These run in the plain node
// environment - react-dom/server turns each component into static markup, which
// is enough to pin the rules the design round made BINDING and which a props
// contract alone cannot express: a button that must be ABSENT rather than
// disabled, a tint that must land on every tied leader, a benchmark row that
// must never carry a rank.
//
// No JSX here: the file is a .test.ts so the workspace's single vitest config
// picks it up, so elements are built with createElement.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardSquares } from "./BoardSquares";
import { ChallengeDoneBar } from "./ChallengeDoneBar";
import { ChallengeResultsOverlay } from "./ChallengeResultsOverlay";
import { ChallengeStrip } from "./ChallengeStrip";
import { Leaderboard } from "./Leaderboard";
import { Scorecard } from "./Scorecard";

const noop = () => {};

describe("ChallengeStrip", () => {
  const base = {
    title: "Tuesday Night Teams - Set 12",
    boardNo: 4,
    boardsTotal: 8,
    onResults: noop,
  };

  it("hides the Results button entirely when the results are locked (spec A4)", () => {
    const html = renderToStaticMarkup(createElement(ChallengeStrip, { ...base, showResults: false }));
    expect(html).not.toContain("Results");
    expect(html).not.toContain("disabled");
  });

  it("shows a real button when they are unlocked", () => {
    const html = renderToStaticMarkup(createElement(ChallengeStrip, { ...base, showResults: true }));
    expect(html).toContain('type="button"');
    expect(html).toContain(">Results</button>");
  });

  it("says where you are, and fills the rule to the boards behind you", () => {
    const html = renderToStaticMarkup(createElement(ChallengeStrip, { ...base, showResults: true }));
    expect(html).toContain("Board 4 of 8");
    // 3 of 8 done -> 38%
    expect(html).toContain("width:38%");
    expect(html).toContain('aria-valuenow="3"');
  });

  it("does not run the fill past the end on the last board", () => {
    const html = renderToStaticMarkup(
      createElement(ChallengeStrip, { ...base, boardNo: 9, boardsTotal: 8, showResults: false }),
    );
    expect(html).toContain('aria-valuenow="8"');
    expect(html).toContain("width:100%");
  });
});

describe("Leaderboard", () => {
  const rows = [
    { name: "You", total: "+14", value: 14, isYou: true, marks: ["moderator" as const] },
    { name: "Devang Rao", total: "+4", value: 4 },
    { name: "Lena Fischer", total: "+4", value: 4 },
    { name: "Marta Okonkwo", total: "-9", value: -9, marks: ["editor" as const] },
  ];

  it("ranks the field with shared ranks for ties", () => {
    const html = renderToStaticMarkup(
      createElement(Leaderboard, { rows, scoringLabel: "IMPs" }),
    );
    const ranks = [...html.matchAll(/text-align:center[^>]*>(\d+)</g)].map((m) => m[1]);
    expect(ranks).toEqual(["1", "2", "2", "4"]);
  });

  it("carries the editor diamond and the MOD mark as suffixes, not columns", () => {
    const html = renderToStaticMarkup(createElement(Leaderboard, { rows, scoringLabel: "IMPs" }));
    expect(html).toContain("MOD");
    expect(html).toContain("\u25C6");
    expect(html).toContain("Set the boards - opened the pack editor");
  });

  it("puts BEN in an unranked hairline footer, below the field", () => {
    const html = renderToStaticMarkup(
      createElement(Leaderboard, {
        rows,
        scoringLabel: "IMPs",
        benRow: { total: "+21" },
      }),
    );
    expect(html).toContain("BEN");
    expect(html).toContain("benchmark \u00B7 unranked");
    // an en-dash where the rank would be, and BEN is after the last player
    expect(html).toContain("\u2013");
    expect(html.indexOf("BEN")).toBeGreaterThan(html.indexOf("Marta Okonkwo"));
  });

  it("says so plainly when nobody has finished", () => {
    const html = renderToStaticMarkup(createElement(Leaderboard, { rows: [], scoringLabel: "IMPs" }));
    expect(html).toContain("No finished players yet.");
  });
});

describe("Scorecard", () => {
  const columns = [
    { key: "you", label: "You", name: "You", isYou: true },
    { key: "dr", label: "DR", name: "Devang Rao" },
    { key: "BEN", label: "BEN", name: "BEN", isBenchmark: true },
  ];
  const rows = [
    { boardNo: 1, cells: [{ text: "+3", value: 3 }, { text: "+3", value: 3 }, { text: "-1", value: -1 }] },
    { boardNo: 2, cells: [{ text: "-2", value: -2 }, { text: "0", value: 0 }, { text: "+7", value: 7 }] },
  ];

  it("tints every cell of a tied board leader", () => {
    const html = renderToStaticMarkup(createElement(Scorecard, { columns, rows }));
    // #e4f2ef is the leader tint; board 1 ties two cells, board 2 has one BEN leader
    expect([...html.matchAll(/#e4f2ef/g)]).toHaveLength(3);
  });

  it("lets BEN's column lead a board", () => {
    const html = renderToStaticMarkup(createElement(Scorecard, { columns, rows }));
    expect(html).toContain("BEN, board 2: +7, best on this board");
  });

  it("renders no Compare control and no tab stops when no handler is given", () => {
    const html = renderToStaticMarkup(createElement(Scorecard, { columns, rows }));
    expect(html).not.toContain("Compare");
    // every cell button is disabled, so a read-only grid adds nothing to the tab order
    expect([...html.matchAll(/<button[^>]*disabled=""/g)]).toHaveLength(6);
  });

  it("offers Compare and the two-cell hint when a handler is given", () => {
    const html = renderToStaticMarkup(createElement(Scorecard, { columns, rows, onCompare: noop }));
    expect(html).toContain("Compare");
    expect(html).toContain("Pick two cells on the same board to compare those two lines.");
    expect(html).not.toContain("Open comparison"); // idle: nothing picked yet
  });

  it("labels rows and the totals footer", () => {
    const html = renderToStaticMarkup(
      createElement(Scorecard, {
        columns,
        rows,
        totals: [{ text: "+1", value: 1 }, { text: "+3", value: 3 }, { text: "+6", value: 6 }],
      }),
    );
    expect(html).toContain("Bd 1");
    expect(html).toContain("Bd 2");
    expect(html).toContain("Total");
  });
});

describe("BoardSquares", () => {
  const squares = [
    { boardNo: 1, state: "done" as const, score: "+3", value: 3 },
    { boardNo: 2, state: "current" as const },
    { boardNo: 3, state: "todo" as const },
  ];

  it("names each square's state for a screen reader", () => {
    const html = renderToStaticMarkup(createElement(BoardSquares, { squares, onSelect: noop }));
    expect(html).toContain('aria-label="Board 1, played, +3"');
    expect(html).toContain('aria-label="Board 2, in progress"');
    expect(html).toContain('aria-label="Board 3, not played"');
    expect(html).toContain('aria-current="step"');
  });

  it("shows the score inside a done square, the number everywhere else", () => {
    const html = renderToStaticMarkup(createElement(BoardSquares, { squares, onSelect: noop }));
    expect(html).toContain(">+3<");
  });

  it("is inert with no handler", () => {
    const html = renderToStaticMarkup(createElement(BoardSquares, { squares }));
    expect([...html.matchAll(/<button[^>]*disabled=""/g)]).toHaveLength(3);
  });
});

describe("ChallengeResultsOverlay", () => {
  const standings = { rows: [{ name: "You", total: "+14", value: 14, isYou: true }], scoringLabel: "IMPs" };
  const boards = [
    { boardNo: 1, text: "+3", value: 3 },
    { boardNo: 2, text: "-1", value: -1, current: true },
  ];

  it("renders nothing at all when closed", () => {
    const html = renderToStaticMarkup(
      createElement(ChallengeResultsOverlay, { open: false, onClose: noop, standings, boards }),
    );
    expect(html).toBe("");
  });

  it("is a dialog over the felt with the standings and the board strip inside", () => {
    const html = renderToStaticMarkup(
      createElement(ChallengeResultsOverlay, {
        open: true,
        onClose: noop,
        standings,
        boards,
        subtitle: "Tuesday Night Teams \u00B7 IMPs",
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Results");
    expect(html).toContain("Board by board");
    expect(html).toContain('aria-label="Back to the board"');
    // absolute, not fixed: it sits over the felt inside the table's own box
    expect(html).toContain("position:absolute");
  });

  it("gives the phone a grabber and the wide tier a centred card", () => {
    const phone = renderToStaticMarkup(
      createElement(ChallengeResultsOverlay, { open: true, onClose: noop, standings, boards }),
    );
    const wide = renderToStaticMarkup(
      createElement(ChallengeResultsOverlay, {
        open: true,
        onClose: noop,
        standings,
        boards,
        viewportPhone: false,
      }),
    );
    expect(phone).toContain('aria-label="Close results"');
    expect(wide).not.toContain('aria-label="Close results"');
    expect(wide).toContain("width:540px");
  });
});

describe("ChallengeDoneBar", () => {
  const onward = { label: "Next board", href: "/bridge/challenges/chl_x/play", note: "3 boards left" };

  it("offers the way onward as a real LINK, not a button", () => {
    const html = renderToStaticMarkup(
      createElement(ChallengeDoneBar, { onward, resultLine: "4S by South, made 4", resultScore: "+620" }),
    );
    expect(html).toContain('href="/bridge/challenges/chl_x/play"');
    expect(html).toContain("Next board");
    expect(html).toContain("3 boards left");
    expect(html).toContain("+620");
  });

  it("still names itself when the board carries no score line", () => {
    const html = renderToStaticMarkup(createElement(ChallengeDoneBar, { onward }));
    expect(html).toContain("Board complete");
  });

  it("keeps a 44px target - this is the one control that must be hit", () => {
    const html = renderToStaticMarkup(createElement(ChallengeDoneBar, { onward }));
    expect(html).toMatch(/height:44px/);
  });
});
