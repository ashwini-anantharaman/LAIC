/**
 * Zone 1 — Platform core: intervention traceability (LAIC plan §3.4, M3/C3).
 *
 * MANDATORY from M3 on: the moment the Coach produces an intervention, it stores
 * the full context that produced it — input event, coach instance, policy
 * version, knowledge-scope version, cited sources, evaluator output, and the
 * learner-facing output. This is what lets any hint/answer be traced back to
 * "why". Governance (M6) hardens this; it does not introduce it.
 */
export interface InterventionTrace {
  traceId: string;
  timestamp: string;
  learnerId: string;
  eventId?: string;
  instanceId?: string;
  policyProvenance?: { profileId?: string; schemaVersion?: string };
  knowledgeScopeId?: string;
  /** ids of the KnowledgeChunks cited in the output */
  sources: string[];
  evaluatorOutput?: unknown;
  /** the learner-facing response object */
  output: unknown;
}

export type TraceInput = Omit<InterventionTrace, "traceId" | "timestamp"> & {
  timestamp?: string;
};

export interface TraceStore {
  append(t: TraceInput): InterventionTrace;
  list(filter?: { learnerId?: string }): InterventionTrace[];
  get(traceId: string): InterventionTrace | undefined;
}

export class InMemoryTraceStore implements TraceStore {
  private traces: InterventionTrace[] = [];
  private seq = 0;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  append(t: TraceInput): InterventionTrace {
    this.seq += 1;
    const trace: InterventionTrace = {
      ...t,
      traceId: `trace-${this.seq}`,
      timestamp: t.timestamp ?? this.now(),
    };
    this.traces.push(trace);
    return trace;
  }

  list(filter: { learnerId?: string } = {}): InterventionTrace[] {
    return this.traces.filter(
      (t) => filter.learnerId === undefined || t.learnerId === filter.learnerId,
    );
  }

  get(traceId: string): InterventionTrace | undefined {
    return this.traces.find((t) => t.traceId === traceId);
  }
}
