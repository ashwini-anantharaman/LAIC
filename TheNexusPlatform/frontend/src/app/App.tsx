import { useState, useEffect, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, Mail, Lock, Building2, AtSign, KeyRound, Copy, Check, LayoutGrid, GraduationCap, User } from "lucide-react";
import PrototypeRoot from "../prototype/PrototypeRoot";
import type { Persona } from "../prototype/data";
import {
  signup,
  login,
  getMe,
  setupOrg,
  getDashboard,
  buildPermissionDefaults,
  createJoinCode,
  getToken,
  clearToken,
} from "../services/api";
import type { DashboardData, JoinCodeKind, SignupType } from "../types/platform";

// ─── Tokens ───────────────────────────────────────────────────────────────────

const BASE = "#1a1a1e";
const PANEL = "#141417";
const INPUT_BG = "#222228";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.40)";
const FONT_HEAD = "'Space Grotesk', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const ATMO = [
  "radial-gradient(ellipse 80% 70% at 0% 100%, rgba(130,30,22,0.80) 0%, transparent 55%)",
  "radial-gradient(ellipse 60% 55% at 90% 5%,  rgba(48,26,78,0.55) 0%, transparent 55%)",
  "radial-gradient(ellipse 50% 40% at 45% 60%,  rgba(14,10,24,0.60) 0%, transparent 60%)",
  BASE,
].join(", ");

type Screen = "landing" | "login" | "signup" | "org-setup" | "dashboard" | "platform";

// Roles surfaced on the landing page for login / signup.
type AuthRole = "org" | "teacher" | "student";
const AUTH_ROLES: { key: AuthRole; label: string; desc: string; Icon: React.ElementType }[] = [
  { key: "org", label: "Organization", desc: "Own programs, assign coaches, configure applications", Icon: Building2 },
  { key: "teacher", label: "Teacher / Coach", desc: "Create courses & invite learners in your program", Icon: GraduationCap },
  { key: "student", label: "Learner", desc: "Join a program and work through its courses", Icon: User },
];
const ROLE_HEADING: Record<SignupType, string> = {
  org: "Organization", administrator: "Administrator", teacher: "Teacher / Coach", student: "Learner",
};

const slide = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as const },
};

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

function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: PANEL }}>
      <div className="relative hidden md:flex flex-1 items-end p-10 overflow-hidden" style={{ background: ATMO }}>
        <Grain opacity={0.2} />
        <p className="relative z-10 text-[11px] font-semibold tracking-[0.22em] uppercase" style={{ color: "rgba(255,255,255,0.35)", fontFamily: FONT_BODY }}>
          ✳ Life in AI Center Platform
        </p>
      </div>
      <div
        className="relative flex flex-col justify-center items-center w-full md:w-[400px] flex-shrink-0 px-9 py-14"
        style={{ background: PANEL, borderLeft: `1px solid ${BORDER}` }}
      >
        {children}
      </div>
    </div>
  );
}

function InputField({
  type = "text", placeholder, value, onChange,
  Icon, trailing, required,
}: {
  type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; Icon?: React.ElementType;
  trailing?: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 h-12 rounded-xl w-full" style={{ background: INPUT_BG, border: `1px solid ${BORDER}` }}>
      {Icon && <Icon size={15} color={MUTED} style={{ flexShrink: 0 }} />}
      <input
        type={type} value={value} placeholder={placeholder} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[rgba(255,255,255,0.25)]"
        style={{ fontFamily: FONT_BODY }}
      />
      {trailing}
    </div>
  );
}

function WhiteBtn({ children, type = "button", onClick, disabled, full = true }: {
  children: React.ReactNode; type?: "button" | "submit";
  onClick?: () => void; disabled?: boolean; full?: boolean;
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`${full ? "w-full" : ""} h-12 rounded-xl bg-white text-[#111] text-sm font-semibold tracking-tight hover:bg-white/90 active:scale-[0.98] transition-all duration-150 focus:outline-none disabled:opacity-50`}
      style={{ fontFamily: FONT_BODY }}
    >
      {children}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-sm mb-10 focus:outline-none group" style={{ color: MUTED, fontFamily: FONT_BODY }}>
      <span className="group-hover:text-white transition-colors">←</span>
      <span className="group-hover:text-white/80 transition-colors">Back</span>
    </button>
  );
}

function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.101 18.08.114 18.101.13 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}

function ErrorText({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-400 mt-1" style={{ fontFamily: FONT_BODY }}>{msg}</p>;
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function Landing({ onLogin, onSignup }: { onLogin: (role: AuthRole) => void; onSignup: (role: AuthRole) => void }) {
  const [role, setRole] = useState<AuthRole>("org");
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden" style={{ background: BASE }}>
      <Grain opacity={0.22} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 90% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.35) 100%)" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(130,30,22,0.45) 0%, transparent 55%)" }} />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(48,26,78,0.35) 0%, transparent 55%)" }} />

      <motion.div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl" {...slide}>
        <div className="mb-8 w-11 h-11 rounded-full flex items-center justify-center" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
          <span className="text-white/60 text-base">✳</span>
        </div>
        <h1 className="text-5xl md:text-[3.75rem] font-bold text-white leading-[1.1] tracking-tight mb-5" style={{ fontFamily: FONT_HEAD }}>
          Life in AI Center<br />Platform
        </h1>
        <p className="text-sm leading-relaxed mb-10 max-w-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          The unified infrastructure for academic AI challenges and organizational management.
        </p>

        <p className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: MUTED, fontFamily: FONT_BODY }}>I am a…</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full mb-8">
          {AUTH_ROLES.map(({ key, label, desc, Icon }) => {
            const on = role === key;
            return (
              <button
                key={key}
                onClick={() => setRole(key)}
                className="text-left p-4 rounded-2xl transition-all active:scale-[0.99] focus:outline-none"
                style={{
                  border: `1px solid ${on ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.10)"}`,
                  background: on ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                }}
              >
                <Icon size={18} color={on ? "#fff" : "rgba(255,255,255,0.55)"} />
                <p className="mt-2.5 text-sm font-semibold" style={{ color: on ? "#fff" : "rgba(255,255,255,0.8)", fontFamily: FONT_HEAD }}>{label}</p>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: MUTED, fontFamily: FONT_BODY }}>{desc}</p>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={() => onLogin(role)} className="h-12 px-8 rounded-full bg-white text-[#111] text-sm font-semibold hover:bg-white/92 active:scale-[0.97] transition-all duration-150 focus:outline-none" style={{ fontFamily: FONT_BODY }}>
            Log In
          </button>
          <button onClick={() => onSignup(role)} className="h-12 px-8 rounded-full text-sm font-medium text-white/75 hover:text-white hover:bg-white/8 active:scale-[0.97] transition-all duration-150 focus:outline-none" style={{ fontFamily: FONT_BODY, border: "1px solid rgba(255,255,255,0.2)" }}>
            Sign Up
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function Login({ role, onBack, onSuccess, onGoSignup }: { role: AuthRole; onBack: () => void; onSuccess: () => void; onGoSignup: () => void }) {
  const roleLabel = role === "org" ? "Organization" : role === "teacher" ? "Teacher / Coach" : "Learner";
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, pw);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPanel>
      <motion.div className="w-full max-w-[280px]" {...slide}>
        <BackBtn onClick={onBack} />
        <div className="w-10 h-10 rounded-xl mx-auto mb-6 flex items-center justify-center" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
          <span className="text-white/55 text-sm">✳</span>
        </div>
        <p className="text-center text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>{roleLabel} log in</p>
        <h1 className="text-center text-[1.75rem] font-bold text-white mb-8 tracking-tight" style={{ fontFamily: FONT_HEAD }}>Life in AI</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <InputField type="email" placeholder="Your Email" value={email} onChange={setEmail} Icon={Mail} required />
          <InputField
            type={showPw ? "text" : "password"} placeholder="Your Password" value={pw} onChange={setPw} Icon={Lock} required
            trailing={
              <button type="button" onClick={() => setShowPw((v) => !v)} className="text-white/35 hover:text-white/65 transition-colors focus:outline-none" tabIndex={-1}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />
          <div className="mt-0.5"><WhiteBtn type="submit" disabled={loading}>{loading ? "Logging in…" : "Log in"}</WhiteBtn></div>
          <ErrorText msg={error} />
        </form>
        <p className="text-center text-[11px] mt-6" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          {"Don't have an account? "}
          <button onClick={onGoSignup} className="text-white underline underline-offset-2 hover:text-white/70 transition-colors focus:outline-none">Sign up</button>
        </p>
      </motion.div>
    </AuthPanel>
  );
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

function Signup({
  signupType, onBack, onSuccess, onGoLogin,
}: {
  signupType: SignupType;
  onBack: () => void;
  onSuccess: (orgId?: string) => void;
  onGoLogin: () => void;
}) {
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const heading = ROLE_HEADING[signupType];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup({
        signup_type: signupType,
        email,
        password: pw,
        org_name: signupType === "org" ? orgName : undefined,
        join_code: signupType !== "org" ? joinCode : undefined,
      });
      const me = await getMe();
      const oid = me.memberships[0]?.org_id;
      onSuccess(signupType === "org" ? oid : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPanel>
      <motion.div className="w-full max-w-[280px]" {...slide}>
        <BackBtn onClick={onBack} />
        <div className="w-10 h-10 rounded-xl mx-auto mb-6 flex items-center justify-center" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
          <span className="text-white/55 text-sm">✳</span>
        </div>
        <p className="text-center text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>Create your</p>
        <h1 className="text-center text-[1.75rem] font-bold text-white mb-8 tracking-tight" style={{ fontFamily: FONT_HEAD }}>{heading}</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          {signupType === "org" && (
            <InputField type="text" placeholder="Organization Name" value={orgName} onChange={setOrgName} Icon={Building2} required />
          )}
          {signupType !== "org" && (
            <InputField type="text" placeholder="Join Code" value={joinCode} onChange={(v) => setJoinCode(v.toUpperCase())} Icon={KeyRound} required />
          )}
          <InputField type="email" placeholder="Your Email" value={email} onChange={setEmail} Icon={AtSign} required />
          <InputField
            type={showPw ? "text" : "password"} placeholder="Create Password" value={pw} onChange={setPw} Icon={Lock} required
            trailing={
              <button type="button" onClick={() => setShowPw((v) => !v)} className="text-white/35 hover:text-white/65 transition-colors focus:outline-none" tabIndex={-1}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />
          <div className="mt-0.5"><WhiteBtn type="submit" disabled={loading}>{loading ? "Creating account…" : "Continue"}</WhiteBtn></div>
          <ErrorText msg={error} />
        </form>
        <p className="text-center text-[11px] mt-6" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          {"Already have an account? "}
          <button onClick={onGoLogin} className="text-white underline underline-offset-2 hover:text-white/70 transition-colors focus:outline-none">Log in</button>
        </p>
      </motion.div>
    </AuthPanel>
  );
}

// ─── Org Setup ────────────────────────────────────────────────────────────────

type StageKey = "international" | "national" | "state" | "chapter";
const STAGES: { key: StageKey; label: string }[] = [
  { key: "international", label: "International Stage" },
  { key: "national", label: "National Stage" },
  { key: "state", label: "State Stage" },
  { key: "chapter", label: "Chapter Stage" },
];
type Perm = "Can Edit" | "Can View" | "Per Level";
const PERMS: Perm[] = ["Can Edit", "Can View", "Per Level"];

function OrgSetup({ orgId, orgName, onBack, onFinish }: { orgId: string; orgName: string; onBack: () => void; onFinish: () => void }) {
  const [hasChallenge, setHasChallenge] = useState(true);
  const [stages, setStages] = useState<Set<StageKey>>(new Set(["national", "state"]));
  const [adminPerm, setAdminPerm] = useState<Perm>("Can Edit");
  const [teachPerm, setTeachPerm] = useState<Perm>("Can View");
  const [discPerm, setDiscPerm] = useState<Perm>("Per Level");
  const [discord, setDiscord] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  void discPerm;

  function toggle(k: StageKey) {
    setStages((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  async function handleFinish() {
    setError("");
    setLoading(true);
    try {
      const stageTypes = Array.from(stages);
      await setupOrg(orgId, {
        has_challenge: hasChallenge,
        challenge_name: orgName,
        stage_types: stageTypes,
        permission_defaults: buildPermissionDefaults(adminPerm, teachPerm),
        initial_stages: hasChallenge ? [{
          stage_type: "national", name: orgName, discord_url: discord || undefined,
          children: stageTypes.includes("state") ? [{ stage_type: "state", name: "Default State", discord_url: discord || undefined }] : [],
        }] : [],
        discord_link: discord || undefined,
      });
      onFinish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: BASE }}>
      <Grain opacity={0.2} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.30) 0%, transparent 60%)" }} />
      <motion.div className="relative z-10 max-w-5xl mx-auto px-8 md:px-14 py-14" {...slide}>
        <BackBtn onClick={onBack} />
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-12" style={{ fontFamily: FONT_HEAD }}>Organization Sign Up</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
          <div className="flex flex-col gap-9">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)", fontFamily: FONT_BODY }}>Name</label>
              <input type="text" value={orgName} readOnly className="w-full h-12 rounded-xl px-4 text-sm text-white outline-none" style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }} />
            </div>
            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)", fontFamily: FONT_BODY }}>Does your Organization have a Challenge?</label>
              <div className="flex rounded-xl overflow-hidden w-fit" style={{ border: `1px solid ${BORDER}` }}>
                {["Yes", "No"].map((opt) => {
                  const on = (opt === "Yes") === hasChallenge;
                  return (
                    <button key={opt} onClick={() => setHasChallenge(opt === "Yes")} className="px-7 py-2.5 text-sm font-medium transition-all duration-150 focus:outline-none" style={{ background: on ? "rgba(255,255,255,0.90)" : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{opt}</button>
                  );
                })}
              </div>
            </div>
            <AnimatePresence>
              {hasChallenge && (
                <motion.div className="flex flex-col gap-4" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}>
                  {STAGES.map(({ key, label }) => {
                    const on = stages.has(key);
                    return (
                      <button key={key} onClick={() => toggle(key)} className="flex items-center gap-3.5 group focus:outline-none">
                        <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150" style={{ background: on ? "rgba(255,255,255,0.88)" : "transparent", border: `1.5px solid ${on ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.22)"}` }}>
                          {on && <div className="w-2 h-2 rounded-full bg-[#1a1a1e]" />}
                        </div>
                        <span className="text-sm transition-colors" style={{ color: on ? "rgba(255,255,255,0.88)" : MUTED, fontFamily: FONT_BODY }}>{label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>Permissions</h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
              {([
                { label: "Administrators", val: adminPerm, set: setAdminPerm },
                { label: "Teachers", val: teachPerm, set: setTeachPerm },
                { label: "Discord", val: discPerm, set: setDiscPerm },
              ] as const).map(({ label, val, set }, i, arr) => (
                <div key={label} className="flex items-center justify-between px-5 py-4 gap-4" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <span className="text-sm font-semibold text-white/80 flex-shrink-0" style={{ fontFamily: FONT_BODY }}>{label}</span>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {PERMS.map((p) => (
                      <button key={p} onClick={() => set(p)} className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 focus:outline-none" style={{ background: val === p ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.07)", color: val === p ? "#111" : MUTED, border: `1px solid ${val === p ? "transparent" : BORDER}`, fontFamily: FONT_BODY }}>{p}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.45)", fontFamily: FONT_BODY }}>Discord Server Link</label>
              <div className="flex items-center gap-3 px-4 h-12 rounded-xl" style={{ background: INPUT_BG, border: `1px solid ${BORDER}` }}>
                <span style={{ color: "#5865F2", flexShrink: 0 }}><DiscordIcon size={16} /></span>
                <input type="url" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/..." className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/22" style={{ fontFamily: FONT_BODY }} />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-14 flex flex-col items-end gap-2">
          <button onClick={handleFinish} disabled={loading} className="px-10 h-12 rounded-xl bg-white text-[#111] text-[11px] font-bold tracking-[0.12em] uppercase hover:bg-white/90 active:scale-[0.98] transition-all duration-150 focus:outline-none disabled:opacity-50" style={{ fontFamily: FONT_BODY }}>
            {loading ? "Saving…" : "Continue to Dashboard"}
          </button>
          <ErrorText msg={error} />
        </div>
      </motion.div>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between">
        <span className="text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{label}</span>
        <span className="text-xs font-semibold text-white/50" style={{ fontFamily: FONT_BODY }}>{pct}%</span>
      </div>
      <div className="h-[6px] rounded-full" style={{ background: "rgba(255,255,255,0.09)" }}>
        <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }} />
      </div>
    </div>
  );
}

const JOIN_CODE_LABELS: Record<JoinCodeKind, { label: string; hint: string }> = {
  teacher: { label: "Teacher", hint: "Share with educators joining your org" },
  administrator: { label: "Administrator", hint: "Share with org admins for this stage" },
  student: { label: "Student", hint: "Share with students registering for this stage" },
};

function JoinCodesPanel({ stageId, stageName }: { stageId: string; stageName: string }) {
  const [codes, setCodes] = useState<Partial<Record<JoinCodeKind, string>>>({});
  const [generating, setGenerating] = useState<JoinCodeKind | null>(null);
  const [copied, setCopied] = useState<JoinCodeKind | null>(null);
  const [error, setError] = useState("");

  async function generate(kind: JoinCodeKind) {
    setGenerating(kind);
    setError("");
    try {
      const row = await createJoinCode(stageId, kind);
      setCodes((prev) => ({ ...prev, [kind]: row.code }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create join code");
    } finally {
      setGenerating(null);
    }
  }

  async function copyCode(kind: JoinCodeKind) {
    const code = codes[kind];
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
      <div>
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Invite codes</p>
        <p className="mt-1 text-xs text-white/45" style={{ fontFamily: FONT_BODY }}>Generate signup codes for <span className="text-white/70">{stageName}</span></p>
      </div>
      {(["teacher", "administrator", "student"] as JoinCodeKind[]).map((kind) => {
        const meta = JOIN_CODE_LABELS[kind];
        const code = codes[kind];
        return (
          <div key={kind} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{meta.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>{meta.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => generate(kind)}
                disabled={generating !== null}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-colors focus:outline-none disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.10)", color: "white", fontFamily: FONT_BODY }}
              >
                {generating === kind ? "…" : code ? "New" : "Generate"}
              </button>
            </div>
            {code && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-2xl font-bold tracking-[0.18em] text-white" style={{ fontFamily: FONT_HEAD }}>{code}</p>
                <button
                  type="button"
                  onClick={() => copyCode(kind)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-colors focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}
                >
                  {copied === kind ? <Check size={14} /> : <Copy size={14} />}
                  {copied === kind ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
    </div>
  );
}

function Dashboard({ onLogout, onOpenPlatform }: { onLogout: () => void; onOpenPlatform: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeStage, setActiveStage] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    getMe().then((me) => setDisplayName(me.display_name || me.email.split("@")[0])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getDashboard(undefined, activeStage || undefined)
      .then((d) => {
        setData(d);
        if (!activeStage && d.stages.length > 0) setActiveStage(d.active_stage_id || d.stages[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [activeStage]);

  const activeStageData = data?.stages.find((s) => s.id === activeStage);
  const students = data?.students.map((s) => s.display_name || s.email || "Student") ?? [];

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BASE }}>
        <p className="text-white/50" style={{ fontFamily: FONT_BODY }}>Loading dashboard…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: BASE }}>
        <p className="text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>
        <button onClick={onLogout} className="text-sm text-white/50 underline">Log out</button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: BASE }}>
      <Grain opacity={0.18} />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(48,26,78,0.25) 0%, transparent 55%)" }} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.20) 0%, transparent 55%)" }} />
      <motion.div className="relative z-10 max-w-6xl mx-auto px-8 md:px-14 py-14" {...slide}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-5xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Welcome, {displayName || "Admin"}</h1>
            <p className="mt-2 text-base" style={{ color: MUTED, fontFamily: FONT_BODY }}>{data?.org_name ?? "Organization"} — {data?.role_label ?? "Administrator"}</p>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={onOpenPlatform}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-[#111] text-xs font-semibold tracking-tight hover:bg-white/90 active:scale-[0.98] transition-all duration-150 focus:outline-none"
              style={{ fontFamily: FONT_BODY }}
            >
              <LayoutGrid size={14} /> Open Platform
            </button>
            <button onClick={onLogout} className="text-xs hover:text-white transition-colors focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>Log out</button>
          </div>
        </div>
        <div className="mt-8 h-px w-full" style={{ background: BORDER }} />
        <div className="mt-8 mb-10 flex gap-1 w-fit rounded-xl p-1 flex-wrap" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
          {(data?.stages ?? []).map((s) => (
            <button key={s.id} onClick={() => setActiveStage(s.id)} className="px-5 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all duration-150 focus:outline-none" style={{ background: activeStage === s.id ? "rgba(255,255,255,0.88)" : "transparent", color: activeStage === s.id ? "#111" : MUTED, fontFamily: FONT_BODY }}>
              {s.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col gap-5">
            <AnimatePresence mode="wait">
              <motion.div key={activeStage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <div className="rounded-2xl p-7 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                  <div className="text-[2rem] font-bold text-white leading-tight" style={{ fontFamily: FONT_HEAD }}>
                    {activeStageData?.event_at ? new Date(activeStageData.event_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No event set"}
                  </div>
                  <p className="text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{activeStageData?.qualifier_status ?? "Pending"}</p>
                </div>
              </motion.div>
            </AnimatePresence>
            {activeStageData?.discord_url && (
              <a href={activeStageData.discord_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: "#5865F2" }}><DiscordIcon size={18} /></div>
                <span className="text-sm group-hover:text-white transition-colors" style={{ color: MUTED, fontFamily: FONT_BODY }}>{activeStageData.name} Discord Server</span>
              </a>
            )}
            {activeStage && activeStageData && (
              <JoinCodesPanel stageId={activeStage} stageName={activeStageData.name} />
            )}
          </div>
          <div className="flex flex-col gap-7">
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Qualifiers</p>
              <p className="text-sm text-white/45" style={{ fontFamily: FONT_BODY }}>{activeStageData?.qualifier_status ?? "[not unlocked yet]"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Student Sign-ups</p>
              <p className="text-5xl font-bold text-white" style={{ fontFamily: FONT_HEAD }}>{data?.total_signups ?? 0}</p>
              <button onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[11px] underline underline-offset-2 hover:text-white transition-colors focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>{open ? "Hide list" : "View list"}</button>
              <AnimatePresence>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
                      {students.map((n, i) => (
                        <div key={n + i} className="px-4 py-2.5 text-sm text-white/55" style={{ borderBottom: i < students.length - 1 ? `1px solid ${BORDER}` : "none", fontFamily: FONT_BODY }}>{n}</div>
                      ))}
                      {students.length === 0 && <div className="px-4 py-2.5 text-sm text-white/28" style={{ fontFamily: FONT_BODY }}>No registrations yet</div>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Dashboard / Stats</p>
            <div className="flex flex-col gap-5">
              <Bar pct={50} label="Course completion rate" />
              <Bar pct={72} label="Registration progress" />
              <Bar pct={38} label="Practice test submissions" />
            </div>
            <div className="rounded-2xl p-5 mt-2" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Active administrators</p>
              <p className="text-4xl font-bold text-white" style={{ fontFamily: FONT_HEAD }}>—</p>
            </div>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3">
          {(data?.stages ?? []).map((s) => (
            <div key={s.id} className="rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
              <p className="text-[9px] uppercase tracking-[0.18em] mb-1.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>{s.stage_type}</p>
              <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{s.signup_count} signups</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [loginRole, setLoginRole] = useState<AuthRole>("org");
  const [signupType, setSignupType] = useState<SignupType>("org");
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  // How the platform prototype opens: null persona = chooser (org "Open Platform");
  // a fixed persona + locked = a signed-in teacher/learner dropped into their view.
  const [platformEntry, setPlatformEntry] = useState<{ persona: Persona | null; locked: boolean }>({ persona: null, locked: false });

  // After any successful auth, send the user to the destination for their real role.
  async function routeAfterAuth() {
    try {
      const me = await getMe();
      const roles = new Set<string>([me.role, ...me.memberships.map((m) => m.role)]);
      if (roles.has("owner") || roles.has("administrator")) {
        setScreen("dashboard");
      } else if (roles.has("teacher")) {
        setPlatformEntry({ persona: "coach", locked: true });
        setScreen("platform");
      } else {
        setPlatformEntry({ persona: "learner", locked: true });
        setScreen("platform");
      }
    } catch {
      setScreen("dashboard");
    }
  }

  useEffect(() => {
    if (getToken() && screen === "landing") routeAfterAuth();
  }, []);

  function handleLogout() {
    clearToken();
    setOrgId("");
    setOrgName("");
    setPlatformEntry({ persona: null, locked: false });
    setScreen("landing");
  }

  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      <AnimatePresence mode="wait">
        {screen === "landing" && (
          <motion.div key="landing" {...slide}>
            <Landing
              onLogin={(role) => { setLoginRole(role); setScreen("login"); }}
              onSignup={(role) => { setSignupType(role); setScreen("signup"); }}
            />
          </motion.div>
        )}
        {screen === "login" && (
          <motion.div key="login" {...slide}>
            <Login
              role={loginRole}
              onBack={() => setScreen("landing")}
              onSuccess={routeAfterAuth}
              onGoSignup={() => { setSignupType(loginRole); setScreen("signup"); }}
            />
          </motion.div>
        )}
        {screen === "signup" && (
          <motion.div key="signup" {...slide}>
            <Signup
              signupType={signupType}
              onBack={() => setScreen("landing")}
              onGoLogin={() => { setLoginRole(signupType === "administrator" ? "org" : signupType); setScreen("login"); }}
              onSuccess={(newOrgId) => {
                if (signupType === "org" && newOrgId) {
                  setOrgId(newOrgId);
                  getMe().then((me) => { setOrgName(me.memberships[0]?.org_name || ""); setScreen("org-setup"); });
                } else {
                  routeAfterAuth();
                }
              }}
            />
          </motion.div>
        )}
        {screen === "org-setup" && orgId && (
          <motion.div key="org-setup" {...slide}>
            <OrgSetup orgId={orgId} orgName={orgName} onBack={() => setScreen("signup")} onFinish={() => setScreen("dashboard")} />
          </motion.div>
        )}
        {screen === "dashboard" && (
          <motion.div key="dashboard" {...slide}>
            <Dashboard onLogout={handleLogout} onOpenPlatform={() => { setPlatformEntry({ persona: null, locked: false }); setScreen("platform"); }} />
          </motion.div>
        )}
        {screen === "platform" && (
          <motion.div key="platform" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PrototypeRoot
              initialPersona={platformEntry.persona}
              lockPersona={platformEntry.locked}
              exitLabel={platformEntry.locked ? "Log out" : "Dashboard"}
              onExit={platformEntry.locked ? handleLogout : () => setScreen("dashboard")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
