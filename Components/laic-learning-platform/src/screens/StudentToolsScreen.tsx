import { HelpCircle, FileText, BookMarked, Music, StickyNote, Lock, ChevronRight } from "lucide-react";
import { useApp } from "../store/AppContext";
import { sf } from "../constants/studyFetchTheme";
import { collectToolItems, type StudentToolsTab } from "../lib/ui-actions";

const TOOLS: { id: StudentToolsTab; icon: typeof HelpCircle; label: string; desc: string }[] = [
  { id: "quizzes", icon: HelpCircle, label: "View Quizzes", desc: "Practice questions across units" },
  { id: "tests", icon: FileText, label: "View Tests", desc: "Longer assessments across units" },
  { id: "flashcards", icon: BookMarked, label: "View Flashcards", desc: "Key terms compiled by unit" },
  { id: "audio", icon: Music, label: "Audio & Video", desc: "Clips with transcripts" },
  { id: "notes", icon: StickyNote, label: "Notes", desc: "AI-generated summary notes per unit" },
];

export function StudentToolsScreen() {
  const {
    concepts,
    learner,
    modules,
    studentToolsTab,
    setStudentToolsTab,
    openStudentLesson,
    setScreen,
    showToast,
    courseId,
  } = useApp();

  const reachedUnits = concepts.filter((c) => {
    const m = learner.conceptMastery[c.id] ?? "not-seen";
    return m !== "not-seen";
  }).length;

  const items = collectToolItems(modules, concepts, learner.conceptMastery, studentToolsTab);
  const activeTool = TOOLS.find((t) => t.id === studentToolsTab) ?? TOOLS[0];

  const openItem = (conceptId: string, locked: boolean) => {
    if (locked) {
      showToast("Complete earlier units in the lesson path to unlock this.");
      return;
    }
    openStudentLesson(conceptId);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-sm text-gray-500 font-medium mb-5">
        Practice tools · {reachedUnits}/{concepts.length} units unlocked
      </p>

      <div className="flex gap-2 flex-wrap mb-6">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => setStudentToolsTab(tool.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              studentToolsTab === tool.id ? "text-white border-transparent" : "text-gray-600 bg-white"
            }`}
            style={
              studentToolsTab === tool.id
                ? { backgroundColor: sf.blue }
                : { borderColor: sf.border }
            }
          >
            {tool.label.replace("View ", "")}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border mb-4 p-5" style={{ borderColor: sf.border }}>
        <div className="flex items-center gap-3 mb-4">
          <activeTool.icon size={22} style={{ color: sf.blue }} />
          <div>
            <p className="font-bold text-gray-900">{activeTool.label}</p>
            <p className="text-xs text-gray-500">{activeTool.desc}</p>
          </div>
        </div>

        {!courseId ? (
          <p className="text-sm text-gray-500">Join a course to see {activeTool.label.toLowerCase()}.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No {activeTool.label.toLowerCase()} in this course yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: sf.borderLight }}>
            {items.map(({ conceptId, conceptName, block, locked }) => (
              <li key={block.id || `${conceptId}-${block.type}`}>
                <button
                  type="button"
                  onClick={() => openItem(conceptId, locked)}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-50 rounded-lg px-2 disabled:opacity-60"
                >
                  {locked ? <Lock size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{block.title || block.label}</p>
                    <p className="text-xs text-gray-400">{conceptName}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{block.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setScreen(courseId ? "student-workspace" : "student-sets")}
        className="text-sm font-semibold hover:underline"
        style={{ color: sf.blue }}
      >
        ← Back to {courseId ? "workspace" : "my sets"}
      </button>
    </div>
  );
}
