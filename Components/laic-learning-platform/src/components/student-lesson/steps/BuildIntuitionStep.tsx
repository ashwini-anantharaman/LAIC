import { Sparkles } from "lucide-react";
import type { ContentBlock } from "../../../types";
import { AnimationPanel } from "../../AnimationPanel";
import { StudyRichText } from "../StudyRichText";

function SynapseFallback() {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 sm:p-10">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="text-center flex-1">
          <div className="w-16 h-16 rounded-full bg-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-300 font-medium">Neuron A</p>
          <p className="text-[11px] text-zinc-500">Sends the signal</p>
        </div>
        <div className="flex-1 text-center px-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">synaptic cleft</p>
          <div className="flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${i === 1 ? "bg-white shadow-[0_0_8px_white]" : "bg-zinc-600"}`} />
            ))}
          </div>
        </div>
        <div className="text-center flex-1">
          <div className="w-16 h-16 rounded-full bg-zinc-800 mx-auto mb-2" />
          <p className="text-sm text-zinc-300 font-medium">Neuron B</p>
          <p className="text-[11px] text-zinc-500">Receives it</p>
        </div>
      </div>
      <p className="text-center text-xs text-zinc-500 bg-zinc-950/80 rounded-full py-2 px-4 mx-auto w-fit">
        Animation: neurotransmitters crossing the synaptic cleft
      </p>
    </div>
  );
}

export function BuildIntuitionStep({
  title,
  body,
  animationBlock,
}: {
  title: string;
  body: string;
  animationBlock?: ContentBlock;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto text-center">
      <div className="flex items-center justify-center gap-1.5 mb-4">
        <Sparkles size={14} className="text-zinc-400" />
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-zinc-500">Build intuition</p>
      </div>

      <h2
        className="text-[26px] sm:text-[32px] font-bold text-white mb-4 leading-tight"
        style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
      >
        {title}
      </h2>

      <p className="text-[15px] sm:text-[17px] text-zinc-400 leading-relaxed mb-8 max-w-lg mx-auto">
        <StudyRichText text={body} />
      </p>

      <div className="text-left [&_.rounded-2xl]:rounded-3xl [&_.border-gray-200]:border-zinc-800">
        {animationBlock ? <AnimationPanel block={animationBlock} /> : <SynapseFallback />}
      </div>
    </div>
  );
}
