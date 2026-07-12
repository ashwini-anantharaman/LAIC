import { Suspense, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import type { Group, Mesh } from "three";
import type {
  Scene3DAnimation,
  Scene3DConfig,
  Scene3DInteraction,
  Scene3DObject,
  Vec3,
} from "../types/scene3d";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function ease(t: number, mode: "linear" | "easeInOut") {
  if (mode === "linear") return t;
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animProgress(elapsed: number, anim: Scene3DAnimation): number {
  const start = anim.delay ?? 0;
  if (elapsed < start) return 0;
  const local = (elapsed - start) % anim.duration;
  const t = local / anim.duration;
  return ease(anim.loop === false ? Math.min(t, 1) : t, anim.ease ?? "easeInOut");
}

function SceneLights({ lights }: { lights: Scene3DConfig["lights"] }) {
  return (
    <>
      {lights.map((light, i) => {
        if (light.type === "directional") {
          return (
            <directionalLight
              key={i}
              intensity={light.intensity}
              position={light.position ?? [5, 5, 5]}
              color={light.color ?? "#ffffff"}
            />
          );
        }
        if (light.type === "point") {
          return (
            <pointLight
              key={i}
              intensity={light.intensity}
              position={light.position ?? [3, 3, 3]}
              color={light.color ?? "#ffffff"}
            />
          );
        }
        return (
          <ambientLight key={i} intensity={light.intensity} color={light.color ?? "#ffffff"} />
        );
      })}
    </>
  );
}

function SolidObjectMesh({
  obj,
  baseOpacity,
  highlighted,
  showLabel,
  geometry,
  groupRef,
  meshRef,
  onSelect,
}: {
  obj: Scene3DObject;
  baseOpacity: number;
  highlighted: boolean;
  showLabel: boolean;
  geometry: JSX.Element;
  groupRef: RefObject<Group>;
  meshRef: RefObject<Mesh>;
  onSelect: () => void;
}) {
  const emissive = highlighted ? "#312e81" : "#000000";
  const emissiveIntensity = highlighted ? 0.45 : 0;

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh ref={meshRef} castShadow receiveShadow>
        {geometry}
        <meshStandardMaterial
          color={obj.color}
          transparent={baseOpacity < 1 || highlighted}
          opacity={baseOpacity}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      {(showLabel || highlighted) && obj.label && (
        <Html position={[0, 0.75, 0]} center>
          <span className="text-[10px] bg-white/90 border border-[#f6339a] rounded px-1.5 py-0.5 text-[#9d5b8a] font-medium whitespace-nowrap shadow-sm">
            {obj.label}
          </span>
        </Html>
      )}
    </group>
  );
}

function ObjectMesh({
  obj,
  animations,
  interaction,
  highlighted,
  showLabel,
  onSelect,
}: {
  obj: Scene3DObject;
  animations: Scene3DAnimation[];
  interaction?: Scene3DInteraction;
  highlighted: boolean;
  showLabel: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const objAnims = animations.filter((a) => a.target === obj.id);

  const basePosition = obj.position;
  const baseRotation = obj.rotation ?? [0, 0, 0];
  const baseScale = obj.scale ?? [1, 1, 1];
  const baseOpacity = obj.opacity ?? 1;

  const geometry = useMemo(() => {
    switch (obj.type) {
      case "box":
        return <boxGeometry args={[1, 1, 1]} />;
      case "cylinder":
        return <cylinderGeometry args={[0.45, 0.45, 1, 24]} />;
      case "torus":
        return <torusGeometry args={[0.55, 0.18, 16, 32]} />;
      default:
        return <sphereGeometry args={[0.5, 24, 24]} />;
    }
  }, [obj.type]);

  useFrame(({ clock }) => {
    const group = ref.current;
    const mesh = meshRef.current;
    if (!group) return;

    let position: Vec3 = [...basePosition];
    let rotation: Vec3 = [...baseRotation];
    let scale: Vec3 = [...baseScale];
    let opacity = baseOpacity;

    for (const anim of objAnims) {
      const t = animProgress(clock.getElapsedTime(), anim);
      if (anim.property === "position") {
        const from = (Array.isArray(anim.from) ? anim.from : position) as Vec3;
        const to = anim.to as Vec3;
        position = lerpVec3(from, to, t);
      } else if (anim.property === "rotation") {
        const from = (Array.isArray(anim.from) ? anim.from : rotation) as Vec3;
        const to = anim.to as Vec3;
        rotation = lerpVec3(from, to, t);
      } else if (anim.property === "scale") {
        const from = (Array.isArray(anim.from) ? anim.from : scale) as Vec3;
        const to = anim.to as Vec3;
        scale = lerpVec3(from, to, t);
      } else if (anim.property === "opacity") {
        const from = typeof anim.from === "number" ? anim.from : opacity;
        const to = typeof anim.to === "number" ? anim.to : 1;
        opacity = lerp(from, to, t);
      }
    }

    group.position.set(...position);
    group.rotation.set(...rotation);
    group.scale.set(...scale);

    if (mesh?.material && "opacity" in mesh.material) {
      (mesh.material as { opacity: number }).opacity = opacity;
    }
  });

  if (obj.type === "line" && obj.points?.length) {
    const worldPoints = obj.points.map(
      (p) =>
        [p[0] + basePosition[0], p[1] + basePosition[1], p[2] + basePosition[2]] as Vec3
    );
    return (
      <group ref={ref}>
        <Line
          points={worldPoints}
          color={obj.color}
          lineWidth={2}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        />
        {showLabel && obj.label && (
          <Html position={worldPoints[0]} center>
            <span className="text-[10px] bg-white/90 border border-[#f6339a] rounded px-1.5 py-0.5 text-[#9d5b8a] font-medium whitespace-nowrap">
              {obj.label}
            </span>
          </Html>
        )}
      </group>
    );
  }

  return (
    <SolidObjectMesh
      obj={obj}
      baseOpacity={baseOpacity}
      highlighted={highlighted}
      showLabel={showLabel}
      geometry={geometry}
      groupRef={ref}
      meshRef={meshRef}
      onSelect={onSelect}
    />
  );
}

function SceneContent({ config }: { config: Scene3DConfig }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);

  const interactionMap = useMemo(() => {
    const m = new Map<string, Scene3DInteraction>();
    for (const i of config.interactions ?? []) m.set(i.target, i);
    return m;
  }, [config.interactions]);

  const handleSelect = (obj: Scene3DObject) => {
    const action = interactionMap.get(obj.id)?.onClick ?? "highlight";
    setSelected(obj.id);
    if (action === "pulse") {
      setPulseId(obj.id);
      window.setTimeout(() => setPulseId(null), 600);
    }
    if (action === "label") {
      /* label shown via showLabel */
    }
  };

  return (
    <>
      <SceneLights lights={config.lights} />
      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={14}
        target={config.camera.target ?? [0, 0, 0]}
      />
      {config.objects.map((obj) => {
        const interaction = interactionMap.get(obj.id);
        const highlighted = selected === obj.id || pulseId === obj.id;
        const showLabel = interaction?.onClick === "label" && selected === obj.id;
        return (
          <ObjectMesh
            key={obj.id}
            obj={obj}
            animations={config.animations}
            interaction={interaction}
            highlighted={highlighted}
            showLabel={showLabel}
            onSelect={() => handleSelect(obj)}
          />
        );
      })}
    </>
  );
}

function SceneFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[280px] text-sm text-[#62748e]">
      Loading 3D scene…
    </div>
  );
}

export function Scene3DPlayer({ config }: { config: Scene3DConfig }) {
  return (
    <div className="relative bg-gradient-to-br from-[#eef2ff] via-[#f8fafc] to-[#f8fafc] rounded-2xl border border-[#eef2ff] overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/90 border border-[#eef2ff] rounded-full px-2 py-0.5">
        <span className="text-[10px] text-[#62748e] font-mono">🧠 Three.js · R3F live</span>
      </div>
      <p className="text-[10px] text-[#62748e] px-4 pt-3 pb-1">Drag to rotate · Click parts to explore</p>
      <div className="h-[360px] w-full">
        <Canvas
          shadows
          camera={{
            position: config.camera.position,
            fov: config.camera.fov ?? 42,
          }}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={["#f8fafc"]} />
          <Suspense fallback={null}>
            <SceneContent config={config} />
          </Suspense>
        </Canvas>
      </div>
      {config.description && (
        <p className="text-xs text-[#62748e] px-4 pb-4 text-center">{config.description}</p>
      )}
    </div>
  );
}

export { SceneFallback };
