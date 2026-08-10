// Capability hooks — the app's read side of the access catalogue.
//
// useCan("app.challenge.create") is the question every gate asks. It
// resolves the session's role context once (shared cache) and answers from the
// capability set the server sent.
//
// The `fallback` argument is what the answer is for someone who holds NO role
// yet — set it to whatever that surface did before roles existed, so assigning
// roles is a change in control, not a sudden loss of function. See can() in
// bridge-role.ts.

import { useEffect, useState } from "react";

import { useAuth } from "./auth-context";
import { can, getRoleContext, peekRoleContext, roleNameOf, type RoleContext } from "./bridge-role";

/** The whole role context, resolved once per session. */
export function useRoleContext(): RoleContext | null {
  const { token } = useAuth();
  // Seeded from the sign-in prime, so a gate renders correctly on first paint
  // instead of flashing the fallback.
  const [context, setContext] = useState<RoleContext | null>(() =>
    token ? peekRoleContext(token) : null,
  );

  useEffect(() => {
    if (!token) {
      setContext(null);
      return;
    }
    let cancelled = false;
    getRoleContext(token).then((ctx) => {
      if (!cancelled) setContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return context;
}

/** May the signed-in person do this? */
export function useCan(capability: string, fallback = false): boolean {
  const context = useRoleContext();
  return can(context, capability, fallback);
}

/** The name of the role they hold, for display. */
export function useRoleName(): string | null {
  return roleNameOf(useRoleContext());
}
