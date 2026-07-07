/** Safely display source status detail from API (never show "[object Object]"). */
export function formatSourceDetail(detail: unknown): string {
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") {
    return detail === "[object Object]" ? "An error occurred — try again or re-upload the file." : detail;
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    try {
      return JSON.stringify(detail);
    } catch {
      return "An error occurred";
    }
  }
  return String(detail);
}

/** Format a caught exception for UI display. */
export function formatError(err: unknown, fallback = "Something went wrong"): string {
  if (err == null) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (!msg || msg === "[object Object]") return fallback;
    return msg;
  }
  return formatSourceDetail(err) || fallback;
}
