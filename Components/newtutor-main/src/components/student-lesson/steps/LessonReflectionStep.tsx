import type { ReactNode } from "react";

export function LessonReflectionStep({
  prompt,
  value,
  onChange,
  onSave,
}: {
  prompt?: string;
  value: string;
  onChange: (text: string) => void;
  onSave?: (text: string) => void;
}) {

  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-zinc-500 mb-4">Reflection</p>
      <h2
        className="text-[28px] sm:text-[34px] font-bold text-white mb-3"
        style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
      >
        What surprised you?
      </h2>
      <p className="text-[15px] text-zinc-400 leading-relaxed mb-8">
        {prompt ||
          "Writing it down in your own words helps it stick. No wrong answers here."}
      </p>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-4 text-left">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="I never realized that neurons don't actually touch..."
          rows={5}
          className="w-full bg-transparent text-zinc-200 text-[15px] leading-relaxed placeholder:text-zinc-600 resize-none outline-none"
        />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
          <p className="text-[11px] text-zinc-600">Your reflection stays private</p>
          <button
            type="button"
            onClick={() => onSave?.(value)}
            disabled={!value.trim()}
            className="text-xs font-medium text-zinc-400 border border-zinc-700 rounded-full px-4 py-1.5 disabled:opacity-40 hover:text-white"
          >
            Save reflection
          </button>
        </div>
      </div>
    </div>
  );
}
