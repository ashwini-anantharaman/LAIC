/**
 * Zone 1 — Platform core: the domain registry (the "front desk").
 *
 * Domains self-register a factory keyed by domainId; a host then opens a coach
 * by id without importing the domain directly:
 *
 *   openCoachSession("bridge_gameplay", { learnerId: "S" })
 *
 * This is domain-agnostic — the registry never imports a specific domain. Each
 * domain ships a side-effect module that calls registerDomain (see the bridge
 * domain's register.ts, imported for effect from index.ts).
 */
import type { LLMLike } from "../llm/index.js";
import {
  createCoreCoachSession,
  type CoachCore,
  type CoachSession,
  type CoreCoachSessionOptions,
} from "./CoachSession.js";

/** Context a domain factory receives when a session is opened. */
export interface DomainBuildContext {
  llm?: LLMLike;
}

/** A domain's registration: how to build its coach + its chat voice. */
export interface RegisteredDomain {
  id: string;
  chatPersona?: string;
  build(ctx: DomainBuildContext): CoachCore;
}

const registry = new Map<string, RegisteredDomain>();

export function registerDomain(domain: RegisteredDomain): void {
  registry.set(domain.id, domain);
}

export function getRegisteredDomain(id: string): RegisteredDomain | undefined {
  return registry.get(id);
}

export function listDomains(): string[] {
  return [...registry.keys()];
}

export interface OpenCoachOptions {
  learnerId: string;
  learnerName?: string;
  llm?: LLMLike;
  feedbackStyle?: CoreCoachSessionOptions["feedbackStyle"];
  explanationDepth?: CoreCoachSessionOptions["explanationDepth"];
  emitSilent?: boolean;
}

/** Open a coach session for a registered domain. */
export function openCoachSession(
  domainId: string,
  opts: OpenCoachOptions,
): CoachSession {
  const domain = registry.get(domainId);
  if (!domain) {
    throw new Error(
      `Unknown domain: ${domainId}. Registered: ${listDomains().join(", ") || "(none)"}`,
    );
  }
  return createCoreCoachSession({
    learnerId: opts.learnerId,
    learnerName: opts.learnerName,
    domainId,
    coach: domain.build({ llm: opts.llm }),
    llm: opts.llm,
    feedbackStyle: opts.feedbackStyle,
    explanationDepth: opts.explanationDepth,
    chatPersona: domain.chatPersona,
    emitSilent: opts.emitSilent,
  });
}
