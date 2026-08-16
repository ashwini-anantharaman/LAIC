/**
 * The club app's content capabilities, in the Content Studio's own vocabulary.
 *
 * WHY A TRANSLATION EXISTS AT ALL. Two `+` entries in one sheet on the Club tab
 * answered to two different permission systems. **Challenge** was gated on
 * `app.challenge.create` — a real per-person capability, resolved from the person's
 * club role, so an administrator can grant it to one member and not another.
 * **Content** was gated on the learning context, which for a partner club is derived
 * from the CLUB'S PROVISIONING ENVELOPE (see platformAccess.ts: a club member's
 * `programRoleCapabilities` *is* `feature_access.learning.capabilities`). So every
 * member of a provisioned club had identical content authority, and the question
 * "who in this club may author?" had nowhere to be answered.
 *
 * The fix is not a new permission system. It is to let the club role — the one an
 * administrator already edits, in the place they already edit it — govern content
 * too, by mapping its ids onto the ones the Content Studio and the Nexus write path
 * already check. Provisioning stays exactly what it was: the ceiling.
 *
 * THE MAP IS PARTIAL ON PURPOSE. Only the ids below are ever enforced server-side or
 * drive a button; the rest of the learning catalogue (analytics, repository, review,
 * templates) is screen gating consumed by the Studio's own roleAccess.ts. If the club
 * role replaced the WHOLE set, a member who reaches those screens today through the
 * coarse level would lose them the day this ships — a silent revocation on surfaces
 * nobody is testing. So callers union: mapped ids for what is governed, level-derived
 * ids for everything else. `GOVERNED_LEARNING_CAPS` is that boundary, and it must
 * stay in step with the `_requireLearningCap` call sites in routes/platform.ts.
 */

/** `app.content.*` → the learning ids it stands for. */
export const APP_CONTENT_TO_LEARNING: Readonly<Record<string, readonly string[]>> = {
  "app.content.view": ["learning.object.read"],
  "app.content.create": [
    "learning.object.read",
    "learning.object.create",
    "learning.composition.create",
    // The creators cannot author without their sources phase — PDF upload,
    // highlighting, generation. Granting create without these produces a screen
    // where you can type by hand and do nothing else.
    "learning.source.manage",
    "learning.source.extract",
    "learning.review.submit",
  ],
  "app.content.create.personal": [
    "learning.object.read",
    "learning.object.create",
    "learning.composition.create",
  ],
  "app.content.edit": ["learning.object.read", "learning.object.edit", "learning.composition.edit"],
  "app.content.publish": [
    "learning.publish.release",
    "learning.publish.version",
    "learning.publish.audience",
  ],
  "app.content.delete": ["learning.object.delete"],
  // `app.content.manage_others` has NO learning image, deliberately. It answers
  // "whose content may I touch", which is an ownership question the learning
  // catalogue has no id for — it is read directly, where ownership is checked.
};

/**
 * The learning ids this mapping is allowed to decide.
 *
 * Anything outside this set keeps coming from the caller's coarse level, so no
 * Studio screen disappears when a club role takes over the governed ids.
 */
export const GOVERNED_LEARNING_CAPS: ReadonlySet<string> = new Set(
  Object.values(APP_CONTENT_TO_LEARNING).flat(),
);

/** Does this club role say anything about content at all? */
export function hasContentCaps(appCaps: readonly string[]): boolean {
  return appCaps.some((c) => c.startsWith("app.content."));
}

/**
 * Translate a club role's content grants into learning ids.
 *
 * `learning.object.read` rides along with every grant — create-without-read is not a
 * state anyone means to configure, and it produces an authoring screen with an empty
 * library behind it.
 */
export function mapContentCaps(appCaps: readonly string[]): string[] {
  const out = new Set<string>();
  for (const cap of appCaps) {
    for (const learning of APP_CONTENT_TO_LEARNING[cap] ?? []) out.add(learning);
  }
  if (out.size) out.add("learning.object.read");
  return [...out];
}

/**
 * The set a club member should end up with: what their role grants for the ids this
 * map governs, plus whatever their level already gave them for everything else.
 */
export function unionWithLevel(mapped: readonly string[], levelCaps: readonly string[]): string[] {
  const out = new Set<string>(mapped);
  for (const cap of levelCaps) {
    if (!GOVERNED_LEARNING_CAPS.has(cap)) out.add(cap);
  }
  return [...out];
}
