import { Redirect } from "expo-router";

/** Create Assignment — the coach's author-then-assign flow, now fully native
 *  (M3d; this was a BridgeEmbed of /m/library/new?flow=assign). Step one is
 *  the deal editor; its save continues to the assign picker. The route stays
 *  so the Coach tab's existing push lands exactly where it always did. */
export default function CreateAssignmentScreen() {
  return <Redirect href="/deal-editor?kind=board&flow=assign" />;
}
