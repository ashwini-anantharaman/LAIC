/**
 * Zone 2 — the coach's response shape (LAIC §12, M3).
 *
 * A coaching turn resolves to EITHER a text intervention (grounded, with the
 * sources it cited) OR a cleared tool call (action instead of words) OR a
 * decline (out of scope) OR silence. `sources` carries citations to the UI.
 */
import type { KnowledgeChunk } from "../../contracts/generated/index";

export type TextResponseType =
  | "nudge"
  | "question"
  | "hint"
  | "explanation"
  | "reflection";

export type CoachResponse =
  | {
      type: TextResponseType;
      message: string;
      sources?: KnowledgeChunk[];
      metadata?: Record<string, unknown>;
    }
  | { type: "declined"; message: string; sources?: never }
  | { type: "tool_call"; tool: string; input: unknown; metadata?: Record<string, unknown> }
  | { type: "silent" };
