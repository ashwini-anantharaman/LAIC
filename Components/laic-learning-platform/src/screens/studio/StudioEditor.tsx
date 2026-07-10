import { useEffect, useMemo, useState } from "react";
import type { ContentPolicy, ModuleImportance, StudioBlock, StudioCourseData, StudioPage, StudioTool, StudySource } from "../../learning/types";
import { newStudioBlock, PICKER_BLOCK_TYPES } from "../../learning/blocks/defaults";
import { linkBoldTermsInHtml, linkVocabInStudio, normalizeCardItem, normalizeVocabItem, syncStudioTools } from "../../learning/studio-vocab";
import {
  addBlockToPage,
  addPage,
  flattenScreens,
  getBlock,
  moveBlock,
  movePage,
  removeBlock,
  removePage,
  updateBlock,
  updatePage,
  type StudioScreenRef,
} from "../../learning/studio-state";
import { BlockStage, type StudioBlockPreviewState } from "./BlockStage";
import { StudioAssistant, type StudioAssistantFocus } from "./StudioAssistant";
import { StudioPublishModal } from "./StudioPublishModal";
import { StudioRightRail } from "./StudioRightRail";
import { StudioSuggestions, type SuggestionImage, type SuggestionVideo } from "./StudioSuggestions";
import { StudioToolDrawer } from "./StudioToolDrawer";
import { SourceQuoteDrawer } from "./SourceQuoteDrawer";
import { BLOCK_COLORS, BLOCK_LABELS } from "./studioTheme";
import "./studio.css";

const POLICY_LABEL: Record<ContentPolicy, string> = {
  strict: "Strict — source only",
  generate: "Generation allowed",
  open: "Open questions allowed",
};

type Props = {
  studio: StudioCourseData;
  courseId: string;
  courseTitle: string;
  initialPageIndex?: number;
  needsGeneration?: boolean;
  onStudioChange: (studio: StudioCourseData) => void;
  onPublish: () => void;
  onRegenerateFromSources?: () => void;
  onRestart: () => void;
  onExit: () => void;
};

function applyStudio(studio: StudioCourseData, patch: Partial<StudioCourseData>): StudioCourseData {
  return syncStudioTools({ ...studio, ...patch });
}

export function StudioEditor({
  studio,
  courseId,
  courseTitle,
  initialPageIndex = 0,
  needsGeneration = false,
  onStudioChange,
  onPublish,
  onRegenerateFromSources,
  onRestart,
  onExit,
}: Props) {
  const pages = studio.pages;
  const screens = useMemo(() => flattenScreens(pages), [pages]);
  const [pos, setPos] = useState(0);
  const [editMode, setEditMode] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 });
  const [pickerAfterIndex, setPickerAfterIndex] = useState<number | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [focus, setFocus] = useState<StudioAssistantFocus | null>(null);
  const [drawerTool, setDrawerTool] = useState<StudioTool | null>(null);
  const [highlightVocab, setHighlightVocab] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<StudioBlockPreviewState>({});
  const [sourceDrawer, setSourceDrawer] = useState<StudySource | null>(null);

  const current = screens[pos];
  const block = current ? getBlock(pages, current) : null;
  const pageIndex = current?.pageIndex ?? 0;
  const page = pages[pageIndex];

  useEffect(() => {
    if (pos >= screens.length) setPos(Math.max(0, screens.length - 1));
  }, [pos, screens.length]);

  useEffect(() => {
    const first = screens.findIndex((s) => s.pageIndex === initialPageIndex);
    if (first >= 0) setPos(first);
  }, [initialPageIndex, screens]);

  const commit = (next: StudioCourseData) => onStudioChange(linkVocabInStudio(next));

  const setPages = (next: StudioPage[]) => commit(applyStudio(studio, { pages: next }));

  const cyclePolicy = () => {
    const order: ContentPolicy[] = ["strict", "generate", "open"];
    const next = order[(order.indexOf(studio.policy) + 1) % order.length];
    commit({ ...studio, policy: next });
  };

  const switchPreview = (preview: boolean) => {
    setEditMode(!preview);
    setPreviewState({});
  };

  const updateBlockAt = (ref: StudioScreenRef, b: StudioBlock) => {
    let nextBlock = b;
    if (b.type === "study") {
      const linked = linkBoldTermsInHtml(b.html);
      if (linked !== b.html) nextBlock = { ...b, html: linked };
    }
    setPages(updateBlock(pages, ref, nextBlock));
  };

  const openPicker = (afterBlockIndex: number, anchor?: HTMLElement | null) => {
    setPickerAfterIndex(afterBlockIndex);
    const rect = anchor?.getBoundingClientRect() ?? document.querySelector(".studio-addblock")?.getBoundingClientRect();
    setPickerPos({ x: Math.min(rect?.left ?? 200, window.innerWidth - 320), y: (rect?.bottom ?? 300) + 8 });
    setPickerOpen(true);
  };

  const insertBlock = (type: (typeof PICKER_BLOCK_TYPES)[number]) => {
    const nb = newStudioBlock(type);
    const after = pickerAfterIndex ?? current?.blockIndex ?? page.blocks.length - 1;
    const nextPages = addBlockToPage(pages, pageIndex, nb, after);
    setPages(nextPages);
    setPickerOpen(false);
    const newScreens = flattenScreens(nextPages);
    const newPos = newScreens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === after + 1);
    if (newPos >= 0) setPos(newPos);
  };

  const openVocabDrawer = (term: string) => {
    const vocabTool = studio.tools.find((t) => t.kind === "vocab");
    if (vocabTool) {
      setDrawerTool(vocabTool);
      setHighlightVocab(term);
    }
  };

  const insertVideoEmbed = (video: SuggestionVideo) => {
    const after = current?.blockIndex ?? page.blocks.length - 1;
    const studyIndex = page.blocks.findIndex((b) => b.type === "study");
    const embed = `<p class="studio-video-embed">📺 Video — <b>${video.title}</b> <span class="studio-dim">(${video.source}${video.youtubeUrl ? ` · ${video.youtubeUrl}` : ""})</span></p>`;

    if (studyIndex >= 0) {
      const study = page.blocks[studyIndex];
      if (study.type !== "study") return;
      const ref = { pageIndex, blockIndex: studyIndex };
      updateBlockAt(ref, { ...study, html: study.html + embed });
      setPos(screens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === studyIndex));
      return;
    }

    const nb = newStudioBlock("study");
    if (nb.type !== "study") return;
    nb.kind = "Watch";
    nb.title = video.title;
    nb.html = embed;
    nb.src = { cite: video.source, page: 0 };
    const nextPages = addBlockToPage(pages, pageIndex, nb, after);
    setPages(nextPages);
    const newScreens = flattenScreens(nextPages);
    setPos(newScreens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === after + 1));
  };

  const insertImageBlock = (image: SuggestionImage) => {
    const after = current?.blockIndex ?? page.blocks.length - 1;
    const nb = newStudioBlock("image");
    if (nb.type !== "image") return;
    nb.src = image.imageUrl ?? null;
    nb.caption = `${image.title} · ${image.source}`;
    nb.alt = image.title;
    const nextPages = addBlockToPage(pages, pageIndex, nb, after);
    setPages(nextPages);
    const newScreens = flattenScreens(nextPages);
    setPos(newScreens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === after + 1));
  };

  const createAnimationFromImage = (image: SuggestionImage) => {
    const after = current?.blockIndex ?? page.blocks.length - 1;
    let animIndex = page.blocks.findIndex((b) => b.type === "animation");
    if (animIndex < 0) {
      const nb = newStudioBlock("animation");
      const nextPages = addBlockToPage(pages, pageIndex, nb, after);
      setPages(nextPages);
      animIndex = after + 1;
      const newScreens = flattenScreens(nextPages);
      setPos(newScreens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === animIndex));
      return;
    }
    const anim = page.blocks[animIndex];
    if (anim.type !== "animation") return;
    const step = { region: "cortex", head: image.title, text: image.why };
    updateBlockAt({ pageIndex, blockIndex: animIndex }, { ...anim, steps: [...anim.steps, step] });
    setPos(screens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === animIndex));
  };

  const handleToolChange = (tool: StudioTool) => {
    const tools = studio.tools.map((t) => (t.id === tool.id ? tool : t));
    let patch: Partial<StudioCourseData> = { tools };
    if (tool.kind === "vocab") {
      patch.vocab = tool.items.map((item, i) => normalizeVocabItem(item, i));
    }
    if (tool.kind === "cards") {
      patch.cards = tool.items.map(normalizeCardItem);
    }
    commit(applyStudio(studio, patch));
    setDrawerTool(tool);
  };

  const hint = block
    ? `${editMode ? "Editing" : "Preview"} · ${BLOCK_LABELS[block.type]} · page ${pageIndex + 1}`
    : "Add blocks to begin";

  return (
    <div className="studio-root">
      <header className="studio-bar">
        <div className="studio-brand">
          <span className="o">🦉</span> Owlwise <span className="studio-badge">Studio</span>
        </div>
        <span className="studio-sp" />
        <button type="button" className="studio-policy" onClick={cyclePolicy}>
          Policy: <b>{POLICY_LABEL[studio.policy]}</b>
        </button>
        <div className="studio-toggle">
          <button type="button" className={editMode ? "on" : ""} onClick={() => switchPreview(false)}>
            Edit
          </button>
          <button type="button" className={!editMode ? "on" : ""} onClick={() => switchPreview(true)}>
            Student preview
          </button>
        </div>
        <button type="button" className={`studio-tbtn${ideasOpen ? " on" : ""}`} onClick={() => setIdeasOpen((v) => !v)}>
          ✦ Ideas
        </button>
        <button type="button" className="studio-tbtn" onClick={onRestart}>
          ↺ Restart
        </button>
        <button type="button" className="studio-pubbtn" onClick={() => setPubOpen(true)}>
          Publish →
        </button>
      </header>

      {needsGeneration && onRegenerateFromSources && (
        <div className="studio-skeleton-banner">
          <div>
            <strong>Module titles only — content not generated yet</strong>
            <p>
              These pages are empty placeholders. Generate from your uploaded sources to fill in lessons,
              checks, quizzes, and cases.
            </p>
          </div>
          <button type="button" className="studio-btn primary" onClick={onRegenerateFromSources}>
            Generate from sources →
          </button>
        </div>
      )}

      <div className="studio-layout">
        <aside className="studio-rail">
          <h4>Pages</h4>
          {pages.map((p, i) => (
            <div
              key={p.id}
              className={`studio-pageitem${pageIndex === i ? " active" : ""}`}
              onClick={() => {
                const first = screens.findIndex((s) => s.pageIndex === i);
                if (first >= 0) setPos(first);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = screens.findIndex((s) => s.pageIndex === i);
                  if (first >= 0) setPos(first);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="studio-pi-top">
                <span className="studio-pi-n">{i + 1}</span>
                {pageIndex === i && editMode ? (
                  <input
                    className="studio-pi-t"
                    value={p.title}
                    onChange={(e) => setPages(updatePage(pages, i, { title: e.target.value }))}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="studio-pi-t">{p.title}</span>
                )}
                <span className={`studio-pi-imp studio-imp-${p.importance}`}>{p.importance}</span>
              </div>
              {editMode && (
                <div className="studio-pi-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <button type="button" className="studio-mini" disabled={i === 0} onClick={() => setPages(movePage(pages, i, i - 1))}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="studio-mini"
                    disabled={i >= pages.length - 1}
                    onClick={() => setPages(movePage(pages, i, i + 1))}
                  >
                    ↓
                  </button>
                  <select
                    className="studio-imp-select"
                    value={p.importance}
                    onChange={(e) => setPages(updatePage(pages, i, { importance: e.target.value as ModuleImportance }))}
                  >
                    <option value="core">Core</option>
                    <option value="featured">Featured</option>
                    <option value="optional">Optional</option>
                  </select>
                  <button type="button" className="studio-mini" disabled={pages.length <= 1} onClick={() => setPages(removePage(pages, i))}>
                    🗑
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            className="studio-addpage"
            onClick={() => {
              const next = addPage(pages);
              setPages(next);
              setPos(flattenScreens(next).length - 1);
            }}
          >
            + Add page
          </button>
        </aside>

        <div className="studio-work">
          <div className="studio-progress" style={{ width: screens.length ? `${((pos + 1) / screens.length) * 100}%` : "0%" }} />
          <div className="studio-stage">
            <div className="studio-wrap studio-fadein">
              {editMode && page ? (
                <div className="studio-page-blocks">
                  {page.blocks.map((pageBlock, blockIndex) => {
                    const ref = { pageIndex, blockIndex };
                    return (
                      <div
                        key={pageBlock.id}
                        className={`studio-block-wrap${current?.blockIndex === blockIndex ? " active" : ""}`}
                        onClick={() => {
                          const screenIndex = screens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === blockIndex);
                          if (screenIndex >= 0) setPos(screenIndex);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          const screenIndex = screens.findIndex((s) => s.pageIndex === pageIndex && s.blockIndex === blockIndex);
                          if (screenIndex >= 0) setPos(screenIndex);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <BlockStage
                          block={pageBlock}
                          edit
                          courseId={courseId}
                          onOpenSource={setSourceDrawer}
                          previewState={previewState}
                          onChange={(b) => updateBlockAt(ref, b)}
                          onDelete={() => {
                            setPages(removeBlock(pages, ref));
                            setPos((p) => Math.max(0, p - 1));
                          }}
                          onMoveUp={() => setPages(moveBlock(pages, ref, -1))}
                          onMoveDown={() => setPages(moveBlock(pages, ref, 1))}
                          onAddBlock={(e) => openPicker(blockIndex, e?.currentTarget as HTMLElement)}
                          onFocusField={(label, value) => setFocus({ label, value })}
                          onVocabClick={openVocabDrawer}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : block && current ? (
                <BlockStage
                  block={block}
                  edit={false}
                  courseId={courseId}
                  onOpenSource={setSourceDrawer}
                  previewState={previewState}
                  onPreviewStateChange={setPreviewState}
                  onChange={() => {}}
                  onDelete={() => {}}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
                  onVocabClick={openVocabDrawer}
                />
              ) : (
                <p className="studio-empty">No blocks yet.</p>
              )}
            </div>
          </div>
          <div className="studio-bottom">
            <span className="studio-hint">{hint}</span>
            <div className="studio-bottom-nav">
              <button type="button" className="studio-btn ghost" disabled={pos <= 0} onClick={() => setPos((p) => p - 1)}>
                Back
              </button>
              <button type="button" className="studio-btn primary" disabled={pos >= screens.length - 1} onClick={() => setPos((p) => p + 1)}>
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>

      <StudioRightRail
        tools={studio.tools}
        activeToolId={drawerTool?.id}
        onSelect={(t) => {
          setDrawerTool(t);
          setHighlightVocab(null);
        }}
        onAddTool={() => {
          const tool: StudioTool = { id: crypto.randomUUID(), kind: "custom", name: "New tool", items: [] };
          commit({ ...studio, tools: [...studio.tools, tool] });
          setDrawerTool(tool);
        }}
      />

      <StudioAssistant courseId={courseId} policy={studio.policy} focus={focus} onApply={() => {}} />

      <StudioSuggestions
        open={ideasOpen}
        editMode={editMode}
        courseId={courseId}
        policy={studio.policy}
        page={page}
        pageIndex={pageIndex}
        block={block}
        onClose={() => setIdeasOpen(false)}
        onInsertVideo={insertVideoEmbed}
        onInsertImage={insertImageBlock}
        onCreateAnimation={createAnimationFromImage}
      />

      {drawerTool && (
        <>
          <div className="studio-scrim show" onClick={() => setDrawerTool(null)} role="presentation" />
          <StudioToolDrawer
            open
            tool={drawerTool}
            courseId={courseId}
            policy={studio.policy}
            pageTitles={pages.map((p) => p.title)}
            highlightTerm={highlightVocab}
            onClose={() => {
              setDrawerTool(null);
              setHighlightVocab(null);
            }}
            onChange={handleToolChange}
            onDelete={() => {
              commit({ ...studio, tools: studio.tools.filter((t) => t.id !== drawerTool.id) });
              setDrawerTool(null);
            }}
          />
        </>
      )}

      <StudioPublishModal
        open={pubOpen}
        onOpenChange={setPubOpen}
        courseTitle={courseTitle}
        course={studio}
        onPublish={() => {
          setPubOpen(false);
          onPublish();
        }}
      />

      <SourceQuoteDrawer
        open={!!sourceDrawer}
        courseId={courseId}
        source={sourceDrawer}
        onClose={() => setSourceDrawer(null)}
      />

      {pickerOpen && (
        <>
          <div className="studio-scrim show" onClick={() => setPickerOpen(false)} role="presentation" />
          <div className="studio-picker" style={{ left: pickerPos.x, top: pickerPos.y }}>
            <h5>Add a block after this one</h5>
            <div className="studio-picker-grid">
              {PICKER_BLOCK_TYPES.map((type) => (
                <button key={type} type="button" className="studio-pk" onClick={() => insertBlock(type)}>
                  <span className="studio-pki" style={{ background: BLOCK_COLORS[type] }}>✦</span>
                  <span className="studio-pkt">{BLOCK_LABELS[type]}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <button type="button" className="studio-exit" onClick={onExit} style={{ display: "none" }}>
        ← Classrooms
      </button>
    </div>
  );
}
