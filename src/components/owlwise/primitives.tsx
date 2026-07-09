import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import frame1 from "../../imports/frame-1-owl.png";
import frame2 from "../../imports/frame-2-owl.png";
import frame3 from "../../imports/frame-3-owl.png";
import { owlwise } from "../../constants/owlwiseTheme";

const OWL_FRAMES = [frame1, frame2, frame3];

export function OwlAnim({ className = "" }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % 3), 130);
    return () => clearInterval(id);
  }, []);
  return <img src={OWL_FRAMES[idx]} alt="Owlwise" className={className} />;
}

export function Shell({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className="min-h-screen bg-gray-100 flex items-center justify-center"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div
        className={`relative w-full max-w-[390px] min-h-screen overflow-hidden ${className}`}
        style={{ minHeight: "100svh", ...style }}
      >
        {children}
      </div>
    </div>
  );
}

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
          <path
            d="M8 9.5C8.83 9.5 9.5 10.17 9.5 11S8.83 12.5 8 12.5 6.5 11.83 6.5 11 7.17 9.5 8 9.5z"
            fill="currentColor"
          />
          <path
            d="M3.5 6.5C4.9 5.1 6.85 4.2 8 4.2s3.1.9 4.5 2.3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M1 3.5C2.9 1.6 5.3.5 8 .5s5.1 1.1 7 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeOpacity="0.35" />
          <rect x="2" y="2" width="18" height="8" rx="1.5" fill="currentColor" />
          <path
            d="M22.5 4v4c.83-.37 1.33-1.17 1.33-2S23.33 4.37 22.5 4z"
            fill="currentColor"
            opacity="0.4"
          />
        </svg>
      </div>
    </div>
  );
}

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current ? "w-5 h-1.5 bg-[#602424]" : "w-1.5 h-1.5 bg-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export function ObShell({
  step,
  total,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  children,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-6 pt-4 pb-8">
        <div className="flex items-center justify-between mb-6">
          <button type="button" onClick={onBack} className="w-8 h-8 flex items-center justify-center -ml-1">
            <span className="text-gray-600 text-xl leading-none">‹</span>
          </button>
          <StepDots total={total} current={step} />
          <div className="w-8" />
        </div>
        <div className="flex-1">{children}</div>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={`w-full py-4 rounded-2xl text-[16px] font-semibold transition-all active:scale-[0.98] ${
            nextDisabled ? "bg-gray-200 text-gray-400" : "bg-[#602424] text-white"
          }`}
        >
          {nextLabel}
        </button>
      </div>
    </Shell>
  );
}

export function OwlwisePrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-4 rounded-2xl bg-[${owlwise.burgundy}] text-white text-[16px] font-semibold tracking-tight active:scale-[0.98] transition-transform disabled:opacity-50 ${className}`}
      style={{ backgroundColor: owlwise.burgundy }}
    >
      {children}
    </button>
  );
}
