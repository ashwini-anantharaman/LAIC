/**
 * Learning runtime — STUB. Stands in for the real Learning Platform module.
 * The shell knows nothing about this file beyond the RuntimeModule contract;
 * it is fetched as its own chunk only when the config enables `learning`.
 * Content is keyed by programContext.defaultDomainId, mirroring how the real
 * module would fetch program content from the Learning Platform by programId.
 */
import { Route, Routes } from "react-router-dom";
import type { AppShellConfig, LaunchContext } from "@laic/app-shell";

const CONTENT: Record<string, { unitWord: string; units: Array<{ title: string; blurb: string; pct: number }> }> = {
  brainbee: {
    unitWord: "Chapter",
    units: [
      { title: "Neuroanatomy Foundations", blurb: "Lobes, tracts, and the geography of the brain.", pct: 80 },
      { title: "Neurons & Signaling", blurb: "Action potentials, synapses, neurotransmitters.", pct: 55 },
      { title: "Sensory Systems", blurb: "Vision, audition, somatosensation.", pct: 20 },
      { title: "Memory & Learning", blurb: "Hippocampus, plasticity, consolidation.", pct: 0 },
    ],
  },
  mindaib: {
    unitWord: "Challenge set",
    units: [
      { title: "Minds & Machines", blurb: "What thinking is — and what machines do instead.", pct: 65 },
      { title: "Decisions & Biases", blurb: "Heuristics, framing, and predictable errors.", pct: 40 },
      { title: "AI Concepts", blurb: "Models, training, and where AI breaks.", pct: 15 },
      { title: "Scenario Round", blurb: "Applied reasoning under competition rules.", pct: 0 },
    ],
  },
};

function CourseHome({ config }: { config: AppShellConfig }) {
  const c = CONTENT[config.programContext.defaultDomainId] ?? CONTENT.brainbee;
  return (
    <div className="module-screen">
      <div className="module-banner rise d1">
        <b>Learning runtime (stub).</b> Mounted by the shell through the module registry — this chunk only
        loads because this app's config sets <b>enabledModules.learning: true</b>. The real module fetches
        course content from the Learning Platform for program <b>{config.programContext.programId}</b>.
      </div>
      <h3 className="rise d1">{config.identity.shortName} — your {c.unitWord.toLowerCase()}s</h3>
      <p className="screen-sub rise d2">Pick up where you left off.</p>
      <div className="stub-grid">
        {c.units.map((u, i) => (
          <div key={u.title} className={`stub-card rise d${Math.min(2 + i, 6)}`}>
            <div className="stub-tag">
              {c.unitWord} {i + 1}
            </div>
            <h4>{u.title}</h4>
            <p>{u.blurb}</p>
            <div className="stub-bar">
              <i style={{ width: `${u.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Progress({ ctx }: { ctx: LaunchContext }) {
  const rows = [
    { label: "Study streak", value: "6 days" },
    { label: "Quiz accuracy", value: "82%" },
    { label: "Units completed", value: "2 of 4" },
    { label: "Time this week", value: "3h 40m" },
  ];
  return (
    <div className="module-screen">
      <h3 className="rise d1">Progress</h3>
      <p className="screen-sub rise d2">
        Signed in as {ctx.displayName} · {ctx.selectedRole.replace(/_/g, " ")}
      </p>
      <div className="stub-grid">
        {rows.map((r, i) => (
          <div key={r.label} className={`stub-card rise d${Math.min(2 + i, 6)}`}>
            <div className="stub-tag">{r.label}</div>
            <h4>{r.value}</h4>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LearningModule({ ctx, config }: { ctx: LaunchContext; config: AppShellConfig }) {
  return (
    <Routes>
      <Route path="home" element={<CourseHome config={config} />} />
      <Route path="progress" element={<Progress ctx={ctx} />} />
      <Route path="*" element={<CourseHome config={config} />} />
    </Routes>
  );
}
