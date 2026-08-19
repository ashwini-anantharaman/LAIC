/**
 * Hand-editing for the generated Tutorial V3 blocks.
 *
 * These blocks have no standalone object behind them, so for a long time the
 * only way to change one was to generate it again. That is a fair trade for a
 * paragraph and a bad one for anything with a right answer in it: an author
 * looking at a mis-keyed `correct` wants to fix that field, not re-roll the
 * whole block and hope.
 *
 * Every bound here matches the generator's normalizer — the same counts, the
 * same minimums — so a block typed by hand and a block generated are the same
 * kind of object, and neither can be saved into a shape the other rejects.
 * Where an answer must be one of the options, it is chosen from them rather
 * than typed, which is the one rule a text field cannot enforce.
 */
import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { V3_SAGE, V3_SAGE_BORDER, V3_SAGE_DARK } from '../../../../lib/tutorialV3/authorTheme';
import { TutorialV3ReferenceTableEditor } from './TutorialV3ReferenceTableEditor';
import type { ReferenceTableContent } from '../../../../lib/types';

/* ─── shared bits ───────────────────────────────────────────────── */

const INPUT: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 8,
  padding: '7px 9px',
  width: '100%',
  background: '#fff',
  outline: 'none',
};

const LABEL: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 650,
  color: '#6B7280',
  display: 'block',
  marginBottom: 4,
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  area = false,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  area?: boolean;
  rows?: number;
}) {
  return (
    <label className="block">
      <span style={LABEL}>{label}</span>
      {area ? (
        <textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...INPUT, lineHeight: 1.5, resize: 'vertical' }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={INPUT}
        />
      )}
    </label>
  );
}

function AddButton({
  label,
  onClick,
  disabled,
  hint,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border disabled:opacity-40"
        style={{ fontSize: 12.5, fontWeight: 650, color: V3_SAGE_DARK, borderColor: V3_SAGE_BORDER, background: '#fff' }}
      >
        <Plus size={12} /> {label}
      </button>
      {hint ? <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{hint}</span> : null}
    </div>
  );
}

function RowButtons({
  index,
  count,
  min,
  onMove,
  onRemove,
  what,
}: {
  index: number;
  count: number;
  min: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  what: string;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        className="p-1 rounded disabled:opacity-20"
        aria-label={`Move ${what} ${index + 1} up`}
      >
        <ChevronUp size={13} style={{ color: '#6B7280' }} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        className="p-1 rounded disabled:opacity-20"
        aria-label={`Move ${what} ${index + 1} down`}
      >
        <ChevronDown size={13} style={{ color: '#6B7280' }} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={count <= min}
        className="p-1 rounded disabled:opacity-25"
        title={count <= min ? `At least ${min} ${what}${min === 1 ? '' : 's'} are needed` : `Remove ${what} ${index + 1}`}
        aria-label={`Remove ${what} ${index + 1}`}
      >
        <Trash2 size={13} style={{ color: '#EF4444' }} />
      </button>
    </div>
  );
}

/** Move an item within a list, or return the list unchanged at the ends. */
function moved<T>(list: T[], i: number, delta: number): T[] {
  const to = i + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[i], next[to]] = [next[to], next[i]];
  return next;
}

/** A list of plain strings: objectives, checklist items, the lines of a card. */
function StringList({
  label,
  items,
  onChange,
  placeholder,
  min = 1,
  max = 8,
  what = 'item',
  addLabel,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: (i: number) => string;
  min?: number;
  max?: number;
  what?: string;
  addLabel: string;
}) {
  return (
    <div>
      <span style={LABEL}>{label}</span>
      <div className="space-y-1.5 mb-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-1">
            <span
              className="shrink-0 mt-1.5"
              style={{ fontSize: 11.5, color: '#9AA3AF', width: 16, textAlign: 'right' }}
            >
              {i + 1}
            </span>
            <input
              className="min-w-0 flex-1"
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={placeholder?.(i)}
              style={INPUT}
            />
            <RowButtons
              index={i}
              count={items.length}
              min={min}
              what={what}
              onMove={(d) => onChange(moved(items, i, d))}
              onRemove={() => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </div>
      <AddButton
        label={addLabel}
        onClick={() => onChange([...items, ''])}
        disabled={items.length >= max}
        hint={`${items.length}/${max}`}
      />
    </div>
  );
}

/** A bordered group for one repeated item — a card, a decision. */
function ItemCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 12, fontWeight: 700, color: V3_SAGE_DARK }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

const NOTE: React.CSSProperties = { fontSize: 11.5, color: '#9AA3AF', lineHeight: 1.5 };
const SAVED: React.CSSProperties = { fontSize: 11.5, color: V3_SAGE, fontWeight: 600 };

type Content = Record<string, unknown>;
type EditorProps = { content: Content; onChange: (next: Content) => void };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);

/* ─── lesson overview ───────────────────────────────────────────── */

function LessonOverviewEditor({ content, onChange }: EditorProps) {
  const set = (patch: Content) => onChange({ ...content, ...patch });
  const objectives = strs(content.objectives);
  return (
    <div className="space-y-3">
      <Field label="Intro" value={str(content.intro)} onChange={(intro) => set({ intro })} area
        placeholder="A line or two setting the lesson up" />
      <StringList
        label="What the learner will be able to do"
        items={objectives.length ? objectives : ['']}
        onChange={(next) => set({ objectives: next })}
        placeholder={(i) => `Objective ${i + 1}`}
        min={1}
        max={8}
        what="objective"
        addLabel="Add objective"
      />
      <Field label="Core idea" value={str(content.coreIdea)} onChange={(coreIdea) => set({ coreIdea })} area
        placeholder="The one thing this lesson is really about" />
      <Field label="Core rule" value={str(content.coreRule)} onChange={(coreRule) => set({ coreRule })} area
        placeholder="The rule a learner should leave holding" />
      <Field label="Start button" value={str(content.ctaLabel)} onChange={(ctaLabel) => set({ ctaLabel })}
        placeholder="Start lesson" />
      <p style={NOTE}>
        Three to eight objectives is what the generator aims for. Fewer still renders — it just
        reads thin on the cover page.
      </p>
      <p style={SAVED}>Edits save with the tutorial.</p>
    </div>
  );
}

/* ─── lesson complete ───────────────────────────────────────────── */

function LessonCompleteEditor({ content, onChange }: EditorProps) {
  const set = (patch: Content) => onChange({ ...content, ...patch });
  const checklist = strs(content.checklist);
  return (
    <div className="space-y-3">
      <Field label="Heading" value={str(content.heading)} onChange={(heading) => set({ heading })}
        placeholder="Lesson complete" />
      <Field label="Subheading" value={str(content.subheading)} onChange={(subheading) => set({ subheading })} area
        placeholder="A line of credit for finishing" />
      <StringList
        label="What the learner now knows"
        items={checklist.length ? checklist : ['']}
        onChange={(next) => set({ checklist: next })}
        placeholder={(i) => `Checklist item ${i + 1}`}
        min={1}
        max={8}
        what="item"
        addLabel="Add item"
      />
      <Field label="What next" value={str(content.whatNext)} onChange={(whatNext) => set({ whatNext })} area
        placeholder="Where this leads — the next lesson, or what to practise" />
      <Field label="Finish button" value={str(content.ctaLabel)} onChange={(ctaLabel) => set({ ctaLabel })}
        placeholder="Finish" />
      <p style={SAVED}>Edits save with the tutorial.</p>
    </div>
  );
}

/* ─── quick decisions ───────────────────────────────────────────── */

interface DecisionItem {
  label: string;
  tag?: string;
  prompt: string;
  answer: string;
  explanation: string;
}

function QuickDecisionsEditor({ content, onChange }: EditorProps) {
  const set = (patch: Content) => onChange({ ...content, ...patch });
  const decisions: DecisionItem[] = Array.isArray(content.decisions)
    ? (content.decisions as DecisionItem[])
    : [];
  const setDecisions = (next: DecisionItem[]) => set({ decisions: next });
  const patchAt = (i: number, patch: Partial<DecisionItem>) =>
    setDecisions(decisions.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      <Field label="Title" value={str(content.title)} onChange={(title) => set({ title })}
        placeholder="Quick decisions" />
      <Field label="Intro" value={str(content.intro)} onChange={(intro) => set({ intro })} area
        placeholder="How to use these — decide before you reveal" />

      <div className="space-y-2">
        <span style={LABEL}>Decisions</span>
        {decisions.map((d, i) => (
          <ItemCard
            key={i}
            title={d.label || `Quick decision ${String.fromCharCode(65 + i)}`}
            right={(
              <RowButtons
                index={i}
                count={decisions.length}
                min={1}
                what="decision"
                onMove={(delta) => setDecisions(moved(decisions, i, delta))}
                onRemove={() => setDecisions(decisions.filter((_, j) => j !== i))}
              />
            )}
          >
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="Label" value={d.label || ''} onChange={(label) => patchAt(i, { label })}
                placeholder={`Quick decision ${String.fromCharCode(65 + i)}`} />
              <Field label="Tag" value={d.tag || ''} onChange={(tag) => patchAt(i, { tag })}
                placeholder="What the answer turns on" />
            </div>
            <Field label="Situation" value={d.prompt || ''} onChange={(prompt) => patchAt(i, { prompt })} area rows={3}
              placeholder="The situation the learner judges. Line breaks are kept." />
            <Field label="Answer" value={d.answer || ''} onChange={(answer) => patchAt(i, { answer })}
              placeholder="What the right call is" />
            <Field label="Explanation" value={d.explanation || ''} onChange={(explanation) => patchAt(i, { explanation })} area
              placeholder="Why — the reasoning a learner compares against" />
          </ItemCard>
        ))}
        <AddButton
          label="Add decision"
          onClick={() => setDecisions([...decisions, {
            label: `Quick decision ${String.fromCharCode(65 + decisions.length)}`,
            prompt: '',
            answer: '',
            explanation: '',
          }])}
          disabled={decisions.length >= 8}
          hint={`${decisions.length}/8`}
        />
      </div>

      <Field label="Closing" value={str(content.closing)} onChange={(closing) => set({ closing })} area
        placeholder="A line to end on (optional)" />
      <p style={NOTE}>
        A decision is not a question: nothing is marked. The learner commits privately, reveals,
        and compares against the answer and explanation.
      </p>
      <p style={SAVED}>Edits save with the tutorial.</p>
    </div>
  );
}

/* ─── matching ──────────────────────────────────────────────────── */

interface MatchCard {
  label: string;
  lines: string[];
  correct: string;
  explanation?: string;
}

function MatchingEditor({ content, onChange }: EditorProps) {
  const set = (patch: Content) => onChange({ ...content, ...patch });
  const options = strs(content.options);
  const cards: MatchCard[] = Array.isArray(content.cards) ? (content.cards as MatchCard[]) : [];
  const reference = (content.reference || null) as ReferenceTableContent | null;

  const setCards = (next: MatchCard[]) => set({ cards: next });
  const patchAt = (i: number, patch: Partial<MatchCard>) =>
    setCards(cards.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  /*
    Renaming an option has to follow through to every card that answered with
    it. The normalizer drops a card whose `correct` is not in the options, so
    an edit that only changed the list would silently delete the answers.
  */
  const setOptions = (next: string[]) => {
    const renames = new Map<string, string>();
    options.forEach((old, i) => {
      if (next[i] !== undefined && next[i] !== old) renames.set(old, next[i]);
    });
    set({
      options: next,
      cards: cards.map((c) => (renames.has(c.correct) ? { ...c, correct: renames.get(c.correct)! } : c)),
    });
  };

  return (
    <div className="space-y-3">
      <Field label="Title" value={str(content.title)} onChange={(title) => set({ title })}
        placeholder="Matching" />
      <Field label="Intro" value={str(content.intro)} onChange={(intro) => set({ intro })} area
        placeholder="What the learner is matching, and against what" />

      <StringList
        label="Options — every card is answered with one of these"
        items={options.length ? options : ['', '']}
        onChange={setOptions}
        placeholder={(i) => `Option ${i + 1}`}
        min={2}
        max={6}
        what="option"
        addLabel="Add option"
      />

      <div className="space-y-2">
        <span style={LABEL}>Cards</span>
        {cards.map((c, i) => (
          <ItemCard
            key={i}
            title={c.label || `Card ${i + 1}`}
            right={(
              <RowButtons
                index={i}
                count={cards.length}
                min={2}
                what="card"
                onMove={(delta) => setCards(moved(cards, i, delta))}
                onRemove={() => setCards(cards.filter((_, j) => j !== i))}
              />
            )}
          >
            <Field label="Label" value={c.label || ''} onChange={(label) => patchAt(i, { label })}
              placeholder={`Card ${i + 1}`} />
            <StringList
              label="Lines"
              items={c.lines?.length ? c.lines : ['']}
              onChange={(lines) => patchAt(i, { lines })}
              placeholder={() => 'A line on the card'}
              min={1}
              max={8}
              what="line"
              addLabel="Add line"
            />
            <label className="block">
              <span style={LABEL}>Correct option</span>
              <select
                value={options.includes(c.correct) ? c.correct : ''}
                onChange={(e) => patchAt(i, { correct: e.target.value })}
                style={{ ...INPUT, background: options.includes(c.correct) ? '#fff' : 'rgba(254,243,199,0.6)' }}
              >
                <option value="">— pick the answer —</option>
                {options.map((o, j) => (
                  <option key={j} value={o}>{o || `Option ${j + 1}`}</option>
                ))}
              </select>
            </label>
            <Field label="Explanation" value={c.explanation || ''} onChange={(explanation) => patchAt(i, { explanation })} area
              placeholder="Why this card matches that option" />
          </ItemCard>
        ))}
        <AddButton
          label="Add card"
          onClick={() => setCards([...cards, {
            label: String.fromCharCode(65 + cards.length),
            lines: [''],
            correct: '',
            explanation: '',
          }])}
          disabled={cards.length >= 6}
          hint={`${cards.length}/6`}
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span style={LABEL}>Reference table (optional)</span>
          {reference ? (
            <button
              type="button"
              onClick={() => set({ reference: undefined })}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
              style={{ fontSize: 11.5, fontWeight: 600, color: '#B91C1C', borderColor: 'rgba(239,68,68,0.3)', background: '#fff' }}
            >
              <Trash2 size={11} /> Remove table
            </button>
          ) : null}
        </div>
        {reference ? (
          <TutorialV3ReferenceTableEditor
            content={reference}
            onChange={(next) => set({ reference: next })}
          />
        ) : (
          <AddButton
            label="Add a reference table"
            onClick={() => set({ reference: { columns: ['', ''], rows: [['', '']] } })}
            hint="The key a learner reads against while matching"
          />
        )}
      </div>

      <Field label="Closing" value={str(content.closing)} onChange={(closing) => set({ closing })} area
        placeholder="A line to end on (optional)" />
      <p style={NOTE}>
        A card whose answer is blank is dropped when the block is re-read, so pick an option for
        every card. Renaming an option updates the cards that answered with it.
      </p>
      <p style={SAVED}>Edits save with the tutorial.</p>
    </div>
  );
}

/* ─── opening question ──────────────────────────────────────────── */

interface HandRowLite { suit: string; cards: string }
interface AuctionCallLite { seat: string; bid: string }

const SUITS = ['♠', '♥', '♦', '♣'];
const SEATS = ['W', 'N', 'E', 'S'];

function OpeningQuestionEditor({ content, onChange }: EditorProps) {
  const set = (patch: Content) => onChange({ ...content, ...patch });
  const options = strs(content.options);
  const correct = typeof content.correct === 'number' ? content.correct : 0;
  const hand: HandRowLite[] = Array.isArray(content.hand) ? (content.hand as HandRowLite[]) : [];
  const auction: AuctionCallLite[] = Array.isArray(content.auction) ? (content.auction as AuctionCallLite[]) : [];

  /*
    `correct` is an index, so removing or reordering an option moves the right
    answer under it. Every change to the list carries the index with it rather
    than leaving it pointing at whatever landed in that slot.
  */
  const setOptions = (next: string[], nextCorrect?: number) => {
    const c = nextCorrect ?? correct;
    set({ options: next, correct: Math.max(0, Math.min(next.length - 1, c)) });
  };

  return (
    <div className="space-y-3">
      <Field label="Title" value={str(content.title)} onChange={(title) => set({ title })}
        placeholder="The question's own title" />
      <Field label="Label" value={str(content.label)} onChange={(label) => set({ label })}
        placeholder="Opening question" />
      <Field label="Context" value={str(content.context)} onChange={(context) => set({ context })} area
        placeholder="The situation before the question is asked" />

      <div>
        <span style={LABEL}>Hand</span>
        <div className="space-y-1.5 mb-2">
          {hand.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <select
                value={row.suit || SUITS[0]}
                onChange={(e) => set({ hand: hand.map((r, j) => (j === i ? { ...r, suit: e.target.value } : r)) })}
                className="shrink-0"
                style={{ ...INPUT, width: 64, fontSize: 15 }}
                aria-label={`Suit for hand row ${i + 1}`}
              >
                {SUITS.map((su) => <option key={su} value={su}>{su}</option>)}
              </select>
              <input
                className="min-w-0 flex-1"
                value={row.cards || ''}
                onChange={(e) => set({ hand: hand.map((r, j) => (j === i ? { ...r, cards: e.target.value } : r)) })}
                placeholder="A K 9 4 2"
                style={{ ...INPUT, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
              <RowButtons
                index={i}
                count={hand.length}
                min={0}
                what="row"
                onMove={(d) => set({ hand: moved(hand, i, d) })}
                onRemove={() => set({ hand: hand.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>
        <AddButton
          label="Add suit"
          onClick={() => set({ hand: [...hand, { suit: SUITS[hand.length] || SUITS[0], cards: '' }] })}
          disabled={hand.length >= 4}
          hint={hand.length ? `${hand.length}/4` : 'Leave empty for a question with no hand'}
        />
      </div>

      <div>
        <span style={LABEL}>Auction</span>
        <div className="space-y-1.5 mb-2">
          {auction.map((call, i) => (
            <div key={i} className="flex items-center gap-1">
              <select
                value={call.seat || SEATS[i % 4]}
                onChange={(e) => set({ auction: auction.map((a, j) => (j === i ? { ...a, seat: e.target.value } : a)) })}
                className="shrink-0"
                style={{ ...INPUT, width: 72 }}
                aria-label={`Seat for call ${i + 1}`}
              >
                {SEATS.map((se) => <option key={se} value={se}>{se}</option>)}
              </select>
              <input
                className="min-w-0 flex-1"
                value={call.bid || ''}
                onChange={(e) => set({ auction: auction.map((a, j) => (j === i ? { ...a, bid: e.target.value } : a)) })}
                placeholder="1♠ · Pass · X"
                style={INPUT}
              />
              <RowButtons
                index={i}
                count={auction.length}
                min={0}
                what="call"
                onMove={(d) => set({ auction: moved(auction, i, d) })}
                onRemove={() => set({ auction: auction.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>
        <AddButton
          label="Add call"
          onClick={() => set({ auction: [...auction, { seat: SEATS[auction.length % 4], bid: '' }] })}
          disabled={auction.length >= 12}
          hint={auction.length ? `${auction.length}/12` : 'Leave empty for a question with no auction'}
        />
      </div>

      <Field label="Question" value={str(content.prompt)} onChange={(prompt) => set({ prompt })} area
        placeholder="What the learner is being asked" />

      <div>
        <span style={LABEL}>Options — the radio marks the right answer</span>
        <div className="space-y-1.5 mb-2">
          {(options.length ? options : ['', '']).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="oq-correct"
                checked={correct === i}
                onChange={() => set({ correct: i })}
                aria-label={`Option ${i + 1} is correct`}
                className="shrink-0"
              />
              <input
                className="min-w-0 flex-1"
                value={opt}
                onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                placeholder={`Option ${i + 1}`}
                style={{
                  ...INPUT,
                  borderColor: correct === i ? V3_SAGE_BORDER : 'rgba(0,0,0,0.08)',
                  background: correct === i ? 'rgba(77,124,90,0.06)' : '#fff',
                  fontWeight: correct === i ? 650 : 400,
                }}
              />
              <RowButtons
                index={i}
                count={options.length}
                min={2}
                what="option"
                onMove={(d) => {
                  const to = i + d;
                  if (to < 0 || to >= options.length) return;
                  // The answer follows the option it belongs to.
                  const nextCorrect = correct === i ? to : correct === to ? i : correct;
                  setOptions(moved(options, i, d), nextCorrect);
                }}
                onRemove={() => {
                  const next = options.filter((_, j) => j !== i);
                  setOptions(next, correct > i ? correct - 1 : correct === i ? 0 : correct);
                }}
              />
            </div>
          ))}
        </div>
        <AddButton
          label="Add option"
          onClick={() => setOptions([...options, ''])}
          disabled={options.length >= 6}
          hint={`${options.length}/6`}
        />
      </div>

      <Field label="Feedback" value={str(content.feedback)} onChange={(feedback) => set({ feedback })} area
        placeholder="What the learner is told after answering" />
      <Field label="Key idea" value={str(content.keyIdea)} onChange={(keyIdea) => set({ keyIdea })} area
        placeholder="The one thing to carry into the lesson" />
      <p style={NOTE}>
        Two to six options, and one of them has to be marked correct — a block whose answer does
        not point at an option is dropped when it is re-read.
      </p>
      <p style={SAVED}>Edits save with the tutorial.</p>
    </div>
  );
}

/* ─── dispatch ──────────────────────────────────────────────────── */

const EDITORS: Record<string, (p: EditorProps) => React.JSX.Element> = {
  'lesson-overview': LessonOverviewEditor,
  'lesson-complete': LessonCompleteEditor,
  'quick-decisions': QuickDecisionsEditor,
  matching: MatchingEditor,
  'opening-question': OpeningQuestionEditor,
};

/** Whether this V3 block type can be edited by hand rather than regenerated. */
export function hasV3BlockEditor(type: string | null): boolean {
  return !!type && (type === 'reference-table' || type in EDITORS);
}

export function TutorialV3BlockEditor({
  type,
  content,
  onChange,
}: {
  type: string;
  content: Content;
  onChange: (next: Content) => void;
}) {
  if (type === 'reference-table') {
    return (
      <TutorialV3ReferenceTableEditor
        content={content as unknown as ReferenceTableContent}
        onChange={(next) => onChange(next as unknown as Content)}
      />
    );
  }
  const Editor = EDITORS[type];
  if (!Editor) return null;
  return <Editor content={content} onChange={onChange} />;
}
