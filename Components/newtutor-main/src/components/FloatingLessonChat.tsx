import { useEffect, useRef } from "react";
import { Send, X } from "lucide-react";
import { OwlAnim } from "./owlwise/primitives";
import { AssistantMessageBody } from "../lib/assistant-message";

export type LessonChatMessage = { from: "ai" | "user"; text: string };

export function FloatingLessonChat({
  open,
  onOpenChange,
  messages,
  input,
  onInputChange,
  onSend,
  busy,
  conceptName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: LessonChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  conceptName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, messages, busy]);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          className="pointer-events-auto w-[min(100vw-3rem,380px)] h-[min(70vh,480px)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Lesson assistant chat"
        >
          <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-[#fafbfc]">
            <OwlAnim className="w-9 h-9 object-contain shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">Owlwise Assistant</p>
              <p className="text-[11px] text-gray-500 truncate">Ask about {conceptName}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8 px-2">
                Ask a question about this unit — I&apos;ll use your course materials to help.
              </p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"} gap-2`}>
                  {m.from === "ai" && <OwlAnim className="w-7 h-7 object-contain shrink-0 self-end" />}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      m.from === "user"
                        ? "bg-[#1a73e8] text-white text-[13px] leading-relaxed"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {m.from === "user" ? m.text : <AssistantMessageBody text={m.text} compact />}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="flex gap-2 items-center pl-1">
                <OwlAnim className="w-7 h-7 object-contain shrink-0" />
                <p className="text-xs text-gray-400 animate-pulse">Thinking…</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 p-3 bg-white">
            <div className="flex items-center gap-2 bg-[#f4f7fb] border border-gray-200 rounded-full px-3 py-2">
              <input
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="Ask about this unit…"
                className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 min-w-0"
                disabled={busy}
              />
              <button
                type="button"
                onClick={onSend}
                disabled={busy || !input.trim()}
                className="shrink-0 p-1 rounded-full disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={16} className="text-[#1a73e8]" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`pointer-events-auto w-14 h-14 rounded-full shadow-lg border-2 flex items-center justify-center transition-all active:scale-95 ${
          open
            ? "bg-gray-800 border-gray-700"
            : "bg-[#1a73e8] border-[#1557b0] hover:bg-[#1557b0]"
        }`}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
      >
        {open ? (
          <X size={22} className="text-white" />
        ) : (
          <OwlAnim className="w-9 h-9 object-contain" />
        )}
      </button>
    </div>
  );
}
