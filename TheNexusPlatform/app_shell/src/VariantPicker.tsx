/**
 * Dev-only launcher (demo chrome, not part of any app or of the shell
 * package). In a real build the variant is frozen at build time; this screen
 * lets one dev server demo all three apps.
 */
const APPS = [
  {
    slug: "brainbee",
    name: "Brain Bee Study",
    desc: "Neuroscience chapters, guided study, quizzes, and review.",
    color: "#8a76e8",
    glyph: "◉",
  },
  {
    slug: "mindaib",
    name: "MindAI Bee",
    desc: "Mind, brain, decision making, and AI — tutorials and challenge practice.",
    color: "#f0a63a",
    glyph: "⬡",
  },
  {
    slug: "bridgecoach",
    name: "Bridge Coach",
    desc: "Practice bridge with configurable players, analysis, and coaching.",
    color: "#5fb08a",
    glyph: "♠",
  },
];

export function VariantPicker({ onPick }: { onPick: (slug: string) => void }) {
  return (
    <div className="picker-page">
      <p className="picker-kicker">LAIC App Shell · dev launcher</p>
      <h1>One shell package. Three apps.</h1>
      <p className="picker-sub">
        Every screen past this point is <code>@laic/app-shell</code> rendering an{" "}
        <code>AppShellConfig</code> record — theme, role buttons, auth methods, onboarding, navigation,
        entitlement gates. The content behind the door is this demo's, not the shell's.
      </p>
      <div className="picker-grid">
        {APPS.map((a) => (
          <button key={a.slug} className="picker-card" style={{ "--pc": a.color } as React.CSSProperties} onClick={() => onPick(a.slug)}>
            <div className="pc-mark">{a.glyph}</div>
            <h3>{a.name}</h3>
            <p>{a.desc}</p>
            <div className="pc-slug">?app={a.slug}</div>
          </button>
        ))}
      </div>
      <p className="picker-note">
        Production builds freeze one variant per app-store binary (spec §7–8).<br />
        Deep-link any variant with <code>?app=&lt;slug&gt;</code> · or open the{" "}
        <a href="/editor" style={{ color: "#8b897f" }}>admin config editor</a> and reshape an app live.
      </p>
    </div>
  );
}
