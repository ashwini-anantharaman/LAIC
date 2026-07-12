import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";

import frame1 from "../imports/frame-1-owl.png";
import frame2 from "../imports/frame-2-owl.png";
import frame3 from "../imports/frame-3-owl.png";

// ── Brand ─────────────────────────────────────────────────────────────────────
export const BRAND = "Life in AI Center";
export const MAROON = "#602424";
export const DARK = "#2c0312";
export const CREAM = "#fdf8f5";

// ── Navigation ─────────────────────────────────────────────────────────────────
export type Screen =
  | "splash"
  | "login"
  | "ob1" | "ob3"
  | "courses" | "unit"
  | "t-login" | "t-ob1" | "t-ob2" | "t-ob3"
  | "t-upload" | "t-builder" | "t-app";

export const SCREEN_ORDER: Screen[] = [
  "splash", "login", "ob1", "ob3", "courses", "unit",
  "t-login", "t-ob1", "t-ob2", "t-ob3", "t-upload", "t-builder", "t-app",
];

export type Nav = (s: Screen) => void;

// ── Owl animation ──────────────────────────────────────────────────────────────
const OWL_FRAMES = [frame1, frame2, frame3];

export function OwlAnim({ className = "" }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % 3), 130);
    return () => clearInterval(id);
  }, []);
  return <img src={OWL_FRAMES[idx]} alt={BRAND} className={className} style={{ imageRendering: "auto" }} />;
}

// ── Mobile shell ───────────────────────────────────────────────────────────────
export function Shell({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div
        className={`relative w-full max-w-[390px] min-h-screen overflow-hidden ${className}`}
        style={{ minHeight: "100svh", ...style }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Status bar ─────────────────────────────────────────────────────────────────
export function StatusBar({ light = false }: { light?: boolean }) {
  const c = light ? "text-white" : "text-black";
  return (
    <div className={`flex justify-between items-center px-6 pt-3 pb-1 text-[13px] font-semibold ${c}`}>
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0" y="7" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.4" />
          <rect x="4.5" y="4.5" width="3" height="7.5" rx="0.5" fill="currentColor" opacity="0.6" />
          <rect x="9" y="2" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.8" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5C8.83 9.5 9.5 10.17 9.5 11S8.83 12.5 8 12.5 6.5 11.83 6.5 11 7.17 9.5 8 9.5z" fill="currentColor" />
          <path d="M3.5 6.5C4.9 5.1 6.85 4.2 8 4.2s3.1.9 4.5 2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M1 3.5C2.9 1.6 5.3.5 8 .5s5.1 1.1 7 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.5" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeOpacity="0.35" />
          <rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor" />
          <path d="M22.5 4v4c.83-.37 1.33-1.17 1.33-2S23.33 4.37 22.5 4z" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

// ── Step dots ──────────────────────────────────────────────────────────────────
export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${i === current ? "w-5 h-1.5 bg-[#602424]" : "w-1.5 h-1.5 bg-gray-300"}`}
        />
      ))}
    </div>
  );
}

// ── Slide transition ───────────────────────────────────────────────────────────
export function Slide({ children, dir = 1 }: { children: React.ReactNode; dir?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: dir * 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: dir * -28 }}
      transition={{ duration: 0.28, ease: [0.32, 0, 0.18, 1] }}
      className="size-full"
    >
      {children}
    </motion.div>
  );
}

// ── Onboarding shell (shared by student + teacher) ──────────────────────────────
export function ObShell({
  step,
  total,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  eyebrow,
  children,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-6 pt-4 pb-8">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center -ml-1">
            <ChevronLeft size={22} className="text-gray-600" />
          </button>
          <StepDots total={total} current={step} />
          <div className="w-8" />
        </div>
        {eyebrow && (
          <p className="text-[11px] font-semibold text-[#602424] uppercase tracking-widest mb-2">{eyebrow}</p>
        )}
        <div className="flex-1">{children}</div>
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className={`w-full py-4 rounded-2xl text-[16px] font-semibold transition-all active:scale-[0.98] ${nextDisabled ? "bg-gray-200 text-gray-400" : "bg-[#602424] text-white"}`}
        >
          {nextLabel}
        </button>
      </div>
    </Shell>
  );
}

// ── Text field ─────────────────────────────────────────────────────────────────
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-gray-700">{label}</label>
      <input
        {...props}
        className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 transition-all"
      />
    </div>
  );
}
