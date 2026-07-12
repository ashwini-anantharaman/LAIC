import { PartyPopper } from "lucide-react";

export function UnitCompleteModal({
  conceptName,
  nextConceptName,
  onContinue,
}: {
  conceptName: string;
  nextConceptName?: string;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] bg-[#1a1a1a] text-white p-10 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-5">
          <PartyPopper size={28} className="text-emerald-400" />
        </div>
        <h2
          className="text-2xl font-bold mb-3"
          style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
        >
          Unit complete!
        </h2>
        <p className="text-zinc-400 text-[15px] leading-relaxed mb-8">
          You&apos;ve mastered <strong className="text-white font-semibold">{conceptName}</strong>.
          {nextConceptName ? (
            <>
              {" "}
              <strong className="text-white font-semibold">{nextConceptName}</strong> is now unlocked.
            </>
          ) : (
            " Great work finishing this module."
          )}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3.5 rounded-full bg-zinc-200 text-black font-semibold text-[15px] hover:bg-white transition-colors"
        >
          Keep going
        </button>
      </div>
    </div>
  );
}
