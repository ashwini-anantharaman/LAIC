import { useMemo } from "react";
import {
  FileText, HelpCircle, Layers, Video, BookOpen, CheckCircle2, MessageCircle,
} from "lucide-react";
import type { ContentBlock } from "../../types";
import { useApp } from "../../store/AppContext";
import { blocksForConcept } from "../../lib/content-blocks";
import { sf } from "../../constants/studyFetchTheme";
import { OwlAnim } from "../../components/owlwise/primitives";
import { PREVIEW_LESSON_NAV } from "./lessonNavigation";

const BLOCK_ICONS: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  Text: { icon: FileText, color: "#EF4444", label: "Document" },
  MCQ: { icon: HelpCircle, color: "#22C55E", label: "Quiz" },
  Test: { icon: HelpCircle, color: "#3B82F6", label: "Test" },
  Flashcard: { icon: Layers, color: "#EAB308", label: "Flashcards" },
  Animation: { icon: Video, color: "#8B5CF6", label: "Animation" },
  Video: { icon: Video, color: "#06B6D4", label: "Video" },
};

function resourceRows(blocks: ContentBlock[]) {
  return blocks.map((b) => {
    const meta = BLOCK_ICONS[b.type] ?? { icon: BookOpen, color: "#6B7280", label: b.type };
    const title = b.title || b.label || b.type;
    return { id: b.id, title, ...meta };
  });
}

/** Instructor preview workspace — mirrors student workspace, uses preview lesson routes. */
export function PreviewWorkspaceContent() {
  const {
    courseTitle,
    concepts,
    modules,
    activeConceptId,
    setActiveConceptId,
    setScreen,
    ragSources,
    setLessonPanel,
    openStudentAssistant,
  } = useApp();

  const conceptIndex = concepts.findIndex((c) => c.id === activeConceptId);
  const concept = concepts.find((c) => c.id === activeConceptId) ?? concepts[0];
  const conceptBlocks = useMemo(
    () => (concept ? blocksForConcept(modules, concept.id, concept.name, conceptIndex) : []),
    [modules, concept, activeConceptId, conceptIndex]
  );

  const pdfSources = ragSources.filter((s) => s.type === "PDF" && s.status === "ready");

  const startLearning = (conceptId?: string) => {
    const id = conceptId ?? concept?.id;
    if (id) setActiveConceptId(id);
    setLessonPanel("split");
    setScreen(PREVIEW_LESSON_NAV.conceptScreen);
  };

  const openResource = (conceptId: string, label: string) => {
    setActiveConceptId(conceptId);
    if (label === "PDF") setLessonPanel("pdf");
    else if (label === "Document" || label === "Text") setLessonPanel("notes");
    else if (label === "Video") setLessonPanel("transcript");
    else setLessonPanel("split");
    setScreen(PREVIEW_LESSON_NAV.conceptScreen);
  };

  return (
    <>
      <div
        className="rounded-2xl px-5 py-3 flex items-center justify-between text-sm mb-6"
        style={{ backgroundColor: sf.blueBanner, color: sf.blue }}
      >
        <span>
          Preview workspace — <strong>{courseTitle}</strong>
        </span>
      </div>

      <div className="bg-white rounded-2xl border p-5 flex items-center gap-4 mb-6" style={{ borderColor: sf.border }}>
        <OwlAnim className="w-14 h-14 object-contain shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">Owlwise Assistant</p>
          <p className="text-sm text-gray-500">Students can ask questions about course modules and sources.</p>
        </div>
        <button
          type="button"
          onClick={openStudentAssistant}
          className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
          style={{ backgroundColor: sf.blue }}
        >
          <MessageCircle size={16} />
          Chat with Assistant
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Modules</h2>
        </div>

        {concepts.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center text-gray-500" style={{ borderColor: sf.border }}>
            Add modules to this course to preview the student experience.
          </div>
        ) : (
          <div className="space-y-4">
            {concepts.map((c, idx) => {
              const blocks = blocksForConcept(modules, c.id, c.name, idx);
              const moduleRows = [
                ...pdfSources.slice(0, idx === 0 ? pdfSources.length : 0).map((s) => ({
                  id: s.id,
                  title: s.name,
                  icon: FileText,
                  color: "#EF4444",
                  label: "PDF",
                })),
                ...resourceRows(blocks),
              ];
              return (
                <div key={c.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: sf.border }}>
                  <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: sf.borderLight }}>
                    <div className="flex items-center gap-2">
                      {blocks.length > 0 && <CheckCircle2 size={18} className="text-green-500" />}
                      <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => startLearning(c.id)}
                      className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
                      style={{ backgroundColor: sf.blue }}
                    >
                      Start Learning
                    </button>
                  </div>
                  {moduleRows.length > 0 ? (
                    <ul className="divide-y" style={{ borderColor: sf.borderLight }}>
                      {moduleRows.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => openResource(c.id, row.label)}
                            className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
                          >
                            <row.icon size={20} style={{ color: row.color }} />
                            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{row.title}</span>
                            <span className="text-xs text-gray-400 shrink-0">{row.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-4 text-sm text-gray-400">No materials yet for this module.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {concepts.length > 1 && (
        <div className="flex gap-2 flex-wrap mt-4">
          {concepts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveConceptId(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                c.id === concept?.id ? "text-white border-transparent" : "text-gray-600 bg-white"
              }`}
              style={c.id === concept?.id ? { backgroundColor: sf.blue } : { borderColor: sf.border }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
