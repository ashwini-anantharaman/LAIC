"use client";

// The component tester's client shell — the dark, full-viewport harness (top
// bar, 206px left rail, horizontally-scrolling cell canvas, 214px right rail).
// It is DISTINCT from the product chrome on purpose; it renders as a fixed
// full-viewport overlay because the bridge app-shell layout (a light sidebar)
// has no opt-out seam, so this covers it edge-to-edge.
//
// The server owns truth: `data.params` is the parsed URL state and every
// right-rail toggle / axis chip / component pick writes the URL back with
// router.replace(scroll:false) so the grid is shareable. The intent log is the
// one purely-client bit — enabled handlers append a line to their cell's
// footer, they never mutate a session.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveSkin, skinLabel, SKIN_ORDER, type SkinName } from "@bridge/table-config";
import type { Seat } from "@bridge/events";
import {
  REGISTRY,
  REGISTRY_BY_LABEL,
  registryGroups,
  type CellCtx,
} from "./registry";
import { saveViewAction, deleteViewAction } from "./actions";
import type {
  AxisId,
  GameRole,
  MomentId,
  TesterData,
  TesterParams,
} from "./types";

// ── palette (design tokens, verbatim) ────────────────────────────────────────
const C = {
  pageBg: "#101316",
  text: "#e7edf0",
  panel: "#13181c",
  bar: "#161b1f",
  line: "#262e34",
  muted: "#7d8a92",
  muted2: "#6d7a82",
  chipOnBg: "#0d707c",
  chipOnBorder: "#12909f",
  chipOffBg: "#1e262b",
  chipOffBorder: "#2f3a41",
  chipOffColor: "#9daab2",
  comparing: "#3fa8b8",
  cellHead: "#1c2429",
  warn: "#c98a4b",
};
const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
const SEAT_NAMES: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

const ROLE_ORDER: GameRole[] = ["player", "declarer", "dummy", "kibitzer", "director"];
const ROLE_TITLE: Record<GameRole, string> = {
  player: "Player",
  declarer: "Declarer",
  dummy: "Dummy",
  kibitzer: "Kibitzer",
  director: "Director",
};
const ROLE_HINT: Record<GameRole, string> = {
  player: "Sees own hand only.",
  declarer: "Plays dummy too.",
  dummy: "Hand exposed, does not play.",
  kibitzer: "Watches; no controls live.",
  director: "Sees all four hands.",
};
const MOMENTS: { id: MomentId; label: string }[] = [
  { id: "opening", label: "Opening" },
  { id: "midAuction", label: "Mid auction" },
  { id: "lead", label: "Opening lead" },
  { id: "midPlay", label: "Mid play" },
  { id: "complete", label: "Board over" },
];
const SEATS: Seat[] = ["N", "E", "S", "W"];
const AXES: { id: AxisId; label: string }[] = [
  { id: "single", label: "Single" },
  { id: "role", label: "Role" },
  { id: "moment", label: "Moment" },
  { id: "skin", label: "Skin" },
  { id: "seat", label: "Seat" },
  { id: "platform", label: "Platform" },
];

interface CellDescriptor {
  key: string;
  label: string;
  note?: string;
  override: Partial<Pick<TesterParams, "role" | "moment" | "skin" | "seat" | "prole">>;
}

export function TesterClient({ data }: Readonly<{ data: TesterData }>) {
  const router = useRouter();
  const { params, moments, platformRoles, savedViews } = data;
  const [intentLog, setIntentLog] = useState<Record<string, string[]>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const entry = REGISTRY_BY_LABEL[params.comp] ?? REGISTRY[0]!;

  // ── URL writes ─────────────────────────────────────────────────────────────
  function hrefFor(patch: Partial<TesterParams>): string {
    const m = { ...params, ...patch };
    const q = new URLSearchParams({
      comp: m.comp,
      axis: m.axis,
      role: m.role,
      moment: m.moment,
      skin: m.skin,
      seat: m.seat,
      hand: m.hand,
      pad: m.pad,
      density: m.density,
      live: m.live ? "1" : "0",
      prole: m.prole,
    });
    return `/bridge/component-tester?${q.toString()}`;
  }
  const go = (patch: Partial<TesterParams>) => router.replace(hrefFor(patch), { scroll: false });

  const currentConfig = (): Record<string, string> => ({
    comp: params.comp,
    axis: params.axis,
    role: params.role,
    moment: params.moment,
    skin: params.skin,
    seat: params.seat,
    hand: params.hand,
    pad: params.pad,
    density: params.density,
    live: params.live ? "1" : "0",
    prole: params.prole,
  });

  const appendIntent = (cellKey: string, line: string) =>
    setIntentLog((prev) => ({ ...prev, [cellKey]: [...(prev[cellKey] ?? []), line] }));

  // ── cell fan ────────────────────────────────────────────────────────────────
  const cells: CellDescriptor[] = (() => {
    switch (params.axis) {
      case "role":
        return ROLE_ORDER.map((r) => ({ key: `role-${r}`, label: ROLE_TITLE[r], note: ROLE_HINT[r], override: { role: r } }));
      case "moment":
        return MOMENTS.map((m) => ({ key: `moment-${m.id}`, label: m.label, override: { moment: m.id } }));
      case "skin":
        return SKIN_ORDER.map((s) => ({ key: `skin-${s}`, label: skinLabel(s), override: { skin: s } }));
      case "seat":
        return SEATS.map((s) => ({ key: `seat-${s}`, label: SEAT_NAMES[s], override: { seat: s } }));
      case "platform":
        return platformRoles.map((p) => ({
          key: `prole-${p.role}`,
          label: p.label,
          note: p.lacks.length ? `lacks: ${p.lacks.join(", ")}` : "all controls",
          override: { prole: p.role },
        }));
      default:
        return [{ key: "single", label: entry.label, override: {} }];
    }
  })();

  function buildCtx(desc: CellDescriptor): CellCtx {
    const role = desc.override.role ?? params.role;
    const momentId = desc.override.moment ?? params.moment;
    const skinName = (desc.override.skin ?? params.skin) as SkinName;
    const seat = desc.override.seat ?? params.seat;
    const prole = desc.override.prole ?? params.prole;

    const snap = moments[momentId];
    const state = snap.state;
    const contract = state.contract;

    const mySeat: Seat | null =
      role === "player"
        ? "S"
        : role === "declarer"
          ? (contract?.declarer ?? "S")
          : role === "dummy"
            ? (contract ? PARTNER[contract.declarer] : "N")
            : null;
    const showAll = role === "director";
    const dummy = contract && state.phase !== "auction" ? PARTNER[contract.declarer] : null;
    const leadMade = state.tricks.length > 0 && (state.tricks[0]?.plays.length ?? 0) > 0;
    const canSee = (s: Seat) =>
      showAll || s === mySeat || (s === dummy && leadMade) || state.phase === "complete";
    const controllerTurn = dummy && contract && state.turn === dummy ? contract.declarer : state.turn;
    const onTurn = mySeat != null && controllerTurn === mySeat;
    const features = platformRoles.find((p) => p.role === prole)?.features ?? {
      seats_panel: true, ben_seat: true, workbench_link: true, undo: true, step_controls: true,
      settings_menu: true, hands_view: true, skin_settings: true, skins_page: true,
    };

    return {
      state,
      result: snap.result,
      role,
      seat,
      mySeat,
      dummy,
      canSee,
      onTurn,
      skin: resolveSkin(skinName),
      density: params.density,
      hand: params.hand,
      pad: params.pad,
      live: params.live,
      features,
      intent: (line) => appendIntent(desc.key, line),
    };
  }

  // ── save/delete views ─────────────────────────────────────────────────────
  const onSave = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await saveViewAction(name.trim(), currentConfig());
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const onDelete = async (id: string) => {
    setBusy(true);
    try {
      await deleteViewAction(id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const openView = (config: Record<string, string>) => {
    const q = new URLSearchParams(config);
    router.push(`/bridge/component-tester?${q.toString()}`);
  };

  // ── chip helpers ────────────────────────────────────────────────────────────
  const Chip = ({ on, label, onClick, title }: { on: boolean; label: string; onClick: () => void; title?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      data-active={on ? "1" : "0"}
      style={{
        flex: "none",
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        background: on ? C.chipOnBg : C.chipOffBg,
        border: `1px solid ${on ? C.chipOnBorder : C.chipOffBorder}`,
        color: on ? "#eaffff" : C.chipOffColor,
      }}
    >
      {label}
    </button>
  );

  const RailGroup = ({ label, comparing, hint, children }: { label: string; comparing?: boolean; hint?: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted }}>{label}</span>
        {comparing && <span style={{ fontSize: 10, fontWeight: 700, color: C.comparing }}>comparing</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{children}</div>
      {hint && <span style={{ fontSize: 11, color: C.muted2, lineHeight: 1.35 }}>{hint}</span>}
    </div>
  );

  const proleInfo = platformRoles.find((p) => p.role === params.prole);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", background: C.pageBg, color: C.text, fontFamily: FONT, overflow: "hidden" }}>
      {/* top bar */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 16, padding: "8px 14px", background: C.bar, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Component tester</span>
          <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {`${REGISTRY.length} components · every cell is a real session, so visibility rules are the product’s, not the harness’s`}
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: ".12em", color: C.muted }}>COMPARE</span>
          <div style={{ display: "flex", gap: 5 }}>
            {AXES.map((a) => (
              <Chip key={a.id} on={params.axis === a.id} label={a.label} onClick={() => go({ axis: a.id })} />
            ))}
          </div>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* left rail */}
        <div style={{ width: 206, flex: "none", background: C.panel, borderRight: `1px solid ${C.line}`, overflowY: "auto", padding: "10px 0" }}>
          {registryGroups().map((g) => (
            <div key={g.group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, padding: "0 12px 4px" }}>{g.group}</div>
              {g.entries.map((e) => {
                const active = e.label === params.comp;
                return (
                  <button
                    key={e.label}
                    type="button"
                    onClick={() => go({ comp: e.label })}
                    data-active={active ? "1" : "0"}
                    aria-pressed={active}
                    style={{
                      width: "100%",
                      height: 29,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "0 12px",
                      border: 0,
                      borderLeft: `3px solid ${active ? C.chipOnBorder : "transparent"}`,
                      background: active ? "#0f1417" : "transparent",
                      color: active ? C.text : C.chipOffColor,
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
                    <span style={{ flex: "none", fontSize: 9, color: C.muted2 }}>{e.size}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* canvas */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 18 }}>
          <div style={{ marginBottom: 4, fontSize: 16, fontWeight: 700 }}>{entry.label}</div>
          <div style={{ marginBottom: 14, fontSize: 12, color: C.muted }}>{entry.note}</div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {cells.map((desc) => {
              const ctx = buildCtx(desc);
              const gated = entry.platformGated;
              const cellNote = params.live ? (ctx.onTurn ? "on turn" : "not on turn") : "no controls";
              const noteColor = params.live ? C.muted : C.warn;
              const platformNote = params.axis === "platform" && !gated ? "no role-gated controls" : null;
              const log = intentLog[desc.key] ?? [];
              return (
                <div key={desc.key} style={{ flex: "none", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", background: "#0e1216" }}>
                  {/* header bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", background: C.cellHead, borderBottom: `1px solid ${C.line}` }}>
                    <span data-testid="cell-label" style={{ fontSize: 12, fontWeight: 600 }}>{desc.label}</span>
                    <span style={{ fontSize: 10, color: noteColor }}>{platformNote ?? desc.note ?? cellNote}</span>
                  </div>
                  {/* body — the felt-flat backdrop of the current skin */}
                  <div
                    data-testid="cell-body"
                    style={{
                      minWidth: entry.pad[0],
                      minHeight: entry.pad[1],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 16,
                      background: ctx.skin.feltFlat,
                    }}
                  >
                    {entry.mount(ctx)}
                  </div>
                  {/* footer — the cell's intent log (honest harness signal) */}
                  <div style={{ minHeight: 20, padding: "4px 10px", background: "#0b0f12", borderTop: `1px solid ${C.line}`, fontFamily: "ui-monospace, monospace", fontSize: 10, color: C.comparing }}>
                    {log.length === 0 ? <span style={{ color: C.muted2 }}>{cellNote}</span> : log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* right rail */}
        <div style={{ width: 214, flex: "none", background: C.panel, borderLeft: `1px solid ${C.line}`, overflowY: "auto", padding: 12 }}>
          <RailGroup label="Viewer role" comparing={params.axis === "role"} hint={ROLE_HINT[params.role]}>
            {ROLE_ORDER.map((r) => (
              <Chip key={r} on={params.role === r} label={ROLE_TITLE[r]} onClick={() => go({ role: r })} />
            ))}
          </RailGroup>

          <RailGroup label="Moment" comparing={params.axis === "moment"}>
            {MOMENTS.map((m) => (
              <Chip key={m.id} on={params.moment === m.id} label={m.label} onClick={() => go({ moment: m.id })} />
            ))}
          </RailGroup>

          <RailGroup label="Seat" comparing={params.axis === "seat"}>
            {SEATS.map((s) => (
              <Chip key={s} on={params.seat === s} label={s} onClick={() => go({ seat: s })} />
            ))}
          </RailGroup>

          <RailGroup label="Skin" comparing={params.axis === "skin"}>
            {SKIN_ORDER.map((s) => (
              <Chip key={s} on={params.skin === s} label={skinLabel(s)} onClick={() => go({ skin: s })} />
            ))}
          </RailGroup>

          <RailGroup label="Hand layout">
            <Chip on={params.hand === "row"} label="Row" onClick={() => go({ hand: "row" })} />
            <Chip on={params.hand === "fan"} label="Fan" onClick={() => go({ hand: "fan" })} />
          </RailGroup>

          <RailGroup label="Bid pad">
            <Chip on={params.pad === "grid"} label="Level grid" onClick={() => go({ pad: "grid" })} />
            <Chip on={params.pad === "columns"} label="Suit columns" onClick={() => go({ pad: "columns" })} />
          </RailGroup>

          <RailGroup label="Density">
            <Chip on={params.density === "comfortable"} label="Comfortable" onClick={() => go({ density: "comfortable" })} />
            <Chip on={params.density === "compact"} label="Compact" onClick={() => go({ density: "compact" })} />
          </RailGroup>

          <RailGroup label="Controls" hint="Read-only passes no bus, so every handler is null — the disabled look.">
            <Chip on={params.live} label="Live" onClick={() => go({ live: true })} />
            <Chip on={!params.live} label="Read-only" onClick={() => go({ live: false })} />
          </RailGroup>

          <RailGroup label="Platform role" comparing={params.axis === "platform"} hint={proleInfo ? (proleInfo.lacks.length ? `Lacks: ${proleInfo.lacks.join(", ")}` : "Has every table control.") : undefined}>
            {platformRoles.map((p) => (
              <Chip key={p.role} on={params.prole === p.role} label={p.label} onClick={() => go({ prole: p.role })} title={p.lacks.length ? `lacks: ${p.lacks.join(", ")}` : "all controls"} />
            ))}
          </RailGroup>

          <RailGroup label="Views">
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              <div style={{ display: "flex", gap: 5 }}>
                <input
                  aria-label="View name"
                  placeholder="Name this view"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ flex: 1, minWidth: 0, background: C.chipOffBg, border: `1px solid ${C.chipOffBorder}`, borderRadius: 6, color: C.text, fontSize: 12, padding: "4px 7px" }}
                />
                <button
                  type="button"
                  onClick={onSave}
                  disabled={busy || !name.trim()}
                  style={{ flex: "none", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy || !name.trim() ? "default" : "pointer", background: C.chipOnBg, border: `1px solid ${C.chipOnBorder}`, color: "#eaffff", opacity: busy || !name.trim() ? 0.5 : 1 }}
                >
                  Save
                </button>
              </div>
              {savedViews.length === 0 ? (
                <span style={{ fontSize: 11, color: C.muted2 }}>No saved views.</span>
              ) : (
                savedViews.map((v) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <button
                      type="button"
                      onClick={() => openView(v.config)}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", background: C.chipOffBg, border: `1px solid ${C.chipOffBorder}`, borderRadius: 6, color: C.text, fontSize: 12, padding: "4px 8px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${v.name}`}
                      onClick={() => onDelete(v.id)}
                      style={{ flex: "none", width: 24, height: 24, borderRadius: 6, background: "#2a1e1e", border: "1px solid #4a2f2f", color: "#d9a0a0", fontSize: 12, cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </RailGroup>
        </div>
      </div>
    </div>
  );
}
