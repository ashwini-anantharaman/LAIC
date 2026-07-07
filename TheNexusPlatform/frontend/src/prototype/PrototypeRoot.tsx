import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, GraduationCap, User, ArrowRight, LogOut } from "lucide-react";
import type { Persona } from "./data";
import { ORG_NAME } from "./data";
import { BASE, BORDER, BORDER_STRONG, MUTED, FAINT, FONT_HEAD, FONT_BODY, ATMO, Grain, slide } from "./ui";
import OrganizationApp from "./OrganizationApp";
import CoachApp from "./CoachApp";
import LearnerApp from "./LearnerApp";

const PERSONAS: { key: Persona; label: string; blurb: string; Icon: typeof Building2 }[] = [
  { key: "organization", label: "Organization", blurb: "Owns programs. Assigns coaches, tracks everything, and configures applications from program content.", Icon: Building2 },
  { key: "coach", label: "Teacher / Coach", blurb: "Assigned to a program. Creates courses and content, and invites learners.", Icon: GraduationCap },
  { key: "learner", label: "Learner", blurb: "Invited into a program. Chooses courses and works through the content coaches create.", Icon: User },
];

// ─── Persona chooser (prototype entry) ─────────────────────────────────────────

function PersonaChooser({ onPick, onExit }: { onPick: (p: Persona) => void; onExit?: () => void }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6" style={{ background: ATMO }}>
      <Grain opacity={0.2} />
      {onExit && (
        <button
          onClick={onExit}
          className="absolute top-5 right-6 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none"
          style={{ color: MUTED, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
        >
          <LogOut size={13} /> Back to dashboard
        </button>
      )}
      <motion.div {...slide} className="relative z-10 w-full max-w-3xl">
        <div className="text-center mb-12">
          <p className="text-[11px] font-semibold tracking-[0.22em] uppercase" style={{ color: FAINT, fontFamily: FONT_BODY }}>✳ {ORG_NAME} · Platform prototype</p>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1]" style={{ fontFamily: FONT_HEAD }}>See the flow for each user</h1>
          <p className="mt-4 text-sm max-w-md mx-auto" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            Choose a role to walk its journey. You can switch at any time from the bar at the top.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PERSONAS.map(({ key, label, blurb, Icon }) => (
            <button
              key={key}
              onClick={() => onPick(key)}
              className="text-left p-6 rounded-2xl transition-all hover:bg-white/[0.06] active:scale-[0.99] focus:outline-none group flex flex-col gap-4"
              style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ border: `1px solid ${BORDER_STRONG}`, background: "rgba(255,255,255,0.04)" }}>
                <Icon size={19} color="rgba(255,255,255,0.8)" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{label}</h3>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MUTED, fontFamily: FONT_BODY }}>{blurb}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 group-hover:text-white transition-colors" style={{ fontFamily: FONT_BODY }}>
                Enter <ArrowRight size={13} />
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Persona switch bar (persistent) ───────────────────────────────────────────

function PersonaBar({ active, onChange, onHome, onExit, exitLabel = "Dashboard", locked = false }: { active: Persona; onChange: (p: Persona) => void; onHome: () => void; onExit?: () => void; exitLabel?: string; locked?: boolean }) {
  const activeMeta = PERSONAS.find((p) => p.key === active);
  return (
    <div className="sticky top-0 z-30 backdrop-blur-md" style={{ background: "rgba(20,20,23,0.8)", borderBottom: `1px solid ${BORDER}` }}>
      <div className="max-w-6xl mx-auto px-6 md:px-12 h-14 flex items-center justify-between gap-4">
        <button onClick={onHome} disabled={locked} className="flex items-center gap-2 focus:outline-none group disabled:cursor-default">
          <span className="text-white/60 group-hover:text-white transition-colors">✳</span>
          <span className="text-xs font-semibold tracking-wide text-white/70 group-hover:text-white transition-colors hidden sm:inline" style={{ fontFamily: FONT_BODY }}>{ORG_NAME}</span>
        </button>
        <div className="flex items-center gap-3">
          {locked ? (
            // Real signed-in teacher/learner: show their role, no switcher.
            <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
              {activeMeta && <activeMeta.Icon size={13} color="rgba(255,255,255,0.7)" />}
              <span className="text-xs font-semibold text-white/80" style={{ fontFamily: FONT_BODY }}>{activeMeta?.label}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
              <span className="text-[10px] uppercase tracking-wider px-2 hidden md:inline" style={{ color: FAINT, fontFamily: FONT_BODY }}>Viewing as</span>
              {PERSONAS.map(({ key, label, Icon }) => {
                const on = key === active;
                return (
                  <button
                    key={key}
                    onClick={() => onChange(key)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 focus:outline-none"
                    style={{ background: on ? "rgba(255,255,255,0.9)" : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}
                  >
                    <Icon size={13} /><span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {onExit && (
            <button
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none"
              style={{ color: MUTED, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
              title={exitLabel}
            >
              <LogOut size={13} /><span className="hidden sm:inline">{exitLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function PrototypeRoot({
  onExit, initialPersona = null, lockPersona = false, exitLabel = "Dashboard",
}: {
  onExit?: () => void; initialPersona?: Persona | null; lockPersona?: boolean; exitLabel?: string;
} = {}) {
  const [persona, setPersona] = useState<Persona | null>(initialPersona);

  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      <AnimatePresence mode="wait">
        {persona === null ? (
          <motion.div key="chooser" {...slide}><PersonaChooser onPick={setPersona} onExit={onExit} /></motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PersonaBar
              active={persona}
              onChange={setPersona}
              onHome={() => !lockPersona && setPersona(null)}
              onExit={onExit}
              exitLabel={exitLabel}
              locked={lockPersona}
            />
            <AnimatePresence mode="wait">
              <motion.div key={persona} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
                {persona === "organization" && <OrganizationApp />}
                {persona === "coach" && <CoachApp />}
                {persona === "learner" && <LearnerApp />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
