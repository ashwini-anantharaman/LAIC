// Is the signed-in person a coach? Shared by every screen that branches on it,
// so the resolve-once-per-token logic lives in one place instead of being
// re-implemented in each useEffect.

import { useEffect, useState } from "react";

import { useAuth } from "./auth-context";
import { useSelectedClubId } from "./club-context";
import { getRoleContext, isCoach } from "./bridge-role";

export function useIsCoach(): boolean {
  const { token } = useAuth();
  // Coach-ness is PER CLUB: a mentor in one club is a plain member in another,
  // so the question has to name the club we are looking at.
  const clubId = useSelectedClubId();
  const [coach, setCoach] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setCoach(false);
      return;
    }
    getRoleContext(token, clubId ?? undefined).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  return coach;
}
