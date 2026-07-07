import { useEffect, useState } from "react";
import { ChevronRight, MessageSquare, FileText, Timer, X, Glasses } from "lucide-react";
import { sf } from "../../constants/studyFetchTheme";

export interface BreadcrumbItem {
  label: string;
  sub?: string;
  onClick?: () => void;
}

export function StudyFetchTopBar({
  breadcrumbs,
  userInitials,
  onDocuments,
  onUpgrade,
  onSwitchView,
  studentPreviewActive,
}: {
  breadcrumbs?: BreadcrumbItem[];
  userInitials: string;
  onDocuments?: () => void;
  onUpgrade?: () => void;
  onSwitchView?: () => void;
  studentPreviewActive?: boolean;
}) {
  const [minutesLeft, setMinutesLeft] = useState(() => {
    const saved = localStorage.getItem("owlwise-timer-end");
    if (!saved) return 25;
    const left = Math.ceil((Number(saved) - Date.now()) / 60000);
    return left > 0 ? left : 25;
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const saved = localStorage.getItem("owlwise-timer-end");
      if (!saved) return;
      const left = Math.ceil((Number(saved) - Date.now()) / 60000);
      setMinutesLeft(left > 0 ? left : 0);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const startTimer = () => {
    const end = Date.now() + 25 * 60 * 1000;
    localStorage.setItem("owlwise-timer-end", String(end));
    setMinutesLeft(25);
  };

  const sendFeedback = () => {
    if (!feedbackText.trim()) return;
    setFeedbackSent(true);
    setTimeout(() => {
      setFeedbackOpen(false);
      setFeedbackSent(false);
      setFeedbackText("");
    }, 1200);
  };

  return (
    <>
      <header
        className="shrink-0 flex items-center justify-between px-6 py-3 border-b bg-white"
        style={{ borderColor: sf.border }}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {breadcrumbs?.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
              <button
                type="button"
                onClick={crumb.onClick}
                className={`text-left min-w-0 ${crumb.onClick ? "hover:opacity-80" : "cursor-default"}`}
                disabled={!crumb.onClick}
              >
                <span className="text-sm font-semibold text-gray-900 truncate block">{crumb.label}</span>
                {crumb.sub && (
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">{crumb.sub}</span>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSwitchView && (
            <button
              type="button"
              onClick={onSwitchView}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${
                studentPreviewActive
                  ? "text-white border-transparent"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              style={
                studentPreviewActive
                  ? { backgroundColor: sf.blue }
                  : { borderColor: sf.border, backgroundColor: sf.blueLight, color: sf.blue }
              }
            >
              <Glasses size={14} />
              {studentPreviewActive ? "Exit student preview" : "Student preview"}
            </button>
          )}
          <button
            type="button"
            onClick={onUpgrade}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: sf.green }}
          >
            Upgrade
          </button>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border hover:bg-gray-50 flex items-center gap-1.5"
            style={{ borderColor: sf.border }}
          >
            <MessageSquare size={13} />
            Feedback
          </button>
          <button
            type="button"
            onClick={startTimer}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold text-gray-600 hover:bg-gray-50"
            style={{ borderColor: sf.border }}
            title="Click to start a 25-minute focus session"
          >
            <Timer size={13} />
            {minutesLeft}m
          </button>
          <button
            type="button"
            onClick={onDocuments}
            className="p-2 rounded-lg border hover:bg-gray-50"
            style={{ borderColor: sf.border }}
            aria-label="Open course workspace"
          >
            <FileText size={16} className="text-gray-500" />
          </button>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: "#F97316" }}
          >
            {userInitials}
          </div>
        </div>
      </header>

      {feedbackOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">Send feedback</h3>
              <button type="button" onClick={() => setFeedbackOpen(false)}><X size={18} /></button>
            </div>
            {feedbackSent ? (
              <p className="text-sm text-green-600 font-medium">Thanks — your feedback was recorded.</p>
            ) : (
              <>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={4}
                  placeholder="What can we improve?"
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:border-blue-500 resize-none mb-3"
                  style={{ borderColor: sf.border }}
                />
                <button
                  type="button"
                  onClick={sendFeedback}
                  disabled={!feedbackText.trim()}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                  style={{ backgroundColor: sf.blue }}
                >
                  Submit
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
