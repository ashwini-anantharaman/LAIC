/**
 * "Insert from Bridge Library" picker (library ↔ LP intersection, Phase B).
 * Lists the bridge program's boards/deals/plays; the author inserts one as a
 * prefilled bridge block (snapshot with provenance — see lib/bridgeLibrary).
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  entryToBiddingSequence,
  entryToBridgePlay,
  fetchBridgeLibrary,
  type BridgeLibraryEntry,
} from '../../../lib/bridgeLibrary';
import type { BiddingSequenceContent, BridgePlayContent } from '../../../lib/types';

export function BridgeLibraryPicker({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (
    type: 'bridge-play' | 'bidding-sequence',
    content: BridgePlayContent | BiddingSequenceContent,
  ) => void;
}) {
  const [entries, setEntries] = useState<BridgeLibraryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchBridgeLibrary().then((list) => {
      if (live) setEntries(list);
    });
    return () => {
      live = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Insert from Bridge Library</p>
            <p className="text-xs text-slate-500">
              Boards from your program's bridge platform — inserted as a snapshot you can edit.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {entries === null && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {entries !== null && entries.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No boards in the program's bridge library yet — author some in the bridge platform
            first.
          </p>
        )}

        <div className="space-y-2">
          {(entries ?? []).map((entry) => {
            const hasAuction = (entry.auction?.length ?? 0) > 0;
            const hasHands = !!entry.hands;
            return (
              <div
                key={entry.entry_id}
                className="rounded-xl border border-slate-200 p-3"
              >
                <p className="text-sm font-medium text-slate-900">{entry.name ?? entry.entry_id}</p>
                <p className="text-xs text-slate-500">
                  {entry.kind}
                  {entry.dealer && ` · dealer ${entry.dealer}`}
                  {entry.vul && ` · vul ${entry.vul}`}
                  {entry.contract_label && ` · ${entry.contract_label}`}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={!hasHands}
                    onClick={() => onInsert('bridge-play', entryToBridgePlay(entry))}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-30"
                  >
                    Card-play puzzle
                  </button>
                  <button
                    type="button"
                    disabled={!hasAuction}
                    onClick={() => onInsert('bidding-sequence', entryToBiddingSequence(entry))}
                    title={hasAuction ? undefined : 'This entry has no recorded auction'}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-30"
                  >
                    Bidding walkthrough
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
