/**
 * Where in my drive should this go?
 *
 * Shown when somebody authoring inside their own drive presses Submit. The
 * ordinary Submit menu offers a review queue and version targets — Studio things
 * a drive author is not doing. What they ARE deciding is which of their own
 * folders this belongs in, or whether to make a new one for it.
 *
 * Deliberately small and phone-shaped: a list, a text field, two buttons. It
 * renders inside a WebView on a handset, where a desktop modal runs off the
 * screen.
 */
import { useEffect, useState } from 'react';
import { Check, FolderPlus, Loader2, X } from 'lucide-react';

import { createMyDriveFolder, listMyDriveFolders } from '../../lib/nexus';

export function DriveSavePicker({
  driveId,
  driveName,
  busy,
  onCancel,
  onChoose,
}: {
  driveId: string;
  driveName: string;
  busy?: boolean;
  onCancel: () => void;
  /** The folder to file into. */
  onChoose: (collectionId: string, collectionName: string) => void;
}) {
  const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(null);
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listMyDriveFolders(driveId)
      // The drive ROOT is not a destination — content lives in a folder, and
      // offering the root would create a pile beside the folders.
      .then((f) => setFolders(f.filter((x) => x.id !== driveId)))
      .catch(() => setFolders([]));

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [driveId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-md flex flex-col"
        style={{
          background: '#fff',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 15, fontWeight: 750, color: '#0B1220' }}>Save to a folder</p>
            <p style={{ fontSize: 12.5, color: '#6B7280' }}>in {driveName}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="p-1">
            <X size={18} style={{ color: '#6B7280' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {folders === null ? (
            <p className="flex items-center gap-2" style={{ fontSize: 13.5, color: '#6B7280' }}>
              <Loader2 size={14} className="animate-spin" /> Reading your folders…
            </p>
          ) : (
            <>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onChoose(f.id, f.name)}
                  className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left"
                  style={{ border: '1px solid rgba(0,0,0,0.08)', marginBottom: 8, background: '#fff' }}
                >
                  <Check size={15} style={{ color: '#059669', opacity: 0 }} />
                  <span style={{ fontSize: 14.5, color: '#0B1220', fontWeight: 600 }}>{f.name}</span>
                </button>
              ))}

              {making ? (
                <div style={{ marginTop: 4 }}>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Folder name"
                    className="w-full px-3 py-2.5 rounded-xl"
                    style={{ border: '1px solid rgba(0,0,0,0.14)', fontSize: 14.5 }}
                  />
                  <div className="flex gap-2" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      disabled={!newName.trim() || busy}
                      onClick={() => {
                        void (async () => {
                          setError(null);
                          try {
                            const f = await createMyDriveFolder(newName.trim());
                            await load();
                            onChoose(f.id, f.name);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Couldn't make that folder");
                          }
                        })();
                      }}
                      className="px-4 py-2 rounded-full"
                      style={{ background: '#0B0F1A', color: '#fff', fontSize: 13.5, fontWeight: 650 }}
                    >
                      Create &amp; save here
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMaking(false); setNewName(''); }}
                      className="px-4 py-2 rounded-full"
                      style={{ border: '1px solid rgba(0,0,0,0.12)', fontSize: 13.5 }}
                    >
                      Cancel
                    </button>
                  </div>
                  {error && <p style={{ fontSize: 12.5, color: '#B42318', marginTop: 6 }}>{error}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMaking(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left"
                  style={{ border: '1px dashed rgba(0,0,0,0.18)', color: '#374151' }}
                >
                  <FolderPlus size={16} />
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>New folder…</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
