import React from 'react';
import {
  Lightbulb, Star, Puzzle, Check, X, AlertTriangle, Link2, HelpCircle, MessagesSquare,
  Clock, Smartphone,
} from 'lucide-react';
import type { ConceptCardContent } from '../../../lib/types';
import {
  normalizeConceptCardContent,
  resolveConceptCategories,
  type ConceptCategoryDef,
  type ConceptCategoryTone,
  categoryBody,
} from '../../../lib/conceptCard';

const TONES: Record<ConceptCategoryTone, { border: string; header: string; body: string; ink: string }> = {
  green:  { border: '#8FBF6A', header: '#D8EFC4', body: '#F5FAF0', ink: '#3F6B2A' },
  yellow: { border: '#E6C84A', header: '#F9E9A0', body: '#FFFBEA', ink: '#8A6D12' },
  blue:   { border: '#8EB8D8', header: '#C8DFF0', body: '#F1F7FC', ink: '#2F5F7F' },
  pink:   { border: '#E8A0A0', header: '#F5C8C8', body: '#FDF2F2', ink: '#8B3A3A' },
  purple: { border: '#A88BC8', header: '#D9C6EA', body: '#F6F1FA', ink: '#5A3D7A' },
  orange: { border: '#E0B060', header: '#F3D7A0', body: '#FFF8EC', ink: '#8A5A12' },
  red:    { border: '#D96B6B', header: '#F0B4B4', body: '#FDF0F0', ink: '#8B2E2E' },
};

function Panel({
  title, tone, icon, children, tall, deco,
}: {
  title: string;
  tone: ConceptCategoryTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tall?: boolean;
  deco?: React.ReactNode;
}) {
  const t = TONES[tone] || TONES.blue;
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1.5px solid ${t.border}`,
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: tall ? 140 : undefined,
        height: '100%',
        fontFamily: "'Nunito', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '8px 12px',
          background: t.header,
          borderBottom: `1px solid ${t.border}`,
          position: 'relative',
        }}
      >
        <span style={{
          fontSize: 12.5,
          fontWeight: 800,
          letterSpacing: '0.04em',
          color: '#1A2333',
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.2,
        }}>
          {title}
        </span>
        {icon && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: t.ink, display: 'flex' }}>
            {icon}
          </span>
        )}
      </div>
      <div style={{
        padding: '12px 14px',
        background: t.body,
        flex: 1,
        position: 'relative',
        fontSize: 13.5,
        lineHeight: 1.5,
        color: '#1F2937',
        fontWeight: 500,
      }}>
        {children}
        {deco && (
          <span style={{ position: 'absolute', right: 10, bottom: 8, opacity: 0.45, color: t.ink, pointerEvents: 'none' }}>
            {deco}
          </span>
        )}
      </div>
    </div>
  );
}

function VisualDiagram({
  choice, alternative, formula, fallback,
}: {
  choice?: string;
  alternative?: string;
  formula?: string;
  fallback?: string;
}) {
  if (!choice && !alternative && !formula) {
    return <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{fallback || '—'}</p>;
  }
  return (
    <div>
      {(choice || alternative) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{
            border: '1.5px solid #A88BC8', borderRadius: 10, padding: '8px 12px',
            background: '#fff', fontWeight: 700, fontSize: 12.5, color: '#5A3D7A', maxWidth: 140, textAlign: 'center',
          }}>
            {choice || 'Choice'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7C5A9A' }}>Gives up</span>
            <span style={{ fontSize: 18, color: '#7C5A9A', lineHeight: 1 }}>→</span>
          </div>
          <div style={{
            border: '1.5px solid #A88BC8', borderRadius: 10, padding: '8px 12px',
            background: '#fff', fontWeight: 700, fontSize: 12.5, color: '#5A3D7A', maxWidth: 140, textAlign: 'center',
          }}>
            {alternative || 'Best alternative'}
          </div>
        </div>
      )}
      {(formula || fallback) && (
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#4B5563', textAlign: 'center' }}>
          {formula || fallback}
        </p>
      )}
    </div>
  );
}

function categoryIcon(id: string) {
  switch (id) {
    case 'meaning': return <Lightbulb size={16} strokeWidth={2.2} />;
    case 'why': return <Star size={16} strokeWidth={2.2} fill="currentColor" />;
    case 'components': return <Puzzle size={16} strokeWidth={2.2} />;
    case 'example': return <Check size={16} strokeWidth={2.6} />;
    case 'nonExample': return <X size={16} strokeWidth={2.6} />;
    case 'mistake': return <AlertTriangle size={16} strokeWidth={2.2} />;
    case 'connection': return <Link2 size={16} strokeWidth={2.2} />;
    case 'recall': return <HelpCircle size={16} strokeWidth={2.2} />;
    case 'teachBack': return <MessagesSquare size={16} strokeWidth={2.2} />;
    default: return null;
  }
}

function categoryDeco(id: string) {
  if (id === 'example') return <Clock size={18} strokeWidth={1.8} />;
  if (id === 'nonExample') return <Smartphone size={18} strokeWidth={1.8} />;
  return null;
}

function PanelBody({ id, content }: { id: string; content: ConceptCardContent }) {
  if (id === 'components') {
    const bullets = content.keyComponents || [];
    if (!bullets.length) return <>{categoryBody(content, id) || '—'}</>;
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {bullets.map((b) => <li key={b} style={{ marginBottom: 4 }}>{b}</li>)}
      </ul>
    );
  }
  if (id === 'visual') {
    return (
      <VisualDiagram
        choice={content.visualChoice}
        alternative={content.visualAlternative}
        formula={content.visualFormula}
        fallback={content.visualOrFormula}
      />
    );
  }
  const text = categoryBody(content, id);
  return <div style={{ paddingRight: categoryDeco(id) ? 22 : 0, whiteSpace: 'pre-wrap' }}>{text || '—'}</div>;
}

function isFullWidth(id: string) {
  return id === 'teachBack' || id.startsWith('custom-');
}

/** Pair enabled categories into rows (2-col when possible). */
function buildRows(cats: ConceptCategoryDef[]): ConceptCategoryDef[][] {
  const rows: ConceptCategoryDef[][] = [];
  let i = 0;
  while (i < cats.length) {
    const a = cats[i];
    if (isFullWidth(a.id)) {
      rows.push([a]);
      i += 1;
      continue;
    }
    const b = cats[i + 1];
    if (b && !isFullWidth(b.id)) {
      rows.push([a, b]);
      i += 2;
    } else {
      rows.push([a]);
      i += 1;
    }
  }
  return rows;
}

/** Concept-card sheet — panels follow Define categories (enabled + labels). */
export function ConceptCardTemplate({ content }: { content: ConceptCardContent }) {
  const c = normalizeConceptCardContent(content);
  const enabled = resolveConceptCategories(c.categories).filter((cat) => cat.enabled);
  const rows = buildRows(enabled);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 18,
        padding: '18px 16px 20px',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 10px 36px -18px rgba(30,50,80,0.28)',
        fontFamily: "'Nunito', system-ui, sans-serif",
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{
          background: '#152238',
          color: '#fff',
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '0.06em',
          padding: '8px 14px',
          borderRadius: 10,
          textTransform: 'uppercase',
        }}>
          Concept Card
        </div>
        <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Concept:</span>
          <span style={{
            flex: 1,
            fontFamily: "'Caveat', cursive",
            fontSize: 26,
            fontWeight: 600,
            color: '#2F6FED',
            lineHeight: 1.1,
            borderBottom: '1.5px solid #C5D0DE',
            paddingBottom: 2,
          }}>
            {c.term || '—'}
          </span>
        </div>
      </div>

      {enabled.length === 0 ? (
        <p style={{ fontSize: 13.5, color: '#9AA3AF', textAlign: 'center', padding: 24 }}>
          No categories selected in Define.
        </p>
      ) : (
        rows.map((row, ri) => {
          const wideCore = row.length === 2 && row[0].id === 'core' && row[1].id === 'components';
          return (
            <div
              key={ri}
              className={`grid grid-cols-1 gap-2.5 mb-2.5 ${row.length === 2 ? (wideCore ? 'sm:grid-cols-[1.25fr_0.85fr]' : 'sm:grid-cols-2') : ''}`}
            >
              {row.map((cat) => (
                <Panel
                  key={cat.id}
                  title={cat.label}
                  tone={(cat.tone as ConceptCategoryTone) || 'blue'}
                  icon={categoryIcon(cat.id)}
                  deco={categoryDeco(cat.id)}
                  tall={cat.id === 'core' || cat.id === 'components'}
                >
                  <PanelBody id={cat.id} content={c} />
                </Panel>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
