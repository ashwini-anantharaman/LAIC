/**
 * M3/C5 gate — intent routing.
 *
 * Messages are classified into ask / command / meta; a compound message splits
 * into multiple intents; a pure meta recall isn't mis-tagged as an ask.
 */
import { describe, it, expect } from "vitest";
import { IntentRouter } from "../../platform/chat/index";

const router = new IntentRouter();
const kinds = (msg: string) => router.route(msg).map((i) => i.kind);

describe("intent router", () => {
  it("routes a plain question to ask", () => {
    expect(kinds("What is spaced repetition?")).toEqual(["ask"]);
  });

  it("routes a bare command to command", () => {
    expect(kinds("quiz me on this")).toEqual(["command"]);
    expect(router.route("quiz me on this")[0].toolHint).toBe("quiz");
  });

  it("splits a compound message into ask + command", () => {
    expect(kinds("explain spaced repetition and quiz me")).toEqual(["ask", "command"]);
  });

  it("routes a recall question to meta only (not ask)", () => {
    expect(kinds("what did we cover last week?")).toEqual(["meta"]);
  });

  it("detects flashcard commands", () => {
    const [intent] = router.route("make me some flashcards");
    expect(intent.kind).toBe("command");
    expect(intent.toolHint).toBe("flashcards");
  });

  it("defaults an unrecognized message to ask", () => {
    expect(kinds("the mitochondria thing")).toEqual(["ask"]);
  });
});
