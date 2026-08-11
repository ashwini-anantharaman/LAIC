import { jsxs as d, jsx as n, Fragment as ye } from "react/jsx-runtime";
import { createContext as Oi, useContext as Li, useState as G, useRef as oe, useCallback as He, useLayoutEffect as wt, useEffect as me, useReducer as Pi, useMemo as ce } from "react";
function bt(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function xo(e) {
  return `${e.suit}${e.rank}`;
}
const Ie = ["S", "W", "N", "E"];
function yt(e) {
  return Ie[(Ie.indexOf(e) + 1) % 4];
}
function Fi(e) {
  return yt(yt(e));
}
function pr(e, t) {
  return e === t || Fi(e) === t;
}
const _i = {
  none: "None",
  ns: "N-S",
  ew: "E-W",
  both: "Both"
};
function Xi(e, t) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const o = t === "N" || t === "S";
  return e === "ns" ? o : !o;
}
const ji = { C: "♣", D: "♦", H: "♥", S: "♠" };
function Yt(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
function Ki(e) {
  const t = e.strain === "N" ? "NT" : ji[e.strain], o = e.doubled === 1 ? " X" : e.doubled === 2 ? " XX" : "";
  return `${e.level}${t}${o} by ${e.declarer}`;
}
const gr = ["C", "D", "H", "S", "N"];
function ko(e) {
  return Yt(e) ? (Number(e[0]) - 1) * 5 + gr.indexOf(e[1]) : -1;
}
function Pe(e, t) {
  const o = /* @__PURE__ */ new Set(["P"]);
  let r = -1;
  for (const l of e) r = Math.max(r, ko(l.call));
  for (let l = 1; l <= 7; l++)
    for (const i of gr) {
      const s = `${l}${i}`;
      ko(s) > r && o.add(s);
    }
  let a = null;
  for (let l = e.length - 1; l >= 0; l--)
    if (e[l].call !== "P") {
      a = e[l];
      break;
    }
  return a && !pr(a.seat, t) && (Yt(a.call) ? o.add("X") : a.call === "X" && o.add("XX")), o;
}
function Yi(e) {
  if (e.length < 4) return !1;
  const t = e.slice(-3);
  return t.length === 3 && t.every((o) => o.call === "P");
}
function Ui(e) {
  let t = null, o = 0;
  for (const i of e)
    Yt(i.call) ? (t = i, o = 0) : i.call === "X" ? o = 1 : i.call === "XX" && (o = 2);
  if (!t) return null;
  const r = t.call[1], a = t.seat;
  let l = t.seat;
  for (const i of e)
    if (Yt(i.call) && i.call[1] === r && pr(i.seat, a)) {
      l = i.seat;
      break;
    }
  return { level: Number(t.call[0]), strain: r, doubled: o, declarer: l };
}
function kt(e, t, o, r) {
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
const br = (e) => e === "N" || e === "S" ? "NS" : "EW";
function Gi(e, t) {
  const o = e.plays[0].card.suit, r = (l, i) => {
    const s = t !== "N" && l.suit === t, c = t !== "N" && i.suit === t;
    if (s && !c) return !0;
    if (c && !s) return !1;
    if (s && c) return l.rank > i.rank;
    const u = l.suit === o, p = i.suit === o;
    return u && !p ? !0 : p && !u ? !1 : l.rank > i.rank;
  };
  let a = e.plays[0];
  for (const l of e.plays.slice(1)) r(l.card, a.card) && (a = l);
  return a.seat;
}
function Ut(e, t) {
  const o = e.hands[t], r = e.tricks[e.tricks.length - 1];
  if (!r || r.plays.length === 0 || r.plays.length === 4) return [...o];
  const l = r.plays[0].card.suit, i = o.filter((s) => s.suit === l);
  return i.length ? i : [...o];
}
function Le(e, t) {
  if (t.category === "bid-event") {
    const b = [...e.auction, { seat: t.seat, call: t.call }];
    if (!Yi(b))
      return { ...e, auction: b, turn: yt(t.seat) };
    const g = Ui(b);
    if (!g)
      return { ...e, auction: b, contract: null, phase: "complete" };
    const x = yt(g.declarer);
    return {
      ...e,
      auction: b,
      contract: g,
      phase: "play",
      turn: x,
      tricks: [{ leader: x, plays: [] }]
    };
  }
  const o = t.seat, r = {
    ...e.hands,
    [o]: e.hands[o].filter((b) => xo(b) !== xo(t.card))
  }, a = e.tricks.map((b) => ({ ...b, plays: [...b.plays] }));
  let l = a[a.length - 1];
  if ((!l || l.plays.length === 4) && (l = { leader: o, plays: [] }, a.push(l)), l.plays.push({ seat: o, card: t.card }), l.plays.length < 4)
    return { ...e, hands: r, tricks: a, turn: yt(o) };
  const i = e.contract ? e.contract.strain : "N", s = Gi(l, i);
  l.winner = s;
  const c = br(s), u = { ...e.trickCount, [c]: e.trickCount[c] + 1 }, p = r.N.length === 0 && r.E.length === 0 && r.S.length === 0 && r.W.length === 0;
  return {
    ...e,
    hands: r,
    tricks: a,
    trickCount: u,
    turn: s,
    phase: p ? "complete" : "play"
  };
}
const So = { C: 20, D: 20, H: 30, S: 30 };
function yr(e) {
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
  const o = br(t.declarer), r = e.trickCount[o], a = 6 + t.level, l = r - a, i = l >= 0, s = Xi(e.vul, t.declarer), c = t.doubled, u = c === 2 ? 4 : c === 1 ? 2 : 1;
  let p = 0, b = 0, g = 0, x = 0, h = 0, m = 0, N = 0;
  if (i) {
    p = t.strain === "N" ? (40 + (t.level - 1) * 30) * u : So[t.strain] * t.level * u;
    const I = c === 0 ? t.strain === "N" ? 30 : So[t.strain] : (s ? 200 : 100) * (c === 2 ? 2 : 1);
    b = l * I, p >= 100 ? g = s ? 500 : 300 : x = 50, t.level === 6 && (h = s ? 750 : 500), t.level === 7 && (h = s ? 1500 : 1e3), c > 0 && (m = 50 * c);
  } else {
    const I = -l;
    if (c === 0)
      N = I * (s ? 100 : 50);
    else {
      let L = 0;
      for (let y = 1; y <= I; y++)
        y === 1 ? L += s ? 200 : 100 : y <= 3 ? L += s ? 300 : 200 : L += 300;
      N = L * (c === 2 ? 2 : 1);
    }
  }
  const $ = i ? p + b + g + x + h + m : -N;
  return {
    contract: t,
    tricksTaken: r,
    result: l,
    made: i,
    vulnerable: s,
    trickScore: p,
    overtrickScore: b,
    gameBonus: g,
    partscoreBonus: x,
    slamBonus: h,
    insultBonus: m,
    penalty: N,
    declarerScore: $,
    nsScore: o === "NS" ? $ : -$
  };
}
function mr(e) {
  if (!e.contract) return "Passed out";
  const t = e.contract, o = t.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[t.strain], r = t.doubled === 1 ? " X" : t.doubled === 2 ? " XX" : "", a = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${t.level}${o}${r} by ${t.declarer}, ${a}`;
}
function Ji(e) {
  let t = e >>> 0;
  return () => {
    t |= 0, t = t + 1831565813 | 0;
    let o = Math.imul(t ^ t >>> 15, 1 | t);
    return o = o + Math.imul(o ^ o >>> 7, 61 | o) ^ o, ((o ^ o >>> 14) >>> 0) / 4294967296;
  };
}
function Qe(e) {
  const t = Ji(e), r = ["S", "H", "D", "C"].flatMap(
    (l) => Array.from({ length: 13 }, (i, s) => ({ suit: l, rank: s + 2 }))
  );
  for (let l = r.length - 1; l > 0; l--) {
    const i = Math.floor(t() * (l + 1));
    [r[l], r[i]] = [r[i], r[l]];
  }
  const a = { N: [], E: [], S: [], W: [] };
  return r.forEach((l, i) => a[Ie[i % 4]].push(l)), a;
}
const Vi = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, Qi = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, qi = { skin: "bbo" }, Zi = {
  skins: Vi,
  strainTint: Qi,
  defaults: qi
}, Yn = Zi, vo = Yn.skins, xn = Yn.strainTint, el = {
  skin: Yn.defaults.skin
};
function xr(e, t = {}) {
  const o = vo[e] ?? vo[el.skin], r = (l) => {
    const i = t[l];
    return typeof i == "string" && i.trim() !== "" ? i : void 0;
  }, a = r("feltColor");
  return {
    ...o,
    felt: a ?? o.felt,
    feltFlat: a ?? o.feltFlat,
    accent: r("accent") ?? o.accent,
    trayBg: r("bidBoxColor") ?? o.trayBg,
    auctionBg: r("auctionColor") ?? o.auctionBg,
    cardBack: r("cardBackColor") ?? o.cardBack
  };
}
const tl = ["N", "S", "H", "D", "C"], kr = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, nl = [1, 2, 3, 4, 5, 6, 7], ol = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${kr[e[1] ?? "N"] ?? ""}`;
function mt({
  cell: e = 46,
  minCellH: t = 0,
  radius: o = 5,
  legalCalls: r,
  live: a,
  pending: l,
  onStage: i,
  onConfirm: s,
  onCancel: c
}) {
  const u = Math.round(e * 0.13), p = Math.round(e * 0.11), b = e, g = Math.max(Math.round(e * 0.92), t), x = Math.round(e * 3.4), h = Math.round(e * 0.62), m = Math.round(e * 0.42), N = new Set(r), $ = l != null, I = (y, H) => {
    const v = `${H}${y}`, j = xn[y], z = N.has(v), S = a && !$ && z;
    return /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: S ? () => i(v) : void 0,
        "aria-label": `${H}${y === "N" ? "NT" : y}`,
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: b,
          height: g,
          padding: 0,
          background: "transparent",
          border: 0,
          color: j.ink,
          lineHeight: 1,
          cursor: S ? "pointer" : "default",
          opacity: z ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: h, fontWeight: 700, lineHeight: 1 }, children: H }),
          /* @__PURE__ */ n("span", { style: { fontSize: m, fontWeight: 700, lineHeight: 1 }, children: kr[y] })
        ]
      },
      v
    );
  }, L = (y, H, v, j, z, S) => {
    const A = N.has(y), E = a && !$ && A;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: E ? () => i(y) : void 0,
        "aria-label": y === "P" ? "Pass" : y === "X" ? "Double" : "Redouble",
        style: {
          width: v,
          height: g,
          background: j,
          border: `2px solid ${z}`,
          borderRadius: o,
          color: "#fff",
          fontWeight: 700,
          fontSize: h,
          lineHeight: 1,
          cursor: E ? "pointer" : "default",
          opacity: A ? 1 : 0.3,
          ...S
        },
        children: H
      },
      y
    );
  };
  return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: u }, children: [
    l != null && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 20, fontWeight: 700, color: "#12281f" }, children: ol(l) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: s,
          style: { height: 38, padding: "0 16px", border: "1px solid #0c4b0b", borderRadius: o, background: "#116710", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Confirm"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: c,
          style: { height: 38, padding: "0 16px", border: "1px solid #5e1c1c", borderRadius: o, background: "#8a3030", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: u }, children: tl.map((y) => /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: u,
          padding: p,
          background: xn[y].bg,
          border: `2px solid ${xn[y].edge}`,
          borderRadius: o
        },
        children: nl.map((H) => I(y, H))
      },
      y
    )) }),
    /* @__PURE__ */ d("div", { style: { display: "flex", gap: u }, children: [
      L("P", "Pass", x, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      L("X", "X", b, "#7a5b3a", "#5e4227"),
      L("XX", "XX", b, "#2b6b73", "#1c4d53")
    ] })
  ] });
}
const rl = {
  LinkComponent: "a",
  navigate: (e, { replace: t }) => {
    typeof window > "u" || (t ? window.location.replace(e) : window.location.assign(e));
  }
}, il = Oi(rl);
function Sr() {
  return Li(il);
}
const Mn = "#384bb3", wo = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: Mn, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, No = 48;
function nt({
  side: e,
  items: t,
  thickness: o = 44,
  condensed: r = !1,
  scale: a,
  minTouch: l = 30,
  bg: i = "rgba(9,22,17,.90)",
  accent: s = Mn
}) {
  const [c, u] = G(99), [p, b] = G(99), [g, x] = G(!1), h = oe(null), m = oe(null), N = oe(null), $ = oe(() => {
  }), I = s === Mn ? wo : { ...wo, accent: { bg: s, border: s, color: "#fff" } }, L = o, y = Math.min(
    Math.round(L * 2.2),
    Math.max(
      Math.round(L * 0.68),
      L - 14,
      a ? Math.ceil(l / Math.max(0.05, a)) : 0
    )
  ), { LinkComponent: H } = Sr(), v = r ? 5 : 7, j = Math.round(y * (r ? 0.17 : 0.4)), z = Math.max(r ? 11 : 13, Math.round(y * (r ? 0.28 : 0.4))), S = Math.round(y * 0.86), A = Math.max(9, Math.round(y * 0.26));
  let E = -1;
  t.forEach((k, W) => {
    k.kind === "spacer" && (E = W);
  });
  const U = E < 0 ? t : t.slice(0, E), B = E < 0 ? [] : t.slice(E + 1), q = U.length, P = B.length, ne = Math.max(0, Math.min(c, q)), R = Math.max(1, Math.min(p, P)), _ = B.slice(B.length - R), D = U.slice(ne).concat(B.slice(0, B.length - R)).filter((k) => k.kind !== "divider"), w = D.length > 0, M = g && w, F = He(() => {
    const k = h.current;
    if (!k) return;
    const W = Math.min(c, q), J = k.clientWidth;
    if (J > 0) {
      if (k.scrollWidth > J + 1) {
        const C = parseFloat(getComputedStyle(k).gap) || 0;
        let Y = 0, V = 0;
        for (const ie of Array.from(k.children))
          if (Y += ie.offsetWidth + (V ? C : 0), Y <= J) V++;
          else break;
        V < W && u(V);
        return;
      }
      if (J - k.scrollWidth > No && W < q) {
        u(W + 1);
        return;
      }
      if (W !== c) {
        u(W);
        return;
      }
    }
    const X = m.current;
    if (!X) return;
    const re = Math.min(p, P);
    W === 0 && X.scrollWidth > X.clientWidth + 1 && re > 1 ? b(re - 1) : X.clientWidth - X.scrollWidth > No && re < P ? b(re + 1) : re !== p && b(re);
  }, [c, p, q, P]);
  wt(() => {
    $.current = F, F();
  }), me(() => {
    const k = (W) => {
      m.current && !m.current.contains(W.target) && x(!1);
    };
    return document.addEventListener("mousedown", k), () => {
      document.removeEventListener("mousedown", k), N.current && N.current.disconnect();
    };
  }, []);
  const te = He((k) => {
    N.current && (N.current.disconnect(), N.current = null), h.current = k, m.current = k ? k.parentElement : null, k && (typeof ResizeObserver == "function" && (N.current = new ResizeObserver(() => $.current()), N.current.observe(k)), $.current());
  }, []), K = (k, W) => {
    if (k.kind === "spacer") return null;
    if (k.kind === "node")
      return /* @__PURE__ */ n("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: v }, children: k.node }, W);
    if (k.kind === "divider")
      return /* @__PURE__ */ n("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, W);
    if (k.kind === "chip")
      return /* @__PURE__ */ d("div", { title: k.title ?? k.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: S, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: A, fontWeight: r ? 700 : 400, letterSpacing: ".09em", textTransform: "uppercase", color: r ? "#a3b7ae" : "#8fa39a" }, children: k.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: z, fontWeight: r ? 800 : 700, lineHeight: 1, color: k.color ?? "#eef4f1" }, children: k.value })
      ] }, W);
    const J = I[k.tone ?? "plain"], X = k.disabled === !0, re = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: k.kind === "icon" ? y : void 0,
      height: y,
      padding: k.kind === "icon" ? 0 : `0 ${j}px`,
      border: `1px solid ${J.border}`,
      borderRadius: 6,
      background: J.bg,
      color: J.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: z,
      fontWeight: k.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: X || !k.on && !k.href ? "default" : "pointer",
      opacity: X ? 0.42 : 1
    };
    return k.href && !X ? /* @__PURE__ */ n(H, { href: k.href, title: k.title ?? k.label, "aria-label": k.ariaLabel, style: re, children: k.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: k.title ?? k.label, "aria-label": k.ariaLabel, disabled: X, onClick: X ? void 0 : k.on ?? void 0, style: re, children: k.label }, W);
  }, fe = (k, W) => {
    if (k.kind === "divider" || k.kind === "spacer") return null;
    if (k.kind === "chip")
      return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: k.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: k.color ?? "#eef4f1" }, children: k.value })
      ] }, W);
    if (k.kind === "node")
      return /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: k.node }, W);
    const J = I[k.tone ?? "plain"], X = k.disabled === !0, re = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: y,
      marginBottom: 4,
      padding: `0 ${j}px`,
      border: `1px solid ${J.border}`,
      borderRadius: 6,
      background: J.bg,
      color: J.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: z,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: X || !k.on && !k.href ? "default" : "pointer",
      opacity: X ? 0.42 : 1
    }, C = () => x(!1);
    return k.href && !X ? /* @__PURE__ */ n(H, { href: k.href, title: k.title ?? k.label, "aria-label": k.ariaLabel, style: re, onClick: C, children: k.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: k.title ?? k.label, "aria-label": k.ariaLabel, disabled: X, onClick: X ? void 0 : () => {
      var Y;
      (Y = k.on) == null || Y.call(k), C();
    }, style: re, children: k.label }, W);
  }, O = Math.max(L, y + 14), ee = {
    position: "absolute",
    ...e === "bottom" ? { bottom: y + 12 } : { top: y + 12 },
    right: 0,
    zIndex: 40,
    minWidth: Math.round(y * 4.2),
    maxHeight: Math.round(y * 7),
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
      style: { width: "100%", [r ? "height" : "minHeight"]: O, flex: "none", display: "flex", alignItems: "center", gap: v, padding: `6px ${r ? 8 : 10}px`, background: i, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ n(
          "div",
          {
            ref: te,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: v, ...r ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: U.slice(0, ne).map(K)
          }
        ),
        w && /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: () => x((k) => !k),
              title: `${D.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: y, padding: `0 ${j}px`, border: `1px solid ${M ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: M ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: z, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ n("span", { children: "⋯" }),
                /* @__PURE__ */ n("span", { style: { fontSize: A, opacity: 0.8 }, children: D.length })
              ]
            }
          ),
          M && /* @__PURE__ */ n("div", { style: ee, children: D.map(fe) })
        ] }),
        _.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: v }, children: _.map(K) })
      ]
    }
  );
}
function $o({
  title: e = "Table settings",
  accent: t = "#384bb3",
  items: o,
  onClose: r
}) {
  const { navigate: a } = Sr(), l = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, i = (s) => /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ n("span", { children: s.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700, color: t }, children: s.value })
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
        (s) => s.action ? (
          // A server action persists the change; the resulting server
          // re-render preserves the client menuOpen state, so the menu stays
          // open exactly as an href row does.
          /* @__PURE__ */ n("form", { action: s.action, style: { margin: 0, display: "block" }, children: /* @__PURE__ */ n("button", { type: "submit", style: l, children: i(s) }) }, s.label)
        ) : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: s.on ?? (s.href ? () => {
              const c = s.href.split("?")[0] === window.location.pathname;
              a(s.href, { replace: c });
            } : void 0),
            style: l,
            children: i(s)
          },
          s.label
        )
      )
    ] })
  ] });
}
const Be = "#cc0000", kn = "#fecd07", vr = "#d3d3d3", Co = "#f2e2b8", ll = "#b8901f", wr = "#12525e", ve = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, ft = ["C", "D", "H", "S", "N"], Sn = ["W", "N", "E", "S"], Gt = ["S", "H", "C", "D"], al = { N: "S", S: "N", E: "W", W: "E" }, Ee = (e) => e === "H" || e === "D", We = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), sl = (e) => /^[1-7][CDHSN]$/.test(e), On = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${ve[e[1] ?? ""] ?? ""}`, Nr = (e) => sl(e) && Ee(e[1] ?? "") ? Be : "#000", dl = (e) => e === "N" || e === "S" ? "NS" : "EW", cl = `
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
`, Bo = "btu-lift", fl = "btu-deal";
function Ln() {
  return /* @__PURE__ */ n("style", { href: "bridge-table-ui-motion", precedence: "default", children: cl });
}
function vn({
  cards: e,
  metrics: t,
  layout: o,
  hidden: r = !1,
  fanSpread: a,
  fanRadius: l,
  backColor: i,
  backCount: s,
  backMetrics: c = { w: 14, h: 71 },
  isPlayable: u,
  onPlay: p
}) {
  if (r) {
    const B = Math.max(1, s ?? e.length);
    return /* @__PURE__ */ n("div", { style: { display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }, children: Array.from({ length: B }, (q, P) => /* @__PURE__ */ n("span", { style: { display: "block", width: c.w, height: c.h, background: i, borderLeft: P ? "1.5px solid rgba(255,255,255,.92)" : "none" } }, P)) });
  }
  const b = [...e].sort(
    (B, q) => Gt.indexOf(B.suit) - Gt.indexOf(q.suit) || q.rank - B.rank
  ), g = t.weight ?? 700, x = t.weight ?? 400;
  if (o === "row")
    return /* @__PURE__ */ d("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: [
      /* @__PURE__ */ n(Ln, {}),
      b.map((B, q) => {
        const P = u ? u(B) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: P ? () => p == null ? void 0 : p(B) : void 0,
            "aria-label": `Play ${We(B.rank)}${ve[B.suit]}`,
            className: Bo,
            style: {
              position: "relative",
              display: "block",
              width: t.w,
              height: t.h,
              flex: "none",
              background: "#fff",
              border: "1px solid #6b6b6b",
              borderRadius: q === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
              marginLeft: q === 0 ? 0 : -(t.overlap ?? 1),
              padding: 0,
              cursor: P ? "pointer" : "default",
              transform: P ? "translateY(-6px)" : "none",
              // A lifted card rises ABOVE its neighbours: overlapped cards
              // paint in hand order, so without this the next card clips the
              // one the thumb is about to press.
              zIndex: P ? 2 : 1
            },
            children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: t.inset, top: t.inset > 3 ? t.inset : 1, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: Ee(B.suit) ? Be : "#000" }, children: [
              /* @__PURE__ */ n("span", { style: { fontSize: t.rank, fontWeight: g }, children: We(B.rank) }),
              /* @__PURE__ */ n("span", { style: { fontSize: t.glyph, fontWeight: x }, children: ve[B.suit] })
            ] })
          },
          `${B.suit}${B.rank}`
        );
      })
    ] });
  const h = b.length, m = t.w, N = t.h, $ = a, I = l > 0 ? l : Math.round(N * 4.2), L = (B) => h <= 1 ? 0 : -$ / 2 + B * ($ / (h - 1));
  let y = 0, H = 0, v = 0, j = 0;
  for (let B = 0; B < h; B++) {
    const q = L(B) * Math.PI / 180, P = Math.cos(q), ne = Math.sin(q);
    for (const R of [-m / 2, m / 2])
      for (const _ of [-I, -I + N]) {
        const D = R * P - _ * ne, w = R * ne + _ * P;
        D < y && (y = D), D > H && (H = D), w < v && (v = w), w > j && (j = w);
      }
  }
  const z = Math.ceil(Math.max(-y, H) * 2) + 4, S = Math.ceil(j - v) + 4, A = Math.ceil(-v - I) + 2, E = t.rank, U = t.glyph;
  return /* @__PURE__ */ d("div", { style: { position: "relative", width: z, height: S }, children: [
    /* @__PURE__ */ n(Ln, {}),
    b.map((B, q) => {
      const P = u ? u(B) : !1;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: P ? () => p == null ? void 0 : p(B) : void 0,
          "aria-label": `Play ${We(B.rank)}${ve[B.suit]}`,
          className: Bo,
          style: {
            position: "absolute",
            left: "50%",
            top: A,
            width: m,
            height: N,
            padding: 0,
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: 4,
            boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
            transform: `translateX(-50%) rotate(${L(q)}deg)${P ? " translateY(-14px)" : ""}`,
            transformOrigin: `50% ${I}px`,
            zIndex: P ? 2 : 1,
            cursor: P ? "pointer" : "default"
          },
          children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: t.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: Ee(B.suit) ? Be : "#000" }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: E, fontWeight: g }, children: We(B.rank) }),
            /* @__PURE__ */ n("span", { style: { fontSize: U, fontWeight: x }, children: ve[B.suit] })
          ] })
        },
        `${B.suit}${B.rank}`
      );
    })
  ] });
}
function hl({
  seat: e,
  name: t,
  tag: o,
  strip: r,
  bg: a,
  width: l,
  isDealer: i,
  metrics: s = {}
}) {
  const c = s.height ?? 22, u = s.badge ?? 20, p = s.font ?? 15, b = s.tagFont ?? 11, g = s.weight ?? 400;
  return /* @__PURE__ */ d("div", { "data-testid": "seat-plate", "data-seat": e, style: { display: "flex", alignItems: "stretch", gap: 5, width: l, height: c, padding: "0 3px 0 0", background: a, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${i ? ll : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { flex: "none", width: 6, background: r ?? "transparent" } }),
    /* @__PURE__ */ n("span", { style: { flex: "none", width: u, height: u, alignSelf: "center", background: wr, color: "#fff", fontSize: p - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
    /* @__PURE__ */ n("span", { style: { alignSelf: "center", fontSize: p, fontWeight: g, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: t }),
    i && /* @__PURE__ */ n("span", { style: { alignSelf: "center", flex: "none", padding: "0 2px", fontSize: b, fontWeight: 700, color: "#7a5a12" }, children: "DEALER" }),
    /* @__PURE__ */ n("span", { style: { marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: b, fontWeight: g, color: "#555" }, children: o ?? "" })
  ] });
}
function Nt({
  cards: e,
  panelBg: t,
  width: o,
  suitW: r,
  font: a,
  pad: l,
  bare: i,
  touch: s,
  isPlayable: c,
  onPlay: u
}) {
  const p = a ?? 19, b = !!s;
  return /* @__PURE__ */ n("div", { style: { width: o, background: i ? t : "#fff", border: i ? 0 : "1px solid #8a8a8a", borderRadius: i ? 0 : 3, padding: l ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: Gt.map((g) => {
    const x = e.filter((h) => h.suit === g).sort((h, m) => m.rank - h.rank);
    return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: Ee(g) ? Be : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", width: r ?? 16, fontSize: p }, children: ve[g] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", gap: b ? "0 4px" : "0 5px", fontSize: p }, children: x.length === 0 ? /* @__PURE__ */ n("span", { children: "—" }) : x.map((h) => {
        const m = c ? c(h) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: m ? () => u == null ? void 0 : u(h) : void 0,
            "aria-label": `Play ${We(h.rank)}${ve[g]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: b ? 84 : 0, minHeight: b ? 78 : 0, background: m ? "#d9f2d9" : "transparent", border: 0, borderRadius: b ? 6 : 0, padding: b ? "0 4px" : "0 1px", fontSize: p, fontWeight: m ? 700 : 400, color: "inherit", cursor: m ? "pointer" : "default" },
            children: We(h.rank)
          },
          h.rank
        );
      }) })
    ] }, g);
  }) });
}
const $r = 3, Cr = 3;
function Br(e, t) {
  return e * t + Math.max(0, e - 1) * $r + Cr * 2;
}
function Tr({
  bg: e,
  m: t = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: o,
  rows: r,
  dealerCol: a,
  emptyText: l = null
}) {
  const i = oe(null);
  wt(() => {
    const u = i.current;
    u && (u.scrollTop = u.scrollHeight);
  }, [r.length]);
  const s = t.cellMinH ?? Math.round(t.cellFont * 1.15) + 4, c = t.rowsVisible != null && t.rowsVisible > 0 ? { flex: "0 1 auto", height: Br(t.rowsVisible, s), minHeight: 0, boxSizing: "border-box" } : { flex: 1, minHeight: 0 };
  return /* @__PURE__ */ d("div", { style: { width: t.width, height: t.height, maxHeight: t.maxH ?? (t.height === "auto" ? 340 : void 0), background: e, borderRadius: t.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: o.map((u) => /* @__PURE__ */ d("span", { style: { padding: "2px 0", fontSize: t.headFont, fontWeight: 700, lineHeight: 1.1, background: u.vul ? "#cc1111" : u.isDealer ? Co : "#fff", color: u.vul ? "#fff" : "#000" }, children: [
      u.seat,
      u.isDealer ? " •" : ""
    ] }, u.seat)) }),
    /* @__PURE__ */ d("div", { ref: i, "data-testid": "auction-rows", style: { ...c, overflowY: "auto", padding: `${Cr}px 5px`, display: "flex", flexDirection: "column", gap: $r }, children: [
      r.map((u, p) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((b) => {
        const g = u[b];
        return /* @__PURE__ */ n("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: t.cellMinH ?? 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.cellFont, lineHeight: 1.15, background: g ? b === a ? Co : vr : "transparent", color: g ? Nr(g.call) : "#000" }, children: g ? On(g.call) : "" }, b);
      }) }, p)),
      l != null && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: l })
    ] })
  ] });
}
const Un = { w: 56, h: 80 }, ul = (e) => Math.round(e * 0.7);
function Gn(e = Un) {
  return { w: e.w * 2, h: e.h * 2 };
}
Gn(Un);
const pl = (e) => {
  const t = Math.round(e.w / 2), o = ul(e.h);
  return {
    N: { left: t, top: 0 },
    W: { left: 0, top: o },
    E: { left: e.w, top: o },
    S: { left: t, top: e.h }
  };
}, gl = ["N", "W", "E", "S"];
function wn({
  plays: e,
  turn: t,
  scale: o = 1,
  variant: r = "cross",
  card: a = Un,
  index: l = { rank: 38, glyph: 30 }
}) {
  if (r === "pill")
    return /* @__PURE__ */ n("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((s) => {
      const c = e.find((p) => p.seat === s), u = s === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : s === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : s === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return c ? /* @__PURE__ */ d("div", { style: { position: "absolute", ...u, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: Ee(c.card.suit) ? Be : "#000" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: ve[c.card.suit] }),
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: We(c.card.rank) })
      ] }, s) : null;
    }) });
  if (r === "cluster") {
    const s = Gn(a), c = pl(a), u = Math.floor((a.w - 11) / 1.12);
    return /* @__PURE__ */ d("div", { style: { width: s.w * o, height: s.h * o, display: "flex", alignItems: "center", justifyContent: "center" }, children: [
      /* @__PURE__ */ n(Ln, {}),
      /* @__PURE__ */ n("div", { style: { position: "relative", width: s.w, height: s.h, flex: "none", transform: `scale(${o})`, transformOrigin: "center center" }, children: gl.map((p, b) => {
        const g = e.find((N) => N.seat === p), x = c[p], h = p === t, m = g ? We(g.card.rank) : "";
        return /* @__PURE__ */ n("div", { style: { position: "absolute", left: x.left, top: x.top, zIndex: b + 1 }, children: g ? (
          // Keyed on the card so a NEW card mounts (and deals in); a
          // re-render of the same card must not replay the animation.
          /* @__PURE__ */ n(
            "span",
            {
              "data-testid": "trick-card",
              "data-seat": p,
              className: fl,
              style: { position: "relative", display: "block", width: a.w, height: a.h, background: "#fff", border: "1.5px solid #4a4a4a", borderRadius: 4, boxShadow: "0 3px 7px rgba(0,0,0,.45)", boxSizing: "border-box" },
              children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.88, color: Ee(g.card.suit) ? Be : "#000" }, children: [
                /* @__PURE__ */ n("span", { style: { fontSize: m.length > 1 ? Math.min(l.rank, u) : l.rank, fontWeight: 800, letterSpacing: "-.02em" }, children: m }),
                /* @__PURE__ */ n("span", { style: { fontSize: l.glyph, fontWeight: 700 }, children: ve[g.card.suit] })
              ] })
            },
            `${g.card.suit}${g.card.rank}`
          )
        ) : /* @__PURE__ */ n("span", { style: { display: "flex", width: a.w, height: a.h, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: h ? 24 : 0, height: 5, borderRadius: 3, background: h ? "rgba(255,255,255,.62)" : "transparent" } }) }) }, p);
      }) })
    ] });
  }
  const i = o;
  return /* @__PURE__ */ n("div", { style: { width: 262 * i, height: 262 * i, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("div", { style: { position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${i})`, transformOrigin: "center center" }, children: ["N", "E", "S", "W"].map((s) => {
    const c = e.find((b) => b.seat === s), u = s === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" } : s === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" } : s === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" } : { left: "206px", top: "50%", tr: "translateY(-50%)" }, p = s === t;
    return /* @__PURE__ */ n("div", { style: { position: "absolute", left: u.left, top: u.top, transform: u.tr, zIndex: c ? 2 : 1 }, children: c ? /* @__PURE__ */ n("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: Ee(c.card.suit) ? Be : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 27, fontWeight: 700 }, children: We(c.card.rank) }),
      /* @__PURE__ */ n("span", { style: { fontSize: 24 }, children: ve[c.card.suit] })
    ] }) }) : /* @__PURE__ */ n("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: p ? 22 : 0, height: 12, background: p ? "#9a9a9a" : "transparent" } }) }) }, s);
  }) }) });
}
function Jn({
  line: e,
  score: t,
  detail: o,
  action: r,
  actionNote: a,
  accent: l = "#384bb3"
}) {
  return /* @__PURE__ */ d("div", { style: { background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }, children: [
    /* @__PURE__ */ n("div", { style: { fontSize: 28, fontWeight: 700, color: "#000" }, children: e || "Board complete" }),
    t && /* @__PURE__ */ n("div", { style: { fontSize: 18, color: "#444", marginTop: 4 }, children: t }),
    /* @__PURE__ */ n("div", { style: { fontSize: 15, color: "#666", marginTop: 6 }, children: o }),
    r && /* @__PURE__ */ n(
      "a",
      {
        href: r.href,
        style: { display: "flex", alignItems: "center", justifyContent: "center", height: 48, marginTop: 14, borderRadius: 6, background: l, color: "#fff", fontSize: 19, fontWeight: 700, lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap" },
        children: r.label
      }
    ),
    r && a && /* @__PURE__ */ n("div", { style: { fontSize: 13, color: "#666", marginTop: 6 }, children: a })
  ] });
}
function bl({ onClose: e, children: t }) {
  return /* @__PURE__ */ n("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ d("div", { onClick: (o) => o.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ n("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    t
  ] }) });
}
const yl = "#384bb3", ml = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function xl({
  title: e = "Coach",
  status: t = "",
  accent: o = yl,
  lines: r,
  actions: a
}) {
  const l = (r && r.length ? r : []).map(
    (c) => typeof c == "string" ? { text: c, color: "#28312c" } : { text: c.text ?? "", color: c.color ?? "#28312c" }
  ), i = l.length === 0, s = a && a.length ? a : [];
  return /* @__PURE__ */ d("div", { "data-testid": "coach-panel", style: ml, children: [
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }, children: [
      /* @__PURE__ */ n("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: o, color: "#fff", fontSize: 12, fontWeight: 700 }, children: "C" }),
      /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: "#1d2421" }, children: e }),
      /* @__PURE__ */ n("span", { style: { flex: 1 } }),
      /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }, children: t })
    ] }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }, children: [
      l.map((c, u) => /* @__PURE__ */ n("div", { style: { fontSize: 14, lineHeight: 1.45, color: c.color }, children: c.text }, u)),
      i && /* @__PURE__ */ n("div", { style: { fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }, children: "Coach commentary appears here as the deal goes on." })
    ] }),
    s.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }, children: s.map((c, u) => /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: c.on ?? void 0,
        style: { height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: c.on ? "pointer" : "default" },
        children: c.label
      },
      u
    )) })
  ] });
}
const ht = { w: 1040, h: 678 }, It = 720, ue = {
  w: 56,
  h: 96,
  rank: 38,
  glyph: 36,
  inset: 5,
  overlap: 8,
  weight: 800,
  backW: 52
}, kl = ue.w - (ue.overlap ?? 1), Er = { w: ue.w, h: ue.h }, Sl = { rank: ue.rank, glyph: ue.glyph }, Rr = Gn(Er), vl = 260, Nn = 52, wl = 44, To = 54, Nl = 10, $l = 22, Eo = { row: Nl + ue.h + 3 + $l + 9, fan: 238 }, $n = 2, Ro = 40, Cl = 36, Wo = 19, Bl = 0.22, Tl = 4, Wr = 52, El = 37, Rl = El + Br(2, Wr), Wl = Math.round(Rr.h * 0.7) + 16, Al = 200, Il = 900, Ao = 150, Hl = (e) => Math.ceil(24 / (e || 1)), zl = 0, Io = (e) => Math.round(e * 8.8), Dl = 24, Ho = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, Ml = {
  ...xr("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, Ol = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function Ll({ children: e }) {
  const t = oe(null), o = oe(null), [r, a] = G(1);
  return wt(() => {
    const l = () => {
      const s = t.current, c = o.current;
      if (!s || !c) return;
      const u = s.clientWidth, p = s.clientHeight, b = c.offsetWidth, g = c.offsetHeight;
      if (!u || !p || !b || !g) return;
      const x = Math.min(1, u / b, p / g);
      a((h) => Math.abs(x - h) > 5e-3 ? x : h);
    };
    l();
    const i = new ResizeObserver(l);
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
function Pl({
  state: e,
  seats: t,
  visible: o,
  mySeat: r = null,
  legalCalls: a = [],
  legalPlays: l = [],
  myTurn: i = !1,
  boardLabel: s = "1",
  scoringLabel: c = "IMPs",
  auctionDisplay: u = "box",
  confirmBids: p = !1,
  completedAction: b,
  completedNote: g,
  resultLine: x = "",
  resultScore: h = "",
  resultDetail: m,
  onCall: N,
  onPlay: $,
  onMenu: I,
  onScoring: L,
  onClaim: y,
  controlsExtra: H,
  controlsExtraNarrow: v,
  railExtra: j,
  settings: z,
  viewHref: S,
  appearance: A,
  showToolbars: E = !0,
  showCoach: U = !0,
  coachShare: B = 30,
  coachTitle: q = "Coach",
  coachLines: P,
  coachActions: ne
}) {
  var yo;
  const R = A ?? Ml, _ = R.handLayout === "fan", D = R.bidPad === "columns", w = R.centreFrame, M = w ? Ol : {}, F = Number.parseInt(R.radius, 10) || 5, te = oe(null), [K, fe] = G({ w: ht.w, h: ht.h });
  wt(() => {
    const f = te.current;
    if (!f) return;
    const T = () => fe({ w: f.clientWidth || ht.w, h: f.clientHeight || ht.h });
    T();
    const Z = new ResizeObserver(T);
    return Z.observe(f), () => Z.disconnect();
  }, []);
  const [O, ee] = G(null), [k, W] = G(null);
  me(() => {
    ee(null), W(null);
  }, [e.auction.length]);
  const [J, X] = G(!1), re = I ?? (z ? () => X((f) => !f) : void 0), C = [...z ?? []], [Y, V] = G(!1), ie = K.w / Math.max(1, K.h) < 1.25, le = ie && K.w < 640, qe = ie && !le, we = qe ? { w: It, h: 1268 } : ht, he = e.contract, Ze = (he == null ? void 0 : he.declarer) ?? null, Se = Ze && e.phase !== "auction" ? al[Ze] : null, xe = e.phase === "auction", ze = e.phase === "play", _e = e.phase === "complete", De = new Set(a), ei = new Set(l.map((f) => `${f.suit}${f.rank}`)), Ne = xe && i && !k, ti = (f) => e.vul === "both" || e.vul === "All" || dl(f).toLowerCase() === String(e.vul).toLowerCase(), ni = Sn.indexOf(e.dealer), oi = U !== !1, en = Math.max(0, Math.min(55, B ?? 30)), Qn = 100 - en, qn = ze || _e, ri = Ze ? !!t[Ze].human : !1, tn = qn && !!Se && Se !== "S" && ri, Zn = qn && !!Se && Se !== "S" && !tn, ii = D && xe, nn = Math.min(1, K.w / It), Ct = Math.max(240, K.h * (Qn / 100) || 590), li = (f) => {
    const T = Math.max(Nn, Math.ceil(wl / (f || 1)) + 14);
    return Math.min(T, Math.max(Nn, Math.round(0.13 * Ct / (f || 1))));
  }, eo = (f) => {
    const T = Math.max(Ro, Math.ceil(Cl / (f || 1))), Z = Bl * Ct / (f || 1) - Wo;
    return Math.min(T, Math.max(Ro, Math.floor(Z / $n)));
  }, ai = (f) => $n * eo(f) + Wo, to = _e ? Al : xe ? Rl : Wl, no = (f, T) => {
    const Z = Ct / (f || 1), Q = zl + Hl(f) + (Zn ? To : 0) + (tn ? Eo.row : 0) + (!T && xe ? ai(f) : 0) + Eo[_ ? "fan" : "row"], se = li(f), Te = T ? 0 : Q + 2 * se + to - Z, ct = Te > 0 ? Math.max(Nn, se - Math.ceil(Te / 2)) : se, Rt = Q + 2 * ct;
    let Wt = 0, At;
    T ? (Wt = Math.max(30, Math.min(62, Math.floor((Z - Rt - Ao) / 8.3))), At = Math.max(Ao, Math.round(Z - Rt - Io(Wt)))) : At = Math.max(to, Math.min(Il, Math.round(Z - Rt)));
    const mo = Rt + (T ? Io(Wt) : 0) + At - (E ? 0 : 2 * ct);
    return { bar: ct, cell: Wt, centre: At, content: mo, usePad: T, trayRow: eo(f), scale: Math.min(1, nn, Ct / mo) };
  }, oo = (f) => {
    let T = no(nn, f);
    for (let Z = 0; Z < 10 && T.scale < nn - 5e-4; Z++) {
      const Q = no(T.scale, f);
      if (Math.abs(Q.scale - T.scale) < 5e-4) {
        T = Q;
        break;
      }
      T = Q;
    }
    return T;
  };
  let ke = oo(ii);
  ke.usePad && ke.cell * ke.scale < Dl && (ke = oo(!1));
  const si = ke.usePad, di = ke.usePad ? ke.cell : 38, on = ke.centre, ci = Math.max(0.7, Math.min(1, (on - 16) / Rr.h)), rn = Math.min(K.w / we.w, K.h / we.h) || 1, Xe = le ? ke.scale : rn, fi = le ? It : Math.max(we.w, K.w / rn), ln = le ? ke.content : Math.max(we.h, K.h / rn), hi = le ? -Math.round(ke.content * (1 - ke.scale)) : 0, ui = (f) => t[f].human ? kn : !_e && f === e.turn ? "#e8e8c8" : vr, pi = (f) => f === Se || !_e && f === e.turn ? "#fff" : "#b3b3b3", je = (f) => {
    Ne && (p ? W(f) : N == null || N(f));
  }, ro = () => {
    if (k == null) return;
    const f = k;
    W(null), N == null || N(f);
  }, io = () => {
    W(null), ee(null);
  }, an = (f) => (T) => i && ze && e.turn === f && ei.has(`${T.suit}${T.rank}`), Bt = (f, T = { w: 14, h: 71 }) => /* @__PURE__ */ n(vn, { cards: e.hands[f], hidden: !0, metrics: Ho, layout: "row", fanSpread: R.fanSpread, fanRadius: R.fanRadius, backColor: R.cardBack, backMetrics: T }), et = (f, T, Z = {}) => /* @__PURE__ */ n(hl, { seat: f, name: t[f].name, tag: t[f].tag, strip: t[f].strip, bg: ui(f), width: T, isDealer: f === e.dealer, metrics: Z }), Ke = (f, T = 16) => {
    if (!xe || u !== "seats") return null;
    const Z = e.auction.filter((Q) => Q.seat === f);
    return Z.length ? /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: Z.map((Q, se) => {
      const Te = se === Z.length - 1;
      return /* @__PURE__ */ n("span", { style: { background: Te ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: T, fontWeight: Te ? 700 : 400, padding: "0 5px", color: Nr(Q.call) }, children: On(Q.call) }, se);
    }) }) : null;
  }, sn = (f, T = Ho) => /* @__PURE__ */ n(
    vn,
    {
      cards: e.hands[f],
      metrics: T,
      layout: "row",
      fanSpread: R.fanSpread,
      fanRadius: R.fanRadius,
      backColor: R.cardBack,
      isPlayable: an(f),
      onPlay: (Z) => $ == null ? void 0 : $(f, Z)
    }
  ), Tt = (f, T = { width: 197 }) => /* @__PURE__ */ n(
    Nt,
    {
      cards: e.hands[f],
      panelBg: pi(f),
      width: T.width,
      suitW: T.suitW,
      font: T.font,
      pad: T.pad,
      bare: T.bare,
      touch: !!T.touch && i && ze && e.turn === f,
      isPlayable: an(f),
      onPlay: (Z) => $ == null ? void 0 : $(f, Z)
    }
  ), dn = (f, T) => {
    const Z = T ?? {
      w: R.cardW,
      h: Math.round(R.cardW * 1.42),
      rank: Math.round(R.cardW * 0.46),
      glyph: Math.round(R.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ n(
      vn,
      {
        cards: e.hands[f],
        metrics: Z,
        layout: "fan",
        fanSpread: R.fanSpread,
        fanRadius: R.fanRadius,
        backColor: R.cardBack,
        isPlayable: an(f),
        onPlay: (Q) => $ == null ? void 0 : $(f, Q)
      }
    );
  }, lo = (f) => {
    const T = _ && o[f];
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      Ke(f),
      o[f] ? T ? dn(f) : sn(f) : Bt(f),
      et(f, T ? 197 : o[f] ? 50 + Math.max(0, e.hands[f].length - 1) * 49 : 197)
    ] });
  }, ao = (f) => /* @__PURE__ */ d("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    Ke(f),
    o[f] ? Tt(f, { width: 197 }) : Bt(f),
    et(f, 197)
  ] }), so = [];
  {
    const f = [
      ...Array.from({ length: Sn.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let T = 0; T < f.length; T += 4) so.push(f.slice(T, T + 4));
  }
  const cn = (f = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ n(
    Tr,
    {
      bg: R.auctionBg,
      m: f,
      heads: Sn.map((T) => ({ seat: T, vul: ti(T), isDealer: T === e.dealer })),
      rows: so,
      dealerCol: ni,
      emptyText: e.auction.length === 0 ? e.dealer === r ? "You deal" : `${e.dealer} deals` : null
    }
  ), fn = ze ? ((yo = e.tricks[e.tricks.length - 1]) == null ? void 0 : yo.plays) ?? [] : [], gi = (f = 1) => /* @__PURE__ */ n(wn, { plays: fn, turn: e.turn, scale: f }), bi = (f) => /* @__PURE__ */ n(wn, { variant: "cluster", plays: fn, turn: e.turn, scale: f, card: Er, index: Sl }), hn = /* @__PURE__ */ n(
    Jn,
    {
      line: x,
      score: h,
      detail: m ?? `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: b,
      actionNote: g,
      accent: R.accent
    }
  ), yi = /* @__PURE__ */ n(wn, { variant: "pill", plays: fn, turn: e.turn }), un = (f, T, Z, Q, se, Te = 21) => ({
    flex: "none",
    width: f,
    height: T,
    border: `1px solid ${Q}`,
    borderRadius: F,
    background: Z,
    color: "#fff",
    fontSize: Te,
    fontWeight: 700,
    lineHeight: 1,
    cursor: se ? "pointer" : "default",
    opacity: se ? 1 : 0.42
  }), co = (f, T) => /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        onClick: ro,
        style: un(240, f, "#116710", "#0c4b0b", !0, T),
        children: [
          "Confirm ",
          On(k ?? "")
        ]
      }
    ),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: io,
        style: un(120, f, "#8a3030", "#5e1c1c", !0, T),
        children: "Cancel"
      }
    )
  ] }), mi = (f, T, Z) => [1, 2, 3, 4, 5, 6, 7].map((Q) => {
    const se = ft.some((ct) => De.has(`${Q}${ct}`)), Te = Ne && se;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: Te ? () => ee(O === Q ? null : Q) : void 0,
        "aria-label": `Level ${Q}`,
        style: { flex: "none", width: f, height: T, border: "1px solid #8a8a6a", borderRadius: F, background: O === Q ? kn : "#f8f8f8", color: "#000", fontSize: Z, lineHeight: 1, cursor: Te ? "pointer" : "default", opacity: Te ? 1 : 0.42 },
        children: Q
      },
      Q
    );
  }), xi = (f, T, Z, Q) => O ? ft.filter((se) => De.has(`${O}${se}`)).map((se) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(`${O}${se}`),
      "aria-label": `${O}${se === "N" ? "NT" : se}`,
      style: { flex: "none", width: se === "N" ? Z : Q, height: f, border: "1px solid #8a8a6a", borderRadius: F, background: "#f8f8f8", color: Ee(se) ? Be : "#000", fontSize: T, lineHeight: 1, cursor: "pointer" },
      children: ve[se]
    },
    se
  )) : null, ki = (f, T, Z) => ["X", "XX"].map((Q) => Ne && De.has(Q) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(Q),
      "aria-label": Q === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: f, height: T, border: `1px solid ${Q === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: F, background: Q === "X" ? Be : "#1034a6", color: "#fff", fontSize: Z, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: Q
    },
    Q
  ) : /* @__PURE__ */ n("span", { style: { width: f, height: T } }, Q)), Si = (f, T, Z) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: Ne ? () => je("P") : void 0,
      "aria-label": "Pass",
      style: un(f, T, Ne ? "#116710" : "#a7b8a2", "#0c4b0b", Ne, Z),
      children: "Pass"
    }
  ), pn = De.has("X") || De.has("XX"), fo = O ? ft.filter((f) => De.has(`${O}${f}`)) : [], vi = /* @__PURE__ */ n("div", { style: { width: 581, flex: "none", background: R.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: k ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    co(44, 21)
  ] }) : /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      Si(120, 37, 21),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: mi(57, 37, 23) })
    ] }),
    (pn || fo.length > 0) && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: ki(57, 37, 21) }),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: xi(37, 23, 120, 57) })
    ] })
  ] }) }), tt = le ? ke.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, Xe))), wi = "1.75fr repeat(7,1fr)", Ni = pn ? "repeat(4,1fr) 1.75fr 1fr 1fr" : "repeat(4,1fr) 1.75fr", Et = (f) => ({
    minWidth: 0,
    height: tt,
    border: "1px solid #8a8a6a",
    borderRadius: F,
    fontWeight: 800,
    lineHeight: 1,
    padding: 0,
    ...f
  }), $i = ft.map((f) => !!O && fo.includes(f) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(`${O}${f}`),
      "aria-label": `${O}${f === "N" ? "NT" : f}`,
      style: Et({ background: "#f8f8f8", color: Ee(f) ? Be : "#000", fontSize: f === "N" ? 28 : 38, cursor: "pointer" }),
      children: ve[f]
    },
    f
  ) : /* @__PURE__ */ n("span", { style: { minWidth: 0, height: tt, pointerEvents: "none" } }, f)), Ci = pn ? ["X", "XX"].map((f) => Ne && De.has(f) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(f),
      "aria-label": f === "X" ? "Double" : "Redouble",
      style: Et({ border: `1px solid ${f === "X" ? "#8f0000" : "#0a2170"}`, background: f === "X" ? Be : "#1034a6", color: "#fff", fontSize: 28, cursor: "pointer" }),
      children: f
    },
    f
  ) : /* @__PURE__ */ n("span", { style: { minWidth: 0, height: tt } }, f)) : null, ho = /* @__PURE__ */ n("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: R.trayBg, padding: "6px 8px 8px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: k ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: $n * tt + 5 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 20, fontWeight: 700, color: "#3a3a20" }, children: "Confirm your call" }),
    co(tt, 26)
  ] }) : /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: wi, gap: 5 }, children: [
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: Ne ? () => je("P") : void 0,
          "aria-label": "Pass",
          style: Et({ border: "1px solid #0c4b0b", background: Ne ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 28, cursor: Ne ? "pointer" : "default", opacity: Ne ? 1 : 0.42 }),
          children: "Pass"
        }
      ),
      [1, 2, 3, 4, 5, 6, 7].map((f) => {
        const T = ft.some((Q) => De.has(`${f}${Q}`)), Z = Ne && T;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: Z ? () => ee(O === f ? null : f) : void 0,
            "aria-label": `Level ${f}`,
            style: Et({ background: O === f ? kn : "#f8f8f8", color: "#000", fontSize: 30, cursor: Z ? "pointer" : "default", opacity: Z ? 1 : 0.42 }),
            children: f
          },
          f
        );
      })
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: Ni, gap: 5 }, children: [
      $i,
      Ci
    ] })
  ] }) }), gn = {
    legalCalls: a,
    live: Ne,
    pending: k,
    onStage: je,
    onConfirm: ro,
    onCancel: io,
    radius: F
  }, Bi = /* @__PURE__ */ n(mt, { cell: 46, ...gn }), Ti = /* @__PURE__ */ n("div", { style: { width: "100%", flex: "none", background: R.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ n(mt, { cell: 84, minCellH: tt, ...gn }) }), uo = { N: "North", E: "East", S: "South", W: "West" }, po = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), bn = [
    { kind: "chip", label: "Board", value: String(s) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: po, color: po === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: he ? `${he.level}${ve[he.strain]}${he.doubled === 1 ? "X" : he.doubled === 2 ? "XX" : ""}` : "—", color: he && Ee(he.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: he ? uo[he.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: c, title: "Scoring mode", on: L ?? null }
  ], yn = (f) => [
    ...f ? [{ kind: "node", node: f }] : [],
    { kind: "divider" },
    ...S ? [{ kind: "button", label: S.label, title: "Four-hand record", href: S.href }] : [],
    ...j ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => V(!0) }] : [],
    { kind: "spacer" },
    ...y && ze ? [{ kind: "button", label: "Claim", tone: "accent", on: y }] : [],
    ...re ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: re }] : []
  ], go = Y && j ? /* @__PURE__ */ n(bl, { onClose: () => V(!1), children: j }) : null, Ei = (f) => Gt.map((T) => {
    const Z = e.hands[f].filter((Q) => Q.suit === T).sort((Q, se) => se.rank - Q.rank).map((Q) => We(Q.rank)).join("");
    return Z ? { suit: T, ranks: Z } : null;
  }).filter((T) => T != null), Ri = Zn && Se ? /* @__PURE__ */ d("div", { "data-testid": "dummy-strip", style: { flex: "none", height: To, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: uo[Se] }),
    o[Se] ? Ei(Se).map((f) => /* @__PURE__ */ d("span", { style: { fontSize: 26, fontWeight: 700, color: "#f2f6f4", whiteSpace: "nowrap" }, children: [
      /* @__PURE__ */ n("span", { style: { color: Ee(f.suit) ? Be : "#111" }, children: ve[f.suit] }),
      f.ranks
    ] }, f.suit)) : null
  ] }) : null, Wi = tn && Se ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: o[Se] ? _ ? dn(Se, ue) : sn(Se, ue) : Bt(Se, { w: ue.backW, h: ue.h }) })
  ) : null, mn = Math.max(1, e.hands.S.length), Ai = o.S ? ue.w + (mn - 1) * kl : Math.round(ue.backW * mn + 1.5 * (mn - 1)) + 4, Ii = /* @__PURE__ */ d("div", { "data-testid": "phone-stage", style: { flex: "none", width: It, minHeight: ln, height: ln, transform: `scale(${Xe})`, transformOrigin: "top center", marginBottom: hi, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    E && /* @__PURE__ */ n(nt, { side: "top", items: bn, condensed: !0, thickness: ke.bar, bg: R.barBg, accent: R.accent }),
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: R.feltFlat }, children: [
      Ri,
      Wi,
      /* @__PURE__ */ n("div", { "data-testid": "centre-band", style: { flex: "none", height: on, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: /* @__PURE__ */ d("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: xe ? "flex-start" : "center", justifyContent: "center", ...w ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
        xe && u === "box" ? cn({ width: 430, height: "auto", maxH: on, headFont: 26, cellFont: 24, radius: 0, cellMinH: Wr, rowsVisible: Tl }) : null,
        xe && u === "seats" ? /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((f) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ n("span", { style: { width: 30, height: 30, background: wr, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: f }),
          Ke(f, 22) ?? /* @__PURE__ */ n("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
        ] }, f)) }) : null,
        ze ? bi(ci) : null,
        _e ? hn : null
      ] }) }),
      xe ? si ? /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ n(mt, { cell: di, ...gn }) }) : ho : null,
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        Ke("S"),
        o.S ? _ ? dn("S", ue) : sn("S", ue) : Bt("S", { w: ue.backW, h: ue.h }),
        et("S", Math.max(vl, Ai), { weight: 700 })
      ] }) })
    ] }),
    E && /* @__PURE__ */ n(nt, { side: "bottom", items: yn(v ?? H), condensed: !0, thickness: ke.bar, bg: R.barBg, accent: R.accent })
  ] }), Hi = (f) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ke(f, 22),
    et(f, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    o[f] && Tt(f, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), bo = (f) => /* @__PURE__ */ d("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ke(f, 22),
    et(f, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    o[f] && Tt(f, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), zi = (f) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ke(f, 22),
    et(f, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    o[f] && Tt(f, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), Di = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: R.stageBg }, children: [
    E && /* @__PURE__ */ n(nt, { side: "top", items: bn, scale: Xe, minTouch: 44, bg: R.barBg, accent: R.accent }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: R.felt }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Hi("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        bo("W"),
        /* @__PURE__ */ d("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...M }, children: [
          xe && u === "box" ? cn({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          ze ? yi : null,
          _e ? hn : null
        ] }),
        bo("E")
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: zi("S") })
    ] }),
    xe ? D ? Ti : ho : null,
    E && /* @__PURE__ */ n(nt, { side: "bottom", items: yn(v ?? H), scale: Xe, minTouch: 44, bg: R.barBg, accent: R.accent })
  ] }), Mi = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    E && /* @__PURE__ */ n(nt, { side: "top", items: bn, scale: Xe, bg: R.barBg, accent: R.accent }),
    /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: R.felt }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: lo("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        ao("W"),
        /* @__PURE__ */ n("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...M }, children: /* @__PURE__ */ d(Ll, { children: [
          xe && D ? Bi : xe && u === "box" ? cn() : null,
          ze ? gi() : null,
          _e ? hn : null
        ] }) }),
        ao("E")
      ] }),
      /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ n("div", { style: { height: xe && !D ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: xe && !D ? vi : null }),
        lo("S")
      ] })
    ] }) }),
    E && /* @__PURE__ */ n(nt, { side: "bottom", items: yn(H), scale: Xe, bg: R.barBg, accent: R.accent })
  ] });
  return le ? /* @__PURE__ */ d("div", { ref: te, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: R.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", maxHeight: `${Qn}%`, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: Ii }) }),
    en > 0 && /* @__PURE__ */ n("div", { style: { flex: "1 1 auto", minHeight: `${en}%`, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: oi && /* @__PURE__ */ n(xl, { title: q, accent: R.accent, lines: P, actions: ne }) }),
    go,
    J && !I && /* @__PURE__ */ n($o, { accent: R.accent, items: C, onClose: () => X(!1) })
  ] }) : /* @__PURE__ */ n("div", { ref: te, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: R.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: R.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: fi, height: ln, transform: `scale(${Xe})` }, children: [
    qe ? Di : Mi,
    go,
    J && !I && /* @__PURE__ */ n($o, { accent: R.accent, items: C, onClose: () => X(!1) })
  ] }) });
}
const zo = "#ffce04", Ht = "#cb0200", Do = "#016700", Fl = "#cbcbcb", Mo = "#99cccc", _l = "#336799", Ar = 648, Pn = 400, Fn = 8, _n = 8, Me = { w: _n * 2 + Ar * 3 + Fn * 2, h: _n * 2 + Pn * 3 + Fn * 2 }, Oo = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Lo = ["W", "N", "E", "S"], Xl = ["S", "H", "D", "C"], Po = (e) => e === "H" || e === "D", jl = (e) => /^[1-7][CDHSN]$/.test(e), Kl = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e);
function Yl({
  boardLabel: e,
  dealer: t,
  vul: o,
  hands: r,
  names: a,
  visible: l,
  auction: i = [],
  highlightSeat: s = null,
  info: c = [],
  result: u = [],
  nav: p
}) {
  const b = oe(null), [g, x] = G({ w: Me.w, h: Me.h });
  wt(() => {
    const S = b.current;
    if (!S) return;
    const A = () => x({ w: S.clientWidth || Me.w, h: S.clientHeight || Me.h });
    A();
    const E = new ResizeObserver(A);
    return E.observe(S), () => E.disconnect();
  }, []);
  const h = Math.min(g.w / Me.w, g.h / Me.h) || 1, m = (S) => {
    const A = o.toLowerCase();
    return A === "both" || A === "all" || A === (S === "N" || S === "S" ? "ns" : "ew");
  }, N = 57, $ = 145, I = (S) => {
    const A = m(S), E = S === t;
    return /* @__PURE__ */ n("div", { style: { background: E ? zo : A ? Ht : "#fff", color: A && !E ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }, children: S });
  }, L = /* @__PURE__ */ d("div", { style: { width: N * 2 + $ + 4, display: "grid", gridTemplateColumns: `${N}px ${$}px ${N}px`, gridTemplateRows: `${N}px ${$}px ${N}px`, gap: 2, padding: 2, background: "#000", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("N"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("W"),
    /* @__PURE__ */ n("div", { title: String(e), style: { background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(e).length > 8 ? 24 : String(e).length > 3 ? 40 : 104, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }, children: e }),
    I("E"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("S"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } })
  ] }), y = (S) => {
    const A = (l == null ? void 0 : l[S]) ?? !0;
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignSelf: "stretch" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", height: 70, background: S === s ? zo : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }, children: [
        /* @__PURE__ */ n("span", { style: { flex: "none", width: 70, height: 70, background: _l, color: "#fff", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: S }),
        /* @__PURE__ */ n("span", { style: { padding: "0 14px", fontSize: 52, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: a[S] }),
        !A && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", paddingRight: 14, fontSize: 24, color: "#666" }, children: "hidden" })
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: 1, background: Fl, padding: "4px 14px 10px" }, children: Xl.map((E) => {
        const U = [...r[S]].filter((B) => B.suit === E).sort((B, q) => q.rank - B.rank);
        return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.35, fontSize: 58, color: Po(E) ? Ht : "#000" }, children: [
          /* @__PURE__ */ n("span", { style: { flex: "none", width: 58 }, children: Oo[E] }),
          /* @__PURE__ */ n("span", { style: { color: "#000", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }, children: A && U.length ? U.map((B) => Kl(B.rank)).join("") : "—" })
        ] }, E);
      }) })
    ] });
  }, H = [];
  {
    const S = [
      ...Array.from({ length: Lo.indexOf(t) }, () => null),
      ...i
    ];
    for (let A = 0; A < S.length; A += 4) H.push(S.slice(A, A + 4));
  }
  const v = (S) => jl(S) ? /* @__PURE__ */ d(ye, { children: [
    S[0],
    /* @__PURE__ */ n("span", { style: { color: Po(S[1] ?? "") ? Ht : "#000" }, children: Oo[S[1] ?? ""] })
  ] }) : S === "P" ? "P" : S, j = /* @__PURE__ */ d("div", { style: { width: "100%", height: 374, background: Mo, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: Lo.map((S) => /* @__PURE__ */ n("span", { style: { padding: "2px 0", fontSize: 42, fontWeight: 700, lineHeight: 1.15, background: m(S) ? Ht : "#fff", color: m(S) ? "#fff" : "#000" }, children: S }, S)) }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px" }, children: [
      H.map((S, A) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }, children: [0, 1, 2, 3].map((E) => /* @__PURE__ */ n("span", { style: { fontSize: 42, lineHeight: 1.25, color: "#000" }, children: S[E] ? v(S[E].call) : "" }, E)) }, A)),
      i.length === 0 && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 32, color: "#1e4747", paddingTop: 10 }, children: "No calls yet" })
    ] })
  ] }), z = (S) => /* @__PURE__ */ n("div", { style: { width: "100%", alignSelf: "end", background: Mo, padding: "10px 16px", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: S.map((A, E) => /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 40, lineHeight: 1.3, color: "#000" }, children: [
    /* @__PURE__ */ n("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: A.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700 }, children: A.value })
  ] }, E)) });
  return /* @__PURE__ */ n("div", { ref: b, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: Do, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ n("div", { style: { flex: "none", transformOrigin: "center center", width: Me.w, height: Me.h, transform: `scale(${h})` }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${Ar}px)`, gridTemplateRows: `repeat(3, ${Pn}px)`, gap: Fn, padding: _n, background: Do }, children: [
    /* @__PURE__ */ d("div", { style: { justifySelf: "start", alignSelf: "start", display: "flex", gap: 24, alignItems: "flex-start", maxHeight: Pn, overflow: "hidden" }, children: [
      L,
      p
    ] }),
    y("N"),
    /* @__PURE__ */ n("div", { style: { alignSelf: "start", width: "100%" }, children: j }),
    y("W"),
    /* @__PURE__ */ n("div", {}),
    y("E"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: z(c) }),
    y("S"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: z(u) })
  ] }) }) });
}
const $t = "#0d707c", Ul = "#1c8a5a", Gl = "#c0392b", Jl = "#8b9a93", xt = "#55636f", Fo = "#17211d", Xn = "#9aa8a1", _o = "#eef2ef", Vl = "#0e1a1c", St = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", Ir = "✕", Ql = "◆", ql = "⇄", Zl = "–", ea = "—", Hr = "·";
function Ae(e) {
  return e === "pos" ? Ul : e === "neg" ? Gl : Jl;
}
function Jt(e) {
  return e == null || !Number.isFinite(e) ? "neutral" : e > 0 ? "pos" : e < 0 ? "neg" : "neutral";
}
const zr = 40;
function ta({
  title: e,
  boardNo: t,
  boardsTotal: o,
  showResults: r,
  onResults: a,
  accent: l = $t,
  height: i = zr
}) {
  const s = Math.max(0, Math.round(o)), c = Math.max(1, Math.round(t)), u = Math.max(0, Math.min(s, c - 1)), p = s > 0 ? Math.round(u / s * 100) : 0;
  return /* @__PURE__ */ d("div", { style: {
    position: "relative",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: i,
    padding: "0 12px",
    background: Vl,
    fontFamily: St
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
        children: `Board ${c} of ${s}`
      }
    ),
    /* @__PURE__ */ n("span", { style: { flex: 1, minWidth: 8 } }),
    r && /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: a,
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
        "aria-valuemax": s,
        "aria-valuenow": u,
        "aria-valuetext": `${u} of ${s} boards done`,
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: "rgba(255,255,255,.10)",
          display: "block"
        },
        children: /* @__PURE__ */ n("span", { style: { display: "block", height: "100%", width: `${p}%`, background: l } })
      }
    )
  ] });
}
function na(e) {
  if (e.length > 0 && e.every((i) => typeof i.rank == "number")) return e.map((i) => ({ ...i, rank: i.rank }));
  const o = e.map((i, s) => ({ r: i, i: s }));
  o.sort((i, s) => {
    const c = typeof i.r.value == "number" ? i.r.value : Number.NEGATIVE_INFINITY, u = typeof s.r.value == "number" ? s.r.value : Number.NEGATIVE_INFINITY;
    return u === c ? i.i - s.i : u - c;
  });
  let r = 0, a = 0, l = null;
  return o.map(({ r: i }) => {
    a += 1;
    const s = typeof i.value == "number" ? i.value : Number.NEGATIVE_INFINITY;
    return (l === null || s !== l) && (r = a, l = s), { ...i, rank: r };
  });
}
function oa(e) {
  if (!e) return Number.NaN;
  if (typeof e.value == "number" && Number.isFinite(e.value)) return e.value;
  const t = (e.text ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!t) return Number.NaN;
  const o = Number(t.replace(/^\+/, ""));
  return Number.isFinite(o) ? o : Number.NaN;
}
function ra(e) {
  const t = e.map(oa);
  let o = Number.NEGATIVE_INFINITY;
  for (const r of t) Number.isFinite(r) && r > o && (o = r);
  return Number.isFinite(o) ? t.map((r) => Number.isFinite(r) && r === o) : t.map(() => !1);
}
const Dr = { active: !1, picks: [] };
function ia(e, t) {
  switch (t.type) {
    case "start":
      return { active: !0, picks: [] };
    case "cancel":
      return Dr;
    case "pick": {
      if (!e.active) return e;
      const { boardNo: o, key: r } = t;
      if (e.picks.some((i) => i.boardNo === o && i.key === r))
        return {
          active: !0,
          picks: e.picks.filter((i) => !(i.boardNo === o && i.key === r))
        };
      const l = e.picks[0];
      return l && l.boardNo !== o || e.picks.length >= 2 ? e : { active: !0, picks: [...e.picks, { boardNo: o, key: r }] };
    }
    default:
      return e;
  }
}
function la(e) {
  const [t, o] = e.picks;
  return !t || !o ? null : { boardNo: t.boardNo, a: t.key, b: o.key };
}
function aa(e, t) {
  const o = e.picks[0];
  return e.active && !!o && o.boardNo !== t;
}
function sa(e, t, o) {
  return e.picks.some((r) => r.boardNo === t && r.key === o);
}
const Cn = {
  display: "grid",
  gridTemplateColumns: "26px 1fr auto",
  alignItems: "center",
  gap: 10
};
function da({
  rows: e,
  benRow: t,
  scoringLabel: o,
  accent: r = $t,
  note: a,
  legend: l,
  emptyLabel: i = "No finished players yet."
}) {
  const s = na(e);
  return /* @__PURE__ */ d("div", { style: { fontFamily: St, color: "#17211d" }, children: [
    a && /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: Xn, marginBottom: 2 }, children: a }),
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          ...Cn,
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
    s.length === 0 && /* @__PURE__ */ n("div", { style: { padding: "10px 8px", fontSize: 12.5, color: Xn }, children: i }),
    /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: s.map((c, u) => {
      const p = !!c.isYou, b = c.marks ?? [], g = c.tone ? Ae(c.tone) : Ae(Jt(c.value));
      return /* @__PURE__ */ d(
        "div",
        {
          style: {
            ...Cn,
            padding: "9px 8px",
            borderRadius: 9,
            background: p ? "#eff7f6" : "transparent"
          },
          children: [
            /* @__PURE__ */ n(
              "span",
              {
                style: {
                  fontSize: 13,
                  fontWeight: 800,
                  textAlign: "center",
                  color: c.rank <= 3 ? "#22302a" : "#8b9a93"
                },
                children: c.rank
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
                    fontWeight: p ? 800 : 600,
                    color: p ? r : "#25332c"
                  },
                  children: c.name
                }
              ),
              b.includes("editor") && /* @__PURE__ */ n(
                "span",
                {
                  role: "img",
                  title: "Set the boards - opened the pack editor",
                  "aria-label": "Set the boards",
                  style: { flex: "none", fontSize: 10, lineHeight: 1, color: r },
                  children: Ql
                }
              ),
              b.includes("moderator") && /* @__PURE__ */ n(
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
                    color: xt,
                    fontSize: 8.5,
                    fontWeight: 800,
                    letterSpacing: ".07em",
                    lineHeight: 1
                  },
                  children: "MOD"
                }
              )
            ] }),
            /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 800, textAlign: "right", color: g }, children: c.total })
          ]
        },
        `${c.name}-${u}`
      );
    }) }),
    t && /* @__PURE__ */ d(
      "div",
      {
        style: {
          ...Cn,
          marginTop: 7,
          padding: "11px 8px 3px",
          borderTop: `1px solid ${_o}`
        },
        children: [
          /* @__PURE__ */ n("span", { "aria-hidden": !0, style: { textAlign: "center", fontSize: 12, color: "#9aa8b0" }, children: Zl }),
          /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: 13, fontWeight: 700, color: xt }, children: t.label ?? "BEN" }),
            /* @__PURE__ */ n("span", { style: { fontSize: 10.5, color: "#8a949c" }, children: t.note ?? `benchmark ${Hr} unranked` })
          ] }),
          /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 800, textAlign: "right", color: xt }, children: t.total })
        ]
      }
    ),
    l && /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${_o}`,
          fontSize: 10,
          color: "#a2ada7",
          flexWrap: "wrap"
        },
        children: l
      }
    )
  ] });
}
function ca({
  open: e,
  onClose: t,
  standings: o,
  children: r,
  boards: a,
  viewportPhone: l = !0,
  heading: i = "Results",
  subtitle: s,
  boardsHeading: c = "Board by board",
  accent: u = $t
}) {
  if (me(() => {
    if (!e) return;
    const g = (x) => {
      x.key === "Escape" && t();
    };
    return window.addEventListener("keydown", g), () => window.removeEventListener("keydown", g);
  }, [e, t]), !e) return null;
  const p = l;
  return /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ n(
      "div",
      {
        onClick: t,
        "aria-hidden": !0,
        style: { position: "absolute", inset: 0, zIndex: 40, background: "rgba(6,14,11,.52)" }
      }
    ),
    /* @__PURE__ */ d("div", { role: "dialog", "aria-modal": "true", "aria-label": i, style: p ? {
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
      fontFamily: St,
      color: Fo
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
      fontFamily: St,
      color: Fo
    }, children: [
      p && /* @__PURE__ */ n(
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
            padding: p ? "6px 18px 12px" : "18px 20px 12px"
          },
          children: [
            /* @__PURE__ */ d("div", { style: { minWidth: 0 }, children: [
              /* @__PURE__ */ n("div", { style: { fontSize: 16, fontWeight: 800, color: "#16201c", lineHeight: 1.2 }, children: i }),
              s && /* @__PURE__ */ n(
                "div",
                {
                  style: {
                    marginTop: 3,
                    fontSize: 11.5,
                    color: Xn,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  },
                  children: s
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
                children: Ir
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
            padding: p ? "0 18px 22px" : "0 20px 20px"
          },
          children: [
            o && /* @__PURE__ */ n(da, { ...o, accent: o.accent ?? u }),
            r,
            a.length > 0 && /* @__PURE__ */ d(ye, { children: [
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
                  children: c
                }
              ),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, marginTop: 8, overflowX: "auto", paddingBottom: 4 }, children: a.map((g) => {
                const x = !!g.current, h = g.tone ? Ae(g.tone) : Ae(Jt(g.value));
                return /* @__PURE__ */ d(
                  "div",
                  {
                    title: `Board ${g.boardNo}${x ? " - open at the table behind this sheet" : ""}`,
                    style: {
                      flex: "none",
                      width: p ? 38 : 48,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      padding: "6px 2px",
                      borderRadius: 8,
                      background: x ? "#eff7f6" : "#f7faf8",
                      border: `1px solid ${x ? u : "#e8eeea"}`
                    },
                    children: [
                      /* @__PURE__ */ n("span", { style: { fontSize: 9.5, fontWeight: 700, color: x ? u : "#a2ada7" }, children: g.boardNo }),
                      /* @__PURE__ */ n("span", { style: { fontSize: 12.5, fontWeight: 800, color: h }, children: g.text })
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
const fa = "Tinted cell = best score on that board (ties share it). BEN is a benchmark column and is never ranked.", zt = 46;
function ha({
  columns: e,
  rows: t,
  totals: o,
  onCompare: r,
  accent: a = $t,
  legend: l = fa,
  viewportPhone: i = !0
}) {
  const [s, c] = Pi(ia, Dr), u = typeof r == "function", p = u && s.active, b = la(s), g = i ? 46 : 54, x = zt + e.length * (g + 4) + 8, h = (y) => {
    const H = e.find((v) => v.key === y);
    return H ? H.name ?? H.label : y;
  }, m = s.picks[0], N = p ? m ? b ? `Board ${b.boardNo} ${Hr} ${h(b.a)} vs ${h(b.b)}` : `Board ${m.boardNo}: ${h(m.key)} picked ${ea} now pick a second player in that row.` : "Pick two players on the same board." : "Pick two cells on the same board to compare those two lines.", $ = {
    marginTop: 6,
    minHeight: 34,
    lineHeight: 1.45,
    fontSize: b ? 12 : 11.5,
    fontWeight: b ? 800 : p && m ? 700 : 600,
    color: b ? "#22302a" : p ? m ? a : "#5f6f68" : "#9aa8a1"
  }, I = () => {
    !b || !r || (r(b), c({ type: "cancel" }));
  }, L = (y) => ({
    width: g,
    flex: "none",
    textAlign: "center",
    padding: "5px 2px",
    borderRadius: "7px 7px 0 0",
    fontSize: 10.5,
    fontWeight: 800,
    background: y.isBenchmark ? "#eef1f4" : y.isYou ? "#eff7f6" : "#f7faf8",
    color: y.isBenchmark ? xt : y.isYou ? a : "#5a6a63"
  });
  return /* @__PURE__ */ d("div", { style: { fontFamily: St, color: "#17211d" }, children: [
    u && /* @__PURE__ */ d("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minHeight: 32 }, children: [
        !p && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => c({ type: "start" }),
            style: {
              flex: "none",
              height: 32,
              padding: "0 13px",
              border: "1px solid #cfe1de",
              borderRadius: 9,
              background: "#eff7f6",
              color: a,
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer"
            },
            children: `${ql} Compare`
          }
        ),
        p && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => c({ type: "cancel" }),
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
            children: `${Ir} Cancel`
          }
        ),
        p && b && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: I,
            style: {
              flex: "none",
              height: 32,
              padding: "0 14px",
              border: 0,
              borderRadius: 9,
              background: a,
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
      /* @__PURE__ */ n("div", { style: $, "aria-live": "polite", children: N })
    ] }),
    /* @__PURE__ */ n("div", { style: { overflowX: "auto", WebkitOverflowScrolling: "touch" }, children: /* @__PURE__ */ d("div", { style: { minWidth: x }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", gap: 4, marginBottom: 5 }, children: [
        /* @__PURE__ */ n("span", { style: { width: zt, flex: "none" } }),
        e.map((y) => /* @__PURE__ */ n("span", { style: L(y), title: y.name ?? y.label, children: y.label }, y.key))
      ] }),
      t.map((y) => {
        const H = ra(y.cells), v = aa(s, y.boardNo);
        return /* @__PURE__ */ d(
          "div",
          {
            style: { display: "flex", gap: 4, marginBottom: 3, alignItems: "stretch" },
            children: [
              /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    width: zt,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 7px",
                    borderRadius: 7,
                    background: "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#3f4f48",
                    opacity: v ? 0.32 : 1
                  },
                  children: y.label ?? `Bd ${y.boardNo}`
                }
              ),
              e.map((j, z) => {
                const S = y.cells[z], A = (S == null ? void 0 : S.text) ?? "", E = !!H[z], U = sa(s, y.boardNo, j.key), B = p && !v, q = j.name ?? j.label, P = U ? "#d9efeb" : E ? "#e4f2ef" : j.isBenchmark ? "#f6f8f9" : j.isYou ? "#f3faf9" : "#fff", ne = U ? `2px solid ${a}` : B ? "1px dashed #b3d2ce" : E ? "1px solid #a9d3cd" : j.isYou ? "1px solid #dcefec" : j.isBenchmark ? "1px solid #dde3e7" : "1px solid #eef2ef", R = p ? v ? `Not this row - both picks must be on Board ${m ? m.boardNo : y.boardNo}` : U ? "Click again to deselect" : `Pick ${q} on Board ${y.boardNo}` : E ? `Best on Board ${y.boardNo}` : "";
                return /* @__PURE__ */ n(
                  "button",
                  {
                    type: "button",
                    disabled: !B,
                    "aria-pressed": B ? U : void 0,
                    "aria-label": `${q}, board ${y.boardNo}${A ? `: ${A}` : ""}${E ? ", best on this board" : ""}`,
                    title: R,
                    onClick: () => c({ type: "pick", boardNo: y.boardNo, key: j.key }),
                    style: {
                      width: g,
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      padding: U ? "5px 1px" : "6px 2px",
                      background: P,
                      border: ne,
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: E ? 800 : j.isYou || j.isBenchmark ? 700 : 600,
                      color: S != null && S.tone ? Ae(S.tone) : Ae(Jt(S == null ? void 0 : S.value)),
                      opacity: v ? 0.32 : 1,
                      cursor: p ? v ? "not-allowed" : "pointer" : "default"
                    },
                    children: A
                  },
                  j.key
                );
              })
            ]
          },
          y.boardNo
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
                  width: zt,
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
            e.map((y, H) => {
              const v = o[H];
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
                    background: y.isBenchmark ? "#eef1f4" : y.isYou ? "#eff7f6" : "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: y.isBenchmark ? xt : v != null && v.tone ? Ae(v.tone) : Ae(Jt(v == null ? void 0 : v.value))
                  },
                  children: (v == null ? void 0 : v.text) ?? ""
                },
                y.key
              );
            })
          ]
        }
      )
    ] }) }),
    l && /* @__PURE__ */ n("div", { style: { fontSize: 10.5, lineHeight: 1.5, color: "#9aa8a1", marginTop: 8 }, children: l })
  ] });
}
const Xo = ["N", "E", "S", "W"], ua = { N: "S", S: "N", E: "W", W: "E" }, pa = { N: "North", E: "East", S: "South", W: "West" };
function ga({
  deal: e,
  seed: t = 1,
  dealer: o = "N",
  vul: r = "none",
  humanSeat: a = "S",
  showAllHands: l = !1,
  appearance: i,
  decide: s,
  robotDelayMs: c = 350,
  showCoach: u = !1,
  coachShare: p,
  onComplete: b,
  onState: g
}) {
  var ne, R, _;
  const x = ce(() => e ?? Qe(t), [e, t]), [h, m] = G(
    () => kt("embed", o, r, x)
  ), N = `${o}:${r}:${t}:${x.N.length}:${((ne = x.N[0]) == null ? void 0 : ne.suit) ?? ""}${((R = x.N[0]) == null ? void 0 : R.rank) ?? ""}`, $ = oe(N);
  me(() => {
    $.current !== N && ($.current = N, I.current = 0, m(kt("embed", o, r, x)));
  }, [N, o, r, x]);
  const I = oe(0), L = He((D, w) => {
    m(
      (M) => Le(M, {
        category: "bid-event",
        seq: I.current += 1,
        boardRef: M.boardRef,
        seat: D,
        call: w
      })
    );
  }, []), y = He((D, w) => {
    m(
      (M) => Le(M, {
        category: "play-event",
        seq: I.current += 1,
        boardRef: M.boardRef,
        seat: D,
        card: w
      })
    );
  }, []), H = ((_ = h.contract) == null ? void 0 : _.declarer) ?? null, v = H && h.phase !== "auction" ? ua[H] : null, j = He(
    (D) => D === a || D === v && H === a,
    [a, v, H]
  ), z = h.phase !== "complete" && j(h.turn), S = oe(!1);
  me(() => {
    if (!s || z || h.phase === "complete" || S.current) return;
    const D = h.turn, w = h;
    S.current = !0;
    let M = !1;
    return (async () => {
      try {
        if (await new Promise((K) => setTimeout(K, c)), M) return;
        const te = await s(w, D);
        if (M || !te) return;
        m((K) => K !== w && K.turn !== D ? K : te.call && K.phase === "auction" ? Pe(K.auction, D).has(te.call) ? Le(K, {
          category: "bid-event",
          seq: I.current += 1,
          ts: Date.now(),
          boardRef: K.boardRef,
          seat: D,
          call: te.call,
          fallback: !1
        }) : K : te.card && K.phase === "play" && Ut(K, D).some(
          (ee) => ee.suit === te.card.suit && ee.rank === te.card.rank
        ) ? Le(K, {
          category: "play-event",
          seq: I.current += 1,
          ts: Date.now(),
          boardRef: K.boardRef,
          seat: D,
          card: te.card,
          fallback: !1
        }) : K);
      } finally {
        S.current = !1;
      }
    })(), () => {
      M = !0, S.current = !1;
    };
  }, [s, z, h, c]);
  const A = oe(g);
  A.current = g, me(() => {
    var D;
    (D = A.current) == null || D.call(A, h);
  }, [h]);
  const E = oe(!1);
  me(() => {
    h.phase !== "complete" || E.current || (E.current = !0, b == null || b(h));
  }, [h, b]);
  const U = ce(() => ({
    ...xr((i == null ? void 0 : i.skin) ?? "bbo", i == null ? void 0 : i.overrides),
    handLayout: (i == null ? void 0 : i.handLayout) ?? "row",
    bidPad: (i == null ? void 0 : i.bidPad) ?? "grid",
    centreFrame: (i == null ? void 0 : i.centreFrame) ?? !1,
    fanSpread: (i == null ? void 0 : i.fanSpread) ?? 56,
    fanRadius: (i == null ? void 0 : i.fanRadius) ?? 0
  }), [i]), B = ce(() => {
    const D = {};
    for (const w of Xo)
      D[w] = l || w === a || w === v;
    return D;
  }, [l, a, v]), q = ce(() => {
    const D = {};
    for (const w of Xo)
      D[w] = {
        name: w === a ? "You" : pa[w],
        human: w === a
      };
    return D;
  }, [a]), P = h.phase === "complete" ? yr(h) : null;
  return /* @__PURE__ */ n(
    Pl,
    {
      state: h,
      seats: q,
      visible: B,
      mySeat: a,
      myTurn: z,
      legalCalls: h.phase === "auction" && z ? [...Pe(h.auction, h.turn)] : [],
      legalPlays: h.phase === "play" && z ? Ut(h, h.turn) : [],
      appearance: U,
      showCoach: u,
      ...p === void 0 ? {} : { coachShare: p },
      resultLine: P ? mr(P) : "",
      resultScore: P ? `${P.declarerScore >= 0 ? "+" : ""}${P.declarerScore}` : "",
      onCall: (D) => {
        z && L(h.turn, D);
      },
      onPlay: (D, w) => {
        z && y(h.turn, w);
      }
    }
  );
}
const Bn = ["W", "N", "E", "S"], ba = { N: "North", E: "East", S: "South", W: "West" }, ya = {
  none: "Neither vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable"
}, ma = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, xa = (e) => e === "H" || e === "D", ka = (e) => /^[1-7][CDHSN]$/.test(e), Sa = "#dbe8e8", Tn = "#fbfbfa", Ye = "rgba(0,0,0,0.10)", st = "#111827", Oe = "#6B7280", En = "#2f5c8f", va = (e, t) => t === "both" || t === (e === "N" || e === "S" ? "ns" : "ew");
function Dt({ call: e, size: t = 15 }) {
  if (!ka(e))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: st }, children: e === "P" ? "Pass" : e });
  const o = e[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: t, fontWeight: 700, color: st, whiteSpace: "nowrap" }, children: [
    e[0],
    /* @__PURE__ */ n("span", { style: { color: xa(o) ? "#cc0000" : st }, children: ma[o] })
  ] });
}
function wa(e, t, o) {
  const r = e.deal ? null : e.seed ?? 1, a = e.deal ?? Qe(r ?? 1), l = e.dealer ?? t.dealer, i = e.vul ?? t.vul, s = e.seat ?? t.seat;
  let c = kt(`drill-${o}`, l, i, a);
  const u = (b) => {
    c = Le(c, {
      category: "bid-event",
      boardRef: c.boardRef,
      seat: c.turn,
      call: b
    });
  };
  for (const b of e.auction ?? []) {
    if (c.phase !== "auction" || c.turn === s || !Pe(c.auction, c.turn).has(b)) break;
    u(b);
  }
  for (let b = 0; b < 4 && c.phase === "auction" && c.turn !== s; b++) u("P");
  const p = c.phase === "auction" && c.turn === s;
  return {
    seed: r,
    seat: s,
    dealer: l,
    vul: i,
    state: c,
    legal: p ? [...Pe(c.auction, s)] : [],
    askable: p,
    note: e.note ?? ""
  };
}
function ed({
  hands: e,
  dealer: t = "N",
  vul: o = "none",
  seat: r = "S",
  decide: a,
  prefetchConcurrency: l = 2,
  onComplete: i
}) {
  const s = ce(
    () => JSON.stringify([
      t,
      o,
      r,
      e.map((W) => [W.seed ?? null, W.dealer ?? null, W.vul ?? null, W.seat ?? null, W.auction ?? null, W.note ?? "", W.deal ? Object.values(W.deal).flat().length : 0])
    ]),
    [e, t, o, r]
  ), c = oe({ sig: "", list: [] });
  c.current.sig !== s && (c.current = { sig: s, list: e.map((W, J) => wa(W, { dealer: t, vul: o, seat: r }, J)) });
  const u = c.current.list, p = oe(a);
  p.current = a;
  const b = !!a, [g, x] = G({});
  me(() => {
    const W = c.current.list, J = {};
    for (let V = 0; V < W.length; V++)
      J[V] = { status: b && W[V].askable ? "pending" : "off", call: null, ms: null };
    if (x(J), !b) return;
    let X = !1, re = 0;
    const C = async () => {
      var V;
      for (; ; ) {
        const ie = re++;
        if (X || ie >= W.length) return;
        const le = W[ie];
        if (!le.askable) continue;
        const qe = Date.now();
        try {
          const we = await ((V = p.current) == null ? void 0 : V.call(p, le.state, le.seat));
          if (X) return;
          const he = Date.now() - qe;
          x((Ze) => ({
            ...Ze,
            [ie]: we != null && we.call ? { status: "ready", call: we.call, ms: he } : { status: "failed", call: null, ms: he }
          }));
        } catch {
          if (X) return;
          x((we) => ({ ...we, [ie]: { status: "failed", call: null, ms: Date.now() - qe } }));
        }
      }
    }, Y = Math.max(1, Math.min(l, W.length));
    return Promise.all(Array.from({ length: Y }, () => C())), () => {
      X = !0;
    };
  }, [s, b, l]);
  const [h, m] = G(0), [N, $] = G({}), [I, L] = G(null), [y, H] = G(!1), v = He(() => {
    m(0), $({}), L(null), H(!1), S.current = !1;
  }, []), j = oe(s);
  j.current !== s && (j.current = s, (h !== 0 || y || Object.keys(N).length) && v());
  const z = ce(
    () => u.flatMap((W, J) => {
      const X = N[J];
      if (!X) return [];
      const re = g[J], C = (re == null ? void 0 : re.status) === "ready" ? re.call : null;
      return [
        {
          index: J,
          seat: W.seat,
          seed: W.seed,
          yourCall: X,
          benCall: C,
          agreed: C ? C === X : null,
          benMs: (re == null ? void 0 : re.ms) ?? null
        }
      ];
    }),
    [u, N, g]
  ), S = oe(!1);
  me(() => {
    !y || S.current || (S.current = !0, i == null || i(z));
  }, [y, z, i]);
  const A = oe(null), [E, U] = G(560);
  me(() => {
    const W = A.current;
    if (!W) return;
    const J = () => U(W.clientWidth || 560);
    J();
    const X = new ResizeObserver(J);
    return X.observe(W), () => X.disconnect();
  }, []);
  const B = 280, q = 14, P = 14, ne = E >= B + P + 240 + q * 2, R = (ne ? E - q * 2 - P - B : E - q * 2) - 6, _ = Math.max(26, Math.min(46, Math.floor((R - 70) / 5.65))), D = 5 * (_ + 14) + 4 * Math.round(_ * 0.13);
  if (u.length === 0)
    return /* @__PURE__ */ n("div", { style: { padding: 16, fontSize: 13, color: Oe, background: Tn, border: `1px solid ${Ye}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const w = u[Math.min(h, u.length - 1)], M = N[h] ?? null, F = g[h], te = [];
  {
    const W = [
      ...Array.from({ length: Bn.indexOf(w.dealer) }, () => null),
      ...w.state.auction,
      // The learner's own call, once made, belongs in the grid like any other.
      ...M ? [{ seat: w.seat, call: M }] : []
    ];
    for (let J = 0; J < W.length; J += 4) te.push(W.slice(J, J + 4));
  }
  const K = Bn.map((W) => ({ seat: W, vul: va(W, w.vul), isDealer: W === w.dealer })), fe = /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, alignItems: "center" }, children: u.map((W, J) => /* @__PURE__ */ n(
    "span",
    {
      title: `Hand ${J + 1}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: N[J] ? En : "transparent",
        border: `1.5px solid ${J === h && !y ? En : "rgba(0,0,0,0.22)"}`,
        boxSizing: "border-box"
      }
    },
    J
  )) }), O = () => {
    if (!M) return null;
    const W = (F == null ? void 0 : F.status) === "ready" && F.call === M;
    return /* @__PURE__ */ d("div", { style: { background: "#fff", border: `1px solid ${Ye}`, borderRadius: 10, padding: "10px 12px" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: Oe }, children: [
        /* @__PURE__ */ n("span", { children: "You bid" }),
        /* @__PURE__ */ n(Dt, { call: M, size: 17 }),
        (F == null ? void 0 : F.status) === "ready" && F.call ? W ? /* @__PURE__ */ n("span", { style: { color: "#1a7f4b", fontWeight: 600 }, children: "— BEN bids that too." }) : /* @__PURE__ */ d(ye, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN bid" }),
          /* @__PURE__ */ n(Dt, { call: F.call, size: 17 })
        ] }) : (F == null ? void 0 : F.status) === "pending" ? /* @__PURE__ */ d(ye, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "BEN is still working on this hand…" })
        ] }) : (F == null ? void 0 : F.status) === "failed" ? /* @__PURE__ */ d(ye, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN unavailable" })
        ] }) : null
      ] }),
      w.note && /* @__PURE__ */ n("p", { style: { fontSize: 13, lineHeight: 1.45, color: st, marginTop: 8, marginBottom: 0 }, children: w.note }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: () => h + 1 < u.length ? m(h + 1) : H(!0),
          style: {
            marginTop: 12,
            height: 38,
            padding: "0 18px",
            border: 0,
            borderRadius: 8,
            background: En,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer"
          },
          children: h + 1 < u.length ? "Next hand →" : "See how you did"
        }
      )
    ] });
  };
  if (y) {
    const W = z.filter((X) => X.benCall), J = W.filter((X) => X.agreed).length;
    return /* @__PURE__ */ d("div", { ref: A, style: { background: Tn, border: `1px solid ${Ye}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        Jn,
        {
          line: "Drill complete",
          score: W.length ? `Same call as BEN on ${J} of ${W.length}` : "",
          detail: `${z.length} hand${z.length === 1 ? "" : "s"} bid`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 14 }, children: z.map((X) => /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${Ye}`,
            fontSize: 13,
            color: Oe
          },
          children: [
            /* @__PURE__ */ d("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              X.index + 1
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(Dt, { call: X.yourCall })
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "BEN" }),
              X.benCall ? /* @__PURE__ */ n(Dt, { call: X.benCall }) : /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "unavailable" })
            ] }),
            X.agreed && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", color: "#1a7f4b", fontWeight: 700 }, children: "same" })
          ]
        },
        X.index
      )) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: v,
          style: {
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${Ye}`,
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
      /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: Oe, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
    ] });
  }
  const ee = /* @__PURE__ */ d("div", { style: { flex: ne ? "1 1 0" : void 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ n(Nt, { cards: w.state.hands[w.seat], panelBg: "#fff", width: "100%", font: 20, suitW: 18, pad: "6px 10px" }),
    /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: ne ? "flex-start" : "center" }, children: /* @__PURE__ */ n(
      Tr,
      {
        bg: Sa,
        m: { width: 236, height: "auto", headFont: 16, cellFont: 15, radius: 6, cellMinH: 20 },
        heads: K,
        rows: te,
        dealerCol: Bn.indexOf(w.dealer),
        emptyText: te.length === 0 ? `${w.dealer === w.seat ? "You deal" : `${w.dealer} deals`}` : null
      }
    ) })
  ] }), k = /* @__PURE__ */ d(
    "div",
    {
      style: {
        flex: ne ? `0 0 ${D}px` : void 0,
        width: ne ? D : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8
      },
      children: [
        w.askable ? M ? null : /* @__PURE__ */ d(ye, { children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 12, color: Oe, alignSelf: "flex-start" }, children: I ? "Confirm your call" : "Your call?" }),
          /* @__PURE__ */ n(
            mt,
            {
              cell: _,
              radius: 6,
              legalCalls: w.legal,
              live: !0,
              pending: I,
              onStage: L,
              onConfirm: () => {
                I && ($((W) => ({ ...W, [h]: I })), L(null));
              },
              onCancel: () => L(null)
            }
          )
        ] }) : /* @__PURE__ */ n("p", { style: { fontSize: 13, color: Oe, textAlign: "center", margin: 0 }, children: "This hand's auction is already over — nothing to bid." }),
        (M || !w.askable) && /* @__PURE__ */ n("div", { style: { width: "100%" }, children: M ? O() : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => h + 1 < u.length ? m(h + 1) : H(!0),
            style: { height: 34, padding: "0 14px", border: `1px solid ${Ye}`, borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
            children: "Skip this hand →"
          }
        ) })
      ]
    }
  );
  return /* @__PURE__ */ d("div", { ref: A, style: { background: Tn, border: `1px solid ${Ye}`, borderRadius: 12, padding: 14 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }, children: [
      /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 700, color: st }, children: [
        "Hand ",
        h + 1,
        " of ",
        u.length
      ] }),
      fe
    ] }),
    /* @__PURE__ */ d("p", { style: { fontSize: 12, color: Oe, margin: "0 0 10px" }, children: [
      "You are ",
      ba[w.seat],
      " · ",
      ya[w.vul]
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: ne ? "row" : "column", gap: 14, alignItems: "flex-start" }, children: [
      ee,
      k
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: Oe, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
  ] });
}
const jo = ["N", "E", "S", "W"], Ko = { N: "North", E: "East", S: "South", W: "West" }, Na = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, $a = 1976 / 1232, Mt = (e) => e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
function td({
  seed: e = 1,
  deal: t,
  dealer: o = "N",
  vul: r = "none",
  show: a = "all",
  boardLabel: l,
  names: i,
  auction: s = [],
  highlightSeat: c = null,
  hiddenSeats: u = []
}) {
  const p = ce(() => t ?? Qe(e), [t, e]), b = ce(() => {
    let h = kt("diagram", o, r, p);
    for (const m of s) {
      if (h.phase !== "auction" || !Pe(h.auction, h.turn).has(m)) break;
      h = Le(h, {
        category: "bid-event",
        boardRef: h.boardRef,
        seat: h.turn,
        call: m
      });
    }
    return h.auction;
  }, [s, o, r, p]);
  if (a !== "all")
    return /* @__PURE__ */ n(
      Nt,
      {
        cards: p[a],
        panelBg: "#fff",
        width: "100%",
        font: 21,
        suitW: 19,
        pad: "8px 12px"
      }
    );
  const g = {};
  for (const h of jo) g[h] = (i == null ? void 0 : i[h]) ?? Ko[h];
  const x = {};
  for (const h of jo) x[h] = !u.includes(h);
  return /* @__PURE__ */ n("div", { style: { width: "100%", aspectRatio: String($a) }, children: /* @__PURE__ */ n(
    Yl,
    {
      boardLabel: l ?? e,
      dealer: o,
      vul: r,
      hands: p,
      names: g,
      visible: x,
      auction: b,
      highlightSeat: c,
      info: [
        { label: "Dealer", value: Ko[o] },
        { label: "Vulnerable", value: Na[r] }
      ],
      result: [
        { label: "N-S points", value: String(Mt(p.N) + Mt(p.S)) },
        { label: "E-W points", value: String(Mt(p.E) + Mt(p.W)) }
      ]
    }
  ) });
}
function Mr(e) {
  return e.format === "bidding-only" ? "bidding-only" : "full";
}
function Ca(e) {
  return Mr(e) === "bidding-only";
}
function Or(e, t) {
  return t ? e !== "auction" : e === "complete";
}
const dt = 1, Re = 16;
function Ba(e) {
  return ["N", "E", "S", "W"][(e - 1) % 4];
}
function Lr(e) {
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
function Ta(e) {
  const t = e.auction.map((r) => `${r.seat}${r.call}`).join(","), o = e.play.map((r) => `${r.seat}${r.card.suit}${r.card.rank}`).join(",");
  return `${e.dealer}/${t}/${o}`;
}
function Ea(e) {
  const t = Ta(e);
  let o = 2166136261;
  for (let r = 0; r < t.length; r++)
    o ^= t.charCodeAt(r), o = Math.imul(o, 16777619) >>> 0;
  return `${o.toString(16).padStart(8, "0")}${t.length.toString(16)}`;
}
const Rn = [
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
function Ra(e) {
  const t = Math.abs(e), o = Rn.find((r) => t <= r.to) ?? Rn[Rn.length - 1];
  return o.imps === 0 ? 0 : e < 0 ? -o.imps : o.imps;
}
function Yo(e) {
  return e === void 0 ? "?" : e === null ? "PASS" : `${e.level}${e.strain}${e.doubled}`;
}
function Wa(e, t) {
  return e === void 0 || t === void 0 ? !1 : Yo(e) === Yo(t);
}
const Aa = "—";
function Uo(e, t) {
  const o = Math.round(t);
  return e === "mp" ? `${o}` : o > 0 ? `+${o}` : `${o}`;
}
function Ia(e, t) {
  if (e === "mp") return `${t.toFixed(1)}%`;
  const o = Math.round(t);
  return e === "total" ? `${o >= 0 ? "+" : ""}${o.toLocaleString("en-US")}` : `${o >= 0 ? "+" : ""}${o}`;
}
const Pr = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
  N: "NT"
};
function Wn(e) {
  if (e === void 0) return "";
  if (e === null) return "Pass";
  const t = e.doubled === 1 ? "×" : e.doubled === 2 ? "××" : "";
  return `${e.level}${Pr[e.strain] ?? e.strain}${t}${e.declarer}`;
}
function Go(e) {
  if (e === void 0) return Aa;
  if (e === null) return "Passed out";
  const t = e.doubled === 1 ? " ×" : e.doubled === 2 ? " ××" : "";
  return `${e.level}${Pr[e.strain] ?? e.strain}${t} by ${e.declarer}`;
}
function Ha(e, t) {
  return e === "unrated" ? "BEN has not bid this board yet" : e === "differed" ? "A different contract" : t ? "Matched BEN" : "Matched BEN, from the other side";
}
function An(e) {
  return e === "matched" ? "pos" : "neutral";
}
const za = {
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
}, Da = { 1: "S", 2: "W", 3: "N", 4: "E" };
function Ma() {
  const e = [];
  for (const t of ["S", "H", "D", "C"])
    for (const o of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
      e.push({ suit: t, rank: o });
  return e;
}
function Oa(e) {
  const t = [];
  let o = null;
  for (const r of e) {
    const a = r.toUpperCase();
    if (a === "S" || a === "H" || a === "D" || a === "C") {
      o = a;
      continue;
    }
    const l = za[a];
    l && o && t.push({ suit: o, rank: l });
  }
  return t;
}
function La(e) {
  const t = Da[e[0]];
  if (!t) return null;
  const o = e.slice(1).split(","), r = { S: [], W: [], N: [], E: [] };
  Ie.forEach((i, s) => {
    o[s] && (r[i] = Oa(o[s]));
  });
  const a = /* @__PURE__ */ new Set();
  for (const i of Ie) for (const s of r[i]) a.add(`${s.suit}${s.rank}`);
  const l = Ma().filter((i) => !a.has(`${i.suit}${i.rank}`));
  for (const i of Ie)
    for (; r[i].length < 13 && l.length; ) r[i].push(l.shift());
  return { dealer: t, hands: r };
}
function Pa(e) {
  let t = e.trim(), o = !1;
  for (; t.endsWith("!"); )
    o = !0, t = t.slice(0, -1).trim();
  const r = t.toLowerCase();
  if (r === "p" || r === "pass") return { call: "P", alert: o };
  if (r === "d" || r === "x" || r === "dbl") return { call: "X", alert: o };
  if (r === "r" || r === "xx" || r === "rdbl") return { call: "XX", alert: o };
  const a = t[0];
  let l = (t[1] ?? "").toUpperCase();
  return l === "N" && (l = "N"), { call: `${a}${l}`, alert: o };
}
function Fa(e) {
  const t = e.replace(/\r/g, "").split("|"), o = [];
  for (let r = 0; r < t.length - 1; r += 2)
    o.push([t[r].trim(), t[r + 1]]);
  return o;
}
function _a(e) {
  var p;
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a LIN string first." };
  if (!t.includes("md|") && !t.includes("|md|"))
    return {
      ok: !1,
      error: 'No deal found — this doesn’t look like a LIN file (expected an "md|" tag).'
    };
  const o = Fa(t), r = [];
  let a = { S: "", W: "", N: "", E: "" }, l = "none", i = null, s = 0;
  const c = (b) => {
    s += 1;
    const g = {
      name: b || `Board ${s}`,
      dealer: "S",
      vul: l,
      players: { ...a },
      hands: { S: [], W: [], N: [], E: [] },
      auction: []
    };
    return r.push(g), g;
  };
  for (const [b, g] of o)
    switch (b) {
      case "pn": {
        const x = g.split(",");
        a = {
          S: (x[0] ?? "").trim(),
          W: (x[1] ?? "").trim(),
          N: (x[2] ?? "").trim(),
          E: (x[3] ?? "").trim()
        }, i && (i.players = { ...a });
        break;
      }
      case "sv": {
        const x = g.trim().toLowerCase();
        l = x === "n" ? "ns" : x === "e" ? "ew" : x === "b" ? "both" : "none", i && (i.vul = l);
        break;
      }
      case "qx": {
        const x = (p = g.match(/(\d+)/)) == null ? void 0 : p[1];
        i = c(x ? `Board ${x}` : "");
        break;
      }
      case "ah":
        i && (i.name = g.trim() || i.name);
        break;
      case "md": {
        const x = La(g.trim());
        x && ((!i || i.hands.S.length) && (i = c("")), i.dealer = x.dealer, i.hands = x.hands);
        break;
      }
      case "mb": {
        if (!i) break;
        const { call: x, alert: h } = Pa(g), m = Ie[(Ie.indexOf(i.dealer) + i.auction.length) % 4];
        i.auction.push({ seat: m, call: x, alert: h });
        break;
      }
      case "an": {
        i && i.auction.length && (i.auction[i.auction.length - 1].note = g.trim());
        break;
      }
    }
  const u = r.filter((b) => b.hands.S.length === 13);
  return u.length ? { ok: !0, boards: u } : { ok: !1, error: "Couldn’t read any complete deals from that LIN." };
}
const Xa = "SWNE", Jo = 3;
function ja(e) {
  const t = e.trim().charAt(0).toUpperCase();
  if (!t) return Jo;
  const o = Xa.indexOf(t);
  return o < 0 ? Jo : o + 1;
}
function Ka(e) {
  if (!/%[0-9a-f]{2}/i.test(e)) return e;
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function Ya(e) {
  const t = e.trim();
  if (!/^(https?:)?\/\//i.test(t) && !/^www\./i.test(t)) return null;
  try {
    return new URL(t.startsWith("www.") ? `https://${t}` : t);
  } catch {
    return null;
  }
}
function Ua(e) {
  const t = (p) => (e.searchParams.get(p) ?? "").trim(), o = t("s"), r = t("w"), a = t("n"), l = t("e");
  if (!o && !r && !a && !l) return null;
  const i = `md|${ja(t("d"))}${o},${r},${a},${l}|`, s = `sv|${t("v")}|`, c = Number.parseInt(t("b"), 10), u = c > 0 ? `ah|Board ${c}|` : "";
  return `${i}${s}${u}`;
}
function Ga(e) {
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a BBO hand link first." };
  const o = Ya(t);
  if (!o)
    return t.includes("md|") ? { ok: !0, lin: t } : {
      ok: !1,
      error: "That is neither a BBO hand link nor a LIN string. Copy the link from the Hand Viewer’s address bar."
    };
  for (const l of ["linurl", "myhand", "linlocal"])
    if (o.searchParams.get(l))
      return {
        ok: !1,
        error: `This link points at a LIN file (${l}) rather than carrying the deal. Open it and paste the LIN itself.`
      };
  const r = o.searchParams.get("lin");
  if (r) {
    const l = Ka(r);
    return l.includes("md|") ? { ok: !0, lin: l } : { ok: !1, error: "That link’s lin= has no deal in it (no “md|” tag)." };
  }
  const a = Ua(o);
  return a ? { ok: !0, lin: a } : {
    ok: !1,
    error: "No deal in that link — a Hand Viewer URL carries one in lin=, or in n/e/s/w hand parameters."
  };
}
function Fr(e) {
  const t = Ga(e);
  return t.ok ? _a(t.lin) : { ok: !1, error: t.error };
}
const Ve = ["S", "H", "D", "C"], Ja = {
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
function Va(e) {
  const t = e.toUpperCase().replaceAll("10", "T").replace(/[\s,.]/g, ""), o = [];
  for (const r of t) {
    const a = Ja[r];
    if (!a) return { error: `"${r}" is not a card rank` };
    o.push(a);
  }
  return o;
}
function Qa(e) {
  const t = e.split(".");
  if (t.length !== 4) return { error: "expected four dot-separated suits" };
  const o = [];
  for (let r = 0; r < 4; r++) {
    const a = Va(t[r] ?? "");
    if ("error" in a) return a;
    for (const l of a) o.push({ suit: Ve[r], rank: l });
  }
  return o;
}
function qa(e) {
  const t = { S: "", H: "", D: "", C: "" };
  for (const o of Ve)
    t[o] = e.filter((r) => r.suit === o).sort((r, a) => a.rank - r.rank).map((r) => bt(r.rank)).join("");
  return t;
}
function Za(e) {
  const t = qa(e);
  return Ve.map((o) => t[o]).join(".");
}
const Ce = $t, _r = "#eff7f6", Fe = "#17211d", ge = "#5c6b64", de = "#8b9a93", pe = "#e4ebe7", be = "#ffffff", $e = "#f7faf8", es = "#8a6d1f", ts = "#fdf6e3", Qt = "#c0392b", Xr = "#fdeeec", qt = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", ns = {
  fontFamily: qt,
  color: Fe,
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
        color: de,
        ...t
      },
      children: e
    }
  );
}
function Vo({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        background: _r,
        color: "#14403f",
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function os({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f0e2b8",
        background: ts,
        color: es,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function Qo({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      role: "alert",
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f3c9c2",
        background: Xr,
        color: Qt,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function Ot({
  num: e,
  title: t,
  aside: o,
  children: r,
  innerRef: a
}) {
  return /* @__PURE__ */ d(
    "section",
    {
      ref: a,
      style: {
        scrollMarginTop: 84,
        padding: "16px 0",
        borderBottom: `8px solid ${$e}`
      },
      children: [
        /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }, children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: Ce }, children: e }),
          /* @__PURE__ */ n("h3", { style: { margin: 0, fontSize: 16, fontWeight: 800, color: Fe }, children: t }),
          o && /* @__PURE__ */ d(ye, { children: [
            /* @__PURE__ */ n("span", { style: { flex: 1 } }),
            /* @__PURE__ */ n("span", { style: { fontSize: 11.5, color: de }, children: o })
          ] })
        ] }),
        r
      ]
    }
  );
}
function qo({
  options: e,
  value: t,
  onChange: o,
  ariaLabel: r
}) {
  return /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, role: "group", "aria-label": r, children: e.map((a) => {
    const l = a.key === t;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        "aria-pressed": l,
        onClick: () => o(a.key),
        style: {
          flex: 1,
          minWidth: 0,
          height: 40,
          padding: "0 6px",
          borderRadius: 8,
          border: `1px solid ${l ? Ce : pe}`,
          background: l ? Ce : be,
          color: l ? "#fff" : ge,
          fontFamily: "inherit",
          fontSize: 12.5,
          fontWeight: l ? 800 : 600,
          cursor: "pointer"
        },
        children: a.label
      },
      a.key
    );
  }) });
}
function rs({
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
function gt({
  children: e,
  onClick: t,
  title: o,
  ariaLabel: r,
  tone: a = "plain",
  disabled: l
}) {
  const i = {
    flex: "none",
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${a === "accent" ? "#b9dcd9" : a === "alarm" ? "#f3c9c2" : pe}`,
    background: a === "accent" ? _r : a === "alarm" ? Xr : be,
    color: a === "accent" ? "#14403f" : a === "alarm" ? Qt : ge,
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 700,
    cursor: t && !l ? "pointer" : "default"
  };
  return t ? /* @__PURE__ */ n("button", { type: "button", onClick: t, title: o, "aria-label": r, disabled: l, style: i, children: e }) : /* @__PURE__ */ n("span", { style: i, children: e });
}
function Ue({
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
              color: de
            },
            children: e
          }
        ),
        /* @__PURE__ */ n("span", { style: { flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }, children: t })
      ]
    }
  );
}
const Kt = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${pe}`,
  background: be,
  color: Fe,
  fontFamily: "inherit",
  fontSize: 13.5,
  boxSizing: "border-box"
}, In = ["N", "E", "S", "W"], ut = { N: "North", E: "East", S: "South", W: "West" }, Lt = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2], Zo = { S: "♠", H: "♥", D: "♦", C: "♣" }, er = "#b03a2e", tr = (e) => e === "H" || e === "D", rt = {
  N: "#2a7ab0",
  E: "#6f4bb0",
  S: "#1c8a5a",
  W: "#b08328"
}, it = (e, t) => `${e}${t}`;
function is({
  hands: e,
  onApply: t,
  onCancel: o,
  applyLabel: r = "Use this pack"
}) {
  const [a, l] = G(() => {
    const h = {};
    for (const m of In)
      for (const N of e[m] ?? []) h[it(N.suit, N.rank)] = m;
    return h;
  }), [i, s] = G("N"), c = ce(() => {
    const h = { N: 0, E: 0, S: 0, W: 0 };
    for (const m of Object.values(a)) m && h[m]++;
    return h;
  }, [a]), u = 52 - c.N - c.E - c.S - c.W, p = In.every((h) => c[h] === 13), b = (h, m) => {
    const N = it(h, m);
    l(($) => ({ ...$, [N]: $[N] === i ? "" : i }));
  }, g = () => l((h) => {
    const m = { ...h };
    for (const N of Ve)
      for (const $ of Lt) {
        const I = it(N, $);
        m[I] || (m[I] = i);
      }
    return m;
  }), x = () => {
    const h = { N: [], E: [], S: [], W: [] };
    for (const m of Ve)
      for (const N of Lt) {
        const $ = a[it(m, N)];
        $ && h[$].push({ suit: m, rank: N });
      }
    t(h);
  };
  return /* @__PURE__ */ d(
    "div",
    {
      role: "group",
      "aria-label": p ? "Pack editor — all four hands hold 13 cards" : "Pack editor — hands are not yet 13 cards each",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: `2px solid ${p ? "#79c2a4" : "#e8b1a8"}`,
        background: be
      },
      children: [
        /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }, children: In.map((h) => {
          const m = i === h, N = Ve.map(($) => ({
            suit: $,
            text: Lt.filter((I) => a[it($, I)] === h).map((I) => bt(I)).join(" ")
          }));
          return /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: () => s(h),
              title: `Click cards below to give them to ${ut[h]}`,
              style: {
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${m ? rt[h] : pe}`,
                background: m ? `${rt[h]}14` : be,
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
                      color: m ? rt[h] : ge
                    },
                    children: [
                      /* @__PURE__ */ n("span", { children: ut[h] }),
                      /* @__PURE__ */ d("span", { style: { color: c[h] === 13 ? "#1c8a5a" : Qt }, children: [
                        c[h],
                        "/13"
                      ] })
                    ]
                  }
                ),
                N.map(({ suit: $, text: I }) => /* @__PURE__ */ d(
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
                      /* @__PURE__ */ n("span", { style: { color: tr($) ? er : Fe }, children: Zo[$] }),
                      /* @__PURE__ */ n(
                        "span",
                        {
                          style: {
                            color: ge,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          },
                          children: I || "—"
                        }
                      )
                    ]
                  },
                  $
                ))
              ]
            },
            h
          );
        }) }),
        /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: Ve.map((h) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 3 }, children: [
          /* @__PURE__ */ n(
            "span",
            {
              style: {
                width: 14,
                flex: "none",
                fontSize: 12,
                textAlign: "center",
                color: tr(h) ? er : Fe
              },
              children: Zo[h]
            }
          ),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 2, flex: 1, minWidth: 0 }, children: Lt.map((m) => {
            const N = a[it(h, m)] || "", $ = {
              flex: 1,
              minWidth: 0,
              height: 24,
              padding: 0,
              borderRadius: 4,
              border: `1px solid ${N ? rt[N] : pe}`,
              background: N ? `${rt[N]}1f` : $e,
              color: N ? rt[N] : de,
              fontFamily: "inherit",
              fontSize: 10.5,
              fontWeight: N ? 800 : 600,
              cursor: "pointer"
            };
            return /* @__PURE__ */ n(
              "button",
              {
                type: "button",
                onClick: () => b(h, m),
                "aria-label": `${bt(m)} of ${h}${N ? ` — ${ut[N]}` : ""}`,
                title: N ? ut[N] : "In the pool",
                style: $,
                children: bt(m)
              },
              m
            );
          }) })
        ] }, h)) }),
        /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ d("span", { style: { fontSize: 11, color: de }, children: [
            u,
            " in the pool · filling ",
            ut[i]
          ] }),
          /* @__PURE__ */ n("span", { style: { flex: 1 } }),
          /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: g,
              disabled: u === 0,
              style: {
                height: 30,
                padding: "0 10px",
                borderRadius: 7,
                border: `1px solid ${pe}`,
                background: be,
                color: u === 0 ? de : ge,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 700,
                cursor: u === 0 ? "default" : "pointer"
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
                border: `1px solid ${pe}`,
                background: be,
                color: ge,
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
              onClick: x,
              disabled: !p,
              style: {
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                border: 0,
                background: p ? Ce : "#d7ded9",
                color: p ? "#fff" : "#8b9a93",
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 800,
                cursor: p ? "pointer" : "default"
              },
              children: r
            }
          )
        ] })
      ]
    }
  );
}
const nr = ["N", "E", "S", "W"], ls = { N: "North", E: "East", S: "South", W: "West" }, as = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, or = (e) => nr[(nr.indexOf(e) + 1) % 4] ?? "N";
function ss({
  board: e,
  onChange: t,
  onReroll: o
}) {
  const [r, a] = G(!1), [l, i] = G(!1), [s, c] = G(""), [u, p] = G(null), b = () => {
    const g = Fr(s);
    if (!g.ok) {
      p(g.error);
      return;
    }
    const x = g.boards[0];
    if (!x) {
      p("That link holds no boards.");
      return;
    }
    p(null), c(""), i(!1), t({
      hands: x.hands,
      dealer: x.dealer,
      vul: x.vul,
      edited: !0
    });
  };
  return /* @__PURE__ */ d(
    "div",
    {
      style: {
        overflow: "hidden",
        borderRadius: 10,
        border: `1px solid ${e.edited ? "#e2cf9a" : pe}`,
        background: be
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
              /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 800, color: Fe }, children: [
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
              /* @__PURE__ */ n(gt, { onClick: o, title: "Re-roll this deal", children: "↻ Re-roll" })
            ]
          }
        ),
        /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px 4px" }, children: [
          /* @__PURE__ */ d(gt, { tone: e.vul === "none" ? "plain" : "alarm", children: [
            "Vul ",
            as[e.vul]
          ] }),
          /* @__PURE__ */ d(gt, { onClick: () => t({ dealer: or(e.dealer) }), title: "Cycle the dealer", children: [
            "Dealer ",
            e.dealer
          ] }),
          /* @__PURE__ */ d(
            gt,
            {
              tone: "accent",
              onClick: () => t({ humanSeat: or(e.humanSeat) }),
              title: "Cycle the seat the learner sits",
              children: [
                "You: ",
                e.humanSeat
              ]
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "4px 10px" }, children: /* @__PURE__ */ n(
          Nt,
          {
            cards: e.hands[e.humanSeat],
            panelBg: be,
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
              color: de
            },
            children: [
              "You play ",
              ls[e.humanSeat],
              " · the other three hands stay hidden"
            ]
          }
        ),
        u && !r && /* @__PURE__ */ n(
          "p",
          {
            style: {
              margin: "0 10px 8px",
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid #f3c9c2",
              background: "#fdeeec",
              color: Qt,
              fontSize: 10.5
            },
            children: u
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
                background: l ? "#eef2ef" : $e,
                color: ge,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer"
              },
              children: l ? "Close BBO link" : "BBO link"
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => a((g) => !g),
              style: {
                flex: 1,
                padding: "8px 4px",
                border: 0,
                background: r ? "#eff7f6" : $e,
                color: r ? Ce : ge,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer"
              },
              children: r ? "Close pack editor" : "Edit pack →"
            }
          )
        ] }),
        l && /* @__PURE__ */ d("div", { style: { display: "flex", gap: 6, padding: "8px 10px", background: $e }, children: [
          /* @__PURE__ */ n(
            "input",
            {
              value: s,
              onChange: (g) => c(g.target.value),
              placeholder: "Paste a Hand Viewer URL",
              "aria-label": `BBO hand link for board ${e.boardNo}`,
              style: { ...Kt, height: 34, fontSize: 12 }
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: b,
              disabled: !s.trim(),
              style: {
                flex: "none",
                height: 34,
                padding: "0 12px",
                borderRadius: 8,
                border: 0,
                background: s.trim() ? "#22302a" : "#e4ebe7",
                color: s.trim() ? "#fff" : de,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
                cursor: s.trim() ? "pointer" : "default"
              },
              children: "Use deal"
            }
          )
        ] }),
        r && /* @__PURE__ */ n("div", { style: { padding: 10, background: $e }, children: /* @__PURE__ */ n(
          is,
          {
            hands: e.hands,
            onCancel: () => a(!1),
            onApply: (g) => {
              t({ hands: g, edited: !0 }), a(!1);
            }
          },
          `${e.boardNo}:${e.seed}:${e.edited}`
        ) })
      ]
    }
  );
}
const rr = 120, ir = 240, jn = [
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
], Kn = [
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
], Zt = [
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
], ds = [
  { key: "default", label: "Default" },
  { key: "show", label: "Show" },
  { key: "hide", label: "Hide" }
];
function cs() {
  const e = {};
  for (const t of Zt) e[t.key] = t.def;
  return e;
}
function lr(e) {
  const t = {};
  for (const o of Zt) {
    const r = e[o.key];
    (r === "show" || r === "hide") && (t[o.key] = r);
  }
  return t;
}
function fs(e) {
  return { showAllHands: (e == null ? void 0 : e["table.hands_view"]) === "show" };
}
const Vt = new Set(Ie), jr = new Set(Object.keys(_i)), hs = new Set(jn.map((e) => e.key)), Kr = new Set(Kn.map((e) => e.key)), us = new Set(Zt.map((e) => e.key));
function Vn(e) {
  const t = { N: [], E: [], S: [], W: [] }, o = /* @__PURE__ */ new Set();
  for (const r of Ie) {
    const a = Qa(e[r] ?? "");
    if ("error" in a) return { error: `${r}: ${a.error}` };
    if (a.length !== 13) return { error: `${r} holds ${a.length} cards, not 13` };
    for (const l of a) {
      const i = `${l.suit}${l.rank}`;
      if (o.has(i)) return { error: `${i} is dealt twice` };
      o.add(i);
    }
    t[r] = a;
  }
  return { hands: t };
}
function ps(e) {
  const t = [], o = e.title.trim();
  o || t.push("Give the challenge a title."), o.length > rr && t.push(`Titles are at most ${rr} characters.`), e.description.trim().length > ir && t.push(`Descriptions are at most ${ir} characters.`), e.format !== void 0 && !hs.has(e.format) && t.push("Pick whether the board is bid and played, or bidding only."), Kr.has(e.scoring) || t.push("Pick a scoring method."), (e.boards.length < dt || e.boards.length > Re) && t.push(`A challenge has ${dt}–${Re} boards.`), e.boards.forEach((r, a) => {
    if (r.boardNo !== a + 1 && t.push(`Board ${a + 1} is numbered ${r.boardNo}.`), Number.isInteger(r.seed) || t.push(`Board ${r.boardNo} has no deal.`), Vt.has(r.dealer) || t.push(`Board ${r.boardNo} has no dealer.`), Vt.has(r.humanSeat) || t.push(`Board ${r.boardNo} has no seat for you.`), r.vul !== void 0 && !jr.has(r.vul) && t.push(`Board ${r.boardNo} has no vulnerability.`), r.pack) {
      const l = Vn(r.pack);
      "error" in l && t.push(`Board ${r.boardNo} pack — ${l.error}.`);
    }
  });
  for (const [r, a] of Object.entries(e.controlOverrides ?? {}))
    us.has(r) ? a !== "show" && a !== "hide" && t.push(`"${r}" must be shown or hidden.`) : t.push(`"${r}" is not a table control.`);
  return t;
}
function Yr(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (!Array.isArray(t.boards) || t.boards.length === 0) return null;
  const o = t.boards.slice(0, Re).map((r, a) => ({
    boardNo: a + 1,
    seed: Number.isInteger(r == null ? void 0 : r.seed) ? r.seed : 1,
    dealer: Vt.has(r == null ? void 0 : r.dealer) ? r.dealer : "N",
    humanSeat: Vt.has(r == null ? void 0 : r.humanSeat) ? r.humanSeat : "S",
    ...r != null && r.vul && jr.has(r.vul) ? { vul: r.vul } : {},
    ...r != null && r.pack ? { pack: r.pack } : {}
  }));
  return {
    title: typeof t.title == "string" ? t.title : "",
    description: typeof t.description == "string" ? t.description : "",
    ...t.format === "bidding-only" || t.format === "full" ? { format: t.format } : {},
    scoring: Kr.has(t.scoring) ? t.scoring : "imps",
    boards: o,
    controlOverrides: t.controlOverrides && typeof t.controlOverrides == "object" ? t.controlOverrides : {}
  };
}
const gs = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Controls", num: "03" },
  { key: "review", label: "Review", num: "04" }
], bs = { N: "North", E: "East", S: "South", W: "West" }, ys = 4, ms = [2, 4, 6, 8], ar = (e, t) => e + t * 7919 >>> 0, Hn = () => Math.floor(Math.random() * 4294967295) + 1 >>> 0;
function sr(e, t) {
  return {
    boardNo: t,
    seed: e,
    dealer: Ba(t),
    humanSeat: "S",
    vul: Lr(t),
    hands: Qe(e),
    edited: !1
  };
}
function xs(e) {
  const t = {};
  for (const o of ["N", "E", "S", "W"]) t[o] = Za(e[o]);
  return t;
}
function ks(e) {
  var t;
  return (t = e == null ? void 0 : e.boards) != null && t.length ? e.boards.map((o, r) => {
    let a = Qe(o.seed), l = !1;
    if (o.pack) {
      const i = Vn(o.pack);
      "error" in i || (a = i.hands, l = !0);
    }
    return {
      boardNo: r + 1,
      seed: o.seed,
      dealer: o.dealer,
      humanSeat: o.humanSeat,
      vul: o.vul ?? Lr(r + 1),
      hands: a,
      edited: l
    };
  }) : null;
}
function nd({
  draft: e,
  onCreate: t,
  onChange: o,
  createLabel: r = "Create challenge",
  seedBase: a
}) {
  const l = oe(Yr(e) ?? void 0).current, i = oe(a ?? Hn()), [s, c] = G("basics"), [u, p] = G((l == null ? void 0 : l.title) ?? ""), [b, g] = G((l == null ? void 0 : l.description) ?? ""), [x, h] = G(
    (l == null ? void 0 : l.format) === "bidding-only" ? "bidding-only" : "full"
  ), [m, N] = G((l == null ? void 0 : l.scoring) ?? "imps"), [$, I] = G(
    () => ks(l) ?? Array.from({ length: ys }, (C, Y) => sr(ar(i.current, Y + 1), Y + 1))
  ), [L, y] = G(() => {
    const C = cs();
    for (const [Y, V] of Object.entries((l == null ? void 0 : l.controlOverrides) ?? {})) C[Y] = V;
    return C;
  }), [H, v] = G(""), [j, z] = G(null), [S, A] = G(null), [E, U] = G(null), B = oe({}), q = (C) => {
    var Y;
    c(C), (Y = B.current[C]) == null || Y.scrollIntoView({ behavior: "smooth", block: "start" });
  }, P = (C) => (Y) => {
    B.current[C] = Y;
  }, ne = (C) => {
    const Y = Math.max(dt, Math.min(Re, Math.round(C)));
    I(
      (V) => Array.from({ length: Y }, (ie, le) => V[le] ?? sr(ar(i.current, le + 1), le + 1))
    );
  }, R = (C, Y) => I((V) => V.map((ie, le) => le === C ? { ...ie, ...Y } : ie)), _ = (C) => I(
    (Y) => Y.map((V, ie) => {
      if (ie !== C) return V;
      const le = Hn();
      return { ...V, seed: le, hands: Qe(le), edited: !1 };
    })
  ), D = () => {
    const C = H.split(/\n+/).map((V) => V.trim()).filter(Boolean);
    if (!C.length)
      return z("Paste a BBO hand link first."), null;
    const Y = [];
    for (const V of C) {
      const ie = Fr(V);
      if (!ie.ok)
        return z(ie.error), null;
      for (const le of ie.boards)
        Y.push({
          boardNo: 0,
          // renumbered by position below
          seed: Hn(),
          dealer: le.dealer,
          humanSeat: "S",
          vul: le.vul,
          hands: le.hands,
          edited: !0
        });
    }
    return Y;
  }, w = (C) => {
    const Y = D();
    if (!Y) return;
    const V = Re - (C === "replace" ? 0 : $.length);
    I((le) => [...C === "replace" ? [] : le, ...Y].slice(0, Re).map((we, he) => ({ ...we, boardNo: he + 1 }))), z(null), v("");
    const ie = Math.min(Y.length, Math.max(0, V));
    A(
      ie < Y.length ? `Took ${ie} of ${Y.length} — a challenge holds ${Re} boards.` : `${ie} board${ie === 1 ? "" : "s"} from BBO.`
    );
  }, M = ce(() => {
    const C = (V) => V === "hide" ? "hidden" : V === "show" ? "shown" : "platform", Y = Object.keys(lr(L)).length;
    return `Hands ${C(L["table.hands_view"])} · Undo ${C(
      L["table.undo"]
    )} · ${Y} override${Y === 1 ? "" : "s"}`;
  }, [L]), F = [...new Set($.map((C) => C.humanSeat))], te = jn.find((C) => C.key === x), K = Kn.find((C) => C.key === m), fe = x === "bidding-only", O = fe ? te.label : K.label, ee = `${$.length}-board ${O}`, k = u.trim().length > 0, W = k ? u.trim() : ee, J = () => ({
    title: W,
    description: b.trim(),
    format: x,
    scoring: m,
    boards: $.map((C) => ({
      boardNo: C.boardNo,
      seed: C.seed,
      dealer: C.dealer,
      humanSeat: C.humanSeat,
      vul: C.vul,
      ...C.edited ? { pack: xs(C.hands) } : {}
    })),
    controlOverrides: lr(L)
  }), X = JSON.stringify(J());
  me(() => {
    o && o(JSON.parse(X));
  }, [X]);
  const re = () => {
    const C = J(), Y = ps(C);
    if (Y.length) {
      U(Y[0]), q("review");
      return;
    }
    U(null), t(C);
  };
  return /* @__PURE__ */ d("div", { style: { ...ns, display: "flex", flexDirection: "column", minWidth: 0 }, children: [
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          background: be,
          borderBottom: `1px solid ${pe}`,
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
              /* @__PURE__ */ n("div", { style: { fontSize: 11, color: de }, children: "Your boards · your seat · BEN in the other three" })
            ] })
          ] }),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }, children: gs.map((C) => /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => q(C.key),
              style: {
                flex: "none",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${s === C.key ? Ce : pe}`,
                background: s === C.key ? Ce : be,
                color: s === C.key ? "#fff" : ge,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: s === C.key ? 800 : 600,
                cursor: "pointer"
              },
              children: C.label
            },
            C.key
          )) })
        ]
      }
    ),
    /* @__PURE__ */ d(Ot, { innerRef: P("basics"), num: "01", title: "Basics", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: ge, lineHeight: 1.5 }, children: "Name it, pick what a board asks for, and how many boards." }),
      /* @__PURE__ */ n(ot, { children: "Title" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge title",
          value: u,
          onChange: (C) => p(C.target.value),
          placeholder: ee,
          style: Kt
        }
      ),
      /* @__PURE__ */ n("p", { style: { margin: "6px 0 0", fontSize: 11, color: de }, children: k ? "The learner sees this above the board." : `Optional — left blank it is called “${ee}.”` }),
      /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "Description" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge description",
          value: b,
          onChange: (C) => g(C.target.value),
          placeholder: "One line the learner sees before starting",
          style: { ...Kt, height: 36, fontSize: 12.5 }
        }
      ),
      /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "What a board asks" }),
      /* @__PURE__ */ n(
        qo,
        {
          ariaLabel: "What a board asks",
          options: jn.map((C) => ({ key: C.key, label: C.label })),
          value: x,
          onChange: h
        }
      ),
      /* @__PURE__ */ n(Vo, { children: te.note }),
      !fe && /* @__PURE__ */ d(ye, { children: [
        /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "Scoring" }),
        /* @__PURE__ */ n(
          qo,
          {
            ariaLabel: "Scoring",
            options: Kn.map((C) => ({ key: C.key, label: C.label })),
            value: m,
            onChange: N
          }
        ),
        /* @__PURE__ */ n(Vo, { children: K.note })
      ] }),
      /* @__PURE__ */ n(ot, { style: { marginTop: 16 }, children: "Boards" }),
      /* @__PURE__ */ n(Ss, { count: $.length, onCount: ne }),
      /* @__PURE__ */ d("p", { style: { margin: "8px 0 0", fontSize: 11, color: de, lineHeight: 1.5 }, children: [
        dt,
        "–",
        Re,
        " boards. Vulnerability follows the standard board cycle; dealer and the learner's seat are per-board below."
      ] })
    ] }),
    /* @__PURE__ */ d(
      Ot,
      {
        innerRef: P("boards"),
        num: "02",
        title: "Boards",
        aside: `${$.length} board${$.length === 1 ? "" : "s"}`,
        children: [
          /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: ge, lineHeight: 1.5 }, children: "Each board is a random deal. Re-roll for a new one, paste a BBO hand link, or open the pack editor to set the cards by hand." }),
          /* @__PURE__ */ d(
            "div",
            {
              style: {
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${pe}`,
                background: $e
              },
              children: [
                /* @__PURE__ */ n(ot, { children: "From BBO" }),
                /* @__PURE__ */ n(
                  "textarea",
                  {
                    value: H,
                    onChange: (C) => v(C.target.value),
                    rows: 2,
                    placeholder: "Paste Hand Viewer links, one per line",
                    "aria-label": "BBO hand links",
                    style: {
                      ...Kt,
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
                      onClick: () => w("add"),
                      disabled: !H.trim(),
                      style: {
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: 0,
                        background: H.trim() ? "#22302a" : "#e4ebe7",
                        color: H.trim() ? "#fff" : de,
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: H.trim() ? "pointer" : "default"
                      },
                      children: "Add boards"
                    }
                  ),
                  /* @__PURE__ */ n(
                    "button",
                    {
                      type: "button",
                      onClick: () => w("replace"),
                      disabled: !H.trim(),
                      style: {
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: `1px solid ${pe}`,
                        background: be,
                        color: H.trim() ? ge : de,
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: H.trim() ? "pointer" : "default"
                      },
                      children: "Replace all"
                    }
                  )
                ] }),
                j && /* @__PURE__ */ n(Qo, { children: j }),
                !j && S && /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11.5, color: Ce }, children: S }),
                /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11, color: de, lineHeight: 1.5 }, children: "An imported board keeps its own dealer and vulnerability. The auction and play in the link are ignored — the learner bids it themselves." })
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
              children: $.map((C, Y) => /* @__PURE__ */ n(
                ss,
                {
                  board: C,
                  onChange: (V) => R(Y, V),
                  onReroll: () => _(Y)
                },
                C.boardNo
              ))
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ d(Ot, { innerRef: P("controls"), num: "03", title: "Table controls", children: [
      /* @__PURE__ */ d("p", { style: { margin: "0 0 12px", fontSize: 12, color: ge, lineHeight: 1.5 }, children: [
        "Override the table's own controls for this challenge, in both directions. ",
        /* @__PURE__ */ n("b", { children: "Undo" }),
        " and",
        " ",
        /* @__PURE__ */ n("b", { children: "show-all-hands" }),
        " are off by default: this is scored play."
      ] }),
      /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: Zt.map((C) => {
        const Y = L[C.key] ?? "default";
        return /* @__PURE__ */ d(
          "div",
          {
            style: {
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${pe}`,
              background: be
            },
            children: [
              /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                /* @__PURE__ */ d("div", { style: { minWidth: 0, flex: 1 }, children: [
                  /* @__PURE__ */ n("div", { style: { fontSize: 12.5, fontWeight: 700 }, children: C.label }),
                  /* @__PURE__ */ n("div", { style: { fontSize: 11, color: de }, children: C.sub })
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
                    children: ds.map((V) => {
                      const ie = Y === V.key;
                      return /* @__PURE__ */ n(
                        "button",
                        {
                          type: "button",
                          onClick: () => y((le) => ({ ...le, [C.key]: V.key })),
                          style: {
                            padding: "5px 9px",
                            borderRadius: 6,
                            border: 0,
                            background: ie ? V.key === "show" ? "#1c8a5a" : V.key === "hide" ? "#c0392b" : Ce : "transparent",
                            color: ie ? "#fff" : de,
                            fontFamily: "inherit",
                            fontSize: 10.5,
                            fontWeight: ie ? 800 : 600,
                            cursor: "pointer"
                          },
                          children: V.label
                        },
                        V.key
                      );
                    })
                  }
                )
              ] }),
              C.note && /* @__PURE__ */ n(os, { children: C.note })
            ]
          },
          C.key
        );
      }) }),
      /* @__PURE__ */ n("p", { style: { margin: "10px 0 0", fontSize: 11.5, color: de }, children: M })
    ] }),
    /* @__PURE__ */ d(Ot, { innerRef: P("review"), num: "04", title: "Review & create", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: ge, lineHeight: 1.5 }, children: fe ? "BEN bids every board silently while the learner bids it — that auction is the one theirs is set beside. It needs no card play, so it is quick." : "BEN plays every board silently while the learner plays it, and the two results are set side by side." }),
      E && /* @__PURE__ */ n(Qo, { children: E }),
      /* @__PURE__ */ d(
        "dl",
        {
          style: {
            margin: "0 0 12px",
            overflow: "hidden",
            borderRadius: 10,
            border: `1px solid ${pe}`,
            background: be
          },
          children: [
            /* @__PURE__ */ n(Ue, { k: "Title", v: k ? W : `${W} — auto-named` }),
            /* @__PURE__ */ n(Ue, { k: "Format", v: te.review }),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "Scoring",
                v: fe ? "Matched BEN's contract, board by board — no play score" : K.full
              }
            ),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "Boards",
                v: `${$.length} · ${$.filter((C) => C.edited).length} hand-set`
              }
            ),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "The seat",
                v: F.length === 1 && F[0] ? `${bs[F[0]]} on every board` : `Mixed (${F.join(", ")})`
              }
            ),
            /* @__PURE__ */ n(Ue, { k: "Controls", v: M }),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "Opponents",
                v: fe ? "3 BEN robots · BEN's own auction is the reference" : "3 BEN robots · a silent BEN line is the reference",
                last: !0
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ n(rs, { onClick: re, children: r }),
      /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", textAlign: "center", fontSize: 11.5, color: de }, children: "Solo — one learner, three robots, no field" })
    ] }),
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderTop: `1px solid ${pe}`,
          background: be
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
                children: W
              }
            ),
            /* @__PURE__ */ d("div", { style: { fontSize: 11, color: de }, children: [
              $.length,
              " board",
              $.length === 1 ? "" : "s",
              " · ",
              O,
              " · solo"
            ] })
          ] }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: re,
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
function Ss({
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
          border: `1px solid ${pe}`,
          background: be
        },
        children: [
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(-1),
              disabled: e <= dt,
              "aria-label": "One board fewer",
              style: dr(e <= dt),
              children: "−"
            }
          ),
          /* @__PURE__ */ n("span", { style: { minWidth: 46, textAlign: "center", fontSize: 18, fontWeight: 800 }, children: e }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(1),
              disabled: e >= Re,
              "aria-label": "One board more",
              style: dr(e >= Re),
              children: "+"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: ms.map((r) => /* @__PURE__ */ n(gt, { tone: e === r ? "accent" : "plain", onClick: () => t(r), children: r }, r)) })
  ] });
}
const dr = (e) => ({
  width: 40,
  height: 40,
  border: 0,
  background: $e,
  color: e ? de : Fe,
  fontFamily: "inherit",
  fontSize: 18,
  fontWeight: 800,
  cursor: e ? "default" : "pointer",
  opacity: e ? 0.5 : 1
}), vs = 400;
async function ws(e) {
  const { hands: t, dealer: o, vul: r, humanSeat: a, biddingOnly: l, decide: i, cancelled: s } = e;
  let c = kt("ben-reference", o, r, t);
  for (let u = 0; u < vs; u++) {
    if (s()) return null;
    if (Or(c.phase, l)) break;
    const p = c.turn;
    let b;
    try {
      b = await i(c, p);
    } catch {
      return null;
    }
    if (s() || !b) return null;
    if (c.phase === "auction" && b.call) {
      if (!Pe(c.auction, p).has(b.call)) return null;
      c = Le(c, {
        category: "bid-event",
        boardRef: c.boardRef,
        seat: p,
        call: b.call
      });
      continue;
    }
    if (c.phase === "play" && b.card) {
      const g = b.card;
      if (!Ut(c, p).some((x) => x.suit === g.suit && x.rank === g.rank))
        return null;
      c = Le(c, {
        category: "play-event",
        boardRef: c.boardRef,
        seat: p,
        card: g
      });
      continue;
    }
    return null;
  }
  return Ur(c, a, l);
}
function Ur(e, t, o) {
  const r = o ? null : yr(e), a = r ? t === "N" || t === "S" ? r.nsScore : -r.nsScore : void 0;
  return {
    contract: e.contract ?? null,
    ...e.contract ? { contractLabel: Ki(e.contract) } : {},
    ...r ? { resultLabel: mr(r) } : {},
    ...a === void 0 ? {} : { rawScore: a }
  };
}
const zn = "·", Je = "—", Ns = "BEN", $s = "YOU";
function cr(e, t, o) {
  return e === "imps" ? Ra(t - o) : e === "total" ? t - o : t > o ? 100 : t === o ? 50 : 0;
}
function Cs(e, t) {
  return e === "bidding-only" ? { label: "vs BEN", name: "Contract vs BEN" } : t === "mp" ? { label: "MP %", name: "Matchpoints vs BEN" } : t === "total" ? { label: "Pts", name: "Points vs BEN" } : { label: "IMPs", name: "IMPs vs BEN" };
}
function Bs(e, t) {
  return !e || !t || t.contract === void 0 ? "unrated" : Wa(e.contract, t.contract) ? "matched" : "differed";
}
function fr(e) {
  if (!e) return Je;
  const t = e.resultLabel || e.contractLabel || Je, o = e.rawScore;
  return typeof o == "number" ? `${t} (${o > 0 ? "+" : ""}${o})` : t;
}
function Ts(e, t) {
  const o = e == null ? void 0 : e.contract, r = t == null ? void 0 : t.contract;
  return o != null && r != null ? o.declarer === r.declarer : o === null && r === null;
}
function Es(e) {
  const { format: t, scoring: o, boardsTotal: r, outcomes: a, currentBoardNo: l } = e, i = t === "bidding-only", s = Cs(t, o), c = new Map(a.map((z) => [z.boardNo, z])), u = Array.from({ length: r }, (z, S) => S + 1), p = [
    { key: $s, label: "You", name: "You", isYou: !0 },
    { key: Ns, label: "BEN", name: "BEN", isBenchmark: !0 }
  ], b = [], g = [], x = {};
  let h = 0, m = 0, N = 0;
  const $ = [];
  for (const z of u) {
    const S = c.get(z), A = S == null ? void 0 : S.you, E = S == null ? void 0 : S.ben, U = !!A;
    U && (h += 1);
    let B = { text: "" }, q = { text: "" }, P, ne, R;
    if (i) {
      const _ = Bs(A, E);
      _ !== "unrated" && U && (m += 1), _ === "matched" && (N += 1), B = U ? {
        text: Wn(A == null ? void 0 : A.contract),
        ..._ === "matched" ? { value: 1 } : {},
        tone: An(_)
      } : { text: "" }, q = { text: E ? Wn(E.contract) : "" }, U && (P = Wn(A == null ? void 0 : A.contract), _ === "matched" && (ne = 1), R = An(_), x[z] = {
        headline: Ha(_, Ts(A, E)),
        sub: E === void 0 ? S != null && S.benFailed ? "BEN could not bid this board" : "BEN is still bidding this board" : `You: ${Go(A == null ? void 0 : A.contract)} ${zn} BEN: ${Go(E.contract)}`,
        tone: An(_)
      });
    } else {
      const _ = A == null ? void 0 : A.rawScore, D = E == null ? void 0 : E.rawScore, w = typeof _ == "number" && typeof D == "number";
      if (w) {
        m += 1;
        const M = cr(o, _, D);
        $.push(M);
        const F = o === "mp" ? 50 : 0;
        M >= F && (N += 1), B = {
          text: Uo(o, M),
          value: Math.round(M),
          tone: M > F ? "pos" : M < F ? "neg" : "neutral"
        }, P = B.text, ne = B.value, R = B.tone;
      } else U && (B = { text: Je }, P = Je, R = "neutral");
      q = { text: typeof D == "number" ? `${D > 0 ? "+" : ""}${D}` : "" }, U && (x[z] = {
        headline: w ? `${Uo(o, cr(o, _, D))} ${s.label}` : E === void 0 ? S != null && S.benFailed ? "BEN could not play this board" : "BEN is still playing this board" : Je,
        sub: `You: ${fr(A)}` + (typeof D == "number" ? ` ${zn} BEN: ${fr(E)}` : ""),
        tone: w ? B.tone ?? "neutral" : "neutral"
      });
    }
    b.push({ boardNo: z, cells: [B, q] }), g.push({
      boardNo: z,
      state: U ? "done" : z === l ? "current" : "todo",
      ...P === void 0 ? {} : { score: P },
      ...ne === void 0 ? {} : { value: ne },
      ...R === void 0 ? {} : { tone: R },
      disabled: !U
    });
  }
  const I = h === r && r > 0;
  let L, y, H, v;
  if (i)
    y = N, L = m === 0 ? Je : `${N}/${m}`, H = m > 0 && N === m ? "pos" : "neutral", v = m === 0 ? "BEN has not bid any of these boards yet" : `Reached BEN's contract on ${N} of ${m} board${m === 1 ? "" : "s"}`;
  else {
    const z = $.reduce((A, E) => A + E, 0);
    y = $.length === 0 ? 0 : o === "mp" ? z / $.length : z, L = $.length === 0 ? Je : Ia(o, y);
    const S = o === "mp" ? 50 : 0;
    H = $.length === 0 ? "neutral" : y > S ? "pos" : y < S ? "neg" : "neutral", v = $.length === 0 ? "BEN has not played any of these boards yet" : y > S ? `Ahead of BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : y < S ? `Behind BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : `Level with BEN over ${$.length} board${$.length === 1 ? "" : "s"}`;
  }
  const j = [
    { text: L, ...H === "neutral" ? {} : { tone: H } },
    { text: "" }
  ];
  return {
    unitLabel: s.label,
    unitName: s.name,
    subtitle: `${r} board${r === 1 ? "" : "s"} ${zn} ${s.name}`,
    headline: { text: L, sub: v, tone: H },
    columns: p,
    rows: b,
    totals: j,
    squares: g,
    details: x,
    mark: {
      boardsTotal: r,
      boardsDone: h,
      completed: I,
      boardsWon: N,
      rated: m,
      scoreText: L,
      scoreValue: y,
      percent: m === 0 ? 0 : Math.round(N / m * 100)
    }
  };
}
function Rs(e) {
  return e.boards.map((t, o) => {
    let r = Qe(t.seed);
    if (t.pack) {
      const a = Vn(t.pack);
      "error" in a || (r = a.hands);
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
function od({
  draft: e,
  decide: t,
  height: o = 520,
  appearance: r,
  robotDelayMs: a = 350,
  benReference: l = !0,
  onProgress: i,
  onComplete: s
}) {
  var D;
  const c = ce(
    () => Yr(e) ?? {
      title: "",
      description: "",
      scoring: "imps",
      boards: [],
      controlOverrides: {}
    },
    [e]
  ), u = ce(() => Rs(c), [c]), p = Mr(c), b = Ca(c), { showAllHands: g } = fs(c.controlOverrides), [x, h] = G(0), [m, N] = G({}), [$, I] = G(!1), [L, y] = G(!0), H = oe(null), v = u[Math.min(x, u.length - 1)], j = v ? !!((D = m[v.boardNo]) != null && D.you) : !1;
  me(() => {
    const w = H.current;
    if (!w) return;
    const M = () => {
      const te = w.clientWidth || 390, K = w.clientHeight || 844;
      y(te / Math.max(1, K) < 1.25 && te < 640);
    };
    M();
    const F = new ResizeObserver(M);
    return F.observe(w), () => F.disconnect();
  }, []);
  const z = oe(/* @__PURE__ */ new Map()), S = ce(() => {
    if (t)
      return async (w, M) => {
        var fe, O;
        const F = `${w.dealer}|${M}|${Ea({
          dealer: w.dealer,
          auction: w.auction.map((ee) => ({ seat: ee.seat, call: ee.call })),
          play: w.tricks.flatMap((ee) => ee.plays.map((k) => ({ seat: k.seat, card: k.card })))
        })}|${w.hands[M].length}|${((fe = w.hands[M][0]) == null ? void 0 : fe.suit) ?? ""}${((O = w.hands[M][0]) == null ? void 0 : O.rank) ?? ""}`, te = z.current.get(F);
        if (te) return await te;
        const K = Promise.resolve(t(w, M));
        z.current.set(F, K);
        try {
          const ee = await K;
          return ee || z.current.delete(F), ee;
        } catch (ee) {
          throw z.current.delete(F), ee;
        }
      };
  }, [t]);
  me(() => {
    var M, F;
    if (!l || !S || !v || (M = m[v.boardNo]) != null && M.ben || (F = m[v.boardNo]) != null && F.benFailed) return;
    let w = !1;
    return (async () => {
      const te = await ws({
        hands: v.hands,
        dealer: v.dealer,
        vul: v.vul,
        humanSeat: v.humanSeat,
        biddingOnly: b,
        decide: S,
        cancelled: () => w
      });
      w || N((K) => ({
        ...K,
        [v.boardNo]: {
          boardNo: v.boardNo,
          ...K[v.boardNo],
          ...te ? { ben: te } : { benFailed: !0 }
        }
      }));
    })(), () => {
      w = !0;
    };
  }, [l, S, v == null ? void 0 : v.boardNo, b]);
  const A = He(
    (w) => {
      v && N(
        (M) => {
          var F;
          return (F = M[v.boardNo]) != null && F.you ? M : {
            ...M,
            [v.boardNo]: {
              boardNo: v.boardNo,
              ...M[v.boardNo],
              you: Ur(w, v.humanSeat, b)
            }
          };
        }
      );
    },
    [v, b]
  ), E = He(
    (w) => {
      Or(w.phase, b) && A(w);
    },
    [b, A]
  ), U = ce(
    () => Es({
      format: p,
      scoring: c.scoring,
      boardsTotal: u.length,
      outcomes: Object.values(m),
      ...v ? { currentBoardNo: v.boardNo } : {}
    }),
    [p, c.scoring, u.length, m, v]
  ), B = JSON.stringify(U.mark), q = oe(""), P = oe(!1);
  me(() => {
    if (q.current === B) return;
    q.current = B;
    const w = JSON.parse(B);
    i == null || i(w), w.completed && !P.current && (P.current = !0, s == null || s(w));
  }, [B]);
  const ne = U.squares.map((w) => ({
    boardNo: w.boardNo,
    text: w.score ?? "",
    ...w.value === void 0 ? {} : { value: w.value },
    ...w.tone === void 0 ? {} : { tone: w.tone },
    current: (v == null ? void 0 : v.boardNo) === w.boardNo
  })), R = x >= u.length - 1, _ = v ? U.details[v.boardNo] : void 0;
  return v ? /* @__PURE__ */ d(
    "div",
    {
      ref: H,
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
          ta,
          {
            title: c.title || "Challenge",
            boardNo: v.boardNo,
            boardsTotal: u.length,
            showResults: U.mark.boardsDone > 0,
            height: zr,
            onResults: () => I(!0)
          }
        ),
        /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative" }, children: j ? /* @__PURE__ */ n(
          As,
          {
            boardNo: v.boardNo,
            boardsTotal: u.length,
            headline: (_ == null ? void 0 : _.headline) ?? "",
            sub: (_ == null ? void 0 : _.sub) ?? "",
            tone: (_ == null ? void 0 : _.tone) ?? "neutral",
            last: R,
            onNext: () => h((w) => w + 1),
            onResults: () => I(!0)
          }
        ) : /* @__PURE__ */ n(
          ga,
          {
            deal: v.hands,
            seed: v.seed,
            dealer: v.dealer,
            vul: v.vul,
            humanSeat: v.humanSeat,
            showAllHands: g,
            robotDelayMs: a,
            ...r ? { appearance: r } : {},
            ...S ? { decide: S } : {},
            onState: E
          },
          `${v.boardNo}:${v.seed}`
        ) }),
        /* @__PURE__ */ n(
          ca,
          {
            open: $,
            onClose: () => I(!1),
            boards: ne,
            viewportPhone: L,
            subtitle: U.subtitle,
            children: /* @__PURE__ */ n(Ws, { view: U })
          }
        )
      ]
    }
  ) : /* @__PURE__ */ n("div", { style: { fontFamily: qt, padding: 16, color: ge }, children: "This challenge has no boards yet." });
}
function Ws({ view: e }) {
  return /* @__PURE__ */ d("div", { style: { fontFamily: qt }, children: [
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
          /* @__PURE__ */ n("span", { style: { fontSize: 28, fontWeight: 800, color: Ae(e.headline.tone) }, children: e.headline.text }),
          /* @__PURE__ */ d("div", { style: { minWidth: 0 }, children: [
            /* @__PURE__ */ n("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#8b9a93" }, children: e.unitLabel.toUpperCase() }),
            /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: "#5c6b64" }, children: e.headline.sub })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ n(ha, { columns: e.columns, rows: e.rows, totals: e.totals }),
    /* @__PURE__ */ n("div", { style: { marginTop: 10, fontSize: 10.5, color: "#a2ada7", lineHeight: 1.5 }, children: "Solo — there is no field. Every figure is your board set beside BEN's on the same deal, and a different contract is a difference, not a mistake." })
  ] });
}
function As({
  boardNo: e,
  boardsTotal: t,
  headline: o,
  sub: r,
  tone: a,
  last: l,
  onNext: i,
  onResults: s
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
        fontFamily: qt
      },
      children: /* @__PURE__ */ d(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: 380,
            padding: 16,
            borderRadius: 14,
            background: be,
            color: Fe,
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
                  color: de
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
            /* @__PURE__ */ n("div", { style: { marginTop: 6, fontSize: 19, fontWeight: 800, color: Ae(a) }, children: o || "Board complete" }),
            /* @__PURE__ */ n("div", { style: { marginTop: 6, fontSize: 12.5, color: ge, lineHeight: 1.5 }, children: r }),
            /* @__PURE__ */ d("div", { style: { display: "flex", gap: 8, marginTop: 14 }, children: [
              /* @__PURE__ */ n(
                "button",
                {
                  type: "button",
                  onClick: s,
                  style: {
                    flex: "none",
                    height: 42,
                    padding: "0 14px",
                    borderRadius: 9,
                    border: `1px solid ${pe}`,
                    background: $e,
                    color: ge,
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer"
                  },
                  children: "Results"
                }
              ),
              !l && /* @__PURE__ */ n(
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
            /* @__PURE__ */ n("div", { style: { marginTop: 8, fontSize: 11, color: de }, children: l ? `All ${t} board${t === 1 ? "" : "s"} played` : `${t - e} board${t - e === 1 ? "" : "s"} left` })
          ]
        }
      )
    }
  );
}
const Is = ["S", "H", "D", "C"], Hs = { N: "S", S: "N", E: "W", W: "E" }, zs = {
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
function Gr(e) {
  return e === 10 ? "T" : bt(e);
}
function Pt(e) {
  return Is.map(
    (t) => e.filter((o) => o.suit === t).sort((o, r) => r.rank - o.rank).map((o) => Gr(o.rank)).join("")
  ).join(".");
}
function Ds(e) {
  return e === "P" ? "--" : e === "X" ? "Db" : e === "XX" ? "Rd" : e;
}
function Ms(e) {
  return e.map((t) => Ds(t.call)).join("");
}
function Os(e) {
  return e === "both" ? "@v@V" : e === "ns" ? "@v" : e === "ew" ? "@V" : "";
}
function Ls(e) {
  return e.tricks.flatMap((t) => t.plays).map((t) => `${t.card.suit}${Gr(t.card.rank)}`).join("");
}
function Ft(e, t) {
  return [
    ...e.hands[t],
    ...e.tricks.flatMap(
      (o) => o.plays.filter((r) => r.seat === t).map((r) => r.card)
    )
  ];
}
function Ps(e) {
  const t = e.trim().toUpperCase();
  if (t === "PASS" || t === "P" || t === "--" || t === "PA") return "P";
  if (t === "X" || t === "DB" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RD" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = /^([1-7])(NT|N|C|D|H|S)$/.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function Fs(e) {
  const t = /^([SHDC])([2-9TJQKA])$/.exec(e.trim().toUpperCase());
  return t ? { suit: t[1], rank: zs[t[2]] } : null;
}
function rd({
  endpoint: e,
  timeoutMs: t = 6e4,
  fetchImpl: o,
  onProblem: r
}) {
  const a = e.replace(/\/$/, ""), l = o ?? ((...s) => fetch(...s)), i = async (s, c) => {
    const u = `${a}${s}?${new URLSearchParams({ ...c, details: "true" })}`, p = new AbortController(), b = setTimeout(() => p.abort(), t);
    try {
      const g = await l(u, { signal: p.signal });
      if (!g.ok) throw new Error(`HTTP ${g.status}`);
      return await g.json();
    } finally {
      clearTimeout(b);
    }
  };
  return async (s, c) => {
    var b;
    const u = Os(s.vul), p = Ms(s.auction);
    try {
      if (s.phase === "auction") {
        const g = await i("/bid", {
          hand: Pt(Ft(s, c)),
          seat: c,
          dealer: s.dealer,
          vul: u,
          ctx: p
        }), x = typeof g.bid == "string" ? g.bid : "", h = Ps(x);
        return Pe(s.auction, c).has(h) ? { call: h } : (r == null || r(`BEN answered "${x}" for ${c}, which is not legal here`), null);
      }
      if (s.phase === "play") {
        const g = Ls(s), x = ((b = s.contract) == null ? void 0 : b.declarer) ?? null, h = x ? Hs[x] : null, m = c === h && x ? x : c, N = g === "" ? await i("/lead", {
          hand: Pt(Ft(s, c)),
          seat: c,
          dealer: s.dealer,
          vul: u,
          ctx: p
        }) : await i("/play", {
          hand: Pt(Ft(s, m)),
          dummy: h ? Pt(Ft(s, h)) : "",
          seat: m,
          dealer: s.dealer,
          vul: u,
          ctx: p,
          played: g
        }), $ = typeof N.card == "string" ? N.card : "", I = Fs($);
        return I ? Ut(s, c).some((y) => y.suit === I.suit && y.rank === I.rank) ? { card: I } : (r == null || r(`BEN's ${$} is not legal for ${c} here`), null) : (r == null || r(`BEN answered "${$}" for ${c}, which is not a card`), null);
      }
      return null;
    } catch (g) {
      return r == null || r(`BEN could not be reached (${g.message})`), null;
    }
  };
}
const _s = {
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
function _t(e, t) {
  return t.split(/\s+/).filter(Boolean).map((o) => {
    const r = _s[o.toUpperCase()];
    if (!r) throw new Error(`"${o}" is not a rank (suit ${e})`);
    return { suit: e, rank: r };
  });
}
const ae = (e, t, o, r) => [
  ..._t("S", e),
  ..._t("H", t),
  ..._t("D", o),
  ..._t("C", r)
];
function Jr(e) {
  return e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
}
const Vr = [
  { no: 1, hand: ae("A K 5 4 3", "K 8 2", "Q 7 3", "5 4"), bid: "1S", why: "12 HCP, 5-card spade suit" },
  { no: 2, hand: ae("9 4", "A K J T 5 3", "K 8 2", "7 3"), bid: "1H", why: "11 HCP, 6-card heart suit" },
  { no: 3, hand: ae("K J 2", "Q 5 4", "A K T 8 3", "6 2"), bid: "1D", why: "13 HCP, 5-card diamond suit" },
  { no: 4, hand: ae("A K 3", "Q J 4", "K 8 5", "A T 6 2"), bid: "1N", why: "17 HCP, balanced 4-3-3-3 shape" },
  { no: 5, hand: ae("A K Q J", "A K Q", "A K 4", "K J 2"), bid: "2C", why: "30 HCP, strong artificial opening" },
  { no: 6, hand: ae("7", "K J T 8 6 3", "9 5 4 2", "A 8"), bid: "2H", why: "8 HCP, weak two in hearts" },
  { no: 7, hand: ae("9 4 3", "8 5 2", "K T 4", "J 8 7 3"), bid: "P", why: "4 HCP, too weak to open" },
  { no: 8, hand: ae("A Q J T 8", "4 3", "K 5 2", "A 7 3"), bid: "1S", why: "14 HCP, 5-card spade suit" },
  { no: 9, hand: ae("Q 5 4 2", "A J 4", "K J 6", "A Q 3"), bid: "1N", why: "17 HCP, balanced distribution" },
  { no: 10, hand: ae("5 4", "A K Q J 7", "Q 8 4 3", "K 5"), bid: "1H", why: "15 HCP, 5-card heart suit" },
  { no: 11, hand: ae("A J 2", "8 4", "A K Q J 5", "7 4 2"), bid: "1D", why: "15 HCP, 5-card diamond suit" },
  { no: 12, hand: ae("K J T 9 8 5", "7 3", "8 4", "Q T 2"), bid: "2S", why: "6 HCP, weak two in spades" },
  { no: 13, hand: ae("K 4", "A 5", "K J 8 2", "A K Q 9 3"), bid: "1C", why: "20 HCP, 5-card club suit" },
  { no: 14, hand: ae("A K Q", "K J 5", "A Q 4", "K T 8 3"), bid: "2N", why: "22 HCP, balanced distribution" },
  { no: 15, hand: ae("8 4 3", "9 7 2", "Q 5 4", "K J 8 2"), bid: "P", why: "6 HCP, insufficient points" },
  { no: 16, hand: ae("K Q J T 8 7", "A 4", "9 5", "K 4 2"), bid: "1S", why: "13 HCP, 6-card spade suit" },
  { no: 17, hand: ae("3", "A K J T 8 7", "Q 5 4", "A J 3"), bid: "1H", why: "15 HCP, 6-card heart suit" },
  { no: 18, hand: ae("A K 4", "8 3", "K J T 8 7 2", "5 4"), bid: "1D", why: "11 HCP, 6-card diamond suit" },
  { no: 19, hand: ae("A 5", "K 4", "A 8 3", "K J T 8 7 2"), bid: "1C", why: "15 HCP, 6-card club suit" },
  { no: 20, hand: ae("K Q J T 9 8 3", "5", "8 4 2", "7 3"), bid: "3S", why: "6 HCP, 7-card preemptive bid" },
  { no: 21, hand: ae("A J 5", "K Q 4", "A T 8 2", "Q J 5"), bid: "1N", why: "17 HCP, balanced distribution" },
  { no: 22, hand: ae("K 5 2", "A Q J 9 4", "7 3", "A K 2"), bid: "1H", why: "17 HCP, 5-card heart suit" },
  { no: 23, hand: ae("8 4", "6 3", "K Q J T 8 7", "9 5 2"), bid: "2D", why: "6 HCP, weak two in diamonds" },
  { no: 24, hand: ae("A K Q 9 4", "J 5 2", "K 3", "8 7 4"), bid: "1S", why: "13 HCP, 5-card spade suit" },
  { no: 25, hand: ae("A J T 8 4", "K Q 3", "A 5", "K 4 2"), bid: "1S", why: "17 HCP, 5-card spade suit" }
];
function Xs(e = Vr) {
  var o;
  const t = [];
  for (const r of e) {
    r.hand.length !== 13 && t.push({ no: r.no, kind: "short", detail: `${r.hand.length} cards, not 13` });
    const a = (o = /(\d+)\s*HCP/i.exec(r.why)) == null ? void 0 : o[1], l = Jr(r.hand);
    a && Number(a) !== l && t.push({ no: r.no, kind: "hcp", detail: `note says ${a} HCP, cards hold ${l}` });
  }
  return t;
}
const js = /^([1-7])(NT?|[CDHS])$/;
function vt(e) {
  const t = (e ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (t === "P" || t === "PASS" || t === "NB" || t === "NOBID") return "P";
  if (t === "X" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RDBL" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = js.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function id(e, t) {
  return vt(e) === vt(t);
}
function Ks(e, t, o) {
  const r = vt(e.bid), a = vt(o);
  return { index: t, no: e.no, yourCall: a, authorCall: r, matched: a === r };
}
function Ys(e, t) {
  const o = e.length, r = e.filter((a) => a.matched).length;
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
const Us = [...Pe([], "S")], Gs = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Js = (e) => e === "H" || e === "D", Vs = (e) => /^[1-7][CDHSN]$/.test(e), Dn = "#fbfbfa", lt = "rgba(0,0,0,0.10)", at = "#111827", Ge = "#6B7280", hr = "#2f5c8f", pt = "#1a7f4b", Xt = "#b4451c", Qr = "#8a5a00", qr = "#fff8e6", Zr = "rgba(180,130,0,0.35)";
function jt({ call: e, size: t = 15, tone: o = at }) {
  const r = vt(e);
  if (!Vs(r))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: o }, children: r === "P" ? "Pass" : r });
  const a = r[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: t, fontWeight: 700, color: o, whiteSpace: "nowrap" }, children: [
    r[0],
    /* @__PURE__ */ n("span", { style: { color: Js(a) ? "#cc0000" : o }, children: Gs[a] })
  ] });
}
function ur({ problems: e }) {
  const t = e.filter((r) => r.kind === "short"), o = e.filter((r) => r.kind === "hcp");
  return /* @__PURE__ */ d(
    "div",
    {
      style: {
        background: qr,
        border: `1px solid ${Zr}`,
        borderRadius: 10,
        padding: "8px 10px",
        marginBottom: 10,
        fontSize: 12,
        lineHeight: 1.45,
        color: Qr
      },
      children: [
        /* @__PURE__ */ n("strong", { style: { fontWeight: 700 }, children: "This hand set needs patching." }),
        " ",
        t.length > 0 && /* @__PURE__ */ d(ye, { children: [
          t.length,
          " hand",
          t.length === 1 ? " is" : "s are",
          " short of thirteen cards (",
          t.map((r) => `#${r.no} — ${r.detail}`).join("; "),
          "), so the hand DRAWN below is incomplete. The taught call is unaffected, and the drill runs.",
          " "
        ] }),
        o.length > 0 && /* @__PURE__ */ d(ye, { children: [
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
function ld({
  hands: e = Vr,
  limit: t,
  showDataNotice: o = !0,
  onProgress: r,
  onComplete: a
}) {
  const l = ce(
    () => t && t > 0 ? e.slice(0, t) : e.slice(),
    [e, t]
  ), i = ce(() => Xs([...e]), [e]), s = ce(
    () => JSON.stringify(l.map((O) => [O.no, O.bid, O.hand.length])),
    [l]
  ), [c, u] = G(0), [p, b] = G({}), [g, x] = G(null), [h, m] = G(!1), N = oe(!1), $ = He(() => {
    u(0), b({}), x(null), m(!1), N.current = !1;
  }, []), I = oe(s);
  I.current !== s && (I.current = s, (c !== 0 || h || Object.keys(p).length) && $());
  const L = ce(
    () => l.flatMap((O, ee) => {
      const k = p[ee];
      return k ? [Ks(O, ee, k)] : [];
    }),
    [l, p]
  ), y = ce(() => Ys(L, l.length), [L, l.length]), H = oe(r);
  H.current = r;
  const v = oe(a);
  v.current = a, me(() => {
    var O;
    y.handsDone === 0 && !h || (O = H.current) == null || O.call(H, y);
  }, [y, h]), me(() => {
    var O;
    !h || N.current || (N.current = !0, (O = v.current) == null || O.call(v, y, L));
  }, [h, y, L]);
  const j = oe(null), [z, S] = G(560);
  me(() => {
    const O = j.current;
    if (!O) return;
    const ee = () => S(O.clientWidth || 560);
    ee();
    const k = new ResizeObserver(ee);
    return k.observe(O), () => k.disconnect();
  }, []);
  const A = 280, E = 14, U = 14, B = z >= A + U + 240 + E * 2, q = (B ? z - E * 2 - U - A : z - E * 2) - 6, P = Math.max(26, Math.min(46, Math.floor((q - 70) / 5.65))), ne = 5 * (P + 14) + 4 * Math.round(P * 0.13);
  if (l.length === 0)
    return /* @__PURE__ */ n("div", { style: { padding: 16, fontSize: 13, color: Ge, background: Dn, border: `1px solid ${lt}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const R = l[Math.min(c, l.length - 1)], _ = L.find((O) => O.index === c) ?? null, D = Jr(R.hand), w = 13 - R.hand.length, M = /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }, children: l.map((O, ee) => {
    const k = L.find((W) => W.index === ee);
    return /* @__PURE__ */ n(
      "span",
      {
        title: `Hand ${ee + 1}`,
        style: {
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: k ? k.matched ? pt : Xt : "transparent",
          border: `1.5px solid ${ee === c && !h ? hr : "rgba(0,0,0,0.22)"}`,
          boxSizing: "border-box"
        }
      },
      ee
    );
  }) }), F = () => c + 1 < l.length ? u(c + 1) : m(!0);
  if (h)
    return /* @__PURE__ */ d("div", { ref: j, style: { background: Dn, border: `1px solid ${lt}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        Jn,
        {
          line: "Drill complete",
          score: `${y.matched} of ${y.handsDone} matched`,
          detail: `the author's opening bid · ${y.percent}%`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 14 }, children: L.map((O) => /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${lt}`,
            fontSize: 13,
            color: Ge
          },
          children: [
            /* @__PURE__ */ d("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              O.no
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(jt, { call: O.yourCall, tone: O.matched ? pt : Xt })
            ] }),
            !O.matched && /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "the book" }),
              /* @__PURE__ */ n(jt, { call: O.authorCall })
            ] }),
            /* @__PURE__ */ n("span", { style: { marginLeft: "auto", color: O.matched ? pt : Xt, fontWeight: 700 }, children: O.matched ? "match" : "no" })
          ]
        },
        O.index
      )) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: $,
          style: {
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${lt}`,
            borderRadius: 8,
            background: "#fff",
            color: at,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Bid them again"
        }
      ),
      o && i.length > 0 && /* @__PURE__ */ n("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ n(ur, { problems: i }) })
    ] });
  const te = /* @__PURE__ */ d("div", { style: { flex: B ? "1 1 0" : void 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }, children: [
    /* @__PURE__ */ n(Nt, { cards: R.hand, panelBg: "#fff", width: "100%", font: 20, suitW: 18, pad: "6px 10px" }),
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: Ge }, children: [
      /* @__PURE__ */ d("span", { style: { fontWeight: 700, color: at }, children: [
        D,
        " HCP"
      ] }),
      /* @__PURE__ */ d("span", { children: [
        R.hand.length,
        " cards"
      ] })
    ] }),
    w > 0 && /* @__PURE__ */ d("p", { style: { fontSize: 11.5, lineHeight: 1.4, color: Qr, background: qr, border: `1px solid ${Zr}`, borderRadius: 8, padding: "6px 8px", margin: 0 }, children: [
      "This hand was supplied ",
      w === 1 ? "one card" : `${w} cards`,
      " short, so the diagram is incomplete. The opening call it teaches is unaffected — bid it as it stands."
    ] })
  ] }), K = _ && /* @__PURE__ */ d("div", { style: { background: "#fff", border: `1px solid ${lt}`, borderRadius: 10, padding: "10px 12px" }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: Ge }, children: [
      /* @__PURE__ */ n("span", { children: "You bid" }),
      /* @__PURE__ */ n(jt, { call: _.yourCall, size: 17, tone: _.matched ? pt : at }),
      _.matched ? /* @__PURE__ */ n("span", { style: { color: pt, fontWeight: 700 }, children: "— that is the opening bid." }) : /* @__PURE__ */ d(ye, { children: [
        /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
        /* @__PURE__ */ n("span", { children: "the opening bid is" }),
        /* @__PURE__ */ n(jt, { call: _.authorCall, size: 17, tone: Xt })
      ] })
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 13, lineHeight: 1.45, color: at, marginTop: 8, marginBottom: 0 }, children: R.why }),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: F,
        style: {
          marginTop: 12,
          height: 38,
          padding: "0 18px",
          border: 0,
          borderRadius: 8,
          background: hr,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer"
        },
        children: c + 1 < l.length ? "Next hand →" : "See how you did"
      }
    )
  ] }), fe = /* @__PURE__ */ n(
    "div",
    {
      style: {
        flex: B ? `0 0 ${ne}px` : void 0,
        width: B ? ne : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8
      },
      children: _ ? /* @__PURE__ */ n("div", { style: { width: "100%" }, children: K }) : /* @__PURE__ */ d(ye, { children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 12, color: Ge, alignSelf: "flex-start" }, children: g ? "Confirm your call" : "Your opening call?" }),
        /* @__PURE__ */ n(
          mt,
          {
            cell: P,
            radius: 6,
            legalCalls: Us,
            live: !0,
            pending: g,
            onStage: x,
            onConfirm: () => {
              g && (b((O) => ({ ...O, [c]: g })), x(null));
            },
            onCancel: () => x(null)
          }
        )
      ] })
    }
  );
  return /* @__PURE__ */ d("div", { ref: j, style: { background: Dn, border: `1px solid ${lt}`, borderRadius: 12, padding: E }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }, children: [
      /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 700, color: at }, children: [
        "Hand ",
        c + 1,
        " of ",
        l.length
      ] }),
      M
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 12, color: Ge, margin: "0 0 10px" }, children: "You are the dealer, nobody vulnerable — what do you open?" }),
    o && i.length > 0 && /* @__PURE__ */ n(ur, { problems: i }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: B ? "row" : "column", gap: U, alignItems: "flex-start" }, children: [
      te,
      fe
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: Ge, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "The answers are the author's, taken from the lesson this drill belongs to. No engine is consulted." })
  ] });
}
export {
  ld as BiddingChallenge,
  ed as BiddingDrill,
  ga as BridgeTable,
  nd as ChallengeCreator,
  od as ChallengePlayer,
  td as DealDiagram,
  Re as MAX_BOARDS,
  dt as MIN_BOARDS,
  Vr as OPENING_BID_HANDS,
  Es as buildSoloResults,
  id as callsMatch,
  rd as createBenDecider,
  Jr as hcp,
  Ks as judgeHand,
  Ys as markAnswers,
  vt as normalizeCall,
  Yr as normalizeDraft,
  Vn as packFromDraft,
  Qe as seededDeal,
  ps as validateDraft,
  Xs as validateDrillHands
};
//# sourceMappingURL=table-embed.js.map
