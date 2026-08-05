import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../../components/bridge-embed";

/** Learner profile (coach view): stats, assignment history, and every
 *  feedback thread with this learner — the bridge platform's /m/learner
 *  page embedded under the app's navigation. */
export default function LearnerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <BridgeEmbed title="Learner" next={`/m/learner/${encodeURIComponent(id ?? "")}`} />
  );
}
