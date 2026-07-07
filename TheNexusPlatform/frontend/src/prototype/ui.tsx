import { useId } from "react";
import type { ReactNode, ElementType } from "react";

// ─── Design tokens (shared with the auth flow in app/App.tsx) ──────────────────

export const BASE = "#1a1a1e";
export const PANEL = "#141417";
export const CARD = "rgba(255,255,255,0.04)";
export const CARD_HOVER = "rgba(255,255,255,0.07)";
export const INPUT_BG = "#222228";
export const BORDER = "rgba(255,255,255,0.09)";
export const BORDER_STRONG = "rgba(255,255,255,0.16)";
export const MUTED = "rgba(255,255,255,0.40)";
export const FAINT = "rgba(255,255,255,0.25)";
export const FONT_HEAD = "'Space Grotesk', sans-serif";
export const FONT_BODY = "'DM Sans', sans-serif";

export const ATMO = [
  "radial-gradient(ellipse 80% 70% at 0% 100%, rgba(130,30,22,0.55) 0%, transparent 55%)",
  "radial-gradient(ellipse 60% 55% at 90% 5%,  rgba(48,26,78,0.45) 0%, transparent 55%)",
  "radial-gradient(ellipse 50% 40% at 45% 60%, rgba(14,10,24,0.60) 0%, transparent 60%)",
  BASE,
].join(", ");

export const slide = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.34, ease: [0.25, 0.1, 0.25, 1] as const },
};

// ─── Grain overlay ─────────────────────────────────────────────────────────────

export function Grain({ opacity = 0.18 }: { opacity?: number }) {
  const raw = useId();
  const id = "g" + raw.replace(/[^a-z0-9]/gi, "");
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none select-none fixed inset-0 w-full h-full z-0"
      style={{ opacity, mixBlendMode: "overlay" }}
    >
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="linearRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

export function Card({
  children, className = "", hover = false, onClick, style,
}: {
  children: ReactNode; className?: string; hover?: boolean;
  onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl ${hover ? "transition-all duration-150 cursor-pointer" : ""} ${className}`}
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        ...(hover ? {} : {}),
        ...style,
      }}
      onMouseEnter={hover ? (e) => (e.currentTarget.style.background = CARD_HOVER) : undefined}
      onMouseLeave={hover ? (e) => (e.currentTarget.style.background = CARD) : undefined}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
      {children}
    </p>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "violet" | "locked" }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "rgba(255,255,255,0.08)", fg: "rgba(255,255,255,0.6)" },
    green: { bg: "rgba(52,199,120,0.14)", fg: "#5fd39a" },
    amber: { bg: "rgba(230,170,60,0.14)", fg: "#e6b25a" },
    violet: { bg: "rgba(150,110,230,0.16)", fg: "#b39aec" },
    locked: { bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.35)" },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
      style={{ background: t.bg, color: t.fg, fontFamily: FONT_BODY }}
    >
      {children}
    </span>
  );
}

export function PrimaryBtn({ children, onClick, Icon, className = "" }: { children: ReactNode; onClick?: () => void; Icon?: ElementType; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-white text-[#111] text-sm font-semibold tracking-tight hover:bg-white/90 active:scale-[0.98] transition-all duration-150 focus:outline-none ${className}`}
      style={{ fontFamily: FONT_BODY }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function GhostBtn({ children, onClick, Icon, active = false, className = "" }: { children: ReactNode; onClick?: () => void; Icon?: ElementType; active?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-sm font-medium transition-all duration-150 focus:outline-none active:scale-[0.98] ${className}`}
      style={{
        fontFamily: FONT_BODY,
        color: active ? "#fff" : MUTED,
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        border: `1px solid ${active ? BORDER_STRONG : BORDER}`,
      }}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; Icon?: ElementType }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 w-fit rounded-xl p-1 flex-wrap" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 focus:outline-none"
            style={{ background: on ? "rgba(255,255,255,0.9)" : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}
          >
            {t.Icon && <t.Icon size={14} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ pct, tint = "#fff" }: { pct: number; tint?: string }) {
  return (
    <div className="h-[6px] rounded-full w-full" style={{ background: "rgba(255,255,255,0.09)" }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: tint }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card className="p-5">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 text-3xl font-bold text-white leading-none" style={{ fontFamily: FONT_HEAD }}>{value}</p>
      {sub && <p className="mt-1.5 text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{sub}</p>}
    </Card>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{children}</h2>
      {sub && <p className="mt-1 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>{sub}</p>}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl px-5 py-8 text-center" style={{ border: `1px dashed ${BORDER_STRONG}` }}>
      <p className="text-sm" style={{ color: FAINT, fontFamily: FONT_BODY }}>{children}</p>
    </div>
  );
}
