// Player assembly logic (Knowledge Rework §6, Stage E): the wizard that
// suggests minimal players from pack analysis, and the server-side sandbox
// constraint enforcement (a learner's edits can never escape what the coach
// exposed — same posture as the pre-rework sandboxes).

import type { SettingValue } from "@bridge/config";
import type { CompiledKb } from "./compiled";
import type { KbPlayer, KbSandbox } from "./model";
import { playerIsValid, validatePlayerStatic } from "./validatePlayer";

const probe = (kbId: string, enabledPackIds: string[]): KbPlayer => ({
  playerId: "probe",
  kbId,
  name: "probe",
  enabledPackIds,
  settingOverrides: {},
  decisionPolicyId: "first_match",
  fallbackPolicyId: "standard",
  validationStatus: "draft",
  ownerType: "system",
  version: 1,
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
});

export interface SuggestedPlayer {
  kind: "minimal_incomplete" | "minimal_complete";
  name: string;
  enabledPackIds: string[];
  /** Why this pack selection (shown in the wizard). */
  rationale: string;
}

/**
 * The wizard (owner's PDF): suggest a minimal INCOMPLETE player (the lowest
 * ladder pack that cannot stand alone — drill material) and a minimal
 * COMPLETE player (the lowest pack whose chain covers the full capability
 * set). Packs are probed in ladder order.
 */
export function suggestMinimalPlayers(compiled: CompiledKb, kbId: string): SuggestedPlayer[] {
  const packs = [...compiled.packs].sort((a, b) => a.ordinal - b.ordinal);
  const out: SuggestedPlayer[] = [];

  const firstIncomplete = packs.find(
    (p) => !playerIsValid(validatePlayerStatic(compiled, probe(kbId, [p.packId]))),
  );
  if (firstIncomplete) {
    const report = validatePlayerStatic(compiled, probe(kbId, [firstIncomplete.packId]));
    const missing = report.static.filter((r) => !r.ok).length;
    out.push({
      kind: "minimal_incomplete",
      name: `Minimal incomplete — ${firstIncomplete.name}`,
      enabledPackIds: [firstIncomplete.packId],
      rationale: `"${firstIncomplete.name}" alone misses ${missing} capabilit${missing === 1 ? "y" : "ies"} — a drill player for constrained environments only.`,
    });
  }

  const firstComplete = packs.find((p) =>
    playerIsValid(validatePlayerStatic(compiled, probe(kbId, [p.packId]))),
  );
  if (firstComplete) {
    out.push({
      kind: "minimal_complete",
      name: `Minimal complete — ${firstComplete.name}`,
      enabledPackIds: [firstComplete.packId],
      rationale: `"${firstComplete.name}" (with its extends chain) covers the full capability set — it can always act, even if badly.`,
    });
  }

  return out;
}

/**
 * Server-side sandbox enforcement: whatever a learner submits, the result
 * carries the sandbox's base packs, may only toggle EXPOSED packs, and may
 * only override EXPOSED settings (everything else snaps back to the coach's
 * baseline). Never trust the client.
 */
export function applySandboxConstraints(
  sandbox: KbSandbox,
  requested: {
    enabledPackIds: string[];
    settingOverrides: Record<string, SettingValue>;
  },
): { enabledPackIds: string[]; settingOverrides: Record<string, SettingValue> } {
  const exposed = new Set(sandbox.exposedPackIds);
  const keptOptional = requested.enabledPackIds.filter((id) => exposed.has(id));
  const enabledPackIds = [...new Set([...sandbox.basePackIds, ...keptOptional])];

  const allowedKeys = new Set(sandbox.exposedSettingKeys);
  const settingOverrides: Record<string, SettingValue> = { ...sandbox.baseOverrides };
  for (const [key, value] of Object.entries(requested.settingOverrides)) {
    if (allowedKeys.has(key)) settingOverrides[key] = value;
  }
  return { enabledPackIds, settingOverrides };
}

// ---------------------------------------------------------------------------
// Agreements-in-force (the convention-card view, spec §7): derived from the
// configuration, never hand-edited.
// ---------------------------------------------------------------------------

export interface AgreementsCard {
  sections: {
    title: string;
    entries: { ruleId: string; label: string; itemId: string; itemTitle: string }[];
  }[];
  settings: { key: string; label: string; value: SettingValue; offDefault: boolean }[];
}

export function effectiveAgreements(compiled: CompiledKb, player: KbPlayer): AgreementsCard {
  const enabled = new Set(
    player.enabledPackIds.length ? player.enabledPackIds : compiled.packs.map((p) => p.packId),
  );
  const allowed = new Set<string>();
  for (const pack of compiled.packs) {
    if (enabled.has(pack.packId)) for (const id of pack.itemIds) allowed.add(id);
  }
  if (compiled.packs.length === 0) for (const i of compiled.items) allowed.add(i.itemId);

  const values = { ...compiled.defaults, ...player.settingOverrides };
  const gatesOpen = (gates: string[]) => gates.every((key) => Boolean(values[key]));
  const live = <T extends { provenance: { itemId: string }; settingGates: string[] }>(rules: T[]) =>
    rules.filter((r) => allowed.has(r.provenance.itemId) && gatesOpen(r.settingGates));

  const entry = (r: {
    ruleId: string;
    label: string;
    provenance: { itemId: string; itemTitle: string };
  }) => ({
    ruleId: r.ruleId,
    label: r.label,
    itemId: r.provenance.itemId,
    itemTitle: r.provenance.itemTitle,
  });

  const carriedSettings = compiled.settings.filter((s) => allowed.has(s.itemId));

  return {
    sections: [
      { title: "Auction", entries: live(compiled.auctionRules).map(entry) },
      { title: "Opening leads", entries: live(compiled.leadRules).map(entry) },
      { title: "Card play", entries: live(compiled.playRules).map(entry) },
      {
        title: "Fallbacks",
        entries: compiled.fallbacks
          .filter((f) => allowed.has(f.provenance.itemId))
          .map((f) => ({
            ruleId: f.ruleId,
            label: `${f.fallback.phase.replace("_", " ")}: ${f.fallback.behavior.replace(/_/g, " ")}`,
            itemId: f.provenance.itemId,
            itemTitle: f.provenance.itemTitle,
          })),
      },
    ],
    settings: carriedSettings.map((s) => ({
      key: s.key,
      label: s.label,
      value: values[s.key]!,
      offDefault:
        JSON.stringify(values[s.key]) !== JSON.stringify(s.default),
    })),
  };
}
