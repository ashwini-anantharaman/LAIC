/**
 * Zone 1 — Platform core: turning a panel of findings into one assessment.
 *
 * Three rules, and they exist here rather than in whoever writes the phrasing
 * because every one of them was a bug first.
 *
 *   1. VERDICT from the strongest evidence. An authority that MEASURED an
 *      outcome outranks one that recognised a pattern, even when the pattern
 *      approved. Otherwise a rulebook's endorsement hides a real loss.
 *
 *   2. EXPLANATION only from visible reasoning. The strongest authority that
 *      consulted nothing hidden becomes `teachable`. A note may report that an
 *      action cost something — the learner is owed that — and may not explain it
 *      with reasoning they could never have reproduced.
 *
 *   3. DISAGREEMENT is output, not error. System says fine, solution says costly:
 *      that is the most instructive case in the domain, and any design that
 *      stops at the first answer cannot express it.
 */
import type { Correctness, Severity } from "../types/index";
import type { Assessment, Authority, Finding } from "./types";

/** Evidential strength — who sets the verdict when the panel differs. */
const STRENGTH: Record<Authority, number> = {
  solution: 3, // measured the outcome
  system: 2, // knows the agreement
  convention: 1, // recognised a pattern
};

/** Teaching precedence — who gets to explain, among those who may. */
const TEACHES: Record<Authority, number> = {
  system: 2, // the learner's own rulebook: reproducible, citable
  convention: 1, // a general guideline: better than nothing
  solution: 0, // never explains; see rule 2
};

const SEVERITY_RANK: Record<Severity, number> = {
  minor: 0,
  moderate: 1,
  major: 2,
  critical: 3,
};

const ENDORSING: ReadonlySet<Correctness> = new Set<Correctness>(["correct", "acceptable"]);

/**
 * Collapse the panel.
 *
 * `findings` may be empty — a panel where nobody could speak is a normal
 * outcome, not a failure, and the caller gets `silentBecause` to say so rather
 * than an unexplained silence.
 */
export function reconcile(
  findings: readonly Finding[],
  opts: { silentBecause?: string } = {},
): Assessment {
  const ranked = [...findings].sort((a, b) => STRENGTH[b.authority] - STRENGTH[a.authority]);

  if (!ranked.length) {
    return {
      findings: [],
      correctness: "acceptable",
      severity: "minor",
      confidence: 0,
      silentBecause: opts.silentBecause ?? "no authority could judge this action",
    };
  }

  // Rule 1 — the strongest evidence sets the verdict. Among equals, the more
  // confident one; a hedged guideline should not outvote a sure one.
  const deciding = ranked.reduce((best, f) =>
    STRENGTH[f.authority] !== STRENGTH[best.authority]
      ? STRENGTH[f.authority] > STRENGTH[best.authority]
        ? f
        : best
      : f.confidence > best.confidence
        ? f
        : best,
  );

  // Severity comes from the DECIDING finding, and from nowhere else.
  //
  // An earlier version took the worst severity any authority reported, reasoning
  // that a real warning should not be softened by a lukewarm stronger authority.
  // Real boards showed what that produces: `correct/moderate` — a verdict of
  // "right" carrying the weight of "moderately wrong", because a general maxim
  // the panel had already overruled on correctness still set the severity. An
  // authority that lost the verdict has no business setting its weight; where a
  // weaker finding genuinely matters, `disagreement` below is the channel for it.
  const severity: Severity = deciding.severity;

  // Rule 2 — the explanation comes from visible reasoning only.
  const teachable = ranked
    .filter((f) => !f.usedHiddenCards && f.because)
    .sort((a, b) => TEACHES[b.authority] - TEACHES[a.authority] || b.confidence - a.confidence)[0];

  // Rule 3 — the learner's own system approved, and a solved position did not.
  const endorsed = ranked.find((f) => f.authority === "system" && ENDORSING.has(f.correctness));
  const costly = ranked.find(
    (f) => f.authority === "solution" && (f.cost?.tricks ?? 0) > 0,
  );

  return {
    findings: ranked,
    correctness: deciding.correctness,
    severity,
    confidence: deciding.confidence,
    ...(teachable ? { teachable } : {}),
    ...(endorsed && costly ? { disagreement: { endorsed, costly } } : {}),
  };
}
