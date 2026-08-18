/**
 * Hand-editing for a reference table — the one V3 block whose shape is a grid.
 *
 * The other generated block types (matching, quick decisions, the lesson
 * covers) are prose in a costume: regenerating them is a reasonable way to
 * change them. A table is not. An author looking at a wrong cell wants to fix
 * that cell, not roll the dice on the whole table again.
 *
 * Bounds match the generator's normalizer — two to five columns, at most
 * twelve rows — so a table typed by hand and a table generated are the same
 * kind of object, and neither can be saved into a shape the other rejects.
 */
import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { ReferenceTableContent } from '../../../../lib/types';
import { V3_SAGE, V3_SAGE_BORDER, V3_SAGE_DARK } from '../../../../lib/tutorialV3/authorTheme';

const MIN_COLS = 2;
const MAX_COLS = 5;
const MAX_ROWS = 12;

const CELL: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 8,
  padding: '7px 9px',
  width: '100%',
  background: '#fff',
  outline: 'none',
};

/** Every row is exactly as wide as the header — pad or trim to match. */
function toWidth(row: string[], width: number): string[] {
  const next = row.slice(0, width);
  while (next.length < width) next.push('');
  return next;
}

export function TutorialV3ReferenceTableEditor({
  content,
  onChange,
}: {
  content: ReferenceTableContent;
  onChange: (next: ReferenceTableContent) => void;
}) {
  const columns = content.columns?.length ? content.columns : ['', ''];
  const rows = (content.rows || []).map((r) => toWidth(r, columns.length));

  const patch = (next: Partial<ReferenceTableContent>) =>
    onChange({ ...content, columns, rows, ...next });

  const setColumn = (i: number, value: string) =>
    patch({ columns: columns.map((c, j) => (j === i ? value : c)) });

  const setCell = (r: number, c: number, value: string) =>
    patch({ rows: rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)) });

  const addColumn = () => {
    if (columns.length >= MAX_COLS) return;
    patch({ columns: [...columns, ''], rows: rows.map((r) => [...r, '']) });
  };

  const removeColumn = (i: number) => {
    if (columns.length <= MIN_COLS) return;
    patch({
      columns: columns.filter((_, j) => j !== i),
      rows: rows.map((r) => r.filter((_, j) => j !== i)),
    });
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    patch({ rows: [...rows, columns.map(() => '')] });
  };

  const removeRow = (i: number) => patch({ rows: rows.filter((_, j) => j !== i) });

  const moveRow = (i: number, delta: number) => {
    const to = i + delta;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    patch({ rows: next });
  };

  return (
    <div className="space-y-3">
      <input
        className="w-full"
        value={content.title || ''}
        onChange={(e) => patch({ title: e.target.value })}
        placeholder="Table title"
        style={{ ...CELL, fontSize: 14, fontWeight: 650 }}
      />

      {/* Wide tables scroll here rather than pushing the page sideways. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: '100%' }}>
          <thead>
            <tr>
              {/* Spacer above the row controls. */}
              <th style={{ width: 28 }} aria-hidden />
              {columns.map((col, i) => (
                <th key={i} style={{ minWidth: 130, textAlign: 'left', verticalAlign: 'top' }}>
                  <div className="flex items-center gap-1">
                    <input
                      className="min-w-0 flex-1"
                      value={col}
                      onChange={(e) => setColumn(i, e.target.value)}
                      placeholder={i === 0 ? 'Looked up…' : `Column ${i + 1}`}
                      style={{ ...CELL, fontWeight: 700, color: V3_SAGE_DARK, background: 'rgba(77,124,90,0.06)', borderColor: V3_SAGE_BORDER }}
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(i)}
                      disabled={columns.length <= MIN_COLS}
                      className="shrink-0 p-1 rounded disabled:opacity-25"
                      title={columns.length <= MIN_COLS ? 'A table needs at least two columns' : `Remove column ${i + 1}`}
                      aria-label={`Remove column ${i + 1}`}
                    >
                      <Trash2 size={12} style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <td style={{ verticalAlign: 'top', paddingTop: 4 }}>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveRow(r, -1)}
                      disabled={r === 0}
                      className="p-0.5 rounded disabled:opacity-20"
                      aria-label={`Move row ${r + 1} up`}
                    >
                      <ChevronUp size={12} style={{ color: '#6B7280' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(r, 1)}
                      disabled={r === rows.length - 1}
                      className="p-0.5 rounded disabled:opacity-20"
                      aria-label={`Move row ${r + 1} down`}
                    >
                      <ChevronDown size={12} style={{ color: '#6B7280' }} />
                    </button>
                  </div>
                </td>
                {row.map((cell, c) => (
                  <td key={c} style={{ verticalAlign: 'top' }}>
                    <div className="flex items-center gap-1">
                      <textarea
                        rows={1}
                        className="min-w-0 flex-1 resize-y"
                        value={cell}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        placeholder={c === 0 ? 'Key' : ''}
                        style={{ ...CELL, fontWeight: c === 0 ? 650 : 400, lineHeight: 1.4 }}
                      />
                      {c === row.length - 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(r)}
                          disabled={rows.length <= 1}
                          className="shrink-0 p-1 rounded disabled:opacity-25"
                          title={rows.length <= 1 ? 'A table needs at least one row' : `Remove row ${r + 1}`}
                          aria-label={`Remove row ${r + 1}`}
                        >
                          <Trash2 size={12} style={{ color: '#EF4444' }} />
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_ROWS}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border disabled:opacity-40"
          style={{ fontSize: 12.5, fontWeight: 650, color: V3_SAGE_DARK, borderColor: V3_SAGE_BORDER, background: '#fff' }}
        >
          <Plus size={12} /> Add row
        </button>
        <button
          type="button"
          onClick={addColumn}
          disabled={columns.length >= MAX_COLS}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border disabled:opacity-40"
          style={{ fontSize: 12.5, fontWeight: 650, color: V3_SAGE_DARK, borderColor: V3_SAGE_BORDER, background: '#fff' }}
        >
          <Plus size={12} /> Add column
        </button>
        <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
          {rows.length}/{MAX_ROWS} rows · {columns.length}/{MAX_COLS} columns
        </span>
      </div>

      <input
        className="w-full"
        value={content.caption || ''}
        onChange={(e) => patch({ caption: e.target.value })}
        placeholder="Caption (optional) — a line under the table"
        style={{ ...CELL, fontSize: 12.5, color: '#374151' }}
      />
      <p style={{ fontSize: 11.5, color: '#9AA3AF', lineHeight: 1.5 }}>
        The first column is what a learner looks up — keep it short, and the same kind of thing on
        every row. Students see this table styled like the rest of the lesson; borders and spacing
        here are for editing only.
      </p>
      <p style={{ fontSize: 11.5, color: V3_SAGE, fontWeight: 600 }}>Edits save with the tutorial.</p>
    </div>
  );
}
