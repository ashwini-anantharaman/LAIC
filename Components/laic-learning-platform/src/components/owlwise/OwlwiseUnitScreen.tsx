import { useState, useRef } from "react";
import { Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import rubinVase from "../../imports/InteractiveMode-1/97b20c55a0746afbe29344ee6e519a924f9a40c8.png";
import owlAvatar from "../../imports/InteractiveMode-1/2da62d230eab2fcaa09dc117f216257b17160f6a.png";
import type { OwlwiseMode } from "../../constants/owlwiseTheme";
import { MODE_CONFIG } from "../../constants/owlwiseTheme";
import { Shell, StatusBar, OwlAnim } from "./primitives";
import { IconInteractive, IconSummary, IconNarrative } from "./ModeIcons";

export type LessonContent = {
  title: string;
  subtitle?: string;
  paragraphs: string[];
  imageUrl?: string;
  imageCaption?: string;
};

function UnitTopBar({
  moduleLabel,
  progressPct,
  mode,
  setMode,
  light = false,
  progressColor = "bg-green-300",
  availableModes,
}: {
  moduleLabel: string;
  progressPct: number;
  mode: OwlwiseMode;
  setMode: (m: OwlwiseMode) => void;
  light?: boolean;
  progressColor?: string;
  availableModes: OwlwiseMode[];
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-5 pt-2 pb-3">
        <span
          className={`text-[32px] font-bold leading-tight tracking-tight ${
            light ? "text-white" : "text-[#2c0312]"
          }`}
        >
          {moduleLabel}
        </span>
        <div
          className="flex-1 h-[22px] rounded-full overflow-hidden"
          style={{ background: light ? "rgba(74,82,115,0.3)" : "rgba(91,69,77,0.25)" }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full ${progressColor}`}
          />
        </div>
      </div>
      <div className="flex justify-end px-5 pb-2">
        <div className="flex items-center gap-1">
          {(["interactive", "summary", "narrative"] as OwlwiseMode[]).map((m) => {
            if (!availableModes.includes(m)) return null;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`w-9 h-8 rounded-xl flex items-center justify-center transition-all ${
                  mode === m ? (light ? "bg-white/20" : "bg-black/10") : ""
                }`}
              >
                {m === "interactive" && <IconInteractive active={mode === m} />}
                {m === "summary" && <IconSummary active={mode === m} dark={!light} />}
                {m === "narrative" && <IconNarrative active={mode === m} dark={!light} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChatMessages({
  messages,
  dark,
  mono,
}: {
  messages: { from: "ai" | "user"; text: string }[];
  dark?: boolean;
  mono?: boolean;
}) {
  if (!messages.length) return null;
  return (
    <div className="flex flex-col gap-3 px-1 mt-2">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"} gap-2`}>
          {m.from === "ai" && (
            <OwlAnim className="w-7 h-7 object-contain shrink-0 self-end" />
          )}
          <div
            className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
              m.from === "user"
                ? dark
                  ? "bg-[#602424] text-white rounded-br-sm"
                  : "bg-[#3b202a] text-white"
                : dark
                  ? "bg-[#4a5273]/20 text-white rounded-bl-sm"
                  : "bg-[#5a454d]/20 text-[#2c0312]"
            }`}
            style={mono ? { fontFamily: "'IBM Plex Mono', monospace" } : undefined}
          >
            {m.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function InteractiveView({
  content,
  onContinue,
  onAsk,
}: {
  content: LessonContent;
  onContinue: () => void;
  onAsk: (question: string) => Promise<string>;
}) {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = async () => {
    const t = chatInput.trim();
    if (!t || busy) return;
    setChatInput("");
    setMessages((m) => [...m, { from: "user", text: t }]);
    setBusy(true);
    try {
      const reply = await onAsk(t);
      setMessages((m) => [...m, { from: "ai", text: reply }]);
    } finally {
      setBusy(false);
    }
  };

  const image = content.imageUrl ?? rubinVase;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="text-white text-[22px] font-normal px-2 pb-4 leading-snug">{content.title}</p>
        {content.paragraphs.map((para, i) => (
          <div key={i} className="mb-4">
            <div className="bg-[#4a5273]/20 rounded-2xl rounded-tl-sm mx-1 p-4">
              <p className="text-white text-[16px] leading-relaxed">{para}</p>
            </div>
          </div>
        ))}
        {image && (
          <div className="mb-4">
            <div className="bg-[#4a5273]/20 rounded-2xl rounded-tl-sm mx-1 overflow-hidden">
              <img src={image} alt="" className="w-full object-cover" style={{ maxHeight: 200 }} />
              {content.imageCaption && (
                <div className="p-4">
                  <p className="text-white text-[15px] leading-relaxed">{content.imageCaption}</p>
                </div>
              )}
            </div>
          </div>
        )}
        <ChatMessages messages={messages} dark />
      </div>
      <div className="px-4 pb-2">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onContinue}
            className="px-6 py-2 bg-[#b2f99b] text-[#0a2e0a] text-[14px] font-semibold rounded-full shadow-sm active:scale-[0.97] transition-transform"
          >
            Continue
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[#4a5273]/20 rounded-full px-4 py-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
            <img src={owlAvatar} alt="" className="w-full h-full object-cover scale-150" />
          </div>
          <input
            ref={inputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Ask me any questions..."
            className="flex-1 bg-transparent text-[#9a9a9a] text-[16px] outline-none placeholder:text-[#9a9a9a]"
          />
          {chatInput.trim() && (
            <button type="button" onClick={() => void send()} className="shrink-0">
              <Send size={16} className="text-white/60" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryView({
  content,
  onContinue,
  onAsk,
}: {
  content: LessonContent;
  onContinue: () => void;
  onAsk: (question: string) => Promise<string>;
}) {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const t = chatInput.trim();
    if (!t || busy) return;
    setChatInput("");
    setMessages((m) => [...m, { from: "user", text: t }]);
    setBusy(true);
    try {
      const reply = await onAsk(t);
      setMessages((m) => [...m, { from: "ai", text: reply }]);
    } finally {
      setBusy(false);
    }
  };

  const image = content.imageUrl ?? rubinVase;

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'PT Serif', Georgia, serif" }}>
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <h2
          className="text-[28px] font-bold text-[#2c0312] mb-4 leading-tight"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {content.title}
        </h2>
        <div className="text-[15px] text-[#2c0312] leading-[1.75]">
          {content.paragraphs.map((para, i) => (
            <p key={i} className={i > 0 ? "mt-4" : ""}>
              {para}
            </p>
          ))}
        </div>
        {image && (
          <>
            <div className="mt-5 border-[3px] border-[#3b202a] rounded-sm overflow-hidden">
              <img src={image} alt="" className="w-full object-cover" />
            </div>
            {content.imageCaption && (
              <p className="mt-1.5 text-[11px] italic text-[#602424]">{content.imageCaption}</p>
            )}
          </>
        )}
        <ChatMessages messages={messages} />
      </div>
      <div className="px-5 pb-2">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onContinue}
            className="px-7 py-3 bg-[#3b202a] text-white text-[16px] font-bold rounded-2xl active:scale-[0.97] transition-transform"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Continue
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[#5a454d] rounded-full px-4 py-3">
          <OwlAnim className="w-6 h-6 object-contain shrink-0" />
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Ask a question..."
            className="flex-1 bg-transparent text-[#9a9a9a] text-[15px] outline-none placeholder:text-[#9a9a9a]"
          />
          {chatInput.trim() && (
            <button type="button" onClick={() => void send()}>
              <Send size={15} className="text-white/50" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NarrativeView({
  content,
  onContinue,
  onAsk,
}: {
  content: LessonContent;
  onContinue: () => void;
  onAsk: (question: string) => Promise<string>;
}) {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const t = chatInput.trim();
    if (!t || busy) return;
    setChatInput("");
    setMessages((m) => [...m, { from: "user", text: t }]);
    setBusy(true);
    try {
      const reply = await onAsk(t);
      setMessages((m) => [...m, { from: "ai", text: reply }]);
    } finally {
      setBusy(false);
    }
  };

  const image = content.imageUrl ?? rubinVase;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <h2
          className="text-[26px] font-bold text-black mb-4 leading-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {content.title}
        </h2>
        <div className="text-[12.5px] text-black leading-[1.8]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          {content.paragraphs.map((para, i) => (
            <p key={i} className={i > 0 ? "mb-3" : "mb-2 font-bold text-[14px]"}>
              {para}
            </p>
          ))}
        </div>
        {image && (
          <div className="flex gap-3 mb-4">
            <div className="w-[48%] shrink-0 overflow-hidden rounded-sm">
              <img src={image} alt="" className="w-full h-full object-cover" />
            </div>
            {content.imageCaption && (
              <p className="text-[11.5px] text-black leading-[1.7]">{content.imageCaption}</p>
            )}
          </div>
        )}
        <ChatMessages messages={messages} mono />
      </div>
      <div className="px-5 pb-2">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onContinue}
            className="px-7 py-3 bg-black text-white text-[15px] font-medium rounded-2xl active:scale-[0.97] transition-transform"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Continue
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[#535353] rounded-full px-4 py-3">
          <OwlAnim className="w-6 h-6 object-contain shrink-0" />
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Ask a question..."
            className="flex-1 bg-transparent text-[#9a9a9a] text-[15px] outline-none placeholder:text-[#9a9a9a]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          />
          {chatInput.trim() && (
            <button type="button" onClick={() => void send()}>
              <Send size={15} className="text-white/50" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OwlwiseUnitScreen({
  moduleLabel,
  progressPct,
  mode,
  setMode,
  availableModes,
  content,
  onContinue,
  onAsk,
  onBack,
}: {
  moduleLabel: string;
  progressPct: number;
  mode: OwlwiseMode;
  setMode: (m: OwlwiseMode) => void;
  availableModes: OwlwiseMode[];
  content: LessonContent;
  onContinue: () => void;
  onAsk: (question: string) => Promise<string>;
  onBack?: () => void;
}) {
  const cfg = MODE_CONFIG[mode];

  return (
    <Shell className="overflow-hidden" style={{ background: cfg.bg }}>
      <div className="flex flex-col h-screen" style={{ background: cfg.bg, minHeight: "100svh" }}>
        <StatusBar light={cfg.statusLight} />
        {onBack && (
          <button type="button" onClick={onBack} className="absolute left-4 top-12 z-10 text-sm text-gray-500">
            ← Back
          </button>
        )}
        <UnitTopBar
          moduleLabel={moduleLabel}
          progressPct={progressPct}
          mode={mode}
          setMode={setMode}
          light={cfg.statusLight}
          progressColor={cfg.progressColor}
          availableModes={availableModes}
        />
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {mode === "interactive" && (
              <motion.div
                key="interactive"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex flex-col"
              >
                <InteractiveView content={content} onContinue={onContinue} onAsk={onAsk} />
              </motion.div>
            )}
            {mode === "summary" && (
              <motion.div
                key="summary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex flex-col"
              >
                <SummaryView content={content} onContinue={onContinue} onAsk={onAsk} />
              </motion.div>
            )}
            {mode === "narrative" && (
              <motion.div
                key="narrative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex flex-col"
              >
                <NarrativeView content={content} onContinue={onContinue} onAsk={onAsk} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Shell>
  );
}
