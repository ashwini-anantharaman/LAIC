// The palette the components wear, supplied by the HOST.
//
// Every page in bridge-web currently declares its own copy of these constants,
// which is exactly what a component cannot do: a component that hard-codes its
// host's colours can only ever live in one app. So the values arrive as a prop,
// with the BirdBridge deck as the default so nothing has to pass one today.

export interface AssignmentTheme {
  /** Page background, and the "on a dark card" ink. */
  cream: string;
  /** The two suits list rows alternate between, each on its darker edge. */
  maroon: string;
  maroonEdge: string;
  green: string;
  greenEdge: string;
  /** Body ink on cream. */
  ink: string;
  /** Quiet ink for eyebrows and secondary lines. */
  muted: string;
  danger: string;
  /** Display face (titles) and body face. */
  display: string;
  body: string;
}

/** The app's own deck (bridge-coach-app/constants/theme.ts). */
export const BIRDBRIDGE_THEME: AssignmentTheme = {
  cream: "#fff4d7",
  maroon: "#541015",
  maroonEdge: "#2a0506",
  green: "#105431",
  greenEdge: "#052a20",
  ink: "#1f1f1f",
  muted: "#a49d8e",
  danger: "#b91c1c",
  display: "var(--font-neco), var(--font-fraunces), serif",
  body: "var(--font-gs), var(--font-karla), sans-serif",
};
