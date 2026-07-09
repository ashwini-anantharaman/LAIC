import { useState } from "react";
import {
  CheckCircle2, Plus, MoreVertical, Glasses, UserPlus, ChevronDown,
  FileText, HelpCircle, Layers, Video, Sparkles, Copy, Pencil, Trash2,
} from "lucide-react";
import type { ContentBlock } from "../types";
import { useApp } from "../store/AppContext";
import { sf } from "../constants/studyFetchTheme";
import { AddToModuleModal, AddModuleModal } from "../components/studyfetch/CreateClassroomModal";
import { ADD_MATERIAL_ACTIONS } from "../lib/ui-actions";

type CourseTab = "modules" | "invite" | "assistant" | "progress" | "settings";

const BLOCK_META: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  Text: { icon: FileText, label: "Document", color: "#EF4444" },
  MCQ: { icon: HelpCircle, label: "Quiz", color: "#22C55E" },
  Test: { icon: HelpCircle, label: "Test", color: "#3B82F6" },
  Flashcard: { icon: Layers, label: "Flashcards", color: "#EAB308" },
  Animation: { icon: Sparkles, label: "Animation", color: "#8B5CF6" },
  Video: { icon: Video, label: "Video", color: "#06B6D4" },
};

function materialRow(block: ContentBlock) {
  const meta = BLOCK_META[block.type] ?? { icon: FileText, label: block.type, color: "#6B7280" };
  return {
    id: block.id,
    title: block.title || block.label,
    ...meta,
  };
}

export function InstructorCourseModulesScreen() {
  const {
    courseTitle,
    modules,
    ragSources,
    setScreen,
    openCourseEditor,
    coursePublished,
    setCreateStep,
    setCurrentModuleIndex,
    courseId,
    queueBuild,
    showToast,
    duplicateModule,
    removeModule,
  } = useApp();

  const [tab, setTab] = useState<CourseTab>("modules");
  const [showAddModule, setShowAddModule] = useState(false);
  const [addMaterialsFor, setAddMaterialsFor] = useState<number | null>(null);
  const [filter, setFilter] = useState("All Modules");
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const chapterLabel = modules[0]?.chapter || "General";
  const pdfSources = ragSources.filter((s) => s.type === "PDF");
  const chapterFilters = [
    "All Modules",
    ...Array.from(new Set(modules.map((m) => m.chapter).filter(Boolean) as string[])),
  ];
  const visibleModules =
    filter === "All Modules"
      ? modules
      : modules.filter((m) => m.chapter === filter);

  const tabs: { id: CourseTab; label: string }[] = [
    { id: "modules", label: "Modules" },
    { id: "invite", label: "Invite Students" },
    { id: "assistant", label: "AI Teaching Assistant" },
    { id: "progress", label: "Student Progress Tracking" },
    { id: "settings", label: "Settings" },
  ];

  const goEdit = (moduleIndex: number) => {
    setCurrentModuleIndex(moduleIndex);
    setCreateStep("build");
    setScreen("instructor-create");
  };

  const handleAddMaterial = (label: string) => {
    if (addMaterialsFor === null) return;
    const action = ADD_MATERIAL_ACTIONS[label];
    if (!action) {
      showToast(`"${label}" is not available yet.`);
      setAddMaterialsFor(null);
      return;
    }
    queueBuild({ moduleIndex: addMaterialsFor, action });
    setAddMaterialsFor(null);
    setScreen("instructor-create");
  };

  const handleCopyModule = async () => {
    if (modules.length === 0) {
      showToast("Create a module first, then copy it.");
      setCreateStep("structure");
      setScreen("instructor-create");
      return;
    }
    await duplicateModule(modules.length - 1);
    showToast("Module duplicated.");
  };

  const handleModuleMenu = async (action: "edit" | "duplicate" | "delete", idx: number) => {
    setMenuFor(null);
    if (action === "edit") {
      goEdit(idx);
      return;
    }
    if (action === "duplicate") {
      await duplicateModule(idx);
      showToast("Module duplicated.");
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Delete "${modules[idx]?.name}"? This cannot be undone.`)) return;
      await removeModule(idx);
      showToast("Module removed.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-xl font-bold text-gray-400">
            {chapterLabel[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{chapterLabel}</h1>
            <p className="text-sm text-gray-500">{courseTitle || "No description provided"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!courseId) {
                showToast("Open a classroom first to preview the student view.");
                return;
              }
              setScreen("instructor-preview");
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold text-gray-700 hover:bg-gray-50"
            style={{ borderColor: sf.border, color: sf.blue }}
          >
            <Glasses size={16} />
            View as Student
          </button>
          <button
            type="button"
            onClick={() => setScreen("instructor-challenge")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold text-purple-700 hover:bg-purple-50"
            style={{ borderColor: "#E9D5FF" }}
          >
            <UserPlus size={16} />
            Invite students
          </button>
        </div>
      </div>

      <div className="flex gap-6 border-b mb-6" style={{ borderColor: sf.border }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (t.id === "invite") setScreen("instructor-challenge");
              if (t.id === "progress") setScreen("instructor-dashboard");
              if (t.id === "settings") setScreen("instructor-settings");
              if (t.id === "assistant") openCourseEditor();
            }}
            className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "modules" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Modules</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFilterOpen((o) => !o)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border text-sm text-gray-600 bg-white"
                  style={{ borderColor: sf.border }}
                >
                  Filter by: {filter} <ChevronDown size={14} />
                </button>
                {filterOpen && (
                  <div
                    className="absolute right-0 mt-1 w-48 bg-white rounded-xl border shadow-lg z-20 py-1"
                    style={{ borderColor: sf.border }}
                  >
                    {chapterFilters.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => { setFilter(f); setFilterOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                          filter === f ? "font-semibold text-blue-600" : "text-gray-700"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAddModule(true)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: sf.blue }}
              >
                <Plus size={16} />
                Add Module
              </button>
            </div>
          </div>

          {visibleModules.length === 0 ? (
            <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: sf.border }}>
              <p className="font-semibold text-gray-700 mb-2">
                {modules.length === 0 ? "Create your first module" : "No modules match this filter"}
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {modules.length === 0
                  ? "Upload sources and generate AI lessons, or add modules manually."
                  : "Try a different chapter filter."}
              </p>
              {modules.length === 0 && (
                <button
                  type="button"
                  onClick={() => { setCreateStep("sources"); setScreen("instructor-create"); }}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: sf.blue }}
                >
                  Get started
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {visibleModules.map((mod) => {
                const idx = modules.findIndex((m) => m.id === mod.id);
                const rows = [
                  ...pdfSources.map((s) => ({
                    id: s.id,
                    title: s.name,
                    icon: FileText,
                    label: "Document",
                    color: "#EF4444",
                  })),
                  ...mod.blocks.map(materialRow),
                ];
                return (
                  <div key={mod.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: sf.border }}>
                    <div className="p-5 border-b" style={{ borderColor: sf.borderLight }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {mod.blocks.length > 0 && <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />}
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{mod.name}</h3>
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {mod.chapter ? `${mod.chapter} · ` : ""}
                              {mod.blocks.length} material{mod.blocks.length === 1 ? "" : "s"}
                              {coursePublished ? " · Published" : " · Draft"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => goEdit(idx)}
                            className="px-4 py-2 rounded-xl border text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            style={{ borderColor: sf.border }}
                          >
                            View Study Path
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddMaterialsFor(idx)}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1"
                            style={{ backgroundColor: sf.blue }}
                          >
                            <Plus size={14} />
                            Add Materials
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setMenuFor(menuFor === idx ? null : idx)}
                              className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg"
                            >
                              <MoreVertical size={18} />
                            </button>
                            {menuFor === idx && (
                              <div
                                className="absolute right-0 mt-1 w-44 bg-white rounded-xl border shadow-lg z-20 py-1"
                                style={{ borderColor: sf.border }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleModuleMenu("edit", idx)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Pencil size={14} /> Edit module
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleModuleMenu("duplicate", idx)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Copy size={14} /> Duplicate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleModuleMenu("delete", idx)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {rows.length > 0 && (
                      <ul className="divide-y" style={{ borderColor: sf.borderLight }}>
                        {rows.map((row) => (
                          <li key={row.id}>
                            <button
                              type="button"
                              onClick={() => goEdit(idx)}
                              className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
                            >
                              <row.icon size={20} style={{ color: row.color }} />
                              <span className="flex-1 text-sm font-medium text-gray-800 truncate">{row.title}</span>
                              <span className="text-xs text-gray-400">{row.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showAddModule && (
        <AddModuleModal
          onClose={() => setShowAddModule(false)}
          onCreateNew={() => { setCreateStep("structure"); setScreen("instructor-create"); }}
          onCopy={() => void handleCopyModule()}
        />
      )}
      {addMaterialsFor !== null && (
        <AddToModuleModal
          onClose={() => setAddMaterialsFor(null)}
          onSelect={handleAddMaterial}
        />
      )}
    </div>
  );
}
