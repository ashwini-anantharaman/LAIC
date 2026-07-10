import { Film, Zap } from "lucide-react";
import type { ContentBlock } from "../types";
import { AnimationPlayer, type AnimationConfig } from "./AnimationPlayer";
import { InteractiveLessonAnimation } from "./InteractiveLessonAnimation";
import type { InteractiveAnimationConfig } from "../types/interactiveAnimation";
import type { Scene3DConfig } from "../types/scene3d";
import { scene3dToInteractive } from "../lib/scene3dToInteractive";

export function isInteractiveBlock(content: Record<string, unknown> | undefined): boolean {
  if (!content) return false;
  return content.renderer === "interactive" && !!content.interactive;
}

export function isR3FBlock(content: Record<string, unknown> | undefined): boolean {
  if (!content) return false;
  return content.renderer === "r3f" && !!content.scene3d;
}

export function isManimBlock(content: Record<string, unknown> | undefined): boolean {
  if (!content) return false;
  return content.renderer === "manim" && !!content.videoUrl;
}

function resolveInteractive(
  c: Record<string, unknown>
): InteractiveAnimationConfig | null {
  if (c.renderer === "interactive" && c.interactive) {
    return c.interactive as InteractiveAnimationConfig;
  }
  if (c.renderer === "r3f" && c.scene3d) {
    return scene3dToInteractive(
      c.scene3d as Scene3DConfig,
      typeof c.description === "string" ? c.description : undefined
    );
  }
  return null;
}

export function AnimationPanel({ block }: { block: ContentBlock }) {
  const c = block.content ?? {};
  const svgConfig = c.animationConfig as AnimationConfig | undefined;
  const videoUrl = c.videoUrl as string | undefined;
  const isManim = c.renderer === "manim" && videoUrl;
  const interactive = resolveInteractive(c);
  const isInteractive = !!interactive;

  if (!isManim && !isInteractive && !svgConfig) return null;

  return (
    <div className="relative">
      {isManim ? (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-[#fafbfc]">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-[#f6339a]" />
              <span className="text-sm font-semibold text-gray-900">Video lesson</span>
            </div>
            <span className="text-[11px] font-medium text-gray-400">Manim · MP4</span>
          </div>
          <div className="p-4">
            <video
              className="w-full rounded-xl bg-[#314158] shadow-inner"
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
            />
            {c.description && (
              <p className="text-xs text-[#62748e] mt-3">{String(c.description)}</p>
            )}
          </div>
        </div>
      ) : isInteractive && interactive ? (
        <InteractiveLessonAnimation config={interactive} />
      ) : svgConfig ? (
        <div className="relative bg-gradient-to-br from-[#eef2ff] via-[#f8fafc] to-white rounded-2xl border border-[#eef2ff] overflow-hidden">
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 border border-[#eef2ff] rounded-full px-2 py-0.5 z-10">
            <Zap className="w-2.5 h-2.5 text-[#f6339a]" />
            <span className="text-[10px] text-[#62748e] font-mono">GSAP · SVG</span>
          </div>
          <AnimationPlayer config={svgConfig} />
          {c.description && (
            <p className="text-xs text-[#62748e] px-4 pb-4">{String(c.description)}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
