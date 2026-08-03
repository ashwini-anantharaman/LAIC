/**
 * The three reconciliation rules, each of which was a real bug before it was a
 * rule. These tests are the record of what went wrong, not just of what works.
 */
import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import type { Finding } from "./types";

const f = (over: Partial<Finding>): Finding => ({
  assessor: "test",
  authority: "system",
  correctness: "correct",
  severity: "minor",
  confidence: 0.8,
  usedHiddenCards: false,
  ...over,
});

describe("reconcile", () => {
  it("takes the verdict from the strongest evidence, not the first opinion", () => {
    // A rulebook recognising a pattern is weaker evidence than a solved position
    // measuring an outcome. Ordering the panel by who answered first — the
    // earlier design — let an endorsement hide a measured loss.
    const a = reconcile([
      f({ authority: "system", correctness: "correct" }),
      f({
        authority: "solution",
        correctness: "suboptimal",
        severity: "moderate",
        usedHiddenCards: true,
        cost: { tricks: 1 },
      }),
    ]);
    expect(a.correctness).toBe("suboptimal");
    expect(a.severity).toBe("moderate");
  });

  it("never lets hidden-card reasoning become the explanation", () => {
    // The learner is owed the verdict — a card cost them a trick — but not an
    // explanation they could never have reproduced. So the solution sets the
    // verdict and the system does the explaining.
    const a = reconcile([
      f({ authority: "system", because: "your system plays low here", confidence: 0.7 }),
      f({
        authority: "solution",
        correctness: "incorrect",
        severity: "major",
        usedHiddenCards: true,
        because: "west is void, so the ace is dead",
        confidence: 0.95,
      }),
    ]);
    expect(a.correctness).toBe("incorrect");
    expect(a.teachable?.authority).toBe("system");
    expect(a.teachable?.because).toBe("your system plays low here");
  });

  it("leaves no explanation at all when every authority looked at hidden cards", () => {
    // Better to report a verdict with no reason than to borrow one that leaks.
    const a = reconcile([
      f({ authority: "solution", usedHiddenCards: true, because: "east had the king" }),
    ]);
    expect(a.teachable).toBeUndefined();
  });

  it("prefers the learner's own rulebook over a general guideline for explaining", () => {
    const a = reconcile([
      f({ authority: "convention", because: "second hand low", confidence: 0.95 }),
      f({ authority: "system", because: "your system plays the three", confidence: 0.6 }),
    ]);
    // Higher confidence does not promote a guideline over the learner's own
    // agreement: the agreement is the reproducible lesson.
    expect(a.teachable?.authority).toBe("system");
  });

  it("surfaces the case worth teaching: endorsed by your system, costly in fact", () => {
    const a = reconcile([
      f({ authority: "system", correctness: "correct", because: "your system's card" }),
      f({
        authority: "solution",
        correctness: "suboptimal",
        severity: "moderate",
        usedHiddenCards: true,
        cost: { tricks: 1 },
      }),
    ]);
    expect(a.disagreement).toBeTruthy();
    expect(a.disagreement?.endorsed.authority).toBe("system");
    expect(a.disagreement?.costly.cost?.tricks).toBe(1);
  });

  it("does not invent a disagreement when the system disapproved too", () => {
    const a = reconcile([
      f({ authority: "system", correctness: "incorrect", severity: "major" }),
      f({ authority: "solution", usedHiddenCards: true, cost: { tricks: 1 } }),
    ]);
    expect(a.disagreement).toBeUndefined();
  });

  it("takes correctness and severity from the SAME finding", () => {
    // An earlier rule took the worst severity anyone reported, which on real
    // boards produced `correct/moderate`: a verdict of "right" carrying the
    // weight of "moderately wrong", because a guideline the panel had already
    // overruled still set the severity.
    const a = reconcile([
      f({ authority: "solution", correctness: "suboptimal", severity: "minor", usedHiddenCards: true }),
      f({ authority: "convention", correctness: "incorrect", severity: "major" }),
    ]);
    expect(a.correctness).toBe("suboptimal");
    expect(a.severity).toBe("minor");
  });

  it("does not let an overruled guideline inflate the weight of a correct verdict", () => {
    const a = reconcile([
      f({ authority: "system", correctness: "correct", severity: "minor" }),
      f({ authority: "convention", correctness: "incorrect", severity: "moderate" }),
    ]);
    expect(a.correctness).toBe("correct");
    expect(a.severity).toBe("minor");
  });

  it("says why it is silent rather than returning an empty shrug", () => {
    const a = reconcile([], { silentBecause: "no rule covers this position" });
    expect(a.findings).toEqual([]);
    expect(a.silentBecause).toBe("no rule covers this position");
    // Silence must not read as a failing verdict.
    expect(a.correctness).toBe("acceptable");
    expect(a.confidence).toBe(0);
  });
});
