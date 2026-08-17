import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Users, Lock, Plus, Award, Check, X, Eye, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PEOPLE } from '../../../lib/data';
import type { Role } from '../../../lib/types';
import { TEMPLATE_OBJECT_TYPES, TEMPLATE_TYPE_LABELS } from '../../../lib/objectTemplates';
import { PlatformAccessCatalogue } from './PlatformAccessCatalogue';
import {
  type CapabilityCatalogueDocument,
  capabilityActionWord,
  groupsSorted,
  loadCatalogue,
  initCatalogue,
  typeScopableCapabilities,
} from '../../../lib/accessControlCatalogue';
import {
  type AccessPolicyDocument,
  type TypeScopeMap,
  type PolicyRole,
  catalogueSampleRoles,
  customPolicyRoles,
  deleteCustomPolicyRole,
  loadPolicy,
  initPolicy,
  roleCapabilityIds,
  roleTypeScopes,
  upsertCustomPolicyRole,
} from '../../../lib/accessPolicy';
import { getToken, listLearningRoster, assignLearningRole, inviteLearningPerson, testAsPerson, type RosterPerson } from '../../../lib/nexus';
import { useConfirm } from '../ConfirmDialog';

const ROLE_LABELS: Record<Role, string> = {
  'content-developer': 'Content Dev',
  'object-reviewer': 'Content Reviewer',
  'course-reviewer': 'Course Reviewer',
  'administrator': 'Administrator',
  'coach': 'Coach',
  'student': 'Student',
};

/* ─── which content types a granted capability covers ─────────── */

const OBJECT_TYPE_ICONS: Record<string, string> = {
  lesson: '📖', tutorial: '🎓', 'tutorial-v2': '🎓', 'tutorial-v3': '🎓', quiz: '✅',
  'flashcard-set': '🃏', 'concept-card': '💡', summary: '📋', reflection: '🪞',
  scenario: '🎭', assignment: '📝', drill: '🔁', 'video-script': '🎬',
};

/**
 * The content types a capability can be narrowed to — the things an author
 * actually builds (Tutorial V2, Flashcard set, Quiz, …), not the catalogue's
 * coarse resource-type buckets.
 */
function TypeScopePanel({
  capabilityId,
  selected,
  onToggle,
  onClear,
}: {
  capabilityId: string;
  selected: string[];
  onToggle: (objectType: string) => void;
  onClear: () => void;
}) {
  const verb = capabilityActionWord(capabilityId);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 p-3 rounded-2xl"
      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#92400E' }}>
          Which content types can this role {verb}? — leave empty for all
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 px-2 py-0.5 rounded-full"
            style={{ fontSize: 11.5, color: '#92400E', background: 'rgba(217,119,6,0.12)' }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_OBJECT_TYPES.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              title={t}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all"
              style={{
                background: on ? 'rgba(217,119,6,0.15)' : 'rgba(255,255,255,0.7)',
                borderColor: on ? '#D97706' : 'rgba(0,0,0,0.1)',
                color: on ? '#92400E' : '#6B7280',
                fontSize: 12,
                fontWeight: on ? 600 : 400,
              }}
            >
              {on ? <Check size={10} /> : <span>{OBJECT_TYPE_ICONS[t] || '📄'}</span>}
              {TEMPLATE_TYPE_LABELS[t]}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: '#92400E', opacity: 0.75, marginTop: 7 }}>
        {selected.length === 0
          ? `Every content type — this role can ${verb} anything.`
          : `${selected.length} of ${TEMPLATE_OBJECT_TYPES.length} content types.`}
      </p>
    </motion.div>
  );
}

/* ─── role editor modal (catalogue capability chips) ──────────── */

interface RoleEditorValue {
  id?: string;
  name: string;
  desc: string;
  permissions: string[];
  typeScopes?: TypeScopeMap;
}

function RoleEditorModal({
  catalogue,
  initial,
  onSave,
  onClose,
}: {
  catalogue: CapabilityCatalogueDocument;
  initial: RoleEditorValue | null;
  onSave: (role: RoleEditorValue) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [desc, setDesc] = useState(initial?.desc || '');
  const [perms, setPerms] = useState<Set<string>>(new Set(initial?.permissions || []));
  const [typeScopes, setTypeScopes] = useState<TypeScopeMap>(initial?.typeScopes || {});

  // Which granted capabilities may be narrowed to particular content types.
  const scopableIds = useMemo(
    () => new Set(typeScopableCapabilities(catalogue).map((c) => c.id)),
    [catalogue],
  );

  const toggleTypeScope = (capabilityId: string, objectType: string) => setTypeScopes((prev) => {
    const current = prev[capabilityId] || [];
    const next = current.includes(objectType)
      ? current.filter((t) => t !== objectType)
      : [...current, objectType];
    const out = { ...prev };
    if (next.length) out[capabilityId] = next; else delete out[capabilityId];
    return out;
  });
  const clearTypeScope = (capabilityId: string) => setTypeScopes((prev) => {
    const out = { ...prev };
    delete out[capabilityId];
    return out;
  });

  const toggle = (id: string) => setPerms((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-[28px] overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '90vh' }}
      >
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>
              {initial?.name ? `Edit “${initial.name}”` : 'New role'}
            </h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>
              Pick the capabilities this role grants.
            </p>
          </div>
          <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Role name</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Drill Developer"
                className="w-full rounded-xl px-3 py-2"
                style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              />
            </div>
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</p>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What this role is for"
                className="w-full rounded-xl px-3 py-2"
                style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              />
            </div>
          </div>

          {groupsSorted(catalogue).map((group) => {
            const groupCaps = catalogue.capabilities.filter((c) => c.group === group.id);
            if (!groupCaps.length) return null;
            return (
              <div key={group.id}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 8, textTransform: 'uppercase' }}>
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {groupCaps.map((p) => {
                    const on = perms.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(p.id)}
                        title={p.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
                        style={{
                          background: on ? 'rgba(5,150,105,0.08)' : 'rgba(0,0,0,0.03)',
                          borderColor: on ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.08)',
                          color: on ? '#059669' : '#6B7280',
                          fontSize: 12.5,
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {on && <Check size={11} />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {groupCaps
                  .filter((c) => perms.has(c.id) && scopableIds.has(c.id))
                  .map((c) => (
                    <TypeScopePanel
                      key={c.id}
                      capabilityId={c.id}
                      selected={typeScopes[c.id] || []}
                      onToggle={(objectType) => toggleTypeScope(c.id, objectType)}
                      onClear={() => clearTypeScope(c.id)}
                    />
                  ))}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) return;
              // Drop scopes whose capability was toggled back off before saving.
              const scopes: TypeScopeMap = {};
              for (const [capId, ids] of Object.entries(typeScopes)) {
                if (perms.has(capId) && ids.length) scopes[capId] = ids;
              }
              onSave({
                id: initial?.id,
                name: name.trim(),
                desc: desc.trim(),
                permissions: [...perms],
                typeScopes: scopes,
              });
              onClose();
            }}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-full text-white"
            style={{ background: name.trim() ? '#0B0F1A' : '#E5E7EB', color: name.trim() ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
          >
            ✓ Save role · {perms.size} capacit{perms.size === 1 ? 'y' : 'ies'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function roleToEditorInitial(r: PolicyRole): RoleEditorValue {
  return {
    id: r.id,
    name: r.name,
    desc: r.description || '',
    permissions: roleCapabilityIds(r),
    typeScopes: roleTypeScopes(r),
  };
}

function permChips(
  catalogue: CapabilityCatalogueDocument,
  capIds: string[],
) {
  const labels = capIds
    .map((id) => catalogue.capabilities.find((c) => c.id === id)?.label || id)
    .filter(Boolean);
  const show = labels.slice(0, 5);
  return { show, more: labels.length - show.length };
}

/** "Tutorial V2, Flashcard set +2 more" — labels for a scoped capability. */
function typeScopeSummary(types: string[]): string {
  const labels = types.map((t) => TEMPLATE_TYPE_LABELS[t as keyof typeof TEMPLATE_TYPE_LABELS] || t);
  const head = labels.slice(0, 2).join(', ');
  return labels.length > 2 ? `${head} +${labels.length - 2} more` : head;
}

/* ─── main ────────────────────────────────────────────────────── */

export function AdminPeopleRoles() {
  // Sub-tab switch: the People/Roles roster, or the (consolidated) Access
  // Catalog editor — mirrors the console's People → Access Catalog tab.
  const [view, setView] = useState<'people' | 'catalog'>('people');
  const [catalogue, setCatalogue] = useState<CapabilityCatalogueDocument>(() => loadCatalogue());
  const [policy, setPolicy] = useState<AccessPolicyDocument>(() => loadPolicy());
  const confirm = useConfirm();

  // Live roster (Nexus mode). null → not loaded / demo mode (fall back to PEOPLE).
  const [roster, setRoster] = useState<RosterPerson[] | null>(null);
  const nexusMode = !!getToken();

  const reloadRoster = React.useCallback(() => {
    if (!nexusMode) return;
    listLearningRoster().then(setRoster).catch(() => setRoster([]));
  }, [nexusMode]);

  // Seed the catalogue + roles from the Nexus backend (falls back to the local
  // cache / demo when there is no session).
  useEffect(() => {
    let live = true;
    (async () => {
      const cat = await initCatalogue();
      if (live) setCatalogue(cat);
      const pol = await initPolicy();
      if (live) setPolicy(pol);
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => { reloadRoster(); }, [reloadRoster]);

  const assignRole = async (email: string, roleId: string | null) => {
    try {
      await assignLearningRole(email, roleId);
      fireToast(roleId ? 'Role assigned' : 'Role cleared');
      reloadRoster();
    } catch (e) {
      fireToast(e instanceof Error ? e.message : 'Failed to assign role');
    }
  };
  const [inviteOpen, setInviteOpen] = useState(false);
  const doTestAs = async (email: string) => {
    try { await testAsPerson(email); } // reloads on success
    catch (e) { fireToast(e instanceof Error ? e.message : 'Test login failed'); }
  };
  const [editorState, setEditorState] = useState<{
    open: boolean;
    initial: ReturnType<typeof roleToEditorInitial> | null;
  }>({ open: false, initial: null });
  const [toast, setToast] = useState('');

  const fireToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400); };

  const sampleRoles = useMemo(() => catalogueSampleRoles(policy), [policy]);
  const customRoles = useMemo(() => customPolicyRoles(policy), [policy]);
  const learningInstance = policy.platformInstances.find((i) => i.id === 'bridge-learning');
  const enabledCount = learningInstance?.enabledCapabilityIds?.length ?? catalogue.capabilities.length;

  const openNew = () => setEditorState({ open: true, initial: null });
  const openDuplicate = (r: PolicyRole) => {
    setEditorState({
      open: true,
      initial: {
        name: `${r.name} (custom)`,
        desc: `Based on ${r.name}`,
        permissions: roleCapabilityIds(r),
        typeScopes: roleTypeScopes(r),
      },
    });
  };
  const openEdit = (c: PolicyRole) => setEditorState({ open: true, initial: roleToEditorInitial(c) });

  const deleteCustom = async (id: string) => {
    const role = customPolicyRoles(policy).find((r) => r.id === id);
    const ok = await confirm({
      description: role
        ? `Delete role “${role.name}”? People using it may lose access.`
        : 'Delete this role? People using it may lose access.',
    });
    if (!ok) return;
    setPolicy(await deleteCustomPolicyRole(id));
    fireToast('Role deleted');
  };

  const saveRole = async (role: RoleEditorValue) => {
    const next = await upsertCustomPolicyRole({
      id: role.id,
      name: role.name,
      description: role.desc,
      capabilityIds: role.permissions,
      restrictedResourceTypes: role.typeScopes?.['learning.object.create'] || [],
      typeScopes: role.typeScopes,
    });
    setPolicy(next);
    fireToast('Role saved');
  };

  const ENABLED_TYPES = catalogue.resourceTypes.map((rt) => rt.label);

  return (
    <div className="w-full">
      <div className="px-6 pt-6 flex items-end gap-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        {([['people', 'People & Roles'], ['catalog', 'Access Catalog']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            style={{
              paddingBottom: 10,
              marginBottom: -1,
              fontSize: view === id ? 20 : 14,
              fontWeight: view === id ? 750 : 600,
              color: view === id ? '#0B1220' : '#9AA3AF',
              borderBottom: view === id ? '2px solid #0B1220' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'catalog' ? (
        <PlatformAccessCatalogue />
      ) : (
      <div className="px-4 sm:px-6 py-5 sm:py-6 w-full space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-[24px]"
        style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ background: '#F3F4F6' }}>🃏</div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>Bridge — Learning access policy</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>
            {catalogue.id} · v{catalogue.catalogueVersion}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>
              ENABLED CAPABILITIES ({enabledCount})
            </p>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>
              RESOURCE TYPES ({ENABLED_TYPES.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ENABLED_TYPES.slice(0, 8).map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{t}</span>
              ))}
              {ENABLED_TYPES.length > 8 && (
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: '#9AA3AF' }}>+{ENABLED_TYPES.length - 8}</span>
              )}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>
              DECLARED ROLES ({sampleRoles.length + customRoles.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...sampleRoles, ...customRoles].map((r) => (
                <span key={r.id} className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: '#374151' }}>{r.name}</span>
              ))}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 7 }}>POLICY</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>{policy.id}</p>
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs" style={{ background: '#F0FDF4', color: '#15803D' }}>
              {policy.updatedAt ? `Updated ${policy.updatedAt.slice(0, 10)}` : 'Live'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <Lock size={12} style={{ color: '#9AA3AF' }} />
          <p style={{ fontSize: 12, color: '#9AA3AF' }}>
            This updates when you save the Access Catalog.
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={15} style={{ color: '#374151' }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Roles & access</h2>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white"
            style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}
          >
            <Plus size={12} />New role
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 14 }}>
          Sample roles are recommended starters; custom roles grant any mix of capabilities.
        </p>

        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 10, textTransform: 'uppercase' }}>
          From Access Catalog · sample templates
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {sampleRoles.map((r) => {
            const caps = roleCapabilityIds(r);
            const { show, more } = permChips(catalogue, caps);
            return (
              <div key={r.id} className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#0B0F1A' }}>
                    <Award size={14} style={{ color: 'white' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>{r.name}</p>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>catalog</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{r.description}</p>
                    <code className="text-[10.5px]" style={{ color: '#9AA3AF' }}>{r.id}</code>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {show.map((l) => (
                    <span key={l} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>{l}</span>
                  ))}
                  {more > 0 && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>+{more} more</span>}
                </div>
                <button
                  type="button"
                  onClick={() => openDuplicate(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium"
                  style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)' }}
                >
                  ⧉ Duplicate & customize
                </button>
              </div>
            );
          })}
          {!sampleRoles.length && (
            <div className="col-span-2 p-5 rounded-[22px] text-center" style={{ background: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: 13, color: '#9AA3AF' }}>
                No sample roles yet. Add them under Access Catalogue → Sample roles, then Save catalogue.
              </p>
            </div>
          )}
        </div>

        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 10, textTransform: 'uppercase' }}>
          Custom roles in Bridge
        </p>
        {customRoles.length === 0 ? (
          <div className="p-5 rounded-[22px] text-center" style={{ background: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No custom roles yet. Duplicate a sample role above, or create one from scratch.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {customRoles.map((r) => {
              const caps = roleCapabilityIds(r);
              const { show, more } = permChips(catalogue, caps);
              return (
                <div key={r.id} className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#059669' }}>
                      <Award size={14} style={{ color: 'white' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>{r.name}</p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(5,150,105,0.1)', color: '#047857' }}>custom</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{r.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {show.map((l) => <span key={l} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>{l}</span>)}
                    {more > 0 && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.05)', color: '#9AA3AF' }}>+{more} more</span>}
                  </div>
                  {Object.entries(roleTypeScopes(r)).map(([capId, types]) => (
                    <p key={capId} style={{ fontSize: 12, color: '#D97706', marginBottom: 8 }}>
                      ⌗ Can {capabilityActionWord(capId)}: {typeScopeSummary(types)}
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openEdit(r)} className="flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>✎ Edit</button>
                    <button type="button" onClick={() => deleteCustom(r.id)} className="flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium" style={{ color: '#EA580C', borderColor: 'rgba(234,88,12,0.2)' }}>🗑 Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} style={{ color: '#374151' }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>People</h2>
          {nexusMode ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: '#0B0F1A' }}
            >
              <UserPlus size={13} /> Invite
            </button>
          ) : null}
        </div>
        <div className="rounded-[22px] overflow-x-auto" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                {['Person', 'Roles', 'Team', 'Active', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left" style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nexusMode ? (
                (roster ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ fontSize: 12.5, color: '#9AA3AF' }}>
                    {roster === null ? 'Loading people…' : 'No people in this program yet.'}
                  </td></tr>
                ) : (
                  (roster ?? []).map((p, i, arr) => {
                    const initials = (p.display_name ?? p.email ?? '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
                    return (
                      <tr key={p.email} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0" style={{ fontSize: 11, fontWeight: 700 }}>{initials}</div>
                            <div className="min-w-0">
                              <p style={{ fontSize: 13, fontWeight: 550, color: '#0B1220' }} className="truncate">{p.display_name ?? p.email}</p>
                              {p.display_name ? <p style={{ fontSize: 11.5, color: '#9AA3AF' }} className="truncate">{p.email}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {p.is_admin ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }} title="Program-level access">
                              <Shield size={11} /> Super Admin
                            </span>
                          ) : (
                            <select
                              value={p.role_id ?? ''}
                              onChange={(e) => assignRole(p.email, e.target.value || null)}
                              className="px-2 py-1 rounded-lg border text-xs"
                              style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: 'white' }}
                            >
                              <option value="">No role</option>
                              {customRoles.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: p.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.12)', color: p.status === 'active' ? '#047857' : '#92400E' }}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3"><p style={{ fontSize: 12.5, color: '#9AA3AF' }}>—</p></td>
                        <td className="px-4 py-3">
                          {p.email ? (
                            <button
                              type="button"
                              onClick={() => doTestAs(p.email)}
                              title="Sign in as this person (test)"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium"
                              style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}
                            >
                              <Eye size={12} /> Test as
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )
              ) : (
                PEOPLE.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < PEOPLE.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#0B0F1A] text-white flex items-center justify-center shrink-0" style={{ fontSize: 11, fontWeight: 700 }}>{p.initials}</div>
                        <p style={{ fontSize: 13, fontWeight: 550, color: '#0B1220' }}>{p.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: p.role === 'student' ? 'rgba(6,182,212,0.1)' : 'rgba(0,0,0,0.05)', color: p.role === 'student' ? '#0E7490' : '#374151' }}>
                        {ROLE_LABELS[p.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3"><p style={{ fontSize: 12.5, color: '#6B7280' }}>Bridge</p></td>
                    <td className="px-4 py-3"><p style={{ fontSize: 12.5, color: '#9AA3AF' }}>today</p></td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => fireToast(`Role assignment is available when launched from Nexus.`)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}>
                        ⚙ Roles
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {editorState.open && (
        <RoleEditorModal
          catalogue={catalogue}
          initial={editorState.initial}
          onSave={saveRole}
          onClose={() => setEditorState({ open: false, initial: null })}
        />
      )}

      {inviteOpen && (
        <InvitePersonModal
          roles={customRoles}
          onClose={() => setInviteOpen(false)}
          onInvited={(msg) => { fireToast(msg); reloadRoster(); }}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-white z-50"
            style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.3)' }}
          >
            ✓ {toast}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      )}
    </div>
  );
}

/* ─── invite modal (centralized: creates a real Nexus person) ──── */

function InvitePersonModal({
  roles,
  onClose,
  onInvited,
}: {
  roles: PolicyRole[];
  onClose: () => void;
  onInvited: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ redeem_url: string } | null>(null);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await inviteLearningPerson({ email: email.trim(), display_name: name.trim() || undefined, role_id: roleId || null });
      onInvited('Invitation created');
      // Reveal the activation link to share; the person sets their own password.
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,15,26,0.4)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-[22px] p-6" style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(0,0,0,0.35)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={16} style={{ color: '#0B1220' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>Invite to Content Studio</h3>
        </div>
        {result ? (
          <div className="space-y-3">
            <p style={{ fontSize: 12.5, color: '#6B7280' }}>Share this activation link. {email.trim()} sets their own password and their role applies once they accept.</p>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'rgba(0,0,0,0.1)', background: '#F9FAFB' }}>
              <code className="flex-1 truncate" style={{ fontSize: 11.5 }}>{result.redeem_url}</code>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(result.redeem_url); }} className="px-2 py-0.5 rounded-md text-xs" style={{ background: 'rgba(0,0,0,0.06)' }}>Copy</button>
            </div>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#0B0F1A' }}>Done</button></div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" className="w-full mt-1 px-3 py-2 rounded-lg border" style={{ fontSize: 13, borderColor: 'rgba(0,0,0,0.12)' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="jordan@example.org" className="w-full mt-1 px-3 py-2 rounded-lg border" style={{ fontSize: 13, borderColor: 'rgba(0,0,0,0.12)' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Learning role</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border" style={{ fontSize: 13, borderColor: 'rgba(0,0,0,0.12)', background: 'white' }}>
                <option value="">No role yet</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {error ? <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: '#374151' }}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy || !email.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0B0F1A' }}>{busy ? 'Inviting…' : 'Invite'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
