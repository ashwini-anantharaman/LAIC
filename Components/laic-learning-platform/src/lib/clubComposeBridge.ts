/**
 * A one-value bridge between the club compose screen and the Studio's creators.
 *
 * The club flow renders the SAME creators the Studio does — sources, PDF upload,
 * highlighting, AI generation, the item editors, all of it. The only thing it needs to
 * change is what happens when the author is finished: the Studio ends a save with
 * "Saved in folder X — open Content Library to continue", which is the right ending for
 * someone who lives in the Studio and a dead end for someone who arrived from a phone
 * to add one quiz to their club.
 *
 * So the creators ask here. When a compose session is active they hand it the object id
 * and stop; the compose screen publishes and returns the author to the app. When it is
 * not (the ordinary Studio), they behave exactly as before — this is additive, and the
 * absence of a publisher is the normal case.
 *
 * WHY A MODULE RATHER THAN CONTEXT: the creators already pull eleven values off
 * `useApp()`, and this is a single, short-lived fact about the session rather than app
 * state anyone renders. Keeping it here means one import in each creator instead of
 * widening a context every screen consumes — and it is trivial to delete if the two
 * flows are ever unified.
 */

/** Called with the id of the object the author just saved. */
export type ComposePublisher = (objectId: string) => void;

let publisher: ComposePublisher | null = null;

/** Register (or clear, with null) the active compose session's publisher. */
export function setComposePublisher(next: ComposePublisher | null): void {
  publisher = next;
}

/**
 * The active publisher, or null in the ordinary Studio.
 *
 * A creator that finds one should persist its draft, hand over the id, and NOT run its
 * own folder dialog or navigate anywhere — the compose screen owns what comes next.
 */
export function composePublisher(): ComposePublisher | null {
  return publisher;
}
