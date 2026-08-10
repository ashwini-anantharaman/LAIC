/**
 * A Bridge Platform component inside a tutorial — dormant until asked for.
 *
 * Two states, and the distinction is the whole point:
 *
 *  · THUMBNAIL. A drawn preview, a label and a Play affordance. No iframe is in
 *    the tree, so nothing is fetched and no Bridge code runs. Six of these on a
 *    page cost six divs.
 *  · LIVE. On activate, the iframe mounts and the real table runs in it. Close
 *    unmounts it again, which stops the frame rather than merely hiding it.
 *
 * The preview is drawn here rather than screenshotted so it can never go stale
 * against the real table, and costs no network.
 *
 * For an AUTHOR there is a third thing: a Configure disclosure under the
 * thumbnail, collapsed by default. The resting state is deliberately still just
 * the thumbnail and a caption — the knobs are one click away, not in the way.
 * It never renders for a reader (`readOnly`).
 */

import { Suspense, lazy, useState } from 'react';
import { ChevronDown, Dices, Play, Settings2, X } from 'lucide-react';
import {
  BRIDGE_PACES,
  BRIDGE_SEATS,
  BRIDGE_SKINS,
  BRIDGE_VULS,
  bridgeEmbedDef,
  dealFromSeed,
  handPoints,
  handSuits,
  rollBridgeSeed,
  type BridgeEmbedConfig,
  type BridgeSeat,
} from '../../../../lib/tutorialV2/bridgeEmbed';
import { createBenDecider } from '../../../../vendor/bridge-table/table-embed.js';

// The table is a COMPONENT, not a site in a frame — @bridge/table-embed carries
// the real PlayTable plus the real game law in one 19kB-gzipped module whose only
// runtime dependency is React. Lazily imported so a dormant block costs nothing:
// the chunk is not even fetched until a reader opens one.
const BridgeTable = lazy(async () => ({
  default: (await import('../../../../vendor/bridge-table/table-embed.js')).BridgeTable,
}));

/** Where BEN answers. Override with VITE_BEN_ENDPOINT. */
const BEN_ENDPOINT =
  (import.meta.env?.VITE_BEN_ENDPOINT as string | undefined) ||
  'https://ben-service.vercel.app';

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

  // BEN plays the other three seats. Built once per block so the table's robot
  // effect does not see a new function identity on every render.
  const [decide] = useState(() =>
    createBenDecider({ endpoint: BEN_ENDPOINT, onProblem: setProblem }),
  );

  const set = (patch: Partial<BridgeEmbedConfig>) => onChangeConfig?.({ ...config, ...patch });
  const editable = !readOnly && !!onChangeConfig;

  return (
    <div>
      <div
        style={{
          position: 'relative',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.08)',
          background: '#0B0F1A',
          aspectRatio: String(def.ratio),
        }}
      >
        {live ? (
          <>
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
            <button
              type="button"
              onClick={() => setLive(false)}
              title="Close — this unmounts the table"
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
          </>
        ) : (
          <button
            type="button"
            onClick={() => setLive(true)}
            className="absolute inset-0 w-full h-full"
            style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'block' }}
            title={`Open ${def.label}`}
          >
            <TablePreview skin={config.skin} fan={config.handLayout === 'fan'} />
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
              <span style={{ display: 'block', fontSize: 11.5, opacity: 0.82 }}>
                {readOnly
                  ? def.blurb
                  : `Board ${config.seed} · you sit ${SEAT_NAME[config.humanSeat]}${config.showAllHands ? ' · all hands up' : ''}`}
              </span>
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
