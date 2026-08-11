"use client";

// ChallengeCreator — the platform's create-challenge wizard as a portable
// component (ported from apps/bridge-web/app/bridge/challenges/new).
//
// ONE SCROLLING FORM with a sticky jump-chip header, exactly as the canvas has
// it. Four steps, not five: the platform's `04 · Invites` is GONE and the rest
// are renumbered. There is nobody to invite — a challenge authored into a
// tutorial is played by one learner against BEN — so the whole apparatus of
// invites, moderators and standings visibility went with it. An inert control
// the author cannot act on is exactly the clutter this wizard has been trimmed
// of twice.
//
// THE ONLY SERVER TIE IS GONE TOO. The platform wizard ends in
// `createChallengeAction`; this one ends in `onCreate(draft)` and the host
// decides what a draft means — store it as a tutorial block, hand it straight
// to <ChallengePlayer/>, or both. Everything else the wizard imports was
// already pure.

import { seededDeal } from "@bridge/engine";
import { standardDealer, standardVul, type ChallengeFormat, type ChallengeScoring } from "@bridge/challenges";
import { parseBbo } from "@bridge/formats";
import type { Card, Seat } from "@bridge/events";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChallengeBoardCard, type BoardDraftState } from "./ChallengeBoardCard";
import {
  CHALLENGE_CONTROLS,
  CONTROL_STATES,
  controlOverridesOf,
  defaultControlStates,
  FORMAT_OPTIONS,
  MAX_BOARDS,
  MIN_BOARDS,
  normalizeDraft,
  packFromDraft,
  SCORING_OPTIONS,
  validateDraft,
  type ChallengeDraftInput,
  type ControlState,
  type SoloChallengeDraft,
} from "./challengeDraft";
import { serializeHand } from "./dealText";
import {
  ACCENT,
  Chip,
  ErrorLine,
  INK,
  INK_FAINT,
  INK_MUTED,
  Label,
  LINE,
  Note,
  PAPER,
  PrimaryButton,
  ReviewLine,
  Section,
  Segmented,
  SHELL,
  SURFACE,
  Warn,
  inputStyle,
} from "./challengeUi";

const STEPS = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Controls", num: "03" },
  { key: "review", label: "Review", num: "04" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };
const DEFAULT_BOARDS = 4;
const BOARD_PRESETS = [2, 4, 6, 8];

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
    edited: false,
  };
}

/** The board's pack in the ♠.♥.♦.♣ serialization, per seat. */
function serializePack(hands: Record<Seat, Card[]>): Record<Seat, string> {
  const out = {} as Record<Seat, string>;
  for (const seat of ["N", "E", "S", "W"] as Seat[]) out[seat] = serializeHand(hands[seat]);
  return out;
}

/**
 * A stored draft read back into board state, so re-opening the wizard resumes
 * rather than re-deals. A pack that will not parse is not half-adopted: the
 * board falls back to its seed, which is the deal the pack was edited from.
 */
function boardsFromDraft(draft: SoloChallengeDraft | undefined): BoardDraftState[] | null {
  if (!draft?.boards?.length) return null;
  return draft.boards.map((b, i) => {
    let hands = seededDeal(b.seed);
    let edited = false;
    if (b.pack) {
      const parsed = packFromDraft(b.pack);
      if (!("error" in parsed)) {
        hands = parsed.hands;
        edited = true;
      }
    }
    return {
      boardNo: i + 1,
      seed: b.seed,
      dealer: b.dealer,
      humanSeat: b.humanSeat,
      vul: b.vul ?? standardVul(i + 1),
      hands,
      edited,
    };
  });
}

export interface ChallengeCreatorProps {
  /**
   * A draft to re-open — everything the author had, as the wizard produced it
   * or as a host stored it. Absent, the wizard starts from fresh random deals.
   */
  draft?: ChallengeDraftInput;
  /**
   * Where a finished draft goes. Called on every Create press; the host stores
   * it, plays it, or both. This is the only outward edge the wizard has.
   */
  onCreate: (draft: SoloChallengeDraft) => void;
  /** The Create button's word. Defaults to "Create challenge". */
  createLabel?: string;
  /**
   * Fires on EVERY change, not only on Create — for a host whose editor saves
   * continuously and has no Create button of its own.
   */
  onChange?: (draft: SoloChallengeDraft) => void;
  /** Seed the first set of deals derive from. Given, the first render is
   *  reproducible; absent, a random one is chosen on mount. */
  seedBase?: number;
}

export function ChallengeCreator({
  draft: stored,
  onCreate,
  onChange,
  createLabel = "Create challenge",
  seedBase,
}: Readonly<ChallengeCreatorProps>) {
  // Normalised ONCE, on mount: the wizard owns its state from then on, so a
  // host that saves as you type cannot feed its own echo back in mid-edit.
  const initial = useRef(normalizeDraft(stored) ?? undefined).current;
  const base = useRef(seedBase ?? freshSeed());
  const [step, setStep] = useState<StepKey>("basics");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [format, setFormat] = useState<ChallengeFormat>(
    initial?.format === "bidding-only" ? "bidding-only" : "full",
  );
  const [scoring, setScoring] = useState<ChallengeScoring>(initial?.scoring ?? "imps");
  const [boards, setBoards] = useState<BoardDraftState[]>(
    () =>
      boardsFromDraft(initial) ??
      Array.from({ length: DEFAULT_BOARDS }, (_, i) => makeBoard(seedFor(base.current, i + 1), i + 1)),
  );
  const [controls, setControls] = useState<Record<string, ControlState>>(() => {
    const start = defaultControlStates();
    for (const [key, value] of Object.entries(initial?.controlOverrides ?? {})) start[key] = value;
    return start;
  });
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sections = useRef<Partial<Record<StepKey, HTMLElement | null>>>({});
  const goStep = (key: StepKey) => {
    setStep(key);
    sections.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const sectionRef = (key: StepKey) => (el: HTMLElement | null) => {
    sections.current[key] = el;
  };

  const setBoardCount = (next: number) => {
    const n = Math.max(MIN_BOARDS, Math.min(MAX_BOARDS, Math.round(next)));
    setBoards((prev) =>
      Array.from({ length: n }, (_, i) => prev[i] ?? makeBoard(seedFor(base.current, i + 1), i + 1)),
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
          edited: true,
        });
    }
    return out;
  };

  const applyImport = (mode: "add" | "replace") => {
    const imported = readImport();
    if (!imported) return;
    const room = MAX_BOARDS - (mode === "replace" ? 0 : boards.length);
    setBoards((prev) => {
      const kept = mode === "replace" ? [] : prev;
      return [...kept, ...imported].slice(0, MAX_BOARDS).map((board, i) => ({ ...board, boardNo: i + 1 }));
    });
    setImportError(null);
    setImportText("");
    const used = Math.min(imported.length, Math.max(0, room));
    setImportInfo(
      used < imported.length
        ? `Took ${used} of ${imported.length} — a challenge holds ${MAX_BOARDS} boards.`
        : `${used} board${used === 1 ? "" : "s"} from BBO.`,
    );
  };

  const controlsSummary = useMemo(() => {
    const label = (v: ControlState | undefined) =>
      v === "hide" ? "hidden" : v === "show" ? "shown" : "platform";
    const overrides = Object.keys(controlOverridesOf(controls)).length;
    return `Hands ${label(controls["table.hands_view"])} · Undo ${label(
      controls["table.undo"],
    )} · ${overrides} override${overrides === 1 ? "" : "s"}`;
  }, [controls]);

  const seatsUsed = [...new Set(boards.map((b) => b.humanSeat))];
  const formatInfo = FORMAT_OPTIONS.find((f) => f.key === format)!;
  const scoringInfo = SCORING_OPTIONS.find((s) => s.key === scoring)!;

  // A bidding-only board is never played out, so the scoring question is not
  // asked at all — its tally is "matched BEN's contract on N of M boards".
  const biddingOnly = format === "bidding-only";
  const unitLabel = biddingOnly ? formatInfo.label : scoringInfo.label;

  // Nothing is actually required: an unnamed challenge takes a name that
  // describes it, so the wizard never blocks on a text field.
  const autoTitle = `${boards.length}-board ${unitLabel}`;
  const named = title.trim().length > 0;
  const effectiveTitle = named ? title.trim() : autoTitle;

  const build = (): SoloChallengeDraft => ({
    title: effectiveTitle,
    description: description.trim(),
    format,
    scoring,
    boards: boards.map((b) => ({
      boardNo: b.boardNo,
      seed: b.seed,
      dealer: b.dealer,
      humanSeat: b.humanSeat,
      vul: b.vul,
      ...(b.edited ? { pack: serializePack(b.hands) } : {}),
    })),
    controlOverrides: controlOverridesOf(controls),
  });

  // THE CONTINUOUS EDGE, for a host whose editor saves as you type rather than
  // on a button. Compared as JSON so a re-render that changed nothing the draft
  // can see — a fold opening, an error clearing — does not fire a save.
  const draftJson = JSON.stringify(build());
  useEffect(() => {
    if (!onChange) return;
    onChange(JSON.parse(draftJson) as SoloChallengeDraft);
    // THE DRAFT IS THE WHOLE DEPENDENCY. `onChange` is deliberately not one:
    // a host that passes an inline arrow would otherwise be saved to on every
    // parent render.
  }, [draftJson]);

  const create = () => {
    const payload = build();
    const errors = validateDraft(payload);
    if (errors.length) {
      setError(errors[0]!);
      goStep("review");
      return;
    }
    setError(null);
    onCreate(payload);
  };

  return (
    <div style={{ ...SHELL, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* ── header: identity + jump chips ──
          DELIBERATELY NOT STICKY. On the platform this wizard owns a page and
          pins its header; embedded it owns a box inside somebody else's
          scroller, where a pinned bar floats over the host's own chrome and
          over the wizard's own content. The jump chips still jump — they call
          scrollIntoView, which works in any scroller. */}
      <div
        style={{
          background: SURFACE,
          borderBottom: `1px solid ${LINE}`,
          paddingBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span
            style={{
              display: "flex",
              width: 24,
              height: 24,
              flex: "none",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              background: ACCENT,
              color: "#fff",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            +
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>Create challenge</div>
            <div style={{ fontSize: 11, color: INK_FAINT }}>
              Your boards · your seat · BEN in the other three
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {STEPS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => goStep(s.key)}
              style={{
                flex: "none",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${step === s.key ? ACCENT : LINE}`,
                background: step === s.key ? ACCENT : SURFACE,
                color: step === s.key ? "#fff" : INK_MUTED,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: step === s.key ? 800 : 600,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 01 · Basics ── */}
      <Section innerRef={sectionRef("basics")} num="01" title="Basics">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: INK_MUTED, lineHeight: 1.5 }}>
          Name it, pick what a board asks for, and how many boards.
        </p>

        <Label>Title</Label>
        <input
          aria-label="Challenge title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={autoTitle}
          style={inputStyle}
        />
        <p style={{ margin: "6px 0 0", fontSize: 11, color: INK_FAINT }}>
          {named
            ? "The learner sees this above the board."
            : `Optional — left blank it is called “${autoTitle}.”`}
        </p>

        <Label style={{ marginTop: 16 }}>Description</Label>
        <input
          aria-label="Challenge description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line the learner sees before starting"
          style={{ ...inputStyle, height: 36, fontSize: 12.5 }}
        />

        <Label style={{ marginTop: 16 }}>What a board asks</Label>
        <Segmented
          ariaLabel="What a board asks"
          options={FORMAT_OPTIONS.map((f) => ({ key: f.key, label: f.label }))}
          value={format}
          onChange={setFormat}
        />
        <Note>{formatInfo.note}</Note>

        {/* Scoring is a question about a PLAYED board. A bidding-only board has
            none, so it is not asked — the tally is "matched BEN's contract on N
            of M boards" and nothing else. */}
        {!biddingOnly && (
          <>
            <Label style={{ marginTop: 16 }}>Scoring</Label>
            <Segmented
              ariaLabel="Scoring"
              options={SCORING_OPTIONS.map((s) => ({ key: s.key, label: s.label }))}
              value={scoring}
              onChange={setScoring}
            />
            <Note>{scoringInfo.note}</Note>
          </>
        )}

        <Label style={{ marginTop: 16 }}>Boards</Label>
        <BoardCountPicker count={boards.length} onCount={setBoardCount} />
        <p style={{ margin: "8px 0 0", fontSize: 11, color: INK_FAINT, lineHeight: 1.5 }}>
          {MIN_BOARDS}–{MAX_BOARDS} boards. Vulnerability follows the standard board cycle; dealer
          and the learner's seat are per-board below.
        </p>
      </Section>

      {/* ── 02 · Boards ── */}
      <Section
        innerRef={sectionRef("boards")}
        num="02"
        title="Boards"
        aside={`${boards.length} board${boards.length === 1 ? "" : "s"}`}
      >
        <p style={{ margin: "0 0 12px", fontSize: 12, color: INK_MUTED, lineHeight: 1.5 }}>
          Each board is a random deal. Re-roll for a new one, paste a BBO hand link, or open the
          pack editor to set the cards by hand.
        </p>

        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            border: `1px solid ${LINE}`,
            background: PAPER,
          }}
        >
          <Label>From BBO</Label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={2}
            placeholder="Paste Hand Viewer links, one per line"
            aria-label="BBO hand links"
            style={{
              ...inputStyle,
              height: "auto",
              padding: 8,
              resize: "vertical",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => applyImport("add")}
              disabled={!importText.trim()}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: 0,
                background: importText.trim() ? "#22302a" : "#e4ebe7",
                color: importText.trim() ? "#fff" : INK_FAINT,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 800,
                cursor: importText.trim() ? "pointer" : "default",
              }}
            >
              Add boards
            </button>
            <button
              type="button"
              onClick={() => applyImport("replace")}
              disabled={!importText.trim()}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: `1px solid ${LINE}`,
                background: SURFACE,
                color: importText.trim() ? INK_MUTED : INK_FAINT,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 800,
                cursor: importText.trim() ? "pointer" : "default",
              }}
            >
              Replace all
            </button>
          </div>
          {importError && <ErrorLine>{importError}</ErrorLine>}
          {!importError && importInfo && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: ACCENT }}>{importInfo}</p>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: INK_FAINT, lineHeight: 1.5 }}>
            An imported board keeps its own dealer and vulnerability. The auction and play in the
            link are ignored — the learner bids it themselves.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
            gap: 10,
          }}
        >
          {boards.map((board, i) => (
            <ChallengeBoardCard
              key={board.boardNo}
              board={board}
              onChange={(patch) => patchBoard(i, patch)}
              onReroll={() => rerollBoard(i)}
            />
          ))}
        </div>
      </Section>

      {/* ── 03 · Table controls ── */}
      <Section innerRef={sectionRef("controls")} num="03" title="Table controls">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: INK_MUTED, lineHeight: 1.5 }}>
          Override the table's own controls for this challenge, in both directions. <b>Undo</b> and{" "}
          <b>show-all-hands</b> are off by default: this is scored play.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CHALLENGE_CONTROLS.map((control) => {
            const current = controls[control.key] ?? "default";
            return (
              <div
                key={control.key}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${LINE}`,
                  background: SURFACE,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{control.label}</div>
                    <div style={{ fontSize: 11, color: INK_FAINT }}>{control.sub}</div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flex: "none",
                      gap: 2,
                      padding: 2,
                      borderRadius: 8,
                      background: "#f1f4f2",
                    }}
                  >
                    {CONTROL_STATES.map((state) => {
                      const active = current === state.key;
                      return (
                        <button
                          key={state.key}
                          type="button"
                          onClick={() =>
                            setControls((prev) => ({ ...prev, [control.key]: state.key }))
                          }
                          style={{
                            padding: "5px 9px",
                            borderRadius: 6,
                            border: 0,
                            background: active
                              ? state.key === "show"
                                ? "#1c8a5a"
                                : state.key === "hide"
                                  ? "#c0392b"
                                  : ACCENT
                              : "transparent",
                            color: active ? "#fff" : INK_FAINT,
                            fontFamily: "inherit",
                            fontSize: 10.5,
                            fontWeight: active ? 800 : 600,
                            cursor: "pointer",
                          }}
                        >
                          {state.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {control.note && <Warn>{control.note}</Warn>}
              </div>
            );
          })}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: INK_FAINT }}>{controlsSummary}</p>
      </Section>

      {/* ── 04 · Review ── */}
      <Section innerRef={sectionRef("review")} num="04" title="Review & create">
        <p style={{ margin: "0 0 12px", fontSize: 12, color: INK_MUTED, lineHeight: 1.5 }}>
          {biddingOnly
            ? "BEN bids every board silently while the learner bids it — that auction is the one theirs is set beside. It needs no card play, so it is quick."
            : "BEN plays every board silently while the learner plays it, and the two results are set side by side."}
        </p>
        {error && <ErrorLine>{error}</ErrorLine>}
        <dl
          style={{
            margin: "0 0 12px",
            overflow: "hidden",
            borderRadius: 10,
            border: `1px solid ${LINE}`,
            background: SURFACE,
          }}
        >
          <ReviewLine k="Title" v={named ? effectiveTitle : `${effectiveTitle} — auto-named`} />
          <ReviewLine k="Format" v={formatInfo.review} />
          <ReviewLine
            k="Scoring"
            v={
              biddingOnly
                ? "Matched BEN's contract, board by board — no play score"
                : scoringInfo.full
            }
          />
          <ReviewLine
            k="Boards"
            v={`${boards.length} · ${boards.filter((b) => b.edited).length} hand-set`}
          />
          <ReviewLine
            k="The seat"
            v={
              seatsUsed.length === 1 && seatsUsed[0]
                ? `${SEAT_NAME[seatsUsed[0]]} on every board`
                : `Mixed (${seatsUsed.join(", ")})`
            }
          />
          <ReviewLine k="Controls" v={controlsSummary} />
          <ReviewLine
            k="Opponents"
            v={
              biddingOnly
                ? "3 BEN robots · BEN's own auction is the reference"
                : "3 BEN robots · a silent BEN line is the reference"
            }
            last
          />
        </dl>
        <PrimaryButton onClick={create}>{createLabel}</PrimaryButton>
        <p style={{ margin: "8px 0 0", textAlign: "center", fontSize: 11.5, color: INK_FAINT }}>
          Solo — one learner, three robots, no field
        </p>
      </Section>

      {/* ── the create bar (see the header note: not sticky either) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderTop: `1px solid ${LINE}`,
          background: SURFACE,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {effectiveTitle}
          </div>
          <div style={{ fontSize: 11, color: INK_FAINT }}>
            {boards.length} board{boards.length === 1 ? "" : "s"} · {unitLabel} · solo
          </div>
        </div>
        <button
          type="button"
          onClick={create}
          style={{
            flex: "none",
            height: 40,
            padding: "0 18px",
            borderRadius: 9,
            border: 0,
            background: ACCENT,
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {createLabel}
        </button>
      </div>
    </div>
  );
}

/** The board count, as a stepper plus the common sizes. */
function BoardCountPicker({
  count,
  onCount,
}: Readonly<{ count: number; onCount: (next: number) => void }>) {
  const step = (delta: number) => onCount(count + delta);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <div
        style={{
          display: "flex",
          overflow: "hidden",
          alignItems: "center",
          borderRadius: 8,
          border: `1px solid ${LINE}`,
          background: SURFACE,
        }}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={count <= MIN_BOARDS}
          aria-label="One board fewer"
          style={stepperStyle(count <= MIN_BOARDS)}
        >
          −
        </button>
        <span style={{ minWidth: 46, textAlign: "center", fontSize: 18, fontWeight: 800 }}>
          {count}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={count >= MAX_BOARDS}
          aria-label="One board more"
          style={stepperStyle(count >= MAX_BOARDS)}
        >
          +
        </button>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {BOARD_PRESETS.map((n) => (
          <Chip key={n} tone={count === n ? "accent" : "plain"} onClick={() => onCount(n)}>
            {n}
          </Chip>
        ))}
      </div>
    </div>
  );
}

const stepperStyle = (disabled: boolean) => ({
  width: 40,
  height: 40,
  border: 0,
  background: PAPER,
  color: disabled ? INK_FAINT : INK,
  fontFamily: "inherit",
  fontSize: 18,
  fontWeight: 800,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.5 : 1,
});
