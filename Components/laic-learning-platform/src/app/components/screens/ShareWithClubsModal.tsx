/**
 * "Who can see this?" — one object, a checklist of clubs, and the target app.
 *
 * The gesture is a file-sharing dialog's, but the SEMANTICS are deliberately not.
 * Ticking a club GRANTS access; unticking REVOKES that grant. Neither one takes
 * away access a club already has by another route — its own authorship, or the
 * parent program's curriculum — and the footer says so, because a manager who
 * unticks every box and expects the object to go dark would otherwise be wrong
 * in a way nothing on screen corrected. See migration 0006 for why the widening
 * semantics were chosen over the file-sharing ones.
 *
 * Saves the WHOLE set in one PUT rather than a call per toggle: the server
 * reconciles, so two managers editing at once cannot interleave into a state
 * neither picked.
 */
import { useEffect, useState } from 'react';
import { Check, Loader2, Users, X } from 'lucide-react';
import { motion } from 'motion/react';

import {
  listClubs,
  listObjectShares,
  setObjectShares,
  listObjectAppTargets,
  setObjectAppTargets,
  type ClubSummary,
} from '../../../lib/nexus';

/** Mirrors CONTENT_APP_TARGETS on the server, which 422s anything it doesn't know. */
const APP_TARGETS: { key: string; label: string }[] = [{ key: 'clubapp', label: 'Bridge Bird' }];

export function ShareWithClubsModal({
  objectId,
  objectTitle,
  canShare,
  canTargetApp,
  onClose,
}: {
  objectId: string;
  objectTitle: string;
  /** learning.library.share_club — without it the checklist is read-only. */
  canShare: boolean;
  /** learning.publish.app_target — without it the app row is hidden entirely. */
  canTargetApp: boolean;
  onClose: () => void;
}) {
  const [clubs, setClubs] = useState<ClubSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [appKeys, setAppKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Could the current grants be read at all? Saving writes the WHOLE set, so a
  // failed read followed by a save is a silent revoke-everything. Until this is
  // true the checklist is not trustworthy and Save stays disabled.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [all, shares, targets] = await Promise.all([
          listClubs(),
          listObjectShares(objectId),
          canTargetApp ? listObjectAppTargets(objectId) : Promise.resolve([]),
        ]);
        if (!live) return;
        setClubs(all);
        setSelected(new Set(shares.map((s) => s.club_program_id)));
        setAppKeys(new Set(targets.filter((t) => t.published_at).map((t) => t.app_key)));
        setLoaded(true);
      } catch (e) {
        // Show the clubs (so the panel is not just a dead spinner) but refuse to
        // save from a state we could not read.
        if (!live) return;
        setClubs(await listClubs().catch(() => []));
        setError(
          e instanceof Error
            ? `${e.message} — nothing can be changed until this loads.`
            : "Couldn't read the current sharing — nothing can be changed until this loads.",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [objectId, canTargetApp]);

  const toggle = (id: string) => {
    if (!canShare) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setObjectShares(objectId, [...selected]);
      if (canTargetApp) await setObjectAppTargets(objectId, [...appKeys]);
      onClose();
    } catch (e) {
      // The server's own words: 503 (migration not run) and 422 (not a club of
      // this program) send someone to different places, and "save failed" sends
      // them to neither.
      setError(e instanceof Error ? e.message : "Couldn't update sharing");
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
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Share with clubs</h3>
            <p className="truncate" style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 2 }}>
              {objectTitle || 'Untitled'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} style={{ color: '#9AA3AF' }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {clubs === null ? (
            <div className="flex items-center gap-2 py-6 justify-center" style={{ color: '#9AA3AF', fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" /> Loading clubs…
            </div>
          ) : clubs.length === 0 ? (
            <div className="py-6 text-center" style={{ fontSize: 13, color: '#9AA3AF' }}>
              This program has no clubs yet. Add one on the program's Partners tab.
            </div>
          ) : (
            <div className="space-y-1">
              {clubs.map((club) => {
                const on = selected.has(club.id);
                return (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => toggle(club.id)}
                    disabled={!canShare}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-gray-50 disabled:cursor-default"
                    style={{ opacity: canShare ? 1 : 0.75 }}
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
                    <Users size={14} style={{ color: '#9AA3AF' }} />
                    <span className="truncate flex-1" style={{ fontSize: 13, color: '#0B1220' }}>
                      {club.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {canTargetApp && (
            <div className="pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <p
                style={{
                  fontSize: 11.5, fontWeight: 700, color: '#9AA3AF',
                  letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8,
                }}
              >
                Publish to app
              </p>
              <div className="flex flex-wrap gap-2">
                {APP_TARGETS.map((app) => {
                  const on = appKeys.has(app.key);
                  return (
                    <button
                      key={app.key}
                      type="button"
                      onClick={() =>
                        setAppKeys((prev) => {
                          const next = new Set(prev);
                          next.has(app.key) ? next.delete(app.key) : next.add(app.key);
                          return next;
                        })
                      }
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
                      {app.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p
              className="rounded-xl px-3 py-2"
              style={{ fontSize: 12.5, color: '#B45309', background: 'rgba(217,119,6,0.1)' }}
            >
              {error}
            </p>
          )}

          {/* The honest footnote. Ticking widens; unticking removes only THIS
              grant. A club that authored the object, or reads it as its parent's
              curriculum, keeps it either way — and someone unticking every box
              to "make it private" needs to know that before they save. */}
          <p style={{ fontSize: 11.5, color: '#9AA3AF', lineHeight: 1.5 }}>
            Sharing adds access. A club that already sees this content — because it
            authored it, or because it comes from the parent program — keeps it
            whether or not it is ticked here.
          </p>
        </div>

        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}
          >
            {canShare ? 'Cancel' : 'Close'}
          </button>
          {canShare && (
            <button
              type="button"
              disabled={saving || clubs === null || !loaded}
              onClick={() => void save()}
              className="flex-1 py-2.5 rounded-full flex items-center justify-center gap-1.5"
              style={{
                background: saving || !loaded ? '#E5E7EB' : '#0B0F1A',
                color: saving || !loaded ? '#9AA3AF' : '#fff',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
