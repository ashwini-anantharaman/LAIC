import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

export interface FlashcardItem {
  front: string;
  back: string;
}

export function FlashcardDeck({
  title,
  cards,
}: {
  title?: string;
  cards: FlashcardItem[];
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = cards.length;
  const current = cards[index];

  const goTo = useCallback(
    (next: number) => {
      setFlipped(false);
      setIndex(Math.max(0, Math.min(total - 1, next)));
    },
    [total]
  );

  const flip = useCallback(() => setFlipped((f) => !f), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") goTo(index + 1);
      else if (e.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, goTo, index]);

  if (!total || !current) return null;

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-emerald-800">{title ?? "Flashcards"}</h3>
        <span className="text-xs font-medium text-emerald-600 tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={flip}
          className="group w-full max-w-md [perspective:1200px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 rounded-2xl"
          aria-label={flipped ? "Show question" : "Show answer"}
        >
          <div
            className="relative h-52 w-full transition-transform duration-500 ease-in-out [transform-style:preserve-3d]"
            style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-emerald-200 bg-white px-6 py-8 shadow-md shadow-emerald-100/80 [backface-visibility:hidden]"
              style={{ transform: "rotateY(0deg)" }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-3">
                Term
              </span>
              <p className="text-center text-lg font-semibold text-[#314158] leading-snug">
                {current.front}
              </p>
              <span className="mt-6 text-[11px] text-[#62748e]">Tap to reveal answer</span>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white px-6 py-8 shadow-md shadow-emerald-100/80 [backface-visibility:hidden]"
              style={{ transform: "rotateY(180deg)" }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-3">
                Definition
              </span>
              <p className="text-center text-base text-[#314158] leading-relaxed">{current.back}</p>
              <span className="mt-6 text-[11px] text-[#62748e]">Tap to flip back</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-3 w-full max-w-md">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous card"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 flex justify-center gap-1.5">
            {cards.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-emerald-500" : "w-2 bg-emerald-200 hover:bg-emerald-300"
                }`}
                aria-label={`Go to card ${i + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === total - 1}
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next card"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setFlipped(false)}
          className="flex items-center gap-1.5 text-[11px] text-[#62748e] hover:text-emerald-700 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Reset card
        </button>
      </div>
    </div>
  );
}
