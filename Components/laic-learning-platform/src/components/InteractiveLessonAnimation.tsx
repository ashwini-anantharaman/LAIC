import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
import gsap from "gsap";
import type { InteractiveAnimationConfig, InteractiveDiagramElement } from "../types/interactiveAnimation";

function toSvgPropKey(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalizeAttrs(attrs: Record<string, string | number>) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[toSvgPropKey(k)] = v;
  }
  return out;
}

function Diagram({ elements, emphasisId }: { elements: InteractiveDiagramElement[]; emphasisId?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const ctx = gsap.context(() => {
      elements.forEach((el) => {
        const node = svgRef.current?.querySelector(`#${CSS.escape(el.id)}`);
        if (!node) return;
        const emphasized = el.id === emphasisId;
        gsap.fromTo(
          node,
          { opacity: 0, scale: emphasized ? 0.92 : 1 },
          { opacity: emphasized ? 1 : 0.55, scale: emphasized ? 1.04 : 1, duration: 0.45, ease: "power2.out" }
        );
        if (emphasized) {
          gsap.to(node, {
            opacity: 1,
            scale: 1,
            duration: 1.2,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            delay: 0.5,
          });
        }
      });
    }, svgRef);
    return () => ctx.revert();
  }, [elements, emphasisId]);

  return (
    <svg ref={svgRef} viewBox="0 0 400 200" className="w-full h-full" aria-hidden>
      {elements.map((el) => {
        const Tag = el.tag as keyof JSX.IntrinsicElements;
        const attrs = normalizeAttrs(el.attrs);
        const id = el.id.replace(/^#/, "");
        if (el.tag === "text") {
          return (
            <text key={el.id} id={id} {...attrs}>
              {el.label ?? ""}
            </text>
          );
        }
        return <Tag key={el.id} id={id} {...attrs} />;
      })}
    </svg>
  );
}

export function InteractiveLessonAnimation({ config }: { config: InteractiveAnimationConfig }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = config.steps;
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const go = (next: number) => setStepIndex(Math.max(0, Math.min(steps.length - 1, next)));
  const restart = () => setStepIndex(0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 bg-[#fafbfc]">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={16} className="text-[#2563eb] shrink-0" />
          <p className="text-sm font-semibold text-gray-900 truncate">{config.title}</p>
        </div>
        <span className="text-[11px] font-medium text-gray-400 shrink-0">
          Step {stepIndex + 1} of {steps.length}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-0 md:gap-0 min-h-[280px]">
        <div className="p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-3 leading-snug">{step.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{step.body}</p>
        </div>

        <div className="p-4 bg-gradient-to-br from-[#eff6ff] to-[#f8fafc] flex items-center justify-center min-h-[200px]">
          {step.diagram?.elements?.length ? (
            <div className="w-full max-w-md aspect-[2/1]">
              <Diagram elements={step.diagram.elements} emphasisId={step.diagram.emphasisId} />
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center px-4">Visual for this step</p>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 bg-white">
        <button
          type="button"
          onClick={() => go(stepIndex - 1)}
          disabled={isFirst}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${
                i === stepIndex ? "w-6 bg-[#2563eb]" : "w-2 bg-gray-300 hover:bg-gray-400"
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {isLast ? (
          <button
            type="button"
            onClick={restart}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-[#2563eb] hover:bg-blue-50"
          >
            <RotateCcw size={14} />
            Replay
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go(stepIndex + 1)}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8]"
          >
            Next
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
