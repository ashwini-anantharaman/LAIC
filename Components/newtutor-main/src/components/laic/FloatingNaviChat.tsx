import { useState, useRef, useEffect } from "react";
import { Send, X, Lock } from "lucide-react";
import { useApp } from "../../store/AppContext";
import { Agents } from "../../agents";
import type { ContentMode } from "../../types";
import { CatMini } from "./NaviMascot";

export function FloatingNaviChat() {
  const { courseId, activeConceptId, concepts, learner, role, screen } = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [unread, setUnread] = useState(0);
  const [contentMode, setContentMode] = useState<ContentMode>(learner.defaultMode);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  const concept = concepts.find((c) => c.id === activeConceptId);
  const conceptName = concept?.name ?? "your course";
  const onQuiz = screen === "student-concept";

  useEffect(() => {
    setContentMode(learner.defaultMode);
  }, [learner.defaultMode]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!open || role !== "student" || !courseId || greetedRef.current) return;
    greetedRef.current = true;
    Agents.studentAssistant
      .getGreeting({ conceptId: activeConceptId ?? "", conceptName, mode: contentMode, onQuiz })
      .then((greeting) => setMessages([{ role: "assistant", content: greeting }]))
      .catch(() =>
        setMessages([{ role: "assistant", content: "Hi! I'm Navi. Ask me anything about your course." }])
      );
  }, [open, role, courseId, activeConceptId, conceptName, contentMode, onQuiz]);

  useEffect(() => {
    greetedRef.current = false;
    setMessages([]);
  }, [activeConceptId, courseId]);

  if (role !== "student" || !courseId) return null;

  const send = async () => {
    if (!input.trim() || streaming || !courseId) return;
    const msg = input.trim();
    setInput("");
    setMessages((p) => [...p, { role: "user", content: msg }]);
    setStreaming(true);
    try {
      const reply = await Agents.studentAssistant.respond(
        msg,
        { conceptId: activeConceptId ?? "", conceptName, mode: contentMode, onQuiz },
        courseId,
        learner.reflections.map((r) => r.answers.join(" "))
      );
      setMessages((p) => [...p, reply]);
      if (!open) setUnread((u) => u + 1);
    } catch {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "Sorry, I couldn't reach the tutor right now. Try again in a moment." },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  const renderText = (text: string) =>
    text.split("**").map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <style>{`
        @keyframes slideUpChat  { from{opacity:0;transform:translateY(16px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes bubblePulse  { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.06) translateY(-4px)} }
        @keyframes badgePop     { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
        .chat-window { animation: slideUpChat 0.22s cubic-bezier(0.34,1.56,0.64,1) both; }
        .navi-bubble { animation: bubblePulse 2.4s ease-in-out infinite; }
        .badge-pop   { animation: badgePop 0.3s ease both; }
      `}</style>

      {open && (
        <div
          className="chat-window w-[340px] bg-white rounded-3xl shadow-2xl border border-indigo-100 flex flex-col overflow-hidden"
          style={{ height: 440 }}
        >
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 flex items-center gap-2.5 shrink-0">
            <CatMini size={34} />
            <div className="flex-1">
              <p className="text-sm font-black text-white">Navi — AI Tutor</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <p className="text-[10px] font-bold text-white/70">Online · Context-aware</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 [scrollbar-width:thin] [scrollbar-color:#e0e7ff_transparent]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && <CatMini size={26} />}
                <div
                  className={`max-w-[220px] px-3 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed ${
                    msg.role === "user"
                      ? "text-white rounded-br-sm"
                      : "bg-indigo-50 text-indigo-900 rounded-bl-sm"
                  }`}
                  style={msg.role === "user" ? { background: "linear-gradient(135deg,#6366F1,#8B5CF6)" } : {}}
                >
                  {renderText(msg.content)}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex gap-2">
                <CatMini size={26} />
                <div className="bg-indigo-50 px-3 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                  {[0, 1, 2].map((j) => (
                    <div
                      key={j}
                      className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce"
                      style={{ animationDelay: `${j * 160}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-100 shrink-0">
            <p className="text-[10px] font-bold text-amber-600 text-center uppercase tracking-wider flex items-center justify-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Quiz answers guardrailed · Mode switches logged
            </p>
          </div>

          <div className="p-3 border-t border-indigo-50 shrink-0">
            <div className="flex gap-2 items-center bg-indigo-50 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-200 transition-all">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder="Ask Navi anything..."
                className="flex-1 bg-transparent text-xs font-semibold text-indigo-900 placeholder:text-indigo-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || streaming}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40 transition-all"
                style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6)" }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {unread > 0 && !open && (
          <div className="badge-pop absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
            <span className="text-[10px] font-black text-white">{unread}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-14 h-14 rounded-full shadow-xl hover:shadow-2xl transition-all overflow-hidden ${open ? "scale-95" : "navi-bubble"}`}
          title="Chat with Navi, your AI tutor"
          style={open ? { outline: "3px solid #6366F1", outlineOffset: 2 } : {}}
        >
          <CatMini size={56} />
        </button>
      </div>
    </div>
  );
}
