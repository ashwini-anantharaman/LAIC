/**
 * Put this object into a folder of the PROGRAM's Content Library.
 *
 * Not the Studio's own folders. Those live in this browser
 * (objectCollectionsStore.ts) and are the author's filing system; these are the
 * shared library a content manager curates in Nexus, and filing something here is
 * how a tutorial reaches the people that library was shared with.
 *
 * WHY A NAVIGABLE TREE AND NOT A FLAT LIST. The whole point is choosing between
 * sibling subfolders — B2F3 › Puzzles vs B2F3 › Tutorials — and a flat list of
 * names cannot express that: two programs may both have a "Tutorials", and
 * indenting a list still leaves the person guessing which parent they are under.
 * Drilling in with a breadcrumb makes the destination unambiguous, which matters
 * because filing into the wrong folder shares content with the wrong people.
 *
 * ONLY FOLDERS THIS PERSON MAY SEE come back from the server, and the header says
 * so when the list is a confined one. A mentor given B2F3 sees B2F3 and its
 * subfolders; the refusal, if they contrive to send another id, names the folder
 * rather than returning a bare 403.
 *
 * SAVES THE WHOLE PROGRAM-FOLDER SET, and only that set — the author's own Studio
 * folders on this object are preserved server-side (migration 0012's
 * learning_apply_program_folders), so filing something into a shared folder never
 * rearranges anybody's private library.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Folder, Loader2, Users, X } from 'lucide-react';
import { motion } from 'motion/react';

import {
  listProgramFolders,
  setObjectProgramFolders,
  type ProgramFolder,
} from '../../../lib/nexus';

export function PublishToLibraryModal({
  objectId,
  objectTitle,
  /** The object's current folder ids, so already-filed destinations show ticked. */
  currentCollectionIds,
  onClose,
  onSaved,
}: {
  objectId: string;
  objectTitle: string;
  currentCollectionIds: string[];
  onClose: () => void;
  onSaved?: (names: string[]) => void;
}) {
  const [folders, setFolders] = useState<ProgramFolder[] | null>(null);
  const [confined, setConfined] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Where we are in the tree, as a path of folder ids. Empty = the top. */
  const [path, setPath] = useState<string[]>([]);
  /** The chosen destinations. An object can sit in more than one folder. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** True once the current filing has been read. Saving writes the whole set, so
   *  a failed read followed by a save would silently unfile the object. */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { folders: fs, confined: c } = await listProgramFolders();
        if (!live) return;
        setFolders(fs);
        setConfined(c);
        // Seed from what the object already carries, narrowed to folders that
        // actually exist here — a stale id from another program would otherwise
        // be sent back and 422.
        const known = new Set(fs.map((f) => f.id));
        setPicked(new Set(currentCollectionIds.filter((id) => known.has(id))));
        setLoaded(true);
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : "Couldn't read this program's folders");
      }
    })();
    return () => {
      live = false;
    };
  }, [currentCollectionIds]);

  const byId = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f])), [folders]);
  const here = path.length ? path[path.length - 1] : null;
  const children = useMemo(
    () => (folders ?? []).filter((f) => (f.parent_id ?? null) === here),
    [folders, here],
  );
  const trail = useMemo(
    () => path.map((id) => byId.get(id)).filter(Boolean) as ProgramFolder[],
    [path, byId],
  );
  /** Names of everything picked, wherever it sits, so the footer can say it. */
  const pickedNames = useMemo(
    () => [...picked].map((id) => byId.get(id)?.name).filter(Boolean) as string[],
    [picked, byId],
  );

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await setObjectProgramFolders(objectId, [...picked]);
      onSaved?.(res.collection_names ?? []);
      onClose();
    } catch (e) {
      // The server names the folder it refused; that is the difference between
      // "try a different folder" and "ask for access to this one".
      setError(e instanceof Error ? e.message : "Couldn't file that into the Content Library");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(11,18,32,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[28px] overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '85vh' }}
      >
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <div className="min-w-0">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>
              Publish to the Content Library
            </h3>
            <p className="truncate" style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>
              {objectTitle || 'Untitled'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} style={{ color: '#9AA3AF' }} />
          </button>
        </div>

        {confined && (
          <div
            className="px-5 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(2,132,199,0.07)', color: '#075985', fontSize: 12.5 }}
          >
            <Users size={13} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              <strong style={{ fontWeight: 650 }}>These are the folders shared with you.</strong>{' '}
              Content you file here becomes visible to everyone that folder was shared with.
            </span>
          </div>
        )}

        {/* Breadcrumb — the destination is only unambiguous with its parents. */}
        <div
          className="px-5 py-2.5 flex flex-wrap items-center gap-1 border-b"
          style={{ borderColor: 'rgba(0,0,0,0.07)', fontSize: 12.5 }}
        >
          <button
            type="button"
            onClick={() => setPath([])}
            style={{ color: trail.length ? '#6B7280' : '#0B1220', fontWeight: trail.length ? 400 : 650 }}
          >
            Library
          </button>
          {trail.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1">
              <ChevronRight size={12} style={{ color: '#C7CDD6' }} />
              <button
                type="button"
                onClick={() => setPath(path.slice(0, i + 1))}
                style={{
                  color: i === trail.length - 1 ? '#0B1220' : '#6B7280',
                  fontWeight: i === trail.length - 1 ? 650 : 400,
                }}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {loadError ? (
            <div className="py-6 text-center" style={{ fontSize: 13, color: '#B42318' }}>{loadError}</div>
          ) : folders === null ? (
            <div className="flex items-center gap-2 py-6 justify-center" style={{ color: '#9AA3AF', fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" /> Loading folders…
            </div>
          ) : children.length === 0 ? (
            <div className="py-6 text-center" style={{ fontSize: 13, color: '#9AA3AF' }}>
              {here
                ? 'No subfolders here. Tick this folder in the breadcrumb’s parent to file into it.'
                : confined
                  ? 'No folders have been shared with you yet. A content manager can share one.'
                  : 'This program has no library folders yet. They are made on the program’s Content Library tab.'}
            </div>
          ) : (
            <div className="space-y-1">
              {children.map((f) => {
                const on = picked.has(f.id);
                const kids = (folders ?? []).filter((x) => (x.parent_id ?? null) === f.id).length;
                return (
                  <div key={f.id} className="flex items-center gap-1">
                    {/* TICK chooses the destination; the NAME goes deeper. Two
                        separate targets, because conflating them makes a click to
                        look around into a click that changes where this lands. */}
                    <button
                      type="button"
                      onClick={() => f.reachable && toggle(f.id)}
                      disabled={!f.reachable}
                      aria-pressed={on}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-gray-50 disabled:cursor-default flex-1 min-w-0"
                      style={{ opacity: f.reachable ? 1 : 0.5 }}
                    >
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: on ? '#059669' : 'rgba(0,0,0,0.05)',
                          border: on ? 'none' : '1px solid rgba(0,0,0,0.12)',
                        }}
                      >
                        {on && <Check size={12} className="text-white" />}
                      </span>
                      <Folder size={14} style={{ color: '#9AA3AF' }} />
                      <span className="truncate flex-1" style={{ fontSize: 13, color: '#0B1220' }}>
                        {f.name}
                      </span>
                      {!f.reachable && (
                        <span style={{ fontSize: 11, color: '#9AA3AF' }}>on the way</span>
                      )}
                    </button>
                    {kids > 0 && (
                      <button
                        type="button"
                        onClick={() => setPath([...path, f.id])}
                        title={`Open ${f.name}`}
                        aria-label={`Open ${f.name}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-gray-100"
                      >
                        <ChevronRight size={14} style={{ color: '#9AA3AF' }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {error && (
            <p style={{ fontSize: 12.5, color: '#B42318', marginTop: 12 }}>{error}</p>
          )}
        </div>

        <div className="p-5 border-t flex items-center gap-3" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          {/* SAY WHERE IT WILL GO, by name, including folders chosen at another
              level and no longer on screen. Otherwise drilling in and out makes
              the pending choice invisible. */}
          <p className="flex-1 min-w-0" style={{ fontSize: 12, color: '#6B7280' }}>
            {pickedNames.length === 0
              ? 'Nothing selected — saving removes this from the Content Library.'
              : `Filing into ${pickedNames.join(', ')}.`}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl"
            style={{ fontSize: 13, color: '#6B7280' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !loaded}
            className="px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50"
            style={{ background: '#0B1220', color: 'white', fontSize: 13, fontWeight: 600 }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />} Publish
          </button>
        </div>
      </motion.div>
    </div>
  );
}
