/**
 * The screen that shows when the console cannot start.
 *
 * It exists because the alternative is a blank page. The app paints a full-bleed
 * gradient background from `--page-gradient`, so an empty `#root` does not look
 * broken — it looks like a page that has not finished loading, and it gives whoever
 * is looking at it nothing to act on. Twice now that has cost real debugging time.
 *
 * Two ways in:
 *   - a configuration fault detected at boot (`apiConfigError`), which is the
 *     common one and is nearly always a deploy that missed its env vars;
 *   - a render-time crash caught by the boundary below.
 *
 * Deliberately plain: no design-system imports, no context, no hooks beyond the
 * boundary's own state. Whatever went wrong, this has to be able to render.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

export function BootFailure({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: "#131722",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          background: "rgba(255,255,255,0.72)",
          border: "1px solid rgba(19,23,34,0.10)",
          borderRadius: 16,
          padding: "28px 30px",
          boxShadow: "0 16px 40px -18px rgba(30,55,120,0.18)",
        }}
      >
        <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 600 }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#3f4557" }}>{detail}</p>
        <p style={{ margin: "18px 0 0", fontSize: 12.5, color: "#5b6172" }}>
          This message is the console failing to start, not your account. Nothing you
          do here will fix it — it needs a redeploy.
        </p>
      </div>
    </div>
  );
}

/**
 * Catches a render-time crash anywhere below it.
 *
 * NOT a substitute for `apiBase.ts` never throwing: a module-evaluation error
 * happens during import, before React exists, and no boundary can catch it. This
 * covers the other half — a component that throws once it is rendering.
 */
export class BootBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Left in on purpose: the console is the only place this is recoverable from.
    console.error("Console crashed while rendering:", error, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <BootFailure
        title="The console hit an error"
        detail={this.state.message}
      />
    );
  }
}
