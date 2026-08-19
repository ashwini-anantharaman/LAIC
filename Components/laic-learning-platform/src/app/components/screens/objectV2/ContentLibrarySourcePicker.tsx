/**
 * Pick a tutorial from the Content Library to build a new object from.
 *
 * Two steps, because a tutorial is not a PDF. Step one is the same list any
 * picker shows. Step two is the part that matters: the tutorial's own outline,
 * with a checkbox on every section, because "test sections 2 and 4" is what an
 * author actually wants and it is the one thing a flat document cannot offer.
 *
 * The word count beside each section is not decoration — it is the only signal
 * in the dialog for whether a section holds enough to generate from, and it is
 * why a section of two sentences does not get silently picked alongside one of
 * two hundred.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, Search, X } from 'lucide-react';
import {
  CONTENT_SOURCE_TYPES,
  sectionsFromObject,
  type ContentSection,
  type PickedContentSource,
} from '../../../../lib/contentAsSource';
import { listEmbeddableLibraryObjects, type LibraryObjectChoice } from '../../../../lib/tutorialV3/tutorialTemplates';
import { findLibraryLearningObject } from '../../../../lib/libraryEmbed';
import type { LearningObject, ObjectType } from '../../../../lib/types';

const SAGE = '#4d7c5a';
const SAGE_BORDER = 'rgba(77,124,90,0.45)';

const TYPE_LABEL: Record<string, string> = {
  'tutorial-v3': 'Tutorial',
  'tutorial-v2': 'Tutorial',
  tutorial: 'Tutorial',
  lesson: 'Lesson',
  course: 'Course',
};

export function ContentLibrarySourcePicker({
  open,
  onClose,
  onConfirm,
  createdObjects = [],
  initialObjectId,
  initialSectionIds,
  noun = 'quiz',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (source: PickedContentSource) => void;
  createdObjects?: LearningObject[];
  /** Reopening for a source already chosen — go straight to its outline. */
  initialObjectId?: string;
  initialSectionIds?: string[];
  /** What is being built — the dialog says so, since this is source material. */
  noun?: string;
}) {
  const [rows, setRows] = useState<LibraryObjectChoice[] | null>(null);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<{
    obj: LearningObject;
    sections: ContentSection[];
    versionId?: string;
  } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setRows(null);
    void listEmbeddableLibraryObjects({
      types: CONTENT_SOURCE_TYPES as unknown as ObjectType[],
      extraObjects: createdObjects,
    })
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]));
    return () => { live = false; };
    // createdObjects is a fresh array each render; the id list is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, createdObjects.length]);

  /*
    Opening for a source already in use goes straight to its outline — the
    reason to reopen is nearly always "change which sections", and making an
    author find the same tutorial again first is a step for nothing.
  */
  useEffect(() => {
    if (!open) { setChosen(null); setPicked([]); setSearch(''); setReadError(null); return; }
    if (!initialObjectId || !rows) return;
    const row = rows.find((r) => r.id === initialObjectId);
    if (!row) return;
    const obj = findLibraryLearningObject(row.id, createdObjects);
    if (!obj) return;
    const sections = sectionsFromObject(obj);
    if (!sections.length) return;
    const live = row.versions?.find((v) => v.isLive) || row.versions?.[row.versions.length - 1];
    setChosen({ obj, sections, versionId: live?.versionId });
    setPicked(initialSectionIds?.length
      ? sections.filter((sec) => initialSectionIds.includes(sec.id)).map((sec) => sec.id)
      : sections.map((sec) => sec.id));
    // Runs when the dialog opens and once the library has been read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows, initialObjectId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = rows || [];
    return q ? all.filter((r) => r.title.toLowerCase().includes(q)) : all;
  }, [rows, search]);

  if (!open) return null;

  const choose = (row: LibraryObjectChoice) => {
    const obj = findLibraryLearningObject(row.id, createdObjects);
    if (!obj) {
      setReadError('That content could not be read from the library.');
      return;
    }
    const sections = sectionsFromObject(obj);
    if (!sections.length) {
      setReadError(`“${obj.title}” has no prose to build from — it may be all questions, or not generated yet.`);
      return;
    }
    setReadError(null);
    // The live version, so a quiz can later be told the tutorial has moved on.
    const live = row.versions?.find((v) => v.isLive) || row.versions?.[row.versions.length - 1];
    setChosen({ obj, sections, versionId: live?.versionId });
    // Everything is picked to begin with: the common case is the whole
    // tutorial, and an empty selection would make Continue look broken.
    setPicked(sections.map((s) => s.id));
  };

  const confirm = () => {
    if (!chosen) return;
    onConfirm({
      objectId: chosen.obj.id,
      title: chosen.obj.title,
      type: String(chosen.obj.type),
      versionId: chosen.versionId,
      sections: chosen.sections,
      // All-picked is stored as "all", so a section added to the tutorial later
      // is included rather than silently left out of a quiz that meant everything.
      pickedSectionIds: picked.length === chosen.sections.length ? [] : picked,
    });
    onClose();
  };

  const pickedWords = chosen
    ? chosen.sections.filter((s) => picked.includes(s.id)).reduce((n, s) => n + s.words, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose content to build from"
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', maxHeight: 'min(680px, 90vh)', boxShadow: '0 30px 80px -30px rgba(15,23,42,0.5)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <div className="min-w-0">
            <p style={{ fontSize: 15, fontWeight: 750, color: '#0B1220' }}>
              {chosen ? chosen.obj.title : `Build this ${noun} from existing content`}
            </p>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 3, lineHeight: 1.45 }}>
              {chosen
                ? 'Choose the sections to draw on. The rest of the tutorial is ignored.'
                : 'The tutorial becomes the source material — already curated, so there is nothing to mark up again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5"
          >
            <X size={16} style={{ color: '#6B7280' }} />
          </button>
        </div>

        {readError && (
          <p className="px-5 py-2" style={{ fontSize: 12.5, color: '#B91C1C' }}>{readError}</p>
        )}

        {!chosen ? (
          <>
            <div className="px-5 py-3 shrink-0">
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                <Search size={14} style={{ color: '#9AA3AF' }} />
                <input
                  className="flex-1 min-w-0 outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tutorials"
                  style={{ fontSize: 13.5 }}
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-2">
              {!rows && (
                <p className="inline-flex items-center gap-2 py-6" style={{ fontSize: 13, color: '#6B7280' }}>
                  <Loader2 size={14} className="animate-spin" /> Reading the library…
                </p>
              )}
              {rows && !visible.length && (
                <p className="py-6" style={{ fontSize: 13.5, color: '#6B7280' }}>
                  {search ? 'Nothing matches that.' : 'No tutorials in the library yet.'}
                </p>
              )}
              {visible.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => choose(row)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-black/[0.02]"
                  style={{ border: '1px solid rgba(0,0,0,0.08)' }}
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(77,124,90,0.1)', color: SAGE }}
                  >
                    <BookOpen size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>
                      {row.title}
                    </span>
                    <span style={{ fontSize: 12, color: '#9AA3AF' }}>
                      {TYPE_LABEL[String(row.type)] || String(row.type)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
              {chosen.sections.map((sec, i) => {
                const on = picked.includes(sec.id);
                return (
                  <label
                    key={sec.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                    style={{
                      border: `1px solid ${on ? SAGE_BORDER : 'rgba(0,0,0,0.08)'}`,
                      background: on ? 'rgba(77,124,90,0.06)' : '#fff',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setPicked((prev) => (
                        prev.includes(sec.id) ? prev.filter((x) => x !== sec.id) : [...prev, sec.id]
                      ))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>
                        {i + 1}. {sec.title}
                      </span>
                      <span style={{ fontSize: 12, color: '#9AA3AF' }}>
                        {sec.words} words
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="px-5 pb-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPicked(chosen.sections.map((s) => s.id))}
                  className="px-3 py-1.5 rounded-full border"
                  style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setPicked([])}
                  className="px-3 py-1.5 rounded-full border"
                  style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => { setChosen(null); setPicked([]); }}
                  className="px-3 py-1.5 rounded-full border"
                  style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
                >
                  ← Different tutorial
                </button>
              </div>
            </div>
          </>
        )}

        <div
          className="flex items-center justify-between gap-3 px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid rgba(0,0,0,0.07)', background: 'rgba(250,250,249,0.9)' }}
        >
          <p style={{ fontSize: 12.5, color: '#6B7280' }}>
            {chosen
              ? `${picked.length} of ${chosen.sections.length} sections · ~${pickedWords} words`
              : 'Pick a tutorial to see its sections'}
          </p>
          <button
            type="button"
            disabled={!chosen || !picked.length}
            onClick={confirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 13, fontWeight: 650, background: SAGE }}
          >
            <Check size={14} /> Use as source
          </button>
        </div>
      </div>
    </div>
  );
}
