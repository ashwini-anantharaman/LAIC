import { useEffect, useRef } from "react";
import gsap from "gsap";

export interface AnimationConfig {
  viewBox: string;
  elements: {
    id: string;
    tag: "circle" | "rect" | "line" | "path" | "text";
    attrs: Record<string, string | number>;
    label?: string;
  }[];
  timeline: {
    target: string;
    duration: number;
    delay?: number;
    props: Record<string, string | number>;
    ease?: string;
  }[];
  description: string;
}

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

export function AnimationPlayer({ config }: { config: AnimationConfig }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const safe = config?.elements?.length
    ? { ...config, timeline: Array.isArray(config.timeline) ? config.timeline : [] }
    : {
        viewBox: "0 0 520 220",
        description: "Animation",
        elements: [],
        timeline: [],
      };

  useEffect(() => {
    if (!svgRef.current || !safe.timeline?.length) return;
    const ctx = gsap.context(() => {
      safe.timeline.forEach((step) => {
        const el = svgRef.current?.querySelector(step.target);
        if (!el) return;
        const props = { ...step.props };
        // SVG-friendly defaults: opacity pulses work reliably; scale needs transform-box
        if ("scale" in props) {
          gsap.set(el, { transformOrigin: "50% 50%", transformBox: "fill-box" });
        }
        gsap.fromTo(
          el,
          { opacity: typeof props.opacity === "number" ? 1 - Number(props.opacity) : 0.65 },
          {
            ...props,
            opacity: typeof props.opacity === "number" ? 1 : 1,
            duration: step.duration,
            delay: step.delay ?? 0,
            ease: step.ease ?? "power2.inOut",
            repeat: -1,
            yoyo: true,
          }
        );
      });
    }, svgRef);
    return () => ctx.revert();
  }, [safe]);

  return (
    <div className="relative bg-gradient-to-br from-[#eef2ff] via-[#f8fafc] to-white rounded-2xl border border-[#eef2ff] overflow-hidden p-4">
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 border border-[#eef2ff] rounded-full px-2 py-0.5">
        <span className="text-[10px] text-[#62748e] font-mono">⚡ GSAP · SVG live</span>
      </div>
      <svg ref={svgRef} viewBox={safe.viewBox} className="w-full min-h-[180px]" aria-label={safe.description}>
        {safe.elements.map((el) => {
          const Tag = el.tag as keyof JSX.IntrinsicElements;
          const attrs = normalizeAttrs(el.attrs);
          if (el.tag === "text" && !attrs.children && el.label) {
            return (
              <text key={el.id} id={el.id.replace("#", "")} {...attrs}>
                {el.label}
              </text>
            );
          }
          return <Tag key={el.id} id={el.id.replace("#", "")} {...attrs} />;
        })}
      </svg>
      {safe.description && (
        <p className="text-[11px] text-[#62748e] mt-2 text-center">{safe.description}</p>
      )}
    </div>
  );
}
