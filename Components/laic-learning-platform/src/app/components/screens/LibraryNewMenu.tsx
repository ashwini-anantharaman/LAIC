/**
 * The library's "New" menu — a folder, or content that lands in the folder you
 * are looking at.
 *
 * The button used to be "New folder" and nothing else, which made an open folder
 * a dead end: the way to put something in it was to leave, run Create, and trust
 * the filing rules to agree with your intention. Naming the destination while
 * looking at it is the shorter and more honest path.
 *
 * CONTENT CREATED FROM HERE IS PINNED TO THIS FOLDER. Ordinarily the type decides
 * where content is filed (libraryFiling.ts) — a fix for folders that happened to
 * be selected by accident. A choice made from inside a folder is not an accident,
 * so `setCreateCollectionIds(..., { pinned: true })` lets it win. Pinning is
 * one-shot, so the ordinary Create flow keeps filing by type.
 *
 * The type list is deliberately short: the handful of things someone files into a
 * folder, not every object type the platform can author. The full set still lives
 * on Create, which is where a decision about WHAT to make belongs.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderPlus, HelpCircle, Layers, Plus, ScrollText, Video } from 'lucide-react';

const CREATABLE: { type: string; label: string; icon: typeof HelpCircle }[] = [
  { type: 'tutorial-v3', label: 'Tutorial', icon: ScrollText },
  { type: 'quiz', label: 'Quiz', icon: HelpCircle },
  { type: 'flashcard-set', label: 'Flashcard set', icon: Layers },
  { type: 'video-script', label: 'Video script', icon: Video },
];

export function LibraryNewMenu({
  folderName,
  onNewFolder,
  onCreate,
  dark = false,
}: {
  /** The open folder's name, or null at the root. Decides the wording. */
  folderName: string | null;
  onNewFolder: () => void;
  /** Make one of these, filed into the open folder. */
  onCreate: (type: string) => void;
  /** The dark library header needs light-on-dark. */
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. A menu that stays open behind the next
  // thing you click is worse than one that needs a second press to reopen.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative shrink-0" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full"
        style={
          dark
            ? { background: 'rgba(255,255,255,0.12)', color: '#F8FAFC', fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.14)' }
            : { background: '#0B0F1A', color: '#fff', fontSize: 12.5, fontWeight: 600 }
        }
      >
        <Plus size={14} /> New <ChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-30 w-60 rounded-2xl p-1.5"
          style={{ background: '#fff', boxShadow: '0 16px 40px -12px rgba(30,50,80,0.3)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onNewFolder)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-gray-50"
            style={{ fontSize: 13, color: '#0B1220' }}
          >
            <FolderPlus size={15} style={{ color: '#6B7280' }} />
            {folderName ? 'New subfolder' : 'New folder'}
          </button>

          <div className="my-1.5 h-px" style={{ background: 'rgba(0,0,0,0.07)' }} />

          <p
            className="px-2.5 pb-1.5"
            style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9AA3AF' }}
          >
            {folderName ? `Create in “${folderName}”` : 'Create content'}
          </p>

          {CREATABLE.map((c) => (
            <button
              key={c.type}
              type="button"
              role="menuitem"
              onClick={() => pick(() => onCreate(c.type))}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-gray-50"
              style={{ fontSize: 13, color: '#0B1220' }}
            >
              <c.icon size={15} style={{ color: '#6B7280' }} />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
