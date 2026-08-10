// Analysis — a destination the Bridge Bird design introduces. No analysis
// endpoints exist in the Nexus API yet; the coaching engine that will feed this
// lives in Components/generalizable-coach.
//
// It gave up its tab slot to Menu (owner decision): a tab is a permanent sixth of
// the bar, and this had nothing behind it. The tree still has its nest, so it is
// a pushed screen now — and being pushed, it gets a back arrow.

import { ComingSoon } from "../components/coming-soon";

export default function AnalysisScreen() {
  return (
    <ComingSoon
      title="Analysis"
      blurb="Hand analysis and your progress over time will live here. The design reserves the space; the feature isn't built yet."
    />
  );
}
