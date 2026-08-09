// One conversation per practice deal.
//
// Deliberately separate from the club chat (lib/club-chat.ts): that is one
// thread for the whole club, while this is a thread ABOUT a particular deal, so
// a question here stays attached to the hand it is about.
//
// Device-local, and honestly so. The club chat has a server behind it and falls
// back to local only when the endpoint is missing; these threads have no server
// at all yet, because the deals they hang off are themselves seeded in the app —
// a thread keyed to an id that disappears on reload could not be stored usefully.
// When deals become real rows, this file is the seam: give a thread the deal's id
// and point these four functions at an endpoint.

/** A message in a deal's thread. Mirrors ClubChatMessage's shape. */
export type DealChatMessage = {
  id: string;
  author_name: string;
  /** "Coach" | "Learner" — shown beside the name. */
  author_standing: string;
  body: string;
  created_at: string;
  /** Did the caller write it? Aligns the bubble right and drops the label. */
  mine: boolean;
};

/** Threads by deal key, kept module-level so they survive navigation. */
const threads = new Map<string, DealChatMessage[]>();

function thread(dealKey: string): DealChatMessage[] {
  const existing = threads.get(dealKey);
  if (existing) return existing;
  const fresh: DealChatMessage[] = [];
  threads.set(dealKey, fresh);
  return fresh;
}

export function loadDealThread(dealKey: string): DealChatMessage[] {
  return [...thread(dealKey)];
}

export function sendDealMessage(
  dealKey: string,
  body: string,
  author: { name: string; standing: string },
): DealChatMessage[] {
  const text = body.trim();
  if (!text) return loadDealThread(dealKey);
  const rows = thread(dealKey);
  rows.push({
    id: `${dealKey}-${rows.length + 1}`,
    author_name: author.name,
    author_standing: author.standing,
    body: text,
    created_at: new Date().toISOString(),
    mine: true,
  });
  return [...rows];
}

/** Dropped on sign-out, like every other per-session cache. */
export function clearDealChats(): void {
  threads.clear();
}
