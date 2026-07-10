import type { ReactNode } from "react";
import type { MasteryLevel } from "../../types";
import { MASTERY } from "../../constants/ui";

export const laic = {
  bg: "bg-[#f0f2fa]",
  card: "bg-white border border-[#eef2ff] rounded-2xl shadow-sm",
  cardPad: "bg-white border border-[#eef2ff] rounded-2xl shadow-sm p-6",
  border: "border-[#eef2ff]",
  text: "text-[#314158]",
  textMuted: "text-[#62748e]",
  textSub: "text-[#90a1b9]",
  accent: "text-[#432dd7]",
  accentBg: "bg-[#432dd7]",
  accentSoft: "bg-[#eef2ff]",
  darkBtn:
    "bg-[#432dd7] text-white rounded-full px-5 py-2.5 text-sm font-bold hover:bg-[#3730a3] transition-colors disabled:opacity-50",
  outlineBtn:
    "border border-[#e0e7ff] text-[#314158] rounded-full px-5 py-2.5 text-sm font-bold hover:bg-[#eef2ff] transition-colors disabled:opacity-50",
  labelCaps:
    "text-[10px] font-bold tracking-[1.2px] uppercase text-[#90a1b9]",
  sectionTitle: "text-[30px] font-black text-[#312c85] leading-9",
  displaySm: "text-xl font-bold text-[#312c85]",
  font: "font-['Nunito',sans-serif]",
} as const;

export function SectionHead({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <div className="mb-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className={`${laic.sectionTitle} ${laic.font}`}>{title}</h1>
        {meta && <p className={`${laic.labelCaps} ${laic.font}`}>{meta}</p>}
      </div>
      {subtitle && (
        <p className={`mt-2 text-sm ${laic.textMuted} ${laic.font}`}>{subtitle}</p>
      )}
    </div>
  );
}

export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className={`${laic.card} p-5 min-w-0 flex-1`}>
      <p className={`text-2xl font-black ${laic.text} ${laic.font}`}>{value}</p>
      <p className={`${laic.labelCaps} mt-1 ${laic.font}`}>{label}</p>
    </div>
  );
}

export function LaicPanel({
  title,
  badge,
  children,
  className = "",
  titleClassName = "",
}: {
  title?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={`${laic.card} p-6 ${className}`}>
      {(title || badge) && (
        <div className="flex items-center justify-between mb-5">
          {title && (
            <p className={`${laic.labelCaps} ${laic.textSub} ${laic.font} ${titleClassName}`}>
              {title}
            </p>
          )}
          {badge}
        </div>
      )}
      {children}
    </div>
  );
}

export function ThinBar({
  value,
  color = "#615fff",
  className = "",
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`h-0.5 w-full bg-[#eef2ff] rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function HeatmapCell({ level }: { level: MasteryLevel | string | undefined }) {
  const l = (level as MasteryLevel) ?? "not-seen";
  const color = MASTERY[l]?.color ?? "#94a3b8";
  return (
    <div
      className="w-9 h-9 rounded-full shrink-0"
      style={{ backgroundColor: `${color}44`, boxShadow: `inset 0 0 0 1px ${color}66` }}
      title={MASTERY[l]?.label ?? l}
    />
  );
}

export function MasteryLegend() {
  const items = Object.entries(MASTERY) as [MasteryLevel, (typeof MASTERY)[MasteryLevel]][];
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([level, { color, label }]) => (
        <div key={level} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: color }} />
          <span className={`text-[10px] ${laic.textMuted} ${laic.font}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function OutlineAction({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border border-[#e0e7ff] rounded-full px-4 py-2 text-xs font-bold text-[#62748e] hover:bg-[#eef2ff] transition-colors ${laic.font} ${className}`}
    >
      {children}
    </button>
  );
}

export function LaicInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white border border-[#e0e7ff] rounded-2xl px-4 py-3 text-sm text-[#314158] placeholder:text-[#a3b3ff] focus:outline-none focus:ring-2 focus:ring-[#615fff]/30 ${laic.font} ${className}`}
    />
  );
}
