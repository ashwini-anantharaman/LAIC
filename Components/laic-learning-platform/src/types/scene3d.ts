export type Vec3 = [number, number, number];

export type SceneObjectType = "sphere" | "box" | "cylinder" | "torus" | "line";

export interface Scene3DObject {
  id: string;
  type: SceneObjectType;
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  color: string;
  label?: string;
  opacity?: number;
  /** For cylinders: height along Y. For torus: tube/radius via scale. */
  args?: number[];
  /** Line endpoints relative to position (or absolute if two points). */
  points?: Vec3[];
}

export interface Scene3DLight {
  type: "ambient" | "directional" | "point";
  intensity: number;
  position?: Vec3;
  color?: string;
}

export interface Scene3DAnimation {
  target: string;
  property: "position" | "rotation" | "scale" | "opacity";
  from?: number | Vec3;
  to: number | Vec3;
  duration: number;
  delay?: number;
  loop?: boolean;
  ease?: "linear" | "easeInOut";
}

export interface Scene3DInteraction {
  target: string;
  onClick: "highlight" | "label" | "pulse";
}

export interface Scene3DConfig {
  version: 1;
  description: string;
  camera: { position: Vec3; fov?: number; target?: Vec3 };
  lights: Scene3DLight[];
  objects: Scene3DObject[];
  animations: Scene3DAnimation[];
  interactions?: Scene3DInteraction[];
}

export interface Scene3DPlan {
  concept: string;
  narrative: string;
  objects: { id: string; role: string; label: string; type: SceneObjectType }[];
  cameraHint: string;
  animationBeats: string[];
}
