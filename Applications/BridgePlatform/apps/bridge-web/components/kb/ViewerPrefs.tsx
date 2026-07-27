"use client";

// Remembers the Master viewer's view/group/sort per KB. Explicit URL params
// always win (and are saved as the new preference); a bare visit is redirected
// to the saved shape via router.replace. Renders nothing.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const DEFAULTS = { view: "cards", group: "kind", sort: "title" } as const;
type PrefKey = keyof typeof DEFAULTS;

export function ViewerPrefs({
  storageKey,
  view,
  group,
  sort,
  explicit,
}: Readonly<{
  storageKey: string;
  view: string;
  group: string;
  sort: string;
  explicit: boolean;
}>) {
  const router = useRouter();

  useEffect(() => {
    const current = { view, group, sort };

    if (explicit) {
      // The URL is the source of truth — persist it as the new preference.
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(current));
      } catch {
        // Private browsing etc. — preferences just don't stick.
      }
      return;
    }

    let saved: Partial<Record<PrefKey, string>> = {};
    try {
      saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<
        Record<PrefKey, string>
      >;
    } catch {
      return;
    }

    const want: Record<PrefKey, string> = {
      view: saved.view ?? current.view,
      group: saved.group ?? current.group,
      sort: saved.sort ?? current.sort,
    };
    if (want.view === view && want.group === group && want.sort === sort) return;

    // Rebuild the query from the live URL so filters (q/type/phase/…) survive;
    // defaults stay out of the URL, matching the server's qs() convention.
    const url = new URL(window.location.href);
    for (const key of ["view", "group", "sort"] as const) {
      if (want[key] && want[key] !== DEFAULTS[key]) url.searchParams.set(key, want[key]);
      else url.searchParams.delete(key);
    }
    router.replace(`${url.pathname}${url.search ? url.search : ""}`);
  }, [storageKey, view, group, sort, explicit, router]);

  return null;
}
