import { useEffect, useMemo, useState } from "react";
import type { ContentPolicy } from "../../learning/types";
import { AgentAPI } from "../../lib/api";
import "./studio.css";

export type StudioAssistantFocus = {
  label: string;
  value: string;
};

export type StudioAssistantProps = {
  courseId?: string | null;
  policy: ContentPolicy;
  focus?: StudioAssistantFocus | null;
  onApply: (text: string) => void;
};

const QUICK_ACTIONS = ["Simplify", "Make harder", "Shorten", "Add question"] as const;

export function StudioAssistant({ courseId, policy, focus, onApply }: StudioAssistantProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<{ role: "a" | "u"; text: string }[]>([
    {
      role: "a",
      text: 'Tap any dotted field and say "simplify this", "make it harder", or "shorten it". I can also add blocks — try "add a question".',
    },
  ]);
  const [loading, setLoading] = useState(false);

  const focusSummary = useMemo(
    () => focus ?? { label: "Current selection", value: "Tap a dotted field in the editor." },
    [focus]
  );

  useEffect(() => {
    if (!open) setInstruction("");
  }, [open]);

  const requestAssist = async (nextInstruction: string) => {
    if (!courseId) {
      setMessages((m) => [...m, { role: "a", text: "Open a course before using the assistant." }]);
      return;
    }
    const trimmed = nextInstruction.trim();
    if (!trimmed) return;

    setMessages((m) => [...m, { role: "u", text: trimmed }]);
    setLoading(true);
    try {
      const result = await AgentAPI.studioAssist({
        courseId,
        policy,
        fieldLabel: focusSummary.label,
        currentValue: focusSummary.value,
        instruction: trimmed,
      });
      setMessages((m) => [...m, { role: "a", text: result.text }]);
      onApply(result.text);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "a", text: err instanceof Error ? err.message : "Assistant request failed." },
      ]);
    } finally {
      setLoading(false);
      setInstruction("");
    }
  };

  return (
    <>
      {!open && (
        <button type="button" className="studio-ai-fab" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          </svg>
          Assistant
        </button>
      )}

      <div className={`studio-ai-panel${open ? " on" : ""}`}>
        <div className="studio-ai-h">
          <div className="av">✦</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Assistant</div>
            <div style={{ fontSize: 11, color: "var(--amber)" }}>edits the field you tap</div>
          </div>
          <button type="button" className="studio-drawer-x" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="studio-ai-ctx">
          Focused on <b>{focusSummary.label}</b>
        </div>
        <div className="studio-ai-scroll">
          {messages.map((msg, i) => (
            <div key={i} className={`studio-amsg ${msg.role}`}>
              {msg.text}
            </div>
          ))}
        </div>
        <div className="studio-ai-chips">
          {QUICK_ACTIONS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="studio-ai-chip"
              disabled={loading}
              onClick={() => void requestAssist(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="studio-ai-in">
          <input
            value={instruction}
            placeholder="Change the focused field…"
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void requestAssist(instruction);
            }}
          />
          <button type="button" disabled={loading} onClick={() => void requestAssist(instruction)}>
            Send
          </button>
        </div>
      </div>
    </>
  );
}
