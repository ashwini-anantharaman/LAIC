import { useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { FlashcardItem } from "../../FlashcardDeck";

export function LessonFlashcardsStep({ cards }: { cards: FlashcardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) {
    return <p className="text-zinc-500 text-sm text-center">No flashcards for this lesson yet.</p>;
  }

  const card = cards[index];
  const total = cards.length;

  const next = () => {
    setFlipped(false);
    setIndex((i) => Math.min(total - 1, i + 1));
  };

  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-zinc-500 mb-2">
        Flashcards · Review
      </p>
      <h2
        className="text-[26px] sm:text-[30px] font-bold text-white mb-2"
        style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
      >
        Lock it into memory
      </h2>
      <p className="text-sm text-zinc-500 mb-8">
        Card {index + 1} of {total} · tap to flip
      </p>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/80 p-8 sm:p-10 min-h-[220px] flex flex-col items-center justify-center mb-4 transition-all hover:border-zinc-700"
      >
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
          {flipped ? "Answer" : "Question"}
        </p>
        <p
          className="text-[18px] sm:text-[20px] text-white leading-relaxed"
          style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
        >
          {flipped ? card.back : card.front}
        </p>
        <p className="text-xs text-zinc-600 mt-6 flex items-center gap-1">
          <RotateCcw size={12} /> Tap to {flipped ? "hide" : "reveal"}
        </p>
      </button>

      {index < total - 1 && (
        <button
          type="button"
          onClick={next}
          className="inline-flex items-center gap-1 text-sm text-zinc-400 border border-zinc-700 rounded-full px-4 py-2 hover:text-white"
        >
          Next card
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
