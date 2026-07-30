/**
 * Provisioning control for a program/org's feature-areas. Platform areas that
 * have their own Access Catalog (Content Studio, Bridge — matching the role
 * builder's 3-way) get No / Partial / Full, where Partial reveals that catalog's
 * capabilities to pick a subset. Other features stay simple on/off.
 *
 *   No access  → feature off
 *   Full access→ feature on, no capability restriction
 *   Partial    → feature on + a stored capability subset (clamps role grants)
 *
 * Shared by the New Program dialog, the program Features dialog, and the Nexus
 * org-envelope editor, so all three provision the same way.
 */
import { useEffect, useState } from "react";

import { Switch } from "@/app/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { getCatalogue, type CapabilityCatalogueDocument } from "@/nexus/access/catalogue";
import { PROGRAM_FEATURES, FEATURE_ACCESS_KEYS, FEATURE_ACCESS_PROVIDER } from "@/types/platform";

export type FeatureAccessMap = Record<string, { capabilities: string[] }>;

const isOn = (features: Record<string, boolean>, key: string) => features[key] !== false;

export function FeatureAccessControls({
  features,
  featureAccess,
  allowedKeys,
  onChangeFeatures,
  onChangeAccess,
  disabled,
}: {
  features: Record<string, boolean>;
  featureAccess: FeatureAccessMap;
  allowedKeys: string[];
  onChangeFeatures: (next: Record<string, boolean>) => void;
  onChangeAccess: (next: FeatureAccessMap) => void;
  disabled?: boolean;
}) {
  const [cats, setCats] = useState<Record<string, CapabilityCatalogueDocument | null>>({});
  const keys = allowedKeys.join(",");
  useEffect(() => {
    let live = true;
    for (const key of FEATURE_ACCESS_KEYS) {
      if (!allowedKeys.includes(key)) continue;
      getCatalogue(FEATURE_ACCESS_PROVIDER[key])
        .then((d) => live && setCats((c) => ({ ...c, [key]: d })))
        .catch(() => live && setCats((c) => ({ ...c, [key]: null })));
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const visible = PROGRAM_FEATURES.filter((f) => allowedKeys.includes(f.key));
  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground">No features are enabled for this organization.</p>;
  }

  const levelOf = (key: string): "none" | "partial" | "full" =>
    !isOn(features, key) ? "none" : featureAccess[key] ? "partial" : "full";

  // All grantable capability ids for a platform (reserved excluded).
  const allCapIds = (key: string): string[] =>
    (cats[key]?.capabilities ?? []).filter((c) => !c.reserved).map((c) => c.id);

  // Full shows the whole list ON (no explicit caps stored). Partial seeds every
  // capability ON so you can trim. No clears it.
  const setLevel = (key: string, v: "none" | "partial" | "full") => {
    onChangeFeatures({ ...features, [key]: v !== "none" });
    if (v === "partial") {
      onChangeAccess({ ...featureAccess, [key]: { capabilities: allCapIds(key) } });
    } else {
      const next = { ...featureAccess };
      delete next[key];
      onChangeAccess(next);
    }
  };

  // A capability reads ON when Full (all) or explicitly chosen under Partial.
  const capOn = (key: string, id: string) => levelOf(key) === "full" || (featureAccess[key]?.capabilities ?? []).includes(id);

  // Toggle capabilities with auto-level transitions: all on → Full, none → No,
  // otherwise Partial.
  const toggleCaps = (key: string, ids: string[], on: boolean) => {
    const all = allCapIds(key);
    const selected = new Set(levelOf(key) === "full" ? all : (featureAccess[key]?.capabilities ?? []));
    for (const id of ids) on ? selected.add(id) : selected.delete(id);
    const allOn = all.length > 0 && all.every((id) => selected.has(id));
    const none = selected.size === 0;
    onChangeFeatures({ ...features, [key]: !none });
    const next = { ...featureAccess };
    if (allOn || none) delete next[key];
    else next[key] = { capabilities: [...selected] };
    onChangeAccess(next);
  };

  return (
    <div className="space-y-2">
      {visible.map((f) => {
        const threeWay = (FEATURE_ACCESS_KEYS as readonly string[]).includes(f.key);
        if (!threeWay) {
          return (
            <div key={f.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <Switch checked={isOn(features, f.key)} disabled={disabled} onCheckedChange={(v) => onChangeFeatures({ ...features, [f.key]: v })} />
              <span className="flex-1 text-sm">{f.label}</span>
            </div>
          );
        }
        const level = levelOf(f.key);
        const doc = cats[f.key];
        const grantable = (doc?.capabilities ?? []).filter((c) => !c.reserved);
        const groups = [...(doc?.groups ?? [])].sort((a, b) => a.order - b.order);
        // The capability list shows for Partial AND Full (Full = all on).
        const showPicker = level === "partial" || level === "full";
        return (
          <div key={f.key} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-foreground">{f.label}</span>
              <Select value={level} onValueChange={(v) => setLevel(f.key, v as "none" | "partial" | "full")} disabled={disabled}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No access</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="full">Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showPicker ? (
              <div className="border-t border-border p-2">
                {!doc ? (
                  <p className="px-1 text-[11px] text-muted-foreground">Loading capabilities…</p>
                ) : grantable.length === 0 ? (
                  <p className="px-1 text-[11px] text-muted-foreground">This platform has no grantable capabilities.</p>
                ) : (
                  groups.map((g) => {
                    const groupCaps = grantable.filter((c) => c.group === g.id);
                    if (!groupCaps.length) return null;
                    const ids = groupCaps.map((c) => c.id);
                    const allOn = ids.every((id) => capOn(f.key, id));
                    return (
                      <div key={g.id} className="mb-1.5">
                        <label className="flex items-center gap-2 rounded px-1 py-0.5">
                          <Switch checked={allOn} disabled={disabled} onCheckedChange={() => toggleCaps(f.key, ids, !allOn)} title={allOn ? "Turn all off" : "Turn all on"} />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{g.label}</span>
                        </label>
                        {groupCaps.map((cp) => (
                          <label key={cp.id} className="ml-5 flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/40">
                            <Switch checked={capOn(f.key, cp.id)} disabled={disabled} onCheckedChange={() => toggleCaps(f.key, [cp.id], !capOn(f.key, cp.id))} />
                            <span className="min-w-0"><span className="text-foreground">{cp.label}</span> <span className="font-mono text-[11px] text-muted-foreground">{cp.id}</span></span>
                          </label>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
