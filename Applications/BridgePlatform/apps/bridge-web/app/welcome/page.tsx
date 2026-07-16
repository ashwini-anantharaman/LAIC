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
      <header className="space-y-3 text-center">
        <p className="text-sm tracking-[0.45em] text-emerald-700">
          ♠ <span className="text-red-700">♥</span> ♣{" "}
          <span className="text-red-700">♦</span>
        </p>
        <h1 className="text-5xl font-medium tracking-tight">Bridge Platform</h1>
        <p className="mx-auto max-w-md text-neutral-600">
          Practice with AI players who bid and play by an open, cited rulebook
          — and can always tell you why.
        </p>
      </header>

      {nexusMode() === "stub" ? (
        <section className="space-y-3">
          <h2 className="text-center text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            Development sign-in — pick a seat at the club
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
                    className="w-full rounded-xl border border-neutral-200 bg-[#fffefb] p-4 text-left shadow-sm hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
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
          <p className="text-center text-xs text-neutral-400">
            Stubbed Nexus context for development — real sign-in arrives with
            the Nexus/Supabase integration.
          </p>
        </section>
      ) : (
        <LoginForm />
      )}
    </main>
  );
}
