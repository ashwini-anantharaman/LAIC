import React from 'react';

export interface FolderTint {
  /** Solid pastel body fill */
  from: string;
  /** Solid pastel tab (slightly deeper) */
  mid: string;
  /** Kept for API compat — unused for solid fills */
  to: string;
  /** Accent for owl ring / edge */
  deep: string;
  glow: string;
}

/** Soft pastel solids — cycles across collections. */
export const FOLDER_TINTS: FolderTint[] = [
  { from: '#FBCFE8', mid: '#F9A8D4', to: '#FBCFE8', deep: '#DB2777', glow: 'rgba(251,207,232,0.7)' },
  { from: '#FECACA', mid: '#FCA5A5', to: '#FECACA', deep: '#DC2626', glow: 'rgba(254,202,202,0.7)' },
  { from: '#FED7AA', mid: '#FDBA74', to: '#FED7AA', deep: '#EA580C', glow: 'rgba(254,215,170,0.7)' },
  { from: '#FEF08A', mid: '#FDE047', to: '#FEF08A', deep: '#CA8A04', glow: 'rgba(254,240,138,0.7)' },
  { from: '#BBF7D0', mid: '#86EFAC', to: '#BBF7D0', deep: '#16A34A', glow: 'rgba(187,247,208,0.7)' },
  { from: '#99F6E4', mid: '#5EEAD4', to: '#99F6E4', deep: '#0D9488', glow: 'rgba(153,246,228,0.7)' },
  { from: '#BAE6FD', mid: '#7DD3FC', to: '#BAE6FD', deep: '#0284C7', glow: 'rgba(186,230,253,0.7)' },
  { from: '#BFDBFE', mid: '#93C5FD', to: '#BFDBFE', deep: '#2563EB', glow: 'rgba(191,219,254,0.7)' },
  { from: '#DDD6FE', mid: '#C4B5FD', to: '#DDD6FE', deep: '#7C3AED', glow: 'rgba(221,214,254,0.7)' },
  { from: '#E9D5FF', mid: '#D8B4FE', to: '#E9D5FF', deep: '#9333EA', glow: 'rgba(233,213,255,0.7)' },
];

export function tintForKey(key: string): FolderTint {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FOLDER_TINTS[h % FOLDER_TINTS.length];
}

const OWL_SRC = '/owl-logo.png';

export function GlassFolder({
  id,
  size = 88,
  selected = false,
  tint,
}: {
  id: string;
  size?: number;
  selected?: boolean;
  tint?: FolderTint;
}) {
  const colors = tint || tintForKey(id);
  const w = size;
  const h = size * 0.82;
  const owlSize = Math.round(size * 0.34);

  return (
    <div
      className="relative shrink-0"
      style={{
        width: w,
        height: h,
        // Flat pastel folders — no colored glow / halo
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))',
      }}
    >
      <svg width={w} height={h} viewBox="0 0 100 82" fill="none" aria-hidden>
        {/* Tab — solid pastel */}
        <path
          d="M10 18C10 13.6 13.6 10 18 10H38C40.2 10 42.2 11.1 43.4 12.9L47.2 18.5C48.4 20.3 50.4 21.4 52.6 21.4H82C86.4 21.4 90 25 90 29.4V36H10V18Z"
          fill={colors.mid}
        />
        {/* Body — solid pastel */}
        <path
          d="M8 30C8 25.6 11.6 22 16 22H84C88.4 22 92 25.6 92 30V66C92 72.6 86.6 78 80 78H20C13.4 78 8 72.6 8 66V30Z"
          fill={colors.from}
        />
        <path
          d="M8 30C8 25.6 11.6 22 16 22H84C88.4 22 92 25.6 92 30V66C92 72.6 86.6 78 80 78H20C13.4 78 8 72.6 8 66V30Z"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.2"
        />
      </svg>

      {/* Owl logo */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ paddingTop: size * 0.14 }}
      >
        <div
          style={{
            width: owlSize,
            height: owlSize,
            borderRadius: '50%',
            overflow: 'hidden',
            background: colors.mid,
            boxShadow: `inset 0 0 0 1.5px ${colors.deep}33`,
          }}
        >
          <img
            src={OWL_SRC}
            alt=""
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.9,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function GlassFolderTile({
  id,
  name,
  count,
  selected,
  opened,
  onClick,
  onDoubleClick,
  onRename,
  onDelete,
  canDelete,
  renaming,
  renameValue,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  theme = 'light',
  tint,
}: {
  id: string;
  name: string;
  count: number;
  selected?: boolean;
  opened?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  renaming?: boolean;
  renameValue?: string;
  onRenameValueChange?: (v: string) => void;
  onCommitRename?: () => void;
  onCancelRename?: () => void;
  theme?: 'light' | 'dark';
  tint?: FolderTint;
}) {
  const dark = theme === 'dark';
  const active = !!(selected || opened);
  const titleColor = dark
    ? (active ? '#FFFFFF' : 'rgba(248,250,252,0.92)')
    : '#0B1220';
  const metaColor = dark ? 'rgba(248,250,252,0.45)' : '#9AA3AF';

  return (
    <div className="group relative flex flex-col items-center w-[108px]">
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={(e) => {
          e.preventDefault();
          onDoubleClick?.();
        }}
        title="Double-click to open"
        className="flex flex-col items-center gap-2 rounded-2xl px-2 pt-2 pb-1 transition-colors w-full"
        style={{
          background: active
            ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
            : 'transparent',
          boxShadow: 'none',
          outline: 'none',
        }}
      >
        <GlassFolder id={id} size={86} selected={active} tint={tint} />
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameValueChange?.(e.target.value)}
            onBlur={() => onCommitRename?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename?.();
              if (e.key === 'Escape') onCancelRename?.();
            }}
            className="w-full rounded-lg px-1.5 py-0.5 text-center outline-none"
            style={{
              fontSize: 12,
              border: dark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.12)',
              fontWeight: 600,
              background: dark ? 'rgba(0,0,0,0.35)' : 'white',
              color: dark ? '#fff' : '#0B1220',
            }}
          />
        ) : (
          <>
            <span
              className="w-full text-center truncate px-0.5"
              style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: titleColor, lineHeight: 1.25 }}
            >
              {name}
            </span>
            <span style={{ fontSize: 10.5, color: metaColor, marginTop: -4 }}>
              {count} item{count === 1 ? '' : 's'}
            </span>
          </>
        )}
      </button>
      {selected && !renaming && (onRename || onDelete) && (
        <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onRename && (
            <button
              type="button"
              title="Rename"
              onClick={(e) => { e.stopPropagation(); onRename(); }}
              className="px-2 py-0.5 rounded-full"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: dark ? 'rgba(248,250,252,0.85)' : '#6B7280',
                background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
              }}
            >
              Rename
            </button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="px-2 py-0.5 rounded-full"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: dark ? '#FDBA74' : '#B45309',
                background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
