/**
 * A Bridge Platform component inside a tutorial — dormant until asked for.
 *
 * ONE BLOCK, THREE MODES. The mode is the first setting inside Configure, and
 * it chooses which component out of @bridge/table-embed this block mounts:
 *
 *  · table     — one playable board. Bid it, play it, BEN takes the other
 *                seats. Nothing is scored and nothing is reported.
 *  · challenge — the boards an author set, played in sequence against BEN,
 *                with the learner's line beside BEN's and a mark at the end.
 *  · bidding   — the opening-bid drill. One hand, one call, and the answer is
 *                the AUTHOR'S. No engine is consulted, here or below.
 *
 * THE THIRD MODE IS THE ONE THAT DOES NOT ASK BEN. Both others are scored
 * against it, which is right when the question is "what would a strong engine
 * do here" — but a lesson that teaches a bidding system needs the lesson's
 * answer, and BEN bids its own. So the drill mounts <BiddingChallenge/>, which
 * takes no `decide` prop and makes no network call: it marks a call against
 * what the author wrote and prints the author's reason verbatim. It still
 * reports progress, down the same wire the challenge uses.
 *
 * The challenge REPLACED the drill and the diagram (owner, 2026-08-10). It does
 * what both did — a bidding-only challenge is the drill, a challenge board with
 * the hands up is the diagram — and unlike either of them it can tell the
 * platform how the learner did, through the same `onResolvedChange` contract a
 * quiz uses. Two modes that could not report progress became one that does.
 *
 * Not two block types: an author who has placed a block and then wants the
 * challenge instead should change a chip, not delete and re-add in the right
 * spot. Every setting round-trips through lib/tutorialV3/bridgeEmbed.ts — the
 * single mapping module.
 *
 * Two states, and the distinction is the whole point:
 *
 *  · THUMBNAIL. A drawn preview, a label and a Play affordance. The table chunk
 *    is not in the tree, so nothing is fetched, no engine runs and BEN is never
 *    called. Six of these on a page cost six divs.
 *  · LIVE. On activate, the component mounts and the real thing runs. Close
 *    unmounts it, which stops it rather than merely hiding it — and for a
 *    challenge that also stops BEN's silent reference line.
 *
 * The preview is drawn here rather than screenshotted so it can never go stale
 * against the real table, costs no network, and says WHICH MODE this block is:
 * a collapsed challenge must not look like a collapsed table.
 *
 * For an AUTHOR there is a third thing: a Configure disclosure under the
 * thumbnail, collapsed by default. In challenge mode that disclosure holds the
 * Bridge Platform's own create wizard — the same one, minus the invites step,
 * because a tutorial challenge is always solo. It never renders for a reader
 * (`readOnly`).
 */

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Dices, Play, Settings2, X } from 'lucide-react';
import {
  BRIDGE_BIDDING_COUNTS,
  BRIDGE_BIDDING_HANDS_MAX,
  BRIDGE_MODES,
  BRIDGE_PACES,
  BRIDGE_SEATS,
  BRIDGE_SKINS,
  BRIDGE_VULS,
  bridgeEmbedDef,
  challengeSummary,
  dealFromSeed,
  handPoints,
  handSuits,
  rollBridgeSeed,
  type BridgeChallengeDraft,
  type BridgeEmbedConfig,
  type BridgeSeat,
} from '../../../../lib/tutorialV3/bridgeEmbed';
import type { QuizResolveStatus } from '../McqClusterExperience';
import type { BridgeDecide } from '../../../../vendor/bridge-table/table-embed.js';

// The table is a COMPONENT, not a site in a frame — @bridge/table-embed carries
// the real PlayTable plus the real game law in one 26kB-gzipped module whose only
// runtime dependency is React. Loaded through ONE dynamic import so a dormant
// block costs nothing: the chunk is not fetched until a reader opens something.
// Both modes come out of the same module, so this is one chunk, once.
//
// EVERY reference to it has to be dynamic or the split does not happen. It did
// not: `createBenDecider` was imported statically here, and Rollup puts a module
// that is imported both ways into the STATIC chunk — so the whole 102kB was
// riding in the app's main bundle while three lazy() calls looked like they were
// deferring it. Hence the type-only import above (erased at compile time) and
// useBenDecide below.
const tableEmbed = () => import('../../../../vendor/bridge-table/table-embed.js');

const BridgeTable = lazy(async () => ({ default: (await tableEmbed()).BridgeTable }));
const ChallengePlayer = lazy(async () => ({ default: (await tableEmbed()).ChallengePlayer }));
const ChallengeCreator = lazy(async () => ({ default: (await tableEmbed()).ChallengeCreator }));
const BiddingChallenge = lazy(async () => ({ default: (await tableEmbed()).BiddingChallenge }));

/** Where BEN answers. Override with VITE_BEN_ENDPOINT. */
const BEN_ENDPOINT =
  (import.meta.env?.VITE_BEN_ENDPOINT as string | undefined) ||
  'https://ben-service.vercel.app';

/**
 * A `decide` that does not exist until it is asked.
 *
 * The real decider comes out of the lazy chunk, so it cannot be built at import
 * time without dragging the chunk in with it. This is a stable function that
 * loads the module on the FIRST question and then delegates — one identity for
 * the life of the block, which is what the table's robot effect and the drill's
 * prefetch both need. It degrades like the decider itself: a chunk that will not
 * load returns null, the seat does not move, the tutorial keeps working.
 */
function useBenDecide(onProblem: (why: string) => void): BridgeDecide {
  const built = useRef<Promise<BridgeDecide> | null>(null);
  return useCallback(
    async (state, seat) => {
      try {
        if (!built.current)
          built.current = tableEmbed().then((m) =>
            m.createBenDecider({ endpoint: BEN_ENDPOINT, onProblem }),
          );
        return await (await built.current)(state, seat);
      } catch (e) {
        onProblem(`BEN could not be loaded (${(e as Error).message})`);
        return null;
      }
    },
    [onProblem],
  );
}

/**
 * Felt per skin, for the THUMBNAIL only — so picking Claret shows claret before
 * anything is mounted. @bridge/table-embed keeps the real skin table private, so
 * this echoes the five felts; a drift here is a slightly wrong thumbnail, never a
 * wrong table. (Worth exporting from the package next time it is built.)
 */
const SKIN_FELT: Record<string, string> = {
  bbo: 'radial-gradient(120% 110% at 35% 20%, #26805e 0%, #1c6b4f 45%, #14563f 100%)',
  midnight: 'radial-gradient(120% 110% at 35% 20%, #2f3f6b 0%, #212e4f 45%, #151d36 100%)',
  parchment: 'linear-gradient(160deg, #f4e9d2 0%, #e9dabb 55%, #dcc9a4 100%)',
  noir: 'linear-gradient(180deg, #1e1e1e 0%, #131313 100%)',
  claret: 'radial-gradient(120% 110% at 35% 20%, #7d2136 0%, #631427 45%, #480e1c 100%)',
};

/**
 * The thumbnail's gradients live in a stylesheet, not in style attributes.
 *
 * A host app can dress an embedded page by injecting CSS, and the coach app's
 * skin flattens anything whose inline style mentions a gradient — reasonable
 * for the page's own chrome, fatal here: the scrim is absolutely positioned
 * across the whole thumbnail, so repainting it opaque hid the preview
 * completely. Rules in a stylesheet are not style attributes, so they survive.
 */
const THUMB_STYLE_ID = 'cs-bridge-thumb-style';
const THUMB_CSS = `
.cs-bridge-scrim {
  background: linear-gradient(180deg, rgba(11,15,26,0) 45%, rgba(11,15,26,0.72) 100%) !important;
}
${Object.entries(SKIN_FELT)
  .map(([k, v]) => `.cs-bridge-felt-${k} { background: ${v} !important; }`)
  .join('\n')}
`;

function useThumbStyles() {
  useEffect(() => {
    if (document.getElementById(THUMB_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = THUMB_STYLE_ID;
    el.textContent = THUMB_CSS;
    document.head.appendChild(el);
  }, []);
}

/** Class for a skin's felt; unknown skins fall back like the map did. */
function feltClass(skin: string): string {
  return `cs-bridge-felt-${SKIN_FELT[skin] ? skin : 'bbo'}`;
}

/** A miniature of the table: felt, four hands, a trick in the middle. */
function TablePreview({ skin, fan: fanned }: Readonly<{ skin: string; fan: boolean }>) {
  const card = (left: number, top: number, tilt = 0, w = 9, h = 13) => (
    <span
      key={`${left}-${top}-${tilt}`}
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: w,
        height: h,
        borderRadius: 1.5,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.35)',
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        transformOrigin: 'bottom center',
      }}
    />
  );
  // Fanned hands splay; a row of hands sits flat. The author sees which they chose.
  const hand = (leftStart: number, top: number, n: number, step: number) =>
    Array.from({ length: n }, (_, i) =>
      card(leftStart + i * step, top, fanned ? (i - (n - 1) / 2) * 9 : 0),
    );

  return (
    <div
      aria-hidden
      className={feltClass(skin)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      {hand(34, 6, 5, 6)}
      {hand(6, 38, 3, 5)}
      {hand(78, 38, 3, 5)}
      {hand(30, 76, 7, 6)}
      {card(44, 34, 0, 11, 15)}
      {card(52, 42, 0, 11, 15)}
    </div>
  );
}

/**
 * A miniature of the CHALLENGE: the dark strip with its progress rule, a felt
 * board under it, and the row of board squares. A collapsed challenge must not
 * look like a collapsed table — the thumbnail is the only thing an author
 * scanning a long lesson sees, so it has to say which of the two this is.
 */
function ChallengePreview({ skin, boards }: Readonly<{ skin: string; boards: number }>) {
  const n = Math.max(1, Math.min(8, boards || 1));
  return (
    <div
      aria-hidden
      className={feltClass(skin)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* the challenge strip — its bottom border IS the progress rule */}
      <div
        style={{
          flex: 'none',
          height: '13%',
          background: '#0e1a1c',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '0 6%',
          position: 'relative',
        }}
      >
        <span style={{ height: 4, width: '34%', borderRadius: 2, background: 'rgba(255,255,255,0.42)' }} />
        <span style={{ height: 4, width: '18%', borderRadius: 2, background: 'rgba(255,255,255,0.16)' }} />
        <span style={{ flex: 1 }} />
        <span style={{ height: 8, width: '16%', borderRadius: 2, background: 'rgba(255,255,255,0.14)' }} />
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,0.10)' }}>
          <span style={{ display: 'block', height: '100%', width: '38%', background: '#0d707c' }} />
        </span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <span style={{ position: 'absolute', left: '34%', top: '8%', width: '32%', height: '16%', borderRadius: 2, background: 'rgba(255,255,255,0.86)' }} />
        <span style={{ position: 'absolute', left: '6%', top: '38%', width: '24%', height: '16%', borderRadius: 2, background: 'rgba(255,255,255,0.7)' }} />
        <span style={{ position: 'absolute', left: '70%', top: '38%', width: '24%', height: '16%', borderRadius: 2, background: 'rgba(255,255,255,0.7)' }} />
        <span style={{ position: 'absolute', left: '30%', top: '66%', width: '40%', height: '17%', borderRadius: 2, background: '#fff' }} />
      </div>
      {/* the board squares, one per board */}
      <div style={{ flex: 'none', display: 'flex', gap: 3, padding: '0 6% 5%' }}>
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            style={{
              flex: 'none',
              width: 12,
              height: 12,
              borderRadius: 3,
              background: i === 0 ? '#0d707c' : 'rgba(255,255,255,0.20)',
              border: '1px solid rgba(255,255,255,0.24)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A miniature of the OPENING BID DRILL: a paper card, a hand written out as
 * four suit lines, and the bid pad's five columns beside it. Deliberately not a
 * felt board — this is the one mode with no table in it, and a thumbnail that
 * showed green baize would promise the wrong thing.
 */
function DrillPreview() {
  const line = (glyph: string, red: boolean, w: number) => (
    <div key={glyph} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: red ? '#C02020' : '#1b2a3a', width: 8 }}>{glyph}</span>
      <span style={{ height: 4, width: `${w}%`, borderRadius: 2, background: 'rgba(17,24,39,0.55)' }} />
    </div>
  );
  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        height: '100%',
        background: '#f3f2ef',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6%',
        padding: '10% 8%',
      }}
    >
      <div
        style={{
          flex: '1 1 0',
          background: '#fff',
          border: '1px solid #8a8a8a',
          borderRadius: 3,
          boxShadow: '0 2px 5px rgba(0,0,0,.28)',
          padding: '6% 7%',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {line('\u2660', false, 62)}
        {line('\u2665', true, 40)}
        {line('\u2666', true, 30)}
        {line('\u2663', false, 22)}
      </div>
      {/* the bid pad: five strain columns, the way BidColumns lays them out */}
      <div style={{ flex: '0 0 42%', display: 'flex', gap: 3 }}>
        {['#6b7280', '#1b2a3a', '#C02020', '#C02020', '#1b2a3a'].map((ink, c) => (
          <div
            key={c}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(0,0,0,0.10)',
              borderRadius: 3,
              padding: 2,
            }}
          >
            {Array.from({ length: 5 }, (_, r) => (
              <span key={r} style={{ height: 4, borderRadius: 1, background: ink, opacity: r === 0 ? 0.95 : 0.32 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What the package's own validator says about the authored hand set, printed
 * where an AUTHOR will see it.
 *
 * The check lives in @bridge/table-embed (`validateDrillHands`) because the data
 * lives there; this only asks it and prints the answer. It is loaded through the
 * same dynamic import as everything else in the bundle, so opening Configure on
 * a drill costs the chunk and a dormant block still costs nothing.
 *
 * It reports a CLEAN set as well as a faulty one. "No problems" is information —
 * it tells an author the hands were checked, rather than leaving them to wonder
 * whether silence means sound data or a check that never ran.
 */
function DrillDataCheck() {
  const [state, setState] = useState<{ loading: boolean; problems: { no: number; kind: string; detail: string }[]; error: string | null }>({
    loading: true,
    problems: [],
    error: null,
  });
  useEffect(() => {
    let alive = true;
    tableEmbed()
      .then((m) => alive && setState({ loading: false, problems: m.validateDrillHands(), error: null }))
      .catch((e: Error) => alive && setState({ loading: false, problems: [], error: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading)
    return <p style={{ fontSize: 11.5, color: '#9AA3AF', margin: '6px 0 0' }}>Checking the hands…</p>;
  if (state.error)
    return (
      <p style={{ fontSize: 11.5, color: '#B42318', margin: '6px 0 0' }}>
        The hands could not be checked ({state.error}).
      </p>
    );
  if (state.problems.length === 0)
    return (
      <p style={{ fontSize: 11.5, color: '#6B7280', margin: '6px 0 0' }}>
        All {BRIDGE_BIDDING_HANDS_MAX} hands check out — thirteen cards each, and every note's point
        count matches its cards.
      </p>
    );
  return (
    <div
      style={{
        marginTop: 6,
        padding: '7px 9px',
        borderRadius: 8,
        background: '#fff8e6',
        border: '1px solid rgba(180,130,0,0.35)',
        fontSize: 11.5,
        lineHeight: 1.45,
        color: '#8a5a00',
      }}
    >
      <strong style={{ fontWeight: 700 }}>
        {state.problems.length} problem{state.problems.length === 1 ? '' : 's'} in the hand set.
      </strong>{' '}
      The drill still runs — a hand that is a card short still teaches its opening call — but these
      want patching in the Bridge repo:
      <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
        {state.problems.map((pr, i) => (
          <li key={`${pr.no}-${pr.kind}-${i}`}>
            Hand {pr.no}: {pr.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- The chip vocabulary, same as the Blocks row in the Refine sidebar. --- */

function Chip({
  selected,
  onClick,
  title,
  children,
}: Readonly<{
  selected?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        borderColor: selected ? 'rgba(109,40,217,0.4)' : 'rgba(0,0,0,0.1)',
        background: selected ? 'rgba(109,40,217,0.08)' : '#fff',
        color: selected ? '#4C1D95' : '#374151',
        lineHeight: 1.1,
      }}
    >
      {children}
    </button>
  );
}

/** A named row of chips — the label carries the meaning, the chips the choice. */
function ChipRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-start gap-2" style={{ marginTop: 6 }}>
      <span
        style={{
          fontSize: 11,
          color: '#9AA3AF',
          width: 68,
          flex: 'none',
          paddingTop: 6,
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Group({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div style={{ marginTop: 12 }}>
      <p
        style={{
          fontSize: 11.5,
          fontWeight: 650,
          color: '#9AA3AF',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

const SEAT_NAME: Record<BridgeSeat, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };
const RED_SUITS = new Set(['H', 'D']);

/**
 * What the seed actually deals. A number is meaningless to an author, so show
 * the hand the learner will pick up, and its high-card points.
 */
function BoardSummary({ seed, seat }: Readonly<{ seed: number; seat: BridgeSeat }>) {
  const hand = dealFromSeed(seed)[seat];
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
      style={{ marginTop: 6, fontSize: 12.5 }}
    >
      <span style={{ fontSize: 11, color: '#9AA3AF' }}>{SEAT_NAME[seat]} holds</span>
      {handSuits(hand).map((s) => (
        <span key={s.suit} style={{ whiteSpace: 'nowrap', color: '#111827' }}>
          <span style={{ color: RED_SUITS.has(s.suit) ? '#C02020' : '#1b2a3a' }}>{s.symbol}</span>{' '}
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.ranks}</span>
        </span>
      ))}
      <span style={{ fontSize: 11, color: '#6B7280' }}>{handPoints(hand)} HCP</span>
    </div>
  );
}

export function BridgeEmbedBlock({
  config,
  caption,
  onChangeCaption,
  onChangeConfig,
  readOnly,
  onResolvedChange,
  resultKeyPrefix = '',
}: Readonly<{
  /** The author's choices, already normalised by `readBridgeConfig`. */
  config: BridgeEmbedConfig;
  caption?: string;
  onChangeCaption?: (next: string) => void;
  /** Given the whole next config, so no hop has to merge partials. */
  onChangeConfig?: (next: BridgeEmbedConfig) => void;
  readOnly?: boolean;
  /**
   * THE PROGRESS EDGE, and it is the quiz's, not a new one. A challenge block
   * reports the same shape `QuizBlock` reports — one entry per board, 'correct'
   * where the learner matched or beat BEN — so `AssessedBlocks` aggregates a
   * challenge and a quiz in the same tally and the same pass banner reads both.
   * A table block never reports: there is nothing to be right about.
   */
  onResolvedChange?: (info: {
    keyPrefix: string;
    byIndex: Record<number, QuizResolveStatus>;
    correct: number;
    total: number;
    allDone: boolean;
  }) => void;
  resultKeyPrefix?: string;
}>) {
  useThumbStyles();
  const [live, setLive] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const def = bridgeEmbedDef(config.kind);
  const mode = def.kind;
  const challenge = challengeSummary(config.challenge);

  // BEN plays the other three seats at a table, and is also the reference line
  // a challenge board is set beside. One identity for the life of the block, so
  // neither the table's robot effect nor the reference line restarts on a render.
  const decide = useBenDecide(setProblem);

  const set = (patch: Partial<BridgeEmbedConfig>) => onChangeConfig?.({ ...config, ...patch });
  const editable = !readOnly && !!onChangeConfig;

  /**
   * The mark, in the quiz's own vocabulary. `mark` comes from the player, which
   * counts boards and compares them with BEN; nothing is recomputed here.
   */
  const sink = useRef(onResolvedChange);
  sink.current = onResolvedChange;
  const onChallengeProgress = useCallback(
    (mark: {
      boardsTotal: number;
      boardsDone: number;
      completed: boolean;
      boardsWon: number;
      rated: number;
    }) => {
      const byIndex: Record<number, QuizResolveStatus> = {};
      for (let i = 0; i < mark.boardsDone; i++)
        byIndex[i] = i < mark.boardsWon ? 'correct' : 'revealed';
      sink.current?.({
        keyPrefix: resultKeyPrefix,
        byIndex,
        correct: mark.boardsWon,
        total: mark.boardsTotal,
        allDone: mark.completed,
      });
    },
    [resultKeyPrefix],
  );

  /**
   * The drill's mark, in the same vocabulary. <BiddingChallenge/> reports hands
   * where <ChallengePlayer/> reports boards, and nothing else differs — so this
   * is the challenge's adapter with the nouns changed, not a second idea about
   * what progress means. Both land in `onResolvedChange`, which is the quiz's.
   */
  const onDrillProgress = useCallback(
    (mark: { handsTotal: number; handsDone: number; completed: boolean; matched: number }) => {
      const byIndex: Record<number, QuizResolveStatus> = {};
      for (let i = 0; i < mark.handsDone; i++)
        byIndex[i] = i < mark.matched ? 'correct' : 'revealed';
      sink.current?.({
        keyPrefix: resultKeyPrefix,
        byIndex,
        correct: mark.matched,
        total: mark.handsTotal,
        allDone: mark.completed,
      });
    },
    [resultKeyPrefix],
  );

  // A challenge that is not configured has nothing to open, and a reader must
  // not meet a Play button that leads to an empty frame.
  // The drill carries its own hands, so it is always playable.
  const playable = mode !== 'challenge' || !!challenge;
  useEffect(() => {
    if (!playable && live) setLive(false);
  }, [playable, live]);

  /** The line under a thumbnail: what this block IS, in the author's own terms. */
  const drillLine = `${config.biddingHands} hand${config.biddingHands === 1 ? '' : 's'} · opening bids · the author's answers`;
  const subtitle =
    mode === 'bidding'
      ? drillLine
      : readOnly
        ? mode === 'challenge' && challenge
          ? `${challenge.boards} board${challenge.boards === 1 ? '' : 's'} · ${challenge.biddingOnly ? 'bidding only' : 'bid & play'} · vs BEN`
          : def.blurb
        : mode === 'challenge'
          ? challenge
            ? `${challenge.boards} board${challenge.boards === 1 ? '' : 's'} · ${challenge.biddingOnly ? 'bidding only' : 'bid & play'}`
            : 'Not set up yet — open Configure and build it'
          : `Board ${config.seed} · you sit ${SEAT_NAME[config.humanSeat]}${config.showAllHands ? ' · all hands up' : ''}`;

  const stage =
    mode === 'bidding' ? (
      <Suspense
        fallback={
          <p style={{ fontSize: 12.5, color: '#6B7280', padding: 14, margin: 0 }}>Loading the drill…</p>
        }
      >
        <BiddingChallenge
          limit={config.biddingHands}
          // The author sees the data check in Configure, above; a reader is told
          // about the hand in front of them and not about the set's paperwork.
          showDataNotice={!readOnly}
          onProgress={onDrillProgress}
        />
      </Suspense>
    ) : mode === 'challenge' ? (
      <Suspense
        fallback={
          <div
            style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: '#fff', fontSize: 12.5 }}
          >
            Loading the challenge…
          </div>
        }
      >
        <ChallengePlayer
          draft={config.challenge}
          decide={decide}
          height="100%"
          robotDelayMs={config.robotDelayMs}
          appearance={{
            skin: config.skin,
            handLayout: config.handLayout,
            bidPad: config.bidPad,
          }}
          onProgress={onChallengeProgress}
        />
      </Suspense>
    ) : (
      <Suspense
        fallback={
          <div
            style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: '#fff', fontSize: 12.5 }}
          >
            Loading the table…
          </div>
        }
      >
        <BridgeTable
          seed={config.seed}
          humanSeat={config.humanSeat}
          // Robot seats need a `decide` (BEN); until one answers they wait,
          // which is why who deals matters here.
          dealer={config.dealer}
          vul={config.vul}
          appearance={{
            skin: config.skin,
            handLayout: config.handLayout,
            bidPad: config.bidPad,
          }}
          showAllHands={config.showAllHands}
          showCoach={config.showCoach}
          robotDelayMs={config.robotDelayMs}
          decide={decide}
        />
      </Suspense>
    );

  /**
   * FRAMED means a picture: a fixed aspect on a dark ground. A table and a
   * challenge are boards, and a board should hold its shape as the column
   * resizes. The challenge's own strip comes out of that height rather than
   * being added to it, which is the whole reason the player takes
   * `height="100%"` and prices its bands against the box it is given.
   *
   * A LIVE DRILL IS NOT A PICTURE. It is a hand, a bid pad and a paragraph — a
   * column of content that wants the height it wants, and stacks its pad under
   * the hand on a narrow screen. Pinned to 5:4 it would either scroll inside a
   * box or leave a field of empty felt under a two-line answer. So the drill is
   * framed only as a THUMBNAIL, where a fixed aspect is exactly right, and
   * takes its own height once it is open.
   */
  const framed = !(mode === 'bidding' && live);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          borderRadius: framed ? 14 : 0,
          overflow: 'hidden',
          border: framed ? '1px solid rgba(0,0,0,0.08)' : 0,
          background: framed ? '#0B0F1A' : 'transparent',
          ...(framed ? { aspectRatio: String(def.ratio) } : {}),
        }}
      >
        {live ? (
          <>
            {stage}
            <button
              type="button"
              onClick={() => setLive(false)}
              title={`Close — this unmounts the ${mode === 'challenge' ? 'challenge' : mode === 'bidding' ? 'drill' : 'table'}`}
              className="absolute flex items-center justify-center rounded-full"
              style={{
                // A challenge wears a 40px strip along the top whose right-hand
                // end is the Results button, so the Close sits BELOW it rather
                // than on top of it.
                top: mode === 'challenge' ? 48 : 8,
                right: 8,
                width: 28,
                height: 28,
                background: 'rgba(11,15,26,0.78)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.18)',
                zIndex: 2,
              }}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => playable && setLive(true)}
            disabled={!playable}
            className="absolute inset-0 w-full h-full"
            style={{
              padding: 0,
              border: 0,
              background: 'transparent',
              cursor: playable ? 'pointer' : 'default',
              display: 'block',
            }}
            title={playable ? `Open ${def.label}` : 'This challenge has no boards yet'}
          >
            {mode === 'bidding' ? (
              <DrillPreview />
            ) : mode === 'challenge' ? (
              <ChallengePreview skin={config.skin} boards={challenge?.boards || 4} />
            ) : (
              <TablePreview skin={config.skin} fan={config.handLayout === 'fan'} />
            )}
            {/* The scrim keeps the label legible over any felt. */}
            <span
              className="cs-bridge-scrim"
              style={{ position: 'absolute', inset: 0 }}
            />
            {playable && (
              <span
                className="flex items-center justify-center rounded-full"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 52,
                  height: 52,
                  background: 'rgba(255,255,255,0.94)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                }}
              >
                <Play size={20} style={{ color: '#0B0F1A', marginLeft: 3 }} fill="#0B0F1A" />
              </span>
            )}
            <span
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 10,
                textAlign: 'left',
                color: '#fff',
              }}
            >
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
                {mode === 'challenge' && challenge ? challenge.title : def.label}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, opacity: 0.82 }}>{subtitle}</span>
            </span>
          </button>
        )}
      </div>

      {!readOnly && (
        <input
          value={caption || ''}
          onChange={(e) => onChangeCaption?.(e.target.value)}
          placeholder="Caption (optional)"
          className="w-full mt-2"
          style={{
            fontSize: 12.5,
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10,
            padding: '7px 10px',
          }}
        />
      )}

      {editable && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setConfigOpen((o) => !o)}
            aria-expanded={configOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border"
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              borderColor: configOpen ? 'rgba(109,40,217,0.4)' : 'rgba(0,0,0,0.1)',
              background: configOpen ? 'rgba(109,40,217,0.08)' : '#fff',
              color: configOpen ? '#4C1D95' : '#374151',
            }}
          >
            <Settings2 size={12} /> Configure
            <ChevronDown
              size={12}
              style={{ transform: configOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
            />
          </button>

          {configOpen && (
            <div
              className="rounded-2xl"
              style={{
                marginTop: 8,
                padding: '4px 12px 14px',
                border: '1px solid rgba(0,0,0,0.07)',
                background: 'rgba(0,0,0,0.015)',
              }}
            >
              {/* The MODE is the first thing, because everything under it depends
                  on the answer. Each mode then shows ONLY its own settings, so
                  the panel stays short whichever one is chosen. */}
              <Group title="Mode">
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
                  {BRIDGE_MODES.map((m) => (
                    <Chip
                      key={m.id}
                      selected={mode === m.id}
                      onClick={() => set({ kind: m.id })}
                      title={m.hint}
                    >
                      {m.label}
                    </Chip>
                  ))}
                </div>
              </Group>

              {mode === 'bidding' ? (
                /* THE DRILL HAS ONE KNOB: how long it is. The hands, the
                   answers and the reasons all ship inside the component,
                   authored in the Bridge repo — so a lesson can never carry a
                   stale copy of a set the author has since corrected, and
                   there is nothing here for an author to re-key. */
                <Group title="Drill">
                  <ChipRow label="Hands">
                    {BRIDGE_BIDDING_COUNTS.map((n) => (
                      <Chip
                        key={n}
                        selected={config.biddingHands === n}
                        onClick={() => set({ biddingHands: n })}
                        title={`Ask the first ${n} hand${n === 1 ? '' : 's'} of the set`}
                      >
                        {n === BRIDGE_BIDDING_HANDS_MAX ? `All ${n}` : n}
                      </Chip>
                    ))}
                  </ChipRow>
                  <p style={{ fontSize: 11, color: '#9AA3AF', marginTop: 6, paddingLeft: 76 }}>
                    Asked in the author's order. Each hand is marked against the author's own
                    opening bid — BEN is never called, so the drill cannot contradict the lesson.
                  </p>
                  <DrillDataCheck />
                </Group>
              ) : mode === 'challenge' ? (
                /* THE WIZARD ITSELF. Not a re-implementation of it: this is the
                   Bridge Platform's own create-challenge form, out of the same
                   package as the table, with the invites step removed because a
                   tutorial challenge is played by one learner. It saves as the
                   author types — there is no second Save inside a panel that is
                   already inside an editor. */
                <Group title="Challenge">
                  <Suspense
                    fallback={
                      <p style={{ fontSize: 12.5, color: '#6B7280', padding: '8px 0', margin: 0 }}>
                        Loading the challenge builder…
                      </p>
                    }
                  >
                    <ChallengeCreator
                      draft={config.challenge || undefined}
                      createLabel="Done"
                      onChange={(next) => set({ challenge: next })}
                      onCreate={(next) => {
                        set({ challenge: next });
                        setConfigOpen(false);
                      }}
                    />
                  </Suspense>
                </Group>
              ) : (
                <>
                  <Group title="Deal">
                    <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: '#374151' }}>
                        Board {config.seed}
                      </span>
                      <Chip
                        onClick={() => set({ seed: rollBridgeSeed() })}
                        title="Deal a different board"
                      >
                        <Dices size={12} /> Re-roll
                      </Chip>
                    </div>
                    <BoardSummary seed={config.seed} seat={config.humanSeat} />
                  </Group>

                  <Group title="Seats">
                    <ChipRow label="Learner sits">
                      {BRIDGE_SEATS.map((s) => (
                        <Chip
                          key={s.id}
                          selected={config.humanSeat === s.id}
                          onClick={() => set({ humanSeat: s.id })}
                          title={s.label}
                        >
                          {s.label}
                        </Chip>
                      ))}
                    </ChipRow>
                    <ChipRow label="Dealer">
                      {BRIDGE_SEATS.map((s) => (
                        <Chip
                          key={s.id}
                          selected={config.dealer === s.id}
                          onClick={() => set({ dealer: s.id })}
                          title={s.label}
                        >
                          {s.label}
                        </Chip>
                      ))}
                    </ChipRow>
                    <ChipRow label="Vulnerable">
                      {BRIDGE_VULS.map((v) => (
                        <Chip key={v.id} selected={config.vul === v.id} onClick={() => set({ vul: v.id })}>
                          {v.label}
                        </Chip>
                      ))}
                    </ChipRow>
                    {config.dealer !== config.humanSeat && (
                      <p style={{ fontSize: 11, color: '#9AA3AF', marginTop: 6, paddingLeft: 76 }}>
                        A robot opens the auction — the learner waits one turn.
                      </p>
                    )}
                  </Group>
                </>
              )}

              {/* The felt is the felt whichever mode drew it, so Look and pace
                  are asked once and both TABLE modes answer them. The drill has
                  no felt, no seats and no robots — a skin chip on it would be a
                  control that changes nothing. */}
              {mode !== 'bidding' && (
              <Group title="Look">
                <ChipRow label="Skin">
                  {BRIDGE_SKINS.map((k) => (
                    <Chip key={k.id} selected={config.skin === k.id} onClick={() => set({ skin: k.id })}>
                      {k.label}
                    </Chip>
                  ))}
                </ChipRow>
                <ChipRow label="Hands">
                  <Chip
                    selected={config.handLayout === 'row'}
                    onClick={() => set({ handLayout: 'row' })}
                    title="Cards side by side"
                  >
                    Row
                  </Chip>
                  <Chip
                    selected={config.handLayout === 'fan'}
                    onClick={() => set({ handLayout: 'fan' })}
                    title="Cards splayed as a held fan"
                  >
                    Fan
                  </Chip>
                </ChipRow>
                <ChipRow label="Bidding pad">
                  <Chip selected={config.bidPad === 'grid'} onClick={() => set({ bidPad: 'grid' })}>
                    Grid
                  </Chip>
                  <Chip selected={config.bidPad === 'columns'} onClick={() => set({ bidPad: 'columns' })}>
                    Columns
                  </Chip>
                </ChipRow>
                <ChipRow label="Robot pace">
                  {BRIDGE_PACES.map((p) => (
                    <Chip
                      key={p.id}
                      selected={config.robotDelayMs === p.id}
                      onClick={() => set({ robotDelayMs: p.id })}
                      title={`${p.id}ms before a robot acts`}
                    >
                      {p.label}
                    </Chip>
                  ))}
                </ChipRow>
              </Group>
              )}

              {/* Teaching aids belong to the plain table. A challenge decides
                  them per challenge, in its own Table controls step — a scored
                  board with every hand face up is a different promise. */}
              {mode === 'table' && (
                <Group title="Teaching">
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
                    <Chip
                      selected={config.showAllHands}
                      onClick={() => set({ showAllHands: !config.showAllHands })}
                      title="Every hand face up — a worked board rather than a problem"
                    >
                      All four hands
                    </Chip>
                    <Chip
                      selected={config.showCoach}
                      onClick={() => set({ showCoach: !config.showCoach })}
                      title="A coach panel beside the table"
                    >
                      Coach
                    </Chip>
                  </div>
                </Group>
              )}
            </div>
          )}
        </div>
      )}

      {problem && (
        <p style={{ fontSize: 11.5, color: '#B42318', marginTop: 6 }}>{problem}</p>
      )}
      {readOnly && caption ? (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 6 }}>{caption}</p>
      ) : null}

    </div>
  );
}
