/**
 * Zone 1 — Platform core: in-memory storage adapters (the default).
 *
 * Backed by Maps — fast, browser-safe, and the behavior the engine had before
 * ports existed. Swap in the SQLite adapter (sqlite.ts) on the server for
 * durability without touching the engine.
 */
import type { LearnerProfile } from "../learner-model/types.js";
import type { LearnerRepo } from "./ports.js";

export class InMemoryLearnerRepo implements LearnerRepo {
  private profiles = new Map<string, LearnerProfile>();

  get(learnerId: string): LearnerProfile | null {
    return this.profiles.get(learnerId) ?? null;
  }

  put(profile: LearnerProfile): void {
    this.profiles.set(profile.learnerId, profile);
  }
}

// The existing SessionStore already is the in-memory SessionRepo; re-export it
// here under a name symmetric with InMemoryLearnerRepo.
export { SessionStore as InMemorySessionStore } from "../session/SessionEngine.js";
