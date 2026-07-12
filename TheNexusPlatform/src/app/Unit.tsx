import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles } from "lucide-react";

import { OwlAnim, Shell, StatusBar, type Nav } from "./shared";
import { StepPlayer } from "./StepPlayer";
import { api, MODE_META, type Mode, type ModuleStructure, type UnitContent } from "../services";

// ── Mode icons ──────────────────────────────────────────────────────────────
function IconOwl({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7c0-1.7 1.3-3 3-3 1 0 1.9.5 2.4 1.2A4.9 4.9 0 0 1 12 4c.9 0 1.8.2 2.6.7A3 3 0 0 1 17 4c1.7 0 3 1.3 3 3v5a8 8 0 0 1-16 0V7Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9" cy="11" r="2.4" stroke={color} strokeWidth="1.5" />
      <circle cx="15" cy="11" r="2.4" stroke={color} strokeWidth="1.5" />
      <circle cx="9" cy="11" r="0.9" fill={color} />
      <circle cx="15" cy="11" r="0.9" fill={color} />
      <path d="M12 13.4 11 15h2l-1-1.6Z" fill={color} />
      <path d="M6 4.5 7.5 2M18 4.5 16.5 2" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSummary({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke={color} strokeWidth="1.6" />
      <line x1="6" y1="6" x2="14" y2="6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6" y1="9" x2="14" y2="9" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6" y1="12" x2="11" y2="12" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNarrative({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth="1.6" />
      <ellipse cx="10" cy="10" rx="3" ry="7.5" stroke={color} strokeWidth="1.1" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" stroke={color} strokeWidth="1.1" />
      <line x1="3.7" y1="6.8" x2="16.3" y2="6.8" stroke={color} strokeWidth="0.9" />
      <line x1="3.7" y1="13.2" x2="16.3" y2="13.2" stroke={color} strokeWidth="0.9" />
    </svg>
  );
}

const MODE_ICON: Record<Mode, (p: { size?: number; color?: string }) => React.ReactElement> = {
  conversational: IconOwl,
  summary: IconSummary,
  narrative: IconNarrative,
};

// ── Per-mode theming ────────────────────────────────────────────────────────
type Theme = {
  bg: string;
  light: boolean; // light status bar text (i.e. dark background)
  ink: string;
  progressTrack: string;
  progressFill: string;
  // compact switcher pill
  pillBg: string;
  pillActive: string;
  pillActiveIcon: string;
  pillIdleIcon: string;
  pillDisabledIcon: string;
  titleFont: string;
};

const SERIF_BODY = "'PT Serif', Georgia, serif";
const SERIF_TITLE = "'Playfair Display', Georgia, serif";
const GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SANS = "'Inter', system-ui, sans-serif";

const THEMES: Record<Mode, Theme> = {
  conversational: {
    bg: "#161618",
    light: true,
    ink: "#ffffff",
    progressTrack: "rgba(255,255,255,0.12)",
    progressFill: "linear-gradient(90deg,#d2f1c7,#a8fd8c)",
    pillBg: "rgba(255,255,255,0.08)",
    pillActive: "rgba(255,255,255,0.18)",
    pillActiveIcon: "#ffffff",
    pillIdleIcon: "rgba(255,255,255,0.5)",
    pillDisabledIcon: "rgba(255,255,255,0.2)",
    titleFont: GROTESK,
  },
  summary: {
    bg: "#f6ecd6",
    light: false,
    ink: "#2c0312",
    progressTrack: "rgba(59,32,42,0.15)",
    progressFill: "#3b202a",
    pillBg: "#3b202a",
    pillActive: "rgba(255,255,255,0.16)",
    pillActiveIcon: "#ffffff",
    pillIdleIcon: "rgba(255,255,255,0.55)",
    pillDisabledIcon: "rgba(255,255,255,0.25)",
    titleFont: SERIF_TITLE,
  },
  narrative: {
    bg: "#f3ede1",
    light: false,
    ink: "#1a1a1a",
    progressTrack: "rgba(26,26,26,0.12)",
    progressFill: "#1a1a1a",
    pillBg: "#1f1e1c",
    pillActive: "rgba(255,255,255,0.18)",
    pillActiveIcon: "#ffffff",
    pillIdleIcon: "rgba(255,255,255,0.55)",
    pillDisabledIcon: "rgba(255,255,255,0.25)",
    titleFont: GROTESK,
  },
};

// ── Compact icon switcher (matches the Figma: floating pill, top-right) ──────
function ModeSwitcher({
  theme,
  mode,
  setMode,
  availableModes,
  hasInteractive,
}: {
  theme: Theme;
  mode: Mode;
  setMode: (m: Mode) => void;
  availableModes: Mode[];
  hasInteractive: boolean;
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: theme.pillBg }}>
      {MODE_META.map((m) => {
        const available = availableModes.includes(m.id);
        const active = mode === m.id;
        const Icon = MODE_ICON[m.id];
        const color = !available ? theme.pillDisabledIcon : active ? theme.pillActiveIcon : theme.pillIdleIcon;
        return (
          <button
            key={m.id}
            disabled={!available}
            onClick={() => available && setMode(m.id)}
            aria-label={m.label}
            className={`relative w-9 h-9 rounded-full flex items-center justify-center ${available ? "active:scale-90 transition-transform" : "cursor-not-allowed"}`}
          >
            {active && (
              <motion.div
                layoutId="pillActive"
                className="absolute inset-0 rounded-full"
                style={{ background: theme.pillActive }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex">
              <Icon size={18} color={color} />
            </span>
          </button>
        );
      })}
      {hasInteractive && (
        <div className="w-9 h-9 rounded-full flex items-center justify-center" title="Interactive activity available">
          <Sparkles size={17} color={theme.pillActiveIcon} />
        </div>
      )}
    </div>
  );
}

// ── Top bar: switcher + module label + progress ─────────────────────────────
function UnitTopBar({
  theme,
  progress,
  moduleLabel,
  mode,
  setMode,
  availableModes,
  hasInteractive,
}: {
  theme: Theme;
  progress: number;
  moduleLabel: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  availableModes: Mode[];
  hasInteractive: boolean;
}) {
  return (
    <div className="px-6 pt-2">
      <div className="flex justify-end mb-4">
        <ModeSwitcher theme={theme} mode={mode} setMode={setMode} availableModes={availableModes} hasInteractive={hasInteractive} />
      </div>
      <div className="flex items-center gap-4 pb-3">
        <span className="text-[30px] font-bold leading-none tracking-tight shrink-0" style={{ color: theme.ink, fontFamily: theme.titleFont }}>
          {moduleLabel}
        </span>
        <div className="flex-1 h-3.5 rounded-full overflow-hidden" style={{ background: theme.progressTrack }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: theme.progressFill }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Assistant chat hook ─────────────────────────────────────────────────────
function useAssistant(unitId: string, mode: Mode, topic: string, courseId?: string) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [pending, setPending] = useState(false);

  const send = async () => {
    const t = input.trim();
    if (!t || pending) return;
    setMessages((m) => [...m, { from: "user", text: t }]);
    setInput("");
    setPending(true);
    const reply = await api.content.askAssistant(unitId, mode, t, topic, courseId);
    setMessages((m) => [...m, { from: "ai", text: reply }]);
    setPending(false);
  };

  return { input, setInput, messages, pending, send };
}

// ── Conversational view (Brilliant-inspired breathing room) ─────────────────
function ConversationalView({ unit, nav, courseId }: { unit: UnitContent; nav: Nav; courseId?: string }) {
  const { input, setInput, messages, pending, send } = useAssistant(unit.unitId, "conversational", unit.concept, courseId);
  const c = unit.conversational;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <h2 className="text-white text-[26px] font-bold px-1 pt-1 pb-5 leading-tight tracking-tight" style={{ fontFamily: GROTESK }}>
          {c.question}
        </h2>

        <div className="flex flex-col gap-4">
          {c.bubbles.map((b, i) => (
            <div key={i} className="bg-white/[0.06] rounded-3xl rounded-tl-lg overflow-hidden">
              {b.image && <img src={b.image} alt="" className="w-full object-cover" style={{ maxHeight: 210 }} />}
              {(b.text || b.caption) && (
                <div className="p-4">
                  <p className="text-white/90 text-[16px] leading-[1.65]">{b.text || b.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {messages.length > 0 && (
          <div className="flex flex-col gap-3 mt-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"} gap-2`}>
                {m.from === "ai" && <OwlAnim className="w-9 h-9 object-contain shrink-0 self-end" />}
                <div className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-[14px] leading-relaxed ${m.from === "user" ? "bg-[#602424] text-white rounded-br-lg" : "bg-white/[0.06] text-white/90 rounded-bl-lg"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {pending && <TypingDots className="ml-11" />}
          </div>
        )}
      </div>

      <ChatBar mode="conversational" input={input} setInput={setInput} onSend={send} onContinue={() => nav("courses")} />
    </div>
  );
}

// ── Article view (Summary + Real-world; Apple Books-inspired) ───────────────
function ArticleView({ unit, mode, nav, courseId }: { unit: UnitContent; mode: "summary" | "narrative"; nav: Nav; courseId?: string }) {
  const { input, setInput, messages, pending, send } = useAssistant(unit.unitId, mode, unit.concept, courseId);
  const data = unit[mode];

  const s =
    mode === "summary"
      ? {
          bodyFont: SERIF_BODY,
          titleFont: SERIF_TITLE,
          ink: "#2c0312",
          bodySize: 16.5,
          lineHeight: 1.72,
          dropCap: true,
          figureBorder: "border-[3px] border-[#3b202a]",
          captionColor: "#7a5a2a",
          bubbleAi: "bg-[#3b202a]/10 text-[#2c0312]",
          bubbleUser: "bg-[#3b202a] text-white",
          chatBg: "#3b202a",
          continueBg: "#3b202a",
        }
      : {
          bodyFont: SANS,
          titleFont: GROTESK,
          ink: "#1a1a1a",
          bodySize: 15.5,
          lineHeight: 1.75,
          dropCap: false,
          figureBorder: "border border-black/10",
          captionColor: "#6b6b6b",
          bubbleAi: "bg-black/[0.06] text-[#1a1a1a]",
          bubbleUser: "bg-[#1a1a1a] text-white",
          chatBg: "#2a2a2a",
          continueBg: "#1a1a1a",
        };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: s.bodyFont }}>
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <h1 className="text-[32px] font-bold mb-4 leading-[1.1] tracking-tight" style={{ fontFamily: s.titleFont, color: s.ink }}>
          {data.title}
        </h1>

        {data.lead && (
          <p className="text-[17px] font-semibold mb-3 leading-snug" style={{ color: s.ink, fontFamily: s.titleFont }}>
            {data.lead}
          </p>
        )}

        <div style={{ color: s.ink, fontSize: s.bodySize, lineHeight: s.lineHeight }}>
          {data.paragraphs.map((p, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? s.dropCap
                    ? "[&::first-letter]:float-left [&::first-letter]:text-[56px] [&::first-letter]:leading-[0.82] [&::first-letter]:pr-2.5 [&::first-letter]:pt-1 [&::first-letter]:font-bold"
                    : ""
                  : "mt-4 indent-6"
              }
            >
              {p}
            </p>
          ))}
        </div>

        {data.figure && (
          <figure className="mt-7">
            <div className={`overflow-hidden rounded-[3px] ${s.figureBorder}`}>
              <img src={data.figure.image} alt="" className="w-full object-cover" />
            </div>
            <figcaption className="mt-2.5 text-[12px] italic leading-snug" style={{ color: s.captionColor }}>
              {data.figure.caption}
            </figcaption>
          </figure>
        )}

        {messages.length > 0 && (
          <div className="flex flex-col gap-3 mt-6">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"} gap-2`}>
                {m.from === "ai" && <OwlAnim className="w-9 h-9 object-contain shrink-0 self-end" />}
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${m.from === "user" ? s.bubbleUser : s.bubbleAi}`} style={{ fontFamily: "inherit" }}>
                  {m.text}
                </div>
              </div>
            ))}
            {pending && <TypingDots className="ml-11" dark />}
          </div>
        )}
      </div>

      <ChatBar
        mode={mode}
        input={input}
        setInput={setInput}
        onSend={send}
        onContinue={() => nav("courses")}
        chatBg={s.chatBg}
        continueBg={s.continueBg}
        fontFamily={s.bodyFont}
        continueFontFamily={s.titleFont}
      />
    </div>
  );
}

// ── Typing indicator ────────────────────────────────────────────────────────
function TypingDots({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  const dot = dark ? "bg-black/40" : "bg-white/60";
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className={`w-1.5 h-1.5 rounded-full ${dot}`}
          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  );
}

// ── Continue + chat bar ─────────────────────────────────────────────────────
function ChatBar({
  mode,
  input,
  setInput,
  onSend,
  onContinue,
  chatBg,
  continueBg,
  fontFamily,
  continueFontFamily,
}: {
  mode: Mode;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onContinue: () => void;
  chatBg?: string;
  continueBg?: string;
  fontFamily?: string;
  continueFontFamily?: string;
}) {
  const isDark = mode === "conversational";
  return (
    <div className="px-5 pb-4 pt-1">
      <div className="flex justify-end mb-3">
        <button
          onClick={onContinue}
          className={`px-8 py-3 text-[15px] font-semibold rounded-full active:scale-[0.97] transition-transform shadow-sm ${isDark ? "bg-[#b2f99b] text-[#0a2e0a]" : "text-white"}`}
          style={isDark ? undefined : { background: continueBg, fontFamily: continueFontFamily }}
        >
          Continue
        </button>
      </div>
      <div
        className="flex items-center gap-2.5 rounded-full px-4 py-3"
        style={{ background: isDark ? "rgba(255,255,255,0.07)" : chatBg }}
      >
        {isDark && <OwlAnim className="w-9 h-9 object-contain shrink-0" />}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Ask a question..."
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-white/40"
          style={{ fontFamily, color: isDark ? "#e6e6e6" : "rgba(255,255,255,0.95)" }}
        />
        {input.trim() && (
          <button onClick={onSend} className="shrink-0">
            <Send size={17} className="text-white/70" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Unit screen ─────────────────────────────────────────────────────────────
export function Unit({
  nav,
  defaultMode = "conversational",
  topic = "",
  grade = "",
  courseId,
  unitId: propUnitId,
  moduleLabel = "Module 1",
}: {
  nav: Nav;
  defaultMode?: Mode;
  topic?: string;
  grade?: string;
  courseId?: string;
  unitId?: string;
  moduleLabel?: string;
}) {
  const [unit, setUnit] = useState<UnitContent | null>(null);
  const [module, setModule] = useState<ModuleStructure | null>(null);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const didInit = useRef(false);

  const [moduleLoading, setModuleLoading] = useState(true);
  const [moduleError, setModuleError] = useState("");

  useEffect(() => {
    setUnit(null);
    setModule(null);
    setModuleLoading(true);
    setModuleError("");
    const unitId = propUnitId ?? (topic ? `unit-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "");

    if (!unitId) {
      setModuleLoading(false);
      setModuleError("Join a course and pick a chapter from My courses.");
      return;
    }

    let cancelled = false;

    const pollModule = async () => {
      if (!api.content.getModule) {
        setModuleLoading(false);
        setModuleError("Lesson loading requires the backend.");
        return;
      }
      for (let attempt = 0; attempt < 180 && !cancelled; attempt++) {
        try {
          const m = await api.content.getModule(unitId);
          if (cancelled) return;
          setModule(m);
          setModuleLoading(false);
          if (!didInit.current) {
            setMode(defaultMode);
            didInit.current = true;
          }
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      if (!cancelled) {
        setModuleLoading(false);
        setModuleError("This chapter is still being generated. Wait a minute and try again.");
      }
    };

    pollModule();
    return () => { cancelled = true; };
  }, [defaultMode, topic, grade, courseId, propUnitId, moduleLabel]);

  const theme = THEMES[mode];
  const resolvedUnitId = propUnitId ?? `unit-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const onProgress = useCallback((pct: number) => setProgress(pct), []);

  const moduleModes: Mode[] = ["conversational", "summary", "narrative"];

  return (
    <Shell style={{ background: theme.bg }}>
      <div className="flex flex-col h-screen" style={{ background: theme.bg, minHeight: "100svh" }}>
        <StatusBar light={theme.light} />

        {(module || unit) && (
          <UnitTopBar
            theme={theme}
            progress={module ? progress : unit?.progress ?? 0}
            moduleLabel={module ? moduleLabel : unit?.moduleLabel ?? moduleLabel}
            mode={mode}
            setMode={setMode}
            availableModes={module ? moduleModes : unit?.availableModes ?? moduleModes}
            hasInteractive={unit?.hasInteractive ?? false}
          />
        )}

        <div className="flex-1 overflow-hidden relative">
          {moduleLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
              <OwlAnim className="w-28 h-28 object-contain" />
              <p className="text-[15px]" style={{ color: theme.ink, opacity: 0.6 }}>
                {topic ? `Loading ${topic}…` : "Preparing your lesson…"}
              </p>
              <p className="text-[13px] text-gray-400">Your teacher&apos;s AI is building this chapter from their uploaded materials.</p>
            </div>
          ) : moduleError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
              <OwlAnim className="w-24 h-24 object-contain" />
              <p className="text-[15px] text-gray-700">{moduleError}</p>
              <button onClick={() => nav("courses")} className="px-5 py-3 rounded-2xl bg-[#602424] text-white text-[14px] font-semibold">
                Back to courses
              </button>
            </div>
          ) : module ? (
            <StepPlayer
              module={module}
              mode={mode}
              unitId={resolvedUnitId}
              courseId={courseId}
              topic={topic}
              onProgress={onProgress}
              onFinish={() => nav("courses")}
            />
          ) : unit ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="absolute inset-0 flex flex-col"
              >
                {mode === "conversational" && <ConversationalView unit={unit} nav={nav} courseId={courseId} />}
                {mode === "summary" && <ArticleView unit={unit} mode="summary" nav={nav} courseId={courseId} />}
                {mode === "narrative" && <ArticleView unit={unit} mode="narrative" nav={nav} courseId={courseId} />}
              </motion.div>
            </AnimatePresence>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}
