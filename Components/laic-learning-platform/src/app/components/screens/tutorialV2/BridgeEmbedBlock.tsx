/**
 * A Bridge Platform component inside a tutorial — dormant until asked for.
 *
 * ONE BLOCK, THREE MODES. The mode is the first setting inside Configure, and it
 * chooses which component out of @bridge/table-embed this block mounts:
 *
 *  · table   — the playable board. Bid it, play it, BEN takes the other seats.
 *  · drill   — hands in sequence, one call each, BEN's call shown beside the
 *              learner's. Column-shaped, so it sits in a strip of prose.
 *  · diagram — a deal as a record. Nothing to press.
 *
 * Not three block types: an author who has placed a block and then wants the
 * drill instead should change a chip, not delete and re-add in the right spot.
 * Each mode answers only its own settings, and every one of them round-trips
 * through lib/tutorialV2/bridgeEmbed.ts — the single mapping module.
 *
 * Two states, and the distinction is the whole point:
 *
 *  · THUMBNAIL. A drawn preview, a label and a Play affordance. The table chunk
 *    is not in the tree, so nothing is fetched, no engine runs and BEN is never
 *    called. Six of these on a page cost six divs.
 *  · LIVE. On activate, the component mounts and the real thing runs. Close
 *    unmounts it, which stops it rather than merely hiding it — and for a drill
 *    that also means its prefetch stops.
 *
 * The preview is drawn here rather than screenshotted so it can never go stale
 * against the real table, costs no network, and says WHICH MODE this block is:
 * a collapsed drill must not look like a collapsed table. The one exception to
 * dormancy is `diagram`, which has nothing to start — see the stage below.
 *
 * For an AUTHOR there is a third thing: a Configure disclosure under the
 * thumbnail, collapsed by default. The resting state is deliberately still just
 * the thumbnail and a caption — the knobs are one click away, not in the way.
 * It never renders for a reader (`readOnly`).
 */

import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { ChevronDown, Dices, Play, Plus, Settings2, Trash2, X } from 'lucide-react';
import {
  BRIDGE_DIAGRAM_SHOWS,
  BRIDGE_DRILL_MAX_HANDS,
  BRIDGE_MODES,
  BRIDGE_PACES,
  BRIDGE_SEATS,
  BRIDGE_SKINS,
  BRIDGE_VULS,
  bridgeEmbedDef,
  dealFromSeed,
  handPoints,
  handSuits,
  rollBridgeSeed,
  type BridgeCard,
  type BridgeEmbedConfig,
  type BridgeSeat,
} from '../../../../lib/tutorialV2/bridgeEmbed';
import type { BridgeDecide } from '../../../../vendor/bridge-table/table-embed.js';

// The table is a COMPONENT, not a site in a frame — @bridge/table-embed carries
// the real PlayTable plus the real game law in one 26kB-gzipped module whose only
// runtime dependency is React. Loaded through ONE dynamic import so a dormant
// block costs nothing: the chunk is not fetched until a reader opens something.
// All three modes come out of the same module, so this is one chunk, once.
//
// EVERY reference to it has to be dynamic or the split does not happen. It did
// not: `createBenDecider` was imported statically here, and Rollup puts a module
// that is imported both ways into the STATIC chunk — so the whole 102kB was
// riding in the app's main bundle while three lazy() calls looked like they were
// deferring it. Hence the type-only import above (erased at compile time) and
// useBenDecide below.
const tableEmbed = () => import('../../../../vendor/bridge-table/table-embed.js');

const BridgeTable = lazy(async () => ({ default: (await tableEmbed()).BridgeTable }));
const BiddingDrill = lazy(async () => ({ default: (await tableEmbed()).BiddingDrill }));
const DealDiagram = lazy(async () => ({ default: (await tableEmbed()).DealDiagram }));

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
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: SKIN_FELT[skin] || SKIN_FELT.bbo,
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
 * A miniature of the DRILL: one hand panel and a bid pad. A collapsed drill must
 * not look like a collapsed table — the thumbnail is the only thing an author
 * scanning a long lesson sees, so it has to say which of the three this is.
 */
function DrillPreview() {
  const bars = [72, 54, 40, 62];
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(160deg, #f7f8fa 0%, #e8ebf0 100%)',
        display: 'flex',
        gap: '5%',
        padding: '9% 7% 13%',
        alignItems: 'stretch',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flex: '1 1 0',
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.14)',
          borderRadius: 3,
          padding: '4% 6%',
          boxShadow: '0 1px 3px rgba(0,0,0,0.16)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
        }}
      >
        {['♠', '♥', '♦', '♣'].map((g, i) => (
          <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10, lineHeight: 1, color: i === 1 || i === 2 ? '#C02020' : '#1b2a3a' }}>
              {g}
            </span>
            <span
              style={{
                height: 4,
                width: `${bars[i]}%`,
                borderRadius: 2,
                background: 'rgba(0,0,0,0.16)',
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          flex: '0 0 40%',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: 'repeat(7, 1fr)',
          gap: 2,
        }}
      >
        {Array.from({ length: 35 }, (_, i) => (
          <span
            key={i}
            style={{
              background: i % 5 === 0 ? 'rgba(47,92,143,0.24)' : 'rgba(0,0,0,0.075)',
              borderRadius: 1.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** A miniature of the DIAGRAM — four panels round a board card, on the baize. */
function DiagramPreview() {
  const panel = (extra: React.CSSProperties) => (
    <span
      style={{
        position: 'absolute',
        background: '#cbcbcb',
        borderRadius: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        ...extra,
      }}
    />
  );
  return (
    <div
      aria-hidden
      style={{ position: 'relative', width: '100%', height: '100%', background: '#016700' }}
    >
      {panel({ left: '35%', top: '5%', width: '30%', height: '26%' })}
      {panel({ left: '3%', top: '37%', width: '30%', height: '26%' })}
      {panel({ left: '67%', top: '37%', width: '30%', height: '26%' })}
      {panel({ left: '35%', top: '69%', width: '30%', height: '26%' })}
      {panel({ left: '3%', top: '5%', width: '26%', height: '26%', background: '#fff' })}
      {panel({ left: '67%', top: '5%', width: '30%', height: '26%', background: '#99cccc' })}
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

/**
 * The same hand, tight enough for a repeated row: "♠AK94 ♥QJ5 ♦83 ♣K72 · 12".
 * A drill has up to twelve of these, so the spaced-out BoardSummary would be a
 * wall; ten is T, as it is on every hand record ever printed.
 */
function CompactHand({ cards }: Readonly<{ cards: BridgeCard[] }>) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2" style={{ fontSize: 12, minWidth: 0 }}>
      {handSuits(cards).map((s) => (
        <span key={s.suit} style={{ whiteSpace: 'nowrap' }}>
          <span style={{ color: RED_SUITS.has(s.suit) ? '#C02020' : '#1b2a3a' }}>{s.symbol}</span>
          <span style={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
            {s.ranks.replace(/ /g, '').replace(/10/g, 'T')}
          </span>
        </span>
      ))}
      <span style={{ fontSize: 11, color: '#9AA3AF' }}>{handPoints(cards)} HCP</span>
    </span>
  );
}

export function BridgeEmbedBlock({
  config,
  caption,
  onChangeCaption,
  onChangeConfig,
  readOnly,
}: Readonly<{
  /** The author's choices, already normalised by `readBridgeConfig`. */
  config: BridgeEmbedConfig;
  caption?: string;
  onChangeCaption?: (next: string) => void;
  /** Given the whole next config, so no hop has to merge partials. */
  onChangeConfig?: (next: BridgeEmbedConfig) => void;
  readOnly?: boolean;
}>) {
  const [live, setLive] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const def = bridgeEmbedDef(config.kind);
  const mode = def.kind;

  // BEN plays the other three seats at a table, and is the second opinion in a
  // drill. One identity for the life of the block, so neither the table's robot
  // effect nor the drill's prefetch restarts on a render.
  const decide = useBenDecide(setProblem);

  const set = (patch: Partial<BridgeEmbedConfig>) => onChangeConfig?.({ ...config, ...patch });
  const editable = !readOnly && !!onChangeConfig;

  /** The line under a thumbnail: what this block IS, in the author's own terms. */
  const subtitle = readOnly
    ? def.blurb
    : mode === 'drill'
      ? `${config.drillHands.length} hand${config.drillHands.length === 1 ? '' : 's'} · you are ${SEAT_NAME[config.humanSeat]}`
      : `Board ${config.seed} · you sit ${SEAT_NAME[config.humanSeat]}${config.showAllHands ? ' · all hands up' : ''}`;

  /* A DIAGRAM has nothing to start, so it does not wait to be started. The
     dormant-until-asked rule exists because a live table is expensive: an engine
     loop, a decider, a reader's attention. A record of a deal is a picture, and a
     picture behind a Play button is not a picture. It is still the lazy chunk, so
     a page of diagrams costs one download and no BEN calls. */
  const stage =
    mode === 'diagram' ? (
      <Suspense fallback={<DiagramPreview />}>
        <DealDiagram
          seed={config.seed}
          dealer={config.dealer}
          vul={config.vul}
          show={config.diagramShow}
          boardLabel={config.seed}
          highlightSeat={config.diagramShow === 'all' ? null : config.diagramShow}
        />
      </Suspense>
    ) : mode === 'drill' ? (
      <Suspense
        fallback={
          <p style={{ fontSize: 12.5, color: '#6B7280', padding: 16, margin: 0 }}>
            Loading the drill…
          </p>
        }
      >
        <BiddingDrill
          hands={config.drillHands.map((h) => ({ seed: h.seed, note: h.note }))}
          seat={config.humanSeat}
          dealer={config.dealer}
          vul={config.vul}
          decide={decide}
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
   * FRAMED means a picture: a fixed aspect on a dark ground, which is right for
   * a table, for a thumbnail, and for a full-board diagram — all three are
   * images that should hold their shape as the column resizes. It is wrong for
   * the two things that size to their own content: a live drill, and a diagram
   * of ONE hand, which is four lines of text. Forcing the board's 1.6 aspect on
   * those left a slab of black under them.
   */
  const framed = mode === 'table' || (mode === 'diagram' ? config.diagramShow === 'all' : !live);

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
        {live || mode === 'diagram' ? (
          <>
            {stage}
            {mode !== 'diagram' && (
              <button
                type="button"
                onClick={() => setLive(false)}
                title={`Close — this unmounts the ${mode === 'drill' ? 'drill' : 'table'}`}
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  top: 8,
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
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setLive(true)}
            className="absolute inset-0 w-full h-full"
            style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'block' }}
            title={`Open ${def.label}`}
          >
            {mode === 'drill' ? (
              <DrillPreview />
            ) : (
              <TablePreview skin={config.skin} fan={config.handLayout === 'fan'} />
            )}
            {/* The scrim keeps the label legible over any felt. */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(11,15,26,0) 45%, rgba(11,15,26,0.72) 100%)',
              }}
            />
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
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{def.label}</span>
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
                  on the answer. Each mode then shows ONLY its own settings — a
                  drill has no skin-of-the-felt question, a diagram has no robot
                  pace — so the panel stays short whichever one is chosen. */}
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

              {mode === 'drill' ? (
                <Group title="Hands">
                  {config.drillHands.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: i === 0 ? 0 : '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div className="flex items-baseline gap-2">
                        <span style={{ fontSize: 11, color: '#9AA3AF', width: 14, flex: 'none' }}>
                          {i + 1}
                        </span>
                        <CompactHand cards={dealFromSeed(h.seed)[config.humanSeat]} />
                        <span className="flex items-center gap-1" style={{ marginLeft: 'auto', flex: 'none' }}>
                          <Chip
                            onClick={() =>
                              set({
                                drillHands: config.drillHands.map((x, j) =>
                                  j === i ? { ...x, seed: rollBridgeSeed() } : x,
                                ),
                              })
                            }
                            title={`Board ${h.seed} — deal a different one`}
                          >
                            <Dices size={12} />
                          </Chip>
                          {config.drillHands.length > 1 && (
                            <Chip
                              onClick={() =>
                                set({ drillHands: config.drillHands.filter((_, j) => j !== i) })
                              }
                              title="Remove this hand"
                            >
                              <Trash2 size={12} />
                            </Chip>
                          )}
                        </span>
                      </div>
                      <input
                        value={h.note}
                        onChange={(e) =>
                          set({
                            drillHands: config.drillHands.map((x, j) =>
                              j === i ? { ...x, note: e.target.value } : x,
                            ),
                          })
                        }
                        placeholder="What you want said about this hand (optional)"
                        className="w-full"
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          border: '1px solid rgba(0,0,0,0.08)',
                          borderRadius: 8,
                          padding: '5px 8px',
                        }}
                      />
                    </div>
                  ))}
                  <div style={{ marginTop: 8 }}>
                    {config.drillHands.length < BRIDGE_DRILL_MAX_HANDS ? (
                      <Chip
                        onClick={() =>
                          set({
                            drillHands: [...config.drillHands, { seed: rollBridgeSeed(), note: '' }],
                          })
                        }
                        title="One more hand at the end of the drill"
                      >
                        <Plus size={12} /> Add hand
                      </Chip>
                    ) : (
                      <p style={{ fontSize: 11, color: '#9AA3AF', margin: 0 }}>
                        {BRIDGE_DRILL_MAX_HANDS} hands is the most a drill takes.
                      </p>
                    )}
                  </div>
                </Group>
              ) : (
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
                  <BoardSummary
                    seed={config.seed}
                    seat={config.diagramShow === 'all' || mode !== 'diagram' ? config.humanSeat : config.diagramShow}
                  />
                </Group>
              )}

              <Group title={mode === 'diagram' ? 'Board' : 'Seats'}>
                {mode === 'diagram' ? (
                  <ChipRow label="Show">
                    {BRIDGE_DIAGRAM_SHOWS.map((s) => (
                      <Chip
                        key={s.id}
                        selected={config.diagramShow === s.id}
                        onClick={() => set({ diagramShow: s.id })}
                      >
                        {s.label}
                      </Chip>
                    ))}
                  </ChipRow>
                ) : (
                  <ChipRow label={mode === 'drill' ? 'Learner is' : 'Learner sits'}>
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
                )}
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
                {mode === 'table' && config.dealer !== config.humanSeat && (
                  <p style={{ fontSize: 11, color: '#9AA3AF', marginTop: 6, paddingLeft: 76 }}>
                    A robot opens the auction — the learner waits one turn.
                  </p>
                )}
                {mode === 'drill' && config.dealer !== config.humanSeat && (
                  <p style={{ fontSize: 11, color: '#9AA3AF', marginTop: 6, paddingLeft: 76 }}>
                    The seats before the learner pass, so the call asked for is still the
                    opening one. The drill shows those passes.
                  </p>
                )}
              </Group>

              {mode === 'table' && (
                <>
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
                  </Group>

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
                </>
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
