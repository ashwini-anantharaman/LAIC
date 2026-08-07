import { roleLabel, STUB_USERS } from "@bridge/nexus-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setDevUser } from "@/app/actions";
import { EmbedLocationReporter } from "@/components/mobile/EmbedLocationReporter";
import { getBridgeContext, isEmbeddedLaunch, isFellowDemo, isMobileSite, nexusMode } from "@/lib/nexus";
import { NEXUS_RETURN_COOKIE, safeReturnUrl } from "@/lib/nexusToken";

export default async function WelcomePage() {
  // The mobile host has its own auto-signed-in phone UI — never show the login.
  if (await isMobileSite()) redirect("/m/play");
  // An EMBEDDED session that died lands here — report the location so the
  // host app's /welcome watchdog notices and re-launches, instead of the
  // learner staring at a sign-in page inside an iframe that can't sign in.
  const embedded = await isEmbeddedLaunch();
  const context = await getBridgeContext();
  // On the fellows-testing host everyone is auto-signed-in as "Fellow"; there
  // is no login, and Home is hidden — land straight on Play.
  if (context) redirect((await isFellowDemo()) ? "/bridge/table" : "/bridge/home");

  // A person who arrived from Nexus but was refused (no bridge grant, expired
  // session) lands here — give them the way back to the console.
  const cookieStore = await cookies();
  const nexusReturnUrl = safeReturnUrl(cookieStore.get(NEXUS_RETURN_COOKIE)?.value);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      {embedded && <EmbedLocationReporter />}
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
        <section className="space-y-2 text-center">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            Sign in through Nexus
          </h2>
          <p className="mx-auto max-w-sm text-sm text-neutral-600">
            The Bridge Platform opens from your organization&apos;s Nexus portal — launch it
            from your program&apos;s workspace and you&apos;ll arrive here signed in.
          </p>
        </section>
      )}

      {nexusReturnUrl && (
        <p className="text-center">
          <a
            href={nexusReturnUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900"
          >
            ← Back to Nexus
          </a>
        </p>
      )}
    </main>
  );
}
