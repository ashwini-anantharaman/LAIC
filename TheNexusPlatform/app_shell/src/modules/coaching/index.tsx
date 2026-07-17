/**
 * Coaching runtime — STUB. Reached only through the entitlement gate, so this
 * screen rendering at all means the viewer holds the required key.
 */
import { Route, Routes } from "react-router-dom";
import type { AppShellConfig, LaunchContext } from "@laic/app-shell";

function CoachDashboard({ ctx }: { ctx: LaunchContext }) {
  return (
    <div className="module-screen">
      <div className="module-banner rise d1">
        <b>Coaching runtime (stub).</b> You can see this because your launch context includes the required
        entitlement. The real module hosts the coach panel, hint ladder, and player review tools.
      </div>
      <h3 className="rise d1">Coach Studio</h3>
      <p className="screen-sub rise d2">Welcome back, {ctx.displayName}.</p>
      <div className="stub-grid">
        {[
          { t: "Players", d: "12 active this week" },
          { t: "Review queue", d: "4 hands waiting for comments" },
          { t: "Hint ladder", d: "3 custom ladders published" },
        ].map((c, i) => (
          <div key={c.t} className={`stub-card rise d${Math.min(2 + i, 6)}`}>
            <div className="stub-tag">{c.t}</div>
            <h4>{c.d}</h4>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoachingModule({ ctx }: { ctx: LaunchContext; config: AppShellConfig }) {
  return (
    <Routes>
      <Route path="dashboard" element={<CoachDashboard ctx={ctx} />} />
      <Route path="*" element={<CoachDashboard ctx={ctx} />} />
    </Routes>
  );
}
