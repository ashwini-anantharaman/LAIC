import { jsx as n, jsxs as d, Fragment as me } from "react/jsx-runtime";
import { createContext as Ki, useContext as Yi, useState as V, useRef as oe, useCallback as Me, useLayoutEffect as Nt, useEffect as xe, useReducer as Ui, useMemo as ue } from "react";
const Gi = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
function Zt({ isolate: e = !1, fontFamily: t = Gi } = {}) {
  return {
    ...e ? {
      all: "initial",
      fontFamily: t,
      // `all: initial` takes these to values the leaves already assume;
      // restated so the intent is legible rather than incidental.
      color: "#111827",
      lineHeight: "normal",
      textAlign: "left",
      // A layout boundary as well as a style one: no margin collapses out
      // of it, and nothing inside it can reflow the host.
      contain: "layout style"
    } : {},
    boxSizing: "border-box",
    // The defence against a host's `flex: 1` — measured: a plain `flex: 1` on
    // this element loses to it. (`flex: 1 !important` still wins; see above.)
    flex: "none",
    // The cross-axis twin, and the one that actually holds the HEIGHT: a flex
    // or grid container stretches its items by default, and this is what stops
    // the component being pulled to its host's height with the slack painted in
    // whatever it draws at its edges.
    alignSelf: "start",
    // A flex/grid item's automatic minimum size is its CONTENT, which lets a
    // wide table push the host's column wider instead of scrolling inside it.
    minWidth: 0
  };
}
function fd({ isolate: e, fontFamily: t, style: o, className: r, children: l }) {
  return /* @__PURE__ */ n("div", { className: r, style: { ...Zt({ isolate: e, fontFamily: t }), display: "block", ...o }, children: l });
}
function yt(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function $o(e) {
  return `${e.suit}${e.rank}`;
}
const ze = ["S", "W", "N", "E"];
function mt(e) {
  return ze[(ze.indexOf(e) + 1) % 4];
}
function Ji(e) {
  return mt(mt(e));
}
function kr(e, t) {
  return e === t || Ji(e) === t;
}
const Vi = {
  none: "None",
  ns: "N-S",
  ew: "E-W",
  both: "Both"
};
function Qi(e, t) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const o = t === "N" || t === "S";
  return e === "ns" ? o : !o;
}
const qi = { C: "♣", D: "♦", H: "♥", S: "♠" };
function Ut(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
function Zi(e) {
  const t = e.strain === "N" ? "NT" : qi[e.strain], o = e.doubled === 1 ? " X" : e.doubled === 2 ? " XX" : "";
  return `${e.level}${t}${o} by ${e.declarer}`;
}
const Sr = ["C", "D", "H", "S", "N"];
function Co(e) {
  return Ut(e) ? (Number(e[0]) - 1) * 5 + Sr.indexOf(e[1]) : -1;
}
function Xe(e, t) {
  const o = /* @__PURE__ */ new Set(["P"]);
  let r = -1;
  for (const c of e) r = Math.max(r, Co(c.call));
  for (let c = 1; c <= 7; c++)
    for (const i of Sr) {
      const a = `${c}${i}`;
      Co(a) > r && o.add(a);
    }
  let l = null;
  for (let c = e.length - 1; c >= 0; c--)
    if (e[c].call !== "P") {
      l = e[c];
      break;
    }
  return l && !kr(l.seat, t) && (Ut(l.call) ? o.add("X") : l.call === "X" && o.add("XX")), o;
}
function el(e) {
  if (e.length < 4) return !1;
  const t = e.slice(-3);
  return t.length === 3 && t.every((o) => o.call === "P");
}
function tl(e) {
  let t = null, o = 0;
  for (const i of e)
    Ut(i.call) ? (t = i, o = 0) : i.call === "X" ? o = 1 : i.call === "XX" && (o = 2);
  if (!t) return null;
  const r = t.call[1], l = t.seat;
  let c = t.seat;
  for (const i of e)
    if (Ut(i.call) && i.call[1] === r && kr(i.seat, l)) {
      c = i.seat;
      break;
    }
  return { level: Number(t.call[0]), strain: r, doubled: o, declarer: c };
}
function St(e, t, o, r) {
  return {
    boardRef: e,
    dealer: t,
    vul: o,
    hands: {
      N: [...r.N],
      E: [...r.E],
      S: [...r.S],
      W: [...r.W]
    },
    auction: [],
    contract: null,
    phase: "auction",
    turn: t,
    tricks: [],
    trickCount: { NS: 0, EW: 0 }
  };
}
const vr = (e) => e === "N" || e === "S" ? "NS" : "EW";
function nl(e, t) {
  const o = e.plays[0].card.suit, r = (c, i) => {
    const a = t !== "N" && c.suit === t, s = t !== "N" && i.suit === t;
    if (a && !s) return !0;
    if (s && !a) return !1;
    if (a && s) return c.rank > i.rank;
    const h = c.suit === o, b = i.suit === o;
    return h && !b ? !0 : b && !h ? !1 : c.rank > i.rank;
  };
  let l = e.plays[0];
  for (const c of e.plays.slice(1)) r(c.card, l.card) && (l = c);
  return l.seat;
}
function Gt(e, t) {
  const o = e.hands[t], r = e.tricks[e.tricks.length - 1];
  if (!r || r.plays.length === 0 || r.plays.length === 4) return [...o];
  const c = r.plays[0].card.suit, i = o.filter((a) => a.suit === c);
  return i.length ? i : [...o];
}
function _e(e, t) {
  if (t.category === "bid-event") {
    const p = [...e.auction, { seat: t.seat, call: t.call }];
    if (!el(p))
      return { ...e, auction: p, turn: mt(t.seat) };
    const g = tl(p);
    if (!g)
      return { ...e, auction: p, contract: null, phase: "complete" };
    const S = mt(g.declarer);
    return {
      ...e,
      auction: p,
      contract: g,
      phase: "play",
      turn: S,
      tricks: [{ leader: S, plays: [] }]
    };
  }
  const o = t.seat, r = {
    ...e.hands,
    [o]: e.hands[o].filter((p) => $o(p) !== $o(t.card))
  }, l = e.tricks.map((p) => ({ ...p, plays: [...p.plays] }));
  let c = l[l.length - 1];
  if ((!c || c.plays.length === 4) && (c = { leader: o, plays: [] }, l.push(c)), c.plays.push({ seat: o, card: t.card }), c.plays.length < 4)
    return { ...e, hands: r, tricks: l, turn: mt(o) };
  const i = e.contract ? e.contract.strain : "N", a = nl(c, i);
  c.winner = a;
  const s = vr(a), h = { ...e.trickCount, [s]: e.trickCount[s] + 1 }, b = r.N.length === 0 && r.E.length === 0 && r.S.length === 0 && r.W.length === 0;
  return {
    ...e,
    hands: r,
    tricks: l,
    trickCount: h,
    turn: a,
    phase: b ? "complete" : "play"
  };
}
const Bo = { C: 20, D: 20, H: 30, S: 30 };
function wr(e) {
  if (e.phase !== "complete") return null;
  const t = e.contract;
  if (!t)
    return {
      contract: null,
      tricksTaken: 0,
      result: 0,
      made: !1,
      vulnerable: !1,
      trickScore: 0,
      overtrickScore: 0,
      gameBonus: 0,
      partscoreBonus: 0,
      slamBonus: 0,
      insultBonus: 0,
      penalty: 0,
      declarerScore: 0,
      nsScore: 0
    };
  const o = vr(t.declarer), r = e.trickCount[o], l = 6 + t.level, c = r - l, i = c >= 0, a = Qi(e.vul, t.declarer), s = t.doubled, h = s === 2 ? 4 : s === 1 ? 2 : 1;
  let b = 0, p = 0, g = 0, S = 0, u = 0, m = 0, y = 0;
  if (i) {
    b = t.strain === "N" ? (40 + (t.level - 1) * 30) * h : Bo[t.strain] * t.level * h;
    const H = s === 0 ? t.strain === "N" ? 30 : Bo[t.strain] : (a ? 200 : 100) * (s === 2 ? 2 : 1);
    p = c * H, b >= 100 ? g = a ? 500 : 300 : S = 50, t.level === 6 && (u = a ? 750 : 500), t.level === 7 && (u = a ? 1500 : 1e3), s > 0 && (m = 50 * s);
  } else {
    const H = -c;
    if (s === 0)
      y = H * (a ? 100 : 50);
    else {
      let L = 0;
      for (let w = 1; w <= H; w++)
        w === 1 ? L += a ? 200 : 100 : w <= 3 ? L += a ? 300 : 200 : L += 300;
      y = L * (s === 2 ? 2 : 1);
    }
  }
  const $ = i ? b + p + g + S + u + m : -y;
  return {
    contract: t,
    tricksTaken: r,
    result: c,
    made: i,
    vulnerable: a,
    trickScore: b,
    overtrickScore: p,
    gameBonus: g,
    partscoreBonus: S,
    slamBonus: u,
    insultBonus: m,
    penalty: y,
    declarerScore: $,
    nsScore: o === "NS" ? $ : -$
  };
}
function Nr(e) {
  if (!e.contract) return "Passed out";
  const t = e.contract, o = t.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[t.strain], r = t.doubled === 1 ? " X" : t.doubled === 2 ? " XX" : "", l = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${t.level}${o}${r} by ${t.declarer}, ${l}`;
}
function ol(e) {
  let t = e >>> 0;
  return () => {
    t |= 0, t = t + 1831565813 | 0;
    let o = Math.imul(t ^ t >>> 15, 1 | t);
    return o = o + Math.imul(o ^ o >>> 7, 61 | o) ^ o, ((o ^ o >>> 14) >>> 0) / 4294967296;
  };
}
function Ze(e) {
  const t = ol(e), r = ["S", "H", "D", "C"].flatMap(
    (c) => Array.from({ length: 13 }, (i, a) => ({ suit: c, rank: a + 2 }))
  );
  for (let c = r.length - 1; c > 0; c--) {
    const i = Math.floor(t() * (c + 1));
    [r[c], r[i]] = [r[i], r[c]];
  }
  const l = { N: [], E: [], S: [], W: [] };
  return r.forEach((c, i) => l[ze[i % 4]].push(c)), l;
}
const rl = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, il = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, ll = { skin: "bbo" }, al = {
  skins: rl,
  strainTint: il,
  defaults: ll
}, Qn = al, Ro = Qn.skins, wn = Qn.strainTint, sl = {
  skin: Qn.defaults.skin
};
function $r(e, t = {}) {
  const o = Ro[e] ?? Ro[sl.skin], r = (c) => {
    const i = t[c];
    return typeof i == "string" && i.trim() !== "" ? i : void 0;
  }, l = r("feltColor");
  return {
    ...o,
    felt: l ?? o.felt,
    feltFlat: l ?? o.feltFlat,
    accent: r("accent") ?? o.accent,
    trayBg: r("bidBoxColor") ?? o.trayBg,
    auctionBg: r("auctionColor") ?? o.auctionBg,
    cardBack: r("cardBackColor") ?? o.cardBack
  };
}
const dl = ["N", "S", "H", "D", "C"], Cr = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, Fn = [1, 2, 3, 4, 5, 6, 7], Jt = 2, Br = 2, cl = 46;
function Rr(e) {
  const t = Math.min(1, e / cl);
  return {
    // HEIGHT DOES NOT SCALE. The overflow was horizontal, and the phone tier
    // prices this pad by ratio (`padHeight`) rather than by `bidColumnsH`, so
    // a shorter row there would shift a budget this fix has no business
    // touching. Only the width drivers below move.
    btnH: 38,
    btnFont: Math.max(11, Math.round(18 * t)),
    padX: Math.max(8, Math.round(16 * t)),
    callFont: Math.max(12, Math.round(20 * t)),
    gap: Math.max(6, Math.round(10 * t))
  };
}
const fl = (e) => Rr(e).btnH + Br * 2, hl = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${Cr[e[1] ?? "N"] ?? ""}`;
function ul(e = 46, { pending: t = !1, minCellH: o = 0 } = {}) {
  const r = Math.round(e * 0.13), l = Math.round(e * 0.11), c = Math.max(Math.round(e * 0.92), o), i = Fn.length * c + (Fn.length - 1) * r + l * 2 + Jt * 2, a = c + Jt * 2;
  return (t ? fl(e) + r : 0) + i + r + a;
}
function xt({
  cell: e = 46,
  minCellH: t = 0,
  radius: o = 5,
  legalCalls: r,
  live: l,
  pending: c,
  onStage: i,
  onConfirm: a,
  onCancel: s
}) {
  const h = Math.round(e * 0.13), b = Math.round(e * 0.11), p = e, g = Math.max(Math.round(e * 0.92), t), S = Math.round(e * 3.4), u = Math.round(e * 0.62), m = Math.round(e * 0.42), y = new Set(r), $ = c != null, H = Rr(e), L = (z, x) => {
    const D = `${x}${z}`, O = wn[z], k = y.has(D), C = l && !$ && k;
    return /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: C ? () => i(D) : void 0,
        "aria-label": `${x}${z === "N" ? "NT" : z}`,
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: p,
          height: g,
          padding: 0,
          background: "transparent",
          border: 0,
          color: O.ink,
          lineHeight: 1,
          cursor: C ? "pointer" : "default",
          opacity: k ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: u, fontWeight: 700, lineHeight: 1 }, children: x }),
          /* @__PURE__ */ n("span", { style: { fontSize: m, fontWeight: 700, lineHeight: 1 }, children: Cr[z] })
        ]
      },
      D
    );
  }, w = (z, x, D, O, k, C) => {
    const E = y.has(z), X = l && !$ && E;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: X ? () => i(z) : void 0,
        "aria-label": z === "P" ? "Pass" : z === "X" ? "Double" : "Redouble",
        style: {
          width: D,
          height: g,
          background: O,
          border: `${Jt}px solid ${k}`,
          borderRadius: o,
          color: "#fff",
          fontWeight: 700,
          fontSize: u,
          lineHeight: 1,
          cursor: X ? "pointer" : "default",
          opacity: E ? 1 : 0.3,
          ...C
        },
        children: x
      },
      z
    );
  };
  return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: h }, children: [
    c != null && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: H.gap, padding: `${Br}px 0` }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: H.callFont, fontWeight: 700, color: "#12281f", whiteSpace: "nowrap" }, children: hl(c) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: a,
          style: { height: H.btnH, padding: `0 ${H.padX}px`, border: "1px solid #0c4b0b", borderRadius: o, background: "#116710", color: "#fff", fontSize: H.btnFont, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" },
          children: "Confirm"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: s,
          style: { height: H.btnH, padding: `0 ${H.padX}px`, border: "1px solid #5e1c1c", borderRadius: o, background: "#8a3030", color: "#fff", fontSize: H.btnFont, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: h }, children: dl.map((z) => /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: h,
          padding: b,
          background: wn[z].bg,
          border: `${Jt}px solid ${wn[z].edge}`,
          borderRadius: o
        },
        children: Fn.map((x) => L(z, x))
      },
      z
    )) }),
    /* @__PURE__ */ d("div", { style: { display: "flex", gap: h }, children: [
      w("P", "Pass", S, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      w("X", "X", p, "#7a5b3a", "#5e4227"),
      w("XX", "XX", p, "#2b6b73", "#1c4d53", { fontSize: Math.round(u * 0.78) })
    ] })
  ] });
}
const pl = {
  LinkComponent: "a",
  navigate: (e, { replace: t }) => {
    typeof window > "u" || (t ? window.location.replace(e) : window.location.assign(e));
  }
}, gl = Ki(pl);
function Er() {
  return Yi(gl);
}
const _n = "#384bb3", Eo = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: _n, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, To = 48;
function nt({
  side: e,
  items: t,
  thickness: o = 44,
  condensed: r = !1,
  scale: l,
  minTouch: c = 30,
  bg: i = "rgba(9,22,17,.90)",
  accent: a = _n
}) {
  const [s, h] = V(99), [b, p] = V(99), [g, S] = V(!1), u = oe(null), m = oe(null), y = oe(null), $ = oe(() => {
  }), H = a === _n ? Eo : { ...Eo, accent: { bg: a, border: a, color: "#fff" } }, L = o, w = Math.min(
    Math.round(L * 2.2),
    Math.max(
      Math.round(L * 0.68),
      L - 14,
      l ? Math.ceil(c / Math.max(0.05, l)) : 0
    )
  ), { LinkComponent: z } = Er(), x = r ? 5 : 7, D = Math.round(w * (r ? 0.17 : 0.4)), O = Math.max(r ? 11 : 13, Math.round(w * (r ? 0.28 : 0.4))), k = Math.round(w * 0.86), C = Math.max(9, Math.round(w * 0.26));
  let E = -1;
  t.forEach((N, W) => {
    N.kind === "spacer" && (E = W);
  });
  const X = E < 0 ? t : t.slice(0, E), A = E < 0 ? [] : t.slice(E + 1), j = X.length, K = A.length, ee = Math.max(0, Math.min(s, j)), T = Math.max(1, Math.min(b, K)), F = A.slice(A.length - T), q = X.slice(ee).concat(A.slice(0, A.length - T)).filter((N) => N.kind !== "divider"), B = q.length > 0, I = g && B, M = Me(() => {
    const N = u.current;
    if (!N) return;
    const W = Math.min(s, j), U = N.clientWidth;
    if (U > 0) {
      if (N.scrollWidth > U + 1) {
        const Y = parseFloat(getComputedStyle(N).gap) || 0;
        let fe = 0, v = 0;
        for (const _ of Array.from(N.children))
          if (fe += _.offsetWidth + (v ? Y : 0), fe <= U) v++;
          else break;
        v < W && h(v);
        return;
      }
      if (U - N.scrollWidth > To && W < j) {
        h(W + 1);
        return;
      }
      if (W !== s) {
        h(W);
        return;
      }
    }
    const P = m.current;
    if (!P) return;
    const re = Math.min(b, K);
    W === 0 && P.scrollWidth > P.clientWidth + 1 && re > 1 ? p(re - 1) : P.clientWidth - P.scrollWidth > To && re < K ? p(re + 1) : re !== b && p(re);
  }, [s, b, j, K]);
  Nt(() => {
    $.current = M, M();
  }), xe(() => {
    const N = (W) => {
      m.current && !m.current.contains(W.target) && S(!1);
    };
    return document.addEventListener("mousedown", N), () => {
      document.removeEventListener("mousedown", N), y.current && y.current.disconnect();
    };
  }, []);
  const te = Me((N) => {
    y.current && (y.current.disconnect(), y.current = null), u.current = N, m.current = N ? N.parentElement : null, N && (typeof ResizeObserver == "function" && (y.current = new ResizeObserver(() => $.current()), y.current.observe(N)), $.current());
  }, []), ne = (N, W) => {
    if (N.kind === "spacer") return null;
    if (N.kind === "node")
      return /* @__PURE__ */ n("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: x }, children: N.node }, W);
    if (N.kind === "divider")
      return /* @__PURE__ */ n("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, W);
    if (N.kind === "chip")
      return /* @__PURE__ */ d("div", { title: N.title ?? N.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: k, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: C, fontWeight: r ? 700 : 400, letterSpacing: ".09em", textTransform: "uppercase", color: r ? "#a3b7ae" : "#8fa39a" }, children: N.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: O, fontWeight: r ? 800 : 700, lineHeight: 1, color: N.color ?? "#eef4f1" }, children: N.value })
      ] }, W);
    const U = H[N.tone ?? "plain"], P = N.disabled === !0, re = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: N.kind === "icon" ? w : void 0,
      height: w,
      padding: N.kind === "icon" ? 0 : `0 ${D}px`,
      border: `1px solid ${U.border}`,
      borderRadius: 6,
      background: U.bg,
      color: U.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: O,
      fontWeight: N.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: P || !N.on && !N.href ? "default" : "pointer",
      opacity: P ? 0.42 : 1
    };
    return N.href && !P ? /* @__PURE__ */ n(z, { href: N.href, title: N.title ?? N.label, "aria-label": N.ariaLabel, style: re, children: N.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: N.title ?? N.label, "aria-label": N.ariaLabel, disabled: P, onClick: P ? void 0 : N.on ?? void 0, style: re, children: N.label }, W);
  }, le = (N, W) => {
    if (N.kind === "divider" || N.kind === "spacer") return null;
    if (N.kind === "chip")
      return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: N.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: N.color ?? "#eef4f1" }, children: N.value })
      ] }, W);
    if (N.kind === "node")
      return /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: N.node }, W);
    const U = H[N.tone ?? "plain"], P = N.disabled === !0, re = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: w,
      marginBottom: 4,
      padding: `0 ${D}px`,
      border: `1px solid ${U.border}`,
      borderRadius: 6,
      background: U.bg,
      color: U.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: O,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: P || !N.on && !N.href ? "default" : "pointer",
      opacity: P ? 0.42 : 1
    }, Y = () => S(!1);
    return N.href && !P ? /* @__PURE__ */ n(z, { href: N.href, title: N.title ?? N.label, "aria-label": N.ariaLabel, style: re, onClick: Y, children: N.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: N.title ?? N.label, "aria-label": N.ariaLabel, disabled: P, onClick: P ? void 0 : () => {
      var fe;
      (fe = N.on) == null || fe.call(N), Y();
    }, style: re, children: N.label }, W);
  }, G = Math.max(L, w + 14), ie = {
    position: "absolute",
    ...e === "bottom" ? { bottom: w + 12 } : { top: w + 12 },
    right: 0,
    zIndex: 40,
    minWidth: Math.round(w * 4.2),
    maxHeight: Math.round(w * 7),
    overflowY: "auto",
    padding: 8,
    borderRadius: 8,
    background: "#0f1a16",
    border: "1px solid rgba(255,255,255,.16)",
    boxShadow: "0 10px 26px rgba(0,0,0,.45)"
  };
  return /* @__PURE__ */ d(
    "div",
    {
      "data-testid": "edge-toolbar",
      style: { width: "100%", [r ? "height" : "minHeight"]: G, flex: "none", display: "flex", alignItems: "center", gap: x, padding: `6px ${r ? 8 : 10}px`, background: i, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ n(
          "div",
          {
            ref: te,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: x, ...r ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: X.slice(0, ee).map(ne)
          }
        ),
        B && /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: () => S((N) => !N),
              title: `${q.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: w, padding: `0 ${D}px`, border: `1px solid ${I ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: I ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: O, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ n("span", { children: "⋯" }),
                /* @__PURE__ */ n("span", { style: { fontSize: C, opacity: 0.8 }, children: q.length })
              ]
            }
          ),
          I && /* @__PURE__ */ n("div", { style: ie, children: q.map(le) })
        ] }),
        F.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: x }, children: F.map(ne) })
      ]
    }
  );
}
function Wo({
  title: e = "Table settings",
  accent: t = "#384bb3",
  items: o,
  onClose: r
}) {
  const { navigate: l } = Er(), c = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, i = (a) => /* @__PURE__ */ d(me, { children: [
    /* @__PURE__ */ n("span", { children: a.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700, color: t }, children: a.value })
  ] });
  return /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, zIndex: 20 }, children: [
    /* @__PURE__ */ n(
      "div",
      {
        style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" },
        onClick: r,
        "aria-hidden": !0
      }
    ),
    /* @__PURE__ */ d("div", { style: { position: "absolute", left: 12, top: 12, width: 268, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.5)", overflow: "hidden" }, children: [
      /* @__PURE__ */ n("div", { style: { background: t, color: "#fff", fontSize: 17, fontWeight: 700, padding: "6px 10px" }, children: e }),
      o.map(
        (a) => a.action ? (
          // A server action persists the change; the resulting server
          // re-render preserves the client menuOpen state, so the menu stays
          // open exactly as an href row does.
          /* @__PURE__ */ n("form", { action: a.action, style: { margin: 0, display: "block" }, children: /* @__PURE__ */ n("button", { type: "submit", style: c, children: i(a) }) }, a.label)
        ) : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: a.on ?? (a.href ? () => {
              const s = a.href.split("?")[0] === window.location.pathname;
              l(a.href, { replace: s });
            } : void 0),
            style: c,
            children: i(a)
          },
          a.label
        )
      )
    ] })
  ] });
}
const Be = "#cc0000", Nn = "#fecd07", Tr = "#d3d3d3", Ao = "#f2e2b8", bl = "#b8901f", Wr = "#12525e", we = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, ht = ["C", "D", "H", "S", "N"], $n = ["W", "N", "E", "S"], Vt = ["S", "H", "C", "D"], yl = { N: "S", S: "N", E: "W", W: "E" }, We = (e) => e === "H" || e === "D", Ie = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), ml = (e) => /^[1-7][CDHSN]$/.test(e), Xn = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${we[e[1] ?? ""] ?? ""}`, Ar = (e) => ml(e) && We(e[1] ?? "") ? Be : "#000", xl = (e) => e === "N" || e === "S" ? "NS" : "EW", kl = `
@keyframes btu-deal {
  from { opacity: 0; transform: translateY(-10px) scale(.88); }
  to   { opacity: 1; transform: none; }
}
.btu-lift { transition: transform 150ms cubic-bezier(.2,.9,.3,1); }
.btu-deal { animation: btu-deal 170ms cubic-bezier(.2,.9,.3,1) both; }
@media (prefers-reduced-motion: reduce) {
  .btu-lift { transition: none; }
  .btu-deal { animation: none; }
}
`, Io = "btu-lift", Sl = "btu-deal";
function jn() {
  return /* @__PURE__ */ n("style", { href: "bridge-table-ui-motion", precedence: "default", children: kl });
}
function Cn({
  cards: e,
  metrics: t,
  layout: o,
  hidden: r = !1,
  fanSpread: l,
  fanRadius: c,
  backColor: i,
  backCount: a,
  backMetrics: s = { w: 14, h: 71 },
  isPlayable: h,
  onPlay: b
}) {
  if (r) {
    const A = Math.max(1, a ?? e.length);
    return /* @__PURE__ */ n("div", { style: { display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }, children: Array.from({ length: A }, (j, K) => /* @__PURE__ */ n("span", { style: { display: "block", width: s.w, height: s.h, background: i, borderLeft: K ? "1.5px solid rgba(255,255,255,.92)" : "none" } }, K)) });
  }
  const p = [...e].sort(
    (A, j) => Vt.indexOf(A.suit) - Vt.indexOf(j.suit) || j.rank - A.rank
  ), g = t.weight ?? 700, S = t.weight ?? 400;
  if (o === "row")
    return /* @__PURE__ */ d("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: [
      /* @__PURE__ */ n(jn, {}),
      p.map((A, j) => {
        const K = h ? h(A) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: K ? () => b == null ? void 0 : b(A) : void 0,
            "aria-label": `Play ${Ie(A.rank)}${we[A.suit]}`,
            className: Io,
            style: {
              position: "relative",
              display: "block",
              width: t.w,
              height: t.h,
              flex: "none",
              background: "#fff",
              border: "1px solid #6b6b6b",
              borderRadius: j === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
              marginLeft: j === 0 ? 0 : -(t.overlap ?? 1),
              padding: 0,
              cursor: K ? "pointer" : "default",
              transform: K ? "translateY(-6px)" : "none",
              // A lifted card rises ABOVE its neighbours: overlapped cards
              // paint in hand order, so without this the next card clips the
              // one the thumb is about to press.
              zIndex: K ? 2 : 1
            },
            children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: t.inset, top: t.inset > 3 ? t.inset : 1, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: We(A.suit) ? Be : "#000" }, children: [
              /* @__PURE__ */ n("span", { style: { fontSize: t.rank, fontWeight: g }, children: Ie(A.rank) }),
              /* @__PURE__ */ n("span", { style: { fontSize: t.glyph, fontWeight: S }, children: we[A.suit] })
            ] })
          },
          `${A.suit}${A.rank}`
        );
      })
    ] });
  const u = p.length, m = t.w, y = t.h, $ = l, H = c > 0 ? c : Math.round(y * 4.2), L = (A) => u <= 1 ? 0 : -$ / 2 + A * ($ / (u - 1));
  let w = 0, z = 0, x = 0, D = 0;
  for (let A = 0; A < u; A++) {
    const j = L(A) * Math.PI / 180, K = Math.cos(j), ee = Math.sin(j);
    for (const T of [-m / 2, m / 2])
      for (const F of [-H, -H + y]) {
        const q = T * K - F * ee, B = T * ee + F * K;
        q < w && (w = q), q > z && (z = q), B < x && (x = B), B > D && (D = B);
      }
  }
  const O = Math.ceil(Math.max(-w, z) * 2) + 4, k = Math.ceil(D - x) + 4, C = Math.ceil(-x - H) + 2, E = t.rank, X = t.glyph;
  return /* @__PURE__ */ d("div", { style: { position: "relative", width: O, height: k }, children: [
    /* @__PURE__ */ n(jn, {}),
    p.map((A, j) => {
      const K = h ? h(A) : !1;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: K ? () => b == null ? void 0 : b(A) : void 0,
          "aria-label": `Play ${Ie(A.rank)}${we[A.suit]}`,
          className: Io,
          style: {
            position: "absolute",
            left: "50%",
            top: C,
            width: m,
            height: y,
            padding: 0,
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: 4,
            boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
            transform: `translateX(-50%) rotate(${L(j)}deg)${K ? " translateY(-14px)" : ""}`,
            transformOrigin: `50% ${H}px`,
            zIndex: K ? 2 : 1,
            cursor: K ? "pointer" : "default"
          },
          children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: t.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: We(A.suit) ? Be : "#000" }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: E, fontWeight: g }, children: Ie(A.rank) }),
            /* @__PURE__ */ n("span", { style: { fontSize: X, fontWeight: S }, children: we[A.suit] })
          ] })
        },
        `${A.suit}${A.rank}`
      );
    })
  ] });
}
function vl({
  seat: e,
  name: t,
  tag: o,
  strip: r,
  bg: l,
  width: c,
  isDealer: i,
  metrics: a = {}
}) {
  const s = a.height ?? 22, h = a.badge ?? 20, b = a.font ?? 15, p = a.tagFont ?? 11, g = a.weight ?? 400;
  return /* @__PURE__ */ d("div", { "data-testid": "seat-plate", "data-seat": e, style: { display: "flex", alignItems: "stretch", gap: 5, width: c, height: s, padding: "0 3px 0 0", background: l, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${i ? bl : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { flex: "none", width: 6, background: r ?? "transparent" } }),
    /* @__PURE__ */ n("span", { style: { flex: "none", width: h, height: h, alignSelf: "center", background: Wr, color: "#fff", fontSize: b - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
    /* @__PURE__ */ n("span", { style: { alignSelf: "center", fontSize: b, fontWeight: g, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: t }),
    i && /* @__PURE__ */ n("span", { style: { alignSelf: "center", flex: "none", padding: "0 2px", fontSize: p, fontWeight: 700, color: "#7a5a12" }, children: "DEALER" }),
    /* @__PURE__ */ n("span", { style: { marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: p, fontWeight: g, color: "#555" }, children: o ?? "" })
  ] });
}
function $t({
  cards: e,
  panelBg: t,
  width: o,
  suitW: r,
  font: l,
  pad: c,
  bare: i,
  touch: a,
  isPlayable: s,
  onPlay: h
}) {
  const b = l ?? 19, p = !!a;
  return /* @__PURE__ */ n("div", { style: { width: o, background: i ? t : "#fff", border: i ? 0 : "1px solid #8a8a8a", borderRadius: i ? 0 : 3, padding: c ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: Vt.map((g) => {
    const S = e.filter((u) => u.suit === g).sort((u, m) => m.rank - u.rank);
    return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: We(g) ? Be : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", width: r ?? 16, fontSize: b }, children: we[g] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", gap: p ? "0 4px" : "0 5px", fontSize: b }, children: S.length === 0 ? /* @__PURE__ */ n("span", { children: "—" }) : S.map((u) => {
        const m = s ? s(u) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: m ? () => h == null ? void 0 : h(u) : void 0,
            "aria-label": `Play ${Ie(u.rank)}${we[g]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: p ? 84 : 0, minHeight: p ? 78 : 0, background: m ? "#d9f2d9" : "transparent", border: 0, borderRadius: p ? 6 : 0, padding: p ? "0 4px" : "0 1px", fontSize: b, fontWeight: m ? 700 : 400, color: "inherit", cursor: m ? "pointer" : "default" },
            children: Ie(u.rank)
          },
          u.rank
        );
      }) })
    ] }, g);
  }) });
}
const Ir = 3, Hr = 3;
function zr(e, t) {
  return e * t + Math.max(0, e - 1) * Ir + Hr * 2;
}
function Mr({
  bg: e,
  m: t = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: o,
  rows: r,
  dealerCol: l,
  emptyText: c = null
}) {
  const i = oe(null);
  Nt(() => {
    const h = i.current;
    h && (h.scrollTop = h.scrollHeight);
  }, [r.length]);
  const a = t.cellMinH ?? Math.round(t.cellFont * 1.15) + 4, s = t.rowsVisible != null && t.rowsVisible > 0 ? { flex: "0 1 auto", height: zr(t.rowsVisible, a), minHeight: 0, boxSizing: "border-box" } : { flex: 1, minHeight: 0 };
  return /* @__PURE__ */ d("div", { style: { width: t.width, height: t.height, maxHeight: t.maxH ?? (t.height === "auto" ? 340 : void 0), background: e, borderRadius: t.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: o.map((h) => /* @__PURE__ */ d("span", { style: { padding: "2px 0", fontSize: t.headFont, fontWeight: 700, lineHeight: 1.1, background: h.vul ? "#cc1111" : h.isDealer ? Ao : "#fff", color: h.vul ? "#fff" : "#000" }, children: [
      h.seat,
      h.isDealer ? " •" : ""
    ] }, h.seat)) }),
    /* @__PURE__ */ d("div", { ref: i, "data-testid": "auction-rows", style: { ...s, overflowY: "auto", padding: `${Hr}px 5px`, display: "flex", flexDirection: "column", gap: Ir }, children: [
      r.map((h, b) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((p) => {
        const g = h[p];
        return /* @__PURE__ */ n("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: t.cellMinH ?? 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.cellFont, lineHeight: 1.15, background: g ? p === l ? Ao : Tr : "transparent", color: g ? Ar(g.call) : "#000" }, children: g ? Xn(g.call) : "" }, p);
      }) }, b)),
      c != null && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: c })
    ] })
  ] });
}
const qn = { w: 56, h: 80 }, wl = (e) => Math.round(e * 0.7);
function Zn(e = qn) {
  return { w: e.w * 2, h: e.h * 2 };
}
Zn(qn);
const Nl = (e) => {
  const t = Math.round(e.w / 2), o = wl(e.h);
  return {
    N: { left: t, top: 0 },
    W: { left: 0, top: o },
    E: { left: e.w, top: o },
    S: { left: t, top: e.h }
  };
}, $l = ["N", "W", "E", "S"];
function Bn({
  plays: e,
  turn: t,
  scale: o = 1,
  variant: r = "cross",
  card: l = qn,
  index: c = { rank: 38, glyph: 30 }
}) {
  if (r === "pill")
    return /* @__PURE__ */ n("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((a) => {
      const s = e.find((b) => b.seat === a), h = a === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : a === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : a === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return s ? /* @__PURE__ */ d("div", { style: { position: "absolute", ...h, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: We(s.card.suit) ? Be : "#000" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: we[s.card.suit] }),
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: Ie(s.card.rank) })
      ] }, a) : null;
    }) });
  if (r === "cluster") {
    const a = Zn(l), s = Nl(l), h = Math.floor((l.w - 11) / 1.12);
    return /* @__PURE__ */ d("div", { style: { width: a.w * o, height: a.h * o, display: "flex", alignItems: "center", justifyContent: "center" }, children: [
      /* @__PURE__ */ n(jn, {}),
      /* @__PURE__ */ n("div", { style: { position: "relative", width: a.w, height: a.h, flex: "none", transform: `scale(${o})`, transformOrigin: "center center" }, children: $l.map((b, p) => {
        const g = e.find((y) => y.seat === b), S = s[b], u = b === t, m = g ? Ie(g.card.rank) : "";
        return /* @__PURE__ */ n("div", { style: { position: "absolute", left: S.left, top: S.top, zIndex: p + 1 }, children: g ? (
          // Keyed on the card so a NEW card mounts (and deals in); a
          // re-render of the same card must not replay the animation.
          /* @__PURE__ */ n(
            "span",
            {
              "data-testid": "trick-card",
              "data-seat": b,
              className: Sl,
              style: { position: "relative", display: "block", width: l.w, height: l.h, background: "#fff", border: "1.5px solid #4a4a4a", borderRadius: 4, boxShadow: "0 3px 7px rgba(0,0,0,.45)", boxSizing: "border-box" },
              children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.88, color: We(g.card.suit) ? Be : "#000" }, children: [
                /* @__PURE__ */ n("span", { style: { fontSize: m.length > 1 ? Math.min(c.rank, h) : c.rank, fontWeight: 800, letterSpacing: "-.02em" }, children: m }),
                /* @__PURE__ */ n("span", { style: { fontSize: c.glyph, fontWeight: 700 }, children: we[g.card.suit] })
              ] })
            },
            `${g.card.suit}${g.card.rank}`
          )
        ) : /* @__PURE__ */ n("span", { style: { display: "flex", width: l.w, height: l.h, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: u ? 24 : 0, height: 5, borderRadius: 3, background: u ? "rgba(255,255,255,.62)" : "transparent" } }) }) }, b);
      }) })
    ] });
  }
  const i = o;
  return /* @__PURE__ */ n("div", { style: { width: 262 * i, height: 262 * i, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("div", { style: { position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${i})`, transformOrigin: "center center" }, children: ["N", "E", "S", "W"].map((a) => {
    const s = e.find((p) => p.seat === a), h = a === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" } : a === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" } : a === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" } : { left: "206px", top: "50%", tr: "translateY(-50%)" }, b = a === t;
    return /* @__PURE__ */ n("div", { style: { position: "absolute", left: h.left, top: h.top, transform: h.tr, zIndex: s ? 2 : 1 }, children: s ? /* @__PURE__ */ n("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: We(s.card.suit) ? Be : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 27, fontWeight: 700 }, children: Ie(s.card.rank) }),
      /* @__PURE__ */ n("span", { style: { fontSize: 24 }, children: we[s.card.suit] })
    ] }) }) : /* @__PURE__ */ n("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: b ? 22 : 0, height: 12, background: b ? "#9a9a9a" : "transparent" } }) }) }, a);
  }) }) });
}
function eo({
  line: e,
  score: t,
  detail: o,
  action: r,
  actionNote: l,
  accent: c = "#384bb3"
}) {
  return /* @__PURE__ */ d("div", { style: { background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }, children: [
    /* @__PURE__ */ n("div", { style: { fontSize: 28, fontWeight: 700, color: "#000" }, children: e || "Board complete" }),
    t && /* @__PURE__ */ n("div", { style: { fontSize: 18, color: "#444", marginTop: 4 }, children: t }),
    /* @__PURE__ */ n("div", { style: { fontSize: 15, color: "#666", marginTop: 6 }, children: o }),
    r && /* @__PURE__ */ n(
      "a",
      {
        href: r.href,
        style: { display: "flex", alignItems: "center", justifyContent: "center", height: 48, marginTop: 14, borderRadius: 6, background: c, color: "#fff", fontSize: 19, fontWeight: 700, lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap" },
        children: r.label
      }
    ),
    r && l && /* @__PURE__ */ n("div", { style: { fontSize: 13, color: "#666", marginTop: 6 }, children: l })
  ] });
}
function Cl({ onClose: e, children: t }) {
  return /* @__PURE__ */ n("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ d("div", { onClick: (o) => o.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ n("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    t
  ] }) });
}
const Bl = "#384bb3", Rl = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function El({
  title: e = "Coach",
  status: t = "",
  accent: o = Bl,
  lines: r,
  actions: l
}) {
  const c = (r && r.length ? r : []).map(
    (s) => typeof s == "string" ? { text: s, color: "#28312c" } : { text: s.text ?? "", color: s.color ?? "#28312c" }
  ), i = c.length === 0, a = l && l.length ? l : [];
  return /* @__PURE__ */ d("div", { "data-testid": "coach-panel", style: Rl, children: [
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }, children: [
      /* @__PURE__ */ n("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: o, color: "#fff", fontSize: 12, fontWeight: 700 }, children: "C" }),
      /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: "#1d2421" }, children: e }),
      /* @__PURE__ */ n("span", { style: { flex: 1 } }),
      /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }, children: t })
    ] }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }, children: [
      c.map((s, h) => /* @__PURE__ */ n("div", { style: { fontSize: 14, lineHeight: 1.45, color: s.color }, children: s.text }, h)),
      i && /* @__PURE__ */ n("div", { style: { fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }, children: "Coach commentary appears here as the deal goes on." })
    ] }),
    a.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }, children: a.map((s, h) => /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: s.on ?? void 0,
        style: { height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: s.on ? "pointer" : "default" },
        children: s.label
      },
      h
    )) })
  ] });
}
const ut = { w: 1040, h: 678 }, Ht = 720, pe = {
  w: 56,
  h: 96,
  rank: 38,
  glyph: 36,
  inset: 5,
  overlap: 8,
  weight: 800,
  backW: 52
}, Tl = pe.w - (pe.overlap ?? 1), Dr = { w: pe.w, h: pe.h }, Wl = { rank: pe.rank, glyph: pe.glyph }, Or = Zn(Dr), Al = 260, Rn = 52, Il = 44, Ho = 54, Hl = 136, zl = 10, Ml = 22, zo = { row: zl + pe.h + 3 + Ml + 9, fan: 238 }, En = 2, Mo = 40, Dl = 36, Do = 19, Ol = 0.22, Ll = 4, Lr = 52, Pl = 37, Fl = Pl + zr(2, Lr), _l = Math.round(Or.h * 0.7) + 16, Xl = 200, jl = 900, Oo = 150, Kl = (e) => Math.ceil(24 / (e || 1)), Yl = 0, Lo = (e) => Math.round(e * 8.8), Ul = 24, Po = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, Gl = {
  ...$r("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, Jl = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function Vl({ children: e }) {
  const t = oe(null), o = oe(null), [r, l] = V(1);
  return Nt(() => {
    const c = () => {
      const a = t.current, s = o.current;
      if (!a || !s) return;
      const h = a.clientWidth, b = a.clientHeight, p = s.offsetWidth, g = s.offsetHeight;
      if (!h || !b || !p || !g) return;
      const S = Math.min(1, h / p, b / g);
      l((u) => Math.abs(S - u) > 5e-3 ? S : u);
    };
    c();
    const i = new ResizeObserver(c);
    return t.current && i.observe(t.current), o.current && i.observe(o.current), () => i.disconnect();
  }), /* @__PURE__ */ n("div", { ref: t, style: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch", position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ n(
    "div",
    {
      ref: o,
      style: { position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${r})`, display: "flex", alignItems: "center", justifyContent: "center" },
      children: e
    }
  ) });
}
function Ql({
  state: e,
  seats: t,
  visible: o,
  mySeat: r = null,
  legalCalls: l = [],
  legalPlays: c = [],
  myTurn: i = !1,
  boardLabel: a = "1",
  scoringLabel: s = "IMPs",
  auctionDisplay: h = "box",
  confirmBids: b = !1,
  completedAction: p,
  completedNote: g,
  resultLine: S = "",
  resultScore: u = "",
  resultDetail: m,
  onCall: y,
  onPlay: $,
  onMenu: H,
  onScoring: L,
  onClaim: w,
  controlsExtra: z,
  controlsExtraNarrow: x,
  railExtra: D,
  settings: O,
  viewHref: k,
  appearance: C,
  showToolbars: E = !0,
  showCoach: X = !0,
  coachShare: A = 30,
  coachTitle: j = "Coach",
  coachLines: K,
  coachActions: ee
}) {
  var wo;
  const T = C ?? Gl, F = T.handLayout === "fan", q = T.bidPad === "columns", B = T.centreFrame, I = B ? Jl : {}, M = Number.parseInt(T.radius, 10) || 5, te = oe(null), [ne, le] = V({ w: ut.w, h: ut.h });
  Nt(() => {
    const f = te.current;
    if (!f) return;
    const R = () => le({ w: f.clientWidth || ut.w, h: f.clientHeight || ut.h });
    R();
    const J = new ResizeObserver(R);
    return J.observe(f), () => J.disconnect();
  }, []);
  const [G, ie] = V(null), [N, W] = V(null);
  xe(() => {
    ie(null), W(null);
  }, [e.auction.length]);
  const [U, P] = V(!1), re = H ?? (O ? () => P((f) => !f) : void 0), Y = [...O ?? []], [fe, v] = V(!1), _ = ne.w / Math.max(1, ne.h) < 1.25, Z = _ && ne.w < 640, de = _ && !Z, ae = de ? { w: Ht, h: 1268 } : ut, ke = e.contract, Re = (ke == null ? void 0 : ke.declarer) ?? null, De = Re && e.phase !== "auction" ? yl[Re] : null, Se = e.phase === "auction", Oe = e.phase === "play", Ke = e.phase === "complete", Le = new Set(l), si = new Set(c.map((f) => `${f.suit}${f.rank}`)), Ne = Se && i && !N, di = (f) => e.vul === "both" || e.vul === "All" || xl(f).toLowerCase() === String(e.vul).toLowerCase(), ci = $n.indexOf(e.dealer), fi = X !== !1, on = Math.max(0, Math.min(55, A ?? 30)), no = 100 - on, hi = Oe || Ke, oo = Re ? !!t[Re].human : !1, Ee = hi ? De === "S" && Re && Re !== "S" && oo ? Re : De && De !== "S" ? De : null : null, rn = !!Ee && oo, ln = !!Ee && !rn, ui = q && Se, an = Math.min(1, ne.w / Ht), Bt = Math.max(240, ne.h * (no / 100) || 590), pi = (f) => {
    const R = Math.max(Rn, Math.ceil(Il / (f || 1)) + 14);
    return Math.min(R, Math.max(Rn, Math.round(0.13 * Bt / (f || 1))));
  }, ro = (f) => {
    const R = Math.max(Mo, Math.ceil(Dl / (f || 1))), J = Ol * Bt / (f || 1) - Do;
    return Math.min(R, Math.max(Mo, Math.floor(J / En)));
  }, gi = (f) => En * ro(f) + Do, io = Ke ? Xl : Se ? Fl : _l, lo = (f, R) => {
    const J = Bt / (f || 1), Q = Yl + Kl(f) + (ln ? Ho : 0) + (rn ? zo.row : 0) + (!R && Se ? gi(f) : 0) + zo[F ? "fan" : "row"], ce = pi(f), Te = R ? 0 : Q + 2 * ce + io - J, ft = Te > 0 ? Math.max(Rn, ce - Math.ceil(Te / 2)) : ce, Wt = Q + 2 * ft;
    let At = 0, It;
    R ? (At = Math.max(30, Math.min(62, Math.floor((J - Wt - Oo) / 8.3))), It = Math.max(Oo, Math.round(J - Wt - Lo(At)))) : It = Math.max(io, Math.min(jl, Math.round(J - Wt)));
    const No = Wt + (R ? Lo(At) : 0) + It - (E ? 0 : 2 * ft) - (ln ? Ho : 0);
    return { bar: ft, cell: At, centre: It, content: No, usePad: R, trayRow: ro(f), scale: Math.min(1, an, Bt / No) };
  }, ao = (f) => {
    let R = lo(an, f);
    for (let J = 0; J < 10 && R.scale < an - 5e-4; J++) {
      const Q = lo(R.scale, f);
      if (Math.abs(Q.scale - R.scale) < 5e-4) {
        R = Q;
        break;
      }
      R = Q;
    }
    return R;
  };
  let ve = ao(ui);
  ve.usePad && ve.cell * ve.scale < Ul && (ve = ao(!1));
  const bi = ve.usePad, yi = ve.usePad ? ve.cell : 38, sn = ve.centre, mi = Math.max(0.7, Math.min(1, (sn - 16) / Or.h)), dn = Math.min(ne.w / ae.w, ne.h / ae.h) || 1, Ye = Z ? ve.scale : dn, xi = Z ? Ht : Math.max(ae.w, ne.w / dn), cn = Z ? ve.content : Math.max(ae.h, ne.h / dn), ki = Z ? -Math.round(ve.content * (1 - ve.scale)) : 0, Si = (f) => t[f].human ? Nn : !Ke && f === e.turn ? "#e8e8c8" : Tr, vi = (f) => f === De || !Ke && f === e.turn ? "#fff" : "#b3b3b3", Ue = (f) => {
    Ne && (b ? W(f) : y == null || y(f));
  }, so = () => {
    if (N == null) return;
    const f = N;
    W(null), y == null || y(f);
  }, co = () => {
    W(null), ie(null);
  }, fn = (f) => (R) => i && Oe && e.turn === f && si.has(`${R.suit}${R.rank}`), Rt = (f, R = { w: 14, h: 71 }) => /* @__PURE__ */ n(Cn, { cards: e.hands[f], hidden: !0, metrics: Po, layout: "row", fanSpread: T.fanSpread, fanRadius: T.fanRadius, backColor: T.cardBack, backMetrics: R }), et = (f, R, J = {}) => /* @__PURE__ */ n(vl, { seat: f, name: t[f].name, tag: t[f].tag, strip: t[f].strip, bg: Si(f), width: R, isDealer: f === e.dealer, metrics: J }), Ge = (f, R = 16) => {
    if (!Se || h !== "seats") return null;
    const J = e.auction.filter((Q) => Q.seat === f);
    return J.length ? /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: J.map((Q, ce) => {
      const Te = ce === J.length - 1;
      return /* @__PURE__ */ n("span", { style: { background: Te ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: R, fontWeight: Te ? 700 : 400, padding: "0 5px", color: Ar(Q.call) }, children: Xn(Q.call) }, ce);
    }) }) : null;
  }, hn = (f, R = Po) => /* @__PURE__ */ n(
    Cn,
    {
      cards: e.hands[f],
      metrics: R,
      layout: "row",
      fanSpread: T.fanSpread,
      fanRadius: T.fanRadius,
      backColor: T.cardBack,
      isPlayable: fn(f),
      onPlay: (J) => $ == null ? void 0 : $(f, J)
    }
  ), Et = (f, R = { width: 197 }) => /* @__PURE__ */ n(
    $t,
    {
      cards: e.hands[f],
      panelBg: vi(f),
      width: R.width,
      suitW: R.suitW,
      font: R.font,
      pad: R.pad,
      bare: R.bare,
      touch: !!R.touch && i && Oe && e.turn === f,
      isPlayable: fn(f),
      onPlay: (J) => $ == null ? void 0 : $(f, J)
    }
  ), un = (f, R) => {
    const J = R ?? {
      w: T.cardW,
      h: Math.round(T.cardW * 1.42),
      rank: Math.round(T.cardW * 0.46),
      glyph: Math.round(T.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ n(
      Cn,
      {
        cards: e.hands[f],
        metrics: J,
        layout: "fan",
        fanSpread: T.fanSpread,
        fanRadius: T.fanRadius,
        backColor: T.cardBack,
        isPlayable: fn(f),
        onPlay: (Q) => $ == null ? void 0 : $(f, Q)
      }
    );
  }, fo = (f) => {
    const R = F && o[f];
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      Ge(f),
      o[f] ? R ? un(f) : hn(f) : Rt(f),
      et(f, R ? 197 : o[f] ? 50 + Math.max(0, e.hands[f].length - 1) * 49 : 197)
    ] });
  }, ho = (f) => /* @__PURE__ */ d("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    Ge(f),
    o[f] ? Et(f, { width: 197 }) : Rt(f),
    et(f, 197)
  ] }), uo = [];
  {
    const f = [
      ...Array.from({ length: $n.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let R = 0; R < f.length; R += 4) uo.push(f.slice(R, R + 4));
  }
  const pn = (f = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ n(
    Mr,
    {
      bg: T.auctionBg,
      m: f,
      heads: $n.map((R) => ({ seat: R, vul: di(R), isDealer: R === e.dealer })),
      rows: uo,
      dealerCol: ci,
      emptyText: e.auction.length === 0 ? e.dealer === r ? "You deal" : `${e.dealer} deals` : null
    }
  ), gn = Oe ? ((wo = e.tricks[e.tricks.length - 1]) == null ? void 0 : wo.plays) ?? [] : [], wi = (f = 1) => /* @__PURE__ */ n(Bn, { plays: gn, turn: e.turn, scale: f }), Ni = (f) => /* @__PURE__ */ n(Bn, { variant: "cluster", plays: gn, turn: e.turn, scale: f, card: Dr, index: Wl }), bn = /* @__PURE__ */ n(
    eo,
    {
      line: S,
      score: u,
      detail: m ?? `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: p,
      actionNote: g,
      accent: T.accent
    }
  ), $i = /* @__PURE__ */ n(Bn, { variant: "pill", plays: gn, turn: e.turn }), yn = (f, R, J, Q, ce, Te = 21) => ({
    flex: "none",
    width: f,
    height: R,
    border: `1px solid ${Q}`,
    borderRadius: M,
    background: J,
    color: "#fff",
    fontSize: Te,
    fontWeight: 700,
    lineHeight: 1,
    cursor: ce ? "pointer" : "default",
    opacity: ce ? 1 : 0.42
  }), po = (f, R) => /* @__PURE__ */ d(me, { children: [
    /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        onClick: so,
        style: yn(240, f, "#116710", "#0c4b0b", !0, R),
        children: [
          "Confirm ",
          Xn(N ?? "")
        ]
      }
    ),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: co,
        style: yn(120, f, "#8a3030", "#5e1c1c", !0, R),
        children: "Cancel"
      }
    )
  ] }), Ci = (f, R, J) => [1, 2, 3, 4, 5, 6, 7].map((Q) => {
    const ce = ht.some((ft) => Le.has(`${Q}${ft}`)), Te = Ne && ce;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: Te ? () => ie(G === Q ? null : Q) : void 0,
        "aria-label": `Level ${Q}`,
        style: { flex: "none", width: f, height: R, border: "1px solid #8a8a6a", borderRadius: M, background: G === Q ? Nn : "#f8f8f8", color: "#000", fontSize: J, lineHeight: 1, cursor: Te ? "pointer" : "default", opacity: Te ? 1 : 0.42 },
        children: Q
      },
      Q
    );
  }), Bi = (f, R, J, Q) => G ? ht.filter((ce) => Le.has(`${G}${ce}`)).map((ce) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => Ue(`${G}${ce}`),
      "aria-label": `${G}${ce === "N" ? "NT" : ce}`,
      style: { flex: "none", width: ce === "N" ? J : Q, height: f, border: "1px solid #8a8a6a", borderRadius: M, background: "#f8f8f8", color: We(ce) ? Be : "#000", fontSize: R, lineHeight: 1, cursor: "pointer" },
      children: we[ce]
    },
    ce
  )) : null, Ri = (f, R, J) => ["X", "XX"].map((Q) => Ne && Le.has(Q) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => Ue(Q),
      "aria-label": Q === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: f, height: R, border: `1px solid ${Q === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: M, background: Q === "X" ? Be : "#1034a6", color: "#fff", fontSize: J, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: Q
    },
    Q
  ) : /* @__PURE__ */ n("span", { style: { width: f, height: R } }, Q)), Ei = (f, R, J) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: Ne ? () => Ue("P") : void 0,
      "aria-label": "Pass",
      style: yn(f, R, Ne ? "#116710" : "#a7b8a2", "#0c4b0b", Ne, J),
      children: "Pass"
    }
  ), mn = Le.has("X") || Le.has("XX"), go = G ? ht.filter((f) => Le.has(`${G}${f}`)) : [], Ti = /* @__PURE__ */ n("div", { style: { width: 581, flex: "none", background: T.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: N ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    po(44, 21)
  ] }) : /* @__PURE__ */ d(me, { children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      Ei(120, 37, 21),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Ci(57, 37, 23) })
    ] }),
    (mn || go.length > 0) && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: Ri(57, 37, 21) }),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Bi(37, 23, 120, 57) })
    ] })
  ] }) }), tt = Z ? ve.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, Ye))), Wi = "1.75fr repeat(7,1fr)", Ai = mn ? "repeat(4,1fr) 1.75fr 1fr 1fr" : "repeat(4,1fr) 1.75fr", Tt = (f) => ({
    minWidth: 0,
    height: tt,
    border: "1px solid #8a8a6a",
    borderRadius: M,
    fontWeight: 800,
    lineHeight: 1,
    padding: 0,
    ...f
  }), Ii = ht.map((f) => !!G && go.includes(f) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => Ue(`${G}${f}`),
      "aria-label": `${G}${f === "N" ? "NT" : f}`,
      style: Tt({ background: "#f8f8f8", color: We(f) ? Be : "#000", fontSize: f === "N" ? 28 : 38, cursor: "pointer" }),
      children: we[f]
    },
    f
  ) : /* @__PURE__ */ n("span", { style: { minWidth: 0, height: tt, pointerEvents: "none" } }, f)), Hi = mn ? ["X", "XX"].map((f) => Ne && Le.has(f) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => Ue(f),
      "aria-label": f === "X" ? "Double" : "Redouble",
      style: Tt({ border: `1px solid ${f === "X" ? "#8f0000" : "#0a2170"}`, background: f === "X" ? Be : "#1034a6", color: "#fff", fontSize: 28, cursor: "pointer" }),
      children: f
    },
    f
  ) : /* @__PURE__ */ n("span", { style: { minWidth: 0, height: tt } }, f)) : null, bo = /* @__PURE__ */ n("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: T.trayBg, padding: "6px 8px 8px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: N ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: En * tt + 5 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 20, fontWeight: 700, color: "#3a3a20" }, children: "Confirm your call" }),
    po(tt, 26)
  ] }) : /* @__PURE__ */ d(me, { children: [
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: Wi, gap: 5 }, children: [
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: Ne ? () => Ue("P") : void 0,
          "aria-label": "Pass",
          style: Tt({ border: "1px solid #0c4b0b", background: Ne ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 28, cursor: Ne ? "pointer" : "default", opacity: Ne ? 1 : 0.42 }),
          children: "Pass"
        }
      ),
      [1, 2, 3, 4, 5, 6, 7].map((f) => {
        const R = ht.some((Q) => Le.has(`${f}${Q}`)), J = Ne && R;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: J ? () => ie(G === f ? null : f) : void 0,
            "aria-label": `Level ${f}`,
            style: Tt({ background: G === f ? Nn : "#f8f8f8", color: "#000", fontSize: 30, cursor: J ? "pointer" : "default", opacity: J ? 1 : 0.42 }),
            children: f
          },
          f
        );
      })
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: Ai, gap: 5 }, children: [
      Ii,
      Hi
    ] })
  ] }) }), xn = {
    legalCalls: l,
    live: Ne,
    pending: N,
    onStage: Ue,
    onConfirm: so,
    onCancel: co,
    radius: M
  }, zi = /* @__PURE__ */ n(xt, { cell: 46, ...xn }), Mi = /* @__PURE__ */ n("div", { style: { width: "100%", flex: "none", background: T.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ n(xt, { cell: 84, minCellH: tt, ...xn }) }), yo = { N: "North", E: "East", S: "South", W: "West" }, mo = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), kn = [
    { kind: "chip", label: "Board", value: String(a) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: mo, color: mo === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: ke ? `${ke.level}${we[ke.strain]}${ke.doubled === 1 ? "X" : ke.doubled === 2 ? "XX" : ""}` : "—", color: ke && We(ke.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: ke ? yo[ke.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: s, title: "Scoring mode", on: L ?? null }
  ], Sn = (f) => [
    ...f ? [{ kind: "node", node: f }] : [],
    { kind: "divider" },
    ...k ? [{ kind: "button", label: k.label, title: "Four-hand record", href: k.href }] : [],
    ...D ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => v(!0) }] : [],
    { kind: "spacer" },
    ...w && Oe ? [{ kind: "button", label: "Claim", tone: "accent", on: w }] : [],
    ...re ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: re }] : []
  ], xo = fe && D ? /* @__PURE__ */ n(Cl, { onClose: () => v(!1), children: D }) : null, Di = (f) => Vt.map((R) => {
    const J = e.hands[f].filter((Q) => Q.suit === R).sort((Q, ce) => ce.rank - Q.rank).map((Q) => Ie(Q.rank));
    return J.length ? { suit: R, ranks: J } : null;
  }).filter((R) => R != null), ko = De === "E" ? "right" : "left", So = ln && Ee ? /* @__PURE__ */ d("div", { "data-testid": "dummy-strip", style: { flex: "none", width: Hl, alignSelf: "stretch", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, padding: "8px 6px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: yo[Ee] }),
    o[Ee] ? Di(Ee).map((f) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "flex-start", gap: 3, fontSize: 24, fontWeight: 700, lineHeight: 1.12 }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", color: We(f.suit) ? Be : "#111" }, children: we[f.suit] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", minWidth: 0, color: "#f2f6f4" }, children: f.ranks.map((R, J) => /* @__PURE__ */ n("span", { style: { whiteSpace: "nowrap" }, children: R }, `${R}-${J}`)) })
    ] }, f.suit)) : null
  ] }) : null, Oi = rn && Ee ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: o[Ee] ? F ? un(Ee, pe) : hn(Ee, pe) : Rt(Ee, { w: pe.backW, h: pe.h }) })
  ) : null, vn = Math.max(1, e.hands.S.length), Li = o.S ? pe.w + (vn - 1) * Tl : Math.round(pe.backW * vn + 1.5 * (vn - 1)) + 4, Pi = /* @__PURE__ */ d("div", { "data-testid": "phone-stage", style: { flex: "none", width: Ht, minHeight: cn, height: cn, transform: `scale(${Ye})`, transformOrigin: "top center", marginBottom: ki, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    E && /* @__PURE__ */ n(nt, { side: "top", items: kn, condensed: !0, thickness: ve.bar, bg: T.barBg, accent: T.accent }),
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: T.feltFlat }, children: [
      Oi,
      /* @__PURE__ */ d("div", { "data-testid": "centre-band", style: { flex: "none", height: sn, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: [
        ko === "left" ? So : null,
        /* @__PURE__ */ d("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: Se ? "flex-start" : "center", justifyContent: "center", ...B ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
          Se && h === "box" ? pn({ width: 430, height: "auto", maxH: sn, headFont: 26, cellFont: 24, radius: 0, cellMinH: Lr, rowsVisible: Ll }) : null,
          Se && h === "seats" ? /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((f) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
            /* @__PURE__ */ n("span", { style: { width: 30, height: 30, background: Wr, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: f }),
            Ge(f, 22) ?? /* @__PURE__ */ n("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
          ] }, f)) }) : null,
          Oe ? Ni(mi) : null,
          Ke ? bn : null
        ] }),
        ko === "right" ? So : null
      ] }),
      Se ? bi ? /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ n(xt, { cell: yi, ...xn }) }) : bo : null,
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        Ge("S"),
        o.S ? F ? un("S", pe) : hn("S", pe) : Rt("S", { w: pe.backW, h: pe.h }),
        et("S", Math.max(Al, Li), { weight: 700 })
      ] }) })
    ] }),
    E && /* @__PURE__ */ n(nt, { side: "bottom", items: Sn(x ?? z), condensed: !0, thickness: ve.bar, bg: T.barBg, accent: T.accent })
  ] }), Fi = (f) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ge(f, 22),
    et(f, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    o[f] && Et(f, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), vo = (f) => /* @__PURE__ */ d("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ge(f, 22),
    et(f, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    o[f] && Et(f, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), _i = (f) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ge(f, 22),
    et(f, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    o[f] && Et(f, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), Xi = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: T.stageBg }, children: [
    E && /* @__PURE__ */ n(nt, { side: "top", items: kn, scale: Ye, minTouch: 44, bg: T.barBg, accent: T.accent }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: T.felt }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Fi("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        vo("W"),
        /* @__PURE__ */ d("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...I }, children: [
          Se && h === "box" ? pn({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          Oe ? $i : null,
          Ke ? bn : null
        ] }),
        vo("E")
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: _i("S") })
    ] }),
    Se ? q ? Mi : bo : null,
    E && /* @__PURE__ */ n(nt, { side: "bottom", items: Sn(x ?? z), scale: Ye, minTouch: 44, bg: T.barBg, accent: T.accent })
  ] }), ji = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    E && /* @__PURE__ */ n(nt, { side: "top", items: kn, scale: Ye, bg: T.barBg, accent: T.accent }),
    /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: T.felt }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: fo("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        ho("W"),
        /* @__PURE__ */ n("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...I }, children: /* @__PURE__ */ d(Vl, { children: [
          Se && q ? zi : Se && h === "box" ? pn() : null,
          Oe ? wi() : null,
          Ke ? bn : null
        ] }) }),
        ho("E")
      ] }),
      /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ n("div", { style: { height: Se && !q ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: Se && !q ? Ti : null }),
        fo("S")
      ] })
    ] }) }),
    E && /* @__PURE__ */ n(nt, { side: "bottom", items: Sn(z), scale: Ye, bg: T.barBg, accent: T.accent })
  ] });
  return Z ? /* @__PURE__ */ d("div", { ref: te, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: T.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", maxHeight: `${no}%`, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: Pi }) }),
    on > 0 && /* @__PURE__ */ n("div", { style: { flex: "1 1 auto", minHeight: `${on}%`, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: fi && /* @__PURE__ */ n(El, { title: j, accent: T.accent, lines: K, actions: ee }) }),
    xo,
    U && !H && /* @__PURE__ */ n(Wo, { accent: T.accent, items: Y, onClose: () => P(!1) })
  ] }) : /* @__PURE__ */ n("div", { ref: te, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: T.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: xi, height: cn, transform: `scale(${Ye})` }, children: [
    de ? Xi : ji,
    xo,
    U && !H && /* @__PURE__ */ n(Wo, { accent: T.accent, items: Y, onClose: () => P(!1) })
  ] }) });
}
const Fo = "#ffce04", zt = "#cb0200", _o = "#016700", ql = "#cbcbcb", Xo = "#99cccc", Zl = "#336799", Pr = 648, Kn = 400, Yn = 8, Un = 8, Pe = { w: Un * 2 + Pr * 3 + Yn * 2, h: Un * 2 + Kn * 3 + Yn * 2 }, jo = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Ko = ["W", "N", "E", "S"], ea = ["S", "H", "D", "C"], Yo = (e) => e === "H" || e === "D", ta = (e) => /^[1-7][CDHSN]$/.test(e), na = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e);
function oa({
  boardLabel: e,
  dealer: t,
  vul: o,
  hands: r,
  names: l,
  visible: c,
  auction: i = [],
  highlightSeat: a = null,
  info: s = [],
  result: h = [],
  nav: b
}) {
  const p = oe(null), [g, S] = V({ w: Pe.w, h: Pe.h });
  Nt(() => {
    const k = p.current;
    if (!k) return;
    const C = () => S({ w: k.clientWidth || Pe.w, h: k.clientHeight || Pe.h });
    C();
    const E = new ResizeObserver(C);
    return E.observe(k), () => E.disconnect();
  }, []);
  const u = Math.min(g.w / Pe.w, g.h / Pe.h) || 1, m = (k) => {
    const C = o.toLowerCase();
    return C === "both" || C === "all" || C === (k === "N" || k === "S" ? "ns" : "ew");
  }, y = 57, $ = 145, H = (k) => {
    const C = m(k), E = k === t;
    return /* @__PURE__ */ n("div", { style: { background: E ? Fo : C ? zt : "#fff", color: C && !E ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }, children: k });
  }, L = /* @__PURE__ */ d("div", { style: { width: y * 2 + $ + 4, display: "grid", gridTemplateColumns: `${y}px ${$}px ${y}px`, gridTemplateRows: `${y}px ${$}px ${y}px`, gap: 2, padding: 2, background: "#000", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    H("N"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    H("W"),
    /* @__PURE__ */ n("div", { title: String(e), style: { background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(e).length > 8 ? 24 : String(e).length > 3 ? 40 : 104, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }, children: e }),
    H("E"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    H("S"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } })
  ] }), w = (k) => {
    const C = (c == null ? void 0 : c[k]) ?? !0;
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignSelf: "stretch" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", height: 70, background: k === a ? Fo : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }, children: [
        /* @__PURE__ */ n("span", { style: { flex: "none", width: 70, height: 70, background: Zl, color: "#fff", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: k }),
        /* @__PURE__ */ n("span", { style: { padding: "0 14px", fontSize: 52, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: l[k] }),
        !C && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", paddingRight: 14, fontSize: 24, color: "#666" }, children: "hidden" })
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: 1, background: ql, padding: "4px 14px 10px" }, children: ea.map((E) => {
        const X = [...r[k]].filter((A) => A.suit === E).sort((A, j) => j.rank - A.rank);
        return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.35, fontSize: 58, color: Yo(E) ? zt : "#000" }, children: [
          /* @__PURE__ */ n("span", { style: { flex: "none", width: 58 }, children: jo[E] }),
          /* @__PURE__ */ n("span", { style: { color: "#000", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }, children: C && X.length ? X.map((A) => na(A.rank)).join("") : "—" })
        ] }, E);
      }) })
    ] });
  }, z = [];
  {
    const k = [
      ...Array.from({ length: Ko.indexOf(t) }, () => null),
      ...i
    ];
    for (let C = 0; C < k.length; C += 4) z.push(k.slice(C, C + 4));
  }
  const x = (k) => ta(k) ? /* @__PURE__ */ d(me, { children: [
    k[0],
    /* @__PURE__ */ n("span", { style: { color: Yo(k[1] ?? "") ? zt : "#000" }, children: jo[k[1] ?? ""] })
  ] }) : k === "P" ? "P" : k, D = /* @__PURE__ */ d("div", { style: { width: "100%", height: 374, background: Xo, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: Ko.map((k) => /* @__PURE__ */ n("span", { style: { padding: "2px 0", fontSize: 42, fontWeight: 700, lineHeight: 1.15, background: m(k) ? zt : "#fff", color: m(k) ? "#fff" : "#000" }, children: k }, k)) }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px" }, children: [
      z.map((k, C) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }, children: [0, 1, 2, 3].map((E) => /* @__PURE__ */ n("span", { style: { fontSize: 42, lineHeight: 1.25, color: "#000" }, children: k[E] ? x(k[E].call) : "" }, E)) }, C)),
      i.length === 0 && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 32, color: "#1e4747", paddingTop: 10 }, children: "No calls yet" })
    ] })
  ] }), O = (k) => /* @__PURE__ */ n("div", { style: { width: "100%", alignSelf: "end", background: Xo, padding: "10px 16px", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: k.map((C, E) => /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 40, lineHeight: 1.3, color: "#000" }, children: [
    /* @__PURE__ */ n("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: C.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700 }, children: C.value })
  ] }, E)) });
  return /* @__PURE__ */ n("div", { ref: p, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: _o, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ n("div", { style: { flex: "none", transformOrigin: "center center", width: Pe.w, height: Pe.h, transform: `scale(${u})` }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${Pr}px)`, gridTemplateRows: `repeat(3, ${Kn}px)`, gap: Yn, padding: Un, background: _o }, children: [
    /* @__PURE__ */ d("div", { style: { justifySelf: "start", alignSelf: "start", display: "flex", gap: 24, alignItems: "flex-start", maxHeight: Kn, overflow: "hidden" }, children: [
      L,
      b
    ] }),
    w("N"),
    /* @__PURE__ */ n("div", { style: { alignSelf: "start", width: "100%" }, children: D }),
    w("W"),
    /* @__PURE__ */ n("div", {}),
    w("E"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: O(s) }),
    w("S"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: O(h) })
  ] }) }) });
}
const Ct = "#0d707c", ra = "#1c8a5a", ia = "#c0392b", la = "#8b9a93", kt = "#55636f", Uo = "#17211d", Gn = "#9aa8a1", Go = "#eef2ef", aa = "#0e1a1c", vt = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", Fr = "✕", sa = "◆", da = "⇄", ca = "–", fa = "—", _r = "·";
function He(e) {
  return e === "pos" ? ra : e === "neg" ? ia : la;
}
function Qt(e) {
  return e == null || !Number.isFinite(e) ? "neutral" : e > 0 ? "pos" : e < 0 ? "neg" : "neutral";
}
const Xr = 40;
function ha({
  title: e,
  boardNo: t,
  boardsTotal: o,
  showResults: r,
  onResults: l,
  accent: c = Ct,
  height: i = Xr
}) {
  const a = Math.max(0, Math.round(o)), s = Math.max(1, Math.round(t)), h = Math.max(0, Math.min(a, s - 1)), b = a > 0 ? Math.round(h / a * 100) : 0;
  return /* @__PURE__ */ d("div", { style: {
    position: "relative",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: i,
    padding: "0 12px",
    background: aa,
    fontFamily: vt
  }, role: "group", "aria-label": "Challenge", children: [
    /* @__PURE__ */ n(
      "span",
      {
        title: e,
        style: {
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: ".005em",
          color: "#eaf1ef"
        },
        children: e
      }
    ),
    /* @__PURE__ */ n(
      "span",
      {
        style: {
          flex: "none",
          padding: "2px 8px",
          borderRadius: 6,
          background: "rgba(255,255,255,.06)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".03em",
          color: "#93aaa7",
          whiteSpace: "nowrap"
        },
        children: `Board ${s} of ${a}`
      }
    ),
    /* @__PURE__ */ n("span", { style: { flex: 1, minWidth: 8 } }),
    r && /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: l,
        title: "Standings for this challenge",
        style: {
          flex: "none",
          height: 26,
          padding: "0 12px",
          border: "1px solid rgba(255,255,255,.22)",
          borderRadius: 7,
          background: "rgba(255,255,255,.06)",
          color: "#dbe8e6",
          fontFamily: "inherit",
          fontSize: 11.5,
          fontWeight: 700,
          lineHeight: 1,
          whiteSpace: "nowrap",
          cursor: "pointer"
        },
        children: "Results"
      }
    ),
    /* @__PURE__ */ n(
      "span",
      {
        role: "progressbar",
        "aria-label": "Challenge progress",
        "aria-valuemin": 0,
        "aria-valuemax": a,
        "aria-valuenow": h,
        "aria-valuetext": `${h} of ${a} boards done`,
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: "rgba(255,255,255,.10)",
          display: "block"
        },
        children: /* @__PURE__ */ n("span", { style: { display: "block", height: "100%", width: `${b}%`, background: c } })
      }
    )
  ] });
}
function ua(e) {
  if (e.length > 0 && e.every((i) => typeof i.rank == "number")) return e.map((i) => ({ ...i, rank: i.rank }));
  const o = e.map((i, a) => ({ r: i, i: a }));
  o.sort((i, a) => {
    const s = typeof i.r.value == "number" ? i.r.value : Number.NEGATIVE_INFINITY, h = typeof a.r.value == "number" ? a.r.value : Number.NEGATIVE_INFINITY;
    return h === s ? i.i - a.i : h - s;
  });
  let r = 0, l = 0, c = null;
  return o.map(({ r: i }) => {
    l += 1;
    const a = typeof i.value == "number" ? i.value : Number.NEGATIVE_INFINITY;
    return (c === null || a !== c) && (r = l, c = a), { ...i, rank: r };
  });
}
function pa(e) {
  if (!e) return Number.NaN;
  if (typeof e.value == "number" && Number.isFinite(e.value)) return e.value;
  const t = (e.text ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!t) return Number.NaN;
  const o = Number(t.replace(/^\+/, ""));
  return Number.isFinite(o) ? o : Number.NaN;
}
function ga(e) {
  const t = e.map(pa);
  let o = Number.NEGATIVE_INFINITY;
  for (const r of t) Number.isFinite(r) && r > o && (o = r);
  return Number.isFinite(o) ? t.map((r) => Number.isFinite(r) && r === o) : t.map(() => !1);
}
const jr = { active: !1, picks: [] };
function ba(e, t) {
  switch (t.type) {
    case "start":
      return { active: !0, picks: [] };
    case "cancel":
      return jr;
    case "pick": {
      if (!e.active) return e;
      const { boardNo: o, key: r } = t;
      if (e.picks.some((i) => i.boardNo === o && i.key === r))
        return {
          active: !0,
          picks: e.picks.filter((i) => !(i.boardNo === o && i.key === r))
        };
      const c = e.picks[0];
      return c && c.boardNo !== o || e.picks.length >= 2 ? e : { active: !0, picks: [...e.picks, { boardNo: o, key: r }] };
    }
    default:
      return e;
  }
}
function ya(e) {
  const [t, o] = e.picks;
  return !t || !o ? null : { boardNo: t.boardNo, a: t.key, b: o.key };
}
function ma(e, t) {
  const o = e.picks[0];
  return e.active && !!o && o.boardNo !== t;
}
function xa(e, t, o) {
  return e.picks.some((r) => r.boardNo === t && r.key === o);
}
const Tn = {
  display: "grid",
  gridTemplateColumns: "26px 1fr auto",
  alignItems: "center",
  gap: 10
};
function ka({
  rows: e,
  benRow: t,
  scoringLabel: o,
  accent: r = Ct,
  note: l,
  legend: c,
  emptyLabel: i = "No finished players yet."
}) {
  const a = ua(e);
  return /* @__PURE__ */ d("div", { style: { fontFamily: vt, color: "#17211d" }, children: [
    l && /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: Gn, marginBottom: 2 }, children: l }),
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          ...Tn,
          padding: "10px 8px 6px",
          fontSize: 10,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "#a2ada7"
        },
        children: [
          /* @__PURE__ */ n("span", { style: { textAlign: "center" }, children: "#" }),
          /* @__PURE__ */ n("span", { children: "Player" }),
          /* @__PURE__ */ n("span", { style: { textAlign: "right" }, children: o })
        ]
      }
    ),
    a.length === 0 && /* @__PURE__ */ n("div", { style: { padding: "10px 8px", fontSize: 12.5, color: Gn }, children: i }),
    /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: a.map((s, h) => {
      const b = !!s.isYou, p = s.marks ?? [], g = s.tone ? He(s.tone) : He(Qt(s.value));
      return /* @__PURE__ */ d(
        "div",
        {
          style: {
            ...Tn,
            padding: "9px 8px",
            borderRadius: 9,
            background: b ? "#eff7f6" : "transparent"
          },
          children: [
            /* @__PURE__ */ n(
              "span",
              {
                style: {
                  fontSize: 13,
                  fontWeight: 800,
                  textAlign: "center",
                  color: s.rank <= 3 ? "#22302a" : "#8b9a93"
                },
                children: s.rank
              }
            ),
            /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, children: [
              /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13.5,
                    fontWeight: b ? 800 : 600,
                    color: b ? r : "#25332c"
                  },
                  children: s.name
                }
              ),
              p.includes("editor") && /* @__PURE__ */ n(
                "span",
                {
                  role: "img",
                  title: "Set the boards - opened the pack editor",
                  "aria-label": "Set the boards",
                  style: { flex: "none", fontSize: 10, lineHeight: 1, color: r },
                  children: sa
                }
              ),
              p.includes("moderator") && /* @__PURE__ */ n(
                "span",
                {
                  title: "Moderator - could see the standings before finishing",
                  style: {
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    height: 14,
                    padding: "0 5px",
                    borderRadius: 7,
                    background: "#eef1f4",
                    color: kt,
                    fontSize: 8.5,
                    fontWeight: 800,
                    letterSpacing: ".07em",
                    lineHeight: 1
                  },
                  children: "MOD"
                }
              )
            ] }),
            /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 800, textAlign: "right", color: g }, children: s.total })
          ]
        },
        `${s.name}-${h}`
      );
    }) }),
    t && /* @__PURE__ */ d(
      "div",
      {
        style: {
          ...Tn,
          marginTop: 7,
          padding: "11px 8px 3px",
          borderTop: `1px solid ${Go}`
        },
        children: [
          /* @__PURE__ */ n("span", { "aria-hidden": !0, style: { textAlign: "center", fontSize: 12, color: "#9aa8b0" }, children: ca }),
          /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: 13, fontWeight: 700, color: kt }, children: t.label ?? "BEN" }),
            /* @__PURE__ */ n("span", { style: { fontSize: 10.5, color: "#8a949c" }, children: t.note ?? `benchmark ${_r} unranked` })
          ] }),
          /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 800, textAlign: "right", color: kt }, children: t.total })
        ]
      }
    ),
    c && /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${Go}`,
          fontSize: 10,
          color: "#a2ada7",
          flexWrap: "wrap"
        },
        children: c
      }
    )
  ] });
}
function Sa({
  open: e,
  onClose: t,
  standings: o,
  children: r,
  boards: l,
  viewportPhone: c = !0,
  heading: i = "Results",
  subtitle: a,
  boardsHeading: s = "Board by board",
  accent: h = Ct
}) {
  if (xe(() => {
    if (!e) return;
    const g = (S) => {
      S.key === "Escape" && t();
    };
    return window.addEventListener("keydown", g), () => window.removeEventListener("keydown", g);
  }, [e, t]), !e) return null;
  const b = c;
  return /* @__PURE__ */ d(me, { children: [
    /* @__PURE__ */ n(
      "div",
      {
        onClick: t,
        "aria-hidden": !0,
        style: { position: "absolute", inset: 0, zIndex: 40, background: "rgba(6,14,11,.52)" }
      }
    ),
    /* @__PURE__ */ d("div", { role: "dialog", "aria-modal": "true", "aria-label": i, style: b ? {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 41,
      maxHeight: "78%",
      display: "flex",
      flexDirection: "column",
      background: "#fff",
      borderRadius: "20px 20px 0 0",
      overflow: "hidden",
      boxShadow: "0 -14px 44px rgba(0,0,0,.42)",
      fontFamily: vt,
      color: Uo
    } : {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%,-50%)",
      zIndex: 41,
      width: 540,
      maxWidth: "calc(100% - 32px)",
      maxHeight: "82%",
      display: "flex",
      flexDirection: "column",
      background: "#fff",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 22px 60px rgba(0,0,0,.46)",
      fontFamily: vt,
      color: Uo
    }, children: [
      b && /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: t,
          "aria-label": "Close results",
          style: {
            flex: "none",
            display: "flex",
            justifyContent: "center",
            padding: "9px 0 3px",
            border: 0,
            background: "transparent",
            cursor: "pointer"
          },
          children: /* @__PURE__ */ n("span", { style: { display: "block", width: 38, height: 4, borderRadius: 2, background: "#d3dbd6" } })
        }
      ),
      /* @__PURE__ */ d(
        "div",
        {
          style: {
            flex: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: b ? "6px 18px 12px" : "18px 20px 12px"
          },
          children: [
            /* @__PURE__ */ d("div", { style: { minWidth: 0 }, children: [
              /* @__PURE__ */ n("div", { style: { fontSize: 16, fontWeight: 800, color: "#16201c", lineHeight: 1.2 }, children: i }),
              a && /* @__PURE__ */ n(
                "div",
                {
                  style: {
                    marginTop: 3,
                    fontSize: 11.5,
                    color: Gn,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  },
                  children: a
                }
              )
            ] }),
            /* @__PURE__ */ n("span", { style: { flex: 1 } }),
            /* @__PURE__ */ n(
              "button",
              {
                type: "button",
                onClick: t,
                "aria-label": "Back to the board",
                title: "Back to the board",
                style: {
                  flex: "none",
                  height: 28,
                  width: 28,
                  border: "1px solid #e4e9e5",
                  borderRadius: 9,
                  background: "#fff",
                  color: "#93a199",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: "pointer"
                },
                children: Fr
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ d(
        "div",
        {
          style: {
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: b ? "0 18px 22px" : "0 20px 20px"
          },
          children: [
            o && /* @__PURE__ */ n(ka, { ...o, accent: o.accent ?? h }),
            r,
            l.length > 0 && /* @__PURE__ */ d(me, { children: [
              /* @__PURE__ */ n(
                "div",
                {
                  style: {
                    marginTop: 14,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "#8b9a93"
                  },
                  children: s
                }
              ),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, marginTop: 8, overflowX: "auto", paddingBottom: 4 }, children: l.map((g) => {
                const S = !!g.current, u = g.tone ? He(g.tone) : He(Qt(g.value));
                return /* @__PURE__ */ d(
                  "div",
                  {
                    title: `Board ${g.boardNo}${S ? " - open at the table behind this sheet" : ""}`,
                    style: {
                      flex: "none",
                      width: b ? 38 : 48,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      padding: "6px 2px",
                      borderRadius: 8,
                      background: S ? "#eff7f6" : "#f7faf8",
                      border: `1px solid ${S ? h : "#e8eeea"}`
                    },
                    children: [
                      /* @__PURE__ */ n("span", { style: { fontSize: 9.5, fontWeight: 700, color: S ? h : "#a2ada7" }, children: g.boardNo }),
                      /* @__PURE__ */ n("span", { style: { fontSize: 12.5, fontWeight: 800, color: u }, children: g.text })
                    ]
                  },
                  g.boardNo
                );
              }) })
            ] })
          ]
        }
      )
    ] })
  ] });
}
const va = "Tinted cell = best score on that board (ties share it). BEN is a benchmark column and is never ranked.", Mt = 46;
function wa({
  columns: e,
  rows: t,
  totals: o,
  onCompare: r,
  accent: l = Ct,
  legend: c = va,
  viewportPhone: i = !0
}) {
  const [a, s] = Ui(ba, jr), h = typeof r == "function", b = h && a.active, p = ya(a), g = i ? 46 : 54, S = Mt + e.length * (g + 4) + 8, u = (w) => {
    const z = e.find((x) => x.key === w);
    return z ? z.name ?? z.label : w;
  }, m = a.picks[0], y = b ? m ? p ? `Board ${p.boardNo} ${_r} ${u(p.a)} vs ${u(p.b)}` : `Board ${m.boardNo}: ${u(m.key)} picked ${fa} now pick a second player in that row.` : "Pick two players on the same board." : "Pick two cells on the same board to compare those two lines.", $ = {
    marginTop: 6,
    minHeight: 34,
    lineHeight: 1.45,
    fontSize: p ? 12 : 11.5,
    fontWeight: p ? 800 : b && m ? 700 : 600,
    color: p ? "#22302a" : b ? m ? l : "#5f6f68" : "#9aa8a1"
  }, H = () => {
    !p || !r || (r(p), s({ type: "cancel" }));
  }, L = (w) => ({
    width: g,
    flex: "none",
    textAlign: "center",
    padding: "5px 2px",
    borderRadius: "7px 7px 0 0",
    fontSize: 10.5,
    fontWeight: 800,
    background: w.isBenchmark ? "#eef1f4" : w.isYou ? "#eff7f6" : "#f7faf8",
    color: w.isBenchmark ? kt : w.isYou ? l : "#5a6a63"
  });
  return /* @__PURE__ */ d("div", { style: { fontFamily: vt, color: "#17211d" }, children: [
    h && /* @__PURE__ */ d("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minHeight: 32 }, children: [
        !b && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => s({ type: "start" }),
            style: {
              flex: "none",
              height: 32,
              padding: "0 13px",
              border: "1px solid #cfe1de",
              borderRadius: 9,
              background: "#eff7f6",
              color: l,
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer"
            },
            children: `${da} Compare`
          }
        ),
        b && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => s({ type: "cancel" }),
            title: "Leave selection mode",
            style: {
              flex: "none",
              height: 32,
              padding: "0 12px",
              border: "1px solid #e0e6e2",
              borderRadius: 9,
              background: "#fff",
              color: "#7d8a83",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer"
            },
            children: `${Fr} Cancel`
          }
        ),
        b && p && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: H,
            style: {
              flex: "none",
              height: 32,
              padding: "0 14px",
              border: 0,
              borderRadius: 9,
              background: l,
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 800,
              cursor: "pointer"
            },
            children: "Open comparison"
          }
        )
      ] }),
      /* @__PURE__ */ n("div", { style: $, "aria-live": "polite", children: y })
    ] }),
    /* @__PURE__ */ n("div", { style: { overflowX: "auto", WebkitOverflowScrolling: "touch" }, children: /* @__PURE__ */ d("div", { style: { minWidth: S }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", gap: 4, marginBottom: 5 }, children: [
        /* @__PURE__ */ n("span", { style: { width: Mt, flex: "none" } }),
        e.map((w) => /* @__PURE__ */ n("span", { style: L(w), title: w.name ?? w.label, children: w.label }, w.key))
      ] }),
      t.map((w) => {
        const z = ga(w.cells), x = ma(a, w.boardNo);
        return /* @__PURE__ */ d(
          "div",
          {
            style: { display: "flex", gap: 4, marginBottom: 3, alignItems: "stretch" },
            children: [
              /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    width: Mt,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 7px",
                    borderRadius: 7,
                    background: "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#3f4f48",
                    opacity: x ? 0.32 : 1
                  },
                  children: w.label ?? `Bd ${w.boardNo}`
                }
              ),
              e.map((D, O) => {
                const k = w.cells[O], C = (k == null ? void 0 : k.text) ?? "", E = !!z[O], X = xa(a, w.boardNo, D.key), A = b && !x, j = D.name ?? D.label, K = X ? "#d9efeb" : E ? "#e4f2ef" : D.isBenchmark ? "#f6f8f9" : D.isYou ? "#f3faf9" : "#fff", ee = X ? `2px solid ${l}` : A ? "1px dashed #b3d2ce" : E ? "1px solid #a9d3cd" : D.isYou ? "1px solid #dcefec" : D.isBenchmark ? "1px solid #dde3e7" : "1px solid #eef2ef", T = b ? x ? `Not this row - both picks must be on Board ${m ? m.boardNo : w.boardNo}` : X ? "Click again to deselect" : `Pick ${j} on Board ${w.boardNo}` : E ? `Best on Board ${w.boardNo}` : "";
                return /* @__PURE__ */ n(
                  "button",
                  {
                    type: "button",
                    disabled: !A,
                    "aria-pressed": A ? X : void 0,
                    "aria-label": `${j}, board ${w.boardNo}${C ? `: ${C}` : ""}${E ? ", best on this board" : ""}`,
                    title: T,
                    onClick: () => s({ type: "pick", boardNo: w.boardNo, key: D.key }),
                    style: {
                      width: g,
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      padding: X ? "5px 1px" : "6px 2px",
                      background: K,
                      border: ee,
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: E ? 800 : D.isYou || D.isBenchmark ? 700 : 600,
                      color: k != null && k.tone ? He(k.tone) : He(Qt(k == null ? void 0 : k.value)),
                      opacity: x ? 0.32 : 1,
                      cursor: b ? x ? "not-allowed" : "pointer" : "default"
                    },
                    children: C
                  },
                  D.key
                );
              })
            ]
          },
          w.boardNo
        );
      }),
      o && o.length > 0 && /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            gap: 4,
            marginTop: 6,
            paddingTop: 6,
            borderTop: "2px solid #eef2ef",
            alignItems: "stretch"
          },
          children: [
            /* @__PURE__ */ n(
              "span",
              {
                style: {
                  width: Mt,
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 7px",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: "#8b9a93"
                },
                children: "Total"
              }
            ),
            e.map((w, z) => {
              const x = o[z];
              return /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    width: g,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 2px",
                    borderRadius: 6,
                    background: w.isBenchmark ? "#eef1f4" : w.isYou ? "#eff7f6" : "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: w.isBenchmark ? kt : x != null && x.tone ? He(x.tone) : He(Qt(x == null ? void 0 : x.value))
                  },
                  children: (x == null ? void 0 : x.text) ?? ""
                },
                w.key
              );
            })
          ]
        }
      )
    ] }) }),
    c && /* @__PURE__ */ n("div", { style: { fontSize: 10.5, lineHeight: 1.5, color: "#9aa8a1", marginTop: 8 }, children: c })
  ] });
}
const Jo = ["N", "E", "S", "W"], Na = { N: "S", S: "N", E: "W", W: "E" }, $a = { N: "North", E: "East", S: "South", W: "West" };
function Ca({
  deal: e,
  seed: t = 1,
  dealer: o = "N",
  vul: r = "none",
  humanSeat: l = "S",
  showAllHands: c = !1,
  appearance: i,
  decide: a,
  robotDelayMs: s = 350,
  showCoach: h = !1,
  coachShare: b,
  onComplete: p,
  onState: g
}) {
  var F, q, B;
  const S = ue(() => e ?? Ze(t), [e, t]), [u, m] = V(
    () => St("embed", o, r, S)
  ), y = `${o}:${r}:${t}:${S.N.length}:${((F = S.N[0]) == null ? void 0 : F.suit) ?? ""}${((q = S.N[0]) == null ? void 0 : q.rank) ?? ""}`, $ = oe(y);
  xe(() => {
    $.current !== y && ($.current = y, H.current = 0, m(St("embed", o, r, S)));
  }, [y, o, r, S]);
  const H = oe(0), L = Me((I, M) => {
    m(
      (te) => _e(te, {
        category: "bid-event",
        seq: H.current += 1,
        boardRef: te.boardRef,
        seat: I,
        call: M
      })
    );
  }, []), w = Me((I, M) => {
    m(
      (te) => _e(te, {
        category: "play-event",
        seq: H.current += 1,
        boardRef: te.boardRef,
        seat: I,
        card: M
      })
    );
  }, []), z = ((B = u.contract) == null ? void 0 : B.declarer) ?? null, x = z && u.phase !== "auction" ? Na[z] : null, D = x === l && z ? z : l, O = D !== l, k = Me(
    (I) => I === D || I === x && z === D,
    [D, x, z]
  ), C = u.phase !== "complete" && k(u.turn), E = oe(!1);
  xe(() => {
    if (!a || C || u.phase === "complete" || E.current) return;
    const I = u.turn, M = u;
    E.current = !0;
    let te = !1;
    return (async () => {
      try {
        if (await new Promise((G) => setTimeout(G, s)), te) return;
        const le = await a(M, I);
        if (te || !le) return;
        m((G) => G !== M && G.turn !== I ? G : le.call && G.phase === "auction" ? Xe(G.auction, I).has(le.call) ? _e(G, {
          category: "bid-event",
          seq: H.current += 1,
          ts: Date.now(),
          boardRef: G.boardRef,
          seat: I,
          call: le.call,
          fallback: !1
        }) : G : le.card && G.phase === "play" && Gt(G, I).some(
          (W) => W.suit === le.card.suit && W.rank === le.card.rank
        ) ? _e(G, {
          category: "play-event",
          seq: H.current += 1,
          ts: Date.now(),
          boardRef: G.boardRef,
          seat: I,
          card: le.card,
          fallback: !1
        }) : G);
      } finally {
        E.current = !1;
      }
    })(), () => {
      te = !0, E.current = !1;
    };
  }, [a, C, u, s]);
  const X = oe(g);
  X.current = g, xe(() => {
    var I;
    (I = X.current) == null || I.call(X, u);
  }, [u]);
  const A = oe(!1);
  xe(() => {
    u.phase !== "complete" || A.current || (A.current = !0, p == null || p(u));
  }, [u, p]);
  const j = ue(() => ({
    ...$r((i == null ? void 0 : i.skin) ?? "bbo", i == null ? void 0 : i.overrides),
    handLayout: (i == null ? void 0 : i.handLayout) ?? "row",
    bidPad: (i == null ? void 0 : i.bidPad) ?? "grid",
    centreFrame: (i == null ? void 0 : i.centreFrame) ?? !1,
    fanSpread: (i == null ? void 0 : i.fanSpread) ?? 56,
    fanRadius: (i == null ? void 0 : i.fanRadius) ?? 0
  }), [i]), K = ue(() => {
    const I = {};
    for (const M of Jo)
      I[M] = c || M === D || M === x;
    return I;
  }, [c, D, x]), ee = ue(() => {
    const I = {};
    for (const M of Jo)
      I[M] = {
        // "You" follows the cards, not the chair. After a swap the seat the
        // learner was dealt is the dummy across the table, and it takes that
        // seat's own name — the learner is playing from the other one now, and
        // two seats both labelled "You" would say nothing about who acts.
        name: M === D ? "You" : $a[M],
        // A swap must not be silent: the learner bid this auction from the
        // other chair, so the seat they left is marked as theirs rather than
        // just appearing to be somebody else's hand.
        tag: M === x ? O && M === l ? "your seat · dummy" : "dummy" : void 0,
        human: M === D
      };
    return I;
  }, [D, x, O, l]), T = u.phase === "complete" ? wr(u) : null;
  return /* @__PURE__ */ n(
    Ql,
    {
      state: u,
      seats: ee,
      visible: K,
      mySeat: l,
      myTurn: C,
      legalCalls: u.phase === "auction" && C ? [...Xe(u.auction, u.turn)] : [],
      legalPlays: u.phase === "play" && C ? Gt(u, u.turn) : [],
      appearance: j,
      showCoach: h,
      ...b === void 0 ? {} : { coachShare: b },
      resultLine: T ? Nr(T) : "",
      resultScore: T ? `${T.declarerScore >= 0 ? "+" : ""}${T.declarerScore}` : "",
      onCall: (I) => {
        C && L(u.turn, I);
      },
      onPlay: (I, M) => {
        C && w(u.turn, M);
      }
    }
  );
}
const Wn = ["W", "N", "E", "S"], Ba = { N: "North", E: "East", S: "South", W: "West" }, Ra = {
  none: "Neither vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable"
}, Ea = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Ta = (e) => e === "H" || e === "D", Wa = (e) => /^[1-7][CDHSN]$/.test(e), Aa = "#dbe8e8", An = "#fbfbfa", Je = "rgba(0,0,0,0.10)", dt = "#111827", Fe = "#6B7280", In = "#2f5c8f", Ia = (e, t) => t === "both" || t === (e === "N" || e === "S" ? "ns" : "ew");
function Dt({ call: e, size: t = 15 }) {
  if (!Wa(e))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: dt }, children: e === "P" ? "Pass" : e });
  const o = e[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: t, fontWeight: 700, color: dt, whiteSpace: "nowrap" }, children: [
    e[0],
    /* @__PURE__ */ n("span", { style: { color: Ta(o) ? "#cc0000" : dt }, children: Ea[o] })
  ] });
}
function Ha(e, t, o) {
  const r = e.deal ? null : e.seed ?? 1, l = e.deal ?? Ze(r ?? 1), c = e.dealer ?? t.dealer, i = e.vul ?? t.vul, a = e.seat ?? t.seat;
  let s = St(`drill-${o}`, c, i, l);
  const h = (p) => {
    s = _e(s, {
      category: "bid-event",
      boardRef: s.boardRef,
      seat: s.turn,
      call: p
    });
  };
  for (const p of e.auction ?? []) {
    if (s.phase !== "auction" || s.turn === a || !Xe(s.auction, s.turn).has(p)) break;
    h(p);
  }
  for (let p = 0; p < 4 && s.phase === "auction" && s.turn !== a; p++) h("P");
  const b = s.phase === "auction" && s.turn === a;
  return {
    seed: r,
    seat: a,
    dealer: c,
    vul: i,
    state: s,
    legal: b ? [...Xe(s.auction, a)] : [],
    askable: b,
    note: e.note ?? ""
  };
}
function hd({
  hands: e,
  dealer: t = "N",
  vul: o = "none",
  seat: r = "S",
  decide: l,
  prefetchConcurrency: c = 2,
  onComplete: i
}) {
  const a = ue(
    () => JSON.stringify([
      t,
      o,
      r,
      e.map((W) => [W.seed ?? null, W.dealer ?? null, W.vul ?? null, W.seat ?? null, W.auction ?? null, W.note ?? "", W.deal ? Object.values(W.deal).flat().length : 0])
    ]),
    [e, t, o, r]
  ), s = oe({ sig: "", list: [] });
  s.current.sig !== a && (s.current = { sig: a, list: e.map((W, U) => Ha(W, { dealer: t, vul: o, seat: r }, U)) });
  const h = s.current.list, b = oe(l);
  b.current = l;
  const p = !!l, [g, S] = V({});
  xe(() => {
    const W = s.current.list, U = {};
    for (let v = 0; v < W.length; v++)
      U[v] = { status: p && W[v].askable ? "pending" : "off", call: null, ms: null };
    if (S(U), !p) return;
    let P = !1, re = 0;
    const Y = async () => {
      var v;
      for (; ; ) {
        const _ = re++;
        if (P || _ >= W.length) return;
        const Z = W[_];
        if (!Z.askable) continue;
        const de = Date.now();
        try {
          const ae = await ((v = b.current) == null ? void 0 : v.call(b, Z.state, Z.seat));
          if (P) return;
          const ke = Date.now() - de;
          S((Re) => ({
            ...Re,
            [_]: ae != null && ae.call ? { status: "ready", call: ae.call, ms: ke } : { status: "failed", call: null, ms: ke }
          }));
        } catch {
          if (P) return;
          S((ae) => ({ ...ae, [_]: { status: "failed", call: null, ms: Date.now() - de } }));
        }
      }
    }, fe = Math.max(1, Math.min(c, W.length));
    return Promise.all(Array.from({ length: fe }, () => Y())), () => {
      P = !0;
    };
  }, [a, p, c]);
  const [u, m] = V(0), [y, $] = V({}), [H, L] = V(null), [w, z] = V(!1), x = Me(() => {
    m(0), $({}), L(null), z(!1), k.current = !1;
  }, []), D = oe(a);
  D.current !== a && (D.current = a, (u !== 0 || w || Object.keys(y).length) && x());
  const O = ue(
    () => h.flatMap((W, U) => {
      const P = y[U];
      if (!P) return [];
      const re = g[U], Y = (re == null ? void 0 : re.status) === "ready" ? re.call : null;
      return [
        {
          index: U,
          seat: W.seat,
          seed: W.seed,
          yourCall: P,
          benCall: Y,
          agreed: Y ? Y === P : null,
          benMs: (re == null ? void 0 : re.ms) ?? null
        }
      ];
    }),
    [h, y, g]
  ), k = oe(!1);
  xe(() => {
    !w || k.current || (k.current = !0, i == null || i(O));
  }, [w, O, i]);
  const C = oe(null), [E, X] = V(560);
  xe(() => {
    const W = C.current;
    if (!W) return;
    const U = () => X(W.clientWidth || 560);
    U();
    const P = new ResizeObserver(U);
    return P.observe(W), () => P.disconnect();
  }, []);
  const A = 280, j = 14, K = 14, ee = E >= A + K + 240 + j * 2, T = (ee ? E - j * 2 - K - A : E - j * 2) - 6, F = Math.max(26, Math.min(46, Math.floor((T - 70) / 5.65))), q = 5 * (F + 14) + 4 * Math.round(F * 0.13);
  if (h.length === 0)
    return /* @__PURE__ */ n("div", { style: { padding: 16, fontSize: 13, color: Fe, background: An, border: `1px solid ${Je}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const B = h[Math.min(u, h.length - 1)], I = y[u] ?? null, M = g[u], te = [];
  {
    const W = [
      ...Array.from({ length: Wn.indexOf(B.dealer) }, () => null),
      ...B.state.auction,
      // The learner's own call, once made, belongs in the grid like any other.
      ...I ? [{ seat: B.seat, call: I }] : []
    ];
    for (let U = 0; U < W.length; U += 4) te.push(W.slice(U, U + 4));
  }
  const ne = Wn.map((W) => ({ seat: W, vul: Ia(W, B.vul), isDealer: W === B.dealer })), le = /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, alignItems: "center" }, children: h.map((W, U) => /* @__PURE__ */ n(
    "span",
    {
      title: `Hand ${U + 1}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: y[U] ? In : "transparent",
        border: `1.5px solid ${U === u && !w ? In : "rgba(0,0,0,0.22)"}`,
        boxSizing: "border-box"
      }
    },
    U
  )) }), G = () => {
    if (!I) return null;
    const W = (M == null ? void 0 : M.status) === "ready" && M.call === I;
    return /* @__PURE__ */ d("div", { style: { background: "#fff", border: `1px solid ${Je}`, borderRadius: 10, padding: "10px 12px" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: Fe }, children: [
        /* @__PURE__ */ n("span", { children: "You bid" }),
        /* @__PURE__ */ n(Dt, { call: I, size: 17 }),
        (M == null ? void 0 : M.status) === "ready" && M.call ? W ? /* @__PURE__ */ n("span", { style: { color: "#1a7f4b", fontWeight: 600 }, children: "— BEN bids that too." }) : /* @__PURE__ */ d(me, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN bid" }),
          /* @__PURE__ */ n(Dt, { call: M.call, size: 17 })
        ] }) : (M == null ? void 0 : M.status) === "pending" ? /* @__PURE__ */ d(me, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "BEN is still working on this hand…" })
        ] }) : (M == null ? void 0 : M.status) === "failed" ? /* @__PURE__ */ d(me, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN unavailable" })
        ] }) : null
      ] }),
      B.note && /* @__PURE__ */ n("p", { style: { fontSize: 13, lineHeight: 1.45, color: dt, marginTop: 8, marginBottom: 0 }, children: B.note }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: () => u + 1 < h.length ? m(u + 1) : z(!0),
          style: {
            marginTop: 12,
            height: 38,
            padding: "0 18px",
            border: 0,
            borderRadius: 8,
            background: In,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer"
          },
          children: u + 1 < h.length ? "Next hand →" : "See how you did"
        }
      )
    ] });
  };
  if (w) {
    const W = O.filter((P) => P.benCall), U = W.filter((P) => P.agreed).length;
    return /* @__PURE__ */ d("div", { ref: C, style: { background: An, border: `1px solid ${Je}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        eo,
        {
          line: "Drill complete",
          score: W.length ? `Same call as BEN on ${U} of ${W.length}` : "",
          detail: `${O.length} hand${O.length === 1 ? "" : "s"} bid`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 14 }, children: O.map((P) => /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${Je}`,
            fontSize: 13,
            color: Fe
          },
          children: [
            /* @__PURE__ */ d("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              P.index + 1
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(Dt, { call: P.yourCall })
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "BEN" }),
              P.benCall ? /* @__PURE__ */ n(Dt, { call: P.benCall }) : /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "unavailable" })
            ] }),
            P.agreed && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", color: "#1a7f4b", fontWeight: 700 }, children: "same" })
          ]
        },
        P.index
      )) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: x,
          style: {
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${Je}`,
            borderRadius: 8,
            background: "#fff",
            color: dt,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Bid them again"
        }
      ),
      /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: Fe, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
    ] });
  }
  const ie = /* @__PURE__ */ d("div", { style: { flex: ee ? "1 1 0" : void 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ n($t, { cards: B.state.hands[B.seat], panelBg: "#fff", width: "100%", font: 20, suitW: 18, pad: "6px 10px" }),
    /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: ee ? "flex-start" : "center" }, children: /* @__PURE__ */ n(
      Mr,
      {
        bg: Aa,
        m: { width: 236, height: "auto", headFont: 16, cellFont: 15, radius: 6, cellMinH: 20 },
        heads: ne,
        rows: te,
        dealerCol: Wn.indexOf(B.dealer),
        emptyText: te.length === 0 ? `${B.dealer === B.seat ? "You deal" : `${B.dealer} deals`}` : null
      }
    ) })
  ] }), N = /* @__PURE__ */ d(
    "div",
    {
      style: {
        flex: ee ? `0 0 ${q}px` : void 0,
        width: ee ? q : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8
      },
      children: [
        B.askable ? I ? null : /* @__PURE__ */ d(me, { children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 12, color: Fe, alignSelf: "flex-start" }, children: H ? "Confirm your call" : "Your call?" }),
          /* @__PURE__ */ n(
            xt,
            {
              cell: F,
              radius: 6,
              legalCalls: B.legal,
              live: !0,
              pending: H,
              onStage: L,
              onConfirm: () => {
                H && ($((W) => ({ ...W, [u]: H })), L(null));
              },
              onCancel: () => L(null)
            }
          )
        ] }) : /* @__PURE__ */ n("p", { style: { fontSize: 13, color: Fe, textAlign: "center", margin: 0 }, children: "This hand's auction is already over — nothing to bid." }),
        (I || !B.askable) && /* @__PURE__ */ n("div", { style: { width: "100%" }, children: I ? G() : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => u + 1 < h.length ? m(u + 1) : z(!0),
            style: { height: 34, padding: "0 14px", border: `1px solid ${Je}`, borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
            children: "Skip this hand →"
          }
        ) })
      ]
    }
  );
  return /* @__PURE__ */ d("div", { ref: C, style: { background: An, border: `1px solid ${Je}`, borderRadius: 12, padding: 14 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }, children: [
      /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 700, color: dt }, children: [
        "Hand ",
        u + 1,
        " of ",
        h.length
      ] }),
      le
    ] }),
    /* @__PURE__ */ d("p", { style: { fontSize: 12, color: Fe, margin: "0 0 10px" }, children: [
      "You are ",
      Ba[B.seat],
      " · ",
      Ra[B.vul]
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: ee ? "row" : "column", gap: 14, alignItems: "flex-start" }, children: [
      ie,
      N
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: Fe, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
  ] });
}
const Vo = ["N", "E", "S", "W"], Qo = { N: "North", E: "East", S: "South", W: "West" }, za = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, Ma = 1976 / 1232, Ot = (e) => e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
function ud({
  seed: e = 1,
  deal: t,
  dealer: o = "N",
  vul: r = "none",
  show: l = "all",
  boardLabel: c,
  names: i,
  auction: a = [],
  highlightSeat: s = null,
  hiddenSeats: h = [],
  isolate: b,
  fontFamily: p
}) {
  const g = ue(() => t ?? Ze(e), [t, e]), S = ue(() => {
    let y = St("diagram", o, r, g);
    for (const $ of a) {
      if (y.phase !== "auction" || !Xe(y.auction, y.turn).has($)) break;
      y = _e(y, {
        category: "bid-event",
        boardRef: y.boardRef,
        seat: y.turn,
        call: $
      });
    }
    return y.auction;
  }, [a, o, r, g]);
  if (l !== "all")
    return /* @__PURE__ */ n(
      $t,
      {
        cards: g[l],
        panelBg: "#fff",
        width: "100%",
        font: 21,
        suitW: 19,
        pad: "8px 12px"
      }
    );
  const u = {};
  for (const y of Vo) u[y] = (i == null ? void 0 : i[y]) ?? Qo[y];
  const m = {};
  for (const y of Vo) m[y] = !h.includes(y);
  return /* @__PURE__ */ n("div", { style: { ...Zt({ isolate: b, fontFamily: p }), width: "100%", aspectRatio: String(Ma) }, children: /* @__PURE__ */ n(
    oa,
    {
      boardLabel: c ?? e,
      dealer: o,
      vul: r,
      hands: g,
      names: u,
      visible: m,
      auction: S,
      highlightSeat: s,
      info: [
        { label: "Dealer", value: Qo[o] },
        { label: "Vulnerable", value: za[r] }
      ],
      result: [
        { label: "N-S points", value: String(Ot(g.N) + Ot(g.S)) },
        { label: "E-W points", value: String(Ot(g.E) + Ot(g.W)) }
      ]
    }
  ) });
}
function Kr(e) {
  return e.format === "bidding-only" ? "bidding-only" : "full";
}
function Da(e) {
  return Kr(e) === "bidding-only";
}
function Yr(e, t) {
  return t ? e !== "auction" : e === "complete";
}
const ct = 1, Ae = 16;
function Oa(e) {
  return ["N", "E", "S", "W"][(e - 1) % 4];
}
function Ur(e) {
  return [
    "none",
    "ns",
    "ew",
    "both",
    "ns",
    "ew",
    "both",
    "none",
    "ew",
    "both",
    "none",
    "ns",
    "both",
    "none",
    "ns",
    "ew"
  ][(e - 1) % 16];
}
function La(e) {
  const t = e.auction.map((r) => `${r.seat}${r.call}`).join(","), o = e.play.map((r) => `${r.seat}${r.card.suit}${r.card.rank}`).join(",");
  return `${e.dealer}/${t}/${o}`;
}
function Pa(e) {
  const t = La(e);
  let o = 2166136261;
  for (let r = 0; r < t.length; r++)
    o ^= t.charCodeAt(r), o = Math.imul(o, 16777619) >>> 0;
  return `${o.toString(16).padStart(8, "0")}${t.length.toString(16)}`;
}
const Hn = [
  { imps: 0, from: 0, to: 10 },
  { imps: 1, from: 20, to: 40 },
  { imps: 2, from: 50, to: 80 },
  { imps: 3, from: 90, to: 120 },
  { imps: 4, from: 130, to: 160 },
  { imps: 5, from: 170, to: 210 },
  { imps: 6, from: 220, to: 260 },
  { imps: 7, from: 270, to: 310 },
  { imps: 8, from: 320, to: 360 },
  { imps: 9, from: 370, to: 420 },
  { imps: 10, from: 430, to: 490 },
  { imps: 11, from: 500, to: 590 },
  { imps: 12, from: 600, to: 740 },
  { imps: 13, from: 750, to: 890 },
  { imps: 14, from: 900, to: 1090 },
  { imps: 15, from: 1100, to: 1290 },
  { imps: 16, from: 1300, to: 1490 },
  { imps: 17, from: 1500, to: 1740 },
  { imps: 18, from: 1750, to: 1990 },
  { imps: 19, from: 2e3, to: 2240 },
  { imps: 20, from: 2250, to: 2490 },
  { imps: 21, from: 2500, to: 2990 },
  { imps: 22, from: 3e3, to: 3490 },
  { imps: 23, from: 3500, to: 3990 },
  { imps: 24, from: 4e3, to: Number.POSITIVE_INFINITY }
];
function Fa(e) {
  const t = Math.abs(e), o = Hn.find((r) => t <= r.to) ?? Hn[Hn.length - 1];
  return o.imps === 0 ? 0 : e < 0 ? -o.imps : o.imps;
}
function qo(e) {
  return e === void 0 ? "?" : e === null ? "PASS" : `${e.level}${e.strain}${e.doubled}`;
}
function _a(e, t) {
  return e === void 0 || t === void 0 ? !1 : qo(e) === qo(t);
}
const Xa = "—";
function Zo(e, t) {
  const o = Math.round(t);
  return e === "mp" ? `${o}` : o > 0 ? `+${o}` : `${o}`;
}
function ja(e, t) {
  if (e === "mp") return `${t.toFixed(1)}%`;
  const o = Math.round(t);
  return e === "total" ? `${o >= 0 ? "+" : ""}${o.toLocaleString("en-US")}` : `${o >= 0 ? "+" : ""}${o}`;
}
const Gr = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
  N: "NT"
};
function zn(e) {
  if (e === void 0) return "";
  if (e === null) return "Pass";
  const t = e.doubled === 1 ? "×" : e.doubled === 2 ? "××" : "";
  return `${e.level}${Gr[e.strain] ?? e.strain}${t}${e.declarer}`;
}
function er(e) {
  if (e === void 0) return Xa;
  if (e === null) return "Passed out";
  const t = e.doubled === 1 ? " ×" : e.doubled === 2 ? " ××" : "";
  return `${e.level}${Gr[e.strain] ?? e.strain}${t} by ${e.declarer}`;
}
function Ka(e, t) {
  return e === "unrated" ? "BEN has not bid this board yet" : e === "differed" ? "A different contract" : t ? "Matched BEN" : "Matched BEN, from the other side";
}
function Mn(e) {
  return e === "matched" ? "pos" : "neutral";
}
const Ya = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2
}, Ua = { 1: "S", 2: "W", 3: "N", 4: "E" };
function Ga() {
  const e = [];
  for (const t of ["S", "H", "D", "C"])
    for (const o of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
      e.push({ suit: t, rank: o });
  return e;
}
function Ja(e) {
  const t = [];
  let o = null;
  for (const r of e) {
    const l = r.toUpperCase();
    if (l === "S" || l === "H" || l === "D" || l === "C") {
      o = l;
      continue;
    }
    const c = Ya[l];
    c && o && t.push({ suit: o, rank: c });
  }
  return t;
}
function Va(e) {
  const t = Ua[e[0]];
  if (!t) return null;
  const o = e.slice(1).split(","), r = { S: [], W: [], N: [], E: [] };
  ze.forEach((i, a) => {
    o[a] && (r[i] = Ja(o[a]));
  });
  const l = /* @__PURE__ */ new Set();
  for (const i of ze) for (const a of r[i]) l.add(`${a.suit}${a.rank}`);
  const c = Ga().filter((i) => !l.has(`${i.suit}${i.rank}`));
  for (const i of ze)
    for (; r[i].length < 13 && c.length; ) r[i].push(c.shift());
  return { dealer: t, hands: r };
}
function Qa(e) {
  let t = e.trim(), o = !1;
  for (; t.endsWith("!"); )
    o = !0, t = t.slice(0, -1).trim();
  const r = t.toLowerCase();
  if (r === "p" || r === "pass") return { call: "P", alert: o };
  if (r === "d" || r === "x" || r === "dbl") return { call: "X", alert: o };
  if (r === "r" || r === "xx" || r === "rdbl") return { call: "XX", alert: o };
  const l = t[0];
  let c = (t[1] ?? "").toUpperCase();
  return c === "N" && (c = "N"), { call: `${l}${c}`, alert: o };
}
function qa(e) {
  const t = e.replace(/\r/g, "").split("|"), o = [];
  for (let r = 0; r < t.length - 1; r += 2)
    o.push([t[r].trim(), t[r + 1]]);
  return o;
}
function Za(e) {
  var b;
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a LIN string first." };
  if (!t.includes("md|") && !t.includes("|md|"))
    return {
      ok: !1,
      error: 'No deal found — this doesn’t look like a LIN file (expected an "md|" tag).'
    };
  const o = qa(t), r = [];
  let l = { S: "", W: "", N: "", E: "" }, c = "none", i = null, a = 0;
  const s = (p) => {
    a += 1;
    const g = {
      name: p || `Board ${a}`,
      dealer: "S",
      vul: c,
      players: { ...l },
      hands: { S: [], W: [], N: [], E: [] },
      auction: []
    };
    return r.push(g), g;
  };
  for (const [p, g] of o)
    switch (p) {
      case "pn": {
        const S = g.split(",");
        l = {
          S: (S[0] ?? "").trim(),
          W: (S[1] ?? "").trim(),
          N: (S[2] ?? "").trim(),
          E: (S[3] ?? "").trim()
        }, i && (i.players = { ...l });
        break;
      }
      case "sv": {
        const S = g.trim().toLowerCase();
        c = S === "n" ? "ns" : S === "e" ? "ew" : S === "b" ? "both" : "none", i && (i.vul = c);
        break;
      }
      case "qx": {
        const S = (b = g.match(/(\d+)/)) == null ? void 0 : b[1];
        i = s(S ? `Board ${S}` : "");
        break;
      }
      case "ah":
        i && (i.name = g.trim() || i.name);
        break;
      case "md": {
        const S = Va(g.trim());
        S && ((!i || i.hands.S.length) && (i = s("")), i.dealer = S.dealer, i.hands = S.hands);
        break;
      }
      case "mb": {
        if (!i) break;
        const { call: S, alert: u } = Qa(g), m = ze[(ze.indexOf(i.dealer) + i.auction.length) % 4];
        i.auction.push({ seat: m, call: S, alert: u });
        break;
      }
      case "an": {
        i && i.auction.length && (i.auction[i.auction.length - 1].note = g.trim());
        break;
      }
    }
  const h = r.filter((p) => p.hands.S.length === 13);
  return h.length ? { ok: !0, boards: h } : { ok: !1, error: "Couldn’t read any complete deals from that LIN." };
}
const es = "SWNE", tr = 3;
function ts(e) {
  const t = e.trim().charAt(0).toUpperCase();
  if (!t) return tr;
  const o = es.indexOf(t);
  return o < 0 ? tr : o + 1;
}
function ns(e) {
  if (!/%[0-9a-f]{2}/i.test(e)) return e;
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function os(e) {
  const t = e.trim();
  if (!/^(https?:)?\/\//i.test(t) && !/^www\./i.test(t)) return null;
  try {
    return new URL(t.startsWith("www.") ? `https://${t}` : t);
  } catch {
    return null;
  }
}
function rs(e) {
  const t = (b) => (e.searchParams.get(b) ?? "").trim(), o = t("s"), r = t("w"), l = t("n"), c = t("e");
  if (!o && !r && !l && !c) return null;
  const i = `md|${ts(t("d"))}${o},${r},${l},${c}|`, a = `sv|${t("v")}|`, s = Number.parseInt(t("b"), 10), h = s > 0 ? `ah|Board ${s}|` : "";
  return `${i}${a}${h}`;
}
function is(e) {
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a BBO hand link first." };
  const o = os(t);
  if (!o)
    return t.includes("md|") ? { ok: !0, lin: t } : {
      ok: !1,
      error: "That is neither a BBO hand link nor a LIN string. Copy the link from the Hand Viewer’s address bar."
    };
  for (const c of ["linurl", "myhand", "linlocal"])
    if (o.searchParams.get(c))
      return {
        ok: !1,
        error: `This link points at a LIN file (${c}) rather than carrying the deal. Open it and paste the LIN itself.`
      };
  const r = o.searchParams.get("lin");
  if (r) {
    const c = ns(r);
    return c.includes("md|") ? { ok: !0, lin: c } : { ok: !1, error: "That link’s lin= has no deal in it (no “md|” tag)." };
  }
  const l = rs(o);
  return l ? { ok: !0, lin: l } : {
    ok: !1,
    error: "No deal in that link — a Hand Viewer URL carries one in lin=, or in n/e/s/w hand parameters."
  };
}
function Jr(e) {
  const t = is(e);
  return t.ok ? Za(t.lin) : { ok: !1, error: t.error };
}
const qe = ["S", "H", "D", "C"], ls = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2
};
function as(e) {
  const t = e.toUpperCase().replaceAll("10", "T").replace(/[\s,.]/g, ""), o = [];
  for (const r of t) {
    const l = ls[r];
    if (!l) return { error: `"${r}" is not a card rank` };
    o.push(l);
  }
  return o;
}
function ss(e) {
  const t = e.split(".");
  if (t.length !== 4) return { error: "expected four dot-separated suits" };
  const o = [];
  for (let r = 0; r < 4; r++) {
    const l = as(t[r] ?? "");
    if ("error" in l) return l;
    for (const c of l) o.push({ suit: qe[r], rank: c });
  }
  return o;
}
function ds(e) {
  const t = { S: "", H: "", D: "", C: "" };
  for (const o of qe)
    t[o] = e.filter((r) => r.suit === o).sort((r, l) => l.rank - r.rank).map((r) => yt(r.rank)).join("");
  return t;
}
function cs(e) {
  const t = ds(e);
  return qe.map((o) => t[o]).join(".");
}
const Ce = Ct, Vr = "#eff7f6", je = "#17211d", be = "#5c6b64", he = "#8b9a93", ge = "#e4ebe7", ye = "#ffffff", $e = "#f7faf8", fs = "#8a6d1f", hs = "#fdf6e3", en = "#c0392b", Qr = "#fdeeec", tn = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", us = {
  fontFamily: tn,
  color: je,
  fontSize: 13,
  lineHeight: 1.45,
  boxSizing: "border-box"
};
function ot({
  children: e,
  style: t
}) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginBottom: 6,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: he,
        ...t
      },
      children: e
    }
  );
}
function nr({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        background: Vr,
        color: "#14403f",
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function ps({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f0e2b8",
        background: hs,
        color: fs,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function or({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      role: "alert",
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f3c9c2",
        background: Qr,
        color: en,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function Lt({
  num: e,
  title: t,
  aside: o,
  children: r,
  innerRef: l
}) {
  return /* @__PURE__ */ d(
    "section",
    {
      ref: l,
      style: {
        scrollMarginTop: 84,
        padding: "16px 0",
        borderBottom: `8px solid ${$e}`
      },
      children: [
        /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }, children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: Ce }, children: e }),
          /* @__PURE__ */ n("h3", { style: { margin: 0, fontSize: 16, fontWeight: 800, color: je }, children: t }),
          o && /* @__PURE__ */ d(me, { children: [
            /* @__PURE__ */ n("span", { style: { flex: 1 } }),
            /* @__PURE__ */ n("span", { style: { fontSize: 11.5, color: he }, children: o })
          ] })
        ] }),
        r
      ]
    }
  );
}
function rr({
  options: e,
  value: t,
  onChange: o,
  ariaLabel: r
}) {
  return /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, role: "group", "aria-label": r, children: e.map((l) => {
    const c = l.key === t;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        "aria-pressed": c,
        onClick: () => o(l.key),
        style: {
          flex: 1,
          minWidth: 0,
          height: 40,
          padding: "0 6px",
          borderRadius: 8,
          border: `1px solid ${c ? Ce : ge}`,
          background: c ? Ce : ye,
          color: c ? "#fff" : be,
          fontFamily: "inherit",
          fontSize: 12.5,
          fontWeight: c ? 800 : 600,
          cursor: "pointer"
        },
        children: l.label
      },
      l.key
    );
  }) });
}
function gs({
  children: e,
  onClick: t,
  disabled: o,
  style: r
}) {
  return /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: t,
      disabled: o,
      style: {
        height: 44,
        width: "100%",
        border: 0,
        borderRadius: 9,
        background: o ? "#d7ded9" : Ce,
        color: o ? "#8b9a93" : "#fff",
        fontFamily: "inherit",
        fontSize: 14.5,
        fontWeight: 800,
        cursor: o ? "default" : "pointer",
        ...r
      },
      children: e
    }
  );
}
function bt({
  children: e,
  onClick: t,
  title: o,
  ariaLabel: r,
  tone: l = "plain",
  disabled: c
}) {
  const i = {
    flex: "none",
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${l === "accent" ? "#b9dcd9" : l === "alarm" ? "#f3c9c2" : ge}`,
    background: l === "accent" ? Vr : l === "alarm" ? Qr : ye,
    color: l === "accent" ? "#14403f" : l === "alarm" ? en : be,
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 700,
    cursor: t && !c ? "pointer" : "default"
  };
  return t ? /* @__PURE__ */ n("button", { type: "button", onClick: t, title: o, "aria-label": r, disabled: c, style: i, children: e }) : /* @__PURE__ */ n("span", { style: i, children: e });
}
function Ve({
  k: e,
  v: t,
  last: o
}) {
  return /* @__PURE__ */ d(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 12px",
        borderBottom: o ? 0 : `1px solid ${$e}`
      },
      children: [
        /* @__PURE__ */ n(
          "span",
          {
            style: {
              width: 84,
              flex: "none",
              fontSize: 10.5,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: he
            },
            children: e
          }
        ),
        /* @__PURE__ */ n("span", { style: { flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }, children: t })
      ]
    }
  );
}
const Yt = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${ge}`,
  background: ye,
  color: je,
  fontFamily: "inherit",
  fontSize: 13.5,
  boxSizing: "border-box"
}, Dn = ["N", "E", "S", "W"], pt = { N: "North", E: "East", S: "South", W: "West" }, Pt = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2], ir = { S: "♠", H: "♥", D: "♦", C: "♣" }, lr = "#b03a2e", ar = (e) => e === "H" || e === "D", rt = {
  N: "#2a7ab0",
  E: "#6f4bb0",
  S: "#1c8a5a",
  W: "#b08328"
}, it = (e, t) => `${e}${t}`;
function bs({
  hands: e,
  onApply: t,
  onCancel: o,
  applyLabel: r = "Use this pack"
}) {
  const [l, c] = V(() => {
    const u = {};
    for (const m of Dn)
      for (const y of e[m] ?? []) u[it(y.suit, y.rank)] = m;
    return u;
  }), [i, a] = V("N"), s = ue(() => {
    const u = { N: 0, E: 0, S: 0, W: 0 };
    for (const m of Object.values(l)) m && u[m]++;
    return u;
  }, [l]), h = 52 - s.N - s.E - s.S - s.W, b = Dn.every((u) => s[u] === 13), p = (u, m) => {
    const y = it(u, m);
    c(($) => ({ ...$, [y]: $[y] === i ? "" : i }));
  }, g = () => c((u) => {
    const m = { ...u };
    for (const y of qe)
      for (const $ of Pt) {
        const H = it(y, $);
        m[H] || (m[H] = i);
      }
    return m;
  }), S = () => {
    const u = { N: [], E: [], S: [], W: [] };
    for (const m of qe)
      for (const y of Pt) {
        const $ = l[it(m, y)];
        $ && u[$].push({ suit: m, rank: y });
      }
    t(u);
  };
  return /* @__PURE__ */ d(
    "div",
    {
      role: "group",
      "aria-label": b ? "Pack editor — all four hands hold 13 cards" : "Pack editor — hands are not yet 13 cards each",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: `2px solid ${b ? "#79c2a4" : "#e8b1a8"}`,
        background: ye
      },
      children: [
        /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }, children: Dn.map((u) => {
          const m = i === u, y = qe.map(($) => ({
            suit: $,
            text: Pt.filter((H) => l[it($, H)] === u).map((H) => yt(H)).join(" ")
          }));
          return /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: () => a(u),
              title: `Click cards below to give them to ${pt[u]}`,
              style: {
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${m ? rt[u] : ge}`,
                background: m ? `${rt[u]}14` : ye,
                cursor: "pointer",
                fontFamily: "inherit"
              },
              children: [
                /* @__PURE__ */ d(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: m ? rt[u] : be
                    },
                    children: [
                      /* @__PURE__ */ n("span", { children: pt[u] }),
                      /* @__PURE__ */ d("span", { style: { color: s[u] === 13 ? "#1c8a5a" : en }, children: [
                        s[u],
                        "/13"
                      ] })
                    ]
                  }
                ),
                y.map(({ suit: $, text: H }) => /* @__PURE__ */ d(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: 4,
                      fontSize: 10,
                      lineHeight: 1.45,
                      fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace"
                    },
                    children: [
                      /* @__PURE__ */ n("span", { style: { color: ar($) ? lr : je }, children: ir[$] }),
                      /* @__PURE__ */ n(
                        "span",
                        {
                          style: {
                            color: be,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          },
                          children: H || "—"
                        }
                      )
                    ]
                  },
                  $
                ))
              ]
            },
            u
          );
        }) }),
        /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: qe.map((u) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 3 }, children: [
          /* @__PURE__ */ n(
            "span",
            {
              style: {
                width: 14,
                flex: "none",
                fontSize: 12,
                textAlign: "center",
                color: ar(u) ? lr : je
              },
              children: ir[u]
            }
          ),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 2, flex: 1, minWidth: 0 }, children: Pt.map((m) => {
            const y = l[it(u, m)] || "", $ = {
              flex: 1,
              minWidth: 0,
              height: 24,
              padding: 0,
              borderRadius: 4,
              border: `1px solid ${y ? rt[y] : ge}`,
              background: y ? `${rt[y]}1f` : $e,
              color: y ? rt[y] : he,
              fontFamily: "inherit",
              fontSize: 10.5,
              fontWeight: y ? 800 : 600,
              cursor: "pointer"
            };
            return /* @__PURE__ */ n(
              "button",
              {
                type: "button",
                onClick: () => p(u, m),
                "aria-label": `${yt(m)} of ${u}${y ? ` — ${pt[y]}` : ""}`,
                title: y ? pt[y] : "In the pool",
                style: $,
                children: yt(m)
              },
              m
            );
          }) })
        ] }, u)) }),
        /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ d("span", { style: { fontSize: 11, color: he }, children: [
            h,
            " in the pool · filling ",
            pt[i]
          ] }),
          /* @__PURE__ */ n("span", { style: { flex: 1 } }),
          /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: g,
              disabled: h === 0,
              style: {
                height: 30,
                padding: "0 10px",
                borderRadius: 7,
                border: `1px solid ${ge}`,
                background: ye,
                color: h === 0 ? he : be,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 700,
                cursor: h === 0 ? "default" : "pointer"
              },
              children: [
                "Give the rest to ",
                i
              ]
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: o,
              style: {
                height: 30,
                padding: "0 10px",
                borderRadius: 7,
                border: `1px solid ${ge}`,
                background: ye,
                color: be,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer"
              },
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: S,
              disabled: !b,
              style: {
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                border: 0,
                background: b ? Ce : "#d7ded9",
                color: b ? "#fff" : "#8b9a93",
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 800,
                cursor: b ? "pointer" : "default"
              },
              children: r
            }
          )
        ] })
      ]
    }
  );
}
const sr = ["N", "E", "S", "W"], ys = { N: "North", E: "East", S: "South", W: "West" }, ms = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, dr = (e) => sr[(sr.indexOf(e) + 1) % 4] ?? "N";
function xs({
  board: e,
  onChange: t,
  onReroll: o
}) {
  const [r, l] = V(!1), [c, i] = V(!1), [a, s] = V(""), [h, b] = V(null), p = () => {
    const g = Jr(a);
    if (!g.ok) {
      b(g.error);
      return;
    }
    const S = g.boards[0];
    if (!S) {
      b("That link holds no boards.");
      return;
    }
    b(null), s(""), i(!1), t({
      hands: S.hands,
      dealer: S.dealer,
      vul: S.vul,
      edited: !0
    });
  };
  return /* @__PURE__ */ d(
    "div",
    {
      style: {
        overflow: "hidden",
        borderRadius: 10,
        border: `1px solid ${e.edited ? "#e2cf9a" : ge}`,
        background: ye
      },
      children: [
        /* @__PURE__ */ d(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderBottom: `1px solid ${$e}`
            },
            children: [
              /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 800, color: je }, children: [
                "Board ",
                e.boardNo
              ] }),
              e.edited && /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "#fdf6e3",
                    color: "#8a6d1f",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: ".05em",
                    textTransform: "uppercase"
                  },
                  children: "edited"
                }
              ),
              /* @__PURE__ */ n("span", { style: { flex: 1 } }),
              /* @__PURE__ */ n(bt, { onClick: o, title: "Re-roll this deal", children: "↻ Re-roll" })
            ]
          }
        ),
        /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px 4px" }, children: [
          /* @__PURE__ */ d(bt, { tone: e.vul === "none" ? "plain" : "alarm", children: [
            "Vul ",
            ms[e.vul]
          ] }),
          /* @__PURE__ */ d(bt, { onClick: () => t({ dealer: dr(e.dealer) }), title: "Cycle the dealer", children: [
            "Dealer ",
            e.dealer
          ] }),
          /* @__PURE__ */ d(
            bt,
            {
              tone: "accent",
              onClick: () => t({ humanSeat: dr(e.humanSeat) }),
              title: "Cycle the seat the learner sits",
              children: [
                "You: ",
                e.humanSeat
              ]
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "4px 10px" }, children: /* @__PURE__ */ n(
          $t,
          {
            cards: e.hands[e.humanSeat],
            panelBg: ye,
            width: "100%",
            font: 14,
            suitW: 14,
            pad: "4px 8px"
          }
        ) }),
        /* @__PURE__ */ d(
          "p",
          {
            style: {
              margin: 0,
              padding: "2px 10px 8px",
              textAlign: "center",
              fontSize: 10,
              color: he
            },
            children: [
              "You play ",
              ys[e.humanSeat],
              " · the other three hands stay hidden"
            ]
          }
        ),
        h && !r && /* @__PURE__ */ n(
          "p",
          {
            style: {
              margin: "0 10px 8px",
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid #f3c9c2",
              background: "#fdeeec",
              color: en,
              fontSize: 10.5
            },
            children: h
          }
        ),
        /* @__PURE__ */ d("div", { style: { display: "flex", borderTop: `1px solid ${$e}` }, children: [
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => i((g) => !g),
              style: {
                flex: 1,
                padding: "8px 4px",
                border: 0,
                borderRight: `1px solid ${$e}`,
                background: c ? "#eef2ef" : $e,
                color: be,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer"
              },
              children: c ? "Close BBO link" : "BBO link"
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => l((g) => !g),
              style: {
                flex: 1,
                padding: "8px 4px",
                border: 0,
                background: r ? "#eff7f6" : $e,
                color: r ? Ce : be,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer"
              },
              children: r ? "Close pack editor" : "Edit pack →"
            }
          )
        ] }),
        c && /* @__PURE__ */ d("div", { style: { display: "flex", gap: 6, padding: "8px 10px", background: $e }, children: [
          /* @__PURE__ */ n(
            "input",
            {
              value: a,
              onChange: (g) => s(g.target.value),
              placeholder: "Paste a Hand Viewer URL",
              "aria-label": `BBO hand link for board ${e.boardNo}`,
              style: { ...Yt, height: 34, fontSize: 12 }
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: p,
              disabled: !a.trim(),
              style: {
                flex: "none",
                height: 34,
                padding: "0 12px",
                borderRadius: 8,
                border: 0,
                background: a.trim() ? "#22302a" : "#e4ebe7",
                color: a.trim() ? "#fff" : he,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
                cursor: a.trim() ? "pointer" : "default"
              },
              children: "Use deal"
            }
          )
        ] }),
        r && /* @__PURE__ */ n("div", { style: { padding: 10, background: $e }, children: /* @__PURE__ */ n(
          bs,
          {
            hands: e.hands,
            onCancel: () => l(!1),
            onApply: (g) => {
              t({ hands: g, edited: !0 }), l(!1);
            }
          },
          `${e.boardNo}:${e.seed}:${e.edited}`
        ) })
      ]
    }
  );
}
const cr = 120, fr = 240, Jn = [
  {
    key: "full",
    label: "Bid & play",
    sub: "The whole board",
    note: "The full board: bid it, play all thirteen tricks, and set your score beside BEN's on the same deal.",
    review: "Bid & play — the whole board, scored beside BEN"
  },
  {
    key: "bidding-only",
    label: "Bidding only",
    sub: "The auction is the board",
    note: "The board ends when the auction ends — no cards are played. Your result is the contract you reached, set beside the contract BEN reached on the same deal.",
    review: "Bidding only — the board ends with the auction, your contract beside BEN's"
  }
], Vn = [
  {
    key: "imps",
    label: "IMPs",
    full: "IMPs vs BEN",
    note: "Every board is scored in IMPs against BEN's own result on the same deal — the ordinary way two results on one board are compared."
  },
  {
    key: "mp",
    label: "Matchpoints",
    full: "Matchpoints vs BEN",
    note: "Every board is a single comparison: beat BEN's score and it is 100%, tie it and it is 50%."
  },
  {
    key: "total",
    label: "Total points",
    full: "Points vs BEN",
    note: "The raw point difference between your result and BEN's, summed across the boards — simplest to read, harshest on one bad board."
  }
], nn = [
  {
    key: "table.hands_view",
    label: "Show all four hands",
    sub: "The four-hand diagram",
    def: "hide",
    note: "Scored play — hands stay hidden. Turn on only to teach."
  },
  {
    key: "table.undo",
    label: "Undo",
    sub: "Take back a bid or card",
    def: "hide",
    note: "Scored play — no take-backs. Turn on only to teach."
  },
  { key: "table.claim", label: "Claim", sub: "Concede the rest of the tricks", def: "default" },
  { key: "table.seats_panel", label: "Seats", sub: "Who sits each seat", def: "default" },
  {
    key: "table.step_controls",
    label: "Pause / Step",
    sub: "Halt and single-step the robots",
    def: "default"
  },
  { key: "table.settings_menu", label: "☰ Menu", sub: "Table settings sheet", def: "default" },
  { key: "table.coach", label: "Coach", sub: "Commentary panel", def: "default" }
], ks = [
  { key: "default", label: "Default" },
  { key: "show", label: "Show" },
  { key: "hide", label: "Hide" }
];
function Ss() {
  const e = {};
  for (const t of nn) e[t.key] = t.def;
  return e;
}
function hr(e) {
  const t = {};
  for (const o of nn) {
    const r = e[o.key];
    (r === "show" || r === "hide") && (t[o.key] = r);
  }
  return t;
}
function vs(e) {
  return { showAllHands: (e == null ? void 0 : e["table.hands_view"]) === "show" };
}
const qt = new Set(ze), qr = new Set(Object.keys(Vi)), ws = new Set(Jn.map((e) => e.key)), Zr = new Set(Vn.map((e) => e.key)), Ns = new Set(nn.map((e) => e.key));
function to(e) {
  const t = { N: [], E: [], S: [], W: [] }, o = /* @__PURE__ */ new Set();
  for (const r of ze) {
    const l = ss(e[r] ?? "");
    if ("error" in l) return { error: `${r}: ${l.error}` };
    if (l.length !== 13) return { error: `${r} holds ${l.length} cards, not 13` };
    for (const c of l) {
      const i = `${c.suit}${c.rank}`;
      if (o.has(i)) return { error: `${i} is dealt twice` };
      o.add(i);
    }
    t[r] = l;
  }
  return { hands: t };
}
function $s(e) {
  const t = [], o = e.title.trim();
  o || t.push("Give the challenge a title."), o.length > cr && t.push(`Titles are at most ${cr} characters.`), e.description.trim().length > fr && t.push(`Descriptions are at most ${fr} characters.`), e.format !== void 0 && !ws.has(e.format) && t.push("Pick whether the board is bid and played, or bidding only."), Zr.has(e.scoring) || t.push("Pick a scoring method."), (e.boards.length < ct || e.boards.length > Ae) && t.push(`A challenge has ${ct}–${Ae} boards.`), e.boards.forEach((r, l) => {
    if (r.boardNo !== l + 1 && t.push(`Board ${l + 1} is numbered ${r.boardNo}.`), Number.isInteger(r.seed) || t.push(`Board ${r.boardNo} has no deal.`), qt.has(r.dealer) || t.push(`Board ${r.boardNo} has no dealer.`), qt.has(r.humanSeat) || t.push(`Board ${r.boardNo} has no seat for you.`), r.vul !== void 0 && !qr.has(r.vul) && t.push(`Board ${r.boardNo} has no vulnerability.`), r.pack) {
      const c = to(r.pack);
      "error" in c && t.push(`Board ${r.boardNo} pack — ${c.error}.`);
    }
  });
  for (const [r, l] of Object.entries(e.controlOverrides ?? {}))
    Ns.has(r) ? l !== "show" && l !== "hide" && t.push(`"${r}" must be shown or hidden.`) : t.push(`"${r}" is not a table control.`);
  return t;
}
function ei(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (!Array.isArray(t.boards) || t.boards.length === 0) return null;
  const o = t.boards.slice(0, Ae).map((r, l) => ({
    boardNo: l + 1,
    seed: Number.isInteger(r == null ? void 0 : r.seed) ? r.seed : 1,
    dealer: qt.has(r == null ? void 0 : r.dealer) ? r.dealer : "N",
    humanSeat: qt.has(r == null ? void 0 : r.humanSeat) ? r.humanSeat : "S",
    ...r != null && r.vul && qr.has(r.vul) ? { vul: r.vul } : {},
    ...r != null && r.pack ? { pack: r.pack } : {}
  }));
  return {
    title: typeof t.title == "string" ? t.title : "",
    description: typeof t.description == "string" ? t.description : "",
    ...t.format === "bidding-only" || t.format === "full" ? { format: t.format } : {},
    scoring: Zr.has(t.scoring) ? t.scoring : "imps",
    boards: o,
    controlOverrides: t.controlOverrides && typeof t.controlOverrides == "object" ? t.controlOverrides : {}
  };
}
const Cs = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Controls", num: "03" },
  { key: "review", label: "Review", num: "04" }
], Bs = { N: "North", E: "East", S: "South", W: "West" }, Rs = 4, Es = [2, 4, 6, 8], ur = (e, t) => e + t * 7919 >>> 0, On = () => Math.floor(Math.random() * 4294967295) + 1 >>> 0;
function pr(e, t) {
  return {
    boardNo: t,
    seed: e,
    dealer: Oa(t),
    humanSeat: "S",
    vul: Ur(t),
    hands: Ze(e),
    edited: !1
  };
}
function Ts(e) {
  const t = {};
  for (const o of ["N", "E", "S", "W"]) t[o] = cs(e[o]);
  return t;
}
function Ws(e) {
  var t;
  return (t = e == null ? void 0 : e.boards) != null && t.length ? e.boards.map((o, r) => {
    let l = Ze(o.seed), c = !1;
    if (o.pack) {
      const i = to(o.pack);
      "error" in i || (l = i.hands, c = !0);
    }
    return {
      boardNo: r + 1,
      seed: o.seed,
      dealer: o.dealer,
      humanSeat: o.humanSeat,
      vul: o.vul ?? Ur(r + 1),
      hands: l,
      edited: c
    };
  }) : null;
}
function pd({
  draft: e,
  onCreate: t,
  onChange: o,
  createLabel: r = "Create challenge",
  seedBase: l,
  isolate: c,
  fontFamily: i
}) {
  const a = oe(ei(e) ?? void 0).current, s = oe(l ?? On()), [h, b] = V("basics"), [p, g] = V((a == null ? void 0 : a.title) ?? ""), [S, u] = V((a == null ? void 0 : a.description) ?? ""), [m, y] = V(
    (a == null ? void 0 : a.format) === "bidding-only" ? "bidding-only" : "full"
  ), [$, H] = V((a == null ? void 0 : a.scoring) ?? "imps"), [L, w] = V(
    () => Ws(a) ?? Array.from({ length: Rs }, (v, _) => pr(ur(s.current, _ + 1), _ + 1))
  ), [z, x] = V(() => {
    const v = Ss();
    for (const [_, Z] of Object.entries((a == null ? void 0 : a.controlOverrides) ?? {})) v[_] = Z;
    return v;
  }), [D, O] = V(""), [k, C] = V(null), [E, X] = V(null), [A, j] = V(null), K = oe({}), ee = (v) => {
    var _;
    b(v), (_ = K.current[v]) == null || _.scrollIntoView({ behavior: "smooth", block: "start" });
  }, T = (v) => (_) => {
    K.current[v] = _;
  }, F = (v) => {
    const _ = Math.max(ct, Math.min(Ae, Math.round(v)));
    w(
      (Z) => Array.from({ length: _ }, (de, ae) => Z[ae] ?? pr(ur(s.current, ae + 1), ae + 1))
    );
  }, q = (v, _) => w((Z) => Z.map((de, ae) => ae === v ? { ...de, ..._ } : de)), B = (v) => w(
    (_) => _.map((Z, de) => {
      if (de !== v) return Z;
      const ae = On();
      return { ...Z, seed: ae, hands: Ze(ae), edited: !1 };
    })
  ), I = () => {
    const v = D.split(/\n+/).map((Z) => Z.trim()).filter(Boolean);
    if (!v.length)
      return C("Paste a BBO hand link first."), null;
    const _ = [];
    for (const Z of v) {
      const de = Jr(Z);
      if (!de.ok)
        return C(de.error), null;
      for (const ae of de.boards)
        _.push({
          boardNo: 0,
          // renumbered by position below
          seed: On(),
          dealer: ae.dealer,
          humanSeat: "S",
          vul: ae.vul,
          hands: ae.hands,
          edited: !0
        });
    }
    return _;
  }, M = (v) => {
    const _ = I();
    if (!_) return;
    const Z = Ae - (v === "replace" ? 0 : L.length);
    w((ae) => [...v === "replace" ? [] : ae, ..._].slice(0, Ae).map((Re, De) => ({ ...Re, boardNo: De + 1 }))), C(null), O("");
    const de = Math.min(_.length, Math.max(0, Z));
    X(
      de < _.length ? `Took ${de} of ${_.length} — a challenge holds ${Ae} boards.` : `${de} board${de === 1 ? "" : "s"} from BBO.`
    );
  }, te = ue(() => {
    const v = (Z) => Z === "hide" ? "hidden" : Z === "show" ? "shown" : "platform", _ = Object.keys(hr(z)).length;
    return `Hands ${v(z["table.hands_view"])} · Undo ${v(
      z["table.undo"]
    )} · ${_} override${_ === 1 ? "" : "s"}`;
  }, [z]), ne = [...new Set(L.map((v) => v.humanSeat))], le = Jn.find((v) => v.key === m), G = Vn.find((v) => v.key === $), ie = m === "bidding-only", N = ie ? le.label : G.label, W = `${L.length}-board ${N}`, U = p.trim().length > 0, P = U ? p.trim() : W, re = () => ({
    title: P,
    description: S.trim(),
    format: m,
    scoring: $,
    boards: L.map((v) => ({
      boardNo: v.boardNo,
      seed: v.seed,
      dealer: v.dealer,
      humanSeat: v.humanSeat,
      vul: v.vul,
      ...v.edited ? { pack: Ts(v.hands) } : {}
    })),
    controlOverrides: hr(z)
  }), Y = JSON.stringify(re());
  xe(() => {
    o && o(JSON.parse(Y));
  }, [Y]);
  const fe = () => {
    const v = re(), _ = $s(v);
    if (_.length) {
      j(_[0]), ee("review");
      return;
    }
    j(null), t(v);
  };
  return /* @__PURE__ */ d("div", { style: { ...Zt({ isolate: c, fontFamily: i }), ...us, display: "flex", flexDirection: "column", minWidth: 0 }, children: [
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          background: ye,
          borderBottom: `1px solid ${ge}`,
          paddingBottom: 8
        },
        children: [
          /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }, children: [
            /* @__PURE__ */ n(
              "span",
              {
                style: {
                  display: "flex",
                  width: 24,
                  height: 24,
                  flex: "none",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 7,
                  background: Ce,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 900
                },
                children: "+"
              }
            ),
            /* @__PURE__ */ d("div", { style: { minWidth: 0, flex: 1 }, children: [
              /* @__PURE__ */ n("div", { style: { fontSize: 14, fontWeight: 800, lineHeight: 1.2 }, children: "Create challenge" }),
              /* @__PURE__ */ n("div", { style: { fontSize: 11, color: he }, children: "Your boards · your seat · BEN in the other three" })
            ] })
          ] }),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }, children: Cs.map((v) => /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => ee(v.key),
              style: {
                flex: "none",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${h === v.key ? Ce : ge}`,
                background: h === v.key ? Ce : ye,
                color: h === v.key ? "#fff" : be,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: h === v.key ? 800 : 600,
                cursor: "pointer"
              },
              children: v.label
            },
            v.key
          )) })
        ]
      }
    ),
    /* @__PURE__ */ d(Lt, { innerRef: T("basics"), num: "01", title: "Basics", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: be, lineHeight: 1.5 }, children: "Name it, pick what a board asks for, and how many boards." }),
      /* @__PURE__ */ n(ot, { children: "Title" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge title",
          value: p,
          onChange: (v) => g(v.target.value),
          placeholder: W,
          style: Yt
        }
      ),
      /* @__PURE__ */ n("p", { style: { margin: "6px 0 0", fontSize: 11, color: he }, children: U ? "The learner sees this above the board." : `Optional — left blank it is called “${W}.”` }),
      /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "Description" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge description",
          value: S,
          onChange: (v) => u(v.target.value),
          placeholder: "One line the learner sees before starting",
          style: { ...Yt, height: 36, fontSize: 12.5 }
        }
      ),
      /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "What a board asks" }),
      /* @__PURE__ */ n(
        rr,
        {
          ariaLabel: "What a board asks",
          options: Jn.map((v) => ({ key: v.key, label: v.label })),
          value: m,
          onChange: y
        }
      ),
      /* @__PURE__ */ n(nr, { children: le.note }),
      !ie && /* @__PURE__ */ d(me, { children: [
        /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "Scoring" }),
        /* @__PURE__ */ n(
          rr,
          {
            ariaLabel: "Scoring",
            options: Vn.map((v) => ({ key: v.key, label: v.label })),
            value: $,
            onChange: H
          }
        ),
        /* @__PURE__ */ n(nr, { children: G.note })
      ] }),
      /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "Boards" }),
      /* @__PURE__ */ n(As, { count: L.length, onCount: F }),
      /* @__PURE__ */ d("p", { style: { margin: "8px 0 0", fontSize: 11, color: he, lineHeight: 1.5 }, children: [
        ct,
        "–",
        Ae,
        " boards. Vulnerability follows the standard board cycle; dealer and the learner's seat are per-board below."
      ] })
    ] }),
    /* @__PURE__ */ d(
      Lt,
      {
        innerRef: T("boards"),
        num: "02",
        title: "Boards",
        aside: `${L.length} board${L.length === 1 ? "" : "s"}`,
        children: [
          /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: be, lineHeight: 1.5 }, children: "Each board is a random deal. Re-roll for a new one, paste a BBO hand link, or open the pack editor to set the cards by hand." }),
          /* @__PURE__ */ d(
            "div",
            {
              style: {
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${ge}`,
                background: $e
              },
              children: [
                /* @__PURE__ */ n(ot, { children: "From BBO" }),
                /* @__PURE__ */ n(
                  "textarea",
                  {
                    value: D,
                    onChange: (v) => O(v.target.value),
                    rows: 2,
                    placeholder: "Paste Hand Viewer links, one per line",
                    "aria-label": "BBO hand links",
                    style: {
                      ...Yt,
                      height: "auto",
                      padding: 8,
                      resize: "vertical",
                      fontSize: 12,
                      lineHeight: 1.4
                    }
                  }
                ),
                /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }, children: [
                  /* @__PURE__ */ n(
                    "button",
                    {
                      type: "button",
                      onClick: () => M("add"),
                      disabled: !D.trim(),
                      style: {
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: 0,
                        background: D.trim() ? "#22302a" : "#e4ebe7",
                        color: D.trim() ? "#fff" : he,
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: D.trim() ? "pointer" : "default"
                      },
                      children: "Add boards"
                    }
                  ),
                  /* @__PURE__ */ n(
                    "button",
                    {
                      type: "button",
                      onClick: () => M("replace"),
                      disabled: !D.trim(),
                      style: {
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: `1px solid ${ge}`,
                        background: ye,
                        color: D.trim() ? be : he,
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: D.trim() ? "pointer" : "default"
                      },
                      children: "Replace all"
                    }
                  )
                ] }),
                k && /* @__PURE__ */ n(or, { children: k }),
                !k && E && /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11.5, color: Ce }, children: E }),
                /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11, color: he, lineHeight: 1.5 }, children: "An imported board keeps its own dealer and vulnerability. The auction and play in the link are ignored — the learner bids it themselves." })
              ]
            }
          ),
          /* @__PURE__ */ n(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
                gap: 10
              },
              children: L.map((v, _) => /* @__PURE__ */ n(
                xs,
                {
                  board: v,
                  onChange: (Z) => q(_, Z),
                  onReroll: () => B(_)
                },
                v.boardNo
              ))
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ d(Lt, { innerRef: T("controls"), num: "03", title: "Table controls", children: [
      /* @__PURE__ */ d("p", { style: { margin: "0 0 12px", fontSize: 12, color: be, lineHeight: 1.5 }, children: [
        "Override the table's own controls for this challenge, in both directions. ",
        /* @__PURE__ */ n("b", { children: "Undo" }),
        " and",
        " ",
        /* @__PURE__ */ n("b", { children: "show-all-hands" }),
        " are off by default: this is scored play."
      ] }),
      /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: nn.map((v) => {
        const _ = z[v.key] ?? "default";
        return /* @__PURE__ */ d(
          "div",
          {
            style: {
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${ge}`,
              background: ye
            },
            children: [
              /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                /* @__PURE__ */ d("div", { style: { minWidth: 0, flex: 1 }, children: [
                  /* @__PURE__ */ n("div", { style: { fontSize: 12.5, fontWeight: 700 }, children: v.label }),
                  /* @__PURE__ */ n("div", { style: { fontSize: 11, color: he }, children: v.sub })
                ] }),
                /* @__PURE__ */ n(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flex: "none",
                      gap: 2,
                      padding: 2,
                      borderRadius: 8,
                      background: "#f1f4f2"
                    },
                    children: ks.map((Z) => {
                      const de = _ === Z.key;
                      return /* @__PURE__ */ n(
                        "button",
                        {
                          type: "button",
                          onClick: () => x((ae) => ({ ...ae, [v.key]: Z.key })),
                          style: {
                            padding: "5px 9px",
                            borderRadius: 6,
                            border: 0,
                            background: de ? Z.key === "show" ? "#1c8a5a" : Z.key === "hide" ? "#c0392b" : Ce : "transparent",
                            color: de ? "#fff" : he,
                            fontFamily: "inherit",
                            fontSize: 10.5,
                            fontWeight: de ? 800 : 600,
                            cursor: "pointer"
                          },
                          children: Z.label
                        },
                        Z.key
                      );
                    })
                  }
                )
              ] }),
              v.note && /* @__PURE__ */ n(ps, { children: v.note })
            ]
          },
          v.key
        );
      }) }),
      /* @__PURE__ */ n("p", { style: { margin: "10px 0 0", fontSize: 11.5, color: he }, children: te })
    ] }),
    /* @__PURE__ */ d(Lt, { innerRef: T("review"), num: "04", title: "Review & create", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: be, lineHeight: 1.5 }, children: ie ? "BEN bids every board silently while the learner bids it — that auction is the one theirs is set beside. It needs no card play, so it is quick." : "BEN plays every board silently while the learner plays it, and the two results are set side by side." }),
      A && /* @__PURE__ */ n(or, { children: A }),
      /* @__PURE__ */ d(
        "dl",
        {
          style: {
            margin: "0 0 12px",
            overflow: "hidden",
            borderRadius: 10,
            border: `1px solid ${ge}`,
            background: ye
          },
          children: [
            /* @__PURE__ */ n(Ve, { k: "Title", v: U ? P : `${P} — auto-named` }),
            /* @__PURE__ */ n(Ve, { k: "Format", v: le.review }),
            /* @__PURE__ */ n(
              Ve,
              {
                k: "Scoring",
                v: ie ? "Matched BEN's contract, board by board — no play score" : G.full
              }
            ),
            /* @__PURE__ */ n(
              Ve,
              {
                k: "Boards",
                v: `${L.length} · ${L.filter((v) => v.edited).length} hand-set`
              }
            ),
            /* @__PURE__ */ n(
              Ve,
              {
                k: "The seat",
                v: ne.length === 1 && ne[0] ? `${Bs[ne[0]]} on every board` : `Mixed (${ne.join(", ")})`
              }
            ),
            /* @__PURE__ */ n(Ve, { k: "Controls", v: te }),
            /* @__PURE__ */ n(
              Ve,
              {
                k: "Opponents",
                v: ie ? "3 BEN robots · BEN's own auction is the reference" : "3 BEN robots · a silent BEN line is the reference",
                last: !0
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ n(gs, { onClick: fe, children: r }),
      /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", textAlign: "center", fontSize: 11.5, color: he }, children: "Solo — one learner, three robots, no field" })
    ] }),
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderTop: `1px solid ${ge}`,
          background: ye
        },
        children: [
          /* @__PURE__ */ d("div", { style: { minWidth: 0, flex: 1 }, children: [
            /* @__PURE__ */ n(
              "div",
              {
                style: {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 700
                },
                children: P
              }
            ),
            /* @__PURE__ */ d("div", { style: { fontSize: 11, color: he }, children: [
              L.length,
              " board",
              L.length === 1 ? "" : "s",
              " · ",
              N,
              " · solo"
            ] })
          ] }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: fe,
              style: {
                flex: "none",
                height: 40,
                padding: "0 18px",
                borderRadius: 9,
                border: 0,
                background: Ce,
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer"
              },
              children: r
            }
          )
        ]
      }
    )
  ] });
}
function As({
  count: e,
  onCount: t
}) {
  const o = (r) => t(e + r);
  return /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }, children: [
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          display: "flex",
          overflow: "hidden",
          alignItems: "center",
          borderRadius: 8,
          border: `1px solid ${ge}`,
          background: ye
        },
        children: [
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(-1),
              disabled: e <= ct,
              "aria-label": "One board fewer",
              style: gr(e <= ct),
              children: "−"
            }
          ),
          /* @__PURE__ */ n("span", { style: { minWidth: 46, textAlign: "center", fontSize: 18, fontWeight: 800 }, children: e }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(1),
              disabled: e >= Ae,
              "aria-label": "One board more",
              style: gr(e >= Ae),
              children: "+"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Es.map((r) => /* @__PURE__ */ n(bt, { tone: e === r ? "accent" : "plain", onClick: () => t(r), children: r }, r)) })
  ] });
}
const gr = (e) => ({
  width: 40,
  height: 40,
  border: 0,
  background: $e,
  color: e ? he : je,
  fontFamily: "inherit",
  fontSize: 18,
  fontWeight: 800,
  cursor: e ? "default" : "pointer",
  opacity: e ? 0.5 : 1
}), Is = 400;
async function Hs(e) {
  const { hands: t, dealer: o, vul: r, humanSeat: l, biddingOnly: c, decide: i, cancelled: a } = e;
  let s = St("ben-reference", o, r, t);
  for (let h = 0; h < Is; h++) {
    if (a()) return null;
    if (Yr(s.phase, c)) break;
    const b = s.turn;
    let p;
    try {
      p = await i(s, b);
    } catch {
      return null;
    }
    if (a() || !p) return null;
    if (s.phase === "auction" && p.call) {
      if (!Xe(s.auction, b).has(p.call)) return null;
      s = _e(s, {
        category: "bid-event",
        boardRef: s.boardRef,
        seat: b,
        call: p.call
      });
      continue;
    }
    if (s.phase === "play" && p.card) {
      const g = p.card;
      if (!Gt(s, b).some((S) => S.suit === g.suit && S.rank === g.rank))
        return null;
      s = _e(s, {
        category: "play-event",
        boardRef: s.boardRef,
        seat: b,
        card: g
      });
      continue;
    }
    return null;
  }
  return ti(s, l, c);
}
function ti(e, t, o) {
  const r = o ? null : wr(e), l = r ? t === "N" || t === "S" ? r.nsScore : -r.nsScore : void 0;
  return {
    contract: e.contract ?? null,
    ...e.contract ? { contractLabel: Zi(e.contract) } : {},
    ...r ? { resultLabel: Nr(r) } : {},
    ...l === void 0 ? {} : { rawScore: l }
  };
}
const Ln = "·", Qe = "—", zs = "BEN", Ms = "YOU";
function br(e, t, o) {
  return e === "imps" ? Fa(t - o) : e === "total" ? t - o : t > o ? 100 : t === o ? 50 : 0;
}
function Ds(e, t) {
  return e === "bidding-only" ? { label: "vs BEN", name: "Contract vs BEN" } : t === "mp" ? { label: "MP %", name: "Matchpoints vs BEN" } : t === "total" ? { label: "Pts", name: "Points vs BEN" } : { label: "IMPs", name: "IMPs vs BEN" };
}
function Os(e, t) {
  return !e || !t || t.contract === void 0 ? "unrated" : _a(e.contract, t.contract) ? "matched" : "differed";
}
function yr(e) {
  if (!e) return Qe;
  const t = e.resultLabel || e.contractLabel || Qe, o = e.rawScore;
  return typeof o == "number" ? `${t} (${o > 0 ? "+" : ""}${o})` : t;
}
function Ls(e, t) {
  const o = e == null ? void 0 : e.contract, r = t == null ? void 0 : t.contract;
  return o != null && r != null ? o.declarer === r.declarer : o === null && r === null;
}
function Ps(e) {
  const { format: t, scoring: o, boardsTotal: r, outcomes: l, currentBoardNo: c } = e, i = t === "bidding-only", a = Ds(t, o), s = new Map(l.map((O) => [O.boardNo, O])), h = Array.from({ length: r }, (O, k) => k + 1), b = [
    { key: Ms, label: "You", name: "You", isYou: !0 },
    { key: zs, label: "BEN", name: "BEN", isBenchmark: !0 }
  ], p = [], g = [], S = {};
  let u = 0, m = 0, y = 0;
  const $ = [];
  for (const O of h) {
    const k = s.get(O), C = k == null ? void 0 : k.you, E = k == null ? void 0 : k.ben, X = !!C;
    X && (u += 1);
    let A = { text: "" }, j = { text: "" }, K, ee, T;
    if (i) {
      const F = Os(C, E);
      F !== "unrated" && X && (m += 1), F === "matched" && (y += 1), A = X ? {
        text: zn(C == null ? void 0 : C.contract),
        ...F === "matched" ? { value: 1 } : {},
        tone: Mn(F)
      } : { text: "" }, j = { text: E ? zn(E.contract) : "" }, X && (K = zn(C == null ? void 0 : C.contract), F === "matched" && (ee = 1), T = Mn(F), S[O] = {
        headline: Ka(F, Ls(C, E)),
        sub: E === void 0 ? k != null && k.benFailed ? "BEN could not bid this board" : "BEN is still bidding this board" : `You: ${er(C == null ? void 0 : C.contract)} ${Ln} BEN: ${er(E.contract)}`,
        tone: Mn(F)
      });
    } else {
      const F = C == null ? void 0 : C.rawScore, q = E == null ? void 0 : E.rawScore, B = typeof F == "number" && typeof q == "number";
      if (B) {
        m += 1;
        const I = br(o, F, q);
        $.push(I);
        const M = o === "mp" ? 50 : 0;
        I >= M && (y += 1), A = {
          text: Zo(o, I),
          value: Math.round(I),
          tone: I > M ? "pos" : I < M ? "neg" : "neutral"
        }, K = A.text, ee = A.value, T = A.tone;
      } else X && (A = { text: Qe }, K = Qe, T = "neutral");
      j = { text: typeof q == "number" ? `${q > 0 ? "+" : ""}${q}` : "" }, X && (S[O] = {
        headline: B ? `${Zo(o, br(o, F, q))} ${a.label}` : E === void 0 ? k != null && k.benFailed ? "BEN could not play this board" : "BEN is still playing this board" : Qe,
        sub: `You: ${yr(C)}` + (typeof q == "number" ? ` ${Ln} BEN: ${yr(E)}` : ""),
        tone: B ? A.tone ?? "neutral" : "neutral"
      });
    }
    p.push({ boardNo: O, cells: [A, j] }), g.push({
      boardNo: O,
      state: X ? "done" : O === c ? "current" : "todo",
      ...K === void 0 ? {} : { score: K },
      ...ee === void 0 ? {} : { value: ee },
      ...T === void 0 ? {} : { tone: T },
      disabled: !X
    });
  }
  const H = u === r && r > 0;
  let L, w, z, x;
  if (i)
    w = y, L = m === 0 ? Qe : `${y}/${m}`, z = m > 0 && y === m ? "pos" : "neutral", x = m === 0 ? "BEN has not bid any of these boards yet" : `Reached BEN's contract on ${y} of ${m} board${m === 1 ? "" : "s"}`;
  else {
    const O = $.reduce((C, E) => C + E, 0);
    w = $.length === 0 ? 0 : o === "mp" ? O / $.length : O, L = $.length === 0 ? Qe : ja(o, w);
    const k = o === "mp" ? 50 : 0;
    z = $.length === 0 ? "neutral" : w > k ? "pos" : w < k ? "neg" : "neutral", x = $.length === 0 ? "BEN has not played any of these boards yet" : w > k ? `Ahead of BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : w < k ? `Behind BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : `Level with BEN over ${$.length} board${$.length === 1 ? "" : "s"}`;
  }
  const D = [
    { text: L, ...z === "neutral" ? {} : { tone: z } },
    { text: "" }
  ];
  return {
    unitLabel: a.label,
    unitName: a.name,
    subtitle: `${r} board${r === 1 ? "" : "s"} ${Ln} ${a.name}`,
    headline: { text: L, sub: x, tone: z },
    columns: b,
    rows: p,
    totals: D,
    squares: g,
    details: S,
    mark: {
      boardsTotal: r,
      boardsDone: u,
      completed: H,
      boardsWon: y,
      rated: m,
      scoreText: L,
      scoreValue: w,
      percent: m === 0 ? 0 : Math.round(y / m * 100)
    }
  };
}
function Fs(e) {
  return e.boards.map((t, o) => {
    let r = Ze(t.seed);
    if (t.pack) {
      const l = to(t.pack);
      "error" in l || (r = l.hands);
    }
    return {
      boardNo: o + 1,
      seed: t.seed,
      dealer: t.dealer,
      humanSeat: t.humanSeat,
      vul: t.vul ?? "none",
      hands: r
    };
  });
}
function gd({
  draft: e,
  decide: t,
  height: o = 520,
  appearance: r,
  robotDelayMs: l = 350,
  benReference: c = !0,
  onProgress: i,
  onComplete: a
}) {
  var q;
  const s = ue(
    () => ei(e) ?? {
      title: "",
      description: "",
      scoring: "imps",
      boards: [],
      controlOverrides: {}
    },
    [e]
  ), h = ue(() => Fs(s), [s]), b = Kr(s), p = Da(s), { showAllHands: g } = vs(s.controlOverrides), [S, u] = V(0), [m, y] = V({}), [$, H] = V(!1), [L, w] = V(!0), z = oe(null), x = h[Math.min(S, h.length - 1)], D = x ? !!((q = m[x.boardNo]) != null && q.you) : !1;
  xe(() => {
    const B = z.current;
    if (!B) return;
    const I = () => {
      const te = B.clientWidth || 390, ne = B.clientHeight || 844;
      w(te / Math.max(1, ne) < 1.25 && te < 640);
    };
    I();
    const M = new ResizeObserver(I);
    return M.observe(B), () => M.disconnect();
  }, []);
  const O = oe(/* @__PURE__ */ new Map()), k = ue(() => {
    if (t)
      return async (B, I) => {
        var le, G;
        const M = `${B.dealer}|${I}|${Pa({
          dealer: B.dealer,
          auction: B.auction.map((ie) => ({ seat: ie.seat, call: ie.call })),
          play: B.tricks.flatMap((ie) => ie.plays.map((N) => ({ seat: N.seat, card: N.card })))
        })}|${B.hands[I].length}|${((le = B.hands[I][0]) == null ? void 0 : le.suit) ?? ""}${((G = B.hands[I][0]) == null ? void 0 : G.rank) ?? ""}`, te = O.current.get(M);
        if (te) return await te;
        const ne = Promise.resolve(t(B, I));
        O.current.set(M, ne);
        try {
          const ie = await ne;
          return ie || O.current.delete(M), ie;
        } catch (ie) {
          throw O.current.delete(M), ie;
        }
      };
  }, [t]);
  xe(() => {
    var I, M;
    if (!c || !k || !x || (I = m[x.boardNo]) != null && I.ben || (M = m[x.boardNo]) != null && M.benFailed) return;
    let B = !1;
    return (async () => {
      const te = await Hs({
        hands: x.hands,
        dealer: x.dealer,
        vul: x.vul,
        humanSeat: x.humanSeat,
        biddingOnly: p,
        decide: k,
        cancelled: () => B
      });
      B || y((ne) => ({
        ...ne,
        [x.boardNo]: {
          boardNo: x.boardNo,
          ...ne[x.boardNo],
          ...te ? { ben: te } : { benFailed: !0 }
        }
      }));
    })(), () => {
      B = !0;
    };
  }, [c, k, x == null ? void 0 : x.boardNo, p]);
  const C = Me(
    (B) => {
      x && y(
        (I) => {
          var M;
          return (M = I[x.boardNo]) != null && M.you ? I : {
            ...I,
            [x.boardNo]: {
              boardNo: x.boardNo,
              ...I[x.boardNo],
              you: ti(B, x.humanSeat, p)
            }
          };
        }
      );
    },
    [x, p]
  ), E = Me(
    (B) => {
      Yr(B.phase, p) && C(B);
    },
    [p, C]
  ), X = ue(
    () => Ps({
      format: b,
      scoring: s.scoring,
      boardsTotal: h.length,
      outcomes: Object.values(m),
      ...x ? { currentBoardNo: x.boardNo } : {}
    }),
    [b, s.scoring, h.length, m, x]
  ), A = JSON.stringify(X.mark), j = oe(""), K = oe(!1);
  xe(() => {
    if (j.current === A) return;
    j.current = A;
    const B = JSON.parse(A);
    i == null || i(B), B.completed && !K.current && (K.current = !0, a == null || a(B));
  }, [A]);
  const ee = X.squares.map((B) => ({
    boardNo: B.boardNo,
    text: B.score ?? "",
    ...B.value === void 0 ? {} : { value: B.value },
    ...B.tone === void 0 ? {} : { tone: B.tone },
    current: (x == null ? void 0 : x.boardNo) === B.boardNo
  })), T = S >= h.length - 1, F = x ? X.details[x.boardNo] : void 0;
  return x ? /* @__PURE__ */ d(
    "div",
    {
      ref: z,
      style: {
        position: "relative",
        height: o,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#0e1a1c"
      },
      children: [
        /* @__PURE__ */ n(
          ha,
          {
            title: s.title || "Challenge",
            boardNo: x.boardNo,
            boardsTotal: h.length,
            showResults: X.mark.boardsDone > 0,
            height: Xr,
            onResults: () => H(!0)
          }
        ),
        /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative" }, children: D ? /* @__PURE__ */ n(
          Xs,
          {
            boardNo: x.boardNo,
            boardsTotal: h.length,
            headline: (F == null ? void 0 : F.headline) ?? "",
            sub: (F == null ? void 0 : F.sub) ?? "",
            tone: (F == null ? void 0 : F.tone) ?? "neutral",
            last: T,
            onNext: () => u((B) => B + 1),
            onResults: () => H(!0)
          }
        ) : /* @__PURE__ */ n(
          Ca,
          {
            deal: x.hands,
            seed: x.seed,
            dealer: x.dealer,
            vul: x.vul,
            humanSeat: x.humanSeat,
            showAllHands: g,
            robotDelayMs: l,
            ...r ? { appearance: r } : {},
            ...k ? { decide: k } : {},
            onState: E
          },
          `${x.boardNo}:${x.seed}`
        ) }),
        /* @__PURE__ */ n(
          Sa,
          {
            open: $,
            onClose: () => H(!1),
            boards: ee,
            viewportPhone: L,
            subtitle: X.subtitle,
            children: /* @__PURE__ */ n(_s, { view: X })
          }
        )
      ]
    }
  ) : /* @__PURE__ */ n("div", { style: { fontFamily: tn, padding: 16, color: be }, children: "This challenge has no boards yet." });
}
function _s({ view: e }) {
  return /* @__PURE__ */ d("div", { style: { fontFamily: tn }, children: [
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "10px 8px 12px"
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 28, fontWeight: 800, color: He(e.headline.tone) }, children: e.headline.text }),
          /* @__PURE__ */ d("div", { style: { minWidth: 0 }, children: [
            /* @__PURE__ */ n("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#8b9a93" }, children: e.unitLabel.toUpperCase() }),
            /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: "#5c6b64" }, children: e.headline.sub })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ n(wa, { columns: e.columns, rows: e.rows, totals: e.totals }),
    /* @__PURE__ */ n("div", { style: { marginTop: 10, fontSize: 10.5, color: "#a2ada7", lineHeight: 1.5 }, children: "Solo — there is no field. Every figure is your board set beside BEN's on the same deal, and a different contract is a difference, not a mistake." })
  ] });
}
function Xs({
  boardNo: e,
  boardsTotal: t,
  headline: o,
  sub: r,
  tone: l,
  last: c,
  onNext: i,
  onResults: a
}) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#0e1a1c",
        fontFamily: tn
      },
      children: /* @__PURE__ */ d(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: 380,
            padding: 16,
            borderRadius: 14,
            background: ye,
            color: je,
            boxShadow: "0 18px 48px rgba(0,0,0,.42)"
          },
          children: [
            /* @__PURE__ */ d(
              "div",
              {
                style: {
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: he
                },
                children: [
                  "Board ",
                  e,
                  " of ",
                  t,
                  " · done"
                ]
              }
            ),
            /* @__PURE__ */ n("div", { style: { marginTop: 6, fontSize: 19, fontWeight: 800, color: He(l) }, children: o || "Board complete" }),
            /* @__PURE__ */ n("div", { style: { marginTop: 6, fontSize: 12.5, color: be, lineHeight: 1.5 }, children: r }),
            /* @__PURE__ */ d("div", { style: { display: "flex", gap: 8, marginTop: 14 }, children: [
              /* @__PURE__ */ n(
                "button",
                {
                  type: "button",
                  onClick: a,
                  style: {
                    flex: "none",
                    height: 42,
                    padding: "0 14px",
                    borderRadius: 9,
                    border: `1px solid ${ge}`,
                    background: $e,
                    color: be,
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer"
                  },
                  children: "Results"
                }
              ),
              !c && /* @__PURE__ */ n(
                "button",
                {
                  type: "button",
                  onClick: i,
                  style: {
                    flex: 1,
                    height: 42,
                    borderRadius: 9,
                    border: 0,
                    background: Ce,
                    color: "#fff",
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer"
                  },
                  children: "Next board →"
                }
              )
            ] }),
            /* @__PURE__ */ n("div", { style: { marginTop: 8, fontSize: 11, color: he }, children: c ? `All ${t} board${t === 1 ? "" : "s"} played` : `${t - e} board${t - e === 1 ? "" : "s"} left` })
          ]
        }
      )
    }
  );
}
const js = ["S", "H", "D", "C"], Ks = { N: "S", S: "N", E: "W", W: "E" }, Ys = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};
function ni(e) {
  return e === 10 ? "T" : yt(e);
}
function Ft(e) {
  return js.map(
    (t) => e.filter((o) => o.suit === t).sort((o, r) => r.rank - o.rank).map((o) => ni(o.rank)).join("")
  ).join(".");
}
function Us(e) {
  return e === "P" ? "--" : e === "X" ? "Db" : e === "XX" ? "Rd" : e;
}
function Gs(e) {
  return e.map((t) => Us(t.call)).join("");
}
function Js(e) {
  return e === "both" ? "@v@V" : e === "ns" ? "@v" : e === "ew" ? "@V" : "";
}
function Vs(e) {
  return e.tricks.flatMap((t) => t.plays).map((t) => `${t.card.suit}${ni(t.card.rank)}`).join("");
}
function _t(e, t) {
  return [
    ...e.hands[t],
    ...e.tricks.flatMap(
      (o) => o.plays.filter((r) => r.seat === t).map((r) => r.card)
    )
  ];
}
function Qs(e) {
  const t = e.trim().toUpperCase();
  if (t === "PASS" || t === "P" || t === "--" || t === "PA") return "P";
  if (t === "X" || t === "DB" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RD" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = /^([1-7])(NT|N|C|D|H|S)$/.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function qs(e) {
  const t = /^([SHDC])([2-9TJQKA])$/.exec(e.trim().toUpperCase());
  return t ? { suit: t[1], rank: Ys[t[2]] } : null;
}
function bd({
  endpoint: e,
  timeoutMs: t = 6e4,
  fetchImpl: o,
  onProblem: r
}) {
  const l = e.replace(/\/$/, ""), c = o ?? ((...a) => fetch(...a)), i = async (a, s) => {
    const h = `${l}${a}?${new URLSearchParams({ ...s, details: "true" })}`, b = new AbortController(), p = setTimeout(() => b.abort(), t);
    try {
      const g = await c(h, { signal: b.signal });
      if (!g.ok) throw new Error(`HTTP ${g.status}`);
      return await g.json();
    } finally {
      clearTimeout(p);
    }
  };
  return async (a, s) => {
    var p;
    const h = Js(a.vul), b = Gs(a.auction);
    try {
      if (a.phase === "auction") {
        const g = await i("/bid", {
          hand: Ft(_t(a, s)),
          seat: s,
          dealer: a.dealer,
          vul: h,
          ctx: b
        }), S = typeof g.bid == "string" ? g.bid : "", u = Qs(S);
        return Xe(a.auction, s).has(u) ? { call: u } : (r == null || r(`BEN answered "${S}" for ${s}, which is not legal here`), null);
      }
      if (a.phase === "play") {
        const g = Vs(a), S = ((p = a.contract) == null ? void 0 : p.declarer) ?? null, u = S ? Ks[S] : null, m = s === u && S ? S : s, y = g === "" ? await i("/lead", {
          hand: Ft(_t(a, s)),
          seat: s,
          dealer: a.dealer,
          vul: h,
          ctx: b
        }) : await i("/play", {
          hand: Ft(_t(a, m)),
          dummy: u ? Ft(_t(a, u)) : "",
          seat: m,
          dealer: a.dealer,
          vul: h,
          ctx: b,
          played: g
        }), $ = typeof y.card == "string" ? y.card : "", H = qs($);
        return H ? Gt(a, s).some((w) => w.suit === H.suit && w.rank === H.rank) ? { card: H } : (r == null || r(`BEN's ${$} is not legal for ${s} here`), null) : (r == null || r(`BEN answered "${$}" for ${s}, which is not a card`), null);
      }
      return null;
    } catch (g) {
      return r == null || r(`BEN could not be reached (${g.message})`), null;
    }
  };
}
const Zs = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2
};
function Xt(e, t) {
  return t.split(/\s+/).filter(Boolean).map((o) => {
    const r = Zs[o.toUpperCase()];
    if (!r) throw new Error(`"${o}" is not a rank (suit ${e})`);
    return { suit: e, rank: r };
  });
}
const se = (e, t, o, r) => [
  ...Xt("S", e),
  ...Xt("H", t),
  ...Xt("D", o),
  ...Xt("C", r)
];
function oi(e) {
  return e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
}
const ri = [
  { no: 1, hand: se("A K 5 4 3", "K 8 2", "Q 7 3", "5 4"), bid: "1S", why: "12 HCP, 5-card spade suit" },
  { no: 2, hand: se("9 4", "A K J T 5 3", "K 8 2", "7 3"), bid: "1H", why: "11 HCP, 6-card heart suit" },
  { no: 3, hand: se("K J 2", "Q 5 4", "A K T 8 3", "6 2"), bid: "1D", why: "13 HCP, 5-card diamond suit" },
  { no: 4, hand: se("A K 3", "Q J 4", "K 8 5", "A T 6 2"), bid: "1N", why: "17 HCP, balanced 4-3-3-3 shape" },
  { no: 5, hand: se("A K Q J", "A K Q", "A K 4", "K J 2"), bid: "2C", why: "30 HCP, strong artificial opening" },
  { no: 6, hand: se("7", "K J T 8 6 3", "9 5 4 2", "A 8"), bid: "2H", why: "8 HCP, weak two in hearts" },
  { no: 7, hand: se("9 4 3", "8 5 2", "K T 4", "J 8 7 3"), bid: "P", why: "4 HCP, too weak to open" },
  { no: 8, hand: se("A Q J T 8", "4 3", "K 5 2", "A 7 3"), bid: "1S", why: "14 HCP, 5-card spade suit" },
  { no: 9, hand: se("Q 5 4 2", "A J 4", "K J 6", "A Q 3"), bid: "1N", why: "17 HCP, balanced distribution" },
  { no: 10, hand: se("5 4", "A K Q J 7", "Q 8 4 3", "K 5"), bid: "1H", why: "15 HCP, 5-card heart suit" },
  { no: 11, hand: se("A J 2", "8 4", "A K Q J 5", "7 4 2"), bid: "1D", why: "15 HCP, 5-card diamond suit" },
  { no: 12, hand: se("K J T 9 8 5", "7 3", "8 4", "Q T 2"), bid: "2S", why: "6 HCP, weak two in spades" },
  { no: 13, hand: se("K 4", "A 5", "K J 8 2", "A K Q 9 3"), bid: "1C", why: "20 HCP, 5-card club suit" },
  { no: 14, hand: se("A K Q", "K J 5", "A Q 4", "K T 8 3"), bid: "2N", why: "22 HCP, balanced distribution" },
  { no: 15, hand: se("8 4 3", "9 7 2", "Q 5 4", "K J 8 2"), bid: "P", why: "6 HCP, insufficient points" },
  { no: 16, hand: se("K Q J T 8 7", "A 4", "9 5", "K 4 2"), bid: "1S", why: "13 HCP, 6-card spade suit" },
  { no: 17, hand: se("3", "A K J T 8 7", "Q 5 4", "A J 3"), bid: "1H", why: "15 HCP, 6-card heart suit" },
  { no: 18, hand: se("A K 4", "8 3", "K J T 8 7 2", "5 4"), bid: "1D", why: "11 HCP, 6-card diamond suit" },
  { no: 19, hand: se("A 5", "K 4", "A 8 3", "K J T 8 7 2"), bid: "1C", why: "15 HCP, 6-card club suit" },
  { no: 20, hand: se("K Q J T 9 8 3", "5", "8 4 2", "7 3"), bid: "3S", why: "6 HCP, 7-card preemptive bid" },
  { no: 21, hand: se("A J 5", "K Q 4", "A T 8 2", "Q J 5"), bid: "1N", why: "17 HCP, balanced distribution" },
  { no: 22, hand: se("K 5 2", "A Q J 9 4", "7 3", "A K 2"), bid: "1H", why: "17 HCP, 5-card heart suit" },
  { no: 23, hand: se("8 4", "6 3", "K Q J T 8 7", "9 5 2"), bid: "2D", why: "6 HCP, weak two in diamonds" },
  { no: 24, hand: se("A K Q 9 4", "J 5 2", "K 3", "8 7 4"), bid: "1S", why: "13 HCP, 5-card spade suit" },
  { no: 25, hand: se("A J T 8 4", "K Q 3", "A 5", "K 4 2"), bid: "1S", why: "17 HCP, 5-card spade suit" }
];
function ed(e = ri) {
  var o;
  const t = [];
  for (const r of e) {
    r.hand.length !== 13 && t.push({ no: r.no, kind: "short", detail: `${r.hand.length} cards, not 13` });
    const l = (o = /(\d+)\s*HCP/i.exec(r.why)) == null ? void 0 : o[1], c = oi(r.hand);
    l && Number(l) !== c && t.push({ no: r.no, kind: "hcp", detail: `note says ${l} HCP, cards hold ${c}` });
  }
  return t;
}
const td = /^([1-7])(NT?|[CDHS])$/;
function wt(e) {
  const t = (e ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (t === "P" || t === "PASS" || t === "NB" || t === "NOBID") return "P";
  if (t === "X" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RDBL" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = td.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function yd(e, t) {
  return wt(e) === wt(t);
}
function nd(e, t, o) {
  const r = wt(e.bid), l = wt(o);
  return { index: t, no: e.no, yourCall: l, authorCall: r, matched: l === r };
}
function od(e, t) {
  const o = e.length, r = e.filter((l) => l.matched).length;
  return {
    handsTotal: t,
    handsDone: o,
    completed: t > 0 && o >= t,
    matched: r,
    rated: o,
    scoreText: `${r}/${o || t}`,
    scoreValue: r,
    percent: o ? Math.round(r / o * 100) : 0
  };
}
const rd = [...Xe([], "S")], id = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, ld = (e) => e === "H" || e === "D", ad = (e) => /^[1-7][CDHSN]$/.test(e), Pn = "#fbfbfa", lt = "rgba(0,0,0,0.10)", st = "#111827", at = "#6B7280", mr = "#2f5c8f", gt = "#1a7f4b", jt = "#b4451c", ii = "#8a5a00", li = "#fff8e6", ai = "rgba(180,130,0,0.35)";
function Kt({ call: e, size: t = 15, tone: o = st }) {
  const r = wt(e);
  if (!ad(r))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: o }, children: r === "P" ? "Pass" : r });
  const l = r[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: t, fontWeight: 700, color: o, whiteSpace: "nowrap" }, children: [
    r[0],
    /* @__PURE__ */ n("span", { style: { color: ld(l) ? "#cc0000" : o }, children: id[l] })
  ] });
}
function xr({ problems: e }) {
  const t = e.filter((r) => r.kind === "short"), o = e.filter((r) => r.kind === "hcp");
  return /* @__PURE__ */ d(
    "div",
    {
      style: {
        background: li,
        border: `1px solid ${ai}`,
        borderRadius: 10,
        padding: "8px 10px",
        marginBottom: 10,
        fontSize: 12,
        lineHeight: 1.45,
        color: ii
      },
      children: [
        /* @__PURE__ */ n("strong", { style: { fontWeight: 700 }, children: "This hand set needs patching." }),
        " ",
        t.length > 0 && /* @__PURE__ */ d(me, { children: [
          t.length,
          " hand",
          t.length === 1 ? " is" : "s are",
          " short of thirteen cards (",
          t.map((r) => `#${r.no} — ${r.detail}`).join("; "),
          "), so the hand DRAWN below is incomplete. The taught call is unaffected, and the drill runs.",
          " "
        ] }),
        o.length > 0 && /* @__PURE__ */ d(me, { children: [
          o.length,
          " note",
          o.length === 1 ? "" : "s",
          " state a point count the cards do not hold (",
          o.map((r) => `#${r.no} — ${r.detail}`).join("; "),
          ")."
        ] })
      ]
    }
  );
}
function md({
  hands: e = ri,
  limit: t,
  showDataNotice: o = !0,
  isolate: r,
  fontFamily: l,
  onProgress: c,
  onComplete: i
}) {
  const a = Zt({ isolate: r, fontFamily: l }), s = ue(
    () => t && t > 0 ? e.slice(0, t) : e.slice(),
    [e, t]
  ), h = ue(() => ed([...e]), [e]), b = ue(
    () => JSON.stringify(s.map((Y) => [Y.no, Y.bid, Y.hand.length])),
    [s]
  ), [p, g] = V(0), [S, u] = V({}), [m, y] = V(null), [$, H] = V(!1), L = oe(!1), w = Me(() => {
    g(0), u({}), y(null), H(!1), L.current = !1;
  }, []), z = oe(b);
  z.current !== b && (z.current = b, (p !== 0 || $ || Object.keys(S).length) && w());
  const x = ue(
    () => s.flatMap((Y, fe) => {
      const v = S[fe];
      return v ? [nd(Y, fe, v)] : [];
    }),
    [s, S]
  ), D = ue(() => od(x, s.length), [x, s.length]), O = oe(c);
  O.current = c;
  const k = oe(i);
  k.current = i, xe(() => {
    var Y;
    D.handsDone === 0 && !$ || (Y = O.current) == null || Y.call(O, D);
  }, [D, $]), xe(() => {
    var Y;
    !$ || L.current || (L.current = !0, (Y = k.current) == null || Y.call(k, D, x));
  }, [$, D, x]);
  const C = oe(null), [E, X] = V(560);
  xe(() => {
    const Y = C.current;
    if (!Y) return;
    const fe = () => X(Y.clientWidth || 560);
    fe();
    const v = new ResizeObserver(fe);
    return v.observe(Y), () => v.disconnect();
  }, []);
  const A = 260, j = 12, K = 12, ee = E >= A + K + 230 + j * 2, T = (ee ? E - j * 2 - K - A : E - j * 2) - 6, F = Math.max(24, Math.min(34, Math.floor((T - 70) / 5.65))), q = 5 * (F + 14) + 4 * Math.round(F * 0.13), B = 24, I = B + ul(F, { pending: !0 }), M = ee ? E - j * 2 - K - q : E - j * 2, te = Math.max(17, Math.min(28, Math.floor(M / 13)));
  if (s.length === 0)
    return /* @__PURE__ */ n("div", { style: { ...a, padding: 16, fontSize: 13, color: at, background: Pn, border: `1px solid ${lt}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const ne = s[Math.min(p, s.length - 1)], le = x.find((Y) => Y.index === p) ?? null, G = oi(ne.hand), ie = 13 - ne.hand.length, N = /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }, children: s.map((Y, fe) => {
    const v = x.find((_) => _.index === fe);
    return /* @__PURE__ */ n(
      "span",
      {
        title: `Hand ${fe + 1}`,
        style: {
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: v ? v.matched ? gt : jt : "transparent",
          border: `1.5px solid ${fe === p && !$ ? mr : "rgba(0,0,0,0.22)"}`,
          boxSizing: "border-box"
        }
      },
      fe
    );
  }) }), W = () => p + 1 < s.length ? g(p + 1) : H(!0);
  if ($)
    return /* @__PURE__ */ d("div", { ref: C, style: { ...a, background: Pn, border: `1px solid ${lt}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        eo,
        {
          line: "Drill complete",
          score: `${D.matched} of ${D.handsDone} matched`,
          detail: `the author's opening bid · ${D.percent}%`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 12, maxHeight: 240, overflowY: "auto" }, children: x.map((Y) => /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${lt}`,
            fontSize: 13,
            color: at
          },
          children: [
            /* @__PURE__ */ d("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              Y.no
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(Kt, { call: Y.yourCall, tone: Y.matched ? gt : jt })
            ] }),
            !Y.matched && /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "the book" }),
              /* @__PURE__ */ n(Kt, { call: Y.authorCall })
            ] }),
            /* @__PURE__ */ n("span", { style: { marginLeft: "auto", color: Y.matched ? gt : jt, fontWeight: 700 }, children: Y.matched ? "match" : "no" })
          ]
        },
        Y.index
      )) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: w,
          style: {
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${lt}`,
            borderRadius: 8,
            background: "#fff",
            color: st,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Bid them again"
        }
      ),
      o && h.length > 0 && /* @__PURE__ */ n("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ n(xr, { problems: h }) })
    ] });
  const U = /* @__PURE__ */ d("div", { style: { flex: ee ? "1 1 0" : void 0, minWidth: 0, alignSelf: ee ? "stretch" : void 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }, children: [
    /* @__PURE__ */ n($t, { cards: ne.hand, panelBg: "#fff", width: "100%", font: te, suitW: Math.round(te * 0.9), pad: "6px 10px" }),
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, color: at }, children: [
      /* @__PURE__ */ d("span", { style: { fontWeight: 700, color: st }, children: [
        G,
        " HCP"
      ] }),
      /* @__PURE__ */ d("span", { children: [
        ne.hand.length,
        " cards"
      ] })
    ] }),
    ie > 0 && /* @__PURE__ */ d("p", { style: { fontSize: 11.5, lineHeight: 1.4, color: ii, background: li, border: `1px solid ${ai}`, borderRadius: 8, padding: "6px 8px", margin: 0 }, children: [
      "This hand was supplied ",
      ie === 1 ? "one card" : `${ie} cards`,
      " short, so the diagram is incomplete. The opening call it teaches is unaffected — bid it as it stands."
    ] })
  ] }), P = le && // height:100% + the button on `marginTop:auto` — the card fills the slot the
  // pad vacated and puts "Next hand" on the slot's bottom edge, so it is in
  // the same place on every one of the 25 hands rather than wherever this
  // hand's reason happened to end.
  /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", background: "#fff", border: `1px solid ${lt}`, borderRadius: 10, padding: "10px 12px" }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: at }, children: [
      /* @__PURE__ */ n("span", { children: "You bid" }),
      /* @__PURE__ */ n(Kt, { call: le.yourCall, size: 17, tone: le.matched ? gt : st }),
      le.matched ? /* @__PURE__ */ n("span", { style: { color: gt, fontWeight: 700 }, children: "— that is the opening bid." }) : /* @__PURE__ */ d(me, { children: [
        /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
        /* @__PURE__ */ n("span", { children: "the opening bid is" }),
        /* @__PURE__ */ n(Kt, { call: le.authorCall, size: 17, tone: jt })
      ] })
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 12.5, lineHeight: 1.4, color: st, marginTop: 6, marginBottom: 0 }, children: ne.why }),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: W,
        style: {
          marginTop: "auto",
          alignSelf: "flex-start",
          height: 38,
          padding: "0 18px",
          border: 0,
          borderRadius: 8,
          background: mr,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer"
        },
        children: p + 1 < s.length ? "Next hand →" : "See how you did"
      }
    )
  ] }), re = /* @__PURE__ */ n(
    "div",
    {
      style: {
        flex: ee ? `0 0 ${q}px` : void 0,
        width: ee ? q : "100%",
        minHeight: I,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 6
      },
      children: le ? /* @__PURE__ */ n("div", { style: { width: "100%", flex: 1, minHeight: 0, display: "flex" }, children: P }) : /* @__PURE__ */ d(me, { children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 12, lineHeight: `${B - 6}px`, color: at, alignSelf: "flex-start" }, children: m ? "Confirm your call" : "Your opening call?" }),
        /* @__PURE__ */ n(
          xt,
          {
            cell: F,
            radius: 6,
            legalCalls: rd,
            live: !0,
            pending: m,
            onStage: y,
            onConfirm: () => {
              m && (u((Y) => ({ ...Y, [p]: m })), y(null));
            },
            onCancel: () => y(null)
          }
        )
      ] })
    }
  );
  return /* @__PURE__ */ d("div", { ref: C, style: { ...a, background: Pn, border: `1px solid ${lt}`, borderRadius: 12, padding: j }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 10px", marginBottom: 8 }, children: [
      /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 700, color: st, flex: "none" }, children: [
        "Hand ",
        p + 1,
        " of ",
        s.length
      ] }),
      /* @__PURE__ */ n("span", { style: { fontSize: 12, color: at, flex: "none" }, children: "you deal, nobody vulnerable" }),
      N
    ] }),
    o && h.length > 0 && /* @__PURE__ */ n(xr, { problems: h }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: ee ? "row" : "column", gap: K, alignItems: "flex-start" }, children: [
      U,
      re
    ] })
  ] });
}
export {
  md as BiddingChallenge,
  hd as BiddingDrill,
  Ca as BridgeTable,
  pd as ChallengeCreator,
  gd as ChallengePlayer,
  ud as DealDiagram,
  fd as EmbedRoot,
  Ae as MAX_BOARDS,
  ct as MIN_BOARDS,
  ri as OPENING_BID_HANDS,
  Ps as buildSoloResults,
  yd as callsMatch,
  bd as createBenDecider,
  Zt as embedBox,
  oi as hcp,
  nd as judgeHand,
  od as markAnswers,
  wt as normalizeCall,
  ei as normalizeDraft,
  to as packFromDraft,
  Ze as seededDeal,
  $s as validateDraft,
  ed as validateDrillHands
};
//# sourceMappingURL=table-embed.js.map
