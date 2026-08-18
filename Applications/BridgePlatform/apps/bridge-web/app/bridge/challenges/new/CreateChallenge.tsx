"use client";

// The create-challenge wizard, translated from
// docs/design/challenges/Create Challenge.dc.html (validated at 390x844).
//
// Phone is the primary shape and the one implemented everywhere: ONE scrolling
// form with a sticky jump-chip header and a sticky create bar. Wide screens
// keep that single scroll and gain the canvas's draft rail as a sticky aside —
// the same summary lines and the same create button.
//
// The wizard is deliberately NOT a <form>: the draft is a typed object handed
// straight to `createChallengeAction`, and the pack editor needs a form of its
// own inside a board card (forms cannot nest).

import {
  MAX_BOARDS,
  MIN_BOARDS,
  standardDealer,
  standardVul,
  type ChallengeFormat,
  type ChallengeScoring,
  type StandingsVisibility,
} from "@bridge/challenges";
import { seededDeal } from "@bridge/engine";
import { parseBbo } from "@bridge/formats";
import type { Card, Seat } from "@bridge/events";
import { useMemo, useRef, useState, useTransition } from "react";
import { createChallengeAction, saveChallengeDraftAction } from "../actions";
import {
  CHALLENGE_CONTROLS,
  CONTROL_STATES,
  controlOverridesOf,
  packFromDraft,
  defaultControlStates,
  FORMAT_OPTIONS,
  SCORING_OPTIONS,
  STANDINGS_OPTIONS,
  validateDraft,
  type ChallengeDraft,
  ENGINE_OPTIONS,
  type ControlState,
} from "../draft";
import type { ChallengeEngine } from "@bridge/challenges";
import type { ChallengePerson } from "../people";
import { BoardCard, type BoardDraftState } from "./BoardCard";
import { SUIT_ORDER, suitTextsFromCards } from "@/lib/dealText";

const STEPS = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Controls", num: "03" },
  { key: "invites", label: "Invites", num: "04" },
  { key: "review", label: "Review", num: "05" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const DEFAULT_BOARDS = 4;
const BOARD_PRESETS = [4, 8, 12, 16];

const seedFor = (base: number, boardNo: number) => (base + boardNo * 7919) >>> 0;
const freshSeed = () => (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;

function makeBoard(seed: number, boardNo: number): BoardDraftState {
  return {
    boardNo,
    seed,
    dealer: standardDealer(boardNo),
    humanSeat: "S",
    vul: standardVul(boardNo),
    hands: seededDeal(seed),
    touched: false,
    edited: false,
  };
}

/** The board's pack in the DealEditor's ♠.♥.♦.♣ serialization, per seat. */
function serializePack(hands: Record<Seat, Card[]>): Record<Seat, string> {
  const out = {} as Record<Seat, string>;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    const texts = suitTextsFromCards(hands[seat]);
    out[seat] = SUIT_ORDER.map((suit) => texts[suit]).join(".");
  }
  return out;
}

export function CreateChallenge({
  people,
  self,
  seedBase,
  initialDraft,
  draftEntryId,
  canAdvanced,
  advancedSections,
  benOffered,
}: Readonly<{
  people: ChallengePerson[];
  /** The creator's own row: auto-invited, accepted, moderator, undeletable. */
  self: ChallengePerson;
  /** Seed the first set of deals derive from — chosen on the server so the
   *  first paint and the hydrated tree agree. */
  seedBase: number;
  /** A parked draft being picked up again (library entry `draftEntryId`). */
  initialDraft?: ChallengeDraft;
  draftEntryId?: string;
  /** May this creator open the multi-step form behind Quick create? */
  canAdvanced: boolean;
  /**
   * Which advanced SECTIONS this creator gets (challenge.advanced.* keys). A
   * denied section does not render and its step drops out of the path — the
   * challenge simply takes that section's defaults.
   */
  advancedSections: { engine: boolean; boards: boolean; controls: boolean };
  /** Is BEN reachable from this server? Without it there is no engine choice. */
  benOffered: boolean;
}>) {
  // A RESUMED DRAFT SEEDS EVERY FIELD. `initialDraft` has already been through
  // the app's validator on the server, so anything missing from an older save
  // has been defaulted rather than left undefined — which is why each fallback
  // below is the same default a fresh wizard starts from.
  const d = initialDraft;
  const [step, setStep] = useState<StepKey>("basics");
  const [title, setTitle] = useState(d?.title ?? "");
  const [description, setDescription] = useState(d?.description ?? "");
  const [format, setFormat] = useState<ChallengeFormat>(d?.format ?? "full");
  const [scoring, setScoring] = useState<ChallengeScoring>(d?.scoring ?? "imps");
  const [standings, setStandings] = useState<StandingsVisibility>(
    d?.standingsVisibility ?? "after-finish",
  );
  const [boards, setBoards] = useState<BoardDraftState[]>(() =>
    d?.boards.length
      ? d.boards.map((b) => {
          const base = makeBoard(b.seed, b.boardNo);
          const edited = b.pack ? packFromDraft(b.pack) : null;
          return {
            ...base,
            dealer: b.dealer,
            humanSeat: b.humanSeat,
            ...(b.vul ? { vul: b.vul } : {}),
            // A hand-edited pack travels card-by-card; anything else is the
            // seed's own deal, which re-derives identically.
            ...(edited && "hands" in edited
              ? { hands: edited.hands, edited: true, touched: true }
              : {}),
          };
        })
      : Array.from({ length: DEFAULT_BOARDS }, (_, i) =>
          makeBoard(seedFor(seedBase, i + 1), i + 1),
        ),
  );
  const [controls, setControls] = useState<Record<string, ControlState>>(() =>
    d ? { ...defaultControlStates(), ...d.controlOverrides } : defaultControlStates(),
  );
  const [query, setQuery] = useState("");
  const [invited, setInvited] = useState<{ userId: string; moderator: boolean }[]>(
    d?.invites.map((i) => ({ userId: i.userId, moderator: i.moderator })) ?? [],
  );
  const [engine, setEngine] = useState<ChallengeEngine>(d?.engine ?? "dd");
  // Quick create is the whole page until this is opened. A RESUMED DRAFT opens
  // straight into it: parking a draft is something you do part-way through the
  // long form, so dropping someone back on the short one would hide their work.
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(d) && canAdvanced);
  const [editorBadge, setEditorBadge] = useState(d?.editorBadge ?? false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sections = useRef<Partial<Record<StepKey, HTMLElement | null>>>({});
  /**
   * Move to a step of the advanced form, opening it if it is still closed.
   * Only one step renders at a time now, so this pages rather than scrolls —
   * the scroll is to put the top of the new page under the reader, since the
   * browser keeps the old scroll position when the content swaps beneath it.
   */
  const goStep = (key: StepKey) => {
    if (!canAdvanced) return;
    setAdvancedOpen(true);
    setStep(key);
    requestAnimationFrame(() =>
      sections.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  // The PATH through the form is only the granted steps: a gated step is not
  // greyed out, it is gone — chips, Back/Next and "Step N of M" all agree.
  const steps = STEPS.filter(
    (x) =>
      (x.key !== "boards" || advancedSections.boards) &&
      (x.key !== "controls" || advancedSections.controls),
  );
  const stepAt = steps.findIndex((x) => x.key === step);
  const prevStep = stepAt > 0 ? steps[stepAt - 1] : null;
  const nextStep = stepAt >= 0 && stepAt < steps.length - 1 ? steps[stepAt + 1] : null;
  const sectionRef = (key: StepKey) => (el: HTMLElement | null) => {
    sections.current[key] = el;
  };

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.userId, p] as const)),
    [people],
  );
  const invitedIds = useMemo(() => new Set(invited.map((i) => i.userId)), [invited]);
  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmedQuery)
      return people.filter((p) => !invitedIds.has(p.userId)).slice(0, 4);
    return people.filter((p) =>
      `${p.name} ${p.handle ?? ""}`.toLowerCase().includes(trimmedQuery),
    );
  }, [people, invitedIds, trimmedQuery]);

  /** Quick create shows people as tap-to-toggle chips; past a handful the
   *  Invites step's search is the honest tool, so the card links there. */
  const quickPeople = useMemo(() => people.slice(0, 8), [people]);

  const setBoardCount = (next: number) => {
    const n = Math.max(MIN_BOARDS, Math.min(MAX_BOARDS, Math.round(next)));
    setBoards((prev) =>
      Array.from(
        { length: n },
        (_, i) => prev[i] ?? makeBoard(seedFor(seedBase, i + 1), i + 1),
      ),
    );
  };
  const patchBoard = (index: number, patch: Partial<BoardDraftState>) =>
    setBoards((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const rerollBoard = (index: number) =>
    setBoards((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;
        const seed = freshSeed();
        return { ...b, seed, hands: seededDeal(seed), edited: false };
      }),
    );
  /** One pasted line -> boards. A single line may itself hold several boards
   *  (a multi-board LIN), so this flattens rather than counting lines. */
  const readImport = (): BoardDraftState[] | null => {
    const lines = importText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      setImportError("Paste a BBO hand link first.");
      return null;
    }
    const out: BoardDraftState[] = [];
    for (const line of lines) {
      const parsed = parseBbo(line);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return null;
      }
      for (const board of parsed.boards)
        out.push({
          boardNo: 0, // renumbered by position below
          seed: freshSeed(),
          dealer: board.dealer,
          humanSeat: "S",
          vul: board.vul,
          hands: board.hands,
          touched: true,
          edited: true,
        });
    }
    return out;
  };

  const applyImport = (mode: "add" | "replace") => {
    const imported = readImport();
    if (!imported) return;
    setBoards((prev) => {
      const kept = mode === "replace" ? [] : prev;
      return [...kept, ...imported]
        .slice(0, MAX_BOARDS)
        .map((board, i) => ({ ...board, boardNo: i + 1 }));
    });
    // Choosing the deals is the act the badge exists to disclose (spec §3),
    // and pasting a hand link is choosing them as squarely as the editor is.
    setEditorBadge(true);
    setImportError(null);
    setImportText("");
    const room = MAX_BOARDS - (mode === "replace" ? 0 : boards.length);
    const used = Math.min(imported.length, Math.max(0, room));
    setImportInfo(
      used < imported.length
        ? `Took ${used} of ${imported.length} — a challenge holds ${MAX_BOARDS} boards.`
        : `${used} board${used === 1 ? "" : "s"} from BBO.`,
    );
  };

  const toggleInvite = (userId: string) =>
    setInvited((prev) =>
      prev.some((r) => r.userId === userId)
        ? prev.filter((r) => r.userId !== userId)
        : [...prev, { userId, moderator: false }],
    );
  const openedEditor = (index: number) => {
    setEditorBadge(true);
    setBoards((prev) => prev.map((b, i) => (i === index ? { ...b, touched: true } : b)));
  };

  const controlsSummary = useMemo(() => {
    const label = (v: ControlState | undefined) =>
      v === "hide" ? "hidden" : v === "show" ? "shown" : "platform";
    const overrides = Object.keys(controlOverridesOf(controls)).length;
    return `Hands ${label(controls["table.hands_view"])} · Undo ${label(
      controls["table.undo"],
    )} · ${overrides} override${overrides === 1 ? "" : "s"}`;
  }, [controls]);

  const moderatorCount = 1 + invited.filter((i) => i.moderator).length;
  const seatsUsed = [...new Set(boards.map((b) => b.humanSeat))];
  const formatInfo = FORMAT_OPTIONS.find((f) => f.key === format)!;
  const scoringInfo = SCORING_OPTIONS.find((s) => s.key === scoring)!;
  const standingsInfo = STANDINGS_OPTIONS.find((s) => s.key === standings)!;
  /** What to CALL the robots in prose — the review used to hard-code "BEN". */
  const engineName = engine === "ben" ? "BEN" : "solver";

  // A bidding-only board is never scored against the field, so the scoring
  // question is not asked at all — an inert control the creator cannot act on
  // is exactly the clutter this wizard has been trimmed of twice.
  const biddingOnly = format === "bidding-only";
  /** What every summary strip names: the scoring mode, or the format. */
  const unitLabel = biddingOnly ? formatInfo.label : scoringInfo.label;

  // Nothing but boards and invites is actually required: an unnamed challenge
  // takes a name that describes it, so Quick create can be two taps and the
  // wizard never blocks on a text field (owner, 2026-08-08).
  const autoTitle = `${boards.length}-board ${unitLabel}`;
  const named = title.trim().length > 0;
  const effectiveTitle = named ? title.trim() : autoTitle;

  const draft = (): ChallengeDraft => ({
    title: effectiveTitle,
    description: description.trim(),
    format,
    scoring,
    standingsVisibility: standings,
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      seed: b.seed,
      dealer: b.dealer,
      humanSeat: b.humanSeat,
      vul: b.vul,
      ...(b.edited ? { pack: serializePack(b.hands) } : {}),
    })),
    controlOverrides: controlOverridesOf(controls),
    invites: invited,
    engine,
    editorBadge,
  });

  const create = () => {
    const payload = draft();
    const errors = validateDraft(payload);
    if (errors.length) {
      setError(errors[0]!);
      goStep("review");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // The parked entry rides along so publishing PROMOTES it rather than
        // leaving a stale draft beside the challenge it became.
        await createChallengeAction(payload, entryId ?? undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the challenge");
        goStep("review");
      }
    });
  };

  /**
   * Park it. Deliberately no validation: a draft is unfinished by definition,
   * and refusing to save one for want of a title is the opposite of the point.
   * The returned id is held so a second save updates the same row.
   */
  const [entryId, setEntryId] = useState<string | null>(draftEntryId ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveDraft = () => {
    setError(null);
    startTransition(async () => {
      try {
        const id = await saveChallengeDraftAction(draft(), entryId ?? undefined);
        setEntryId(id);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the draft");
      }
    });
  };

  const createLabel = pending ? "Creating…" : "Create challenge";

  return (
    <div className="flex min-h-0 flex-col lg:flex-row lg:gap-6">
      <div className="min-w-0 flex-1">
        {/* ── sticky phone header: identity + jump chips ── */}
        <div className="sticky top-0 z-10 -mx-3 border-b border-neutral-200 bg-[var(--paper)] px-3 pb-2 pt-1 md:-mx-8 md:px-8">
          <div className="flex items-center gap-2 py-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-sm font-extrabold text-white">
              +
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] font-extrabold leading-tight text-neutral-900">
                Create challenge
              </h1>
              <p className="text-[11px] text-neutral-500">
                Same boards · your seat · {engine === "ben" ? "BEN" : "solver"} robots
              </p>
            </div>
          </div>
          {advancedOpen && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {steps.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => goStep(s.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  step === s.key
                    ? "border-emerald-700 bg-emerald-700 font-extrabold text-white"
                    : "border-neutral-300 bg-white font-semibold text-neutral-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          )}
        </div>

        {/* ── Quick create ──
            Two decisions — how many boards, who's in — and everything else
            takes the default the advanced form would have given it. This is
            the whole page until Advanced settings is opened, and the same state
            backs both, so anything picked here is still picked over there. */}
        {!advancedOpen && (
        <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-extrabold text-emerald-900">Quick create</h2>
            <span className="flex-1" />
            {/* The only way into the long form, and it is a capability: a
                program that wants challenges made in two taps turns
                challenge.advanced off and this disappears entirely. */}
            {canAdvanced && !advancedOpen && (
              <button
                type="button"
                onClick={() => goStep("basics")}
                className="text-[11.5px] font-semibold text-emerald-800 underline-offset-2 hover:underline"
              >
                Advanced settings →
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-emerald-900/80">
            Pick the boards and who is in. Everything else takes its default.
          </p>

          <Label className="mt-3.5 text-emerald-900/70">Boards</Label>
          <BoardCountPicker count={boards.length} onCount={setBoardCount} />

          <Label className="mt-3.5 text-emerald-900/70">Who is in</Label>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-bold text-white">
              {self.name} · you
            </span>
            {quickPeople.map((person) => {
              const on = invitedIds.has(person.userId);
              return (
                <button
                  key={person.userId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleInvite(person.userId)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] ${
                    on
                      ? "border-emerald-700 bg-emerald-700 font-bold text-white"
                      : "border-emerald-300 bg-white font-semibold text-emerald-900"
                  }`}
                >
                  {on ? "✓ " : "+ "}
                  {person.name}
                </button>
              );
            })}
            {people.length === 0 && (
              <span className="text-[12px] text-emerald-900/70">
                Nobody else is visible to you yet — create it solo and invite
                later.
              </span>
            )}
          </div>
          {people.length > quickPeople.length && (
            <button
              type="button"
              onClick={() => goStep("invites")}
              className="mt-2 text-[11.5px] font-semibold text-emerald-800 underline-offset-2 hover:underline"
            >
              Search the other {people.length - quickPeople.length} players ↓
            </button>
          )}

          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="mt-3.5 h-[46px] w-full rounded-lg bg-emerald-700 text-[15px] font-extrabold text-white disabled:bg-neutral-300 disabled:text-neutral-500"
          >
            {createLabel}
          </button>
          {/* PARK IT. The wizard's draft lives in React state, so before this
              the only ways out were publish or lose it — and a challenge is a
              pack per board, seats, invites and overrides. It sits under Create
              rather than beside it: publishing is the thing you came to do, and
              saving is the way out that used not to exist. */}
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending}
            className="mt-2 h-[38px] w-full rounded-lg border border-emerald-700/30 text-[13px] font-semibold text-emerald-900 disabled:text-neutral-400"
          >
            {savedAt ? `Saved to library · ${savedAt}` : "Save draft to library"}
          </button>
          <p className="mt-1.5 text-center text-[11.5px] leading-snug text-emerald-900/70">
            {boards.length} boards · {1 + invited.length} player
            {invited.length === 0 ? "" : "s"} · {unitLabel} · random deals
            {named ? "" : ` · named “${autoTitle}”`}
          </p>
        </section>
        )}

        {/* ── 01 · Basics ── */}
        <Section refFn={sectionRef("basics")} num="01" title="Basics" active={advancedOpen && step === "basics"}>
          <p className="mb-4 text-[12.5px] leading-relaxed text-neutral-600">
            Name it, pick how it scores, and how many boards.
          </p>

          <Label>Title</Label>
          <input
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={autoTitle}
            className="h-[42px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] font-semibold text-neutral-900"
          />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            {named
              ? "Players see this at the top of the challenge."
              : `Optional — left blank it is called “${autoTitle}.”`}
          </p>

          <Label className="mt-4">Description</Label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line players see before joining"
            className="h-10 w-full rounded-lg border border-neutral-300 px-3 text-[13.5px] text-neutral-700"
          />

          <Label className="mt-4">What a board asks</Label>
          <div className="flex gap-1.5">
            {FORMAT_OPTIONS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={format === f.key}
                onClick={() => setFormat(f.key)}
                className={`h-11 flex-1 rounded-lg border px-1.5 text-[13px] ${
                  format === f.key
                    ? "border-emerald-700 bg-emerald-700 font-extrabold text-white"
                    : "border-neutral-300 bg-white font-semibold text-neutral-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Note>{formatInfo.note}</Note>

          {/* ── who the robots are ──
              Gated by challenge.advanced.engine: a program that keeps the robot
              choice to admins simply hides the row, and every challenge seats
              the default solver. */}
          {advancedSections.engine && (
          <>
          {/* ── who the robots are ──
              ALWAYS SHOWN, even where BEN cannot be reached. Hiding it there
              was the first cut and it was wrong: a creator looking for the
              choice found nothing at all and no explanation, which reads as a
              missing feature rather than an unavailable option. So the row
              stays, BEN is disabled, and the note says why.

              Whatever is chosen is STAMPED on the challenge, so everyone
              entering meets the same opponents however long the contest runs. */}
          <Label className="mt-4">Robot players</Label>
          <div className="flex gap-1.5">
            {ENGINE_OPTIONS.map((e) => {
              const off = e.key === "ben" && !benOffered;
              return (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={engine === e.key}
                  disabled={off}
                  title={off ? "BEN is not configured on this server" : undefined}
                  onClick={() => setEngine(e.key)}
                  className={`h-11 flex-1 rounded-lg border px-1.5 text-[13px] ${
                    engine === e.key
                      ? "border-emerald-700 bg-emerald-700 font-extrabold text-white"
                      : off
                        ? "border-neutral-200 bg-neutral-50 font-semibold text-neutral-400"
                        : "border-neutral-300 bg-white font-semibold text-neutral-600"
                  }`}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
          <Note>
            {benOffered
              ? (ENGINE_OPTIONS.find((e) => e.key === engine)?.blurb ?? "")
              : "BEN is not configured on this server (BEN_ENDPOINT), so every challenge is played against the solver."}
          </Note>
          </>
          )}

          {/* Scoring is a question about a FIELD of played boards. A
              bidding-only challenge has none, so it is not asked — the tally
              is "matched BEN's contract on N of M boards" and nothing else. */}
          {!biddingOnly && (
            <>
              <Label className="mt-4">Scoring</Label>
              <div className="flex gap-1.5">
                {SCORING_OPTIONS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setScoring(s.key)}
                    className={`h-11 flex-1 rounded-lg border px-1.5 text-[13px] ${
                      scoring === s.key
                        ? "border-emerald-700 bg-emerald-700 font-extrabold text-white"
                        : "border-neutral-300 bg-white font-semibold text-neutral-600"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Note>{scoringInfo.note}</Note>
            </>
          )}

          <Label className="mt-4">Boards</Label>
          <BoardCountPicker count={boards.length} onCount={setBoardCount} />
          <p className="mt-2 text-[11px] text-neutral-500">
            {MIN_BOARDS}–{MAX_BOARDS} boards. Vulnerability follows the standard
            board cycle; dealer and your seat are per-board on the next step.
          </p>

          <Label className="mt-4">Standings visibility</Label>
          <div className="flex gap-1.5">
            {STANDINGS_OPTIONS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setStandings(v.key)}
                className={`min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-left ${
                  standings === v.key
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-neutral-300 bg-white"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      standings === v.key ? "bg-emerald-700" : "bg-neutral-300"
                    }`}
                  />
                  <span
                    className={`text-[13px] leading-tight ${
                      standings === v.key
                        ? "font-extrabold text-emerald-900"
                        : "font-semibold text-neutral-700"
                    }`}
                  >
                    {v.label}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-neutral-500">
                  {v.sub}
                </span>
              </button>
            ))}
          </div>
          <Note>{standingsInfo.note}</Note>

          <p className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-neutral-500">
            Boards, seats and control overrides stay editable until the{" "}
            <b className="text-neutral-700">first player starts a board</b> — then
            they lock. Invites can be added any time.
          </p>
        </Section>

        {/* ── 02 · Boards ── */}
        <Section
          refFn={sectionRef("boards")}
          active={advancedOpen && step === "boards"}
          num="02"
          title="Boards"
          aside={`${boards.length} boards`}
        >
          <p className="mb-3 text-[12.5px] leading-relaxed text-neutral-600">
            Each board is a random deal. Re-roll for a new one, paste a BBO hand
            link, or open the pack editor to set the cards by hand.
          </p>

          <div className="mb-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <Label className="text-neutral-500">From BBO</Label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={2}
              placeholder="Paste Hand Viewer links, one per line"
              aria-label="BBO hand links"
              className="w-full resize-y rounded-lg border border-neutral-300 px-2.5 py-2 text-[12px] text-neutral-900"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyImport("add")}
                disabled={!importText.trim()}
                className="h-9 rounded-lg bg-neutral-800 px-3.5 text-[12px] font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-400"
              >
                Add boards
              </button>
              <button
                type="button"
                onClick={() => applyImport("replace")}
                disabled={!importText.trim()}
                className="h-9 rounded-lg border border-neutral-300 bg-white px-3.5 text-[12px] font-bold text-neutral-700 disabled:text-neutral-300"
              >
                Replace all
              </button>
            </div>
            {importError && (
              <p className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-invalid">
                {importError}
              </p>
            )}
            {!importError && importInfo && (
              <p className="mt-2 text-[11.5px] text-emerald-800">{importInfo}</p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              An imported board keeps its own dealer and vulnerability. The
              auction and play in the link are ignored — you bid it yourself.
            </p>
          </div>
          {editorBadge && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-draft">
              <b>Editor badge will apply.</b> You chose these hands — a pack
              editor opened, or a deal imported — so your leaderboard row will
              show <b>“set the boards.”</b> This can’t be undone.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {boards.map((board, i) => (
              <BoardCard
                key={board.boardNo}
                board={board}
                onChange={(patch) => patchBoard(i, patch)}
                onReroll={() => rerollBoard(i)}
                onOpenEditor={() => openedEditor(i)}
              />
            ))}
          </div>
        </Section>

        {/* ── 03 · Table controls ── */}
        <Section refFn={sectionRef("controls")} num="03" title="Table controls" active={advancedOpen && step === "controls"}>
          <p className="mb-3.5 text-[12.5px] leading-relaxed text-neutral-600">
            Override the access catalogue for this challenge — in both
            directions. <b>Undo</b> and <b>show-all-hands</b> are off by default:
            this is scored play.
          </p>
          <div className="flex flex-col gap-2">
            {CHALLENGE_CONTROLS.map((control) => {
              const current = controls[control.key] ?? "default";
              return (
                <div
                  key={control.key}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-neutral-800">
                        {control.label}
                      </div>
                      <div className="text-[11px] text-neutral-500">{control.sub}</div>
                    </div>
                    <div className="flex shrink-0 gap-0.5 rounded-lg bg-neutral-100 p-0.5">
                      {CONTROL_STATES.map((state) => {
                        const active = current === state.key;
                        return (
                          <button
                            key={state.key}
                            type="button"
                            onClick={() =>
                              setControls((prev) => ({ ...prev, [control.key]: state.key }))
                            }
                            className={`rounded-md px-2.5 py-1.5 text-[11px] ${
                              active
                                ? state.key === "show"
                                  ? "bg-approved font-extrabold text-white"
                                  : state.key === "hide"
                                    ? "bg-invalid font-extrabold text-white"
                                    : "bg-emerald-700 font-extrabold text-white"
                                : "font-semibold text-neutral-500"
                            }`}
                          >
                            {state.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {control.note && (
                    <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-draft">
                      {control.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11.5px] text-neutral-500">{controlsSummary}</p>
        </Section>

        {/* ── 04 · Invites ── */}
        <Section refFn={sectionRef("invites")} num="04" title="Invites" active={advancedOpen && step === "invites"}>
          <p className="mb-3 text-[12.5px] leading-relaxed text-neutral-600">
            Invitees stay <b>pending</b> until they accept. Moderators see the
            standings and every board as it happens.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players by name"
            className="mb-2.5 h-[42px] w-full rounded-lg border border-neutral-300 px-3 text-[13.5px] text-neutral-900"
          />
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            {trimmedQuery ? "Results" : "Suggested"}
          </p>
          <div className="mb-4 flex flex-col gap-1.5">
            {matches.map((person) => {
              const already = invitedIds.has(person.userId);
              return (
                <div
                  key={person.userId}
                  className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-2"
                >
                  <Avatar name={person.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-neutral-800">
                      {person.name}
                    </div>
                    {person.handle && (
                      <div className="truncate text-[11px] text-neutral-500">
                        {person.handle}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() =>
                      setInvited((prev) => [...prev, { userId: person.userId, moderator: false }])
                    }
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                      already
                        ? "border border-neutral-300 bg-neutral-100 text-neutral-400"
                        : "bg-emerald-700 text-white"
                    }`}
                  >
                    {already ? "Invited" : "Invite"}
                  </button>
                </div>
              );
            })}
            {matches.length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-3.5 text-center text-[12px] text-neutral-500">
                {trimmedQuery
                  ? `No players match “${query.trim()}.”`
                  : "Nobody else is visible to you here yet."}
              </p>
            )}
          </div>

          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Invited
            </span>
            <span className="text-[11px] text-neutral-500">
              1 creator · {invited.length} pending
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <InviteRow
              name={self.name}
              handle="you · creator"
              chip="accepted"
              moderator
              locked
              note="Creators are always moderators."
            />
            {invited.map((row) => {
              const person = peopleById.get(row.userId);
              return (
                <InviteRow
                  key={row.userId}
                  name={person?.name ?? row.userId}
                  handle={person?.handle}
                  chip="pending"
                  moderator={row.moderator}
                  note={row.moderator ? "Sees standings and every board early." : ""}
                  onModerator={(next) =>
                    setInvited((prev) =>
                      prev.map((r) =>
                        r.userId === row.userId ? { ...r, moderator: next } : r,
                      ),
                    )
                  }
                  onRemove={() =>
                    setInvited((prev) => prev.filter((r) => r.userId !== row.userId))
                  }
                />
              );
            })}
          </div>
          <p className="mt-2.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-900">
            <b>
              {moderatorCount} moderator{moderatorCount === 1 ? "" : "s"}
            </b>{" "}
            — moderators can see the standings and every board as it happens,
            whatever the standings setting says.
          </p>
          <p className="mt-2.5 text-[11px] leading-relaxed text-neutral-500">
            You are auto-invited as the creator. Nobody is charged an attempt
            until they start a board.
          </p>
        </Section>

        {/* ── 05 · Review ── */}
        <Section refFn={sectionRef("review")} num="05" title="Review & create" active={advancedOpen && step === "review"}>
          <p className="mb-3.5 text-[12.5px] leading-relaxed text-neutral-600">
            {biddingOnly
              ? "BEN bids every board silently after you create — that auction is the one yours is set beside. It needs no card play, so it is quick."
              : "A silent full-BEN baseline is computed for every board after you create."}
          </p>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-invalid">
              {error}
            </p>
          )}
          <dl className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <ReviewLine
              k="Title"
              v={named ? effectiveTitle : `${effectiveTitle} — auto-named`}
            />
            <ReviewLine k="Format" v={formatInfo.review} />
            <ReviewLine
              k="Scoring"
              v={
                biddingOnly
                  ? `Matched the ${engineName}'s contract, board by board — no field scoring`
                  : scoringInfo.full
              }
            />
            <ReviewLine k="Standings" v={standingsInfo.review} />
            <ReviewLine
              k="Boards"
              v={`${boards.length} · ${boards.filter((b) => b.edited).length} hand-set`}
            />
            <ReviewLine
              k="Your seat"
              v={
                seatsUsed.length === 1 && seatsUsed[0]
                  ? `${SEAT_NAME[seatsUsed[0]]} on every board`
                  : `Mixed (${seatsUsed.join(", ")})`
              }
            />
            {advancedSections.controls && <ReviewLine k="Controls" v={controlsSummary} />}
            <ReviewLine
              k="Opponents"
              v={
                biddingOnly
                  ? `3 ${engineName} robots · its own auction is the reference`
                  : `3 ${engineName} robots per seat · silent baseline`
              }
            />
            <ReviewLine k="Invites" v={`You + ${invited.length} pending`} />
            <ReviewLine
              k="Moderators"
              v={`${moderatorCount} · you${
                moderatorCount > 1 ? ` + ${moderatorCount - 1} more` : " only"
              }`}
            />
            <ReviewLine
              k="Editor badge"
              v={
                editorBadge
                  ? "Applied — you chose the hands, so your row shows “set the boards.”"
                  : "Not set — every board is a deal you have not seen."
              }
              warn={editorBadge}
              last
            />
          </dl>
          <p className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-neutral-500">
            {biddingOnly ? (
              <>
                One attempt, resume-only — the contract you reach first is your
                result forever. BEN is the reference, not a rival: a different
                contract is a difference, not a mistake.
              </>
            ) : (
              <>
                One attempt, resume-only — first completion is scored forever.
                After finishing, a practice replay opens an unscored copy. BEN
                is the unranked benchmark line; it never enters the field math.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="mt-3.5 h-[46px] w-full rounded-lg bg-emerald-700 text-[15px] font-extrabold text-white disabled:bg-neutral-300 disabled:text-neutral-500"
          >
            {createLabel}
          </button>
          <p className="mt-1.5 text-center text-[12px] text-neutral-500">
            Locks when the first player starts a board
          </p>
        </Section>

        {/* ── sticky create bar (phone) ── */}
        {/* ── paging the advanced form ──
            One step is mounted at a time, so there has to be a way forward and
            back that is not the chips: the chips are a jump table, this is the
            path through. The last step has no Next — Review carries Create. */}
        {advancedOpen && (
          <div className="mt-2 flex items-center gap-2 border-t border-neutral-200 pt-3">
            <button
              type="button"
              onClick={() => (prevStep ? goStep(prevStep.key) : setAdvancedOpen(false))}
              className="h-10 rounded-lg border border-neutral-300 px-4 text-[13px] font-semibold text-neutral-700 hover:border-neutral-400"
            >
              ← {prevStep ? prevStep.label : "Quick create"}
            </button>
            <span className="flex-1 text-center text-[11.5px] text-neutral-500">
              Step {stepAt + 1} of {steps.length}
            </span>
            {nextStep ? (
              <button
                type="button"
                onClick={() => goStep(nextStep.key)}
                className="h-10 rounded-lg bg-emerald-700 px-4 text-[13px] font-extrabold text-white"
              >
                {nextStep.label} →
              </button>
            ) : (
              <span className="w-[96px]" />
            )}
          </div>
        )}
        {/* Parking work is MORE useful here than on Quick create — the long
            form is where there is something worth parking — and the button
            lived only on Quick create, which no longer renders once this is
            open. Available from every step, since you park when you run out of
            time, not when you reach a particular one. */}
        {advancedOpen && (
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending}
            className="mt-2 h-[38px] w-full rounded-lg border border-emerald-700/30 text-[13px] font-semibold text-emerald-900 disabled:text-neutral-400"
          >
            {savedAt ? `Saved to library · ${savedAt}` : "Save draft to library"}
          </button>
        )}

        <div className="sticky bottom-0 -mx-3 flex items-center gap-2.5 border-t border-neutral-200 bg-[var(--paper)] px-3 py-2 md:-mx-8 md:px-8 lg:hidden">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-bold text-neutral-800">
              {effectiveTitle}
            </div>
            <div className="truncate text-[11px] text-neutral-500">
              {boards.length} boards · {unitLabel} · {1 + invited.length} players
            </div>
          </div>
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="h-11 shrink-0 rounded-lg bg-emerald-700 px-5 text-sm font-extrabold text-white disabled:bg-neutral-300 disabled:text-neutral-500"
          >
            {createLabel}
          </button>
        </div>
      </div>

      {/* ── the canvas's draft rail, as a wide-screen aside ── */}
      <aside className="hidden w-[252px] shrink-0 lg:block">
        <div className="sticky top-4 rounded-xl border border-neutral-200 bg-white p-3.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Draft
          </p>
          <SummaryLine k="Boards" v={String(boards.length)} />
          <SummaryLine k="Format" v={formatInfo.label} />
          <SummaryLine
            k="Scoring"
            v={biddingOnly ? `vs ${engineName}` : scoringInfo.label}
          />
          <SummaryLine k="Robots" v={engineName} />
          <SummaryLine k="Invited" v={`1 + ${invited.length}`} />
          <SummaryLine
            k="Editor badge"
            v={editorBadge ? "will apply" : "clear"}
            warn={editorBadge}
          />
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className="mt-3 h-10 w-full rounded-lg bg-emerald-700 text-sm font-extrabold text-white disabled:bg-neutral-300 disabled:text-neutral-500"
          >
            {createLabel}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-neutral-500">
            Locks on first play
          </p>
        </div>
      </aside>
    </div>
  );
}

// ── small presentational pieces ─────────────────────────────────────────────

/**
 * One page of the advanced form. The steps used to stack on a single scroll,
 * which made the wizard a very long page; now exactly one is mounted, and the
 * chips plus the Back/Next footer move between them.
 */
function Section({
  refFn,
  num,
  title,
  aside,
  active,
  children,
}: Readonly<{
  refFn: (el: HTMLElement | null) => void;
  num: string;
  title: string;
  aside?: string;
  active: boolean;
  children: React.ReactNode;
}>) {
  if (!active) return null;
  return (
    <section ref={refFn} className="scroll-mt-24 py-4">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[11px] font-extrabold tracking-[0.08em] text-emerald-700">
          {num}
        </span>
        <h2 className="text-lg font-extrabold text-neutral-900">{title}</h2>
        {aside && (
          <>
            <span className="flex-1" />
            <span className="text-xs text-neutral-500">{aside}</span>
          </>
        )}
      </div>
      {children}
    </section>
  );
}

/** The board count, as a stepper plus the common sizes. Quick create and the
 *  Basics step drive the same state through it. */
function BoardCountPicker({
  count,
  onCount,
}: Readonly<{ count: number; onCount: (next: number) => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300 bg-white">
        <button
          type="button"
          onClick={() => onCount(count - 1)}
          disabled={count <= MIN_BOARDS}
          aria-label="One board fewer"
          className="h-11 w-11 bg-neutral-50 text-xl font-bold text-neutral-700 disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[52px] text-center text-xl font-extrabold text-neutral-900">
          {count}
        </span>
        <button
          type="button"
          onClick={() => onCount(count + 1)}
          disabled={count >= MAX_BOARDS}
          aria-label="One board more"
          className="h-11 w-11 bg-neutral-50 text-xl font-bold text-neutral-700 disabled:opacity-40"
        >
          +
        </button>
      </div>
      <div className="flex gap-1.5">
        {BOARD_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onCount(n)}
            className={`h-9 w-9 rounded-lg border text-[13px] font-bold ${
              count === n
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-neutral-300 bg-white text-neutral-600"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Label({
  children,
  className = "",
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <span
      className={`mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500 ${className}`}
    >
      {children}
    </span>
  );
}

function Note({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[12px] leading-relaxed text-emerald-900">
      {children}
    </p>
  );
}

function Avatar({ name }: Readonly<{ name: string }>) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[12px] font-extrabold text-emerald-800">
      {initials || "?"}
    </span>
  );
}

function InviteRow({
  name,
  handle,
  chip,
  moderator,
  locked,
  note,
  onModerator,
  onRemove,
}: Readonly<{
  name: string;
  handle?: string;
  chip: "accepted" | "pending";
  moderator: boolean;
  locked?: boolean;
  note?: string;
  onModerator?: (next: boolean) => void;
  onRemove?: () => void;
}>) {
  return (
    <div
      className={`rounded-lg border ${
        locked ? "border-emerald-200 bg-emerald-50/50" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-neutral-800">{name}</div>
          {handle && <div className="truncate text-[11px] text-neutral-500">{handle}</div>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
            chip === "accepted" ? "bg-emerald-100 text-approved" : "bg-amber-50 text-draft"
          }`}
        >
          {chip}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove invite"
            aria-label={`Remove ${name}`}
            className="h-6 w-6 shrink-0 rounded-full bg-neutral-100 text-neutral-500 hover:text-invalid"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pb-2 pl-12 pr-2.5">
        <label
          className={`flex shrink-0 items-center gap-1.5 text-[11.5px] font-bold ${
            moderator ? "text-emerald-800" : "text-neutral-500"
          } ${locked ? "cursor-default" : "cursor-pointer"}`}
          title={locked ? "The creator is always a moderator" : `Let ${name} moderate`}
        >
          <input
            type="checkbox"
            checked={moderator}
            disabled={locked}
            onChange={(e) => onModerator?.(e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-700"
          />
          Moderator
        </label>
        {note && <span className="min-w-0 flex-1 text-[11px] text-neutral-400">{note}</span>}
      </div>
    </div>
  );
}

function ReviewLine({
  k,
  v,
  bad,
  warn,
  last,
}: Readonly<{ k: string; v: string; bad?: boolean; warn?: boolean; last?: boolean }>) {
  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-2.5 ${
        last ? "" : "border-b border-neutral-100"
      } ${warn ? "bg-amber-50" : ""}`}
    >
      <dt className="w-24 shrink-0 text-[11px] uppercase tracking-[0.04em] text-neutral-400">
        {k}
      </dt>
      <dd
        className={`flex-1 text-[13px] font-semibold leading-snug ${
          bad ? "text-invalid" : warn ? "text-draft" : "text-neutral-900"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

function SummaryLine({
  k,
  v,
  warn,
}: Readonly<{ k: string; v: string; warn?: boolean }>) {
  return (
    <div className="flex justify-between gap-2.5 text-[12px] leading-relaxed">
      <span className="text-neutral-500">{k}</span>
      <span className={`text-right font-semibold ${warn ? "text-draft" : "text-neutral-900"}`}>
        {v}
      </span>
    </div>
  );
}
