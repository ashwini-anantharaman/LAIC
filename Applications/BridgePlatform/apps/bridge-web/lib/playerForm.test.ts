// Settings parsing honors pack membership: toggles that were never rendered
// (their item isn't carried by the submitted packs) must not become phantom
// "off" overrides.

import type { CompiledKb } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import { parseSettingOverrides } from "./playerForm";

const compiled = {
  settings: [
    {
      key: "stayman_on",
      itemId: "ki_stayman",
      itemTitle: "Stayman",
      label: "Play Stayman",
      role: "enable",
      control: "toggle",
      default: true,
    },
    {
      key: "nt_range",
      itemId: "ki_1nt",
      itemTitle: "1NT opening",
      label: "1NT range",
      role: "parameter",
      control: "range_hcp",
      default: { low: 15, high: 17 },
    },
  ],
} as unknown as CompiledKb;

describe("parseSettingOverrides", () => {
  it("keeps only values that differ from defaults", () => {
    const fd = new FormData();
    // stayman_on rendered but unchecked → real "off" override.
    fd.set("setting:nt_range:low", "15");
    fd.set("setting:nt_range:high", "17");
    expect(parseSettingOverrides(fd, compiled)).toEqual({ stayman_on: false });
  });

  it("skips settings whose item is not carried (no phantom offs)", () => {
    const fd = new FormData(); // nothing rendered at all
    const carried = new Set(["ki_1nt"]); // packs carry 1NT, not Stayman
    // stayman_on absent from the form BECAUSE un-carried → not an override;
    // nt_range absent falls back to its default → no override either.
    expect(parseSettingOverrides(fd, compiled, carried)).toEqual({});
  });

  it("still records real changes for carried settings", () => {
    const fd = new FormData();
    fd.set("setting:nt_range:low", "14");
    fd.set("setting:nt_range:high", "17");
    const carried = new Set(["ki_1nt"]);
    expect(parseSettingOverrides(fd, compiled, carried)).toEqual({
      nt_range: { low: 14, high: 17 },
    });
  });
});
