/**
 * Bridge runtime — STUB standing in for the real bridge engine. Loaded as its
 * own chunk only when config enables `bridge` (Brain Bee / MindAI Bee builds
 * never fetch this code — the bundle-level gate the briefing demands).
 */
import { Route, Routes } from "react-router-dom";
import type { AppShellConfig, LaunchContext } from "@laic/app-shell";

const SEATS = [
  { seat: "North", who: "You", style: "—" },
  { seat: "East", who: "Robo-Meck", style: "aggressive preempts" },
  { seat: "South", who: "Partner-3B", style: "solid 2/1" },
  { seat: "West", who: "Cautious-Kit", style: "passed-hand specialist" },
];

function BridgeHome({ config }: { config: AppShellConfig }) {
  return (
    <div className="module-screen">
      <div className="module-banner rise d1">
        <b>Bridge runtime (stub).</b> This chunk exists in the bundle only because this config sets{" "}
        <b>enabledModules.bridge: true</b>. The real module hosts the table, bidding, and analysis engines.
      </div>
      <h3 className="rise d1">The Table</h3>
      <p className="screen-sub rise d2">
        {config.featureFlags.aiPlayerProfiles ? "Configurable AI players are enabled for this build." : "Standard players."}
      </p>
      <div className="stub-grid">
        {SEATS.map((s, i) => (
          <div key={s.seat} className={`stub-card rise d${Math.min(2 + i, 6)}`}>
            <div className="stub-tag">{s.seat}</div>
            <h4>{s.who}</h4>
            <p>{s.style}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BridgeTable({ ctx }: { ctx: LaunchContext }) {
  return (
    <div className="module-screen">
      <h3 className="rise d1">Practice deal</h3>
      <p className="screen-sub rise d2">Dealer North · None vul · {ctx.displayName} sits North</p>
      <div className="stub-grid">
        {[
          { t: "Your hand", d: "♠ A K 7 4 · ♥ Q 6 · ♦ K J 9 2 · ♣ 8 5 3" },
          { t: "Auction so far", d: "1♦ — pass — 1♠ — pass — ?" },
          { t: "Coach's note", d: "Count your points again before the rebid. What does partner's 1♠ promise?" },
        ].map((c, i) => (
          <div key={c.t} className={`stub-card rise d${Math.min(2 + i, 6)}`}>
            <div className="stub-tag">{c.t}</div>
            <p>{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BridgeModule({ ctx, config }: { ctx: LaunchContext; config: AppShellConfig }) {
  return (
    <Routes>
      <Route path="home" element={<BridgeHome config={config} />} />
      <Route path="table" element={<BridgeTable ctx={ctx} />} />
      <Route path="*" element={<BridgeHome config={config} />} />
    </Routes>
  );
}
