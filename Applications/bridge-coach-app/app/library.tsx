import { BridgeEmbed } from "../components/bridge-embed";

/** Library (from Menu): the platform's library — shelves, collections, and
 *  creation when the caller's role grants it. */
export default function LibraryScreen() {
  return <BridgeEmbed title="Library" next="/m/library" resetOnFocus />;
}
