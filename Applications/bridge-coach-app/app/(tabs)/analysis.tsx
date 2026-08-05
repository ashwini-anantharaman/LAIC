// Analysis — a destination the BirdBridge design introduces (a tree nest and a
// tab slot). No analysis endpoints exist in the Nexus API yet; the coaching
// engine that will feed this lives in Components/generalizable-coach.

import { ComingSoon } from "../../components/coming-soon";

export default function AnalysisScreen() {
  return (
    <ComingSoon
      title="Analysis"
      blurb="Hand analysis and your progress over time will live here. The design reserves the space; the feature isn't built yet."
    />
  );
}
