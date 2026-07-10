import { useEffect, useRef, useState } from "react";
import { MessageCircle, PanelRightClose, PanelRightOpen, Send } from "lucide-react";
import { useApp } from "../../store/AppContext";
import { Agents } from "../../agents";
import { sf } from "../../constants/studyFetchTheme";
import { OwlAnim } from "../owlwise/primitives";
import { AssistantMessageBody } from "../../lib/assistant-message";

type ChatMessage = { role: "user" | "assistant"; content: string };

const COURSE_WIDE = "__course__";

export function StudentCoachPanel() {
  const {
    coachPanelOpen,
    setCoachPanelOpen,
    courseId,
    courseTitle,
    concepts,
    lessonCoachFocus,
    learner,
    ragSources,
  } = useApp();

  const scope = lessonCoachFocus?.conceptId || COURSE_WIDE;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef<string | null>(null);

  const contentMode = learner.defaultMode;
  const readySources = ragSources.filter((s) => s.status === "ready").length;
  const conceptName =
    scope === COURSE_WIDE
      ? lessonCoachFocus?.conceptName ?? "Course materials"
      : (concepts.find((c) => c.id === scope)?.name ?? lessonCoachFocus?.conceptName ?? "Course materials");
  const conceptId = scope === COURSE_WIDE ? "" : scope;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, coachPanelOpen]);

  useEffect(() => {
    const key = `${courseId ?? ""}:${scope}`;
    if (greetedRef.current === key) return;
    greetedRef.current = key;
    setMessages([]);
    if (!courseId) return;
    Agents.studentAssistant
      .getGreeting({ conceptId, conceptName, mode: contentMode, onQuiz: false })
      .then((greeting) => setMessages([{ role: "assistant", content: greeting }]))
      .catch(() =>
        setMessages([
          {
            role: "assistant",
            content:
              lessonCoachFocus?.conceptName
                ? `Hi! Ask me anything about **${lessonCoachFocus.conceptName}** — I'm grounded in your course materials.`
                : "Hi! I'm Owlwise Coach. Ask me anything about your course materials.",
          },
        ])
      );
  }, [courseId, conceptId, conceptName, contentMode, lessonCoachFocus?.conceptName, scope]);

  const send = async () => {
    if (!input.trim() || busy || !courseId) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setBusy(true);
    try {
      const reply = await Agents.studentAssistant.respond(
        msg,
        { conceptId, conceptName, mode: contentMode, onQuiz: false },
        courseId,
        learner.reflections.map((r) => r.answers.join(" "))
      );
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't reach the coach right now. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!coachPanelOpen) {
    return (
      <aside
        className="shrink-0 flex flex-col items-center border-l py-3 gap-2 bg-white"
        style={{ width: 48, borderColor: sf.border }}
      >
        <button
          type="button"
          onClick={() => setCoachPanelOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"
          title="Open Coach chat"
          aria-label="Open Coach chat"
        >
          <MessageCircle size={20} style={{ color: sf.blue }} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="shrink-0 flex flex-col border-l bg-white min-h-0"
      style={{ width: 360, borderColor: sf.border }}
      aria-label="Coach chat"
    >
      <div className="shrink-0 px-3 py-3 border-b flex items-start gap-2" style={{ borderColor: sf.border }}>
        <OwlAnim className="w-9 h-9 object-contain shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900">Coach</div>
          <div className="text-xs text-gray-500 truncate">
            {courseTitle || "Your course"}
            {lessonCoachFocus?.conceptName ? ` · ${lessonCoachFocus.conceptName}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCoachPanelOpen(false)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
          aria-label="Collapse Coach chat"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {!courseId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-sm text-gray-500">
          <PanelRightOpen size={28} className="mb-2 opacity-40" />
          Open a course from My Sets to chat with Coach.
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <OwlAnim className="w-7 h-7 object-contain shrink-0 mt-0.5" />}
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user" ? "text-white rounded-br-md" : "bg-gray-50 text-gray-800 rounded-bl-md"
                  }`}
                  style={m.role === "user" ? { backgroundColor: sf.blue } : undefined}
                >
                  {m.role === "user" ? m.content : <AssistantMessageBody text={m.content} />}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex gap-2 items-center text-xs text-gray-400">
                <OwlAnim className="w-7 h-7 object-contain opacity-70" />
                Searching your materials…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 p-3 border-t" style={{ borderColor: sf.border }}>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
                placeholder={
                  lessonCoachFocus?.conceptName
                    ? `Ask about ${lessonCoachFocus.conceptName}…`
                    : "Ask about your lessons…"
                }
                disabled={busy}
                className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                style={{ borderColor: sf.border }}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim()}
                className="px-3 rounded-xl text-white disabled:opacity-50 flex items-center justify-center"
                style={{ backgroundColor: sf.blue }}
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </div>
            {readySources === 0 ? (
              <p className="text-[11px] text-amber-600 mt-2">Source materials still indexing — answers may be limited.</p>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}
