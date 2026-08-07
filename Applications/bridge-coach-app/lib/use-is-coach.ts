// Is the signed-in person a coach? Shared by every screen that branches on it,
// so the resolve-once-per-token logic lives in one place instead of being
// re-implemented in each useEffect.

import { useEffect, useState } from "react";

import { useAuth } from "./auth-context";
import { getRoleContext, isCoach } from "./bridge-role";

export function useIsCoach(): boolean {
  const { token } = useAuth();
  const [coach, setCoach] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setCoach(false);
      return;
    }
    getRoleContext(token).then((ctx) => {
      if (!cancelled) setCoach(isCoach(ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return coach;
}
