import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { OwlAnim } from "../owlwise/primitives";
import owlAvatar from "../../imports/InteractiveMode-1/2da62d230eab2fcaa09dc117f216257b17160f6a.png";

export type LessonConceptNav = {
  id: string;
  name: string;
  status: "completed" | "current" | "upcoming";
};

export function LessonShell({
  concepts,
  stepIndex,
  totalSteps,
  stepTag,
  footerHint = "Ready when you are",
  continueLabel = "Continue",
  onContinue,
  continueDisabled,
  onBack,
  backLabel = "Back",
  onChatOpen,
  children,
  theme = "dark",
  mainClassName,
}: {
  concepts: LessonConceptNav[];
  stepIndex: number;
  totalSteps: number;
  stepTag: string;
  footerHint?: string;
  continueLabel?: string;
  onContinue: () => void;
  continueDisabled?: boolean;
  onBack?: () => void;
  backLabel?: string;
  onChatOpen?: () => void;
  children: ReactNode;
  theme?: "dark" | "light";
  mainClassName?: string;
}) {
  const dark = theme === "dark";

  return (
    <div
      className={`min-h-screen flex flex-col ${dark ? "bg-black text-white" : "bg-[#fff9f5] text-[#1a1a1a]"}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <header className="shrink-0 px-6 sm:px-10 pt-6 pb-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`flex items-center gap-1.5 text-sm font-medium mb-4 -ml-1 transition-colors ${
              dark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-[#1a1a1a]"
            }`}
          >
            <ArrowLeft size={16} />
            {backLabel}
          </button>
        )}

        <div className="flex items-start justify-between gap-6 mb-5">
          <div className="flex items-center gap-2.5 shrink-0">
            <OwlAnim className="w-9 h-9 object-contain" />
            <span
              className={`text-[22px] font-bold tracking-tight ${dark ? "text-white" : "text-[#1a1a1a]"}`}
              style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
            >
              Owlwise
            </span>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] max-w-[60%]">
            {concepts.map((c) => (
              <span
                key={c.id}
                className={`flex items-center gap-1.5 whitespace-nowrap ${
                  c.status === "current"
                    ? dark
                      ? "text-white"
                      : "text-[#1a1a1a]"
                    : c.status === "completed"
                      ? "text-emerald-500"
                      : dark
                        ? "text-zinc-600"
                        : "text-zinc-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    c.status === "completed"
                      ? "bg-emerald-500"
                      : c.status === "current"
                        ? dark
                          ? "bg-white"
                          : "bg-[#1a1a1a]"
                        : dark
                          ? "bg-zinc-700"
                          : "bg-zinc-300"
                  }`}
                />
                {c.name}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex gap-1 mb-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-[3px] flex-1 rounded-full transition-colors ${
                i <= stepIndex
                  ? dark
                    ? "bg-white"
                    : "bg-[#1a1a1a]"
                  : dark
                    ? "bg-zinc-800"
                    : "bg-zinc-200"
              }`}
            />
          ))}
        </div>

        <p
          className={`text-[11px] font-medium tracking-[0.18em] uppercase ${
            dark ? "text-zinc-500" : "text-[#a0522d]"
          }`}
        >
          {stepTag} · Step {stepIndex + 1} of {totalSteps}
        </p>
      </header>

      <main
        className={
          mainClassName ??
          "flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-8 min-h-0 overflow-y-auto"
        }
      >
        {children}
      </main>

      <footer
        className={`shrink-0 px-6 sm:px-10 py-5 flex items-center justify-between gap-4 border-t ${
          dark ? "border-zinc-900" : "border-zinc-200"
        }`}
      >
        <p className={`text-sm ${dark ? "text-zinc-500" : "text-zinc-500"}`}>{footerHint}</p>
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className={`inline-flex items-center gap-2 px-7 py-3 rounded-full text-[15px] font-semibold transition-all active:scale-[0.98] disabled:opacity-40 ${
            dark ? "bg-zinc-200 text-black hover:bg-white" : "bg-[#1a1a1a] text-white hover:bg-black"
          }`}
        >
          {continueLabel}
          <ArrowRight size={16} />
        </button>
      </footer>

      {onChatOpen && (
        <button
          type="button"
          onClick={onChatOpen}
          className="fixed bottom-6 right-6 w-11 h-11 rounded-full bg-white shadow-lg border border-zinc-200 flex items-center justify-center overflow-hidden hover:scale-105 transition-transform z-40"
          aria-label="Open lesson chat"
        >
          <img src={owlAvatar} alt="" className="w-8 h-8 object-contain" />
        </button>
      )}
    </div>
  );
}
