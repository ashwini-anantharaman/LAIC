/**
 * People & Roles (Learning Platform) — wired to Nexus, mirroring Bridge.
 *
 * Nexus owns identity; this screen lists the program's people and lets an admin
 * assign one of the platform's assignable learning roles or remove someone.
 * Admins are Nexus territory: shown read-only ("Admin"), no dropdown, no remove.
 * The old cosmetic permission-catalogue/preset UI was removed — roles here are
 * the real, functional set the backend enforces (role → screen access).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Users, Shield, Trash2, RefreshCw, Plus, Copy, X } from 'lucide-react';
import { nexusFetch, getProgramId } from '../../../lib/nexus';

interface Person {
  email: string;
  display_name: string | null;
  status: 'active' | 'invited' | string;
  role: string | null;
  is_admin: boolean;
  membership_id: string | null;
  invitation_id: string | null;
}

/** Assignable from here (admins are managed in Nexus, not assignable). */
const ASSIGNABLE: { key: string; label: string }[] = [
  { key: 'content-developer', label: 'Content Developer' },
  { key: 'object-reviewer', label: 'Object Reviewer' },
  { key: 'course-reviewer', label: 'Course Reviewer' },
  { key: 'coach', label: 'Coach' },
  { key: 'student', label: 'Student' },
];

export function AdminPeopleRoles() {
  const programId = getProgramId();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!programId) {
      setError('No program context — open this platform from Nexus.');
      setPeople([]);
      return;
    }
    setError(null);
    try {
      const res = await nexusFetch(`/api/platform/platforms/learning/people?program_id=${encodeURIComponent(programId)}`);
      if (!res.ok) throw new Error(`Failed to load people (${res.status})`);
      setPeople((await res.json()) as Person[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load people');
      setPeople([]);
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(p: Person, role: string | null) {
    if (!programId) return;
    setBusy(p.email);
    try {
      const res = await nexusFetch('/api/platform/platforms/learning/people/role', {
        method: 'PUT',
        body: JSON.stringify({ program_id: programId, email: p.email, role }),
      });
      if (!res.ok) throw new Error(`Failed to update role (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Person) {
    if (!programId) return;
    if (!window.confirm(`Remove ${p.display_name ?? p.email} from this program?`)) return;
    setBusy(p.email);
    try {
      const res = await nexusFetch(
        `/api/platform/platforms/learning/people?program_id=${encodeURIComponent(programId)}&email=${encodeURIComponent(p.email)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`Failed to remove (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-600" />
          <h1 className="text-xl font-semibold text-slate-800">People</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" /> Invite person
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Invite people to this program — they get a link, set their own password, and land here in the
        role you gave them. Roles decide which parts of the platform each person can see and edit.
        Administrators are managed in Nexus and shown read-only.
      </p>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>
      ) : null}

      {people === null ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : people.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
          No people in this program yet.
        </div>
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
                        <Shield className="h-3 w-3" /> Admin
                        <span className="text-indigo-400">· managed in Nexus</span>
                      </span>
                    ) : (
                      <select
                        value={p.role ?? 'none'}
                        disabled={busy === p.email}
                        onChange={(e) => void assign(p, e.target.value === 'none' ? null : e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                      >
                        <option value="none">No role</option>
                        {ASSIGNABLE.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!p.is_admin && (p.membership_id || p.invitation_id) ? (
                      <button
                        type="button"
                        onClick={() => void remove(p)}
                        disabled={busy === p.email}
                        title="Remove from program"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen ? (
        <InvitePersonDialog
          programId={programId}
          onClose={() => setInviteOpen(false)}
          onInvited={() => void load()}
        />
      ) : null}
    </div>
  );
}

/**
 * Invite flow — mirrors Bridge/Nexus: create a Nexus invitation for the program
 * (which yields a redeem link), then assign the chosen learning role. The invitee
 * opens the link, sets their own password, and can then sign in and launch into
 * this platform as that role.
 */
function InvitePersonDialog({
  programId,
  onClose,
  onInvited,
}: {
  programId: string | null;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    if (!programId || !email.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await nexusFetch(`/api/programs/${programId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), display_name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Invite failed (${res.status})`);
      const inv = await res.json();
      // Assign the learning role to the invited email (functional: gates their view).
      if (role) {
        await nexusFetch('/api/platform/platforms/learning/people/role', {
          method: 'PUT',
          body: JSON.stringify({ program_id: programId, email: email.trim(), role }),
        });
      }
      const redeem = inv.redeem_url || (inv.token ? `/invite/${inv.token}` : '');
      setLink(redeem);
      onInvited();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Invite person</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Share this link with {email}. They set their own password on first open, then can sign in
              and launch the Learning Platform as {ASSIGNABLE.find((a) => a.key === role)?.label ?? role}.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 truncate text-xs text-slate-700">{link}</code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(link); }}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200"
                title="Copy link"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.org"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {ASSIGNABLE.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </div>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={() => void submit()} disabled={busy || !email.trim()}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {busy ? 'Inviting…' : 'Send invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPeopleRoles;
