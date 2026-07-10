import { useApp } from "../../store/AppContext";

const CAT_MINI =
  "https://www.figma.com/api/mcp/asset/1c4b042f-5f60-4a66-8535-c70a89a43c8f";

export function FloatingAIButton() {
  const { setScreen, courseId } = useApp();

  return (
    <button
      type="button"
      onClick={() => courseId && setScreen("student-concept")}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-transform"
      aria-label="Open AI Tutor"
    >
      <img src={CAT_MINI} alt="" className="w-full h-full object-contain" />
    </button>
  );
}
