import { Brain } from "lucide-react";
import { StudyRichText } from "../StudyRichText";

export function HookStep({ headline, subtext }: { headline: string; subtext: string }) {
  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <div className="w-12 h-12 rounded-full border border-zinc-700 bg-zinc-900/80 flex items-center justify-center mx-auto mb-8">
        <Brain size={22} className="text-zinc-300" strokeWidth={1.5} />
      </div>

      <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-zinc-500 mb-5">
        A curious question
      </p>

      <h1
        className="text-[28px] sm:text-[34px] leading-[1.2] font-bold text-white mb-5"
        style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
      >
        <StudyRichText text={headline} />
      </h1>

      <p className="text-[17px] sm:text-[19px] text-zinc-400 leading-relaxed">
        <StudyRichText text={subtext} />
      </p>
    </div>
  );
}
