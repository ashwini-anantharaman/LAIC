import type { BrowserContext } from "@playwright/test";

/** Stub-auth: the dev-user cookie IS the session (NEXUS_CLIENT_MODE=stub). */
export async function signInAs(context: BrowserContext, devUserId: string): Promise<void> {
  await context.addCookies([
    { name: "bridge_dev_user", value: devUserId, url: "http://localhost:3000" },
  ]);
}
