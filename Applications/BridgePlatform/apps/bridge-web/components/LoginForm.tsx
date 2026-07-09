"use client";

// Real sign-in for http mode: authenticates against the shared Supabase
// project (nexusUserId = auth user id); the session cookie then powers
// HttpNexusClient's bearer token to GET /api/platform/bridge/context.

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/bridge/home");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-neutral-200 p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
        Sign in (shared Nexus account)
      </h2>
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-neutral-400">
        Accounts are created through Nexus registration (join codes / signup),
        not here.
      </p>
    </form>
  );
}
