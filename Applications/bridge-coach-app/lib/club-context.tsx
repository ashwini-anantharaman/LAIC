// Which club am I looking at?
//
// A person can belong to several clubs — one profile with a membership in each,
// which the platform already represents (they are programs inside one org, so the
// "one credential, one org" invariant is untouched). What it does NOT give us is
// a notion of "the current one", and almost everything club-shaped needs that:
// the Club tab, its roster, its chat, its challenges, its deals, AND the person's
// capabilities, which are per-club — a Mentor in one club may be a plain member
// in another.
//
// Selection lives HERE, for the session only. Not persisted, by request: every
// launch opens on My Clubs, and the choice holds until the app is closed. That
// also means a switch is cheap and reversible, which suits a switcher button.

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth-context";
import { clubDefaultProgramId, getRoleContext, isClubMembership } from "./bridge-role";
import type { NexusMembership } from "./nexus";

export type Club = {
  programId: string;
  name: string;
  orgName: string;
  /** The membership role in THIS club — the coarse tier, not its capabilities. */
  role: string;
};

type ClubState = {
  /** Every club this person belongs to, alphabetical so the list is stable. */
  clubs: Club[];
  /** Null until they pick one (or immediately, when there is only one). */
  selected: Club | null;
  loading: boolean;
  select: (programId: string) => void;
  /** Back to My Clubs — only meaningful with more than one club. */
  clearSelection: () => void;
  /** Two clubs: the other one. More: null, and the caller opens a picker. */
  otherClub: Club | null;
};

const Ctx = createContext<ClubState | null>(null);



export function ClubProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setClubs([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getRoleContext(token)
      .then((ctx) => {
        if (cancelled) return;
        const found = ctx.memberships
          .filter(isClubMembership)
          .map((m) => ({
            programId: m.program_id as string,
            name: m.program_name ?? m.org_name,
            orgName: m.org_name,
            role: m.role,
          }))
          // Deduplicate: two memberships in one program would otherwise list it twice.
          .filter((c, i, all) => all.findIndex((o) => o.programId === c.programId) === i)
          .sort((a, b) => a.name.localeCompare(b.name));
        setClubs(found);
        // One club is not a choice — skip My Clubs entirely. CLUB-ONLY
        // accounts always get a default, even with several: for them the
        // app-wide program is a locked door, not a fallback (the shared
        // helper is also what the sign-in prime uses, so the two agree).
        setSelectedId(
          found.length === 1
            ? found[0].programId
            : clubDefaultProgramId(ctx.memberships),
        );
      })
      .catch(() => !cancelled && setClubs([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const selected = useMemo(
    () => clubs.find((c) => c.programId === selectedId) ?? null,
    [clubs, selectedId],
  );

  const otherClub = useMemo(
    () => (clubs.length === 2 ? clubs.find((c) => c.programId !== selectedId) ?? null : null),
    [clubs, selectedId],
  );

  const select = useCallback((programId: string) => setSelectedId(programId), []);
  const clearSelection = useCallback(() => setSelectedId(null), []);

  const value: ClubState = {
    clubs,
    selected,
    loading,
    select,
    clearSelection,
    otherClub,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClubs(): ClubState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClubs must be used inside ClubProvider");
  return ctx;
}

/** The selected club's program id — what every club-scoped call needs. */
export function useSelectedClubId(): string | null {
  return useClubs().selected?.programId ?? null;
}
