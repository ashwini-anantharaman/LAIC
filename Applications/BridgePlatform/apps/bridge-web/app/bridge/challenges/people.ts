// Who a creator can invite. Server-side only.
//
// The spec asks for a platform-wide, cross-org people search (§2). Nexus has
// no such endpoint today: the roster helpers the assignments surfaces use
// (`getMyLearners`) and the program coaches list are the only sources that
// return the USER IDS challenge invites are keyed on — `listBridgePeople` is
// email-keyed and cannot address an invite. So v1 searches the people this
// caller can actually see; the search box and the invite records are already
// id-based, so widening the directory later is a change to THIS file only.

import { STUB_USERS, stubDisplayName } from "@bridge/nexus-client";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { cache } from "react";
import { getMyLearners, getProgramCoaches, nexusMode } from "@/lib/nexus";

export interface ChallengePerson {
  /** The id space challenge invites (and every bridge artifact) key on. */
  userId: string;
  name: string;
  /** Secondary line in the search row — an email, or the stub id. */
  handle?: string;
}

/** Everyone this caller may invite, minus the caller (their row is implicit). */
export const listChallengePeople = cache(
  async (context: NexusBridgeContext): Promise<ChallengePerson[]> => {
    const byId = new Map<string, ChallengePerson>();
    const add = (person: ChallengePerson) => {
      if (!person.userId || person.userId === context.nexusUserId) return;
      if (!byId.has(person.userId)) byId.set(person.userId, person);
    };

    if (nexusMode() === "stub") {
      for (const user of STUB_USERS)
        add({
          userId: user.context.nexusUserId,
          name: user.displayName,
          handle: `@${user.devUserId}`,
        });
    } else {
      const [learners, coaches] = await Promise.all([
        getMyLearners().catch(() => []),
        getProgramCoaches().catch(() => []),
      ]);
      for (const coach of coaches)
        add({ userId: coach.coach_id, name: coach.name ?? coach.coach_id });
      for (const learner of learners)
        if (learner.user_id)
          add({
            userId: learner.user_id,
            name: learner.name ?? learner.email ?? learner.user_id,
            handle: learner.email ?? undefined,
          });
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
);

/** The creator's own row — rendered first, accepted, moderator, undeletable. */
export function selfPerson(context: NexusBridgeContext): ChallengePerson {
  return {
    userId: context.nexusUserId,
    // Same fallback chain as the app shell: stub mode has no displayName on the
    // context, so the dev roster supplies it rather than showing a raw user id.
    name: context.displayName ?? stubDisplayName(context.nexusUserId) ?? context.nexusUserId,
    handle: "creator",
  };
}
