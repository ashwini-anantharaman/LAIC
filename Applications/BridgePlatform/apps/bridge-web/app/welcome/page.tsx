import { roleLabel, STUB_USERS } from "@bridge/nexus-client";
import { redirect } from "next/navigation";
import { setDevUser } from "@/app/actions";
import { LoginForm } from "@/components/LoginForm";
import { getBridgeContext, nexusMode } from "@/lib/nexus";

export default async function WelcomePage() {
  const context = await getBridgeContext();
  if (context) redirect("/bridge/home");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Bridge Platform
        </h1>
        <p className="text-neutral-600">
          Practice bridge with configurable, explainable AI players.
        </p>
      </header>

      {nexusMode() === "stub" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Development sign-in — pick a stub user
          </h2>
          <ul className="space-y-2">
            {STUB_USERS.map((user) => (
              <li key={user.devUserId}>
                <form action={setDevUser}>
                  <input
                    type="hidden"
                    name="devUserId"
                    value={user.devUserId}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    <span className="flex items-baseline justify-between gap-4">
                      <span className="font-medium">{user.displayName}</span>
                      <span className="text-xs text-neutral-500">
                        {user.context.roles.map(roleLabel).join(", ")}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-neutral-600">
                      {user.description}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="text-xs text-neutral-400">
            Stubbed Nexus context (Bridge plan Sequence 1). Real sign-in via
            Nexus/Supabase arrives with Phase 10.
          </p>
        </section>
      ) : (
        <LoginForm />
      )}
    </main>
  );
}
