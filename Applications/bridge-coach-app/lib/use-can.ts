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

import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useAuth } from "./auth-context";
import {
  can,
  getAppContext,
  getRoleContext,
  peekAppContext,
  peekRoleContext,
  refreshRoleContext,
  roleNameOf,
  subscribeToRoleContext,
  type RoleContext,
} from "./bridge-role";
import { useSelectedClubId } from "./club-context";

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
    // Redraw when anything refreshes the context — one fetch, every gate updated.
    const stop = subscribeToRoleContext((ctx) => {
      if (!cancelled) setContext(ctx);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [token]);

  return context;
}

/**
 * The context WITH the selected club's access folded in.
 *
 * Capabilities are per club, so every gate has to ask about the club currently
 * being looked at. Until a club is chosen (the My Clubs screen) there is nothing
 * to resolve, and gates fall back to their pre-roles behaviour — which is what
 * the whole-app surfaces (Play, Learn) want anyway.
 */
/**
 * Exported because `useCan` answers ONE capability and some screens need several.
 *
 * `useRoleContext` is NOT a substitute: `getRoleContext` always leaves `app` null, so
 * `can()` against it finds an empty capability set and returns the fallback for every
 * id — which is exactly how the menu sheet's nine club capabilities silently degraded
 * to a plain coach check, with the fine-grained ids never consulted.
 */
export function useClubScopedContext(): RoleContext | null {
  const { token } = useAuth();
  const base = useRoleContext();
  const clubId = useSelectedClubId();
  const [app, setApp] = useState(() =>
    token && clubId ? peekAppContext(token, clubId) : null,
  );

  useEffect(() => {
    if (!token || !clubId) {
      setApp(null);
      return;
    }
    let cancelled = false;
    getAppContext(token, clubId).then((v) => !cancelled && setApp(v));
    return () => {
      cancelled = true;
    };
  }, [token, clubId]);

  // A refresh clears the per-club cache too, so re-read on context changes.
  useEffect(() => {
    if (!token || !clubId) return;
    let cancelled = false;
    getAppContext(token, clubId).then((v) => !cancelled && setApp(v));
    return () => {
      cancelled = true;
    };
  }, [base, token, clubId]);

  if (!base) return null;
  return { ...base, app };
}

/**
 * Re-resolve permissions when the app returns to the foreground.
 *
 * Roles are edited in the console while the app is open, so coming back to the
 * app is exactly the moment a stale capability set shows. Mounted ONCE, at the
 * tab layout, rather than per gate — otherwise every screen would fire its own
 * request on each foreground.
 */
export function useRoleRefreshOnForeground(): void {
  const { token } = useAuth();
  const last = useRef<string>("background");

  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener("change", (state) => {
      const cameBack = state === "active" && last.current !== "active";
      last.current = state;
      if (cameBack) void refreshRoleContext(token).catch(() => {});
    });
    return () => sub.remove();
  }, [token]);
}

/** May the signed-in person do this, in the club they are looking at? */
export function useCan(capability: string, fallback = false): boolean {
  return can(useClubScopedContext(), capability, fallback);
}

/** The name of the role they hold IN THIS CLUB, for display. */
export function useRoleName(): string | null {
  return roleNameOf(useClubScopedContext());
}
