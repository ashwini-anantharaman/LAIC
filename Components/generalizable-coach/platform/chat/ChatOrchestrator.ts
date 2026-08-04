/**
 * Zone 1 — Platform core: the conversational "chat with me" orchestrator
 * (LAIC §6.3, bet #7, M3/C5).
 *
 * Turns one free-text message into a grounded reply, possibly doing several
 * gated things (explain + quiz me). It reuses the SAME scope, gating, memory,
 * and trace machinery as the rest of the coach, and stays BOUNDED: each intent
 * is one step, capped by `maxOrchestrationSteps`; every retrieval is
 * scope-filtered; every tool passes gating; each turn is traced. The LLM (if a
 * `phraser` is injected) only re-words the deterministic result.
 *
 * Tool execution goes through a ToolExecutor (Variant B): the orchestrator
 * PROPOSES a ToolCall; the executor (a mock host here, a real host later) runs
 * it and returns a ToolResult.
 */
import type {
  CoachCapabilityScope,
  CoachingPolicy,
  KnowledgeChunk,
  KnowledgeScope,
} from "../../contracts/generated/index";
import { ScopedKnowledgeSource, type KnowledgeSource } from "../knowledge-source/index";
import {
  gateTools,
  type CoachMode,
  type ToolCall,
  type ToolExecutor,
  type ToolRegistry,
  type ToolResult,
} from "../tools/index";
import type { InteractionMemory } from "../memory/index";
import type { TraceStore } from "../trace/index";
import { IntentRouter, type Intent } from "./IntentRouter";
import { ToolSelector } from "./ToolSelector";

export type Phraser = (ctx: { message: string; chunks: KnowledgeChunk[] }) => Promise<string | null>;

export interface ChatThreadTurn {
  role: "learner" | "coach";
  text: string;
}

export interface ChatToolStep {
  call: ToolCall;
  result: ToolResult;
}

export interface ChatTurnResult {
  reply: string;
  intents: Intent[];
  toolCalls: ChatToolStep[];
  sources: KnowledgeChunk[];
  steps: number;
  declined: boolean;
}

export interface ChatOrchestratorOptions {
  learnerId: string;
  domainId: string;
  scope: KnowledgeScope;
  knowledgeSource: KnowledgeSource;
  policy: CoachingPolicy;
  capabilityScope: CoachCapabilityScope;
  toolRegistry?: ToolRegistry;
  toolExecutor?: ToolExecutor;
  memory?: InteractionMemory;
  traceStore?: TraceStore;
  phraser?: Phraser;
  instanceId?: string;
  mode?: CoachMode;
  now?: () => string;
}

const OUT_OF_SCOPE = "That's outside what this lesson covers — try asking about the current topic.";

export class ChatOrchestrator {
  private readonly source: KnowledgeSource;
  private readonly router = new IntentRouter();
  private readonly selector = new ToolSelector();
  private readonly thread: ChatThreadTurn[] = [];
  private readonly now: () => string;
  private callSeq = 0;

  constructor(private readonly opts: ChatOrchestratorOptions) {
    this.source = new ScopedKnowledgeSource(opts.knowledgeSource, opts.scope);
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  history(): ChatThreadTurn[] {
    return [...this.thread];
  }

  async chat(message: string): Promise<ChatTurnResult> {
    this.thread.push({ role: "learner", text: message });
    this.remember("learner", message);

    const conversationalOn =
      this.opts.policy.conversationalMode !== false &&
      this.opts.capabilityScope.canChatConversationally !== false;
    if (!conversationalOn) {
      const reply = "The conversational assistant isn't enabled for this coach.";
      return this.finish(message, reply, [], [], [], 0, true);
    }

    const intents = this.router.route(message);
    const maxSteps = this.opts.policy.maxOrchestrationSteps ?? 3;

    const fragments: string[] = [];
    const sources: KnowledgeChunk[] = [];
    const toolCalls: ChatToolStep[] = [];
    let steps = 0;
    let declined = false;

    for (const intent of intents) {
      if (steps >= maxSteps) break; // bet #7: bounded
      steps += 1;

      if (intent.kind === "ask") {
        const chunks = await this.source.retrieve({ text: intent.text, topK: 3 });
        if (chunks.length === 0) {
          fragments.push(OUT_OF_SCOPE);
          declined = true;
        } else {
          fragments.push(composeAnswer(chunks));
          sources.push(...chunks);
        }
      } else if (intent.kind === "command") {
        const step = await this.runCommand(intent, toolCalls);
        if (step) fragments.push(step);
      } else {
        fragments.push(this.runMeta());
      }
    }

    const deterministic = fragments.join(" ").trim();
    const phrased = this.opts.phraser ? await this.opts.phraser({ message, chunks: sources }) : null;
    const reply = phrased ?? deterministic;

    return this.finish(message, reply, intents, toolCalls, sources, steps, declined);
  }

  private async runCommand(intent: Intent, toolCalls: ChatToolStep[]): Promise<string | null> {
    if (!this.opts.toolRegistry || !this.opts.toolExecutor) {
      return "I can't run that action here.";
    }
    // Chaining gate: if tool-chaining is disabled, allow only the first tool.
    if (this.opts.capabilityScope.canChainTools === false && toolCalls.length >= 1) {
      return null;
    }
    const allowed = gateTools(this.opts.toolRegistry, {
      policy: this.opts.policy,
      mode: this.opts.mode,
      currentHintLevel: 0,
    });
    const selection = this.selector.select(intent, allowed, {
      conceptIds: this.opts.scope.allowedConceptIds ?? [],
    });
    if (!selection) return "There's no tool available for that right now.";

    const call: ToolCall = {
      callId: `call-${(this.callSeq += 1)}`,
      tool: selection.tool.name,
      input: selection.input,
    };
    const result = await this.opts.toolExecutor.execute(call, {
      learnerId: this.opts.learnerId,
      domainId: this.opts.domainId,
    });
    toolCalls.push({ call, result });
    return result.ok ? `I've set up ${call.tool} for you.` : `I couldn't run ${call.tool} right now.`;
  }

  private runMeta(): string {
    const hits = this.opts.memory?.recall({ learnerId: this.opts.learnerId, topK: 3 }) ?? [];
    return hits.length ? `Recently we covered: ${hits.map((h) => h.text).join("; ")}` : "We haven't covered anything yet.";
  }

  private finish(
    message: string,
    reply: string,
    intents: Intent[],
    toolCalls: ChatToolStep[],
    sources: KnowledgeChunk[],
    steps: number,
    declined: boolean,
  ): ChatTurnResult {
    this.thread.push({ role: "coach", text: reply });
    this.remember("coach", reply, "chat");
    this.opts.traceStore?.append({
      learnerId: this.opts.learnerId,
      instanceId: this.opts.instanceId,
      policyProvenance: this.opts.policy.provenance,
      knowledgeScopeId: this.opts.scope.id,
      sources: sources.map((c) => c.id),
      output: { reply, intents, toolCalls: toolCalls.map((t) => t.call) },
    });
    return { reply, intents, toolCalls, sources, steps, declined };
  }

  private remember(role: "learner" | "coach", text: string, kind?: string): void {
    this.opts.memory?.record({
      learnerId: this.opts.learnerId,
      domainId: this.opts.domainId,
      timestamp: this.now(),
      role,
      text,
      kind,
    });
  }
}

function composeAnswer(chunks: KnowledgeChunk[]): string {
  return chunks.map((c) => (c.citation ? `${c.content} (${c.citation})` : c.content)).join(" ");
}
