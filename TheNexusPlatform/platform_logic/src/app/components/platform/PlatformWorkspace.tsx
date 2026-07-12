/**
 * The Nexus admin drill-down: Organization → Program → Program Offering.
 *
 * Mirrors the object hierarchy in Nexus_Platform_Implementation_Architecture_v3
 * (§6, §13): an organization owns programs, a program contains offerings, and an
 * offering is either a course (authored on the Learning Platform), an app
 * (Registered App + signup hook), or another type. Courses are NOT authored
 * here — "Create course" makes a `course` offering bound to the learning module
 * and hands off to the Learning Platform, exactly like the game/coaching handoff.
 *
 * Theme tokens are shared with the rest of the admin UI (see ../../theme).
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, ChevronRight, GraduationCap, Dices, BookOpen, AppWindow, ArrowUpRight, ArrowLeft, Check, Mail, Trash2, Copy,
} from "lucide-react";
import {
  listPrograms, createProgram, listOfferings, createOffering, getAppLaunchContext, listApps,
  listMembers, deleteProgram, listParticipants, createInvitation,
} from "../../../services/api";
import { DEFAULT_SIGNUP_FIELDS } from "../../../types/platform";
import type { Offering, OrgMember, Participant, Program, ProgramCategory } from "../../../types/platform";
import { BORDER, INPUT_BG, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";
import { OfferingDetail } from "./OfferingDetail";
import { GroupsSection, ProgramOrgAffiliationsSection, IncomingAffiliationRequests, AffiliatedProgramsSection, OrgRelationshipsPanel } from "./OrgGraphSections";

const LEARNING_APP_URL =
  (import.meta.env.VITE_LEARNING_APP_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:5180";

type Nav =
  | { level: "org" }
  | { level: "program"; program: Program }
  | { level: "offering"; program: Program; offering: Offering };

const CATEGORY_OPTIONS: { key: ProgramCategory; label: string }[] = [
  { key: "edu", label: "Edu" },
  { key: "game", label: "Game" },
];

function isApp(o: Offering): boolean {
  return o.offering_type === "app";
}

// ─── Organization overview (supervisory dashboard) ───────────────────────────

type OrgTotals = {
  programs: number; students: number; teachers: number;
  courses: number; apps: number; pending: number;
};

type OfferingWithProgram = { offering: Offering; program: Program };

function InviteTeacher({ orgId, programs, accent }: { orgId: string; programs: Program[]; accent: string }) {
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [redeemUrl, setRedeemUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setEmail("");
    setSentTo("");
    setRedeemUrl("");
    setCopied(false);
    setError("");
  }

  // Creates a real invitation (secure-token link) scoped to the chosen program.
  // Email delivery is a follow-up; for now we surface the redeem link to copy.
  async function sendInvite() {
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setError("Enter a valid email address"); return; }
    const pid = programId || programs[0]?.id;
    setBusy(true);
    setError("");
    try {
      const inv = await createInvitation(orgId, { email: addr, role: "instructor", program_id: pid || undefined });
      setSentTo(addr);
      // Build the link from the admin's own origin so it always points at the
      // running app (the backend's redeem_url host depends on a server env var).
      setRedeemUrl(inv.token ? `${window.location.origin}/?invite=${inv.token}` : (inv.redeem_url || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!redeemUrl) return;
    try { await navigator.clipboard.writeText(redeemUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  const selectedProgramName = programs.find((p) => p.id === (programId || programs[0]?.id))?.name;

  return (
    <div className="relative">
      <button
        type="button" onClick={() => { setOpen((v) => !v); reset(); }}
        className="flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold transition-all focus:outline-none"
        style={{ background: "rgba(255,255,255,0.08)", color: "white", fontFamily: FONT_BODY }}
      >
        <Plus size={14} /> Invite teacher
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 mt-2 z-20 rounded-xl p-4 flex flex-col gap-3 w-80"
            style={{ background: "#141417", border: `1px solid ${BORDER}` }}
          >
            {sentTo ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.2)" }}>
                    <Check size={16} color="#4ade80" />
                  </div>
                  <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>Invitation created</p>
                </div>
                <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                  An invite for <span className="text-white/80">{sentTo}</span> to join
                  {selectedProgramName ? <span className="text-white/80"> {selectedProgramName}</span> : " the organization"} as a teacher is ready.
                  Share this link with them:
                </p>
                {redeemUrl && (
                  <div className="flex items-center gap-2 px-3 h-9 rounded-lg" style={{ background: INPUT_BG, border: `1px solid ${BORDER}` }}>
                    <span className="flex-1 text-[11px] text-white/70 truncate" style={{ fontFamily: FONT_BODY }}>{redeemUrl}</span>
                    <button type="button" onClick={copyLink} className="flex items-center gap-1 text-[11px] font-semibold focus:outline-none flex-shrink-0" style={{ color: accent, fontFamily: FONT_BODY }}>
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
                <button type="button" onClick={reset} className="self-start text-[11px] font-semibold focus:outline-none" style={{ color: accent, fontFamily: FONT_BODY }}>
                  Invite another
                </button>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Invite a teacher by email</p>
                <select
                  value={programId} onChange={(e) => setProgramId(e.target.value)}
                  className="h-9 rounded-lg px-2 text-xs text-white outline-none"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                >
                  <option value="">{programs[0] ? programs[0].name : "Organization-wide"}</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="flex items-center gap-2 px-3 h-9 rounded-lg" style={{ background: INPUT_BG, border: `1px solid ${BORDER}` }}>
                  <Mail size={14} color={MUTED} style={{ flexShrink: 0 }} />
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendInvite(); } }}
                    placeholder="teacher@school.edu"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                    style={{ fontFamily: FONT_BODY }}
                  />
                </div>
                <button type="button" onClick={sendInvite} disabled={busy} className="h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>
                  {busy ? "Creating…" : "Create invitation"}
                </button>
                <p className="text-[10px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>They land scoped to that program as a teacher when they accept the link.</p>
                {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OrgOverview({
  orgId, accent, onOpenOffering, onNewProgram,
}: {
  orgId: string; accent: string;
  onOpenOffering: (program: Program, offering: Offering) => void;
  onNewProgram: () => void;
}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [offerings, setOfferings] = useState<OfferingWithProgram[] | null>(null);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [students, setStudents] = useState<{ p: Participant; program: Program; offering: Offering }[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPrograms(orgId)
      .then(async (ps) => {
        if (cancelled) return;
        setPrograms(ps);
        const lists = await Promise.all(ps.map((p) => listOfferings(p.id).catch(() => [] as Offering[])));
        if (cancelled) return;
        const flat: OfferingWithProgram[] = [];
        ps.forEach((p, i) => lists[i].forEach((o) => flat.push({ offering: o, program: p })));
        setOfferings(flat);
        // Aggregate the learner roster across every offering (org supervision).
        const rosters = await Promise.all(flat.map((x) => listParticipants(x.offering.id).catch(() => [] as Participant[])));
        if (cancelled) return;
        const roster: { p: Participant; program: Program; offering: Offering }[] = [];
        flat.forEach((x, i) => rosters[i].filter((p) => p.participant_type === "learner").forEach((p) => roster.push({ p, program: x.program, offering: x.offering })));
        setStudents(roster);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load overview"));
    listMembers(orgId).then((m) => { if (!cancelled) setMembers(m); }).catch(() => setMembers([]));
    return () => { cancelled = true; };
  }, [orgId]);

  const totals: OrgTotals | null = useMemo(() => {
    if (!offerings) return null;
    const apps = offerings.filter((x) => isApp(x.offering)).length;
    return {
      programs: programs.length,
      students: programs.reduce((n, p) => n + (p.learner_count ?? 0), 0),
      teachers: programs.reduce((n, p) => n + (p.instructor_count ?? 0), 0),
      courses: offerings.length - apps,
      apps,
      pending: offerings.reduce((n, x) => n + (x.offering.pending_count ?? 0), 0),
    };
  }, [offerings, programs]);

  const teachers = (members ?? []).filter((m) => m.role === "instructor");
  const programName = (id?: string) => programs.find((p) => p.id === id)?.name ?? "—";

  const tiles: { label: string; value: number | undefined; highlight?: boolean }[] = [
    { label: "Programs", value: totals?.programs },
    { label: "Students", value: totals?.students },
    { label: "Teachers", value: totals?.teachers },
    { label: "Courses", value: totals?.courses },
    { label: "Apps", value: totals?.apps },
    { label: "Pending approvals", value: totals?.pending, highlight: (totals?.pending ?? 0) > 0 },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Organization</p>
          <h2 className="mt-1 text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Dashboard</h2>
          <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            A roll-up across every program — students, teachers, courses, apps, and registrations awaiting approval.
          </p>
        </div>
        <button
          type="button" onClick={onNewProgram}
          className="flex items-center gap-1.5 px-4 h-10 rounded-full text-xs font-semibold transition-all focus:outline-none flex-shrink-0"
          style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
        >
          <Plus size={15} /> New Program
        </button>
      </div>

      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {/* Incoming affiliation requests from other organizations (accept/decline) */}
      <IncomingAffiliationRequests orgId={orgId} accent={accent} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${t.highlight ? accent : BORDER}` }}>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>{t.label}</p>
            <p className="mt-2 text-4xl font-bold text-white" style={{ fontFamily: FONT_HEAD }}>{t.value === undefined ? "—" : t.value}</p>
          </div>
        ))}
      </div>

      {/* Teachers roster */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            Teachers · {teachers.length}
          </p>
          <InviteTeacher orgId={orgId} programs={programs} accent={accent} />
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
          <div className="grid grid-cols-[1.3fr_1.6fr_1.3fr_auto] gap-3 px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {["Name", "Email", "Program", "Access"].map((h) => (
              <span key={h} className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>{h}</span>
            ))}
          </div>
          {teachers.map((t, i) => (
            <div key={t.id} className="grid grid-cols-[1.3fr_1.6fr_1.3fr_auto] gap-3 px-5 py-3 items-center" style={{ borderBottom: i < teachers.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <span className="text-sm text-white truncate" style={{ fontFamily: FONT_BODY }}>{t.display_name || "—"}</span>
              <span className="text-sm text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>{t.email}</span>
              <span className="text-sm text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>{programName(t.program_id)}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium justify-self-start" style={{ background: "rgba(255,255,255,0.07)", color: MUTED }}>{t.access}</span>
            </div>
          ))}
          {members && teachers.length === 0 && (
            <div className="px-5 py-4 text-sm text-white/40" style={{ fontFamily: FONT_BODY }}>No teachers yet — use “Invite teacher” to generate a join code.</div>
          )}
          {!members && <div className="px-5 py-4 text-sm text-white/30" style={{ fontFamily: FONT_BODY }}>Loading…</div>}
        </div>
      </section>

      {/* Students roster */}
      <section className="flex flex-col gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Students · {students?.length ?? 0}
        </p>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
          <div className="grid grid-cols-[1.3fr_1.6fr_1.3fr_1.3fr_auto] gap-3 px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {["Name", "Email", "Program", "Offering", "Status"].map((h) => (
              <span key={h} className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>{h}</span>
            ))}
          </div>
          {(students ?? []).slice(0, 50).map((s, i, arr) => (
            <div key={s.p.id} className="grid grid-cols-[1.3fr_1.6fr_1.3fr_1.3fr_auto] gap-3 px-5 py-3 items-center" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <span className="text-sm text-white truncate" style={{ fontFamily: FONT_BODY }}>{s.p.display_name || "—"}</span>
              <span className="text-sm text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>{s.p.email || "—"}</span>
              <span className="text-sm text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>{s.program.name}</span>
              <span className="text-sm text-white/60 truncate" style={{ fontFamily: FONT_BODY }}>{s.offering.name}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium justify-self-start" style={{ background: "rgba(255,255,255,0.07)", color: MUTED }}>{s.p.status}</span>
            </div>
          ))}
          {students && students.length === 0 && (
            <div className="px-5 py-4 text-sm text-white/40" style={{ fontFamily: FONT_BODY }}>No students yet — they appear here once registrations are approved.</div>
          )}
          {!students && <div className="px-5 py-4 text-sm text-white/30" style={{ fontFamily: FONT_BODY }}>Loading…</div>}
        </div>
        {students && students.length > 50 && (
          <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>Showing first 50 of {students.length}.</p>
        )}
      </section>

      {/* All offerings across programs */}
      <section className="flex flex-col gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          All offerings · {offerings?.length ?? 0}
        </p>
        <div className="flex flex-col gap-2">
          {offerings?.map(({ offering, program }) => {
            const app = isApp(offering);
            const word = app ? "users" : (offering.participant_label_plural || "learners");
            return (
              <button
                key={offering.id} type="button" onClick={() => onOpenOffering(program, offering)}
                className="w-full text-left rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-white/5 focus:outline-none"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderLeft: `3px solid ${app ? "#5a4fd6" : accent}` }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "white" }}>
                  {app ? <AppWindow size={16} /> : <BookOpen size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>{offering.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>{offering.offering_type}</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                    {program.name} · {offering.participant_count} {word} · {offering.status.replace("_", " ")}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: MUTED }} />
              </button>
            );
          })}
          {offerings && offerings.length === 0 && (
            <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No offerings yet across your programs.</p>
          )}
        </div>
      </section>

      {/* Organization relationships (partner / member / chapter networks) */}
      <OrgRelationshipsPanel orgId={orgId} accent={accent} />
    </div>
  );
}

// ─── Breadcrumb ────────────────────────────────────────────────────────────

function Breadcrumb({ orgName, nav, onGo }: { orgName: string; nav: Nav; onGo: (nav: Nav) => void }) {
  const crumbBtn = "text-sm transition-colors focus:outline-none";
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap" style={{ fontFamily: FONT_BODY }}>
      <button
        className={crumbBtn}
        style={{ color: nav.level === "org" ? "white" : MUTED }}
        onClick={() => onGo({ level: "org" })}
      >
        {orgName}
      </button>
      {nav.level !== "org" && (
        <>
          <ChevronRight size={14} style={{ color: MUTED }} />
          <button
            className={crumbBtn}
            style={{ color: nav.level === "program" ? "white" : MUTED }}
            onClick={() => onGo({ level: "program", program: nav.program })}
          >
            {nav.program.name}
          </button>
        </>
      )}
      {nav.level === "offering" && (
        <>
          <ChevronRight size={14} style={{ color: MUTED }} />
          <span className="text-sm text-white">{nav.offering.name}</span>
        </>
      )}
    </div>
  );
}

// ─── Programs grid (Organization view) ───────────────────────────────────────

function ProgramsGrid({
  orgId, accent, onOpen, openAddSignal = 0,
}: {
  orgId: string; accent: string; onOpen: (p: Program) => void; openAddSignal?: number;
}) {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [counts, setCounts] = useState<Record<string, { courses: number; apps: number }>>({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<ProgramCategory>("edu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listPrograms(orgId)
      .then((ps) => {
        setPrograms(ps);
        // Fetch offering counts per program so cards can show courses/apps.
        ps.forEach((p) => {
          listOfferings(p.id)
            .then((offs) => {
              const apps = offs.filter(isApp).length;
              setCounts((prev) => ({ ...prev, [p.id]: { courses: offs.length - apps, apps } }));
            })
            .catch(() => {});
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load programs"));
  }, [orgId]);

  // Open the add form when the parent bumps the signal (e.g. "New Program" from
  // the Dashboard tab).
  useEffect(() => {
    if (openAddSignal > 0) setAdding(true);
  }, [openAddSignal]);

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
      setPrograms((prev) => [...(prev || []), created]);
      setName("");
      setDesc("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create program");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Organization</p>
          <h2 className="mt-1 text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Programs</h2>
          <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            Each program contains offerings — courses, apps, challenges, and classes.
          </p>
        </div>
        <button
          type="button" onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 px-4 h-10 rounded-full text-xs font-semibold transition-all focus:outline-none flex-shrink-0"
          style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
        >
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

      {error && <p className="mb-3 text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {programs && programs.length === 0 && !adding && (
        <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.03)", border: `1px dashed ${BORDER}` }}>
          <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>No programs yet — add your first one to start creating offerings.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {programs?.map((p) => {
          const Icon = p.category === "game" ? Dices : GraduationCap;
          const c = counts[p.id];
          return (
            <button
              key={p.id} type="button" onClick={() => onOpen(p)}
              className="text-left rounded-2xl p-5 flex flex-col transition-all hover:bg-white/6 active:scale-[0.99] focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: p.icon ? "transparent" : accent, color: p.icon ? "white" : "#111" }}>
                  {p.icon ? <span className="text-xl">{p.icon}</span> : <Icon size={20} />}
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase flex-shrink-0" style={{ background: p.category === "game" ? "rgba(130,30,22,0.35)" : "rgba(48,26,78,0.35)", color: "rgba(255,255,255,0.85)" }}>
                  {p.category === "game" ? "Game" : "Edu"}
                </span>
              </div>
              <p className="mt-3 text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{p.name}</p>
              <p className="text-[11px] mt-1 line-clamp-2 min-h-[32px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                {p.description || "Program offerings live here."}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                <span><span className="text-white font-bold">{c ? c.courses : "—"}</span> courses</span>
                <span><span className="text-white font-bold">{c ? c.apps : "—"}</span> apps</span>
                <span><span className="text-white font-bold">{p.learner_count ?? 0}</span> students</span>
                <span><span className="text-white font-bold">{p.instructor_count ?? 0}</span> teachers</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Programs shared with this org by others (accepted affiliations), read-only */}
      <AffiliatedProgramsSection orgId={orgId} accent={accent} />
    </div>
  );
}

// ─── Program detail (offerings) ──────────────────────────────────────────────

function OfferingRow({ offering, accent, onOpen }: { offering: Offering; accent: string; onOpen: () => void }) {
  const app = isApp(offering);
  return (
    <button
      type="button" onClick={onOpen}
      className="w-full text-left rounded-xl p-4 flex items-center gap-4 transition-all hover:bg-white/5 focus:outline-none"
      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderLeft: `3px solid ${app ? "#5a4fd6" : accent}` }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "white" }}>
        {app ? <AppWindow size={16} /> : <BookOpen size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white truncate" style={{ fontFamily: FONT_HEAD }}>{offering.name}</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>{offering.offering_type}</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase" style={{ background: offering.status === "open" ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)" }}>{offering.status.replace("_", " ")}</span>
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          {offering.approval_mode === "auto_approve" ? "Auto-approve" : "Manual approve"}
          {offering.pending_count > 0 ? ` · ${offering.pending_count} pending` : ""}
          {` · ${offering.participant_count} participant${offering.participant_count === 1 ? "" : "s"}`}
        </p>
      </div>
      <ChevronRight size={16} style={{ color: MUTED }} />
    </button>
  );
}

export function ProgramDetail({
  program, accent, onOpenOffering, onDeleted,
}: {
  program: Program; accent: string; onOpenOffering: (o: Offering) => void;
  onDeleted?: () => void;
}) {
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [creatingApp, setCreatingApp] = useState(false);
  const [appName, setAppName] = useState("");
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!onDeleted) return;
    if (!window.confirm(`Delete "${program.name}"? This permanently removes the program and all its offerings, apps, groups, and registrations. This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteProgram(program.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete program");
      setDeleting(false);
    }
  }

  useEffect(() => {
    listOfferings(program.id)
      .then(setOfferings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load offerings"));
  }, [program.id]);

  const { courses, apps } = useMemo(() => {
    const list = offerings || [];
    return { courses: list.filter((o) => !isApp(o)), apps: list.filter(isApp) };
  }, [offerings]);

  async function createCourse() {
    if (!courseName.trim()) return;
    setBusy(true);
    setError("");
    try {
      // Courses are authored on the Learning Platform. Nexus stores the offering
      // record (module = learning) and routes editors/learners downstream.
      const created = await createOffering(program.id, {
        name: courseName.trim(),
        offering_type: "course",
        approval_mode: "auto_approve",
        platform_module: "learning",
        signup_fields: DEFAULT_SIGNUP_FIELDS,
      });
      setOfferings((prev) => [...(prev || []), created]);
      setCourseName("");
      setCreating(false);
      onOpenOffering(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setBusy(false);
    }
  }

  async function createAppOffering() {
    if (!appName.trim()) return;
    setBusy(true);
    setError("");
    try {
      // An app-type offering is the thing an App Shell configures. Default its
      // downstream module from the program category.
      const created = await createOffering(program.id, {
        name: appName.trim(),
        offering_type: "app",
        approval_mode: "manual_approve",
        platform_module: program.category === "game" ? "coaching" : "learning",
        signup_fields: DEFAULT_SIGNUP_FIELDS,
      });
      setOfferings((prev) => [...(prev || []), created]);
      setAppName("");
      setCreatingApp(false);
      onOpenOffering(created); // jump straight into the App Shell editor
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create app");
    } finally {
      setBusy(false);
    }
  }

  async function openLearningStudio() {
    // Author courses in the Learning Platform. If a specific app is bound to a
    // course offering, launch through it; otherwise open the studio directly.
    setLaunching(true);
    setError("");
    try {
      const appsForProgram = await listApps(program.id);
      const studioApp = appsForProgram.find((a) => a.launch_url && /learn|studio/i.test(a.app_slug));
      if (studioApp) {
        const ctx = await getAppLaunchContext(studioApp.id);
        const base = (ctx.launch_url || LEARNING_APP_URL).replace(/\/$/, "");
        window.open(`${base}/?lt=${encodeURIComponent(ctx.launch_token)}`, "_blank", "noopener");
      } else {
        window.open(LEARNING_APP_URL, "_blank", "noopener");
      }
    } catch {
      window.open(LEARNING_APP_URL, "_blank", "noopener");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{program.name}</h2>
          <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>{program.description || "Program offerings"}</p>
        </div>
        {onDeleted && (
          <button
            type="button" onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold transition-all focus:outline-none disabled:opacity-50 flex-shrink-0"
            style={{ background: "rgba(220,38,38,0.12)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)", fontFamily: FONT_BODY }}
          >
            <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete program"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}

      {/* Courses & content */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            Courses &amp; content · {courses.length}
          </p>
          <button
            type="button" onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium transition-colors focus:outline-none"
            style={{ color: accent, fontFamily: FONT_BODY }}
          >
            <Plus size={13} /> Create course
          </button>
        </div>

        <div className="rounded-xl p-3 flex items-start gap-3" style={{ background: "rgba(90,79,214,0.08)", border: `1px solid rgba(90,79,214,0.25)` }}>
          <BookOpen size={15} style={{ color: "#a99cff", marginTop: 2 }} />
          <div className="flex-1">
            <p className="text-[11px] text-white/80" style={{ fontFamily: FONT_BODY }}>
              Courses are authored on the <b>Learning Platform</b>. Nexus stores the course offering and routes editors and learners there.
            </p>
            <button
              type="button" onClick={openLearningStudio} disabled={launching}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold transition-colors focus:outline-none disabled:opacity-50"
              style={{ color: "#a99cff", fontFamily: FONT_BODY }}
            >
              {launching ? "Opening…" : "Open Learning Platform"} <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {creating && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                <input
                  type="text" value={courseName} onChange={(e) => setCourseName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createCourse(); } }}
                  placeholder="Course name (e.g. Brain Bee AI-Enabled Course 2026)"
                  className="w-full h-10 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                />
                <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                  Creates a course offering (module: learning) and opens it. You'll author the lessons on the Learning Platform.
                </p>
                <button
                  type="button" onClick={createCourse} disabled={busy}
                  className="self-end px-5 h-10 rounded-xl text-sm font-semibold transition-all focus:outline-none disabled:opacity-50"
                  style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
                >{busy ? "Creating…" : "Create course"}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {courses.length === 0 && !creating ? (
          <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No courses yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {courses.map((o) => (
              <OfferingRow key={o.id} offering={o} accent={accent} onOpen={() => onOpenOffering(o)} />
            ))}
          </div>
        )}
      </section>

      {/* App shells */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            App shells · {apps.length}
          </p>
          <button
            type="button" onClick={() => setCreatingApp((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium transition-colors focus:outline-none"
            style={{ color: accent, fontFamily: FONT_BODY }}
          >
            <Plus size={13} /> New app
          </button>
        </div>

        <AnimatePresence initial={false}>
          {creatingApp && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                <input
                  type="text" value={appName} onChange={(e) => setAppName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createAppOffering(); } }}
                  placeholder="App name (e.g. Bridge AI Coach App)"
                  className="w-full h-10 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25"
                  style={{ background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}
                />
                <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                  Creates an app offering and opens its <b>App Shell</b> — where you configure branding, onboarding, role labels, auth, and the signup-hook key.
                </p>
                <button
                  type="button" onClick={createAppOffering} disabled={busy}
                  className="self-end px-5 h-10 rounded-xl text-sm font-semibold transition-all focus:outline-none disabled:opacity-50"
                  style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
                >{busy ? "Creating…" : "Create app shell"}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {apps.length === 0 && !creatingApp ? (
          <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            No app shells yet. Use <b>New app</b> to create one and configure its App Shell.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {apps.map((o) => (
              <OfferingRow key={o.id} offering={o} accent={accent} onOpen={() => onOpenOffering(o)} />
            ))}
          </div>
        )}
      </section>

      {/* Groups (classes / clubs / cohorts within this program) */}
      <GroupsSection orgId={program.org_id} programId={program.id} offerings={offerings || []} accent={accent} />

      {/* Affiliated organizations (invite another org → they accept) */}
      <ProgramOrgAffiliationsSection orgId={program.org_id} programId={program.id} accent={accent} />
    </div>
  );
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export function PlatformWorkspace({ orgId, orgName, accent }: { orgId: string; orgName: string; accent: string }) {
  const [nav, setNav] = useState<Nav>({ level: "org" });
  const [orgTab, setOrgTab] = useState<"dashboard" | "programs">("dashboard");
  const [addProgramSignal, setAddProgramSignal] = useState(0);

  return (
    <div>
      <Breadcrumb orgName={orgName} nav={nav} onGo={setNav} />

      {nav.level === "org" && (
        <div className="mb-6 flex gap-1 w-fit rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
          {([
            { key: "dashboard", label: "Dashboard" },
            { key: "programs", label: "Programs" },
          ] as const).map(({ key, label }) => {
            const on = orgTab === key;
            return (
              <button
                key={key} type="button" onClick={() => setOrgTab(key)}
                className="px-5 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-all focus:outline-none"
                style={{ background: on ? accent : "transparent", color: on ? "#111" : MUTED, fontFamily: FONT_BODY }}
              >{label}</button>
            );
          })}
        </div>
      )}

      {nav.level !== "org" && (
        <button
          type="button"
          onClick={() => setNav(nav.level === "offering" ? { level: "program", program: nav.program } : { level: "org" })}
          className="flex items-center gap-1.5 text-xs mb-4 transition-colors focus:outline-none hover:text-white"
          style={{ color: MUTED, fontFamily: FONT_BODY }}
        >
          <ArrowLeft size={14} /> Back
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={nav.level + (nav.level === "org" ? orgTab : "") + (nav.level !== "org" ? nav.program.id : "") + (nav.level === "offering" ? nav.offering.id : "")}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
        >
          {nav.level === "org" && orgTab === "dashboard" && (
            <OrgOverview
              orgId={orgId} accent={accent}
              onOpenOffering={(program, offering) => setNav({ level: "offering", program, offering })}
              onNewProgram={() => { setOrgTab("programs"); setAddProgramSignal((n) => n + 1); }}
            />
          )}
          {nav.level === "org" && orgTab === "programs" && (
            <ProgramsGrid
              orgId={orgId} accent={accent}
              onOpen={(p) => setNav({ level: "program", program: p })}
              openAddSignal={addProgramSignal}
            />
          )}
          {nav.level === "program" && (
            <ProgramDetail
              program={nav.program} accent={accent}
              onOpenOffering={(o) => setNav({ level: "offering", program: nav.program, offering: o })}
              onDeleted={() => { setOrgTab("programs"); setNav({ level: "org" }); }}
            />
          )}
          {nav.level === "offering" && (
            <OfferingDetail
              program={nav.program} offering={nav.offering} accent={accent}
              onDeleted={() => setNav({ level: "program", program: nav.program })}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
