import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send } from "lucide-react";

import { OwlAnim } from "./shared";
import {
  api,
  type FlashcardItem,
  type ItemMastery,
  type MCQItem,
  type Mode,
  type ModuleStep,
  type ModuleStructure,
} from "../services";

const SERIF_BODY = "'PT Serif', Georgia, serif";
const SERIF_TITLE = "'Playfair Display', Georgia, serif";
const GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SANS = "'Inter', system-ui, sans-serif";

type ReviewItem = {
  itemId: string;
  card?: FlashcardItem;
  question?: MCQItem;
  dueAtStep: number;
  priority: number;
};

type Theme = {
  bg: string;
  ink: string;
  chatBg: string;
  continueBg: string;
  bodyFont: string;
  titleFont: string;
  bubbleAi: string;
  bubbleUser: string;
};

function themeFor(mode: Mode): Theme {
  if (mode === "conversational") {
    return { bg: "#161618", ink: "#f5f5f5", chatBg: "rgba(255,255,255,0.08)", continueBg: "#b2f99b", bodyFont: SANS, titleFont: GROTESK, bubbleAi: "rgba(255,255,255,0.08)", bubbleUser: "#602424" };
  }
  if (mode === "narrative") {
    return { bg: "#f3ede1", ink: "#1a1a1a", chatBg: "#2a2a2a", continueBg: "#1a1a1a", bodyFont: SANS, titleFont: GROTESK, bubbleAi: "rgba(0,0,0,0.06)", bubbleUser: "#1a1a1a" };
  }
  return { bg: "#f6ecd6", ink: "#2c0312", chatBg: "#3b202a", continueBg: "#3b202a", bodyFont: SERIF_BODY, titleFont: SERIF_TITLE, bubbleAi: "rgba(59,32,42,0.1)", bubbleUser: "#3b202a" };
}

function flattenSteps(module: ModuleStructure): ModuleStep[] {
  return module.chapters.flatMap((ch) => ch.steps);
}

function progressKey(unitId: string) {
  return `liac_step_${unitId}`;
}

function masteryPriority(m: ItemMastery) {
  return m.beta / (m.alpha + m.beta);
}

function FlashcardStepView({
  cards,
  theme,
  onComplete,
  onAllComplete,
}: {
  cards: FlashcardItem[];
  theme: Theme;
  onComplete: (itemId: string, correct: boolean) => void;
  onAllComplete?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];

  if (!card) return null;

  const next = (correct: boolean) => {
    onComplete(card.id, correct);
    if (idx < cards.length - 1) {
      setIdx(idx + 1);
      setFlipped(false);
    } else {
      onAllComplete?.();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 gap-6">
      <p className="text-[13px] uppercase tracking-widest opacity-60" style={{ color: theme.ink }}>
        Quick check {cards.length > 1 ? `(${idx + 1}/${cards.length})` : ""}
      </p>
      <button
        onClick={() => setFlipped(!flipped)}
        className="w-full max-w-sm min-h-[180px] rounded-3xl p-6 flex items-center justify-center text-center shadow-sm border border-black/5 bg-white"
      >
        <p className="text-[17px] leading-relaxed" style={{ color: theme.ink, fontFamily: theme.bodyFont }}>
          {flipped ? card.back : card.front}
        </p>
      </button>
      <p className="text-[12px] opacity-50" style={{ color: theme.ink }}>Tap card to flip</p>
      {flipped && (
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={() => next(false)} className="flex-1 py-3 rounded-2xl border border-gray-300 text-[14px] font-medium">Still learning</button>
          <button onClick={() => next(true)} className="flex-1 py-3 rounded-2xl bg-[#602424] text-white text-[14px] font-medium">Know it</button>
        </div>
      )}
    </div>
  );
}

function MCQStepView({
  questions,
  theme,
  onComplete,
  onAllComplete,
}: {
  questions: MCQItem[];
  theme: Theme;
  onComplete: (itemId: string, correct: boolean) => void;
  onAllComplete?: () => void;
}) {
  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const q = questions[qi];

  if (!q) return null;

  const submit = () => {
    if (selected === null) return;
    const correct = selected === q.correctIndex;
    setFeedback(correct ? "Correct!" : q.explanation || "Not quite — review the chapter and try again.");
    onComplete(q.id, correct);
  };

  const nextQ = () => {
    if (qi < questions.length - 1) {
      setQi(qi + 1);
      setSelected(null);
      setFeedback(null);
    } else {
      onAllComplete?.();
    }
  };

  return (
    <div className="flex flex-col flex-1 px-6 py-4 gap-4 overflow-y-auto">
      <p className="text-[13px] uppercase tracking-widest opacity-60" style={{ color: theme.ink }}>
        Chapter review {questions.length > 1 ? `(${qi + 1}/${questions.length})` : ""}
      </p>
      <p className="text-[18px] font-semibold leading-snug" style={{ color: theme.ink, fontFamily: theme.titleFont }}>{q.question}</p>
      <div className="flex flex-col gap-2.5">
        {q.choices.map((c, i) => (
          <button
            key={i}
            onClick={() => !feedback && setSelected(i)}
            className={`text-left px-4 py-3.5 rounded-2xl border text-[15px] transition-all ${selected === i ? "border-[#602424] bg-white" : "border-gray-200 bg-white"}`}
            style={{ color: theme.ink, fontFamily: theme.bodyFont }}
          >
            {c}
          </button>
        ))}
      </div>
      {feedback ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px]" style={{ color: theme.ink }}>{feedback}</p>
          <button onClick={nextQ} className="self-end px-6 py-3 rounded-full text-white text-[14px] font-semibold" style={{ background: theme.continueBg }}>
            {qi < questions.length - 1 ? "Next question" : "Continue"}
          </button>
        </div>
      ) : (
        <button
          onClick={submit}
          disabled={selected === null}
          className="self-end px-6 py-3 rounded-full text-white text-[14px] font-semibold disabled:opacity-40"
          style={{ background: theme.continueBg }}
        >
          Check answer
        </button>
      )}
    </div>
  );
}

function ContentScreenView({
  step,
  mode,
  theme,
}: {
  step: Extract<ModuleStep, { type: "screen" }>;
  mode: Mode;
  theme: Theme;
}) {
  const voice = step.beat[mode].paragraphs;
  const isSummary = mode === "summary";

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-4">
      <p className="text-[32px] font-bold leading-tight mb-1" style={{ fontFamily: theme.titleFont, color: theme.ink }}>
        {step.chapterLabel}
      </p>
      {step.sectionTitle && (
        <p className="text-[20px] font-bold mb-4 leading-snug" style={{ fontFamily: theme.titleFont, color: theme.ink }}>
          {step.sectionTitle}
        </p>
      )}
      <div style={{ color: theme.ink, fontSize: isSummary ? 16.5 : 15.5, lineHeight: 1.72, fontFamily: theme.bodyFont }}>
        {voice.map((p, i) => (
          <p key={i} className={i > 0 ? "mt-4 indent-6" : ""}>{p}</p>
        ))}
      </div>
    </div>
  );
}

export function StepPlayer({
  module,
  mode,
  unitId,
  courseId,
  topic,
  onProgress,
  onFinish,
}: {
  module: ModuleStructure;
  mode: Mode;
  unitId: string;
  courseId?: string;
  topic: string;
  onProgress: (pct: number) => void;
  onFinish: () => void;
}) {
  const steps = useMemo(() => flattenSteps(module), [module]);
  const theme = themeFor(mode);

  const [stepIndex, setStepIndex] = useState(() => {
    const saved = localStorage.getItem(progressKey(unitId));
    return saved ? Math.min(parseInt(saved, 10), Math.max(steps.length - 1, 0)) : 0;
  });
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [activeReview, setActiveReview] = useState<ReviewItem | null>(null);
  const [masteryMap, setMasteryMap] = useState<Record<string, ItemMastery>>({});
  const [stepComplete, setStepComplete] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ from: "ai" | "user"; text: string }[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.learning.getMastery(unitId).then((rows) => {
      const map: Record<string, ItemMastery> = {};
      rows.forEach((r) => { map[r.itemId] = r; });
      setMasteryMap(map);
    }).catch(() => {});
  }, [unitId]);

  useEffect(() => {
    localStorage.setItem(progressKey(unitId), String(stepIndex));
    onProgress(steps.length ? Math.round((stepIndex / steps.length) * 100) : 0);
    setStepComplete(false);
  }, [stepIndex, steps.length, unitId, onProgress]);

  const current = steps[stepIndex];

  const enqueueReview = useCallback((item: Omit<ReviewItem, "priority">, mastery?: ItemMastery) => {
    const priority = mastery ? masteryPriority(mastery) : 0.5;
    setReviewQueue((q) => {
      if (q.some((r) => r.itemId === item.itemId)) return q;
      return [...q, { ...item, priority }].sort((a, b) => b.priority - a.priority);
    });
  }, []);

  const recordAttempt = useCallback(async (itemId: string, itemType: "flashcard" | "mcq", correct: boolean, card?: FlashcardItem, question?: MCQItem) => {
    try {
      const res = await api.learning.recordAttempt(unitId, itemId, itemType, correct);
      setMasteryMap((m) => ({ ...m, [itemId]: res.mastery }));
      if (res.shouldResurface) {
        enqueueReview(
          { itemId, card, question, dueAtStep: stepIndex + (correct ? 2 : 1) },
          res.mastery,
        );
      }
    } catch {
      if (!correct) {
        enqueueReview({ itemId, card, question, dueAtStep: stepIndex + 1 });
      }
    }
  }, [unitId, stepIndex, enqueueReview]);

  const popDueReview = useCallback(() => {
    const due = reviewQueue
      .filter((r) => r.dueAtStep <= stepIndex + 1)
      .sort((a, b) => b.priority - a.priority)[0];
    if (due) {
      setActiveReview(due);
      setReviewQueue((q) => q.filter((r) => r.itemId !== due.itemId));
      return true;
    }
    return false;
  }, [reviewQueue, stepIndex]);

  const injectWeakBeforeMcq = useCallback(() => {
    const nextStep = steps[stepIndex + 1];
    if (nextStep?.type !== "mcq") return false;
    const weak = Object.values(masteryMap).filter((m) => m.wrongCount >= 2);
    for (const m of weak) {
      const inQueue = reviewQueue.some((r) => r.itemId === m.itemId) || activeReview?.itemId === m.itemId;
      if (inQueue) continue;
      for (const step of steps) {
        if (step.type === "flashcard_check") {
          const card = step.cards.find((c) => c.id === m.itemId);
          if (card) {
            setActiveReview({ itemId: m.itemId, card, dueAtStep: stepIndex, priority: masteryPriority(m) });
            return true;
          }
        }
        if (step.type === "mcq") {
          const q = step.questions.find((x) => x.id === m.itemId);
          if (q) {
            setActiveReview({ itemId: m.itemId, question: q, dueAtStep: stepIndex, priority: masteryPriority(m) });
            return true;
          }
        }
      }
    }
    return false;
  }, [steps, stepIndex, masteryMap, reviewQueue, activeReview]);

  const continueNext = () => {
    if (activeReview) {
      setActiveReview(null);
      setStepComplete(false);
      return;
    }
    if (!stepComplete && (current?.type === "flashcard_check" || current?.type === "mcq")) return;
    if (popDueReview()) return;
    if (injectWeakBeforeMcq()) return;
    if (stepIndex >= steps.length - 1) {
      onFinish();
      return;
    }
    setStepIndex(stepIndex + 1);
  };

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

  if (!current && !activeReview) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <OwlAnim className="w-20 h-20 object-contain" />
        <p style={{ color: theme.ink, opacity: 0.6 }}>Lesson complete!</p>
        <button onClick={onFinish} className="px-8 py-3 rounded-full text-white font-semibold" style={{ background: theme.continueBg }}>Back to courses</button>
      </div>
    );
  }

  const showContinue =
    (current?.type === "screen" && !activeReview) ||
    (stepComplete && !activeReview) ||
    (activeReview && !activeReview.card && !activeReview.question);

  return (
    <div className="flex flex-col h-full" style={{ background: theme.bg }}>
      <AnimatePresence mode="wait">
        <motion.div key={activeReview ? `review-${activeReview.itemId}` : `${stepIndex}-${current?.type}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1">
          {activeReview?.card ? (
            <FlashcardStepView
              cards={[activeReview.card]}
              theme={theme}
              onComplete={(id, correct) => recordAttempt(id, "flashcard", correct, activeReview.card)}
              onAllComplete={() => setActiveReview(null)}
            />
          ) : activeReview?.question ? (
            <MCQStepView
              questions={[activeReview.question]}
              theme={theme}
              onComplete={(id, correct) => recordAttempt(id, "mcq", correct, undefined, activeReview.question)}
              onAllComplete={() => setActiveReview(null)}
            />
          ) : current?.type === "flashcard_check" ? (
            <FlashcardStepView
              cards={current.cards}
              theme={theme}
              onComplete={(id, correct) => {
                const card = current.cards.find((c) => c.id === id);
                recordAttempt(id, "flashcard", correct, card);
              }}
              onAllComplete={() => setStepComplete(true)}
            />
          ) : current?.type === "mcq" ? (
            <MCQStepView
              questions={current.questions}
              theme={theme}
              onComplete={(id, correct) => {
                const q = current.questions.find((x) => x.id === id);
                recordAttempt(id, "mcq", correct, undefined, q);
              }}
              onAllComplete={() => setStepComplete(true)}
            />
          ) : current?.type === "screen" ? (
            <ContentScreenView step={current} mode={mode} theme={theme} />
          ) : null}

          {messages.length > 0 && current?.type === "screen" && (
            <div className="px-6 flex flex-col gap-2 pb-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] ${m.from === "user" ? theme.bubbleUser + " text-white" : theme.bubbleAi}`} style={{ color: m.from === "user" ? undefined : theme.ink }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {current?.type === "screen" && !activeReview && (
        <div className="px-5 pb-4 pt-1">
          <div className="flex justify-end mb-3">
            <button
              onClick={continueNext}
              className="px-8 py-3 text-[15px] font-semibold rounded-full text-white active:scale-[0.97] transition-transform"
              style={{ background: theme.continueBg, fontFamily: theme.titleFont }}
            >
              Continue
            </button>
          </div>
          <div className="flex items-center gap-2.5 rounded-full px-4 py-3" style={{ background: theme.chatBg }}>
            {mode === "conversational" && <OwlAnim className="w-9 h-9 object-contain shrink-0" />}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask a question..."
              className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-white/40"
              style={{ fontFamily: theme.bodyFont, color: mode === "conversational" ? "#e6e6e6" : "rgba(255,255,255,0.95)" }}
            />
            {input.trim() && (
              <button onClick={send}><Send size={17} className="text-white/70" /></button>
            )}
          </div>
        </div>
      )}

      {showContinue && current?.type !== "screen" && (
        <div className="px-5 pb-4 flex justify-end">
          <button onClick={continueNext} className="px-8 py-3 rounded-full text-white font-semibold" style={{ background: theme.continueBg }}>Continue</button>
        </div>
      )}
    </div>
  );
}
