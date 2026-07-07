import { useEffect, useRef, useState } from "react";
import { Send, BookOpen } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { sf } from "../constants/studyFetchTheme";
import { OwlAnim } from "../components/owlwise/primitives";
import type { ContentMode } from "../types";

type ChatMessage = { role: "user" | "assistant"; content: string };

const COURSE_WIDE = "__course__";

import { AssistantMessageBody } from "../lib/assistant-message";

export function StudentAssistantChatScreen() {
  const {
    courseId,
    courseTitle,
    concepts,
    activeConceptId,
    learner,
    ragSources,
  } = useApp();

  const [scope, setScope] = useState<string>(() => activeConceptId || COURSE_WIDE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const contentMode: ContentMode = learner.defaultMode;
  const readySources = ragSources.filter((s) => s.status === "ready").length;
  const conceptName =
    scope === COURSE_WIDE
      ? "Course materials"
      : (concepts.find((c) => c.id === scope)?.name ?? "Course materials");
  const conceptId = scope === COURSE_WIDE ? "" : scope;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    greetedRef.current = false;
    setMessages([]);
  }, [scope, courseId]);

  useEffect(() => {
    if (!courseId || greetedRef.current) return;
    greetedRef.current = true;
    Agents.studentAssistant
      .getGreeting({ conceptId, conceptName, mode: contentMode, onQuiz: false })
      .then((greeting) => setMessages([{ role: "assistant", content: greeting }]))
      .catch(() =>
        setMessages([
          {
            role: "assistant",
            content:
              "Hi! I'm Owlwise Assistant. Ask me anything about your course materials and I'll help you learn.",
          },
        ])
      );
  }, [courseId, conceptId, conceptName, contentMode]);

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
        {
          role: "assistant",
          content: "Sorry, I couldn't reach the assistant right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!courseId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <OwlAnim className="w-20 h-20 mx-auto mb-4 object-contain opacity-60" />
        <p className="font-semibold text-gray-700 mb-2">Join a course to chat</p>
        <p className="text-sm text-gray-500">Open a classroom from My Sets to ask Owlwise about your materials.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <div className="shrink-0 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <OwlAnim className="w-12 h-12 object-contain shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900">Owlwise Assistant</h1>
            <p className="text-sm text-gray-500 truncate">
              {courseTitle} · answers grounded in source material
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen size={16} className="text-gray-400 shrink-0" />
          <label className="text-xs font-semibold text-gray-500">Focus:</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border bg-white outline-none focus:border-blue-400"
            style={{ borderColor: sf.border }}
          >
            <option value={COURSE_WIDE}>All course sources</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            {readySources > 0 ? `${readySources} source${readySources === 1 ? "" : "s"} indexed` : "No sources indexed yet"}
          </span>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto rounded-2xl border bg-white p-4 space-y-4"
        style={{ borderColor: sf.border }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <OwlAnim className="w-8 h-8 object-contain shrink-0 mt-0.5" />
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "text-white rounded-br-md"
                  : "bg-gray-50 text-gray-800 rounded-bl-md"
              }`}
              style={m.role === "user" ? { backgroundColor: sf.blue } : undefined}
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <AssistantMessageBody text={m.content} />
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2.5 items-center text-sm text-gray-400">
            <OwlAnim className="w-8 h-8 object-contain opacity-70" />
            <span>Searching your course materials…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
          placeholder="Ask about your readings, PDFs, or lessons…"
          disabled={busy}
          className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none focus:border-blue-400 disabled:opacity-60"
          style={{ borderColor: sf.border }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="px-4 rounded-xl text-white disabled:opacity-50 flex items-center justify-center"
          style={{ backgroundColor: sf.blue }}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>

      {readySources === 0 && (
        <p className="text-xs text-amber-600 mt-2 text-center">
          Your instructor hasn&apos;t uploaded source materials yet — answers may be limited.
        </p>
      )}
    </div>
  );
}
