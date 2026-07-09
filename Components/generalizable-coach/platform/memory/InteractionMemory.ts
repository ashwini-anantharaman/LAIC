/**
 * Zone 1 — Platform core: Coach Interaction Memory (LAIC §5.3, M3/C2).
 *
 * The Coach's own record of what it and the learner have said/done — distinct
 * from knowledge. Two uses: informing decisions (recent interactions) and
 * conversational recall ("what did we cover last week?"). A SECOND retrievable
 * source, separate from KnowledgeSource.
 */
export interface InteractionRecord {
  learnerId: string;
  domainId: string;
  timestamp: string; // ISO-8601
  role: "learner" | "coach";
  text: string;
  /** optional tag, e.g. "hint", "answer", "recommendation" */
  kind?: string;
}

export interface RecallQuery {
  learnerId: string;
  text?: string;
  sinceDays?: number;
  topK?: number;
}

export interface InteractionMemory {
  record(rec: InteractionRecord): void;
  recall(q: RecallQuery): InteractionRecord[];
}

const DEFAULT_TOP_K = 10;

export class InMemoryInteractionMemory implements InteractionMemory {
  private records: InteractionRecord[] = [];

  /** injectable clock so `sinceDays` is testable; defaults to wall time */
  constructor(private readonly now: () => number = () => Date.now()) {}

  record(rec: InteractionRecord): void {
    this.records.push(rec);
  }

  recall(q: RecallQuery): InteractionRecord[] {
    const terms = (q.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const cutoff =
      q.sinceDays !== undefined ? this.now() - q.sinceDays * 86_400_000 : undefined;

    const matches = this.records.filter((r) => {
      if (r.learnerId !== q.learnerId) return false;
      if (cutoff !== undefined && Date.parse(r.timestamp) < cutoff) return false;
      if (terms.length) {
        const hay = r.text.toLowerCase();
        if (!terms.some((t) => hay.includes(t))) return false;
      }
      return true;
    });

    // Most recent first.
    matches.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return matches.slice(0, q.topK ?? DEFAULT_TOP_K);
  }
}
