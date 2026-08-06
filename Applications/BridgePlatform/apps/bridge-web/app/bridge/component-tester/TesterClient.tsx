"use client";

// The component tester's client shell — the dark, full-viewport harness. Two
// tabs share the chrome:
//
//  • INSPECT (default): the URL is the single source of truth. Each cell is a
//    real session; a compare axis fans one component across roles/moments/etc.
//  • BUILD: composes a `slots` array consumed by the Canvas renderer, saved to
//    the browser (localStorage `bridge.tester.views.v1`) as LAYOUT-ONLY views.
//    No server round-trips: the moment snapshots the preview reads are already
//    on `data.moments`, and the saved-view library lives entirely client-side.
//
// The intent log (inspect, Live) is the only other purely-client bit: enabled
// handlers append a line to their cell's footer, they never mutate a session.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveSkin, skinLabel, SKIN_ORDER, type SkinName } from "@bridge/table-config";
import type { Seat } from "@bridge/events";
import {
  REGISTRY,
  REGISTRY_BY_LABEL,
  registryGroups,
  type CellCtx,
} from "./registry";
import {
  Canvas,
  DEFAULT_HANDS,
  EXPOSURE_KEYS,
  EXPOSURE_LABEL,
  PALETTE,
  PALETTE_LABEL,
  PARTS,
  PRESETS,
  PRESET_KEYS,
  SEAT_KINDS,
  SEAT_ORDER,
  partOn,
  type PartDef,
  type VizContext,
} from "./Canvas";
import type {
  AxisId,
  CanvasSlot,
  GameRole,
  GameState,
  HandExposure,
  MomentId,
  MomentSnapshot,
  TesterData,
  TesterMode,
  TesterParams,
  TesterView,
} from "./types";

// ── palette (design tokens; contrast hexes lifted to ≥4.5:1 per ADDENDUM C) ──
const C = {
  pageBg: "#101316",
  text: "#e7edf0",
  panel: "#13181c",
  bar: "#161b1f",
  line: "#262e34",
  muted: "#7d8a92",
  muted2: "#8d99a1", // was #6d7a82 — lifted for contrast on the dark panels
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

const STORE_KEY = "bridge.tester.views.v1";

// ── shared visibility recipe (mirrors table2 page.tsx:82-96) ─────────────────
function visibilityFor(state: GameState, role: GameRole) {
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
  return { mySeat, dummy, canSee, onTurn };
}

function vizFor(
  snap: MomentSnapshot,
  role: GameRole,
  skinName: SkinName,
  params: TesterParams,
): VizContext {
  const { canSee, dummy } = visibilityFor(snap.state, role);
  return {
    state: snap.state,
    result: snap.result,
    canSee,
    dummy,
    skin: resolveSkin(skinName),
    density: params.density,
    hand: params.hand,
  };
}

// ── localStorage helpers (client-only; single key, never a blanket clear) ────
function loadViews(): TesterView[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function persistViews(list: TesterView[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota — the library just won't persist */
  }
}
function newView(): TesterView {
  const p = PRESETS.table3x3!;
  return {
    id: "",
    name: "",
    layout: p.layout,
    cols: p.cols,
    gap: 16,
    labels: false,
    hideInactive: true,
    hands: { ...DEFAULT_HANDS },
    slots: p.slots.map((s) => ({ ...s })),
  };
}

interface CellDescriptor {
  key: string;
  label: string;
  note?: string;
  override: Partial<Pick<TesterParams, "role" | "moment" | "skin" | "seat" | "prole">>;
}

export function TesterClient({ data }: Readonly<{ data: TesterData }>) {
  const router = useRouter();
  const { params, moments, platformRoles } = data;
  const [intentLog, setIntentLog] = useState<Record<string, string[]>>({});

  // ── build-mode state (client-only) ─────────────────────────────────────────
  const [view, setView] = useState<TesterView>(() => newView());
  const [savedId, setSavedId] = useState<string>("");
  const [sel, setSel] = useState<number>(-1);
  const [student, setStudent] = useState<boolean>(false);
  const [saved, setSaved] = useState<TesterView[]>([]);
  const [buildMoment, setBuildMoment] = useState<MomentId>(params.moment);
  const [buildRole, setBuildRole] = useState<GameRole>(params.role);

  // Hydrate the library on mount; reopen the URL's view id when it names one.
  useEffect(() => {
    const list = loadViews();
    setSaved(list);
    if (params.view) {
      const rec = list.find((v) => v.id === params.view);
      if (rec) {
        setView({ ...newView(), ...rec });
        setSavedId(rec.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mode: TesterMode = params.mode;
  const entry = REGISTRY_BY_LABEL[params.comp] ?? REGISTRY[0]!;

  // ── URL writes (inspect truth + mode/view only) ─────────────────────────────
  function hrefFor(patch: Partial<TesterParams>): string {
    const m = { ...params, ...patch };
    const q = new URLSearchParams({
      mode: m.mode,
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
    if (m.view) q.set("view", m.view);
    return `/bridge/component-tester?${q.toString()}`;
  }
  const go = (patch: Partial<TesterParams>) => router.replace(hrefFor(patch), { scroll: false });

  const appendIntent = (cellKey: string, line: string) =>
    setIntentLog((prev) => ({ ...prev, [cellKey]: [...(prev[cellKey] ?? []), line] }));

  // ── inspect: cell fan ───────────────────────────────────────────────────────
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
    const { mySeat, dummy, canSee, onTurn } = visibilityFor(state, role);
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

  // ── build-mode helpers ──────────────────────────────────────────────────────
  const setSlots = (fn: (slots: CanvasSlot[]) => CanvasSlot[]) =>
    setView((v) => ({ ...v, slots: fn(v.slots.map((s) => ({ ...s }))) }));

  // Fix (b): the append index is computed INSIDE the one updater (no stale
  // length); it is captured to a local so the selection can follow the new slot
  // without a second read of the array that could race the update.
  const addSlot = (kind: string) => {
    let newIndex = -1;
    setView((v) => {
      const slots = v.slots.map((s) => ({ ...s }));
      const slot: CanvasSlot = { component: kind };
      if (SEAT_KINDS.has(kind)) {
        const used = slots.filter((s) => s.component === kind).map((s) => s.seat);
        slot.seat = SEAT_ORDER.find((s) => !used.includes(s)) ?? "N";
      }
      slots.push(slot);
      newIndex = slots.length - 1;
      return { ...v, slots };
    });
    setSel(newIndex);
  };

  const move = (dir: number) => {
    setView((v) => {
      const i = sel;
      const j = i + dir;
      if (i < 0 || j < 0 || j >= v.slots.length) return v;
      const slots = v.slots.map((s) => ({ ...s }));
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
      setSel(j);
      return { ...v, slots };
    });
  };

  const span = (d: number) =>
    setSlots((slots) => {
      const i = sel;
      if (i < 0) return slots;
      const cur = slots[i]!.span ?? 1;
      const next = Math.max(1, Math.min(view.cols, cur + d));
      if (next === 1) delete slots[i]!.span;
      else slots[i]!.span = next;
      return slots;
    });

  const removeSlot = () => {
    setSlots((slots) => {
      if (sel < 0) return slots;
      slots.splice(sel, 1);
      return slots;
    });
    setSel(-1);
  };

  const setSeat = (seat: Seat) =>
    setSlots((slots) => {
      if (sel < 0) return slots;
      slots[sel] = { ...slots[sel]!, seat };
      return slots;
    });

  // Fix (c): an emptied props object is DELETED, never left as {}.
  const togglePart = (part: PartDef) =>
    setSlots((slots) => {
      const i = sel;
      if (i < 0) return slots;
      const props = { ...(slots[i]!.props ?? {}) };
      if (partOn(slots[i]!, part)) Object.assign(props, part.off);
      else for (const k of Object.keys(part.off)) delete props[k];
      const next: CanvasSlot = { ...slots[i]! };
      if (Object.keys(props).length) next.props = props;
      else delete next.props;
      slots[i] = next;
      return slots;
    });

  const cycleHand = (seat: Seat) =>
    setView((v) => {
      const cur = v.hands[seat] ?? "auto";
      const nextExp = EXPOSURE_KEYS[(EXPOSURE_KEYS.indexOf(cur) + 1) % EXPOSURE_KEYS.length]!;
      return { ...v, hands: { ...v.hands, [seat]: nextExp } };
    });

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setView((v) => ({ ...v, layout: p.layout, cols: p.cols, slots: p.slots.map((s) => ({ ...s })) }));
    setSel(-1);
  };

  // Side effects (id minting, persistence, navigation) stay OUT of the state
  // updater: StrictMode double-invokes updaters, which would mint two ids.
  const saveView = () => {
    const id = savedId || `v${Date.now()}`;
    const name = (view.name || "").trim() || "Untitled view";
    const rec: TesterView = { ...view, id, name };
    const list = loadViews();
    const at = list.findIndex((x) => x.id === id);
    if (at >= 0) list[at] = rec;
    else list.push(rec);
    persistViews(list);
    setSaved(list);
    setSavedId(id);
    setView((v) => ({ ...v, id, name }));
    go({ mode: "build", view: id });
  };

  const openView = (rec: TesterView) => {
    setView({ ...newView(), ...rec });
    setSavedId(rec.id);
    setSel(-1);
    setStudent(false);
    go({ mode: "build", view: rec.id });
  };
  const dupView = (rec: TesterView) => {
    const copy: TesterView = { ...rec, id: `v${Date.now()}`, name: `${rec.name} copy` };
    const list = loadViews().concat([copy]);
    persistViews(list);
    setSaved(list);
  };
  const delView = (rec: TesterView) => {
    const list = loadViews().filter((x) => x.id !== rec.id);
    persistViews(list);
    setSaved(list);
    if (savedId === rec.id) setSavedId("");
  };
  const resetView = () => {
    setView(newView());
    setSavedId("");
    setSel(-1);
    go({ mode: "build", view: "" });
  };

  // ── chip helpers ────────────────────────────────────────────────────────────
  const Chip = ({
    on, label, onClick, title, disabled, tone,
  }: {
    on: boolean; label: string; onClick: () => void; title?: string; disabled?: boolean; tone?: "danger";
  }) => (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      title={title}
      aria-pressed={on}
      data-active={on ? "1" : "0"}
      disabled={disabled}
      style={{
        flex: "none",
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        background: tone === "danger" ? "#3a2224" : on ? C.chipOnBg : C.chipOffBg,
        border: `1px solid ${tone === "danger" ? "#5b3236" : on ? C.chipOnBorder : C.chipOffBorder}`,
        color: tone === "danger" ? "#e0a2a2" : on ? "#eaffff" : C.chipOffColor,
      }}
    >
      {label}
    </button>
  );

  const RailGroup = ({
    label, comparing, hint, children,
  }: { label: string; comparing?: boolean; hint?: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted2 }}>{label}</span>
        {comparing && <span style={{ fontSize: 10, fontWeight: 700, color: C.comparing }}>comparing</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{children}</div>
      {hint && <span style={{ fontSize: 11, color: C.muted2, lineHeight: 1.35 }}>{hint}</span>}
    </div>
  );

  const proleInfo = platformRoles.find((p) => p.role === params.prole);
  const buildViz = vizFor(moments[buildMoment], buildRole, params.skin, params);
  const selSlot = sel >= 0 ? view.slots[sel] : undefined;
  const selParts: PartDef[] = selSlot ? (PARTS[selSlot.component] ?? []) : [];
  const editing = !student;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", background: C.pageBg, color: C.text, fontFamily: FONT, overflow: "hidden" }}>
      {/* ── top bar ── */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "8px 14px", background: C.bar, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Component tester</span>
        {/* mode tabs */}
        <div style={{ display: "flex", gap: 2, padding: 2, background: "#11161a", border: `1px solid ${C.chipOffBorder}`, borderRadius: 7 }}>
          {(["inspect", "build"] as TesterMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => go({ mode: m })}
              data-active={mode === m ? "1" : "0"}
              style={{ height: 26, padding: "0 14px", border: 0, borderRadius: 5, background: mode === m ? C.chipOnBg : "transparent", color: mode === m ? "#fff" : "#8b979e", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {m === "inspect" ? "Inspect" : "Build"}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>
          {mode === "inspect"
            ? `${REGISTRY.length} components · every cell is a real session`
            : "Compose a screen from components, then save it"}
        </span>
        <div style={{ flex: 1 }} />
        {mode === "inspect" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, letterSpacing: ".12em", color: C.muted }}>COMPARE</span>
            <div style={{ display: "flex", gap: 5 }}>
              {AXES.map((a) => (
                <Chip key={a.id} on={params.axis === a.id} label={a.label} onClick={() => go({ axis: a.id })} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {editing && (
              <>
                <input
                  aria-label="View name"
                  value={view.name}
                  onChange={(e) => setView((v) => ({ ...v, name: e.target.value }))}
                  placeholder="Untitled view"
                  style={{ height: 28, width: 180, padding: "0 9px", border: `1px solid ${C.chipOffBorder}`, borderRadius: 6, background: "#11161a", color: C.text, fontSize: 13 }}
                />
                <button type="button" onClick={saveView} style={{ height: 28, padding: "0 13px", border: 0, borderRadius: 6, background: C.chipOnBg, color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {savedId ? "Update" : "Save"}
                </button>
                <button type="button" onClick={resetView} style={{ height: 28, padding: "0 11px", border: `1px solid ${C.chipOffBorder}`, borderRadius: 6, background: C.chipOffBg, color: C.chipOffColor, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  New
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setStudent((s) => !s); setSel(-1); }}
              data-testid="student-toggle"
              style={{ height: 28, padding: "0 11px", border: `1px solid ${student ? C.chipOnBorder : C.chipOffBorder}`, borderRadius: 6, background: student ? C.chipOnBg : C.chipOffBg, color: student ? "#fff" : C.chipOffColor, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              {student ? "Back to editing" : "Preview as student"}
            </button>
          </div>
        )}
      </div>

      {/* ── body (called as plain functions so the Canvas subtree is not remounted) ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {mode === "inspect" ? InspectBody() : BuildBody()}
      </div>
    </div>
  );

  // ── inspect body ────────────────────────────────────────────────────────────
  function InspectBody() {
    return (
      <>
        {/* left rail — component list */}
        <div style={{ width: 206, flex: "none", background: C.panel, borderRight: `1px solid ${C.line}`, overflowY: "auto", padding: "10px 0" }}>
          {registryGroups().map((g) => (
            <div key={g.group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted2, padding: "0 12px 4px" }}>{g.group}</div>
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
                      width: "100%", height: 29, display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 8, padding: "0 12px", border: 0, borderLeft: `3px solid ${active ? C.chipOnBorder : "transparent"}`,
                      background: active ? "#0f1417" : "transparent", color: active ? C.text : C.chipOffColor,
                      fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", textAlign: "left",
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

        {/* canvas — horizontally-scrolling cells (fix (a): nowrap max-content row) */}
        <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 18 }}>
          <div style={{ marginBottom: 4, fontSize: 16, fontWeight: 700 }}>{entry.label}</div>
          <div style={{ marginBottom: 14, fontSize: 12, color: C.muted }}>{entry.note}</div>
          <div style={{ display: "flex", flexWrap: "nowrap", width: "max-content", gap: 16, alignItems: "flex-start" }}>
            {cells.map((desc) => {
              const ctx = buildCtx(desc);
              const gated = entry.platformGated;
              const cellNote = params.live ? (ctx.onTurn ? "on turn" : "not on turn") : "no controls";
              const noteColor = params.live ? C.muted : C.warn;
              const platformNote = params.axis === "platform" && !gated ? "no role-gated controls" : null;
              const log = intentLog[desc.key] ?? [];
              return (
                <div key={desc.key} style={{ flex: "none", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", background: "#0e1216" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", background: C.cellHead, borderBottom: `1px solid ${C.line}` }}>
                    <span data-testid="cell-label" style={{ fontSize: 12, fontWeight: 600 }}>{desc.label}</span>
                    <span style={{ fontSize: 10, color: noteColor }}>{platformNote ?? desc.note ?? cellNote}</span>
                  </div>
                  <div
                    data-testid="cell-body"
                    style={{ flex: "none", minWidth: entry.pad[0], minHeight: entry.pad[1], display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: ctx.skin.feltFlat }}
                  >
                    {entry.mount(ctx)}
                  </div>
                  <div style={{ minHeight: 20, padding: "4px 10px", background: "#0b0f12", borderTop: `1px solid ${C.line}`, fontFamily: "ui-monospace, monospace", fontSize: 10, color: C.comparing }}>
                    {log.length === 0 ? <span style={{ color: C.muted2 }}>{cellNote}</span> : log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* right rail — inspect toggles */}
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
        </div>
      </>
    );
  }

  // ── build body ──────────────────────────────────────────────────────────────
  function BuildBody() {
    return (
      <>
        {editing && (
          <div style={{ width: 224, flex: "none", background: C.panel, borderRight: `1px solid ${C.line}`, overflowY: "auto", padding: "12px 10px 24px" }}>
            {/* presets */}
            <div style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted2, marginBottom: 6 }}>Start from</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
              {PRESET_KEYS.map(([k, label]) => (
                <Chip key={k} on={false} label={label} onClick={() => applyPreset(k)} />
              ))}
            </div>
            {/* palette */}
            <div style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted2, marginBottom: 6 }}>Add to view</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
              {PALETTE.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  data-testid={`palette-${p.key}`}
                  onClick={() => addSlot(p.key)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%", height: 27, padding: "0 8px", border: 0, borderRadius: 4, background: "#181e22", color: "#aab5bc", fontFamily: "inherit", fontSize: 12.5, textAlign: "left", cursor: "pointer" }}
                >
                  <span>{p.label}</span>
                  <span style={{ fontSize: 14, color: C.muted2 }}>+</span>
                </button>
              ))}
            </div>
            {/* saved views library */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted2 }}>Saved views</span>
              <span style={{ fontSize: 10, color: C.muted2 }}>{saved.length || ""}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {saved.length === 0 ? (
                <div style={{ width: "100%", padding: "14px 10px", border: `1px dashed ${C.chipOffBorder}`, borderRadius: 7, fontSize: 11.5, lineHeight: 1.5, color: C.muted2 }}>
                  No saved views yet. Build one, name it, then press Save.
                </div>
              ) : (
                saved.map((rec) => (
                  <div key={rec.id} data-testid="saved-view" style={{ width: "100%", border: `1px solid ${rec.id === savedId ? C.chipOnBg : C.line}`, borderRadius: 7, overflow: "hidden", background: "#171c20" }}>
                    <div onClick={() => openView(rec)} style={{ position: "relative", height: 96, overflow: "hidden", background: "#0f1417", cursor: "pointer" }}>
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        <Canvas
                          slots={rec.slots}
                          layout={rec.layout}
                          cols={rec.cols}
                          gap={rec.gap}
                          labels={false}
                          hideInactive={false}
                          hands={rec.hands}
                          ctx={buildViz}
                          minHeight={96}
                          fit="box"
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 6px", borderTop: `1px solid ${C.line}` }}>
                      <span onClick={() => openView(rec)} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: rec.id === savedId ? "#fff" : "#c3ced4", cursor: "pointer" }}>{rec.name}</span>
                      <button type="button" title="Duplicate" aria-label={`Duplicate ${rec.name}`} onClick={() => dupView(rec)} style={{ width: 22, height: 22, flex: "none", border: 0, borderRadius: 4, background: C.chipOffBg, color: "#8b979e", fontSize: 11, cursor: "pointer" }}>⧉</button>
                      <button type="button" title="Delete" aria-label={`Delete ${rec.name}`} onClick={() => delView(rec)} style={{ width: 22, height: 22, flex: "none", border: 0, borderRadius: 4, background: C.chipOffBg, color: "#b06a6a", fontSize: 12, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* centre — canvas + slot bar */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 16px" }}>
            <Canvas
              slots={view.slots}
              layout={view.layout}
              cols={view.cols}
              gap={view.gap}
              labels={view.labels}
              hideInactive={view.hideInactive}
              hands={view.hands}
              ctx={buildViz}
              minHeight={420}
              fit="width"
              selected={editing ? sel : -1}
              onSelect={editing ? (i) => setSel((cur) => (cur === i ? -1 : i)) : undefined}
            />
          </div>

          {editing && (
            <div style={{ flex: "none", borderTop: `1px solid ${C.line}`, background: C.panel, padding: "9px 16px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted2 }}>Slots</span>
                <span style={{ fontSize: 11, color: C.muted2 }}>{view.slots.length ? "click to select, then reorder or resize below" : ""}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                {view.slots.length === 0 ? (
                  <span style={{ fontSize: 12, color: C.muted2 }}>Empty view — add components from the left.</span>
                ) : (
                  view.slots.map((slot, i) => (
                    <Chip
                      key={i}
                      on={i === sel}
                      label={(PALETTE_LABEL[slot.component] ?? slot.component) + (slot.seat ? ` ${slot.seat}` : "") + (slot.span ? ` ×${slot.span}` : "")}
                      onClick={() => setSel((cur) => (cur === i ? -1 : i))}
                    />
                  ))
                )}
              </div>
              {selSlot && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 9, paddingTop: 9, borderTop: "1px solid #222a30" }}>
                  <span style={{ fontSize: 11, color: "#8b979e", marginRight: 3 }}>{(PALETTE_LABEL[selSlot.component] ?? selSlot.component) + (selSlot.seat ? ` ${selSlot.seat}` : "")}</span>
                  <Chip on={false} label="◀ move" title="Move earlier" onClick={() => move(-1)} disabled={sel <= 0} />
                  <Chip on={false} label="move ▶" title="Move later" onClick={() => move(1)} disabled={sel >= view.slots.length - 1} />
                  <Chip on={false} label="− width" title="Narrower" onClick={() => span(-1)} disabled={(selSlot.span ?? 1) <= 1} />
                  <Chip on={false} label="+ width" title="Wider" onClick={() => span(1)} disabled={(selSlot.span ?? 1) >= view.cols} />
                  {SEAT_KINDS.has(selSlot.component) &&
                    SEAT_ORDER.map((s) => (
                      <Chip key={s} on={selSlot.seat === s} label={s} title={`Seat ${s}`} onClick={() => setSeat(s)} />
                    ))}
                  <Chip on={false} label="Remove" title="Remove from view" tone="danger" onClick={removeSlot} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* right rail — build controls */}
        {editing && (
          <div style={{ width: 216, flex: "none", background: C.panel, borderLeft: `1px solid ${C.line}`, overflowY: "auto", padding: "12px 12px 24px" }}>
            {/* Show in <component> */}
            <RailGroup
              label={`Show in ${selSlot ? (PALETTE_LABEL[selSlot.component] ?? selSlot.component) : "component"}`}
              hint={
                !selSlot
                  ? "Select a slot below the canvas to choose what shows inside it."
                  : selParts.length
                    ? "Applies to this one slot and is saved with the view."
                    : "This component has no separately hideable parts."
              }
            >
              {selSlot &&
                selParts.map((part) => (
                  <Chip
                    key={part.key}
                    on={partOn(selSlot, part)}
                    label={part.label}
                    onClick={() => togglePart(part)}
                  />
                ))}
            </RailGroup>

            {/* Hands shown */}
            <RailGroup label="Hands shown" hint="Auto follows the session's own visibility rules; the others are a coach overriding them.">
              {SEAT_ORDER.map((seat) => {
                const exp: HandExposure = view.hands[seat] ?? "auto";
                return (
                  <Chip
                    key={seat}
                    on={exp !== "auto"}
                    label={`${seat} · ${EXPOSURE_LABEL[exp]}`}
                    onClick={() => cycleHand(seat)}
                  />
                );
              })}
            </RailGroup>

            {/* Layout */}
            <RailGroup label="Layout">
              {(["grid", "row", "column"] as const).map((k) => (
                <Chip key={k} on={view.layout === k} label={k} onClick={() => setView((v) => ({ ...v, layout: k }))} />
              ))}
              {[2, 3, 4].map((n) => (
                <Chip key={n} on={view.cols === n} label={`${n} cols`} onClick={() => setView((v) => ({ ...v, cols: n }))} />
              ))}
            </RailGroup>

            {/* Info */}
            <RailGroup label="Info" hint="Hide inactive drops slots with nothing to show — the bid box after the auction.">
              <Chip on={view.labels} label="Labels" onClick={() => setView((v) => ({ ...v, labels: !v.labels }))} />
              <Chip on={view.hideInactive} label="Hide inactive" onClick={() => setView((v) => ({ ...v, hideInactive: !v.hideInactive }))} />
            </RailGroup>

            {/* Preview context */}
            <RailGroup label="Viewer role" hint="A saved view stores layout only; this is just what you preview against.">
              {ROLE_ORDER.map((r) => (
                <Chip key={r} on={buildRole === r} label={ROLE_TITLE[r]} onClick={() => setBuildRole(r)} />
              ))}
            </RailGroup>
            <RailGroup label="Preview context">
              {MOMENTS.map((m) => (
                <Chip key={m.id} on={buildMoment === m.id} label={m.label} onClick={() => setBuildMoment(m.id)} />
              ))}
            </RailGroup>
          </div>
        )}
      </>
    );
  }
}
