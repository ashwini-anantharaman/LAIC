import { useEffect, useId, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Dices, RotateCcw, Spade } from "lucide-react";
import { getMe, getToken, setToken, clearToken, exchangeLaunchToken, generateScenario, listScenarios } from "../services/api";
import type { MembershipSummary, Scenario } from "../types/game";

// ─── Tokens (matches platform_logic's dark theme) ──────────────────────────────

const BASE = "#1a1a1e";
const PANEL = "#141417";
const INPUT_BG = "#222228";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.40)";
const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const slide = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as const },
};

const GAME_TYPES = ["Bridge", "Poker", "Blackjack", "Other"];

function Grain({ opacity = 0.22 }: { opacity?: number }) {
  const raw = useId();
  const id = "g" + raw.replace(/[^a-z0-9]/gi, "");
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none select-none absolute inset-0 w-full h-full"
      style={{ opacity, mixBlendMode: "overlay" }}
    >
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="linearRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ background: BASE }}>
      <Grain opacity={0.2} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.35) 0%, transparent 60%)" }} />
      <div className="absolute top-0 right-0 w-[420px] h-[420px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(48,26,78,0.30) 0%, transparent 55%)" }} />
      {children}
    </div>
  );
}

function PhoneCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 w-full max-w-[380px] rounded-[2rem] p-8" style={{ background: PANEL, border: `1px solid ${BORDER}`, boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
      {children}
    </div>
  );
}

function WhiteBtn({ children, onClick, disabled, icon: Icon }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; icon?: React.ElementType;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="w-full h-12 rounded-full bg-white text-[#111] text-sm font-semibold tracking-tight hover:bg-white/90 active:scale-[0.98] transition-all duration-150 focus:outline-none disabled:opacity-50 flex items-center justify-center gap-2"
      style={{ fontFamily: FONT_BODY }}
    >
      {children}
      {Icon && <Icon size={15} />}
    </button>
  );
}

function ErrorText({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-400 mt-2 text-center" style={{ fontFamily: FONT_BODY }}>{msg}</p>;
}

// ─── Token Handoff ──────────────────────────────────────────────────────────────

function TokenHandoff({ onReady, onError }: { onReady: (m: MembershipSummary) => void; onError: (msg: string) => void }) {
  useEffect(() => {
    async function resolve() {
      const params = new URLSearchParams(window.location.search);
      const launchToken = params.get("lt");
      const legacyToken = params.get("token");

      if (launchToken) {
        window.history.replaceState({}, "", window.location.pathname);
        try {
          const { access_token } = await exchangeLaunchToken(launchToken);
          setToken(access_token);
        } catch (err) {
          onError(err instanceof Error ? err.message : "This launch link has expired. Return to the Life in AI platform and try again.");
          return;
        }
      } else if (legacyToken) {
        // Fallback for orgs that haven't registered a Game app yet — a raw
        // session token in the URL. Remove once every org has migrated.
        setToken(legacyToken);
        window.history.replaceState({}, "", window.location.pathname);
      }

      if (!getToken()) {
        onError("No access token found. Log in from the Life in AI platform as a coach to reach the Game Platform.");
        return;
      }
      try {
        const me = await getMe();
        const gameMembership = me.memberships.find((m) => m.program_category === "game");
        if (!gameMembership) {
          onError("This account isn't part of a Game program yet.");
          return;
        }
        onReady(gameMembership);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Could not verify your account.");
      }
    }
    resolve();
  }, []);

  return (
    <Shell>
      <p className="relative z-10 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>Loading Game Platform…</p>
    </Shell>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <Shell>
      <PhoneCard>
        <div className="w-10 h-10 rounded-xl mx-auto mb-6 flex items-center justify-center" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
          <Dices size={16} color="rgba(255,255,255,0.6)" />
        </div>
        <h1 className="text-center text-xl font-bold text-white mb-3 tracking-tight" style={{ fontFamily: FONT_HEAD }}>Game Platform</h1>
        <p className="text-center text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>{message}</p>
      </PhoneCard>
    </Shell>
  );
}

// ─── Coach Home ─────────────────────────────────────────────────────────────────

function CoachHome({ membership, onNewScenario, onOpenScenario, onLogout }: {
  membership: MembershipSummary;
  onNewScenario: () => void;
  onOpenScenario: (s: Scenario) => void;
  onLogout: () => void;
}) {
  const [recent, setRecent] = useState<Scenario[]>([]);

  useEffect(() => {
    if (membership.program_id) {
      listScenarios(membership.program_id).then(setRecent).catch(() => {});
    }
  }, [membership.program_id]);

  return (
    <Shell>
      <motion.div className="relative z-10 w-full max-w-[380px]" {...slide}>
        <PhoneCard>
          <p className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>Coach Console</p>
          <h1 className="text-2xl font-bold text-white mb-1 tracking-tight" style={{ fontFamily: FONT_HEAD }}>{membership.program_name || "Your Game Program"}</h1>
          <p className="text-sm mb-8" style={{ color: MUTED, fontFamily: FONT_BODY }}>{membership.org_name}</p>

          <WhiteBtn onClick={onNewScenario} icon={ArrowRight}>New Scenario</WhiteBtn>

          {recent.length > 0 && (
            <div className="mt-8">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: MUTED, fontFamily: FONT_BODY }}>Recent Scenarios</p>
              <div className="flex flex-col gap-2">
                {recent.slice(0, 5).map((s) => (
                  <button
                    key={s.id} onClick={() => onOpenScenario(s)}
                    className="text-left px-4 py-3 rounded-xl transition-colors hover:bg-white/6 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}
                  >
                    <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{s.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>{s.game_type}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={onLogout} className="mt-8 w-full text-center text-xs hover:text-white transition-colors focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>Log out</button>
        </PhoneCard>
      </motion.div>
    </Shell>
  );
}

// ─── Scenario Prompt ────────────────────────────────────────────────────────────

function ScenarioPrompt({ membership, onBack, onGenerated }: {
  membership: MembershipSummary;
  onBack: () => void;
  onGenerated: (s: Scenario) => void;
}) {
  const [gameType, setGameType] = useState(GAME_TYPES[0]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!prompt.trim() || !membership.program_id) return;
    setError("");
    setLoading(true);
    try {
      const scenario = await generateScenario({ program_id: membership.program_id, game_type: gameType, prompt });
      onGenerated(scenario);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate scenario");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <motion.div className="relative z-10 w-full max-w-[380px]" {...slide}>
        <PhoneCard>
          <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 focus:outline-none group" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            <span className="group-hover:text-white transition-colors">←</span>
            <span className="group-hover:text-white/80 transition-colors">Back</span>
          </button>

          <h1 className="text-xl font-bold text-white mb-1 tracking-tight" style={{ fontFamily: FONT_HEAD }}>New Scenario</h1>
          <p className="text-sm mb-6" style={{ color: MUTED, fontFamily: FONT_BODY }}>Describe a situation — we'll turn it into gameplay.</p>

          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED, fontFamily: FONT_BODY }}>Game</p>
          <div className="flex flex-col gap-2.5 mb-6">
            {GAME_TYPES.map((g) => {
              const on = gameType === g;
              return (
                <button
                  key={g} onClick={() => setGameType(g)}
                  className="w-full flex items-center justify-between px-4 h-12 rounded-xl transition-all duration-150 focus:outline-none"
                  style={{ background: on ? "rgba(255,255,255,0.90)" : INPUT_BG, border: `1px solid ${on ? "transparent" : BORDER}` }}
                >
                  <span className="text-sm font-medium" style={{ color: on ? "#111" : "white", fontFamily: FONT_BODY }}>{g}</span>
                  <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: on ? "#111" : "transparent", border: `1.5px solid ${on ? "#111" : "rgba(255,255,255,0.25)"}` }}>
                    {on && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED, fontFamily: FONT_BODY }}>Situation</p>
          <textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. It's the final hand, dealer has a strong opening bid and my partner just made an unexpected overcall…"
            rows={4}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 mb-6 resize-none"
            style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
          />

          <WhiteBtn onClick={handleSubmit} disabled={loading || !prompt.trim()} icon={ArrowRight}>
            {loading ? "Generating…" : "Play It Out"}
          </WhiteBtn>
          <ErrorText msg={error} />
        </PhoneCard>
      </motion.div>
    </Shell>
  );
}

// ─── Scenario Playback ──────────────────────────────────────────────────────────

function ScenarioPlayback({ scenario, onNewScenario, onBackHome }: {
  scenario: Scenario;
  onNewScenario: () => void;
  onBackHome: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const total = scenario.steps.length;
  const atOutcome = stepIndex >= total;

  return (
    <Shell>
      <motion.div className="relative z-10 w-full max-w-[380px]" {...slide}>
        <PhoneCard>
          <div className="flex items-center justify-between mb-6">
            <button onClick={onBackHome} className="text-sm focus:outline-none hover:text-white transition-colors" style={{ color: MUTED, fontFamily: FONT_BODY }}>← Home</button>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED, fontFamily: FONT_BODY }}>{scenario.game_type}</span>
          </div>

          <h1 className="text-xl font-bold text-white mb-2 tracking-tight" style={{ fontFamily: FONT_HEAD }}>{scenario.title}</h1>
          <p className="text-sm mb-6" style={{ color: MUTED, fontFamily: FONT_BODY }}>{scenario.setup}</p>

          <div className="h-1 rounded-full mb-6 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <motion.div className="h-full bg-white" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (stepIndex / Math.max(total, 1)) * 100)}%` }} transition={{ duration: 0.3 }} />
          </div>

          <AnimatePresence mode="wait">
            {!atOutcome ? (
              <motion.div key={stepIndex} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                <div className="rounded-2xl p-5 mb-6 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-2">
                    <Spade size={13} color={MUTED} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED, fontFamily: FONT_BODY }}>Beat {stepIndex + 1} of {total}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-white/90" style={{ fontFamily: FONT_BODY }}>{scenario.steps[stepIndex]?.narration}</p>
                  {scenario.steps[stepIndex]?.dialogue && (
                    <p className="text-sm italic leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", fontFamily: FONT_BODY }}>
                      "{scenario.steps[stepIndex]?.dialogue}"
                    </p>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="outcome" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <div className="rounded-2xl p-5 mb-6 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}` }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED, fontFamily: FONT_BODY }}>Outcome</span>
                  <p className="text-sm leading-relaxed text-white/90" style={{ fontFamily: FONT_BODY }}>{scenario.outcome}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!atOutcome ? (
            <WhiteBtn onClick={() => setStepIndex((i) => i + 1)} icon={ArrowRight}>Continue</WhiteBtn>
          ) : (
            <WhiteBtn onClick={onNewScenario} icon={RotateCcw}>New Scenario</WhiteBtn>
          )}
        </PhoneCard>
      </motion.div>
    </Shell>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

type Screen = "handoff" | "error" | "home" | "prompt" | "playback";

export default function App() {
  const [screen, setScreen] = useState<Screen>("handoff");
  const [errorMsg, setErrorMsg] = useState("");
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);

  function handleLogout() {
    clearToken();
    setMembership(null);
    setScreen("error");
    setErrorMsg("Logged out. Return to the Life in AI platform to log back in as a coach.");
  }

  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      <AnimatePresence mode="wait">
        {screen === "handoff" && (
          <motion.div key="handoff" {...slide}>
            <TokenHandoff
              onReady={(m) => { setMembership(m); setScreen("home"); }}
              onError={(msg) => { setErrorMsg(msg); setScreen("error"); }}
            />
          </motion.div>
        )}
        {screen === "error" && (
          <motion.div key="error" {...slide}>
            <AuthError message={errorMsg} />
          </motion.div>
        )}
        {screen === "home" && membership && (
          <motion.div key="home" {...slide}>
            <CoachHome
              membership={membership}
              onNewScenario={() => setScreen("prompt")}
              onOpenScenario={(s) => { setActiveScenario(s); setScreen("playback"); }}
              onLogout={handleLogout}
            />
          </motion.div>
        )}
        {screen === "prompt" && membership && (
          <motion.div key="prompt" {...slide}>
            <ScenarioPrompt
              membership={membership}
              onBack={() => setScreen("home")}
              onGenerated={(s) => { setActiveScenario(s); setScreen("playback"); }}
            />
          </motion.div>
        )}
        {screen === "playback" && activeScenario && (
          <motion.div key="playback" {...slide}>
            <ScenarioPlayback
              scenario={activeScenario}
              onNewScenario={() => setScreen("prompt")}
              onBackHome={() => setScreen("home")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
