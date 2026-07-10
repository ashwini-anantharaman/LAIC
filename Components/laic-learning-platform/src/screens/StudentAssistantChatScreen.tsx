import { useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useApp } from "../store/AppContext";
import { OwlAnim } from "../components/owlwise/primitives";
import { sf } from "../constants/studyFetchTheme";

/** Legacy route — Coach now lives in the collapsible right sidebar. */
export function StudentAssistantChatScreen() {
  const { courseId, setCoachPanelOpen } = useApp();

  useEffect(() => {
    setCoachPanelOpen(true);
  }, [setCoachPanelOpen]);

  if (!courseId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <OwlAnim className="w-20 h-20 mx-auto mb-4 object-contain opacity-60" />
        <p className="font-semibold text-gray-700 mb-2">Join a course to chat</p>
        <p className="text-sm text-gray-500">Open a classroom from My Sets to ask Coach about your materials.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto text-center py-20 px-6">
      <div
        className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style={{ backgroundColor: sf.blueLight, color: sf.blue }}
      >
        <MessageCircle size={28} />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Coach is in the sidebar</h1>
      <p className="text-sm text-gray-500 leading-relaxed">
        Use the <strong>Chat</strong> item in the left nav, or the Coach panel on the right, to ask questions about your
        course and current module.
      </p>
    </div>
  );
}
