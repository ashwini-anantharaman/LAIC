import {
  HelpCircle, MessageCircle, LayoutGrid,
  ChevronRight, Sparkles,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { sf } from "../constants/studyFetchTheme";

export function StudentHomeContent() {
  const {
    setScreen,
    concepts,
    courseId,
    openStudentLesson,
    openStudentAssistant,
    setStudentToolsTab,
    showToast,
  } = useApp();

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 min-w-0 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { icon: HelpCircle, label: "Create Quiz", color: "#8B5CF6", onClick: () => { if (!courseId) return showToast("Join a course first."); setStudentToolsTab("quizzes"); setScreen("student-tools"); } },
            { icon: MessageCircle, label: "Chat with Owl", color: "#06B6D4", onClick: () => openStudentAssistant() },
            { icon: LayoutGrid, label: "Practice Tools", color: "#EC4899", onClick: () => setScreen("student-tools") },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow flex items-center gap-3"
              style={{ borderColor: sf.border }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${action.color}18` }}
              >
                <action.icon size={20} style={{ color: action.color }} />
              </div>
              <span className="text-sm font-semibold text-gray-800">{action.label}</span>
            </button>
          ))}
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Activities</h2>
            <button type="button" onClick={() => setScreen("student-mastery")} className="text-sm font-semibold flex items-center gap-1" style={{ color: sf.blue }}>
              Study plan <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {concepts.slice(0, 6).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openStudentLesson(c.id)}
                className="shrink-0 w-56 bg-white rounded-2xl border overflow-hidden text-left hover:shadow-md transition-shadow"
                style={{ borderColor: sf.border }}
              >
                <div className="h-28 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                  <Sparkles size={28} className="text-blue-400" />
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-400">Lesson</p>
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                </div>
              </button>
            ))}
            {concepts.length === 0 && (
              <p className="text-sm text-gray-500">Activities appear once you join a course.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

