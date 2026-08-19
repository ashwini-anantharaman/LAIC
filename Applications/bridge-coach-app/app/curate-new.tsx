// The Coach's Studio (curated v2, owner design 2026-08-18) — the deal picker,
// embedded. The coach places all 52 cards, seats the learner, chooses how
// tightly they're held, and the picker itself opens the all-four-seats
// authoring table (?author=1) in this same embed; BridgeEmbed notices the
// table URL and goes immersive, exactly as an assignment's Start does.
//
// This replaced the Play tab's old door (/new-board?curate=1 — deal a RANDOM
// board and annotate your own sitting). The v1 flow still answers if a URL
// carries curate=1; the app just no longer points anyone at it.

import { BridgeEmbed } from "../components/bridge-embed";
import { useSelectedClubId } from "../lib/club-context";

export default function CurateNewScreen() {
  const clubId = useSelectedClubId();
  return (
    <BridgeEmbed
      title="Curated deal"
      next="/m/curate/new"
      backTo="/play"
      programId={clubId ?? undefined}
    />
  );
}
