import type { InteractiveAnimationConfig } from "../types/interactiveAnimation";
import type { Scene3DConfig } from "../types/scene3d";

/** Convert legacy R3F scene blocks into step-by-step interactive content for display. */
export function scene3dToInteractive(scene: Scene3DConfig, description?: string): InteractiveAnimationConfig {
  const labeled = scene.objects.filter((o) => o.label);
  const objects = labeled.length ? labeled : scene.objects.slice(0, 5);

  const introBody =
    description?.trim() ||
    scene.description?.trim() ||
    "Explore how the parts of this concept fit together.";

  const steps: InteractiveAnimationConfig["steps"] = [
    {
      title: "Overview",
      body: introBody,
      diagram: {
        viewBox: "0 0 400 200",
        emphasisId: objects[0]?.id ?? "a",
        elements: objects.slice(0, 4).map((o, i) => ({
          id: o.id,
          tag: "rect" as const,
          attrs: {
            x: 40 + i * 90,
            y: 70,
            width: 70,
            height: 60,
            rx: 8,
            fill: o.color || "#dbeafe",
            stroke: "#2563eb",
            strokeWidth: 2,
          },
          ...(o.label ? { label: o.label } : {}),
        })),
      },
    },
  ];

  objects.forEach((o, i) => {
    if (i === 0 && objects.length === 1) return;
    steps.push({
      title: o.label || `Part ${i + 1}`,
      body: o.label
        ? `This part represents ${o.label}. Focus on how it connects to the rest of the concept.`
        : `Examine element ${i + 1} and how it relates to the overall idea.`,
      diagram: {
        viewBox: "0 0 400 200",
        emphasisId: o.id,
        elements: [
          {
            id: o.id,
            tag: "rect",
            attrs: { x: 120, y: 50, width: 160, height: 100, rx: 12, fill: o.color || "#2563eb", stroke: "#1e3a8a", strokeWidth: 2 },
          },
          ...(o.label
            ? [
                {
                  id: `${o.id}-lbl`,
                  tag: "text" as const,
                  attrs: { x: 200, y: 108, textAnchor: "middle", fill: "#ffffff", fontSize: 14 },
                  label: o.label,
                },
              ]
            : []),
        ],
      },
    });
  });

  if (steps.length < 2) {
    steps.push({
      title: "Key takeaway",
      body: "Review the main idea and try applying it in the practice questions below.",
      diagram: {
        viewBox: "0 0 400 200",
        emphasisId: "done",
        elements: [
          { id: "done", tag: "circle", attrs: { cx: 200, cy: 100, r: 44, fill: "#2563eb" } },
          { id: "ok", tag: "text", attrs: { x: 200, y: 108, textAnchor: "middle", fill: "#fff", fontSize: 22 }, label: "✓" },
        ],
      },
    });
  }

  return {
    title: scene.description?.slice(0, 60) || "Lesson walkthrough",
    steps: steps.slice(0, 6),
  };
}
