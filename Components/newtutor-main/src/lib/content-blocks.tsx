import { useState, useRef, useEffect } from "react";
import {
  Send, Lock, RefreshCw, Video, X, BookMarked, Check,
  FileText, Zap, HelpCircle, Star,
} from "lucide-react";
import type { ContentMode, BlockType, ContentBlock, CourseModule, TestBlockContent } from "../types";
import { TestSession } from "../components/TestSession";
import { youtubeEmbedSrc } from "./youtube";
import { MUTED_BTN, CONTENT_MODES } from "../constants/ui";
import { useApp } from "../store/AppContext";
import { Agents } from "../agents";
import { AnimationPanel } from "../components/AnimationPanel";
import { FlashcardDeck } from "../components/FlashcardDeck";
import { AdaptiveMCQSession } from "../components/AdaptiveMCQSession";
import { AIFace } from "../components/laic/shared";
import { AssistantMessageBody } from "./assistant-message";

export function videoEmbedSrc(url: string, startSeconds?: number, endSeconds?: number): string | null {
  return youtubeEmbedSrc(url, startSeconds, endSeconds);
}

export function moduleForConcept(
  modules: CourseModule[],
  conceptId: string,
  conceptName: string,
  conceptIndex?: number
): CourseModule | undefined {
  if (conceptId) {
    const byId = modules.find((m) => m.conceptId === conceptId);
    if (byId) return byId;
  }
  const byName = modules.find(
    (m) => m.name === conceptName || m.name.toLowerCase() === conceptName.toLowerCase()
  );
  if (byName) return byName;
  if (conceptIndex != null && conceptIndex >= 0 && conceptIndex < modules.length) {
    return modules[conceptIndex];
  }
  return undefined;
}

export function blocksForConcept(
  modules: CourseModule[],
  conceptId: string,
  conceptName: string,
  conceptIndex?: number
): ContentBlock[] {
  return moduleForConcept(modules, conceptId, conceptName, conceptIndex)?.blocks ?? [];
}

export function AISidebar({ conceptId, conceptName, contentMode, onQuiz }: {
  conceptId: string; conceptName: string; contentMode: ContentMode; onQuiz?: boolean;
}) {
  const { courseId, learner } = useApp();
  const context = { conceptId, conceptName, mode: contentMode, onQuiz: !!onQuiz };
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pastReflection, setPastReflection] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Agents.studentAssistant.getGreeting(context).then(greeting => {
      setMessages([{ role: "assistant", content: greeting }]);
    });
  }, [conceptId, contentMode]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const send = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);
    const reply = await Agents.studentAssistant.respond(
      userMsg, { ...context, onQuiz: !!onQuiz }, courseId!,
      learner.reflections.map(r => r.answers.join(" "))
    );
    setMessages(prev => [...prev, reply]);
    setStreaming(false);
  };

  const renderContent = (text: string, role: "user" | "assistant") =>
    role === "assistant" ? <AssistantMessageBody text={text} compact /> : text;

  return (
    <aside className="w-80 shrink-0 border-l border-[#eef2ff] bg-white flex flex-col overflow-hidden">
      {/* Context header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#eef2ff] shrink-0 bg-[#eef2ff]/40">
        <div className="flex items-center gap-2.5 mb-2">
          <AIFace size={32} />
          <div>
            <p className="text-sm font-bold text-[#314158]">AI Assistant</p>
            <p className="text-[10px] text-[#62748e]">Context-aware · Guardrailed</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] bg-white border border-[#eef2ff] text-[#62748e] px-2 py-0.5 rounded-full">
            📍 {conceptName}
          </span>
          <span className="text-[10px] bg-[#eef2ff] text-[#9d5b8a] px-2 py-0.5 rounded-full font-medium">
            {CONTENT_MODES[contentMode].emoji} {CONTENT_MODES[contentMode].label}
          </span>
          <span className="text-[10px] flex items-center gap-0.5 bg-amber-50 border border-amber-100 text-amber-600 px-2 py-0.5 rounded-full">
            <Lock className="w-2 h-2" /> Quiz guardrail on
          </span>
        </div>
      </div>

      {/* Past reflection nudge */}
      {!pastReflection && (
        <button onClick={() => setPastReflection(true)}
          className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 bg-[#eef2ff] border border-[#eef2ff] rounded-xl text-xs text-[#432dd7] hover:bg-[#432dd7] transition-colors shrink-0">
          <RefreshCw className="w-3 h-3 shrink-0" />
          <span>You reflected on <strong>Neurons</strong> yesterday — connect it here?</span>
        </button>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-[#eef2ff] flex items-center justify-center shrink-0 mt-0.5">
                <AIFace size={20} />
              </div>
            )}
            <div className={`max-w-[200px] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
              msg.role === "user"
                ? "bg-[#432dd7] text-[#312c85] rounded-br-sm"
                : "bg-[#eef2ff] text-[#314158] rounded-bl-sm"
            }`}>
              {renderContent(msg.content, msg.role)}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-[#eef2ff] flex items-center justify-center shrink-0"><AIFace size={20} /></div>
            <div className="bg-[#eef2ff] px-3 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
              {[0, 1, 2].map(j => (
                <div key={j} className="w-1.5 h-1.5 rounded-full bg-[#432dd7] animate-bounce" style={{ animationDelay: `${j * 160}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#eef2ff] shrink-0">
        <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#eef2ff] rounded-xl px-3 py-2 focus-within:border-[#f6339a] focus-within:ring-2 focus-within:ring-[#f6339a]/10 transition-all">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ask anything…"
            className="flex-1 bg-transparent text-xs text-[#314158] placeholder:text-[#62748e] focus:outline-none" />
          <button onClick={send} disabled={!input.trim() || streaming}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#432dd7] text-[#312c85] disabled:opacity-40 hover:bg-[#432dd7] transition-all">
            <Send className="w-3 h-3" />
          </button>
        </div>
        <p className="text-center text-[10px] text-[#62748e] mt-1.5">
          Mode switches you make are logged for Dr. Ashwini
        </p>
      </div>
    </aside>
  );
}

// ─── Reflection Block ─────────────────────────────────────────────────────────

export function ReflectionBlock({ conceptId, prompt }: { conceptId: string; prompt?: string }) {
  const { completeReflection, courseId } = useApp();
  const [response, setResponse] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [followUp, setFollowUp] = useState<string | null>(null);

  const handleSubmit = async () => {
    const result = await Agents.reflection.submitReflection(conceptId, [response], courseId!);
    if (result.accepted) {
      completeReflection(conceptId);
      setSubmitted(true);
    } else {
      setFollowUp(result.followUp ?? null);
    }
  };
  return (
    <div className="bg-[#eef2ff] border border-[#432dd7] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🪞</span>
        <span className="text-sm font-bold text-[#312c85]">Reflection Prompt</span>
        <span className="ml-auto text-[10px] text-[#615fff] bg-[#eef2ff] px-2 py-0.5 rounded-full">Reflection Agent</span>
      </div>
      {!submitted ? (
        <>
          <p className="text-sm text-[#312c85] mb-3 leading-relaxed">
            {prompt ?? "In your own words: what is the most surprising thing about how neurons communicate across the synapse?"}
          </p>
          <textarea value={response} onChange={e => setResponse(e.target.value)}
            placeholder="Write your thoughts here…"
            rows={3}
            className="w-full border border-[#432dd7] bg-white rounded-xl px-3 py-2 text-sm text-[#314158] placeholder:text-[#62748e] focus:outline-none focus:ring-2 focus:ring-[#432dd7]/20 resize-none mb-3 transition-all" />
          {followUp && <p className="text-xs text-[#432dd7] mb-2 italic">{followUp}</p>}
          <button onClick={handleSubmit} disabled={!response.trim()}
            className={`px-4 py-2 bg-[#432dd7] text-[#312c85] text-sm rounded-xl font-semibold hover:bg-[#615fff] transition-all ${MUTED_BTN}`}>
            Submit reflection
          </button>
        </>
      ) : (
        <div className="flex items-start gap-2 bg-white rounded-xl p-3">
          <Check className="w-4 h-4 text-[#432dd7] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#312c85]">Saved to your learning journal ✨</p>
            <p className="text-xs text-[#432dd7] mt-0.5">Your AI assistant can reference this in future sessions.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudentContentBlock({ block, conceptId }: { block: ContentBlock; conceptId: string }) {
  const c = block.content ?? {};

  if (block.type === "Text") {
    const body = (c.body as string[]) ?? [];
    const heading = (c.heading as string) ?? block.title ?? block.label;
    const modeEmoji = (c.modeEmoji as string) ?? "💡";
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{modeEmoji}</span>
          <h2 className="font-bold text-[#0f172b] text-base">{heading}</h2>
        </div>
        <div className="space-y-3">
          {body.map((para, i) => (
            <p key={i} className="text-sm text-[#314158] leading-7">
              {para.split("**").map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-[#0f172b] font-semibold">{part}</strong> : part
              )}
            </p>
          ))}
        </div>
        {c.citation && <p className="text-xs text-[#62748e] mt-3">Source: {String(c.citation)}</p>}
      </div>
    );
  }

  if (block.type === "Animation" && (c.animationConfig || c.scene3d || c.videoUrl || c.interactive)) {
    return null;
  }

  if (block.type === "MCQ") {
    return null;
  }

  if (block.type === "Flashcard" && c.cards) {
    const cards = c.cards as { front: string; back: string }[];
    return (
      <FlashcardDeck
        title={String(c.title ?? block.title ?? "Flashcards")}
        cards={cards}
      />
    );
  }

  if (block.type === "Reflection") {
    return (
      <ReflectionBlock
        conceptId={conceptId}
        prompt={c.prompt ? String(c.prompt) : undefined}
      />
    );
  }

  if (block.type === "Test" && c.questions) {
    return <TestSession content={c as unknown as TestBlockContent} />;
  }

  if (block.type === "Video" && c.url) {
    const embed = videoEmbedSrc(
      String(c.url),
      Number(c.startSeconds) || 0,
      c.endSeconds ? Number(c.endSeconds) : undefined
    );
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Video className="w-4 h-4 text-red-500" />
          <span className="text-sm font-bold text-[#314158]">{block.title ?? "Video clip"}</span>
        </div>
        {embed ? (
          <div className="aspect-video rounded-xl overflow-hidden border border-[#eef2ff]">
            <iframe src={embed} title={block.title ?? "Video"} className="w-full h-full" allowFullScreen />
          </div>
        ) : (
          <a href={String(c.url)} target="_blank" rel="noreferrer" className="text-sm text-[#f6339a] underline">{String(c.url)}</a>
        )}
      </div>
    );
  }

  return null;
}

export function FigmaAnimationPanel({ block }: { block: ContentBlock }) {
  return <AnimationPanel block={block} />;
}

export const BLOCK_PALETTE: { type: BlockType; icon: typeof FileText; label: string; desc: string; emoji: string; colorClass: string }[] = [
  { type: "Text", emoji: "", icon: FileText, label: "Text explanation", desc: "Part of AI lesson bundle", colorClass: "border-[#eef2ff] bg-white text-[#62748e] hover:border-[#eef2ff]" },
  { type: "Animation", emoji: "⚡", icon: Zap, label: "3D Animation", desc: "React Three Fiber scene", colorClass: "border-[#f6339a] bg-[#eef2ff] text-[#f6339a] hover:border-[#f6339a]" },
  { type: "MCQ", emoji: "❓", icon: HelpCircle, label: "MCQ question", desc: "Part of AI lesson bundle", colorClass: "border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-400" },
  { type: "Flashcard", emoji: "📖", icon: BookMarked, label: "Flashcard set", desc: "Part of AI lesson bundle", colorClass: "border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-400" },
  { type: "Reflection", emoji: "⭐", icon: Star, label: "Reflection prompt", desc: "Metacognitive check-in", colorClass: "border-[#432dd7] bg-[#eef2ff] text-[#432dd7] hover:border-[#615fff]" },
  { type: "Video", emoji: "🎥", icon: Video, label: "Video clip", desc: "Embed with timestamp control", colorClass: "border-red-200 bg-red-50 text-red-500 hover:border-red-400" },
  { type: "Test", emoji: "📝", icon: FileText, label: "Module test", desc: "Fixed 5-question test, scored at the end", colorClass: "border-sky-200 bg-sky-50 text-sky-600 hover:border-sky-400" },
];

export function InstructorLessonBlock({
  block,
  conceptId,
  moduleName,
}: {
  block: ContentBlock;
  conceptId: string;
  moduleName: string;
}) {
  const c = block.content ?? {};

  if (block.type === "Animation") {
    return <FigmaAnimationPanel block={block} />;
  }

  if (block.type === "MCQ") {
    return (
      <AdaptiveMCQSession
        conceptId={conceptId}
        conceptName={moduleName}
        initialBlocks={[block]}
        preview
      />
    );
  }

  if (block.type === "Test") {
    return <TestSession content={c as unknown as TestBlockContent} preview />;
  }

  if (block.type === "Text") {
    const excerpt = c.sourceExcerpt as string | undefined;
    const citation = c.citation as string | undefined;
    const highlight = c.sourceHighlight as string | undefined;
    const renderExcerpt = () => {
      if (highlight && excerpt?.includes(highlight)) {
        const [before, after] = excerpt.split(highlight);
        return (
          <>
            {before}
            <mark className="bg-[#fff085] text-[#0f172b] not-italic rounded px-0.5">{highlight}</mark>
            {after}
          </>
        );
      }
      return excerpt;
    };
    return (
      <div className="space-y-6">
        <StudentContentBlock block={block} conceptId={conceptId} />
        {excerpt && (
          <div className="bg-[#f0f2fa] border border-[#e2e8f0] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookMarked className="w-4 h-4 text-[#62748e]" />
              <span className="text-xs font-bold text-[#62748e] uppercase tracking-[0.6px]">Source excerpt</span>
              {citation && <span className="ml-auto text-[10px] text-[#62748e]">{citation}</span>}
            </div>
            <blockquote className="text-sm text-[#45556c] leading-7 italic border-l-2 border-[#a3b3ff] pl-4">
              {renderExcerpt()}
            </blockquote>
          </div>
        )}
      </div>
    );
  }

  return <StudentContentBlock block={block} conceptId={conceptId} />;
}

export function InstructorBlockChrome({
  block,
  index,
  palette,
  dragTarget,
  onDragTarget,
  onRemove,
  moduleName,
}: {
  block: ContentBlock;
  index: number;
  palette: (typeof BLOCK_PALETTE)[number];
  dragTarget: number | null;
  onDragTarget: (i: number | null) => void;
  onRemove: () => void;
  moduleName: string;
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragTarget(index); }}
      onDragLeave={() => onDragTarget(null)}
      className={`bg-white border rounded-2xl overflow-hidden transition-all ${
        dragTarget === index ? "border-[#f6339a] shadow-lg shadow-[#eef2ff]" : "border-[#eef2ff]"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#eef2ff] bg-[#f8fafc]/80 group">
        <span className="text-[#432dd7] cursor-grab select-none text-base leading-none" draggable>⠿</span>
        <div className="w-7 h-7 rounded-full bg-white border border-[#eef2ff] flex items-center justify-center shrink-0">
          {palette.emoji
            ? <span className="text-sm">{palette.emoji}</span>
            : <palette.icon className="w-3.5 h-3.5 text-[#62748e]" />}
        </div>
        <span className="text-[10px] font-bold text-[#62748e] uppercase tracking-wider">{block.type}</span>
        <p className="flex-1 min-w-0 text-xs font-medium text-[#62748e] truncate">
          {block.title ?? block.label}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-[#432dd7] hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-4">
        <InstructorLessonBlock block={block} conceptId={block.id || `preview-${index}`} moduleName={moduleName} />
      </div>
    </div>
  );
}