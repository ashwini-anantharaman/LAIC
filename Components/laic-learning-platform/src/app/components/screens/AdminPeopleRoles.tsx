/**
 * People (Learning Platform) — custom roles + people, wired to Nexus.
 *
 * Admins define custom-titled roles that grant view/edit over specific AREAS of
 * the platform (Authoring, Reviews, Publishing, …); the granted areas determine
 * which parts of the app a person sees. People are invited (link → set password
 * → sign in) and assigned a role. Admins are Nexus territory: read-only here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Users, Shield, Trash2, RefreshCw, Plus, Copy, X, Pencil, KeyRound, Eye } from 'lucide-react';
import { useApp } from '../../App';
import {
  nexusFetch, getProgramId,
  listLearningRoles, createLearningRole, updateLearningRole, deleteLearningRole,
  listLearningRoster, assignLearningRole,
  type LearningRole, type RosterPerson,
} from '../../../lib/nexus';
import {
  LEARNING_MANIFEST, isEditable, effectiveLevel, cascadeSet, cascadeClear, grantedTopAreas,
  type AreaLevel, type AccessNode,
} from '../../../lib/learningAreas';

export function AdminPeopleRoles() {
  const { startRolePreview } = useApp();
  const programId = getProgramId();
  const [roles, setRoles] = useState<LearningRole[] | null>(null);
  const [people, setPeople] = useState<RosterPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<LearningRole | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!programId) { setError('No program context — open this platform from Nexus.'); setPeople([]); setRoles([]); return; }
    setError(null);
    try {
      const [r, p] = await Promise.all([listLearningRoles(), listLearningRoster()]);
      setRoles(r); setPeople(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load'); setPeople([]); setRoles([]);
    }
  }, [programId]);
  useEffect(() => { void load(); }, [load]);

  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name ?? null;

  async function assign(p: RosterPerson, roleId: string | null) {
    setBusy(p.email);
    try { await assignLearningRole(p.email, roleId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to assign role'); }
    finally { setBusy(null); }
  }

  async function removePerson(p: RosterPerson) {
    if (!programId || !window.confirm(`Remove ${p.display_name ?? p.email} from this program?`)) return;
    setBusy(p.email);
    try {
      const res = await nexusFetch(
        `/api/platform/platforms/learning/people?program_id=${encodeURIComponent(programId)}&email=${encodeURIComponent(p.email)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`Failed to remove (${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to remove'); }
    finally { setBusy(null); }
  }

  async function removeRole(r: LearningRole) {
    if (!window.confirm(`Delete the "${r.name}" role? People keep their membership but lose its access.`)) return;
    try { await deleteLearningRole(r.id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete role'); }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-600" />
          <h1 className="text-xl font-semibold text-slate-800">People</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button type="button" onClick={() => setEditingRole('new')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <Plus className="h-3.5 w-3.5" /> Create role
          </button>
          <button type="button" onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            <Plus className="h-3.5 w-3.5" /> Invite person
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div> : null}

      {/* Roles */}
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><KeyRound className="h-4 w-4" /> Roles</h2>
      <p className="mb-3 text-xs text-slate-500">Each role grants view or edit access to specific areas of the platform. Assign people below.</p>
      {roles === null ? (
        <div className="mb-6 text-sm text-slate-500">Loading…</div>
      ) : roles.length === 0 ? (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-500">No roles yet. Create one, then assign people to it.</div>
      ) : (
        <div className="mb-6 space-y-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3">
              <div className="min-w-[130px] font-medium text-slate-800">{r.name}</div>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {grantedTopAreas(r.perms).length === 0 ? <span className="text-xs text-slate-400">no areas</span> :
                  grantedTopAreas(r.perms).map((a) => (
                    <span key={a.label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{a.label} · {a.level}</span>
                  ))}
              </div>
              <button type="button" onClick={() => startRolePreview(r.name, r.perms)} title="Test as this role" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"><Eye className="h-3.5 w-3.5" /> Test as</button>
              <button type="button" onClick={() => setEditingRole(r)} title="Edit role" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => void removeRole(r)} title="Delete role" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* People */}
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Users className="h-4 w-4" /> People</h2>
      {people === null ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : people.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white/70 p-6 text-sm text-slate-500">No people yet. Invite someone above.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/80">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.email} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{p.display_name ?? p.email}</div>
                    <div className="text-xs text-slate-500">{p.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.is_admin ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        <Shield className="h-3 w-3" /> Admin <span className="text-indigo-400">· managed in Nexus</span>
                      </span>
                    ) : (
                      <select value={p.role_id ?? 'none'} disabled={busy === p.email}
                        onChange={(e) => void assign(p, e.target.value === 'none' ? null : e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700">
                        <option value="none">No role</option>
                        {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!p.is_admin && (p.membership_id || p.invitation_id) ? (
                      <button type="button" onClick={() => void removePerson(p)} disabled={busy === p.email}
                        title="Remove from program" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRole ? (
        <RoleBuilder role={editingRole === 'new' ? null : editingRole} onClose={() => setEditingRole(null)} onSaved={() => { setEditingRole(null); void load(); }} />
      ) : null}
      {inviteOpen ? (
        <InvitePersonDialog programId={programId} roles={roles ?? []} onClose={() => setInviteOpen(false)} onInvited={() => void load()} />
      ) : null}
    </div>
  );
}

/** Create/edit a custom role: name + per-area view/edit toggles. */
function RoleBuilder({ role, onClose, onSaved }: { role: LearningRole | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [perms, setPerms] = useState<Record<string, AreaLevel>>(role?.perms ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // One node row + its children, recursively. Checking a parent cascades to its
  // subtree; picking "edit" cascades edit down where each child supports it.
  function renderNode(node: AccessNode, depth: number): React.ReactNode {
    const lvl = effectiveLevel(perms, false, node.id);
    const on = lvl !== 'none';
    const editable = isEditable(node);
    return (
      <div key={node.id}>
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2" style={{ marginLeft: depth * 16 }}>
          <input
            type="checkbox"
            checked={on}
            className="h-4 w-4"
            onChange={(e) => setPerms((p) => (e.target.checked ? cascadeSet(p, node.id, 'view') : cascadeClear(p, node.id)))}
          />
          <div className="flex-1">
            <div className="text-sm text-slate-800">{node.label}</div>
            {node.hint ? <div className="text-[11px] text-slate-400">{node.hint}</div> : null}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
            {(['view', 'edit'] as AreaLevel[]).map((l) => {
              const disabled = !on || (l === 'edit' && !editable);
              return (
                <button
                  key={l}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPerms((p) => cascadeSet(p, node.id, l))}
                  title={l === 'edit' && !editable ? 'This area is view-only' : undefined}
                  className={`px-2.5 py-1 capitalize ${lvl === l ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
        {node.children?.length ? <div className="mt-1.5 space-y-1.5">{node.children.map((c) => renderNode(c, depth + 1))}</div> : null}
      </div>
    );
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      if (role) await updateLearningRole(role.id, { name: name.trim(), perms });
      else await createLearningRole(name.trim(), perms);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to save role'); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{role ? 'Edit role' : 'Create role'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Role name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Reviewer"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" autoFocus />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Access</div>
            <p className="mb-2 text-xs text-slate-500">Turn on an area, then pick view or edit. Sub-areas nest under their tab — granting a tab cascades to everything below it. Only granted areas appear for this role.</p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {LEARNING_MANIFEST.accessTree.map((n) => renderNode(n, 0))}
            </div>
          </div>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={busy || !name.trim()}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Saving…' : role ? 'Save role' : 'Create role'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Invite flow — create a Nexus invitation (link), then assign a custom role. */
function InvitePersonDialog({ programId, roles, onClose, onInvited }: {
  programId: string | null; roles: LearningRole[]; onClose: () => void; onInvited: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('none');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    if (!programId || !email.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await nexusFetch(`/api/programs/${programId}/members`, {
        method: 'POST', body: JSON.stringify({ email: email.trim(), display_name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Invite failed (${res.status})`);
      const inv = await res.json();
      if (roleId !== 'none') await assignLearningRole(email.trim(), roleId);
      setLink(inv.redeem_url || (inv.token ? `/invite/${inv.token}` : ''));
      onInvited();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invite failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Invite person</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Share this link with {email}. They set their own password, sign in, and land here in the role you gave them.</p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 truncate text-xs text-slate-700">{link}</code>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200" title="Copy link"><Copy className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Done</button></div>
          </div>
        ) : (
          <div className="space-y-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.org" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="none">No role yet</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></div>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={() => void submit()} disabled={busy || !email.trim()}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{busy ? 'Inviting…' : 'Send invite'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPeopleRoles;
