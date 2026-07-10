import type {
  Scene3DAnimation,
  Scene3DConfig,
  Scene3DInteraction,
  Scene3DLight,
  Scene3DObject,
  SceneObjectType,
  Vec3,
} from "./scene3dTypes.js";

const ALLOWED_TYPES = new Set<SceneObjectType>(["sphere", "box", "cylinder", "torus", "line"]);
const MAX_OBJECTS = 8;
const MAX_ANIMATIONS = 6;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function asVec3(v: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(v) && v.length >= 3) {
    return [
      clamp(Number(v[0]) || 0, -12, 12),
      clamp(Number(v[1]) || 0, -12, 12),
      clamp(Number(v[2]) || 0, -12, 12),
    ];
  }
  return fallback;
}

function asHexColor(v: unknown, fallback: string): string {
  const s = asString(v, fallback);
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

function coerceObjectType(v: unknown): SceneObjectType {
  const t = asString(v, "sphere").toLowerCase();
  const map: Record<string, SceneObjectType> = {
    sphere: "sphere",
    ball: "sphere",
    box: "box",
    cube: "box",
    cylinder: "cylinder",
    torus: "torus",
    ring: "torus",
    line: "line",
  };
  return map[t] ?? "sphere";
}

function coerceObject(item: Record<string, unknown>, i: number): Scene3DObject | null {
  const type = coerceObjectType(item.type ?? item.shape);
  if (!ALLOWED_TYPES.has(type)) return null;

  const points = Array.isArray(item.points)
    ? item.points.map((p) => asVec3(p, [0, 0, 0])).slice(0, 8)
    : undefined;

  return {
    id: asString(item.id, `obj-${i + 1}`).replace(/^#/, ""),
    type,
    position: asVec3(item.position, [0, 0, 0]),
    rotation: item.rotation ? asVec3(item.rotation, [0, 0, 0]) : undefined,
    scale: item.scale ? asVec3(item.scale, [1, 1, 1]) : undefined,
    color: asHexColor(item.color, "#4f39f6"),
    label: item.label ? asString(item.label, "") : undefined,
    opacity: typeof item.opacity === "number" ? clamp(item.opacity, 0.1, 1) : undefined,
    args: Array.isArray(item.args)
      ? item.args.map((a) => Number(a)).filter((n) => !Number.isNaN(n)).slice(0, 4)
      : undefined,
    points,
  };
}

function coerceLight(item: Record<string, unknown>): Scene3DLight {
  const typeRaw = asString(item.type, "ambient").toLowerCase();
  const type: Scene3DLight["type"] =
    typeRaw === "directional" || typeRaw === "point" ? typeRaw : "ambient";
  return {
    type,
    intensity: typeof item.intensity === "number" ? clamp(item.intensity, 0, 3) : 0.8,
    position: item.position ? asVec3(item.position, [5, 5, 5]) : undefined,
    color: item.color ? asHexColor(item.color, "#ffffff") : undefined,
  };
}

function coerceAnimation(item: Record<string, unknown>): Scene3DAnimation | null {
  const target = asString(item.target, "").replace(/^#/, "");
  if (!target) return null;
  const prop = asString(item.property, "opacity") as Scene3DAnimation["property"];
  const allowed = new Set(["position", "rotation", "scale", "opacity"]);
  const property = allowed.has(prop) ? prop : "opacity";

  let to: number | Vec3 = 1;
  if (property === "opacity") {
    to = typeof item.to === "number" ? clamp(item.to, 0, 1) : 1;
  } else {
    to = asVec3(item.to, [0, 0, 0]);
  }

  return {
    target,
    property,
    from:
      item.from !== undefined
        ? property === "opacity" && typeof item.from === "number"
          ? clamp(item.from, 0, 1)
          : asVec3(item.from, [0, 0, 0])
        : undefined,
    to,
    duration: typeof item.duration === "number" ? clamp(item.duration, 0.3, 8) : 2,
    delay: typeof item.delay === "number" ? clamp(item.delay, 0, 5) : 0,
    loop: item.loop !== false,
    ease: item.ease === "linear" ? "linear" : "easeInOut",
  };
}

function defaultLights(): Scene3DLight[] {
  return [
    { type: "ambient", intensity: 0.55 },
    { type: "directional", intensity: 1.1, position: [4, 6, 5] },
  ];
}

function synthesizeAnimations(objects: Scene3DObject[]): Scene3DAnimation[] {
  return objects.slice(0, 4).map((obj, i) => ({
    target: obj.id,
    property: "opacity" as const,
    from: 0.45,
    to: 1,
    duration: 1.8,
    delay: i * 0.25,
    loop: true,
    ease: "easeInOut" as const,
  }));
}

export function fallbackScene3D(conceptName: string): Scene3DConfig {
  return {
    version: 1,
    description: `3D view: ${conceptName}`,
    camera: { position: [0, 2, 7], fov: 42, target: [0, 0, 0] },
    lights: defaultLights(),
    objects: [
      { id: "soma", type: "sphere", position: [0, 0, 0], color: "#818cf8", label: "Cell body", scale: [1.2, 1.2, 1.2] },
      { id: "nucleus", type: "sphere", position: [0, 0, 0], color: "#4f39f6", opacity: 0.85, scale: [0.55, 0.55, 0.55] },
      { id: "axon", type: "cylinder", position: [1.8, 0, 0], rotation: [0, 0, Math.PI / 2], color: "#6366f1", label: "Axon", scale: [1, 2.8, 1] },
      {
        id: "dendrite-a",
        type: "line",
        position: [-0.8, 0.3, 0],
        color: "#a5b4fc",
        label: "Dendrites",
        points: [
          [0, 0, 0],
          [-1.2, 0.6, 0],
          [-2, 0.2, 0],
        ],
      },
      {
        id: "dendrite-b",
        type: "line",
        position: [-0.8, -0.2, 0],
        color: "#a5b4fc",
        points: [
          [0, 0, 0],
          [-1.4, -0.5, 0],
          [-2.1, -0.1, 0],
        ],
      },
      { id: "terminal", type: "sphere", position: [3.6, 0, 0], color: "#c4b5fd", label: "Terminal", scale: [0.5, 0.5, 0.5] },
    ],
    animations: [
      { target: "terminal", property: "position", from: [3.2, 0, 0], to: [3.9, 0, 0], duration: 1.5, loop: true },
      { target: "soma", property: "scale", from: [1.1, 1.1, 1.1], to: [1.25, 1.25, 1.25], duration: 2, loop: true },
    ],
    interactions: [
      { target: "soma", onClick: "highlight" },
      { target: "axon", onClick: "label" },
      { target: "terminal", onClick: "pulse" },
    ],
  };
}

export function isFallbackScene3D(config: Scene3DConfig): boolean {
  const ids = config.objects.map((o) => o.id).join(",");
  return ids === "soma,nucleus,axon,dendrite-a,dendrite-b,terminal";
}

export function normalizeScene3D(raw: unknown, conceptName: string): Scene3DConfig {
  const r = asRecord(raw);

  const objects = (Array.isArray(r.objects) ? r.objects : [])
    .map((el, i) => coerceObject(asRecord(el), i))
    .filter((o): o is Scene3DObject => o !== null)
    .slice(0, MAX_OBJECTS);

  const lights = (Array.isArray(r.lights) ? r.lights : [])
    .map((el) => coerceLight(asRecord(el)))
    .slice(0, 4);
  const resolvedLights = lights.length ? lights : defaultLights();

  const animations: Scene3DAnimation[] = [];
  for (const step of Array.isArray(r.animations) ? r.animations : []) {
    const anim = coerceAnimation(asRecord(step));
    if (anim) animations.push(anim);
    if (animations.length >= MAX_ANIMATIONS) break;
  }
  const resolvedAnimations = animations.length ? animations : synthesizeAnimations(objects);

  const interactions: Scene3DInteraction[] = (Array.isArray(r.interactions) ? r.interactions : [])
    .map((item) => {
      const i = asRecord(item);
      const target = asString(i.target, "").replace(/^#/, "");
      const action = asString(i.onClick, "highlight");
      const onClick =
        action === "label" || action === "pulse" ? action : ("highlight" as const);
      return target ? { target, onClick } : null;
    })
    .filter((x): x is Scene3DInteraction => x !== null)
    .slice(0, 6);

  const cameraRec = asRecord(r.camera);

  if (!objects.length) {
    return fallbackScene3D(conceptName);
  }

  return {
    version: 1,
    description: asString(r.description, `3D: ${conceptName}`).slice(0, 120),
    camera: {
      position: asVec3(cameraRec.position, [0, 1.5, 6]),
      fov: typeof cameraRec.fov === "number" ? clamp(cameraRec.fov, 28, 70) : 42,
      target: cameraRec.target ? asVec3(cameraRec.target, [0, 0, 0]) : [0, 0, 0],
    },
    lights: resolvedLights,
    objects,
    animations: resolvedAnimations,
    interactions: interactions.length ? interactions : undefined,
  };
}
