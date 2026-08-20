// Editing a published curated deal, embedded (owner report 2026-08-19: "in the
// library, I don't see any edit button" — and then, when the button existed on
// the web shelves, "where is my edit?", because THIS app's Library is native and
// never saw them).
//
// The editor itself is a web screen (/m/curated/[entryId]): the coach's words at
// each decision, what the board teaches, how tightly the learner is held, and
// the two doors out of it — see it as your learner, or revise the line in the
// studio. It is embedded rather than ported for the same reason the table is
// (see never-replace-board-coach): the board and the coach's own surfaces stay
// one implementation.

import { useLocalSearchParams } from "expo-router";

import { BridgeEmbed } from "../components/bridge-embed";
import { useSelectedClubId } from "../lib/club-context";

export default function CuratedEditScreen() {
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  const entryId = typeof entry === "string" ? entry : "";
  const clubId = useSelectedClubId();
  return (
    <BridgeEmbed
      title="Edit curated deal"
      // No entry, no editor: the shelf is where a board is chosen, and landing
      // on a broken URL would say less than landing back on the shelf.
      next={entryId ? `/m/curated/${encodeURIComponent(entryId)}` : "/m/library?kind=play"}
      backTo="/library"
      programId={clubId ?? undefined}
    />
  );
}
