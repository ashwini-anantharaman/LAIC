# Knowledge versioning — internal documentation

*For contributors working on `@bridge/kb`, `@bridge/pg-stores`, or the
workspace UI. The fellow-facing explanation lives in
`laicdocs/Bridge_Knowledge_Items_Guide.md`; this doc covers the machinery,
its invariants, and the traps. Current as of 2026-07-20.*

## The four layers

Versioning happens at four independent layers. Keeping them straight is most
of the job:

| Layer | Entity | Trigger | Numbering | Storage |
|---|---|---|---|---|
| **Item head revision** | `KnowledgeItem.version` | every content save | bumps on `saveItem` | inside the item record |
| **Item committed versions** | `KnowledgeItemVersion` | explicit `commitItemVersion` (and implicitly on release publish) | contiguous 1,2,3… per item | `bridge_kb_item_versions` (0016) |
| **KB releases** | `KbVersion` | explicit `publishKbVersion` | contiguous per KB | `bridge_kb_versions` (0016) |
| **Set (pack) snapshots** | `KbPackVersion` | **automatic on every set save** | contiguous per pack | `bridge_kb_pack_versions` (0017) |

Two adjacent mechanisms that are *not* versioning but interact with it:

- **Compiles** (`CompiledKb`) are immutable artifacts minted by `recompile()`
  on every content save; the KB's `liveCompileId` only advances on a
  structurally valid compile (last-good protection). Sessions pin
  `compileRef` at creation — versioning of *live play* is really compile
  pinning.
- **Forks** (`forkedFromItemId`) are a different axis entirely: a fork is a
  NEW item lineage (cross-KB copy-on-diverge, "Save as new knowledge item",
  KB duplication). A fork's committed-version history starts fresh; a
  version is the *same* item over time. See the header comment in
  `packages/bridge-kb/src/versioning.ts`.

## Code map

- `packages/bridge-kb/src/versioning.ts` — pure helpers, no I/O:
  `ITEM_CONTENT_KEYS` / `itemContentHash` / `itemIsDirty` / `snapshotItem` /
  `itemContentFromVersion`, and the pack trio `PACK_CONTENT_KEYS` /
  `packContentHash` / `packIsDirty` / `snapshotPack`.
- `packages/bridge-kb/src/service.ts` — orchestration:
  - items: `commitItemVersion`, `listItemVersions`, `setItemMainVersion`,
    `deleteItemVersion`
  - releases: `publishKbVersion`, `setActiveVersion`, `deleteKbVersion`,
    `listKbVersions`, `compileForVersion`
  - sets: `writePackWithSnapshot` (private — every fellow-authored pack
    write), `savePack`, `listPackVersions`, `restorePackVersion`,
    `packReferences`, `deletePack`
  - derivation: `deriveKb` / `duplicateKb` / `derivationStatus`
- `packages/bridge-pg-stores/src/kb.ts` — jsonb-primary tables; scalar
  columns are identity/ordering only. Migrations `db/migrations/0016_kb_versioning.sql`
  and `0017_pack_versions.sql` (both applied to the shared Supabase project).
- Tests: `versioning.test.ts`, `packVersioning.test.ts`, `delete.test.ts`.

## Item versions (explicit commits)

- The **head** is mutable; `version` bumps on every `saveItem`. A **committed
  version** freezes the `ITEM_CONTENT_KEYS` subset plus a `contentHash`.
- `mainVersion` is a pointer, not a copy: "make main" (`setItemMainVersion`)
  restores that snapshot's content onto the head **without minting a new
  version** — the next edit mints one. The head is *dirty* when
  `itemContentHash(head) !== snapshot(main).contentHash` (`itemIsDirty`).
- `commitItemVersion` is no-op-safe: committing a clean head returns the
  existing main snapshot.
- **Shared items fork on restore too**: `setItemMainVersion` goes through
  `saveItem`, so restoring an item that other KBs share forks a private copy
  (fresh lineage, main pointer unset). One KB never rewrites another's item.
- Delete guards: the MAIN version can't be deleted (repoint first); a version
  pinned by any published release of any KB the item belongs to can't be
  deleted.

## KB releases (the manifest layer)

- `publishKbVersion` first commits every dirty member item (so the manifest
  pins real snapshots), then requires a **clean compile** — a broken KB
  cannot be released. The release pins `compileId` plus
  `items: [{itemId, versionNumber}]` (a lockfile; "KB v3 ≠ every item v3").
- Dedupe: if the fresh compile's id equals the latest release's, no new
  release is minted (`created: false`); the existing one just becomes active.
- `activeVersionId` on the KB is the rollback pointer (`setActiveVersion`),
  moved without re-publishing. Deleting a release is refused while it's
  active or while a derived KB records it as its branch point.
- Consumers: `KbPlayer.kbVersionBinding` (`pinned` / `track_latest` /
  `draft`) exists on the model, and `compileForVersion` resolves a pinned
  release. **Honest status: the table/session paths still resolve
  `liveCompile` (the draft head), not the active release** — release-gating
  of live tables is designed but not wired. If you wire it, start at
  `SessionService.createSession` callers in `apps/bridge-web`.
- Release manifests do NOT snapshot packs; the pinned compile embeds the
  flattened `CompiledPack`s of its moment, and packs have their own snapshot
  history (below).

## Set (pack) snapshots — automatic

- **Every fellow-authored pack write snapshots** via the service-private
  `writePackWithSnapshot(pack, actor)`: `putPack`, then mint
  `(latest.versionNumber ?? 0) + 1` iff `packIsDirty`. Callers today:
  `savePack`, `deriveKb`'s copied packs (v1 baseline), and `saveItem`'s
  fork-follow re-pointing. **If you add a new pack-writing path, route it
  through `writePackWithSnapshot` or history silently gaps.**
- The snapshot content is `PACK_CONTENT_KEYS = name, description,
  extendsPackId ("Includes"), itemIds, intendedComplete, envelopeOverrides` —
  with `itemIds` **sorted** in the hash and in storage, so picker order can
  never mint a version (or dirty the compile `inputHash`).
- Deliberately excluded: `ordinal`/`levelId` (retired with the ladder; kept
  in the model for back-compat, always 0/absent on new sets) and
  `derivedEnvelope`. The envelope is compiler-owned: `deriveEnvelopes()`
  rewrites packs via **raw `store.putPack`** after every good compile,
  bypassing snapshots on purpose. Including it would mint a noise version on
  every compile and defeat dedupe.
- `restorePackVersion` overlays the snapshot's content keys onto the head,
  **sanitizes** (drops itemIds no longer members of the KB; clears an
  Includes target that's gone or would now cycle — the compiler silently
  truncates chains at missing targets, so a dangling Includes must not
  survive), and saves through the normal path — restore itself mints the
  next snapshot; restoring the latest state dedupes to a no-op.
- `savePack` validates Includes up front (self-include, transitive cycle,
  missing target) and throws *before* writing; the compiler's cycle error is
  only the backstop (it would banner last-good otherwise).
- Deletion: `deletePack` refuses while `packReferences` finds any player
  carrying the set (directly or via an including set — house players are
  ordinary players), any set whose Includes chain reaches it, or any sandbox
  listing it. On success it deletes the snapshot history too. `deleteKb`
  cascades `deletePackVersionsForPack` before each pack.

## Invariants (hold these when changing anything)

1. **Committed snapshots are immutable and contiguous** (max+1 numbering,
   upsert key `id@versionNumber`). Nothing ever rewrites one.
2. **Content hashes are canonical**: sorted `itemIds`; hash over the declared
   CONTENT_KEYS only. If you add a field to a model, decide explicitly
   whether it's content (add to the KEYS + snapshot type) or metadata (leave
   out) — silent inclusion breaks dedupe, silent exclusion breaks restore.
3. **The compile `inputHash` uses `[itemId, version]` pairs**: a direct
   `store.putItem` that edits content WITHOUT bumping `version` will be
   invisible to recompilation (this bit a prod repair once — bump the head
   revision on any content mutation).
4. **Restore never resurrects retired/derived fields** (ordinal, levelId,
   derivedEnvelope) and never references entities that no longer exist.
5. **Forks start fresh lineages** (`committedVersion`/`mainVersion` unset);
   never copy version history across itemIds.
6. **Delete guards are service-level**, not UI-level: main version, release-
   pinned versions, active releases, branch-point releases, referenced sets.
   The UI catches the thrown message and banners it; keep messages
   fellow-readable ("…make another version main before deleting it").

## Where the UI surfaces each layer

- Item page (`items/[itemId]`): rev + main markers in the breadcrumb,
  Versions panel (commit / restore / delete), "forked from" chip.
- Versions tab: publish, releases list with Make active / delete, branch
  (derive/duplicate).
- Set page (`sets/[packId]`): History panel (auto snapshots, Restore per
  older row; restore banner reports sanitized drops).
- Player page: version counter on the record; sessions show the pinned
  compile version in traces.
