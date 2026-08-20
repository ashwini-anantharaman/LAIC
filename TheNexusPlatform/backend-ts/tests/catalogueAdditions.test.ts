/**
 * A customized catalogue must still receive capabilities the platform ships later.
 *
 * The failure this pins down is silent and expensive: `getCatalogue` returns a
 * stored document verbatim, so a deployment that had ever pressed Save in the
 * Access Catalog editor froze its capability list at that moment. A capability
 * added afterwards is absent → the role builder never offers it → and
 * `validGrantsAcross` drops it from any role that asks for it anyway. The
 * feature ships, does nothing there, and says nothing about why.
 *
 * The other half matters just as much: the merge must be ADD-ONLY. A stored
 * label, group, or extra capability of the org's own is a customization, and
 * folding in new ids must never be an excuse to overwrite one.
 */
import { describe, expect, it } from "vitest";

import { _withShippedAdditions } from "../src/accessCatalogue/store";
import type { CapabilityCatalogueDocument } from "../src/accessCatalogue/types";

const doc = (over: Partial<CapabilityCatalogueDocument>): CapabilityCatalogueDocument => ({
  schemaVersion: "1.0",
  documentType: "capability_catalogue",
  id: "learning-platform-access",
  name: "Content Studio",
  provider: { kind: "platform", id: "learning-platform" },
  catalogueVersion: "1.0",
  capabilities: [],
  resourceTypes: [],
  uiSurfaces: [],
  groups: [],
  ...over,
});

const cap = (id: string, group: string, label = id) => ({ id, label, description: label, group });

describe("_withShippedAdditions", () => {
  it("adds a newly shipped capability to a customized catalogue", () => {
    const stored = doc({
      capabilities: [cap("learning.object.read", "repository")],
      groups: [{ id: "repository", label: "Repository", order: 3, capabilityIds: ["learning.object.read"] }],
    });
    const shipped = doc({
      capabilities: [cap("learning.object.read", "repository"), cap("learning.library.share_club", "library_governance")],
      groups: [
        { id: "repository", label: "Repository", order: 3, capabilityIds: ["learning.object.read"] },
        { id: "library_governance", label: "Content Library", order: 10, capabilityIds: ["learning.library.share_club"] },
      ],
    });

    const merged = _withShippedAdditions(stored, shipped);
    expect(merged.capabilities.map((c) => c.id)).toContain("learning.library.share_club");
    expect(merged.groups.map((g) => g.id)).toContain("library_governance");
  });

  it("lists a new capability inside an EXISTING group, so builders render it", () => {
    // Regression: reading groups[].capabilityIds is how the console's role
    // builder lays a group out. Appending the capability but not the id would
    // add a chip nothing draws.
    const stored = doc({
      capabilities: [cap("learning.publish.release", "publishing")],
      groups: [{ id: "publishing", label: "Publishing", order: 6, capabilityIds: ["learning.publish.release"] }],
    });
    const shipped = doc({
      capabilities: [cap("learning.publish.release", "publishing"), cap("learning.publish.app_target", "publishing")],
      groups: [{ id: "publishing", label: "Publishing", order: 6, capabilityIds: ["learning.publish.release", "learning.publish.app_target"] }],
    });

    const merged = _withShippedAdditions(stored, shipped);
    const publishing = merged.groups.find((g) => g.id === "publishing")!;
    expect(publishing.capabilityIds).toContain("learning.publish.app_target");
  });

  it("never overwrites a customization, and keeps the org's own capabilities", () => {
    const stored = doc({
      capabilities: [
        cap("learning.object.read", "repository", "Browse the shelf"), // renamed by the org
        cap("acme.custom.thing", "repository", "Acme's own"),          // invented by the org
      ],
      groups: [{ id: "repository", label: "Our Library", order: 3, capabilityIds: ["learning.object.read", "acme.custom.thing"] }],
    });
    const shipped = doc({
      capabilities: [cap("learning.object.read", "repository", "Browse learning objects")],
      groups: [{ id: "repository", label: "Repository", order: 3, capabilityIds: ["learning.object.read"] }],
    });

    const merged = _withShippedAdditions(stored, shipped);
    expect(merged.capabilities.find((c) => c.id === "learning.object.read")!.label).toBe("Browse the shelf");
    expect(merged.groups.find((g) => g.id === "repository")!.label).toBe("Our Library");
    expect(merged.capabilities.map((c) => c.id)).toContain("acme.custom.thing");
  });

  it("returns the stored object unchanged when there is nothing to add", () => {
    const stored = doc({
      capabilities: [cap("learning.object.read", "repository")],
      groups: [{ id: "repository", label: "Repository", order: 3, capabilityIds: ["learning.object.read"] }],
    });
    expect(_withShippedAdditions(stored, stored)).toBe(stored);
  });

  it("tolerates a provider with no shipped default", () => {
    const stored = doc({ capabilities: [cap("x.y", "g")] });
    expect(_withShippedAdditions(stored, undefined)).toBe(stored);
  });
});
