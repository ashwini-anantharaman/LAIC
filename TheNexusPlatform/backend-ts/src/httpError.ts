/**
 * FastAPI-compatible HTTP error. Renders as `{ "detail": ... }` (string or the
 * array shape FastAPI uses for validation errors) so the existing frontend
 * error handling keeps working unchanged.
 */
export class HttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }
}
