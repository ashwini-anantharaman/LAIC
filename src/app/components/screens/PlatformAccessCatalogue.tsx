import React, { useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, Copy, FileJson, GitBranch, KeyRound,
  LayoutList, Layers, PanelLeft, Plus, RotateCcw, Save, Shield, Trash2, X, Boxes,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  type Capability,
  type CapabilityCatalogueDocument,
  type ResourceType,
  type SampleRoleTemplate,
  type UiSurface,
  type UiSurfaceKind,
  LAIC_ACCESS_CONTROL_SCHEMA,
  UI_SURFACE_KINDS,
  capabilitiesInGroup,
  catalogueToExportJson,
  createDefaultCatalogue,
  groupsSorted,
  loadCatalogue,
  saveCatalogue,
  slugifyId,
  surfacesInGroup,
} from '../../../lib/accessControlCatalogue';

type TabId = 'groups' | 'capabilities' | 'surfaces' | 'resources' | 'samples' | 'json' | 'schema';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'groups', label: 'Groups', icon: <GitBranch size={14} /> },
  { id: 'capabilities', label: 'Capabilities', icon: <KeyRound size={14} /> },
  { id: 'surfaces', label: 'UI surfaces', icon: <PanelLeft size={14} /> },
  { id: 'resources', label: 'Resource types', icon: <Boxes size={14} /> },
  { id: 'samples', label: 'Sample roles', icon: <Shield size={14} /> },
  { id: 'json', label: 'Export JSON', icon: <LayoutList size={14} /> },
  { id: 'schema', label: 'JSON Schema', icon: <FileJson size={14} /> },
];

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-white shadow-lg" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
      {message}
    </div>
  );
}

function CapToggle({ id, label, on, onToggle }: { id: string; label: string; on: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all"
      style={{
        background: on ? 'rgba(5,150,105,0.08)' : 'rgba(0,0,0,0.03)',
        borderColor: on ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.08)',
        color: on ? '#059669' : '#6B7280',
        fontSize: 12,
        fontWeight: on ? 600 : 400,
      }}
    >
      {on && <Check size={10} />}
      {label}
    </button>
  );
}

/* ─── Capability modal ─────────────────────────────────────────── */

function CapabilityModal({
  initial, catalogue, onSave, onClose,
}: {
  initial: Capability | null;
  catalogue: CapabilityCatalogueDocument;
  onSave: (c: Capability) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label || '');
  const [id, setId] = useState(initial?.id || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [group, setGroup] = useState(initial?.group || catalogue.groups[0]?.id || 'authoring');
  const [resourceTypes, setResourceTypes] = useState<Set<string>>(new Set(initial?.resourceTypes || []));
  const [supportsConstraints, setSupportsConstraints] = useState(!!initial?.supportsResourceConstraints);
  const idTaken = !initial && catalogue.capabilities.some((c) => c.id === id);

  const toggleRt = (rid: string) => {
    setResourceTypes((prev) => {
      const n = new Set(prev);
      n.has(rid) ? n.delete(rid) : n.add(rid);
      return n;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-[28px] overflow-hidden flex flex-col bg-white" style={{ boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '90vh' }}>
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>{initial ? `Edit “${initial.label}”` : 'New capability'}</h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>Atomic id programs grant — stable contract for UI and APIs.</p>
          </div>
          <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Label</p>
            <input value={label} onChange={(e) => { setLabel(e.target.value); if (!initial) setId(slugifyId(e.target.value, 'learning.')); }} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Capability id</p>
            <input value={id} disabled={!!initial} onChange={(e) => setId(e.target.value)} className="w-full rounded-xl px-3 py-2 font-mono" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', opacity: initial ? 0.6 : 1 }} />
            {idTaken && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>Id already exists.</p>}
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</p>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Group</p>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'white' }}>
              {groupsSorted(catalogue).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Resource types</p>
            <div className="flex flex-wrap gap-1.5">
              {catalogue.resourceTypes.map((rt) => (
                <CapToggle key={rt.id} id={rt.id} label={rt.label} on={resourceTypes.has(rt.id)} onToggle={toggleRt} />
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={supportsConstraints} onChange={(e) => setSupportsConstraints(e.target.checked)} className="mt-0.5" />
            <span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', display: 'block' }}>Supports resource constraints</span>
              <span style={{ fontSize: 12, color: '#9AA3AF' }}>Programs may attach includeIds / filters on grants.</span>
            </span>
          </label>
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            disabled={!label || !id || idTaken}
            onClick={() => {
              onSave({
                id, label, description: description || label, group,
                resourceTypes: resourceTypes.size ? [...resourceTypes] : undefined,
                supportsResourceConstraints: supportsConstraints || undefined,
              });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-full"
            style={{ background: label && id && !idTaken ? '#0B0F1A' : '#E5E7EB', color: label && id && !idTaken ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
          >
            Save capability
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── UI surface modal ─────────────────────────────────────────── */

function SurfaceModal({
  initial, catalogue, onSave, onClose,
}: {
  initial: UiSurface | null;
  catalogue: CapabilityCatalogueDocument;
  onSave: (s: UiSurface) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label || '');
  const [id, setId] = useState(initial?.id || '');
  const [kind, setKind] = useState<UiSurfaceKind>(initial?.kind || 'navigation');
  const [group, setGroup] = useState(initial?.group || 'learning');
  const [route, setRoute] = useState(initial?.routeOrComponent || '');
  const [caps, setCaps] = useState<Set<string>>(new Set(initial?.requiredAnyCapabilities || []));
  const idTaken = !initial && catalogue.uiSurfaces.some((s) => s.id === id);

  const toggle = (cid: string) => {
    setCaps((prev) => {
      const n = new Set(prev);
      n.has(cid) ? n.delete(cid) : n.add(cid);
      return n;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg rounded-[28px] overflow-hidden flex flex-col bg-white" style={{ boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '90vh' }}>
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>{initial ? `Edit “${initial.label}”` : 'New UI surface'}</h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>Optional mapping to nav / screen / component. Not the security boundary.</p>
          </div>
          <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Label</p>
              <input value={label} onChange={(e) => { setLabel(e.target.value); if (!initial) setId(slugifyId(e.target.value, 'learning.')); }} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
            </div>
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Kind</p>
              <select value={kind} onChange={(e) => setKind(e.target.value as UiSurfaceKind)} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'white' }}>
                {UI_SURFACE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Surface id</p>
            <input value={id} disabled={!!initial} onChange={(e) => setId(e.target.value)} className="w-full rounded-xl px-3 py-2 font-mono" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', opacity: initial ? 0.6 : 1 }} />
            {idTaken && <p style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>Id already exists.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>UI group</p>
              <input value={group} onChange={(e) => setGroup(e.target.value)} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} placeholder="learning | learner" />
            </div>
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Route / component</p>
              <input value={route} onChange={(e) => setRoute(e.target.value)} className="w-full rounded-xl px-3 py-2 font-mono" style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 8 }}>requiredAnyCapabilities</p>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {groupsSorted(catalogue).map((g) => {
                const list = capabilitiesInGroup(catalogue, g.id);
                if (!list.length) return null;
                return (
                  <div key={g.id}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.04em', marginBottom: 6, textTransform: 'uppercase' }}>{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((c) => <CapToggle key={c.id} id={c.id} label={c.label} on={caps.has(c.id)} onToggle={toggle} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            disabled={!label || !id || idTaken}
            onClick={() => {
              onSave({
                id, label, kind, group: group || undefined, routeOrComponent: route || undefined,
                requiredAnyCapabilities: [...caps],
              });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-full"
            style={{ background: label && id && !idTaken ? '#0B0F1A' : '#E5E7EB', color: label && id && !idTaken ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
          >
            Save surface
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Sample role modal ────────────────────────────────────────── */

function SampleRoleModal({
  initial, catalogue, onSave, onClose,
}: {
  initial: SampleRoleTemplate;
  catalogue: CapabilityCatalogueDocument;
  onSave: (r: SampleRoleTemplate) => void;
  onClose: () => void;
}) {
  const grant0 = initial.grants[0];
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description || '');
  const [instanceId, setInstanceId] = useState(grant0?.platformInstanceId || 'placeholder-learning-instance');
  const [caps, setCaps] = useState<Set<string>>(new Set(grant0?.capabilityIds || []));

  const toggle = (cid: string) => {
    setCaps((prev) => {
      const n = new Set(prev);
      n.has(cid) ? n.delete(cid) : n.add(cid);
      return n;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl rounded-[28px] overflow-hidden flex flex-col bg-white" style={{ boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '90vh' }}>
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Sample role · {initial.id}</h3>
            <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>Template only — live roles live in program access policy.</p>
          </div>
          <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Name</p>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
            </div>
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>platformInstanceId</p>
              <input value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className="w-full rounded-xl px-3 py-2 font-mono" style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</p>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl px-3 py-2" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
          </div>
          {groupsSorted(catalogue).map((g) => {
            const list = capabilitiesInGroup(catalogue, g.id);
            if (!list.length) return null;
            return (
              <div key={g.id}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.04em', marginBottom: 8, textTransform: 'uppercase' }}>{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((c) => <CapToggle key={c.id} id={c.id} label={c.label} on={caps.has(c.id)} onToggle={toggle} />)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            onClick={() => {
              onSave({
                ...initial,
                name,
                description,
                grants: [{ platformInstanceId: instanceId, capabilityIds: [...caps] }],
              });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-full text-white"
            style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
          >
            Save · {caps.size} capabilities
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────── */

export function PlatformAccessCatalogue() {
  const [catalogue, setCatalogue] = useState<CapabilityCatalogueDocument>(() => loadCatalogue());
  const [tab, setTab] = useState<TabId>('groups');
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(catalogue.groups.map((g) => g.id)));
  const [capModal, setCapModal] = useState<{ open: boolean; initial: Capability | null }>({ open: false, initial: null });
  const [surfaceModal, setSurfaceModal] = useState<{ open: boolean; initial: UiSurface | null }>({ open: false, initial: null });
  const [roleModal, setRoleModal] = useState<SampleRoleTemplate | null>(null);

  const fireToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200); };
  const patch = (next: CapabilityCatalogueDocument) => { setCatalogue(next); setDirty(true); };

  const handleSave = () => { saveCatalogue(catalogue); setDirty(false); fireToast('Catalogue saved'); };
  const handleReset = () => {
    const fresh = createDefaultCatalogue();
    setCatalogue(fresh);
    saveCatalogue(fresh);
    setDirty(false);
    fireToast('Reset to learning-platform-access v1');
  };
  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(catalogueToExportJson(catalogue), null, 2));
    fireToast('JSON copied');
  };
  const handleCopySchema = async () => {
    await navigator.clipboard.writeText(JSON.stringify(LAIC_ACCESS_CONTROL_SCHEMA, null, 2));
    fireToast('Schema copied');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveCatalogue(catalogue);
        setDirty(false);
        fireToast('Catalogue saved');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [catalogue]);

  const upsertCapability = (c: Capability) => {
    const exists = catalogue.capabilities.some((x) => x.id === c.id);
    let groups = catalogue.groups.map((g) => {
      const ids = new Set(g.capabilityIds || []);
      if (g.id === c.group) ids.add(c.id);
      else ids.delete(c.id);
      return { ...g, capabilityIds: [...ids] };
    });
    patch({
      ...catalogue,
      capabilities: exists ? catalogue.capabilities.map((x) => (x.id === c.id ? c : x)) : [...catalogue.capabilities, c],
      groups,
    });
    fireToast(exists ? 'Capability updated' : 'Capability added');
  };

  const removeCapability = (id: string) => {
    patch({
      ...catalogue,
      capabilities: catalogue.capabilities.filter((c) => c.id !== id),
      groups: catalogue.groups.map((g) => ({ ...g, capabilityIds: (g.capabilityIds || []).filter((x) => x !== id) })),
      uiSurfaces: catalogue.uiSurfaces.map((s) => ({
        ...s,
        requiredAnyCapabilities: (s.requiredAnyCapabilities || []).filter((x) => x !== id),
        requiredAllCapabilities: (s.requiredAllCapabilities || []).filter((x) => x !== id),
      })),
      sampleRoleTemplates: (catalogue.sampleRoleTemplates || []).map((r) => ({
        ...r,
        grants: r.grants.map((g) => ({ ...g, capabilityIds: g.capabilityIds.filter((x) => x !== id) })),
      })),
    });
  };

  const upsertSurface = (s: UiSurface) => {
    const exists = catalogue.uiSurfaces.some((x) => x.id === s.id);
    // Attach to first catalogue group that references this surface's catalogue group id, else authoring-like group matching
    const targetGroup = catalogue.groups.find((g) => (g.uiSurfaceIds || []).includes(s.id))
      || catalogue.groups.find((g) => g.id === s.group)
      || catalogue.groups[0];
    const groups = catalogue.groups.map((g) => {
      const ids = new Set(g.uiSurfaceIds || []);
      if (targetGroup && g.id === targetGroup.id) ids.add(s.id);
      else if ((g.uiSurfaceIds || []).includes(s.id) && g.id !== targetGroup?.id) ids.delete(s.id);
      return { ...g, uiSurfaceIds: [...ids] };
    });
    patch({
      ...catalogue,
      uiSurfaces: exists ? catalogue.uiSurfaces.map((x) => (x.id === s.id ? s : x)) : [...catalogue.uiSurfaces, s],
      groups,
    });
    fireToast(exists ? 'Surface updated' : 'Surface added');
  };

  const removeSurface = (id: string) => {
    patch({
      ...catalogue,
      uiSurfaces: catalogue.uiSurfaces.filter((s) => s.id !== id),
      groups: catalogue.groups.map((g) => ({ ...g, uiSurfaceIds: (g.uiSurfaceIds || []).filter((x) => x !== id) })),
    });
  };

  const exportText = JSON.stringify(catalogueToExportJson(catalogue), null, 2);
  const schemaText = JSON.stringify(LAIC_ACCESS_CONTROL_SCHEMA, null, 2);
  const samples = catalogue.sampleRoleTemplates || [];

  return (
    <div className="px-6 py-6 w-full space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-[24px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#0B0F1A', color: 'white' }}>capability_catalogue</span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{catalogue.id} · v{catalogue.catalogueVersion}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>{catalogue.provider.kind}/{catalogue.provider.id}</span>
              {dirty && <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>Unsaved</span>}
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px' }}>{catalogue.name}</h1>
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4, maxWidth: 620 }}>
              {catalogue.description}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={handleReset} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full" style={{ background: 'rgba(0,0,0,0.04)', fontSize: 12.5, fontWeight: 600, color: '#374151' }}>
              <RotateCcw size={13} /> Reset v1 defaults
            </button>
            <button type="button" onClick={handleSave} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
              <Save size={13} /> Save catalogue
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Groups', value: catalogue.groups.length },
            { label: 'Capabilities', value: catalogue.capabilities.length },
            { label: 'UI surfaces', value: catalogue.uiSurfaces.length },
            { label: 'Resource types', value: catalogue.resourceTypes.length },
            { label: 'Sample roles', value: samples.length },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.025)' }}>
              <p style={{ fontSize: 20, fontWeight: 750, color: '#0B1220' }}>{s.value}</p>
              <p style={{ fontSize: 12, color: '#9AA3AF', fontWeight: 500 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="flex gap-1 p-1 rounded-2xl w-fit flex-wrap" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)' }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all"
              style={{ background: on ? 'white' : 'transparent', boxShadow: on ? '0 2px 8px -2px rgba(30,50,80,0.12)' : 'none', fontSize: 12.5, fontWeight: on ? 650 : 500, color: on ? '#0B1220' : '#6B7280' }}>
              {t.icon}{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'groups' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p style={{ fontSize: 13, color: '#6B7280' }}>
              Catalogue groups organize the role UI. Capabilities are the enforcement keys; UI surfaces are optional.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpenGroups(new Set(catalogue.groups.map((g) => g.id)))} className="px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>Expand all</button>
              <button type="button" onClick={() => setOpenGroups(new Set())} className="px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>Collapse all</button>
            </div>
          </div>
          {groupsSorted(catalogue).map((g) => {
            const open = openGroups.has(g.id);
            const caps = capabilitiesInGroup(catalogue, g.id);
            const surfaces = surfacesInGroup(catalogue, g.id);
            return (
              <div key={g.id} className="rounded-[24px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                <button type="button" onClick={() => setOpenGroups((prev) => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}
                  className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-black/[0.015]">
                  <span className="mt-0.5 text-[#9AA3AF]">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#0B0F1A', color: 'white' }}>GROUP</span>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>{g.label}</p>
                      <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>{g.id}</code>
                      <span className="text-[11px] text-[#9AA3AF]">order {g.order}</span>
                    </div>
                    <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 6 }}>{caps.length} capabilities · {surfaces.length} UI surfaces</p>
                  </div>
                </button>
                {open && (
                  <div className="px-5 pb-4 space-y-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                    <div className="pt-3">
                      <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 8, textTransform: 'uppercase' }}>Capabilities</p>
                      <div className="space-y-1">
                        {caps.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-black/[0.02] group">
                            <Layers size={12} className="text-[#9AA3AF] shrink-0" />
                            <span style={{ fontSize: 13, fontWeight: 550, color: '#0B1220' }}>{c.label}</span>
                            <code className="text-[10.5px] px-1 rounded" style={{ background: '#F3F4F6', color: '#9AA3AF' }}>{c.id}</code>
                            {c.supportsResourceConstraints && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.12)', color: '#92400E' }}>constrained</span>}
                            <button type="button" onClick={() => setCapModal({ open: true, initial: c })} className="ml-auto opacity-0 group-hover:opacity-100 px-2 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>Edit</button>
                          </div>
                        ))}
                        {!caps.length && <p style={{ fontSize: 12, color: '#9AA3AF' }}>No capabilities in this group</p>}
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.05em', marginBottom: 8, textTransform: 'uppercase' }}>UI surfaces</p>
                      <div className="space-y-1">
                        {surfaces.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 py-1.5 px-2 rounded-xl hover:bg-black/[0.02] group">
                            <PanelLeft size={12} className="text-[#9AA3AF] shrink-0" />
                            <span style={{ fontSize: 13, fontWeight: 550, color: '#0B1220' }}>{s.label}</span>
                            <code className="text-[10.5px] px-1 rounded" style={{ background: '#F3F4F6', color: '#9AA3AF' }}>{s.id}</code>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{s.kind}</span>
                            <button type="button" onClick={() => setSurfaceModal({ open: true, initial: s })} className="ml-auto opacity-0 group-hover:opacity-100 px-2 py-1 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(0,0,0,0.05)', color: '#374151' }}>Edit</button>
                          </div>
                        ))}
                        {!surfaces.length && <p style={{ fontSize: 12, color: '#9AA3AF' }}>No UI surfaces mapped</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}

      {tab === 'capabilities' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <p style={{ fontSize: 13, color: '#6B7280' }}>Authoritative enforcement keys. Programs grant these; they cannot invent new ids.</p>
            <button type="button" onClick={() => setCapModal({ open: true, initial: null })} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={13} /> Add capability
            </button>
          </div>
          {groupsSorted(catalogue).map((g) => {
            const caps = capabilitiesInGroup(catalogue, g.id);
            if (!caps.length) return null;
            return (
              <div key={g.id} className="rounded-[24px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>{g.label} · {caps.length}</p>
                </div>
                <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
                  {caps.map((c) => (
                    <div key={c.id} className="px-5 py-3.5 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{c.label}</p>
                          <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: '#F3F4F6', color: '#6B7280' }}>{c.id}</code>
                          {c.supportsResourceConstraints && <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(217,119,6,0.12)', color: '#92400E' }}>constraints</span>}
                        </div>
                        {c.resourceTypes?.length ? (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.resourceTypes.map((rt) => (
                              <span key={rt} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{rt}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => setCapModal({ open: true, initial: c })} className="px-2.5 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>Edit</button>
                      <button type="button" onClick={() => removeCapability(c.id)} className="p-1.5 rounded-full" style={{ color: '#9AA3AF' }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {tab === 'surfaces' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <p style={{ fontSize: 13, color: '#6B7280' }}>Navigation, screens, components, actions — optional UI mapping only.</p>
            <button type="button" onClick={() => setSurfaceModal({ open: true, initial: null })} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={13} /> Add surface
            </button>
          </div>
          <div className="rounded-[24px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
            <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
              {catalogue.uiSurfaces.map((s) => (
                <div key={s.id} className="px-5 py-3.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{s.label}</p>
                      <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: '#F3F4F6', color: '#6B7280' }}>{s.id}</code>
                      <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{s.kind}</span>
                    </div>
                    {s.routeOrComponent && <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{s.routeOrComponent}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(s.requiredAnyCapabilities || []).length === 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: '#F3F4F6', color: '#6B7280' }}>No capability gate</span>
                      ) : (
                        (s.requiredAnyCapabilities || []).map((cid) => (
                          <span key={cid} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(5,150,105,0.08)', color: '#047857' }}>{cid}</span>
                        ))
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSurfaceModal({ open: true, initial: s })} className="px-2.5 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>Edit</button>
                  <button type="button" onClick={() => removeSurface(s.id)} className="p-1.5 rounded-full" style={{ color: '#9AA3AF' }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'resources' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <p style={{ fontSize: 13, color: '#6B7280' }}>Protected resource types and fields usable in grant constraints.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {catalogue.resourceTypes.map((rt: ResourceType) => (
              <div key={rt.id} className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>{rt.label}</p>
                  <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>{rt.id}</code>
                </div>
                {rt.description && <p style={{ fontSize: 12.5, color: '#6B7280' }}>{rt.description}</p>}
                <div className="flex flex-wrap gap-1 mt-3">
                  {(rt.constraintFields || []).map((f) => (
                    <span key={f} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>{f}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {tab === 'samples' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <p style={{ fontSize: 13, color: '#6B7280' }}>Optional templates. Live Bridge roles are in access_policy documents (People & Roles / Nexus).</p>
          <div className="grid md:grid-cols-2 gap-3">
            {samples.map((r) => {
              const grant = r.grants[0];
              return (
                <div key={r.id} className="p-4 rounded-[22px]" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>{r.name}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#0B0F1A', color: 'white' }}>template</span>
                      </div>
                      <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 3 }}>{r.description}</p>
                      <p style={{ fontSize: 11, color: '#9AA3AF', marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>instance: {grant?.platformInstanceId}</p>
                    </div>
                    <button type="button" onClick={() => setRoleModal(r)} className="px-2.5 py-1.5 rounded-full text-[12px] font-semibold shrink-0" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>Edit</button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {(grant?.capabilityIds || []).slice(0, 5).map((cid) => (
                      <span key={cid} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(0,0,0,0.04)', color: '#374151' }}>{cid}</span>
                    ))}
                    {(grant?.capabilityIds?.length || 0) > 5 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(0,0,0,0.04)', color: '#9AA3AF' }}>+{(grant?.capabilityIds.length || 0) - 5}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {tab === 'json' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p style={{ fontSize: 13, color: '#6B7280' }}>Export matches <code>learning-platform-access-catalogue.v1.json</code> / <code>capability_catalogue</code>.</p>
            <button type="button" onClick={handleCopyJson} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full" style={{ background: '#0B0F1A', color: 'white', fontSize: 12.5, fontWeight: 600 }}>
              <Copy size={13} /> Copy JSON
            </button>
          </div>
          <pre className="p-5 rounded-[24px] overflow-auto text-[12px] leading-relaxed" style={{ background: '#0B0F1A', color: '#E5E7EB', maxHeight: '60vh' }}>{exportText}</pre>
        </motion.div>
      )}

      {tab === 'schema' && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p style={{ fontSize: 13, color: '#6B7280' }}>LAIC cross-platform schema (catalogue + access_policy).</p>
              <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>docs/laic-access-control.schema.json</p>
            </div>
            <button type="button" onClick={handleCopySchema} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full shrink-0" style={{ background: '#0B0F1A', color: 'white', fontSize: 12.5, fontWeight: 600 }}>
              <Copy size={13} /> Copy schema
            </button>
          </div>
          <pre className="p-5 rounded-[24px] overflow-auto text-[12px] leading-relaxed" style={{ background: '#0B0F1A', color: '#E5E7EB', maxHeight: '60vh' }}>{schemaText}</pre>
        </motion.div>
      )}

      <AnimatePresence>
        {capModal.open && (
          <CapabilityModal initial={capModal.initial} catalogue={catalogue} onClose={() => setCapModal({ open: false, initial: null })} onSave={upsertCapability} />
        )}
        {surfaceModal.open && (
          <SurfaceModal initial={surfaceModal.initial} catalogue={catalogue} onClose={() => setSurfaceModal({ open: false, initial: null })} onSave={upsertSurface} />
        )}
        {roleModal && (
          <SampleRoleModal
            initial={roleModal}
            catalogue={catalogue}
            onClose={() => setRoleModal(null)}
            onSave={(r) => {
              patch({
                ...catalogue,
                sampleRoleTemplates: samples.map((x) => (x.id === r.id ? r : x)),
              });
              fireToast('Sample role updated');
            }}
          />
        )}
      </AnimatePresence>

      <Toast message={toast} />
    </div>
  );
}
