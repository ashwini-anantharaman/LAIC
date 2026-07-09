export interface InteractiveDiagramElement {
  id: string;
  tag: "circle" | "rect" | "line" | "path" | "text";
  attrs: Record<string, string | number>;
  label?: string;
}

export interface InteractiveAnimationStep {
  title: string;
  body: string;
  diagram?: {
    viewBox: string;
    elements: InteractiveDiagramElement[];
    emphasisId?: string;
  };
}

export interface InteractiveAnimationConfig {
  title: string;
  steps: InteractiveAnimationStep[];
}
