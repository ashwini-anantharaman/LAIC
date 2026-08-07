/**
 * Shared Define-step UI — same field controls and group layout as ObjectCreator S4.
 */
import React from 'react';
import {
  Check, ChevronDown, Minus, Plus, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  DEFINE_CFG,
  type DefineFieldDef,
} from '../../../lib/defineFieldConfig';

export function DefineField({
  f, val, set,
}: {
  f: DefineFieldDef;
  val: any;
  set: (v: any) => void;
}) {
  const v = val ?? f.default;
  if (f.type === 'area') {
    return (
      <textarea
        value={v || ''}
        onChange={(e) => set(e.target.value)}
        placeholder={f.hint || ''}
        rows={3}
        className="w-full rounded-xl px-3 py-2 resize-none"
        style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
      />
    );
  }
  if (f.type === 'text') {
    return (
      <input
        type="text"
        value={v || ''}
        onChange={(e) => set(e.target.value)}
        placeholder={f.hint || ''}
        className="w-full rounded-xl px-3 py-2"
        style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
      />
    );
  }
  if (f.type === 'pick') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {f.options!.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => set(o)}
            className="px-3 py-1 rounded-full border transition-all"
            style={{
              fontSize: 12,
              fontWeight: v === o ? 650 : 400,
              background: v === o ? '#0B0F1A' : 'rgba(255,255,255,0.8)',
              color: v === o ? '#fff' : '#374151',
              borderColor: v === o ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
            }}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (f.type === 'multi') {
    const arr: string[] = Array.isArray(v)
      ? v
      : (typeof v === 'string' && v ? [v] : (f.default || []));
    return (
      <div className="flex flex-wrap gap-1.5">
        {f.options!.map((o) => {
          const on = arr.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => set(on ? arr.filter((x: string) => x !== o) : [...arr, o])}
              className="flex items-center gap-1 px-3 py-1 rounded-full border transition-all"
              style={{
                fontSize: 12,
                fontWeight: on ? 650 : 400,
                background: on ? '#0B0F1A' : 'rgba(255,255,255,0.8)',
                color: on ? '#fff' : '#374151',
                borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
              }}
            >
              {on && <Check size={11} />}
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (f.type === 'sel') {
    return (
      <div className="relative inline-block">
        <select
          value={v || f.default}
          onChange={(e) => set(e.target.value)}
          className="appearance-none rounded-xl px-3 py-2 pr-7"
          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
        >
          {f.options!.map((o) => <option key={o}>{o}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
      </div>
    );
  }
  if (f.type === 'bool') {
    const on = v ?? f.default;
    return (
      <button type="button" onClick={() => set(!on)} className="flex items-center gap-1.5">
        {on
          ? <ToggleRight size={22} style={{ color: '#059669' }} />
          : <ToggleLeft size={22} style={{ color: '#9AA3AF' }} />}
        <span style={{ fontSize: 12, color: on ? '#059669' : '#9AA3AF' }}>{on ? 'On' : 'Off'}</span>
      </button>
    );
  }
  if (f.type === 'num') {
    const n = typeof v === 'number' ? v : (f.default ?? 0);
    const hasMax = typeof f.max === 'number';
    if (!hasMax || Number(f.max) > 99) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={f.min ?? 0}
            max={hasMax ? f.max : undefined}
            value={n}
            onChange={(e) => {
              const raw = e.target.value === '' ? (f.min ?? 0) : Number(e.target.value);
              if (!Number.isFinite(raw)) return;
              let next = Math.max(f.min ?? 0, Math.round(raw));
              if (hasMax) next = Math.min(Number(f.max), next);
              set(next);
            }}
            className="w-28 rounded-xl px-3 py-2"
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
          />
          <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
            {f.hint || (hasMax ? `${f.min}–${f.max}` : f.min != null ? `${f.min}+ · no upper limit` : 'no upper limit')}
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(Math.max(f.min ?? 0, n - 1))}
          className="w-7 h-7 rounded-full border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)' }}
        >
          <Minus size={12} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{n}</span>
        <button
          type="button"
          onClick={() => set(Math.min(f.max ?? 99, n + 1))}
          className="w-7 h-7 rounded-full border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)' }}
        >
          <Plus size={12} />
        </button>
        <span style={{ fontSize: 11, color: '#9AA3AF' }}>{f.min}–{f.max}</span>
      </div>
    );
  }
  return null;
}

function fmtType(id: string) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DefineStepForm({
  typeId,
  title,
  setTitle,
  fv,
  setF,
  srcCount = 0,
  extCount = 0,
  clusterCount = 0,
  templateName = null,
  footer,
  afterGroups,
}: {
  typeId: string;
  title: string;
  setTitle: (t: string) => void;
  fv: Record<string, any>;
  setF: (id: string, value: any) => void;
  srcCount?: number;
  extCount?: number;
  clusterCount?: number;
  templateName?: string | null;
  /** Extra controls under a group (e.g. concept-card categories). */
  afterGroups?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const groups = DEFINE_CFG[typeId] || [];

  const chips: string[] = [];
  groups.forEach((g) => g.fields.forEach((f) => {
    if (f.type === 'num') {
      const v = fv[f.id] ?? f.default;
      if (v > 0) chips.push(`${v} ${f.label.toLowerCase()}`);
    }
  }));
  const clusterBit = clusterCount > 0 ? ` · ${clusterCount} cluster${clusterCount !== 1 ? 's' : ''}` : '';
  const blueprint = `${templateName ? `${templateName} · ` : ''}Drawing on ${srcCount} source${srcCount !== 1 ? 's' : ''}${extCount > 0 ? ` · ${extCount} extract${extCount !== 1 ? 's' : ''}` : ''}${clusterBit}${chips.length > 0 ? ` · ${chips.slice(0, 3).join(' · ')}` : ''}. Everything editable after generating. Long drafts paginate in student preview.`;

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em', marginBottom: 5 }}>TITLE</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`e.g. ${fmtType(typeId)} on bidding basics`}
          className="w-full rounded-2xl px-4 py-3"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#0B1220',
            border: '1px solid rgba(0,0,0,0.1)',
            background: 'rgba(255,255,255,0.85)',
            outline: 'none',
          }}
        />
      </div>

      {groups.map((g, gi) => (
        <div
          key={gi}
          className="mb-4 p-4 rounded-2xl border"
          style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}
        >
          {g.title && (
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', marginBottom: g.note ? 2 : 10 }}>
              {g.title}
            </p>
          )}
          {g.note && <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 10 }}>{g.note}</p>}
          {g.fields.map((f) => {
            if (f.id === 'pass' && fv.passOn === false) return null;
            if (f.id === 'hintN' && fv.hintsOn === false) return null;
            return (
              <div key={f.id} className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151' }}>{f.label}</p>
                  {f.type === 'bool' && (
                    <DefineField f={f} val={fv[f.id]} set={(v) => setF(f.id, v)} />
                  )}
                </div>
                {f.type !== 'bool' ? (
                  <DefineField f={f} val={fv[f.id]} set={(v) => setF(f.id, v)} />
                ) : null}
              </div>
            );
          })}
          {typeId === 'concept-card' && g.title === 'Sheet categories' ? afterGroups : null}
        </div>
      ))}

      {!groups.length && (
        <p style={{ fontSize: 13.5, color: '#B45309', marginBottom: 12 }}>
          No Define knobs configured for “{typeId}”.
        </p>
      )}

      <div
        className="p-4 rounded-2xl space-y-3 mb-4"
        style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 0 }}>
          What will be generated
        </p>
        <p style={{ fontSize: 12.5, color: '#065F46' }}>{blueprint}</p>
      </div>

      {footer}
    </div>
  );
}
