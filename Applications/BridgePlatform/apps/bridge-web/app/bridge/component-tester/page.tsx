// The component tester — a hidden, admin-area harness at /bridge/component-tester
// (no nav entry). Gated by page.component_tester (ADMIN defaults). This server
// page reads searchParams as the SINGLE SOURCE OF TRUTH, computes the moment
// snapshots + the platform-role feature booleans server-side, and hands the
// client shell serializable data only — every function (visibility, intent,
// mounts) is rebuilt client-side.

import { redirect } from "next/navigation";
import { ALL_BRIDGE_ROLES, canAccess } from "@bridge/access";
import { roleLabel, type BridgeRole } from "@bridge/nexus-client";
import { SKIN_ORDER, type SkinName } from "@bridge/table-config";
import type { Seat } from "@bridge/events";
import { getCatalogue, requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";
import { momentStates } from "./sessions";
import { TesterClient } from "./TesterClient";
import type {
  AxisId,
  Density,
  GameRole,
  MomentId,
  PlatformFeatures,
  PlatformRoleInfo,
  TesterParams,
} from "./types";

// The 9 table feature keys the platform axis reads, with a short label for the
// "this role lacks…" rail hint.
const FEATURE_KEYS: readonly [keyof PlatformFeatures, string, string][] = [
  ["seats_panel", "table.seats_panel", "Seats panel"],
  ["ben_seat", "table.ben_seat", "BEN seat"],
  ["workbench_link", "table.workbench_link", "Workbench link"],
  ["undo", "table.undo", "Undo"],
  ["step_controls", "table.step_controls", "Step controls"],
  ["settings_menu", "table.settings_menu", "Settings ☰"],
  ["hands_view", "table.hands_view", "Hands view"],
  ["skin_settings", "table.skin_settings", "Appearance rows"],
  ["skins_page", "page.skins", "Skins page"],
];

const AXES: AxisId[] = ["single", "role", "moment", "skin", "seat", "platform"];
const ROLES: GameRole[] = ["player", "declarer", "dummy", "kibitzer", "director"];
const MOMENT_IDS: MomentId[] = ["opening", "midAuction", "lead", "midPlay", "complete"];
const SEATS: Seat[] = ["N", "E", "S", "W"];

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export default async function ComponentTesterPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SP> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Gated: a role without the key renders 404 (notFound), never a 500.
  await requireFeature(context, "page.component_tester");

  const sp = await searchParams;
  const params: TesterParams = {
    mode: first(sp.mode) === "build" ? "build" : "inspect",
    view: first(sp.view) ?? "",
    comp: first(sp.comp) ?? "SeatHand",
    axis: pick(first(sp.axis), AXES, "single"),
    role: pick(first(sp.role), ROLES, "player"),
    moment: pick(first(sp.moment), MOMENT_IDS, "lead"),
    skin: pick(first(sp.skin), SKIN_ORDER as readonly SkinName[], "bbo"),
    seat: pick(first(sp.seat), SEATS, "S"),
    hand: first(sp.hand) === "fan" ? "fan" : "row",
    pad: first(sp.pad) === "columns" ? "columns" : "grid",
    density: (first(sp.density) === "compact" ? "compact" : "comfortable") as Density,
    live: first(sp.live) === "1",
    prole: pick(first(sp.prole), ALL_BRIDGE_ROLES, "bridge_learner"),
  };

  // Platform-role axis: one canAccess pass per role over the live catalogue.
  const catalogue = await getCatalogue();
  const platformRoles: PlatformRoleInfo[] = ALL_BRIDGE_ROLES.map((role: BridgeRole) => {
    const features = {} as PlatformFeatures;
    const lacks: string[] = [];
    for (const [k, key, label] of FEATURE_KEYS) {
      const ok = canAccess(catalogue, key, [role]);
      features[k] = ok;
      if (!ok) lacks.push(label);
    }
    return { role, label: roleLabel(role), features, lacks };
  });

  const moments = await momentStates();

  return <TesterClient data={{ params, moments, platformRoles }} />;
}
