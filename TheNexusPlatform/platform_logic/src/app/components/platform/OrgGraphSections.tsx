/**
 * Slice 11 UI — groups (+members, coach-add), program affiliations, org
 * relationships, and bulk registration import. Uses the shared dark theme.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ChevronRight, Users, Upload, Link2, Share2, BookOpen } from "lucide-react";
import {
  listGroups, createGroup, listGroupMembers, coachAddToGroup,
  listProgramOrgAffiliations, createProgramOrgAffiliation, updateProgramOrgAffiliation, listIncomingOrgAffiliations,
  listAffiliatedPrograms, getAffiliatedProgramDetail,
  listOrgRelationships, createOrgRelationship, updateOrgRelationship, deleteOrgRelationship, bulkImportRegistrations,
  listSelectableOrgs,
} from "../../../services/api";
import type { SelectableOrg } from "../../../services/api";
import type { AffiliatedProgram, AffiliatedProgramDetail, Group, GroupMember, Offering, ProgramOrgAffiliation, OrgRelationship } from "../../../types/platform";
import { BORDER, INPUT_BG, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

const inputCls = "w-full h-9 rounded-lg px-3 text-sm text-white outline-none placeholder:text-white/25";
const inputStyle = { background: INPUT_BG, border: `1px solid ${BORDER}`, fontFamily: FONT_BODY } as const;


// ── Groups (+ members + coach-add) ──────────────────────────────────────────
function GroupRow({ group, offerings, accent }: { group: Group; offerings: Offering[]; accent: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [offeringId, setOfferingId] = useState(group.offering_id || offerings[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function loadMembers() {
    listGroupMembers(group.id).then(setMembers).catch(() => setMembers([]));
  }
  useEffect(() => { if (open && members === null) loadMembers(); }, [open]); // eslint-disable-line

  async function add() {
    if (!email.trim()) { setError("Email required"); return; }
    setBusy(true); setError("");
    try {
      await coachAddToGroup(group.id, { email: email.trim(), name: name.trim() || undefined, offering_id: offeringId || undefined });
      setEmail(""); setName("");
      loadMembers();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-4 py-3 flex items-center gap-3 focus:outline-none">
        <Users size={15} style={{ color: MUTED }} />
        <span className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{group.name}</span>
        {group.label && <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>{group.label}</span>}
        <ChevronRight size={15} style={{ color: MUTED, marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: ".15s" }} />
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase mt-3" style={{ color: MUTED, fontFamily: FONT_BODY }}>
            Members {members ? `(${members.length})` : ""}
          </p>
          {members?.map((m) => (
            <div key={m.id} className="text-sm text-white/70" style={{ fontFamily: FONT_BODY }}>{m.display_name || m.email || m.user_id}</div>
          ))}
          {members && members.length === 0 && <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No members yet.</p>}
          <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Add a learner (coach-add)</p>
            <input className={inputCls} style={inputStyle} placeholder="learner@email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={inputCls} style={inputStyle} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            {offerings.length > 0 && (
              <select className={inputCls} style={inputStyle} value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
                {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
            <button type="button" onClick={add} disabled={busy} className="self-end px-4 h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>
              {busy ? "Adding…" : "Add learner"}
            </button>
            {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function GroupsSection({ orgId, programId, offerings, accent }: { orgId: string; programId: string; offerings: Offering[]; accent: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listGroups(orgId, programId).then(setGroups).catch((e) => setError(e instanceof Error ? e.message : "Failed to load groups"));
  }, [orgId, programId]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true); setError("");
    try {
      const g = await createGroup(orgId, { program_id: programId, name: name.trim(), label: label.trim() || undefined });
      setGroups((prev) => [...(prev || []), g]);
      setName(""); setLabel(""); setCreating(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create group"); }
    finally { setBusy(false); }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Groups · {groups?.length ?? 0}</p>
        <button type="button" onClick={() => setCreating((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium focus:outline-none" style={{ color: accent, fontFamily: FONT_BODY }}>
          <Plus size={13} /> New group
        </button>
      </div>
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
              <input className={inputCls} style={inputStyle} placeholder="Group name (e.g. Tuesday Beginners)" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={inputCls} style={inputStyle} placeholder="Label (optional, e.g. class / club)" value={label} onChange={(e) => setLabel(e.target.value)} />
              <button type="button" onClick={add} disabled={busy} className="self-end px-4 h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>{busy ? "Creating…" : "Create group"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
      {groups && groups.length === 0 && !creating && <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No groups yet.</p>}
      <div className="flex flex-col gap-2">
        {groups?.map((g) => <GroupRow key={g.id} group={g} offerings={offerings} accent={accent} />)}
      </div>
    </section>
  );
}

// ── Program ↔ organization affiliations (invite → accept, like a friend req) ─
const ORG_AFFIL_TYPES = ["partner", "club", "coach_org", "reviewer_org", "host", "sponsor", "chapter", "region", "content_partner"];

function statusBadge(status: string): { label: string; bg: string; color: string } {
  if (status === "active") return { label: "active", bg: "rgba(34,197,94,0.18)", color: "#4ade80" };
  if (status === "invited" || status === "proposed") return { label: "pending", bg: "rgba(234,179,8,0.18)", color: "#fbbf24" };
  if (status === "archived") return { label: "declined", bg: "rgba(248,113,113,0.15)", color: "#f87171" };
  return { label: status, bg: "rgba(255,255,255,0.08)", color: MUTED };
}

// Org A's view on a program: invite other organizations to affiliate. Each stays
// "pending" until the invited org accepts it from their dashboard.
export function ProgramOrgAffiliationsSection({ orgId, programId, accent }: { orgId: string; programId: string; accent: string }) {
  const [rows, setRows] = useState<ProgramOrgAffiliation[] | null>(null);
  const [orgs, setOrgs] = useState<SelectableOrg[]>([]);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");
  const [affType, setAffType] = useState("partner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { listProgramOrgAffiliations(programId).then(setRows).catch(() => setRows([])); }, [programId]);
  useEffect(() => { listSelectableOrgs().then(setOrgs).catch(() => setOrgs([])); }, []);

  const targets = orgs.filter((o) => o.id !== orgId);
  const orgLabel = (id: string) => { const o = orgs.find((x) => x.id === id); return o ? (o.name || o.slug || id) : `${id.slice(0, 8)}…`; };

  async function invite() {
    if (!target) { setError("Pick an organization to invite"); return; }
    setBusy(true); setError("");
    try {
      const r = await createProgramOrgAffiliation(programId, { organization_id: target, affiliation_type: affType });
      setRows((prev) => [...(prev || []), r]); setTarget(""); setAdding(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send invite"); }
    finally { setBusy(false); }
  }

  async function cancel(id: string) {
    const updated = await updateProgramOrgAffiliation(id, "archived");
    setRows((prev) => (prev || []).map((x) => (x.id === id ? { ...x, status: updated.status } : x)));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Affiliated organizations · {rows?.length ?? 0}</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium focus:outline-none" style={{ color: accent, fontFamily: FONT_BODY }}><Plus size={13} /> Invite organization</button>
      </div>
      <p className="text-[11px] -mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>Invite another organization to affiliate with this program. They must accept before it becomes active.</p>
      {adding && (
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="flex gap-2">
            <select className={inputCls} style={inputStyle} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{targets.length ? "Select an organization…" : "No other organizations available"}</option>
              {targets.map((o) => <option key={o.id} value={o.id}>{o.name || o.slug || o.id}</option>)}
            </select>
            <select className={inputCls} style={{ ...inputStyle, maxWidth: 170 }} value={affType} onChange={(e) => setAffType(e.target.value)}>
              {ORG_AFFIL_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <button type="button" onClick={invite} disabled={busy} className="self-end px-4 h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>{busy ? "Sending…" : "Send invite"}</button>
          {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
        </div>
      )}
      {rows?.filter((r) => r.status !== "archived").map((r) => {
        const b = statusBadge(r.status);
        return (
          <div key={r.id} className="rounded-lg px-4 py-2.5 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
            <span className="text-sm text-white/80" style={{ fontFamily: FONT_BODY }}>{orgLabel(r.organization_id)}</span>
            <span className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>{r.affiliation_type.replace(/_/g, " ")}</span>
            <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ background: b.bg, color: b.color }}>{b.label}</span>
            {r.status === "invited" && (
              <button type="button" onClick={() => cancel(r.id)} className="text-[11px] font-medium focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>Cancel</button>
            )}
          </div>
        );
      })}
      {rows && rows.filter((r) => r.status !== "archived").length === 0 && !adding && <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No affiliated organizations yet.</p>}
    </section>
  );
}

// Org B's inbox: incoming affiliation requests to accept or decline.
export function IncomingAffiliationRequests({ orgId, accent }: { orgId: string; accent: string }) {
  const [rows, setRows] = useState<ProgramOrgAffiliation[] | null>(null);
  const [orgs, setOrgs] = useState<SelectableOrg[]>([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => { listIncomingOrgAffiliations(orgId).then(setRows).catch(() => setRows([])); }, [orgId]);
  useEffect(() => { listSelectableOrgs().then(setOrgs).catch(() => setOrgs([])); }, []);

  const orgLabel = (id?: string) => { if (!id) return "An organization"; const o = orgs.find((x) => x.id === id); return o ? (o.name || o.slug || id) : `${id.slice(0, 8)}…`; };
  const pending = (rows || []).filter((r) => r.status === "invited");

  async function respond(id: string, status: "active" | "archived") {
    setBusyId(id);
    try {
      await updateProgramOrgAffiliation(id, status);
      setRows((prev) => (prev || []).map((x) => (x.id === id ? { ...x, status } : x)));
    } finally { setBusyId(""); }
  }

  if (pending.length === 0) return null; // nothing to show until a request arrives

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: accent, fontFamily: FONT_BODY }}>Affiliation requests · {pending.length}</p>
      <div className="flex flex-col gap-2">
        {pending.map((r) => (
          <div key={r.id} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white" style={{ fontFamily: FONT_BODY }}>
                <span className="font-semibold">{orgLabel(r.from_organization_id)}</span> invited you to affiliate with <span className="font-semibold">{r.program_name || "a program"}</span>
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>as {r.affiliation_type.replace(/_/g, " ")}</p>
            </div>
            <button type="button" disabled={busyId === r.id} onClick={() => respond(r.id, "active")} className="px-4 h-8 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>Accept</button>
            <button type="button" disabled={busyId === r.id} onClick={() => respond(r.id, "archived")} className="px-3 h-8 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: "rgba(255,255,255,0.08)", color: "white", fontFamily: FONT_BODY }}>Decline</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Affiliated programs (Org B's read-only view of programs shared with them) ─
export function AffiliatedProgramsSection({ orgId, accent }: { orgId: string; accent: string }) {
  const [rows, setRows] = useState<AffiliatedProgram[] | null>(null);
  const [orgs, setOrgs] = useState<SelectableOrg[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, AffiliatedProgramDetail>>({});

  useEffect(() => { listAffiliatedPrograms(orgId).then(setRows).catch(() => setRows([])); }, [orgId]);
  useEffect(() => { listSelectableOrgs().then(setOrgs).catch(() => setOrgs([])); }, []);

  const orgLabel = (id: string) => { const o = orgs.find((x) => x.id === id); return o ? (o.name || o.slug || id) : `${id.slice(0, 8)}…`; };

  function open(pid: string) {
    setSelected(pid);
    if (!detail[pid]) getAffiliatedProgramDetail(orgId, pid).then((d) => setDetail((prev) => ({ ...prev, [pid]: d }))).catch(() => {});
  }

  if (!rows || rows.length === 0) return null; // only appears once at least one affiliation is accepted

  const sel = selected ? rows.find((r) => r.program_id === selected) : null;
  const d = selected ? detail[selected] : undefined;
  const courses = d?.offerings ?? [];
  const students = (d?.participants ?? []).filter((p) => p.participant_type === "learner");

  return (
    <section className="flex flex-col gap-4 mt-10">
      <div>
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Shared with you</p>
        <h3 className="mt-1 text-lg font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>Affiliated programs · {rows.length}</h3>
        <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>Programs other organizations have shared with you. Read-only — courses and students are managed by the owning organization.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((r) => {
          const active = selected === r.program_id;
          return (
            <button
              key={r.program_id} type="button" onClick={() => open(r.program_id)}
              className="text-left rounded-2xl p-5 flex flex-col transition-all hover:bg-white/6 active:scale-[0.99] focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${active ? accent : BORDER}` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: accent }}>
                  <Share2 size={18} />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)" }}>Shared</span>
              </div>
              <p className="mt-3 text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{r.name}</p>
              <p className="text-[11px] mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                by {orgLabel(r.owner_organization_id)} · {r.affiliation_type.replace(/_/g, " ")}
              </p>
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-3">
            <div>
              <h4 className="text-base font-bold text-white" style={{ fontFamily: FONT_HEAD }}>{sel.name}</h4>
              <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>Shared by {orgLabel(sel.owner_organization_id)} · read-only</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="ml-auto text-[11px] font-medium focus:outline-none" style={{ color: MUTED, fontFamily: FONT_BODY }}>Close</button>
          </div>
          {!d ? (
            <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>Loading…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Courses · {courses.length}</p>
                {courses.length === 0 ? <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No courses.</p> : (
                  <div className="flex flex-col gap-1.5">
                    {courses.map((o) => (
                      <div key={o.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <BookOpen size={13} style={{ color: MUTED, flexShrink: 0 }} />
                        <span className="text-sm text-white/80 truncate" style={{ fontFamily: FONT_BODY }}>{o.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>{o.offering_type}</span>
                        <span className="ml-auto text-[10px] flex-shrink-0" style={{ color: MUTED, fontFamily: FONT_BODY }}>{o.status.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: MUTED, fontFamily: FONT_BODY }}>Students · {students.length}</p>
                {students.length === 0 ? <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>No students.</p> : (
                  <div className="flex flex-col gap-1">
                    {students.slice(0, 50).map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm" style={{ fontFamily: FONT_BODY }}>
                        <span className="text-white/80">{s.display_name || "—"}</span>
                        {s.email && <span className="text-[11px]" style={{ color: MUTED }}>{s.email}</span>}
                      </div>
                    ))}
                    {students.length > 50 && <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>Showing 50 of {students.length}.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Organization relationships ──────────────────────────────────────────────
const REL_TYPES = ["partner", "member", "parent", "child", "affiliate", "chapter_of", "club_of", "sponsor", "host", "collaborator"];

export function OrgRelationshipsPanel({ orgId, accent }: { orgId: string; accent: string }) {
  const [rows, setRows] = useState<OrgRelationship[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");
  const [relType, setRelType] = useState("partner");
  const [orgs, setOrgs] = useState<SelectableOrg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { listOrgRelationships(orgId).then(setRows).catch(() => setRows([])); }, [orgId]);
  useEffect(() => { listSelectableOrgs().then(setOrgs).catch(() => setOrgs([])); }, []);

  // Orgs you can link to — everything you can see except this one.
  const targets = orgs.filter((o) => o.id !== orgId);
  const orgLabel = (id: string) => {
    const o = orgs.find((x) => x.id === id);
    return o ? (o.name || o.slug || id) : `${id.slice(0, 8)}…`;
  };

  const [actingId, setActingId] = useState("");

  async function add() {
    if (!target) { setError("Pick an organization"); return; }
    setBusy(true); setError("");
    try {
      const r = await createOrgRelationship(orgId, { target_organization_id: target, relationship_type: relType });
      setRows((prev) => [...(prev || []), r]); setTarget(""); setAdding(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function accept(id: string) {
    setActingId(id);
    try {
      const updated = await updateOrgRelationship(id, "active");
      setRows((prev) => (prev || []).map((x) => (x.id === id ? { ...x, status: updated.status } : x)));
    } finally { setActingId(""); }
  }

  async function remove(id: string) {
    setActingId(id);
    try {
      await deleteOrgRelationship(id);
      setRows((prev) => (prev || []).filter((x) => x.id !== id));
    } finally { setActingId(""); }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>Organization relationships · {rows?.length ?? 0}</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium focus:outline-none" style={{ color: accent, fontFamily: FONT_BODY }}><Link2 size={13} /> Add</button>
      </div>
      <p className="text-[11px] -mt-1" style={{ color: MUTED, fontFamily: FONT_BODY }}>Links to other organizations — partners, parent bodies, chapters. You can only link to organizations you have access to.</p>
      {adding && (
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <div className="flex gap-2">
            <select className={inputCls} style={inputStyle} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{targets.length ? "Select an organization…" : "No other organizations available"}</option>
              {targets.map((o) => <option key={o.id} value={o.id}>{o.name || o.slug || o.id}</option>)}
            </select>
            <select className={inputCls} style={{ ...inputStyle, maxWidth: 160 }} value={relType} onChange={(e) => setRelType(e.target.value)}>
              {REL_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <button type="button" onClick={add} disabled={busy} className="self-end px-4 h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>{busy ? "Adding…" : "Add relationship"}</button>
          {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
        </div>
      )}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
        {rows?.map((r, i) => {
          const other = r.source_organization_id === orgId ? r.target_organization_id : r.source_organization_id;
          const incoming = r.target_organization_id === orgId && r.status === "proposed";
          const b = statusBadge(r.status);
          const acting = actingId === r.id;
          return (
            <div key={r.id} className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: i < (rows.length - 1) ? `1px solid ${BORDER}` : "none" }}>
              <span className="text-sm font-semibold text-white" style={{ fontFamily: FONT_BODY }}>{orgLabel(other)}</span>
              <span className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                {incoming ? `wants to connect as ${r.relationship_type.replace(/_/g, " ")}` : r.relationship_type.replace(/_/g, " ")}
              </span>
              <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ background: b.bg, color: b.color }}>{b.label}</span>
              {incoming && (
                <button type="button" disabled={acting} onClick={() => accept(r.id)} className="px-3 h-7 rounded-lg text-[11px] font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>Accept</button>
              )}
              <button type="button" disabled={acting} onClick={() => remove(r.id)} className="text-[11px] font-medium focus:outline-none disabled:opacity-50" style={{ color: "#f87171", fontFamily: FONT_BODY }}>Remove</button>
            </div>
          );
        })}
        {rows && rows.length === 0 && <div className="px-5 py-3 text-sm text-white/40" style={{ fontFamily: FONT_BODY }}>No relationships.</div>}
      </div>
    </section>
  );
}

// ── Bulk import (offering registrations) ────────────────────────────────────
export function BulkImportPanel({ offeringId, accent, onImported }: { offeringId: string; accent: string; onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  function parse(): Array<{ email?: string; name?: string; age?: number }> {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [email, name, age] = line.split(",").map((s) => s.trim());
      return { email: email || undefined, name: name || undefined, age: age ? Number(age) : undefined };
    });
  }

  async function submit() {
    const rows = parse();
    if (rows.length === 0) { setError("Paste at least one row (email,name)"); return; }
    setBusy(true); setError(""); setResult("");
    try {
      const r = await bulkImportRegistrations(offeringId, rows);
      setResult(`Imported ${r.created} registration${r.created === 1 ? "" : "s"}.`);
      setText("");
      onImported?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[11px] font-medium focus:outline-none self-start" style={{ color: accent, fontFamily: FONT_BODY }}>
        <Upload size={13} /> Bulk import (CSV)
      </button>
      {open && (
        <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
          <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>One per line: <span className="text-white/70">email, name, age</span></p>
          <textarea rows={5} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-white/25" style={inputStyle} placeholder={"lee@x.edu, Lee, 14\nsam@x.edu, Sam"} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" onClick={submit} disabled={busy} className="self-end px-4 h-9 rounded-lg text-xs font-semibold focus:outline-none disabled:opacity-50" style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}>{busy ? "Importing…" : "Import"}</button>
          {result && <p className="text-xs" style={{ color: "#4ade80", fontFamily: FONT_BODY }}>{result}</p>}
          {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
