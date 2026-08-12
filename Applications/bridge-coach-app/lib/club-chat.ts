// The club chat thread, with a local fallback.
//
// The real store is the Nexus API (`/api/programs/:id/chat`, backend migration
// 0039): server-side, everyone in the club shares one thread, so two accounts on
// two phones see each other's messages.
//
// That endpoint is not live on the deployed API yet — the backend code exists but
// has not shipped. Until it does, a 404 (or a 501 from a backend without the
// database) drops this module into LOCAL mode: the thread lives in this module,
// in memory. That is enough to use the screen for real — sign out, sign in as
// someone else, and the conversation is still there with each message attributed
// to whoever wrote it — but it does not leave the device, and a reload clears it.
//
// The screen does not branch on which mode is active; it just calls these four
// functions. When the endpoint ships, the local path stops being reached.

import {
  NexusError,
  clearClubChat,
  fetchClubChat,
  postClubChatMessage,
  setClubChatMessagePinned,
  type ClubChatMessage,
} from "./nexus";

export type { ClubChatMessage };

/** Who the caller is, for messages this device authors in local mode. */
export type ChatAuthor = {
  /** Any stable id for the signed-in person — used to align their own bubbles. */
  id: string;
  name: string;
  standing: string;
};

/** Per-program local threads, kept module-level so they survive navigation. */
const localThreads = new Map<string, ClubChatMessage[]>();

/**
 * Programs whose chat endpoint answered "not there".
 *
 * Sticky per program: once the API has said 404/501 there is no point paying a
 * round trip on every send and pin. A real failure (network, 401, 403) is NOT
 * recorded here — those are surfaced to the caller as errors, because they mean
 * "try again" or "you can't", not "this feature isn't deployed".
 */
const localOnly = new Set<string>();

function isMissingEndpoint(error: unknown): boolean {
  return error instanceof NexusError && (error.status === 404 || error.status === 501);
}

function thread(programId: string): ClubChatMessage[] {
  const existing = localThreads.get(programId);
  if (existing) return existing;
  const fresh: ClubChatMessage[] = [];
  localThreads.set(programId, fresh);
  return fresh;
}

/** True when this club's chat is device-local — the screen shows a note. */
export function isLocalOnly(programId: string): boolean {
  return localOnly.has(programId);
}

export async function loadThread(
  token: string,
  programId: string,
): Promise<ClubChatMessage[]> {
  if (localOnly.has(programId)) return [...thread(programId)];
  try {
    return await fetchClubChat(token, programId);
  } catch (error) {
    if (!isMissingEndpoint(error)) throw error;
    localOnly.add(programId);
    return [...thread(programId)];
  }
}

export async function sendMessage(
  token: string,
  programId: string,
  body: string,
  author: ChatAuthor,
  /** An attached picture as a data URL. A picture alone is a message. */
  image?: string | null,
): Promise<ClubChatMessage[]> {
  const text = body.trim();
  if (!text && !image) return loadThread(token, programId);

  if (!localOnly.has(programId)) {
    try {
      await postClubChatMessage(token, programId, text, image ?? null);
      return await loadThread(token, programId);
    } catch (error) {
      if (!isMissingEndpoint(error)) throw error;
      localOnly.add(programId);
    }
  }

  thread(programId).push({
    // Local ids are prefixed so they can never be mistaken for server ids.
    id: `local-${programId}-${thread(programId).length + 1}`,
    author_profile_id: author.id,
    author_name: author.name,
    author_standing: author.standing,
    body: text,
    image: image ?? null,
    pinned: false,
    created_at: new Date().toISOString(),
    mine: true,
  });
  return [...thread(programId)];
}

/**
 * Clear the club's thread — every message, for everyone.
 *
 * The local mirror is emptied too. Without that the device that cleared it would
 * keep showing the old messages until a reload, which is the one screen where a
 * stale copy is most obviously wrong.
 */
export async function clearThread(token: string, programId: string): Promise<number> {
  const deleted = await clearClubChat(token, programId);
  localThreads.set(programId, []);
  return deleted;
}

export async function setPinned(
  token: string,
  programId: string,
  messageId: string,
  pinned: boolean,
): Promise<ClubChatMessage[]> {
  if (!localOnly.has(programId)) {
    try {
      await setClubChatMessagePinned(token, programId, messageId, pinned);
      return await loadThread(token, programId);
    } catch (error) {
      if (!isMissingEndpoint(error)) throw error;
      localOnly.add(programId);
    }
  }

  const rows = thread(programId);
  const target = rows.find((m) => m.id === messageId);
  if (target) target.pinned = pinned;
  return [...rows];
}
