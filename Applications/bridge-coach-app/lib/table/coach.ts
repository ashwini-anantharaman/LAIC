// The coach's native client (Part II Phase D). The dock payload arrives
// PRE-RENDERED from GET /sessions/[id]/coach — the same lines the web dock
// draws, so the two can never phrase a position differently. The on-demand
// answers (what should I play / why / a question about the board) keep their
// own endpoints: they cost seconds and answer only when asked.

import { bridgeRequest } from "../bridge-api";

export type CoachLine = { text: string; color: string };

export type CoachEventGroup = {
  id: string;
  title: string;
  note?: string;
  current?: boolean;
  events: {
    id: string;
    label: string;
    kind: "call" | "play";
    who: string;
    verb: string;
    token?: string;
    /** A call's replayed meaning, folded in server-side. */
    detail?: string;
  }[];
};

export type CoachPayload = {
  watcher: boolean;
  active: boolean;
  phase: "auction" | "play" | "other";
  tellLabel: string;
  status: { looking: string; think: string };
  lines: { looking: CoachLine[]; think: CoachLine[] };
  eventGroups: CoachEventGroup[];
  placeholder: string;
};

export type CoachHint = {
  best: string[];
  source: "system" | "convention" | "solution";
  because?: string;
  corroborated?: boolean;
  contradicted?: boolean;
};

export function fetchCoach(
  token: string,
  programId: string,
  sessionId: string,
): Promise<CoachPayload> {
  return bridgeRequest(`/api/bridge/sessions/${encodeURIComponent(sessionId)}/coach`, {
    token,
    programId,
  });
}

export function fetchHint(
  token: string,
  programId: string,
  sessionId: string,
): Promise<{ hint: CoachHint | null; reason?: string }> {
  return bridgeRequest(`/api/bridge/play-hint?sessionId=${encodeURIComponent(sessionId)}`, {
    token,
    programId,
  });
}

export function askAboutBoard(
  token: string,
  programId: string,
  sessionId: string,
  question: string,
  eventId?: string,
): Promise<{ answer: string | null; reason?: string }> {
  return bridgeRequest("/api/bridge/event-qa", {
    token,
    programId,
    method: "POST",
    body: { sessionId, question, ...(eventId ? { eventId } : {}) },
  });
}

/** The hint, phrased the web dock's way — mirrored from coachContent's
 *  doneLines/emptyText so the two docks keep one voice. */
export function hintLines(res: { hint: CoachHint | null; reason?: string }): CoachLine[] {
  const INK = "#28312c";
  const MUTED = "#57573f";
  const FAINT = "#7d7d66";
  const TEAL = "#1f5e56";
  const AMBER = "#9c5a12";
  const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

  if (!res.hint) {
    const reason = res.reason ?? "no answer";
    const text =
      reason === "not your turn"
        ? "Not your turn."
        : reason === "not playing"
          ? "Only during the play."
          : reason === "not seated"
            ? "Take a seat and it's yours to ask."
            : /^(your|no|too)/.test(reason)
              ? `No suggestion — ${reason}.`
              : "No suggestion for this position.";
    return [{ text, color: MUTED }];
  }

  const hint = res.hint;
  const lead =
    hint.source === "system"
      ? "Your system plays"
      : hint.source === "convention"
        ? "Usually right here"
        : "By calculation";
  const cardText = (card: string) => {
    const rank = card.slice(1) === "T" ? "10" : card.slice(1);
    return `${rank}${GLYPH[card[0] ?? ""] ?? card[0] ?? ""}`;
  };
  const red = hint.best.some((c) => c[0] === "H" || c[0] === "D");
  const out: CoachLine[] = [
    { text: `${lead}:  ${hint.best.map(cardText).join(" ")}`, color: red ? "#c00" : INK },
  ];
  if (hint.because) out.push({ text: hint.because, color: MUTED });
  const notes: string[] = [];
  if (hint.corroborated) notes.push("The cards agree.");
  if (hint.contradicted) notes.push("Though the cards lie badly for it here.");
  if (hint.source === "solution") notes.push("Worked out from the full deal.");
  if (notes.length) {
    out.push({
      text: notes.join(" "),
      color: hint.contradicted ? AMBER : hint.corroborated ? TEAL : FAINT,
    });
  }
  return out;
}
