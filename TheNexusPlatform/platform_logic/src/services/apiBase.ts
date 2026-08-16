/**
 * Where the console's API lives.
 *
 * Platform admin UI — usually deployed as a second Vercel project. Set
 * `VITE_API_URL` to the API deployment (e.g. https://nexus-api-rust-six.vercel.app).
 *
 * THIS MODULE MUST NEVER THROW, and that is the whole point of it.
 *
 * `services/api.ts` calls `getApiBaseUrl()` at MODULE SCOPE (`const API_URL = …`).
 * A throw there happens during import, before React ever renders — so it does not
 * produce an error screen, it produces an empty `#root` and a page showing nothing
 * but the app's own background gradient. That has now happened twice in production,
 * and both times the symptom ("a blank blue page") pointed nowhere near the cause
 * (an environment variable missing from the build).
 *
 * WHY THE VARIABLE GOES MISSING is worth writing down, because the variable is
 * usually set correctly and the deploy is what is wrong: Vite inlines
 * `import.meta.env.*` AT BUILD TIME from the environment the build ran in. Our
 * `VITE_API_URL` exists in Vercel's PRODUCTION environment only, so a preview build
 * — `vercel deploy` without `--prod` — inlines nothing. `import.meta.env.PROD` is a
 * build-MODE flag and is still true in that build, so the "we are in production and
 * have no URL" branch fires. Alias a preview deployment onto the public hostname and
 * the live console goes blank while every environment variable reads as correctly
 * set in the dashboard.
 *
 * So: record the fault, return something harmless, and let the app render a screen
 * that says what is wrong. A legible error beats a blank page, and a blank page is
 * what a throw here guarantees.
 */

function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

/** Set once, at first resolve, when the configuration cannot be honoured. */
let configError: string | null = null;

/**
 * The reason the API base is unusable, or null when it is fine.
 *
 * Read by the app shell to render an explanation instead of a dead page. Resolve
 * the base first (`getApiBaseUrl()` runs at import of `services/api`, so by the time
 * anything renders this is already settled).
 */
export function apiConfigError(): string | null {
  return configError;
}

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;

  if (fromEnv !== undefined && fromEnv !== "") {
    const url = fromEnv.replace(/\/$/, "");
    if (import.meta.env.PROD && isLocalhostUrl(url)) {
      configError =
        "VITE_API_URL points at localhost, which cannot work in a deployed build. " +
        "Set it to the API's URL in the Vercel project and redeploy.";
    }
    return url;
  }

  if (import.meta.env.PROD) {
    configError =
      "This build has no VITE_API_URL, so the console cannot reach its API. " +
      "The variable is usually present in Vercel and missing from the BUILD: Vite " +
      "inlines it at build time, and VITE_API_URL is set for the Production " +
      "environment only — so a preview deployment (a deploy without --prod) has no " +
      "value to inline. Redeploy with --prod and point the alias at that deployment.";
    // Same-origin. Every call will fail, which is correct — there is no API to
    // reach — and the shell explains why rather than leaving a blank page.
    return "";
  }

  return "http://localhost:8000";
}

/** Resolve a backend-relative asset URL (e.g. /api/platform/storage/…) against the API base. */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${getApiBaseUrl()}${url}` : url;
}
