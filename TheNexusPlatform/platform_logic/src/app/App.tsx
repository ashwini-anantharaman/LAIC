import { useState, useEffect, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, Mail, Lock, Building2, AtSign, KeyRound, Copy, Check, GraduationCap, Dices, Plus, Palette } from "lucide-react";
import {
  signup,
  login,
  getMe,
  setupOrg,
  getDashboard,
  buildPermissionDefaults,
  createJoinCode,
  listPrograms,
  createProgram,
  createProgramJoinCode,
  updateOrgTheme,
  getToken,
  clearToken,
  getInvitation,
  acceptInvitation,
} from "../services/api";
import type { DeliveryMethod, StageKey } from "../types/platform";
import type { DashboardData, Invitation, JoinCodeKind, Program, ProgramCategory, SignupType } from "../types/platform";
import { BASE, PANEL, INPUT_BG, BORDER, MUTED, FONT_HEAD, FONT_BODY, slide } from "./theme";
import { OfferingsSection } from "./components/offerings/OfferingsSection";
import { PlatformWorkspace } from "./components/platform/PlatformWorkspace";
import { PlatformAdminConsole } from "./components/platform/PlatformAdminConsole";
import { TeacherWorkspace } from "./components/platform/TeacherWorkspace";
import type { MembershipSummary } from "../types/platform";
import { getAppLaunchContext, listEntitlements, setEntitlement } from "../services/api";
import type { Entitlement, ModuleKey } from "../types/platform";

// ─── Tokens ───────────────────────────────────────────────────────────────────

const GAME_APP_URL =
  (import.meta.env.VITE_GAME_APP_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:5190";

const ATMO = [
  "radial-gradient(ellipse 80% 70% at 0% 100%, rgba(130,30,22,0.80) 0%, transparent 55%)",
  "radial-gradient(ellipse 60% 55% at 90% 5%,  rgba(48,26,78,0.55) 0%, transparent 55%)",
  "radial-gradient(ellipse 50% 40% at 45% 60%,  rgba(14,10,24,0.60) 0%, transparent 60%)",
  BASE,
].join(", ");

type Screen = "landing" | "login-role" | "login" | "signup-role" | "signup" | "org-setup" | "dashboard" | "teacher" | "platform-admin" | "game-handoff" | "invite";

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
          MindBrainAI Nexus Platform
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

function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden" style={{ background: BASE }}>
      <Grain opacity={0.22} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 90% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.35) 100%)" }} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(130,30,22,0.45) 0%, transparent 55%)" }} />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(48,26,78,0.35) 0%, transparent 55%)" }} />

      <motion.div className="relative z-10 flex flex-col items-center text-center px-6 max-w-xl" {...slide}>
        <h1 className="text-5xl md:text-[3.75rem] font-bold text-white leading-[1.1] tracking-tight mb-5" style={{ fontFamily: FONT_HEAD }}>
          MindBrainAI Nexus<br />Platform
        </h1>
        <p className="text-sm leading-relaxed mb-12 max-w-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          The unified infrastructure for academic AI challenges and organizational management.
        </p>
        <div className="flex gap-3">
          <button onClick={onLogin} className="h-12 px-9 rounded-full bg-white text-[#111] text-sm font-semibold hover:bg-white/92 active:scale-[0.97] transition-all duration-150 focus:outline-none" style={{ fontFamily: FONT_BODY }}>
            Login
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Login Role ─────────────────────────────────────────────────────────────

type LoginType = "org" | "administrator";

function LoginRole({ onBack, onSelect }: { onBack: () => void; onSelect: (type: LoginType) => void }) {
  const options: { type: LoginType; label: string; desc: string }[] = [
    { type: "org", label: "Organization", desc: "Sign in to your organization's workspace" },
    { type: "administrator", label: "Administrator", desc: "Sign in as an administrator" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ background: BASE }}>
      <Grain opacity={0.2} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.35) 0%, transparent 60%)" }} />
      <motion.div className="relative z-10 w-full max-w-md px-6 py-14" {...slide}>
        <BackBtn onClick={onBack} />
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2" style={{ fontFamily: FONT_HEAD }}>Log In</h1>
        <p className="text-sm mb-8" style={{ color: MUTED, fontFamily: FONT_BODY }}>How are you signing in?</p>
        <div className="flex flex-col gap-3">
          {options.map(({ type, label, desc }) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-full text-left p-5 rounded-2xl transition-all hover:bg-white/6 active:scale-[0.99] focus:outline-none"
              style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{label}</p>
              <p className="text-xs mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>{desc}</p>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function Login({ onBack, onSuccess, onGoSignup, loginType }: { onBack: () => void; onSuccess: () => void; onGoSignup: () => void; loginType?: LoginType }) {
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
        <p className="text-center text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          {loginType === "administrator" ? "Administrator log in to" : loginType === "org" ? "Organization log in to" : "Log in to"}
        </p>
        <h1 className="text-center text-[1.75rem] font-bold text-white mb-8 tracking-tight" style={{ fontFamily: FONT_HEAD }}>MindBrainAI Nexus Platform</h1>
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

// ─── Sign Up Role ─────────────────────────────────────────────────────────────

function SignupRole({ onBack, onSelect }: { onBack: () => void; onSelect: (type: SignupType) => void }) {
  const options: { type: SignupType; label: string; desc: string }[] = [
    { type: "org", label: "Organization", desc: "Create a new organization and set up your programs" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ background: BASE }}>
      <Grain opacity={0.2} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.35) 0%, transparent 60%)" }} />
      <motion.div className="relative z-10 w-full max-w-md px-6 py-14" {...slide}>
        <BackBtn onClick={onBack} />
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2" style={{ fontFamily: FONT_HEAD }}>Sign Up</h1>
        <p className="text-sm mb-8" style={{ color: MUTED, fontFamily: FONT_BODY }}>What are you signing up as?</p>
        <div className="flex flex-col gap-3">
          {options.map(({ type, label, desc }) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-full text-left p-5 rounded-2xl transition-all hover:bg-white/6 active:scale-[0.99] focus:outline-none"
              style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{label}</p>
              <p className="text-xs mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>{desc}</p>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
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

  const heading =
    signupType === "org" ? "Organization" :
    signupType === "administrator" ? "Administrator" : "Teacher";

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

type Perm = "Can Edit" | "Can View" | "Per Level";
const PERMS: Perm[] = ["Can Edit", "Can View", "Per Level"];

type DraftProgram = {
  name: string;
  category: ProgramCategory;
  description?: string;
  stageType: StageKey; // edu: which level this program's group tree roots at
  classNames: string[]; // game: flat class names
};
const CATEGORY_OPTIONS: { key: ProgramCategory; label: string }[] = [
  { key: "edu", label: "Edu" },
  { key: "game", label: "Game" },
];
const STAGE_OPTIONS: { key: StageKey; label: string }[] = [
  { key: "international", label: "International" },
  { key: "national", label: "National" },
  { key: "state", label: "State" },
  { key: "chapter", label: "Chapter" },
];
const PERM_TO_LEVEL: Record<Perm, "can_edit" | "can_view" | "per_level"> = {
  "Can Edit": "can_edit",
  "Can View": "can_view",
  "Per Level": "per_level",
};

function OrgSetup({ orgId, orgName, onBack, onFinish }: { orgId: string; orgName: string; onBack: () => void; onFinish: () => void }) {
  const [programs, setPrograms] = useState<DraftProgram[]>([]);
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
  const [programCategory, setProgramCategory] = useState<ProgramCategory>("edu");
  const [programStage, setProgramStage] = useState<StageKey>("national");
  const [programClasses, setProgramClasses] = useState("");
  const [adminPerm, setAdminPerm] = useState<Perm>("Can Edit");
  const [teachPerm, setTeachPerm] = useState<Perm>("Can View");
  const [discPerm, setDiscPerm] = useState<Perm>("Per Level");
  const [discord, setDiscord] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addProgram() {
    const name = programName.trim();
    if (!name) return;
    const classNames = programClasses
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    setPrograms((prev) => [
      ...prev,
      {
        name,
        category: programCategory,
        description: programDesc.trim() || undefined,
        stageType: programStage,
        classNames,
      },
    ]);
    setProgramName("");
    setProgramDesc("");
    setProgramClasses("");
  }

  function removeProgram(idx: number) {
    setPrograms((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFinish() {
    setError("");
    setLoading(true);
    try {
      const hasEduProgram = programs.some((p) => p.category === "edu");
      await setupOrg(orgId, {
        has_challenge: hasEduProgram,
        challenge_name: orgName,
        // Per-program group trees are created server-side from each program's
        // stage_type / class_names; no org-wide initial_stages needed anymore.
        stage_types: hasEduProgram ? ["national"] : [],
        permission_defaults: buildPermissionDefaults(adminPerm, teachPerm),
        initial_stages: [],
        discord_link: discord || undefined,
        discord_permission_level: discord ? PERM_TO_LEVEL[discPerm] : undefined,
        programs: programs.map((p) => ({
          name: p.name,
          category: p.category,
          description: p.description,
          stage_type: p.category === "edu" ? p.stageType : undefined,
          class_names: p.category === "game" ? p.classNames : [],
        })),
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
              <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)", fontFamily: FONT_BODY }}>Programs</label>
              <p className="text-xs -mt-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                Add a program for each thing your org runs — pick a category to route coaches/teachers to the right platform.
              </p>
              <div className="flex flex-col gap-2.5">
                <input
                  type="text" value={programName} onChange={(e) => setProgramName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProgram(); } }}
                  placeholder="Program name (e.g. Bridge Club, AI Challenge)"
                  className="w-full h-12 rounded-xl px-4 text-sm text-white outline-none placeholder:text-white/25"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                />
                <input
                  type="text" value={programDesc} onChange={(e) => setProgramDesc(e.target.value)}
                  placeholder="Short description (optional)"
                  className="w-full h-11 rounded-xl px-4 text-xs text-white outline-none placeholder:text-white/25"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                />
                <div className="flex items-center gap-3">
                  <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                    {CATEGORY_OPTIONS.map(({ key, label }) => {
                      const on = programCategory === key;
                      return (
                        <button key={key} onClick={() => setProgramCategory(key)} className="px-6 py-2.5 text-sm font-medium transition-all duration-150 focus:outline-none" style={{ background: on ? "rgba(255,255,255,0.90)" : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{label}</button>
                      );
                    })}
                  </div>
                  <button
                    type="button" onClick={addProgram}
                    className="px-5 h-11 rounded-xl text-sm font-semibold transition-all duration-150 focus:outline-none hover:bg-white/16"
                    style={{ background: "rgba(255,255,255,0.10)", color: "white", fontFamily: FONT_BODY }}
                  >
                    Add Program
                  </button>
                </div>
                {programCategory === "edu" ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>Group level for this program</p>
                    <div className="flex rounded-xl overflow-hidden w-fit" style={{ border: `1px solid ${BORDER}` }}>
                      {STAGE_OPTIONS.map(({ key, label }) => {
                        const on = programStage === key;
                        return (
                          <button key={key} onClick={() => setProgramStage(key)} className="px-3.5 py-2 text-[11px] font-medium transition-all duration-150 focus:outline-none" style={{ background: on ? "rgba(255,255,255,0.85)" : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{label}</button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <input
                    type="text" value={programClasses} onChange={(e) => setProgramClasses(e.target.value)}
                    placeholder="Class names, comma-separated (e.g. Beginners, Intermediate)"
                    className="w-full h-11 rounded-xl px-4 text-xs text-white outline-none placeholder:text-white/25"
                    style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                  />
                )}
              </div>
              <AnimatePresence initial={false}>
                {programs.length > 0 && (
                  <motion.div className="flex flex-col gap-2 mt-1" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                    {programs.map((p, i) => (
                      <div key={`${p.name}-${i}`} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>{p.name}</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase flex-shrink-0" style={{ background: p.category === "game" ? "rgba(130,30,22,0.35)" : "rgba(48,26,78,0.35)", color: "rgba(255,255,255,0.85)", fontFamily: FONT_BODY }}>
                            {p.category === "game" ? "Game" : "Edu"}
                          </span>
                          <span className="text-[10px] flex-shrink-0" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                            {p.category === "edu" ? p.stageType : `${p.classNames.length} class${p.classNames.length === 1 ? "" : "es"}`}
                          </span>
                        </div>
                        <button type="button" onClick={() => removeProgram(i)} className="text-xs hover:text-white transition-colors focus:outline-none flex-shrink-0" style={{ color: MUTED, fontFamily: FONT_BODY }}>Remove</button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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

// ─── Game Handoff ─────────────────────────────────────────────────────────────

function GameHandoff({
  programName,
  appId,
  fallbackLaunchUrl,
  onLogout,
}: {
  programName: string;
  appId?: string;
  fallbackLaunchUrl?: string;
  onLogout: () => void;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function resolveLaunch() {
      if (appId) {
        try {
          const ctx = await getAppLaunchContext(appId);
          if (!cancelled) {
            const base = (ctx.launch_url || fallbackLaunchUrl || GAME_APP_URL).replace(/\/$/, "");
            setHref(`${base}/?lt=${encodeURIComponent(ctx.launch_token)}`);
          }
          return;
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to prepare launch link");
        }
      }
      // No registered app for this program yet — fall back to the raw session
      // token so orgs that haven't registered an app aren't blocked mid-migration.
      const token = getToken();
      if (!cancelled) setHref(token ? `${GAME_APP_URL}/?token=${encodeURIComponent(token)}` : GAME_APP_URL);
    }
    resolveLaunch();
    return () => {
      cancelled = true;
    };
  }, [appId, fallbackLaunchUrl]);

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ background: BASE }}>
      <Grain opacity={0.22} />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(130,30,22,0.45) 0%, transparent 55%)" }} />
      <motion.div className="relative z-10 flex flex-col items-center text-center px-6 max-w-sm" {...slide}>
        <div className="mb-8 w-11 h-11 rounded-full flex items-center justify-center" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
          <span className="text-white/60 text-base">🎲</span>
        </div>
        <p className="text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>You're a Coach for</p>
        <h1 className="text-3xl font-bold text-white leading-tight tracking-tight mb-4" style={{ fontFamily: FONT_HEAD }}>{programName || "Your Game Program"}</h1>
        <p className="text-sm leading-relaxed mb-10" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          This program runs on the Game Platform — a separate space for turning coaching prompts into gameplay scenarios.
        </p>
        <a
          href={href ?? undefined}
          aria-disabled={!href}
          className="h-12 px-8 rounded-full bg-white text-[#111] text-sm font-semibold hover:bg-white/92 active:scale-[0.97] transition-all duration-150 focus:outline-none flex items-center aria-disabled:opacity-50 aria-disabled:pointer-events-none"
          style={{ fontFamily: FONT_BODY }}
        >
          {href ? "Continue to Game Platform" : "Preparing launch link…"}
        </a>
        {error && <p className="text-xs text-red-400 mt-3" style={{ fontFamily: FONT_BODY }}>{error}</p>}
        <button onClick={onLogout} className="mt-6 text-xs hover:text-white transition-colors focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>Log out</button>
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

function DeliveryToggle({ value, onChange, accent }: { value: DeliveryMethod; onChange: (v: DeliveryMethod) => void; accent: string }) {
  const opts: { key: DeliveryMethod; label: string }[] = [
    { key: "join_code", label: "Join Code" },
    { key: "email_direct", label: "Email" },
  ];
  return (
    <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: `1px solid ${BORDER}` }}>
      {opts.map(({ key, label }) => {
        const on = value === key;
        return (
          <button key={key} type="button" onClick={() => onChange(key)} className="px-3 py-1 text-[10px] font-bold tracking-widest uppercase transition-all focus:outline-none" style={{ background: on ? accent : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{label}</button>
        );
      })}
    </div>
  );
}

function JoinCodesPanel({ stageId, stageName, accent = "rgba(255,255,255,0.88)" }: { stageId: string; stageName: string; accent?: string }) {
  const [results, setResults] = useState<Partial<Record<JoinCodeKind, { code?: string; redeemUrl?: string; email?: string }>>>({});
  const [generating, setGenerating] = useState<JoinCodeKind | null>(null);
  const [copied, setCopied] = useState<JoinCodeKind | null>(null);
  const [delivery, setDelivery] = useState<DeliveryMethod>("join_code");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function generate(kind: JoinCodeKind) {
    if (delivery === "email_direct" && !email.trim()) {
      setError("Enter an email address to send an invite to");
      return;
    }
    setGenerating(kind);
    setError("");
    try {
      const row = await createJoinCode(stageId, kind, {
        delivery_method: delivery,
        email: delivery === "email_direct" ? email.trim() : undefined,
      });
      setResults((prev) => ({ ...prev, [kind]: { code: row.code, redeemUrl: row.redeem_url, email: row.email } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setGenerating(null);
    }
  }

  async function copyValue(kind: JoinCodeKind) {
    const r = results[kind];
    const val = r?.code || r?.redeemUrl;
    if (!val) return;
    await navigator.clipboard.writeText(val);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Invitations</p>
          <p className="mt-1 text-xs text-white/45" style={{ fontFamily: FONT_BODY }}>Invite people to <span className="text-white/70">{stageName}</span></p>
        </div>
        <DeliveryToggle value={delivery} onChange={setDelivery} accent={accent} />
      </div>
      {delivery === "email_direct" && (
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          className="w-full h-10 rounded-xl px-4 text-sm text-white outline-none placeholder:text-white/25"
          style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
        />
      )}
      {(["teacher", "administrator", "student"] as JoinCodeKind[]).map((kind) => {
        const meta = JOIN_CODE_LABELS[kind];
        const r = results[kind];
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
                {generating === kind ? "…" : r ? "New" : delivery === "email_direct" ? "Send" : "Generate"}
              </button>
            </div>
            {r && (r.code || r.redeemUrl) && (
              <div className="mt-3 flex items-center justify-between gap-3">
                {r.code ? (
                  <p className="text-2xl font-bold tracking-[0.18em] text-white" style={{ fontFamily: FONT_HEAD }}>{r.code}</p>
                ) : (
                  <p className="text-[11px] text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>
                    Invite link ready for <span className="text-white/85">{r.email}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => copyValue(kind)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-colors focus:outline-none flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}
                >
                  {copied === kind ? <Check size={14} /> : <Copy size={14} />}
                  {copied === kind ? "Copied" : r.code ? "Copy" : "Copy link"}
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

function instructorLabel(p: Program): string {
  if (p.instructor_label) return p.instructor_label;
  return p.category === "game" ? "Coaches" : "Teachers";
}

function ProgramInviteRow({ program, accent }: { program: Program; accent: string }) {
  const [delivery, setDelivery] = useState<DeliveryMethod>("join_code");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ code?: string; redeemUrl?: string; email?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (delivery === "email_direct" && !email.trim()) {
      setError("Enter an email address");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const row = await createProgramJoinCode(program.id, "teacher", {
        delivery_method: delivery,
        email: delivery === "email_direct" ? email.trim() : undefined,
      });
      setResult({ code: row.code, redeemUrl: row.redeem_url, email: row.email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setBusy(false);
    }
  }

  async function copyValue() {
    const val = result?.code || result?.redeemUrl;
    if (!val) return;
    await navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-4 pt-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Invite {instructorLabel(program)}
        </p>
        <DeliveryToggle value={delivery} onChange={setDelivery} accent={accent} />
      </div>
      {delivery === "email_direct" && (
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          className="w-full h-10 rounded-xl px-4 text-sm text-white outline-none placeholder:text-white/25"
          style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        {result ? (
          result.code ? (
            <p className="text-2xl font-bold tracking-[0.18em] text-white" style={{ fontFamily: FONT_HEAD }}>{result.code}</p>
          ) : (
            <p className="text-[11px] text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>
              Invite link ready for <span className="text-white/85">{result.email}</span>
            </p>
          )
        ) : (
          <span className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No invitation yet</span>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {result && (result.code || result.redeemUrl) && (
            <button type="button" onClick={copyValue} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-colors focus:outline-none" style={{ background: "rgba(255,255,255,0.08)", color: MUTED, fontFamily: FONT_BODY }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : result.code ? "Copy" : "Copy link"}
            </button>
          )}
          <button type="button" onClick={generate} disabled={busy} className="px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-colors focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>
            {busy ? "…" : result ? "New" : delivery === "email_direct" ? "Send" : "Generate"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
    </div>
  );
}

function ProgramCard({ program, accent }: { program: Program; accent: string }) {
  const [open, setOpen] = useState(false);
  const Icon = program.category === "game" ? Dices : GraduationCap;
  const counts: { label: string; value: number }[] = [
    { label: "courses", value: program.course_count ?? 0 },
    { label: program.learner_label?.toLowerCase() || (program.category === "game" ? "players" : "learners"), value: program.learner_count ?? 0 },
    { label: instructorLabel(program).toLowerCase(), value: program.instructor_count ?? 0 },
  ];

  return (
    <div className="rounded-2xl p-5 flex flex-col" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-left focus:outline-none">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: program.icon ? "transparent" : accent, color: program.icon ? "white" : "#111" }}>
            {program.icon ? <span className="text-xl">{program.icon}</span> : <Icon size={20} />}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white flex items-center gap-2" style={{ fontFamily: FONT_HEAD }}>
              <span className="truncate">{program.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase flex-shrink-0" style={{ background: program.category === "game" ? "rgba(130,30,22,0.35)" : "rgba(48,26,78,0.35)", color: "rgba(255,255,255,0.85)" }}>
                {program.category === "game" ? "Game" : "Edu"}
              </span>
            </p>
            <p className="text-[11px] mt-1 line-clamp-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              {program.description || (program.category === "game" ? "Coaching program on the Game Platform" : "Learning program on the Content Studio")}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {counts.map((c) => (
            <span key={c.label} className="px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}>
              <span className="text-white font-bold">{c.value}</span> {c.label}
            </span>
          ))}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "visible" }}
          >
            <ProgramInviteRow program={program} accent={accent} />
            <OfferingsSection program={program} accent={accent} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OrganizationWorkspace({ orgId, orgName, accent }: { orgId: string; orgName: string; accent: string }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<ProgramCategory>("edu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listPrograms(orgId)
      .then(setPrograms)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load programs"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function addProgram() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createProgram(orgId, {
        name: name.trim(),
        category,
        description: desc.trim() || undefined,
        stage_type: category === "edu" ? "national" : undefined,
      });
      setPrograms((prev) => [...prev, created]);
      setName("");
      setDesc("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create program");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="mb-12">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Organization Workspace</p>
          <h2 className="mt-1 text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{orgName}</h2>
          <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>Programs your organization runs across the Learning and Game platforms</p>
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 px-4 h-10 rounded-full text-xs font-semibold transition-all focus:outline-none flex-shrink-0" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>
          <Plus size={15} /> New Program
        </button>
      </div>
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="rounded-2xl p-5 mb-5 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Program name" className="w-full h-11 rounded-xl px-4 text-sm text-white outline-none placeholder:text-white/25" style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }} />
              <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description (optional)" className="w-full h-10 rounded-xl px-4 text-xs text-white outline-none placeholder:text-white/25" style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }} />
              <div className="flex items-center justify-between gap-3">
                <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                  {CATEGORY_OPTIONS.map(({ key, label }) => {
                    const on = category === key;
                    return (
                      <button key={key} type="button" onClick={() => setCategory(key)} className="px-5 py-2 text-sm font-medium transition-all focus:outline-none" style={{ background: on ? accent : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}>{label}</button>
                    );
                  })}
                </div>
                <button type="button" onClick={addProgram} disabled={busy} className="px-5 h-10 rounded-xl text-sm font-semibold transition-all focus:outline-none disabled:opacity-50" style={{ background: "rgba(255,255,255,0.10)", color: "white", fontFamily: FONT_BODY }}>{busy ? "Adding…" : "Add"}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {programs.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.03)", border: `1px dashed ${BORDER}` }}>
          <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>No programs yet — add your first one to start inviting coaches and teachers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} accent={accent} />
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
    </div>
  );
}

const TOGGLEABLE_MODULES: { key: ModuleKey; label: string }[] = [
  { key: "learning", label: "Learning" },
  { key: "coaching", label: "Coaching" },
  { key: "analytics", label: "Analytics" },
];

function ModuleToggles({ orgId, accent }: { orgId: string; accent: string }) {
  const [entitlements, setEntitlements] = useState<Entitlement[] | null>(null);
  const [busyModule, setBusyModule] = useState<ModuleKey | null>(null);

  useEffect(() => {
    listEntitlements(orgId).then(setEntitlements).catch(() => setEntitlements([]));
  }, [orgId]);

  function isEnabled(module: ModuleKey): boolean {
    const row = entitlements?.find((e) => e.subject_type === "organization" && e.module === module);
    return !row || row.status === "active" || row.status === "trial";
  }

  async function toggle(module: ModuleKey) {
    const next = isEnabled(module) ? "disabled" : "active";
    setBusyModule(module);
    try {
      const updated = await setEntitlement(orgId, module, next);
      setEntitlements((prev) => {
        const rest = (prev || []).filter((e) => !(e.subject_type === "organization" && e.module === module));
        return [...rest, updated];
      });
    } finally {
      setBusyModule(null);
    }
  }

  if (!entitlements) return null;

  return (
    <>
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>Platform modules</p>
      <div className="flex flex-col gap-1.5">
        {TOGGLEABLE_MODULES.map(({ key, label }) => {
          const on = isEnabled(key);
          return (
            <button
              key={key} type="button" onClick={() => toggle(key)} disabled={busyModule === key}
              className="flex items-center justify-between px-3 h-9 rounded-lg text-xs transition-all focus:outline-none disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: on ? "white" : MUTED, fontFamily: FONT_BODY }}
            >
              <span>{label}</span>
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase"
                style={{ background: on ? accent : "rgba(255,255,255,0.08)", color: on ? "#111" : MUTED }}
              >
                {busyModule === key ? "…" : on ? "On" : "Off"}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function OrgSettingsButton({ orgId, accent, onSaved }: { orgId: string; accent: string; onSaved: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(accent);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateOrgTheme(orgId, { accent_color: color });
      onSaved(color);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-xs hover:text-white transition-colors focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>
        <Palette size={14} /> Settings
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 mt-2 z-20 rounded-xl p-4 flex flex-col gap-3 w-64" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Brand accent</p>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg bg-transparent cursor-pointer" />
              <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 h-9 rounded-lg px-3 text-xs text-white outline-none" style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }} />
            </div>
            <button type="button" onClick={save} disabled={busy} className="h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: color, color: "#111", fontFamily: FONT_BODY }}>{busy ? "Saving…" : "Save"}</button>
            <ModuleToggles orgId={orgId} accent={accent} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const DEFAULT_ACCENT = "#ffffff";

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeStage, setActiveStage] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accent, setAccent] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    getMe().then((me) => setDisplayName(me.display_name || me.email.split("@")[0])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getDashboard(undefined, activeStage || undefined)
      .then((d) => {
        setData(d);
        if (d.theme_accent_color) setAccent(d.theme_accent_color);
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
          <div className="flex items-center gap-5 mt-2">
            {data?.org_id && <OrgSettingsButton orgId={data.org_id} accent={accent} onSaved={setAccent} />}
            <button onClick={onLogout} className="text-xs hover:text-white transition-colors focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>Log out</button>
          </div>
        </div>
        <div className="mt-8 h-px w-full" style={{ background: BORDER }} />
        {data?.org_id && (
          <div className="mt-10">
            <PlatformWorkspace orgId={data.org_id} orgName={data.org_name} accent={accent} />
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Teacher Dashboard ──────────────────────────────────────────────────────

function TeacherDashboard({ memberships, onLogout }: { memberships: MembershipSummary[]; onLogout: () => void }) {
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    getMe().then((me) => setDisplayName(me.display_name || me.email.split("@")[0])).catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: BASE }}>
      <Grain opacity={0.18} />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(48,26,78,0.25) 0%, transparent 55%)" }} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(120,28,20,0.20) 0%, transparent 55%)" }} />
      <motion.div className="relative z-10 max-w-6xl mx-auto px-8 md:px-14 py-14" {...slide}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-5xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Welcome, {displayName || "Teacher"}</h1>
            <p className="mt-2 text-base" style={{ color: MUTED, fontFamily: FONT_BODY }}>{memberships[0]?.org_name ?? "Organization"} — Instructor</p>
          </div>
          <button onClick={onLogout} className="text-xs hover:text-white transition-colors focus:outline-none mt-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Log out</button>
        </div>
        <div className="mt-8 h-px w-full" style={{ background: BORDER }} />
        <div className="mt-10">
          <TeacherWorkspace memberships={memberships} displayName={displayName} accent={DEFAULT_ACCENT} />
        </div>
      </motion.div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface GameMembershipInfo {
  programName: string;
  appId?: string;
  launchUrl?: string;
}

function firstGameMembership(
  memberships: { program_category?: string; program_name?: string; registered_app_id?: string; app_launch_url?: string }[]
): GameMembershipInfo | null {
  const m = memberships.find((x) => x.program_category === "game");
  if (!m) return null;
  return { programName: m.program_name || "Your Game Program", appId: m.registered_app_id, launchUrl: m.app_launch_url };
}

// ─── Invitation acceptance (redeem link: /?invite=<token>) ───────────────────

function inviteRoleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "administrator" || r === "org_admin") return "Administrator";
  if (r === "instructor" || r === "teacher") return "Teacher";
  if (r === "coach") return "Coach";
  return "Learner";
}

function InviteAccept({ token, onAccepted, onCancel }: { token: string; onAccepted: () => void; onCancel: () => void }) {
  const [info, setInfo] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loggedIn = !!getToken();

  useEffect(() => {
    getInvitation(token)
      .then((inv) => { setInfo(inv); if (inv.email) setEmail(inv.email); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "This invitation link is invalid."));
  }, [token]);

  const pending = info?.status === "pending";

  async function accept() {
    setBusy(true); setError("");
    try {
      await acceptInvitation(token);
      onAccepted();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not accept the invitation."); setBusy(false); }
  }

  async function authThenAccept() {
    if (!email.trim() || !password) { setError("Enter your email and password"); return; }
    if (mode === "signup" && !name.trim()) { setError("Enter your name"); return; }
    setBusy(true); setError("");
    try {
      if (mode === "signup") {
        await signup({ signup_type: "student", email: email.trim(), password, display_name: name.trim() });
      } else {
        await login(email.trim(), password);
      }
      await acceptInvitation(token, mode === "signup" ? name.trim() : undefined);
      onAccepted();
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed"); setBusy(false); }
  }

  const orgName = info?.organization_name || "the organization";
  const roleLabel = info ? inviteRoleLabel(info.role) : "";

  return (
    <AuthPanel>
      <div className="w-full">
        <BackBtn onClick={onCancel} />
        {loadError ? (
          <>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2" style={{ fontFamily: FONT_HEAD }}>Invitation unavailable</h1>
            <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>{loadError}</p>
          </>
        ) : !info ? (
          <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>Loading invitation…</p>
        ) : !pending ? (
          <>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2" style={{ fontFamily: FONT_HEAD }}>Invitation {info.status}</h1>
            <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              This invitation is no longer available (status: {info.status}). Ask {orgName} to send a new one.
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: MUTED, fontFamily: FONT_BODY }}>You're invited</p>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2" style={{ fontFamily: FONT_HEAD }}>
              Join {orgName}
            </h1>
            <p className="text-sm mb-8" style={{ color: MUTED, fontFamily: FONT_BODY }}>
              You've been invited to join <span className="text-white/80">{orgName}</span> as a <span className="text-white/80">{roleLabel}</span>
              {info.email ? <> — sent to <span className="text-white/80">{info.email}</span></> : null}.
            </p>

            {loggedIn ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                  You're signed in. Accept to add this organization to your account.
                </p>
                <WhiteBtn onClick={accept} disabled={busy}>{busy ? "Joining…" : `Accept & join ${orgName}`}</WhiteBtn>
                <ErrorText msg={error} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-1 w-full rounded-xl p-1 mb-1" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
                  {(["signup", "login"] as const).map((m) => (
                    <button
                      key={m} type="button" onClick={() => { setMode(m); setError(""); }}
                      className="flex-1 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all focus:outline-none"
                      style={{ background: mode === m ? "white" : "transparent", color: mode === m ? "#111" : MUTED, fontFamily: FONT_BODY }}
                    >{m === "signup" ? "Create account" : "Log in"}</button>
                  ))}
                </div>
                {mode === "signup" && (
                  <InputField placeholder="Your name" value={name} onChange={setName} Icon={AtSign} />
                )}
                <InputField type="email" placeholder="you@email.com" value={email} onChange={setEmail} Icon={Mail} />
                <InputField type="password" placeholder="Password" value={password} onChange={setPassword} Icon={Lock} />
                <WhiteBtn onClick={authThenAccept} disabled={busy}>
                  {busy ? "Joining…" : mode === "signup" ? "Create account & join" : "Log in & join"}
                </WhiteBtn>
                <ErrorText msg={error} />
                <p className="text-[11px] mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                  {mode === "signup"
                    ? "Creates your personal account, then joins you to this organization."
                    : "Use your existing account — this organization will be added to it."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AuthPanel>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [signupType, setSignupType] = useState<SignupType>("org");
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [gameHandoff, setGameHandoff] = useState<GameMembershipInfo | null>(null);
  const [teacherMemberships, setTeacherMemberships] = useState<MembershipSummary[]>([]);
  const [loginType, setLoginType] = useState<LoginType>("org");

  function routeAfterAuth() {
    getMe()
      .then((me) => {
        // Platform admins manage every organization (not scoped to one).
        if (me.role === "platform_admin") {
          setScreen("platform-admin");
          return;
        }
        // Org owners/admins get the supervisory dashboard (all programs, teachers,
        // students, offerings). Everyone else is scoped to what they belong to.
        const isOrgAdmin = me.memberships.some((m) => m.role === "owner" || m.role === "administrator");
        if (isOrgAdmin) {
          setScreen("dashboard");
          return;
        }
        // Game-program members launch the Game Platform (existing coach handoff).
        const gameProgram = firstGameMembership(me.memberships);
        if (gameProgram) {
          setGameHandoff(gameProgram);
          setScreen("game-handoff");
          return;
        }
        // Instructors/teachers: scoped to their own program(s) to create courses.
        if (me.memberships.some((m) => m.role === "instructor")) {
          setTeacherMemberships(me.memberships);
          setScreen("teacher");
          return;
        }
        setScreen("dashboard");
      })
      .catch(() => setScreen("dashboard"));
  }

  useEffect(() => {
    // A redeem link (…/?invite=<token>) opens the acceptance flow directly,
    // whether or not the visitor is already signed in.
    const inviteToken = new URLSearchParams(window.location.search).get("invite");
    if (inviteToken) {
      setPendingInvite(inviteToken);
      setScreen("invite");
      return;
    }
    if (getToken() && screen === "landing") routeAfterAuth();
  }, []);

  function clearInviteParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  function handleInviteAccepted() {
    clearInviteParam();
    setPendingInvite(null);
    routeAfterAuth();
  }

  function handleInviteCancel() {
    clearInviteParam();
    setPendingInvite(null);
    if (getToken()) routeAfterAuth();
    else setScreen("landing");
  }

  function handleLogout() {
    clearToken();
    setOrgId("");
    setOrgName("");
    setGameHandoff(null);
    setTeacherMemberships([]);
    setScreen("landing");
  }

  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      <AnimatePresence mode="wait">
        {screen === "invite" && pendingInvite && (
          <motion.div key="invite" {...slide}>
            <InviteAccept token={pendingInvite} onAccepted={handleInviteAccepted} onCancel={handleInviteCancel} />
          </motion.div>
        )}
        {screen === "landing" && (
          <motion.div key="landing" {...slide}>
            <Landing onLogin={() => setScreen("login-role")} />
          </motion.div>
        )}
        {screen === "login-role" && (
          <motion.div key="login-role" {...slide}>
            <LoginRole onBack={() => setScreen("landing")} onSelect={(type) => { setLoginType(type); setScreen("login"); }} />
          </motion.div>
        )}
        {screen === "login" && (
          <motion.div key="login" {...slide}>
            <Login onBack={() => setScreen("login-role")} onSuccess={routeAfterAuth} onGoSignup={() => { setSignupType("org"); setScreen("signup"); }} loginType={loginType} />
          </motion.div>
        )}
        {screen === "signup-role" && (
          <motion.div key="signup-role" {...slide}>
            <SignupRole onBack={() => setScreen("landing")} onSelect={(type) => { setSignupType(type); setScreen("signup"); }} />
          </motion.div>
        )}
        {screen === "signup" && (
          <motion.div key="signup" {...slide}>
            <Signup
              signupType={signupType}
              onBack={() => setScreen("login-role")}
              onGoLogin={() => setScreen("login")}
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
            <Dashboard onLogout={handleLogout} />
          </motion.div>
        )}
        {screen === "platform-admin" && (
          <motion.div key="platform-admin" {...slide}>
            <PlatformAdminConsole onLogout={handleLogout} />
          </motion.div>
        )}
        {screen === "teacher" && (
          <motion.div key="teacher" {...slide}>
            <TeacherDashboard memberships={teacherMemberships} onLogout={handleLogout} />
          </motion.div>
        )}
        {screen === "game-handoff" && gameHandoff && (
          <motion.div key="game-handoff" {...slide}>
            <GameHandoff
              programName={gameHandoff.programName}
              appId={gameHandoff.appId}
              fallbackLaunchUrl={gameHandoff.launchUrl}
              onLogout={handleLogout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
