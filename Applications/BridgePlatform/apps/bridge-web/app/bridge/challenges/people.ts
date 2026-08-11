// Who a creator can invite. Server-side only.
//
// The directory is the PROGRAM'S OWN PEOPLE, from Nexus.
//
// It used to be whatever roster the caller happened to see (their learners plus
// the program's coaches), because the only email-keyed Nexus listing could not
// name an invitee — every bridge artifact keys on the org-scoped profile id,
// which /bridge/context calls nexusUserId. /api/programs/:id/members returns
// exactly that id alongside the email, so a club can now invite its own members
// by their Nexus account. The roster helpers stay as a fallback for a context
// carrying no program (and for stub mode).
//
// Still not the spec's platform-wide cross-org search — that needs a directory
// endpoint Nexus does not have. This is the club-scoped subset, which is what the
// club app actually wants.

import { STUB_USERS, stubDisplayName } from "@bridge/nexus-client";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { cache } from "react";
import { getMyLearners, getProgramCoaches, nexusMode } from "@/lib/nexus";
import {
  listNexusProgramMembers,
  nexusClubProgramId,
  nexusProgramId,
} from "@/lib/nexusPeople";

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
      // A CLUB caller's directory is their club, and ONLY their club.
      //
      // The club id has to come from nexus_club_program_id: for a partner-club
      // caller nexus_program_id is the CONNECTED PARENT, so asking with it
      // returned the parent program's people — the wrong names entirely, and the
      // bug this branch exists to fix.
      //
      // The parent-roster fallback below is skipped for a club, deliberately.
      // getMyLearners/getProgramCoaches answer about the parent too, so leaving
      // them in put those same outsiders straight back into the list. A club's
      // invite list being exactly its own members is also the rule the demo
      // needs, and it means a NEW member shows up here as soon as they are in the
      // club, with no extra step.
      const clubId = nexusClubProgramId(context);
      const programId = clubId ?? nexusProgramId(context);
      if (programId) {
        const members = await listNexusProgramMembers(programId).catch(() => []);
        for (const m of members)
          if (m.profile_id)
            add({
              userId: m.profile_id,
              name: m.display_name?.trim() || m.email || m.profile_id,
              handle: m.email ?? undefined,
            });
      }
      if (!clubId) {
        // Not a club: the pre-existing directory, unchanged.
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
