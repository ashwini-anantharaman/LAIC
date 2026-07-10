import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, Globe, Lightbulb } from "lucide-react";
import type { OwlwiseMode } from "../../../constants/owlwiseTheme";
import type { FormattedStudyBlock } from "../../../lib/study-format";
import { coerceStudyText, paragraphsFromStudyText } from "../../../lib/study-sections";
import { StudyRichText } from "../StudyRichText";

const MODE_META: Record<
  OwlwiseMode,
  { label: string; icon: typeof Globe; description: string }
> = {
  narrative: {
    label: "Real world explanation",
    icon: Globe,
    description: "Tap the icons in the corner to hear it explained a different way.",
  },
  interactive: {
    label: "Conversational explanation",
    icon: Lightbulb,
    description: "Tap the icons in the corner to hear it explained a different way.",
  },
  summary: {
    label: "Textbook explanation",
    icon: BookOpen,
    description: "Tap the icons in the corner to hear it explained a different way.",
  },
};

export function StudyStep({
  conceptName,
  heading,
  blocks,
  loading,
  mode,
  availableModes,
  onModeChange,
  onAllSectionsComplete,
}: {
  conceptName: string;
  heading: string;
  blocks: FormattedStudyBlock[];
  loading?: boolean;
  mode: OwlwiseMode;
  availableModes: OwlwiseMode[];
  onModeChange: (m: OwlwiseMode) => void;
  onAllSectionsComplete?: () => void;
}) {
  const meta = MODE_META[mode];
  const ModeIcon = meta.icon;
  const [sectionIndex, setSectionIndex] = useState(0);
  const [checked, setChecked] = useState(false);

  const total = blocks.length;
  const current = blocks[sectionIndex];

  useEffect(() => {
    setSectionIndex(0);
    setChecked(false);
  }, [blocks]);

  useEffect(() => {
    setChecked(false);
  }, [sectionIndex]);

  useEffect(() => {
    if (checked && total > 0 && sectionIndex === total - 1) {
      onAllSectionsComplete?.();
    }
  }, [checked, sectionIndex, total, onAllSectionsComplete]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 sm:p-10 relative">
        <header className="flex items-start justify-between gap-4 mb-6 pb-6 border-b border-zinc-800">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-zinc-500 mb-3">
              Study · {conceptName}
            </p>
            <h2
              className="text-[24px] sm:text-[30px] font-bold text-white leading-tight"
              style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
            >
              <StudyRichText text={coerceStudyText(heading)} />
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0 bg-zinc-950/80 rounded-full p-1 border border-zinc-800">
            {(["narrative", "interactive", "summary"] as OwlwiseMode[]).map((m) => {
              if (!availableModes.includes(m)) return null;
              const Icon = MODE_META[m].icon;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange(m)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    active ? "bg-zinc-800 ring-1 ring-zinc-600" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={MODE_META[m].label}
                >
                  <Icon size={16} className={active ? "text-white" : undefined} />
                </button>
              );
            })}
          </div>
        </header>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950 border border-zinc-800 mb-6">
          <ModeIcon size={14} className="text-zinc-400" />
          <span className="text-xs text-zinc-400">{meta.label}</span>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 animate-pulse text-center py-12">
            Preparing your lesson…
          </p>
        ) : !current ? (
          <p className="text-sm text-zinc-500 text-center py-12">No study content for this lesson yet.</p>
        ) : (
          <>
            <div className="text-center mb-6">
              <p className="text-[11px] tracking-[0.15em] uppercase text-zinc-500 mb-3">
                Section {sectionIndex + 1} of {total}
              </p>
              <div className="flex justify-center gap-1.5 mb-6">
                {blocks.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${
                      i === sectionIndex ? "bg-white" : i < sectionIndex ? "bg-zinc-500" : "bg-zinc-700"
                    }`}
                  />
                ))}
              </div>
            </div>

            <article className="text-left">
              <h3
                className="text-[22px] sm:text-[26px] font-bold text-white mb-5 leading-snug text-center"
                style={{ fontFamily: "'Playfair Display', 'PT Serif', Georgia, serif" }}
              >
                <StudyRichText text={current.title} />
              </h3>
              <div className="space-y-4 mb-8">
                {paragraphsFromStudyText(current.text).map((paragraph, j) => (
                  <p key={j} className="text-[16px] sm:text-[17px] text-zinc-300 leading-[1.8]">
                    <StudyRichText text={paragraph} />
                  </p>
                ))}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Quick check</p>
                <p className="text-sm text-zinc-300 mb-4">{current.check}</p>
                <button
                  type="button"
                  onClick={() => setChecked(true)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                    checked
                      ? "border-emerald-600 text-emerald-400 bg-emerald-500/10"
                      : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {checked ? "Got it ✓" : "I understand this"}
                </button>
              </div>
            </article>

            {sectionIndex < total - 1 && (
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  disabled={!checked}
                  onClick={() => setSectionIndex((i) => i + 1)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-200 text-black text-sm font-semibold disabled:opacity-40"
                >
                  Next section
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-zinc-600 mt-10 pt-6 border-t border-zinc-800 text-center">
          {meta.description}
        </p>
      </div>
    </div>
  );
}
