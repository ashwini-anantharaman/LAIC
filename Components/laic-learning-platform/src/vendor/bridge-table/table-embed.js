import { jsxs as c, jsx as n, Fragment as Ne } from "react/jsx-runtime";
import { createContext as Zr, useContext as ei, useState as K, useRef as ie, useCallback as Fe, useLayoutEffect as pt, useEffect as ye, useReducer as ti, useMemo as me } from "react";
function dt(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function Vn(e) {
  return `${e.suit}${e.rank}`;
}
const Te = ["S", "W", "N", "E"];
function ct(e) {
  return Te[(Te.indexOf(e) + 1) % 4];
}
function ni(e) {
  return ct(ct(e));
}
function jo(e, t) {
  return e === t || ni(e) === t;
}
const oi = {
  none: "None",
  ns: "N-S",
  ew: "E-W",
  both: "Both"
};
function ri(e, t) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const o = t === "N" || t === "S";
  return e === "ns" ? o : !o;
}
const ii = { C: "♣", D: "♦", H: "♥", S: "♠" };
function Wt(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
function li(e) {
  const t = e.strain === "N" ? "NT" : ii[e.strain], o = e.doubled === 1 ? " X" : e.doubled === 2 ? " XX" : "";
  return `${e.level}${t}${o} by ${e.declarer}`;
}
const Yo = ["C", "D", "H", "S", "N"];
function Kn(e) {
  return Wt(e) ? (Number(e[0]) - 1) * 5 + Yo.indexOf(e[1]) : -1;
}
function Ke(e, t) {
  const o = /* @__PURE__ */ new Set(["P"]);
  let r = -1;
  for (const l of e) r = Math.max(r, Kn(l.call));
  for (let l = 1; l <= 7; l++)
    for (const i of Yo) {
      const s = `${l}${i}`;
      Kn(s) > r && o.add(s);
    }
  let a = null;
  for (let l = e.length - 1; l >= 0; l--)
    if (e[l].call !== "P") {
      a = e[l];
      break;
    }
  return a && !jo(a.seat, t) && (Wt(a.call) ? o.add("X") : a.call === "X" && o.add("XX")), o;
}
function ai(e) {
  if (e.length < 4) return !1;
  const t = e.slice(-3);
  return t.length === 3 && t.every((o) => o.call === "P");
}
function si(e) {
  let t = null, o = 0;
  for (const i of e)
    Wt(i.call) ? (t = i, o = 0) : i.call === "X" ? o = 1 : i.call === "XX" && (o = 2);
  if (!t) return null;
  const r = t.call[1], a = t.seat;
  let l = t.seat;
  for (const i of e)
    if (Wt(i.call) && i.call[1] === r && jo(i.seat, a)) {
      l = i.seat;
      break;
    }
  return { level: Number(t.call[0]), strain: r, doubled: o, declarer: l };
}
function ut(e, t, o, r) {
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
const Uo = (e) => e === "N" || e === "S" ? "NS" : "EW";
function di(e, t) {
  const o = e.plays[0].card.suit, r = (l, i) => {
    const s = t !== "N" && l.suit === t, d = t !== "N" && i.suit === t;
    if (s && !d) return !0;
    if (d && !s) return !1;
    if (s && d) return l.rank > i.rank;
    const p = l.suit === o, h = i.suit === o;
    return p && !h ? !0 : h && !p ? !1 : l.rank > i.rank;
  };
  let a = e.plays[0];
  for (const l of e.plays.slice(1)) r(l.card, a.card) && (a = l);
  return a.seat;
}
function It(e, t) {
  const o = e.hands[t], r = e.tricks[e.tricks.length - 1];
  if (!r || r.plays.length === 0 || r.plays.length === 4) return [...o];
  const l = r.plays[0].card.suit, i = o.filter((s) => s.suit === l);
  return i.length ? i : [...o];
}
function Oe(e, t) {
  if (t.category === "bid-event") {
    const g = [...e.auction, { seat: t.seat, call: t.call }];
    if (!ai(g))
      return { ...e, auction: g, turn: ct(t.seat) };
    const b = si(g);
    if (!b)
      return { ...e, auction: g, contract: null, phase: "complete" };
    const k = ct(b.declarer);
    return {
      ...e,
      auction: g,
      contract: b,
      phase: "play",
      turn: k,
      tricks: [{ leader: k, plays: [] }]
    };
  }
  const o = t.seat, r = {
    ...e.hands,
    [o]: e.hands[o].filter((g) => Vn(g) !== Vn(t.card))
  }, a = e.tricks.map((g) => ({ ...g, plays: [...g.plays] }));
  let l = a[a.length - 1];
  if ((!l || l.plays.length === 4) && (l = { leader: o, plays: [] }, a.push(l)), l.plays.push({ seat: o, card: t.card }), l.plays.length < 4)
    return { ...e, hands: r, tricks: a, turn: ct(o) };
  const i = e.contract ? e.contract.strain : "N", s = di(l, i);
  l.winner = s;
  const d = Uo(s), p = { ...e.trickCount, [d]: e.trickCount[d] + 1 }, h = r.N.length === 0 && r.E.length === 0 && r.S.length === 0 && r.W.length === 0;
  return {
    ...e,
    hands: r,
    tricks: a,
    trickCount: p,
    turn: s,
    phase: h ? "complete" : "play"
  };
}
const Jn = { C: 20, D: 20, H: 30, S: 30 };
function Go(e) {
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
  const o = Uo(t.declarer), r = e.trickCount[o], a = 6 + t.level, l = r - a, i = l >= 0, s = ri(e.vul, t.declarer), d = t.doubled, p = d === 2 ? 4 : d === 1 ? 2 : 1;
  let h = 0, g = 0, b = 0, k = 0, u = 0, m = 0, N = 0;
  if (i) {
    h = t.strain === "N" ? (40 + (t.level - 1) * 30) * p : Jn[t.strain] * t.level * p;
    const I = d === 0 ? t.strain === "N" ? 30 : Jn[t.strain] : (s ? 200 : 100) * (d === 2 ? 2 : 1);
    g = l * I, h >= 100 ? b = s ? 500 : 300 : k = 50, t.level === 6 && (u = s ? 750 : 500), t.level === 7 && (u = s ? 1500 : 1e3), d > 0 && (m = 50 * d);
  } else {
    const I = -l;
    if (d === 0)
      N = I * (s ? 100 : 50);
    else {
      let F = 0;
      for (let y = 1; y <= I; y++)
        y === 1 ? F += s ? 200 : 100 : y <= 3 ? F += s ? 300 : 200 : F += 300;
      N = F * (d === 2 ? 2 : 1);
    }
  }
  const $ = i ? h + g + b + k + u + m : -N;
  return {
    contract: t,
    tricksTaken: r,
    result: l,
    made: i,
    vulnerable: s,
    trickScore: h,
    overtrickScore: g,
    gameBonus: b,
    partscoreBonus: k,
    slamBonus: u,
    insultBonus: m,
    penalty: N,
    declarerScore: $,
    nsScore: o === "NS" ? $ : -$
  };
}
function Vo(e) {
  if (!e.contract) return "Passed out";
  const t = e.contract, o = t.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[t.strain], r = t.doubled === 1 ? " X" : t.doubled === 2 ? " XX" : "", a = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${t.level}${o}${r} by ${t.declarer}, ${a}`;
}
function ci(e) {
  let t = e >>> 0;
  return () => {
    t |= 0, t = t + 1831565813 | 0;
    let o = Math.imul(t ^ t >>> 15, 1 | t);
    return o = o + Math.imul(o ^ o >>> 7, 61 | o) ^ o, ((o ^ o >>> 14) >>> 0) / 4294967296;
  };
}
function Je(e) {
  const t = ci(e), r = ["S", "H", "D", "C"].flatMap(
    (l) => Array.from({ length: 13 }, (i, s) => ({ suit: l, rank: s + 2 }))
  );
  for (let l = r.length - 1; l > 0; l--) {
    const i = Math.floor(t() * (l + 1));
    [r[l], r[i]] = [r[i], r[l]];
  }
  const a = { N: [], E: [], S: [], W: [] };
  return r.forEach((l, i) => a[Te[i % 4]].push(l)), a;
}
const fi = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, ui = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, hi = { skin: "bbo" }, pi = {
  skins: fi,
  strainTint: ui,
  defaults: hi
}, wn = pi, qn = wn.skins, en = wn.strainTint, gi = {
  skin: wn.defaults.skin
};
function Ko(e, t = {}) {
  const o = qn[e] ?? qn[gi.skin], r = (l) => {
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
const bi = ["N", "S", "H", "D", "C"], Jo = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, yi = [1, 2, 3, 4, 5, 6, 7], mi = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${Jo[e[1] ?? "N"] ?? ""}`;
function Rt({
  cell: e = 46,
  minCellH: t = 0,
  radius: o = 5,
  legalCalls: r,
  live: a,
  pending: l,
  onStage: i,
  onConfirm: s,
  onCancel: d
}) {
  const p = Math.round(e * 0.13), h = Math.round(e * 0.11), g = e, b = Math.max(Math.round(e * 0.92), t), k = Math.round(e * 3.4), u = Math.round(e * 0.62), m = Math.round(e * 0.42), N = new Set(r), $ = l != null, I = (y, H) => {
    const S = `${H}${y}`, G = en[y], A = N.has(S), x = a && !$ && A;
    return /* @__PURE__ */ c(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: x ? () => i(S) : void 0,
        "aria-label": `${H}${y === "N" ? "NT" : y}`,
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: g,
          height: b,
          padding: 0,
          background: "transparent",
          border: 0,
          color: G.ink,
          lineHeight: 1,
          cursor: x ? "pointer" : "default",
          opacity: A ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: u, fontWeight: 700, lineHeight: 1 }, children: H }),
          /* @__PURE__ */ n("span", { style: { fontSize: m, fontWeight: 700, lineHeight: 1 }, children: Jo[y] })
        ]
      },
      S
    );
  }, F = (y, H, S, G, A, x) => {
    const T = N.has(y), v = a && !$ && T;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: v ? () => i(y) : void 0,
        "aria-label": y === "P" ? "Pass" : y === "X" ? "Double" : "Redouble",
        style: {
          width: S,
          height: b,
          background: G,
          border: `2px solid ${A}`,
          borderRadius: o,
          color: "#fff",
          fontWeight: 700,
          fontSize: u,
          lineHeight: 1,
          cursor: v ? "pointer" : "default",
          opacity: T ? 1 : 0.3,
          ...x
        },
        children: H
      },
      y
    );
  };
  return /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: p }, children: [
    l != null && /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 20, fontWeight: 700, color: "#12281f" }, children: mi(l) }),
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
          onClick: d,
          style: { height: 38, padding: "0 16px", border: "1px solid #5e1c1c", borderRadius: o, background: "#8a3030", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: p }, children: bi.map((y) => /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: p,
          padding: h,
          background: en[y].bg,
          border: `2px solid ${en[y].edge}`,
          borderRadius: o
        },
        children: yi.map((H) => I(y, H))
      },
      y
    )) }),
    /* @__PURE__ */ c("div", { style: { display: "flex", gap: p }, children: [
      F("P", "Pass", k, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      F("X", "X", g, "#7a5b3a", "#5e4227"),
      F("XX", "XX", g, "#2b6b73", "#1c4d53")
    ] })
  ] });
}
const xi = {
  LinkComponent: "a",
  navigate: (e, { replace: t }) => {
    typeof window > "u" || (t ? window.location.replace(e) : window.location.assign(e));
  }
}, ki = Zr(xi);
function qo() {
  return ei(ki);
}
const gn = "#384bb3", Qn = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: gn, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, Zn = 48;
function et({
  side: e,
  items: t,
  thickness: o = 44,
  condensed: r = !1,
  scale: a,
  minTouch: l = 30,
  bg: i = "rgba(9,22,17,.90)",
  accent: s = gn
}) {
  const [d, p] = K(99), [h, g] = K(99), [b, k] = K(!1), u = ie(null), m = ie(null), N = ie(null), $ = ie(() => {
  }), I = s === gn ? Qn : { ...Qn, accent: { bg: s, border: s, color: "#fff" } }, F = o, y = Math.min(
    Math.round(F * 2.2),
    Math.max(
      Math.round(F * 0.68),
      F - 14,
      a ? Math.ceil(l / Math.max(0.05, a)) : 0
    )
  ), { LinkComponent: H } = qo(), S = r ? 5 : 7, G = Math.round(y * (r ? 0.17 : 0.4)), A = Math.max(r ? 11 : 13, Math.round(y * (r ? 0.28 : 0.4))), x = Math.round(y * 0.86), T = Math.max(9, Math.round(y * 0.26));
  let v = -1;
  t.forEach((w, W) => {
    w.kind === "spacer" && (v = W);
  });
  const O = v < 0 ? t : t.slice(0, v), M = v < 0 ? [] : t.slice(v + 1), ee = O.length, Q = M.length, R = Math.max(0, Math.min(d, ee)), te = Math.max(1, Math.min(h, Q)), X = M.slice(M.length - te), D = O.slice(R).concat(M.slice(0, M.length - te)).filter((w) => w.kind !== "divider"), C = D.length > 0, z = b && C, L = Fe(() => {
    const w = u.current;
    if (!w) return;
    const W = Math.min(d, ee), j = w.clientWidth;
    if (j > 0) {
      if (w.scrollWidth > j + 1) {
        const B = parseFloat(getComputedStyle(w).gap) || 0;
        let _ = 0, U = 0;
        for (const Z of Array.from(w.children))
          if (_ += Z.offsetWidth + (U ? B : 0), _ <= j) U++;
          else break;
        U < W && p(U);
        return;
      }
      if (j - w.scrollWidth > Zn && W < ee) {
        p(W + 1);
        return;
      }
      if (W !== d) {
        p(W);
        return;
      }
    }
    const P = m.current;
    if (!P) return;
    const oe = Math.min(h, Q);
    W === 0 && P.scrollWidth > P.clientWidth + 1 && oe > 1 ? g(oe - 1) : P.clientWidth - P.scrollWidth > Zn && oe < Q ? g(oe + 1) : oe !== h && g(oe);
  }, [d, h, ee, Q]);
  pt(() => {
    $.current = L, L();
  }), ye(() => {
    const w = (W) => {
      m.current && !m.current.contains(W.target) && k(!1);
    };
    return document.addEventListener("mousedown", w), () => {
      document.removeEventListener("mousedown", w), N.current && N.current.disconnect();
    };
  }, []);
  const J = Fe((w) => {
    N.current && (N.current.disconnect(), N.current = null), u.current = w, m.current = w ? w.parentElement : null, w && (typeof ResizeObserver == "function" && (N.current = new ResizeObserver(() => $.current()), N.current.observe(w)), $.current());
  }, []), q = (w, W) => {
    if (w.kind === "spacer") return null;
    if (w.kind === "node")
      return /* @__PURE__ */ n("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: S }, children: w.node }, W);
    if (w.kind === "divider")
      return /* @__PURE__ */ n("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, W);
    if (w.kind === "chip")
      return /* @__PURE__ */ c("div", { title: w.title ?? w.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: x, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: T, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: w.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: A, fontWeight: 700, lineHeight: 1, color: w.color ?? "#eef4f1" }, children: w.value })
      ] }, W);
    const j = I[w.tone ?? "plain"], P = w.disabled === !0, oe = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: w.kind === "icon" ? y : void 0,
      height: y,
      padding: w.kind === "icon" ? 0 : `0 ${G}px`,
      border: `1px solid ${j.border}`,
      borderRadius: 6,
      background: j.bg,
      color: j.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: A,
      fontWeight: w.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: P || !w.on && !w.href ? "default" : "pointer",
      opacity: P ? 0.42 : 1
    };
    return w.href && !P ? /* @__PURE__ */ n(H, { href: w.href, title: w.title ?? w.label, "aria-label": w.ariaLabel, style: oe, children: w.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: w.title ?? w.label, "aria-label": w.ariaLabel, disabled: P, onClick: P ? void 0 : w.on ?? void 0, style: oe, children: w.label }, W);
  }, re = (w, W) => {
    if (w.kind === "divider" || w.kind === "spacer") return null;
    if (w.kind === "chip")
      return /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: w.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: w.color ?? "#eef4f1" }, children: w.value })
      ] }, W);
    if (w.kind === "node")
      return /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: w.node }, W);
    const j = I[w.tone ?? "plain"], P = w.disabled === !0, oe = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: y,
      marginBottom: 4,
      padding: `0 ${G}px`,
      border: `1px solid ${j.border}`,
      borderRadius: 6,
      background: j.bg,
      color: j.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: A,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: P || !w.on && !w.href ? "default" : "pointer",
      opacity: P ? 0.42 : 1
    }, B = () => k(!1);
    return w.href && !P ? /* @__PURE__ */ n(H, { href: w.href, title: w.title ?? w.label, "aria-label": w.ariaLabel, style: oe, onClick: B, children: w.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: w.title ?? w.label, "aria-label": w.ariaLabel, disabled: P, onClick: P ? void 0 : () => {
      var _;
      (_ = w.on) == null || _.call(w), B();
    }, style: oe, children: w.label }, W);
  }, pe = Math.max(F, y + 14), ne = {
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
  return /* @__PURE__ */ c(
    "div",
    {
      "data-testid": "edge-toolbar",
      style: { width: "100%", [r ? "height" : "minHeight"]: pe, flex: "none", display: "flex", alignItems: "center", gap: S, padding: `6px ${r ? 8 : 10}px`, background: i, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ n(
          "div",
          {
            ref: J,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: S, ...r ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: O.slice(0, R).map(q)
          }
        ),
        C && /* @__PURE__ */ c("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ c(
            "button",
            {
              type: "button",
              onClick: () => k((w) => !w),
              title: `${D.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: y, padding: `0 ${G}px`, border: `1px solid ${z ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: z ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: A, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ n("span", { children: "⋯" }),
                /* @__PURE__ */ n("span", { style: { fontSize: T, opacity: 0.8 }, children: D.length })
              ]
            }
          ),
          z && /* @__PURE__ */ n("div", { style: ne, children: D.map(re) })
        ] }),
        X.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: S }, children: X.map(q) })
      ]
    }
  );
}
function eo({
  title: e = "Table settings",
  accent: t = "#384bb3",
  items: o,
  onClose: r
}) {
  const { navigate: a } = qo(), l = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, i = (s) => /* @__PURE__ */ c(Ne, { children: [
    /* @__PURE__ */ n("span", { children: s.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700, color: t }, children: s.value })
  ] });
  return /* @__PURE__ */ c("div", { style: { position: "absolute", inset: 0, zIndex: 20 }, children: [
    /* @__PURE__ */ n(
      "div",
      {
        style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" },
        onClick: r,
        "aria-hidden": !0
      }
    ),
    /* @__PURE__ */ c("div", { style: { position: "absolute", left: 12, top: 12, width: 268, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.5)", overflow: "hidden" }, children: [
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
              const d = s.href.split("?")[0] === window.location.pathname;
              a(s.href, { replace: d });
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
const $e = "#cc0000", tn = "#fecd07", Qo = "#d3d3d3", to = "#f2e2b8", Si = "#b8901f", Zo = "#12525e", we = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, xt = ["C", "D", "H", "S", "N"], nn = ["W", "N", "E", "S"], zt = ["S", "H", "C", "D"], vi = { N: "S", S: "N", E: "W", W: "E" }, Ee = (e) => e === "H" || e === "D", Ie = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), wi = (e) => /^[1-7][CDHSN]$/.test(e), bn = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${we[e[1] ?? ""] ?? ""}`, er = (e) => wi(e) && Ee(e[1] ?? "") ? $e : "#000", Ni = (e) => e === "N" || e === "S" ? "NS" : "EW";
function on({
  cards: e,
  metrics: t,
  layout: o,
  hidden: r = !1,
  fanSpread: a,
  fanRadius: l,
  backColor: i,
  backCount: s,
  backMetrics: d = { w: 14, h: 71 },
  isPlayable: p,
  onPlay: h
}) {
  if (r) {
    const v = Math.max(1, s ?? e.length);
    return /* @__PURE__ */ n("div", { style: { display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }, children: Array.from({ length: v }, (O, M) => /* @__PURE__ */ n("span", { style: { display: "block", width: d.w, height: d.h, background: i, borderLeft: M ? "1.5px solid rgba(255,255,255,.92)" : "none" } }, M)) });
  }
  const g = [...e].sort(
    (v, O) => zt.indexOf(v.suit) - zt.indexOf(O.suit) || O.rank - v.rank
  );
  if (o === "row")
    return /* @__PURE__ */ n("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: g.map((v, O) => {
      const M = p ? p(v) : !1;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: M ? () => h == null ? void 0 : h(v) : void 0,
          "aria-label": `Play ${Ie(v.rank)}${we[v.suit]}`,
          style: {
            position: "relative",
            display: "block",
            width: t.w,
            height: t.h,
            flex: "none",
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: O === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
            marginLeft: O === 0 ? 0 : -1,
            padding: 0,
            cursor: M ? "pointer" : "default",
            transform: M ? "translateY(-6px)" : "none",
            transition: "transform 120ms ease"
          },
          children: /* @__PURE__ */ c("span", { style: { position: "absolute", left: t.inset, top: t.inset > 3 ? t.inset : 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: Ee(v.suit) ? $e : "#000" }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: t.rank, fontWeight: 700 }, children: Ie(v.rank) }),
            /* @__PURE__ */ n("span", { style: { fontSize: t.glyph }, children: we[v.suit] })
          ] })
        },
        `${v.suit}${v.rank}`
      );
    }) });
  const b = g.length, k = t.w, u = t.h, m = a, N = l > 0 ? l : Math.round(u * 4.2), $ = (v) => b <= 1 ? 0 : -m / 2 + v * (m / (b - 1));
  let I = 0, F = 0, y = 0, H = 0;
  for (let v = 0; v < b; v++) {
    const O = $(v) * Math.PI / 180, M = Math.cos(O), ee = Math.sin(O);
    for (const Q of [-k / 2, k / 2])
      for (const R of [-N, -N + u]) {
        const te = Q * M - R * ee, X = Q * ee + R * M;
        te < I && (I = te), te > F && (F = te), X < y && (y = X), X > H && (H = X);
      }
  }
  const S = Math.ceil(Math.max(-I, F) * 2) + 4, G = Math.ceil(H - y) + 4, A = Math.ceil(-y - N) + 2, x = t.rank, T = t.glyph;
  return /* @__PURE__ */ n("div", { style: { position: "relative", width: S, height: G }, children: g.map((v, O) => {
    const M = p ? p(v) : !1;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: M ? () => h == null ? void 0 : h(v) : void 0,
        "aria-label": `Play ${Ie(v.rank)}${we[v.suit]}`,
        style: {
          position: "absolute",
          left: "50%",
          top: A,
          width: k,
          height: u,
          padding: 0,
          background: "#fff",
          border: "1px solid #6b6b6b",
          borderRadius: 4,
          boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
          transform: `translateX(-50%) rotate(${$(O)}deg)${M ? " translateY(-14px)" : ""}`,
          transformOrigin: `50% ${N}px`,
          transition: "transform 120ms ease",
          cursor: M ? "pointer" : "default"
        },
        children: /* @__PURE__ */ c("span", { style: { position: "absolute", left: t.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: Ee(v.suit) ? $e : "#000" }, children: [
          /* @__PURE__ */ n("span", { style: { fontSize: x, fontWeight: 700 }, children: Ie(v.rank) }),
          /* @__PURE__ */ n("span", { style: { fontSize: T }, children: we[v.suit] })
        ] })
      },
      `${v.suit}${v.rank}`
    );
  }) });
}
function $i({
  seat: e,
  name: t,
  tag: o,
  strip: r,
  bg: a,
  width: l,
  isDealer: i,
  metrics: s = {}
}) {
  const d = s.height ?? 22, p = s.badge ?? 20, h = s.font ?? 15, g = s.tagFont ?? 11;
  return /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "stretch", gap: 5, width: l, height: d, padding: "0 3px 0 0", background: a, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${i ? Si : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { flex: "none", width: 6, background: r ?? "transparent" } }),
    /* @__PURE__ */ n("span", { style: { flex: "none", width: p, height: p, alignSelf: "center", background: Zo, color: "#fff", fontSize: h - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
    /* @__PURE__ */ n("span", { style: { alignSelf: "center", fontSize: h, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: t }),
    i && /* @__PURE__ */ n("span", { style: { alignSelf: "center", flex: "none", padding: "0 2px", fontSize: g, fontWeight: 700, color: "#7a5a12" }, children: "DEALER" }),
    /* @__PURE__ */ n("span", { style: { marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: g, color: "#555" }, children: o ?? "" })
  ] });
}
function Mt({
  cards: e,
  panelBg: t,
  width: o,
  suitW: r,
  font: a,
  pad: l,
  bare: i,
  touch: s,
  isPlayable: d,
  onPlay: p
}) {
  const h = a ?? 19, g = !!s;
  return /* @__PURE__ */ n("div", { style: { width: o, background: i ? t : "#fff", border: i ? 0 : "1px solid #8a8a8a", borderRadius: i ? 0 : 3, padding: l ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: zt.map((b) => {
    const k = e.filter((u) => u.suit === b).sort((u, m) => m.rank - u.rank);
    return /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: Ee(b) ? $e : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", width: r ?? 16, fontSize: h }, children: we[b] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", gap: g ? "0 4px" : "0 5px", fontSize: h }, children: k.length === 0 ? /* @__PURE__ */ n("span", { children: "—" }) : k.map((u) => {
        const m = d ? d(u) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: m ? () => p == null ? void 0 : p(u) : void 0,
            "aria-label": `Play ${Ie(u.rank)}${we[b]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: g ? 84 : 0, minHeight: g ? 78 : 0, background: m ? "#d9f2d9" : "transparent", border: 0, borderRadius: g ? 6 : 0, padding: g ? "0 4px" : "0 1px", fontSize: h, fontWeight: m ? 700 : 400, color: "inherit", cursor: m ? "pointer" : "default" },
            children: Ie(u.rank)
          },
          u.rank
        );
      }) })
    ] }, b);
  }) });
}
function tr({
  bg: e,
  m: t = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: o,
  rows: r,
  dealerCol: a,
  emptyText: l = null
}) {
  const i = ie(null);
  return pt(() => {
    const s = i.current;
    s && (s.scrollTop = s.scrollHeight);
  }, [r.length]), /* @__PURE__ */ c("div", { style: { width: t.width, height: t.height, maxHeight: t.height === "auto" ? 340 : void 0, background: e, borderRadius: t.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: o.map((s) => /* @__PURE__ */ c("span", { style: { padding: "2px 0", fontSize: t.headFont, fontWeight: 700, lineHeight: 1.1, background: s.vul ? "#cc1111" : s.isDealer ? to : "#fff", color: s.vul ? "#fff" : "#000" }, children: [
      s.seat,
      s.isDealer ? " •" : ""
    ] }, s.seat)) }),
    /* @__PURE__ */ c("div", { ref: i, "data-testid": "auction-rows", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }, children: [
      r.map((s, d) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((p) => {
        const h = s[p];
        return /* @__PURE__ */ n("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: t.cellMinH ?? 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.cellFont, lineHeight: 1.15, background: h ? p === a ? to : Qo : "transparent", color: h ? er(h.call) : "#000" }, children: h ? bn(h.call) : "" }, p);
      }) }, d)),
      l != null && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: l })
    ] })
  ] });
}
function no({ plays: e, turn: t, scale: o = 1, variant: r = "cross" }) {
  if (r === "pill")
    return /* @__PURE__ */ n("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((l) => {
      const i = e.find((d) => d.seat === l), s = l === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : l === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : l === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return i ? /* @__PURE__ */ c("div", { style: { position: "absolute", ...s, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: Ee(i.card.suit) ? $e : "#000" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: we[i.card.suit] }),
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: Ie(i.card.rank) })
      ] }, l) : null;
    }) });
  const a = o;
  return /* @__PURE__ */ n("div", { style: { width: 262 * a, height: 262 * a, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("div", { style: { position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${a})`, transformOrigin: "center center" }, children: ["N", "E", "S", "W"].map((l) => {
    const i = e.find((p) => p.seat === l), s = l === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" } : l === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" } : l === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" } : { left: "206px", top: "50%", tr: "translateY(-50%)" }, d = l === t;
    return /* @__PURE__ */ n("div", { style: { position: "absolute", left: s.left, top: s.top, transform: s.tr, zIndex: i ? 2 : 1 }, children: i ? /* @__PURE__ */ n("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ c("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: Ee(i.card.suit) ? $e : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 27, fontWeight: 700 }, children: Ie(i.card.rank) }),
      /* @__PURE__ */ n("span", { style: { fontSize: 24 }, children: we[i.card.suit] })
    ] }) }) : /* @__PURE__ */ n("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: d ? 22 : 0, height: 12, background: d ? "#9a9a9a" : "transparent" } }) }) }, l);
  }) }) });
}
function nr({
  line: e,
  score: t,
  detail: o,
  action: r,
  actionNote: a,
  accent: l = "#384bb3"
}) {
  return /* @__PURE__ */ c("div", { style: { background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }, children: [
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
function Ci({ onClose: e, children: t }) {
  return /* @__PURE__ */ n("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ c("div", { onClick: (o) => o.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ n("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    t
  ] }) });
}
const Bi = "#384bb3", Ei = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function Ri({
  title: e = "Coach",
  status: t = "",
  accent: o = Bi,
  lines: r,
  actions: a
}) {
  const l = (r && r.length ? r : []).map(
    (d) => typeof d == "string" ? { text: d, color: "#28312c" } : { text: d.text ?? "", color: d.color ?? "#28312c" }
  ), i = l.length === 0, s = a && a.length ? a : [];
  return /* @__PURE__ */ c("div", { style: Ei, children: [
    /* @__PURE__ */ c("div", { style: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }, children: [
      /* @__PURE__ */ n("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: o, color: "#fff", fontSize: 12, fontWeight: 700 }, children: "C" }),
      /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: "#1d2421" }, children: e }),
      /* @__PURE__ */ n("span", { style: { flex: 1 } }),
      /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }, children: t })
    ] }),
    /* @__PURE__ */ c("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }, children: [
      l.map((d, p) => /* @__PURE__ */ n("div", { style: { fontSize: 14, lineHeight: 1.45, color: d.color }, children: d.text }, p)),
      i && /* @__PURE__ */ n("div", { style: { fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }, children: "Coach commentary appears here as the deal goes on." })
    ] }),
    s.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }, children: s.map((d, p) => /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: d.on ?? void 0,
        style: { height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: d.on ? "pointer" : "default" },
        children: d.label
      },
      p
    )) })
  ] });
}
const lt = { w: 1040, h: 678 }, kt = 720, Ce = { w: 54, h: 128, rank: 42, glyph: 38, inset: 5, backW: 52 }, oo = 52, ro = 44, io = 54, lo = { row: 172, fan: 238 }, ao = 52, so = 30, Ti = 0.3, Wi = 250, Ii = 900, co = 150, zi = (e) => Math.ceil(24 / (e || 1)), Ai = 0, fo = (e) => Math.round(e * 8.8), Hi = 24, uo = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, Mi = {
  ...Ko("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, Di = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function Oi({ children: e }) {
  const t = ie(null), o = ie(null), [r, a] = K(1);
  return pt(() => {
    const l = () => {
      const s = t.current, d = o.current;
      if (!s || !d) return;
      const p = s.clientWidth, h = s.clientHeight, g = d.offsetWidth, b = d.offsetHeight;
      if (!p || !h || !g || !b) return;
      const k = Math.min(1, p / g, h / b);
      a((u) => Math.abs(k - u) > 5e-3 ? k : u);
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
function Fi({
  state: e,
  seats: t,
  visible: o,
  mySeat: r = null,
  legalCalls: a = [],
  legalPlays: l = [],
  myTurn: i = !1,
  boardLabel: s = "1",
  scoringLabel: d = "IMPs",
  auctionDisplay: p = "box",
  confirmBids: h = !1,
  completedAction: g,
  completedNote: b,
  resultLine: k = "",
  resultScore: u = "",
  resultDetail: m,
  onCall: N,
  onPlay: $,
  onMenu: I,
  onScoring: F,
  onClaim: y,
  controlsExtra: H,
  controlsExtraNarrow: S,
  railExtra: G,
  settings: A,
  viewHref: x,
  appearance: T,
  showCoach: v = !0,
  coachShare: O = 30,
  coachTitle: M = "Coach",
  coachLines: ee,
  coachActions: Q
}) {
  var Un;
  const R = T ?? Mi, te = R.handLayout === "fan", X = R.bidPad === "columns", D = R.centreFrame, C = D ? Di : {}, z = Number.parseInt(R.radius, 10) || 5, L = ie(null), [J, q] = K({ w: lt.w, h: lt.h });
  pt(() => {
    const f = L.current;
    if (!f) return;
    const E = () => q({ w: f.clientWidth || lt.w, h: f.clientHeight || lt.h });
    E();
    const V = new ResizeObserver(E);
    return V.observe(f), () => V.disconnect();
  }, []);
  const [re, pe] = K(null), [ne, w] = K(null);
  ye(() => {
    pe(null), w(null);
  }, [e.auction.length]);
  const [W, j] = K(!1), P = I ?? (A ? () => j((f) => !f) : void 0), oe = [...A ?? []], [B, _] = K(!1), U = J.w / Math.max(1, J.h) < 1.25, Z = U && J.w < 640, ae = U && !Z, ze = ae ? { w: kt, h: 1268 } : lt, de = e.contract, We = (de == null ? void 0 : de.declarer) ?? null, he = We && e.phase !== "auction" ? vi[We] : null, be = e.phase === "auction", Ae = e.phase === "play", qe = e.phase === "complete", He = new Set(a), kr = new Set(l.map((f) => `${f.suit}${f.rank}`)), xe = be && i && !ne, Sr = (f) => e.vul === "both" || e.vul === "All" || Ni(f).toLowerCase() === String(e.vul).toLowerCase(), vr = nn.indexOf(e.dealer), wr = v !== !1, Lt = Math.max(0, Math.min(55, O ?? 30)), $n = 100 - Lt, Cn = Ae || qe, Nr = We ? !!t[We].human : !1, Pt = Cn && !!he && he !== "S" && Nr, Bn = Cn && !!he && he !== "S" && !Pt, $r = X && be, _t = Math.min(1, J.w / kt), bt = Math.max(240, J.h * ($n / 100) || 590), Cr = (f) => {
    const E = Math.max(oo, Math.ceil(ro / (f || 1)) + 14);
    return Math.min(E, Math.max(oo, Math.round(0.13 * bt / (f || 1))));
  }, En = (f) => {
    const E = Math.max(ao, Math.ceil(ro / (f || 1))), V = Ti * bt / (f || 1) - so;
    return Math.min(E, Math.max(ao, Math.floor(V / 3)));
  }, Br = (f) => 3 * En(f) + so, Rn = (f, E) => {
    const V = Cr(f), Y = bt / (f || 1), le = V * 2 + Ai + zi(f) + (Bn ? io : 0) + (Pt ? lo.row : 0) + (!E && be ? Br(f) : 0) + lo[te ? "fan" : "row"];
    let ke = 0, Ze;
    E ? (ke = Math.max(30, Math.min(62, Math.floor((Y - le - co) / 8.3))), Ze = Math.max(co, Math.round(Y - le - fo(ke)))) : Ze = Math.max(Wi, Math.min(Ii, Math.round(Y - le)));
    const Gn = le + (E ? fo(ke) : 0) + Ze;
    return { bar: V, cell: ke, centre: Ze, content: Gn, usePad: E, trayRow: En(f), scale: Math.min(1, _t, bt / Gn) };
  }, Tn = (f) => {
    let E = Rn(_t, f);
    for (let V = 0; V < 10 && E.scale < _t - 5e-4; V++) {
      const Y = Rn(E.scale, f);
      if (Math.abs(Y.scale - E.scale) < 5e-4) {
        E = Y;
        break;
      }
      E = Y;
    }
    return E;
  };
  let ge = Tn($r);
  ge.usePad && ge.cell * ge.scale < Hi && (ge = Tn(!1));
  const Er = ge.usePad, Rr = ge.usePad ? ge.cell : 38, Wn = ge.centre, Tr = Math.max(0.6, Math.min(1.6, (Wn - 8) / 262)), Xt = Math.min(J.w / ze.w, J.h / ze.h) || 1, Pe = Z ? ge.scale : Xt, Wr = Z ? kt : Math.max(ze.w, J.w / Xt), jt = Z ? ge.content : Math.max(ze.h, J.h / Xt), Ir = Z ? -Math.round(ge.content * (1 - ge.scale)) : 0, zr = (f) => t[f].human ? tn : !qe && f === e.turn ? "#e8e8c8" : Qo, Ar = (f) => f === he || !qe && f === e.turn ? "#fff" : "#b3b3b3", _e = (f) => {
    xe && (h ? w(f) : N == null || N(f));
  }, In = () => {
    if (ne == null) return;
    const f = ne;
    w(null), N == null || N(f);
  }, zn = () => {
    w(null), pe(null);
  }, Yt = (f) => (E) => i && Ae && e.turn === f && kr.has(`${E.suit}${E.rank}`), yt = (f, E = { w: 14, h: 71 }) => /* @__PURE__ */ n(on, { cards: e.hands[f], hidden: !0, metrics: uo, layout: "row", fanSpread: R.fanSpread, fanRadius: R.fanRadius, backColor: R.cardBack, backMetrics: E }), Qe = (f, E, V = {}) => /* @__PURE__ */ n($i, { seat: f, name: t[f].name, tag: t[f].tag, strip: t[f].strip, bg: zr(f), width: E, isDealer: f === e.dealer, metrics: V }), Xe = (f, E = 16) => {
    if (!be || p !== "seats") return null;
    const V = e.auction.filter((Y) => Y.seat === f);
    return V.length ? /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: V.map((Y, le) => {
      const ke = le === V.length - 1;
      return /* @__PURE__ */ n("span", { style: { background: ke ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: E, fontWeight: ke ? 700 : 400, padding: "0 5px", color: er(Y.call) }, children: bn(Y.call) }, le);
    }) }) : null;
  }, Ut = (f, E = uo) => /* @__PURE__ */ n(
    on,
    {
      cards: e.hands[f],
      metrics: E,
      layout: "row",
      fanSpread: R.fanSpread,
      fanRadius: R.fanRadius,
      backColor: R.cardBack,
      isPlayable: Yt(f),
      onPlay: (V) => $ == null ? void 0 : $(f, V)
    }
  ), mt = (f, E = { width: 197 }) => /* @__PURE__ */ n(
    Mt,
    {
      cards: e.hands[f],
      panelBg: Ar(f),
      width: E.width,
      suitW: E.suitW,
      font: E.font,
      pad: E.pad,
      bare: E.bare,
      touch: !!E.touch && i && Ae && e.turn === f,
      isPlayable: Yt(f),
      onPlay: (V) => $ == null ? void 0 : $(f, V)
    }
  ), Gt = (f, E) => {
    const V = E ?? {
      w: R.cardW,
      h: Math.round(R.cardW * 1.42),
      rank: Math.round(R.cardW * 0.46),
      glyph: Math.round(R.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ n(
      on,
      {
        cards: e.hands[f],
        metrics: V,
        layout: "fan",
        fanSpread: R.fanSpread,
        fanRadius: R.fanRadius,
        backColor: R.cardBack,
        isPlayable: Yt(f),
        onPlay: (Y) => $ == null ? void 0 : $(f, Y)
      }
    );
  }, An = (f) => {
    const E = te && o[f];
    return /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      Xe(f),
      o[f] ? E ? Gt(f) : Ut(f) : yt(f),
      Qe(f, E ? 197 : o[f] ? 50 + Math.max(0, e.hands[f].length - 1) * 49 : 197)
    ] });
  }, Hn = (f) => /* @__PURE__ */ c("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    Xe(f),
    o[f] ? mt(f, { width: 197 }) : yt(f),
    Qe(f, 197)
  ] }), Mn = [];
  {
    const f = [
      ...Array.from({ length: nn.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let E = 0; E < f.length; E += 4) Mn.push(f.slice(E, E + 4));
  }
  const Vt = (f = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ n(
    tr,
    {
      bg: R.auctionBg,
      m: f,
      heads: nn.map((E) => ({ seat: E, vul: Sr(E), isDealer: E === e.dealer })),
      rows: Mn,
      dealerCol: vr,
      emptyText: e.auction.length === 0 ? e.dealer === r ? "You deal" : `${e.dealer} deals` : null
    }
  ), Dn = Ae ? ((Un = e.tricks[e.tricks.length - 1]) == null ? void 0 : Un.plays) ?? [] : [], On = (f = 1) => /* @__PURE__ */ n(no, { plays: Dn, turn: e.turn, scale: f }), Kt = /* @__PURE__ */ n(
    nr,
    {
      line: k,
      score: u,
      detail: m ?? `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: g,
      actionNote: b,
      accent: R.accent
    }
  ), Hr = /* @__PURE__ */ n(no, { variant: "pill", plays: Dn, turn: e.turn }), Jt = (f, E, V, Y, le, ke = 21) => ({
    flex: "none",
    width: f,
    height: E,
    border: `1px solid ${Y}`,
    borderRadius: z,
    background: V,
    color: "#fff",
    fontSize: ke,
    fontWeight: 700,
    lineHeight: 1,
    cursor: le ? "pointer" : "default",
    opacity: le ? 1 : 0.42
  }), Fn = (f, E) => /* @__PURE__ */ c(Ne, { children: [
    /* @__PURE__ */ c(
      "button",
      {
        type: "button",
        onClick: In,
        style: Jt(240, f, "#116710", "#0c4b0b", !0, E),
        children: [
          "Confirm ",
          bn(ne ?? "")
        ]
      }
    ),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: zn,
        style: Jt(120, f, "#8a3030", "#5e1c1c", !0, E),
        children: "Cancel"
      }
    )
  ] }), Mr = (f, E, V) => [1, 2, 3, 4, 5, 6, 7].map((Y) => {
    const le = xt.some((Ze) => He.has(`${Y}${Ze}`)), ke = xe && le;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: ke ? () => pe(re === Y ? null : Y) : void 0,
        "aria-label": `Level ${Y}`,
        style: { flex: "none", width: f, height: E, border: "1px solid #8a8a6a", borderRadius: z, background: re === Y ? tn : "#f8f8f8", color: "#000", fontSize: V, lineHeight: 1, cursor: ke ? "pointer" : "default", opacity: ke ? 1 : 0.42 },
        children: Y
      },
      Y
    );
  }), Dr = (f, E, V, Y) => re ? xt.filter((le) => He.has(`${re}${le}`)).map((le) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => _e(`${re}${le}`),
      "aria-label": `${re}${le === "N" ? "NT" : le}`,
      style: { flex: "none", width: le === "N" ? V : Y, height: f, border: "1px solid #8a8a6a", borderRadius: z, background: "#f8f8f8", color: Ee(le) ? $e : "#000", fontSize: E, lineHeight: 1, cursor: "pointer" },
      children: we[le]
    },
    le
  )) : null, Or = (f, E, V) => ["X", "XX"].map((Y) => xe && He.has(Y) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => _e(Y),
      "aria-label": Y === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: f, height: E, border: `1px solid ${Y === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: z, background: Y === "X" ? $e : "#1034a6", color: "#fff", fontSize: V, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: Y
    },
    Y
  ) : /* @__PURE__ */ n("span", { style: { width: f, height: E } }, Y)), Fr = (f, E, V) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: xe ? () => _e("P") : void 0,
      "aria-label": "Pass",
      style: Jt(f, E, xe ? "#116710" : "#a7b8a2", "#0c4b0b", xe, V),
      children: "Pass"
    }
  ), Lr = He.has("X") || He.has("XX"), Ln = re ? xt.filter((f) => He.has(`${re}${f}`)) : [], Pr = /* @__PURE__ */ n("div", { style: { width: 581, flex: "none", background: R.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: ne ? /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    Fn(44, 21)
  ] }) : /* @__PURE__ */ c(Ne, { children: [
    /* @__PURE__ */ c("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      Fr(120, 37, 21),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Mr(57, 37, 23) })
    ] }),
    (Lr || Ln.length > 0) && /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: Or(57, 37, 21) }),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Dr(37, 23, 120, 57) })
    ] })
  ] }) }), je = Z ? ge.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, Pe))), _r = [0, 1, 2, 3, 4].map((f) => {
    const E = Ln[f];
    return E ? /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: () => _e(`${re}${E}`),
        "aria-label": `${re}${E === "N" ? "NT" : E}`,
        style: { height: je, border: "1px solid #8a8a6a", borderRadius: z, background: "#f8f8f8", color: Ee(E) ? $e : "#000", fontSize: 26, lineHeight: 1, cursor: "pointer" },
        children: we[E]
      },
      f
    ) : /* @__PURE__ */ n("span", { style: { height: je, pointerEvents: "none" } }, f);
  }), Pn = /* @__PURE__ */ n("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: R.trayBg, padding: "8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: ne ? /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 20, color: "#3a3a20" }, children: "Confirm your call" }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: 10 }, children: Fn(52, 28) })
  ] }) : /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
    /* @__PURE__ */ c("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: xe ? () => _e("P") : void 0,
          "aria-label": "Pass",
          style: { gridColumn: "span 3", minWidth: 0, height: je, border: "1px solid #0c4b0b", borderRadius: z, background: xe ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: xe ? "pointer" : "default", opacity: xe ? 1 : 0.42 },
          children: "Pass"
        }
      ),
      ["X", "XX"].map((f) => xe && He.has(f) ? /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: () => _e(f),
          "aria-label": f === "X" ? "Double" : "Redouble",
          style: { gridColumn: "span 2", minWidth: 0, height: je, border: `1px solid ${f === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: z, background: f === "X" ? $e : "#1034a6", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: f
        },
        f
      ) : /* @__PURE__ */ n("span", { style: { gridColumn: "span 2", minWidth: 0, height: je } }, f))
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [1, 2, 3, 4, 5, 6, 7].map((f) => {
      const E = xt.some((Y) => He.has(`${f}${Y}`)), V = xe && E;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: V ? () => pe(re === f ? null : f) : void 0,
          "aria-label": `Level ${f}`,
          style: { height: je, border: "1px solid #8a8a6a", borderRadius: z, background: re === f ? tn : "#f8f8f8", color: "#000", fontSize: 26, lineHeight: 1, cursor: V ? "pointer" : "default", opacity: V ? 1 : 0.42 },
          children: f
        },
        f
      );
    }) }),
    /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }, children: _r })
  ] }) }), qt = {
    legalCalls: a,
    live: xe,
    pending: ne,
    onStage: _e,
    onConfirm: In,
    onCancel: zn,
    radius: z
  }, Xr = /* @__PURE__ */ n(Rt, { cell: 46, ...qt }), jr = /* @__PURE__ */ n("div", { style: { width: "100%", flex: "none", background: R.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ n(Rt, { cell: 84, minCellH: je, ...qt }) }), _n = { N: "North", E: "East", S: "South", W: "West" }, Xn = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), Qt = [
    { kind: "chip", label: "Board", value: String(s) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: Xn, color: Xn === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: de ? `${de.level}${we[de.strain]}${de.doubled === 1 ? "X" : de.doubled === 2 ? "XX" : ""}` : "—", color: de && Ee(de.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: de ? _n[de.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: d, title: "Scoring mode", on: F ?? null }
  ], Zt = (f) => [
    ...f ? [{ kind: "node", node: f }] : [],
    { kind: "divider" },
    ...x ? [{ kind: "button", label: x.label, title: "Four-hand record", href: x.href }] : [],
    ...G ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => _(!0) }] : [],
    { kind: "spacer" },
    ...y && Ae ? [{ kind: "button", label: "Claim", tone: "accent", on: y }] : [],
    ...P ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: P }] : []
  ], jn = B && G ? /* @__PURE__ */ n(Ci, { onClose: () => _(!1), children: G }) : null, Yr = (f) => zt.map((E) => {
    const V = e.hands[f].filter((Y) => Y.suit === E).sort((Y, le) => le.rank - Y.rank).map((Y) => Ie(Y.rank)).join("");
    return V ? { suit: E, ranks: V } : null;
  }).filter((E) => E != null), Ur = Bn && he ? /* @__PURE__ */ c("div", { "data-testid": "dummy-strip", style: { flex: "none", height: io, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: _n[he] }),
    o[he] ? Yr(he).map((f) => /* @__PURE__ */ c("span", { style: { fontSize: 26, fontWeight: 700, color: "#f2f6f4", whiteSpace: "nowrap" }, children: [
      /* @__PURE__ */ n("span", { style: { color: Ee(f.suit) ? $e : "#111" }, children: we[f.suit] }),
      f.ranks
    ] }, f.suit)) : null
  ] }) : null, Gr = Pt && he ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: o[he] ? te ? Gt(he, Ce) : Ut(he, Ce) : yt(he, { w: Ce.backW, h: Ce.h }) })
  ) : null, Vr = /* @__PURE__ */ c("div", { style: { width: kt, minHeight: jt, height: jt, transform: `scale(${Pe})`, transformOrigin: "top center", marginBottom: Ir, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    /* @__PURE__ */ n(et, { side: "top", items: Qt, condensed: !0, thickness: ge.bar, bg: R.barBg, accent: R.accent }),
    /* @__PURE__ */ c("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: R.feltFlat }, children: [
      Ur,
      Gr,
      /* @__PURE__ */ n("div", { "data-testid": "centre-band", style: { flex: "none", height: Wn, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: /* @__PURE__ */ c("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: be ? "flex-start" : "center", justifyContent: "center", ...D ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
        be && p === "box" ? Vt({ width: 430, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
        be && p === "seats" ? /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((f) => /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ n("span", { style: { width: 30, height: 30, background: Zo, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: f }),
          Xe(f, 22) ?? /* @__PURE__ */ n("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
        ] }, f)) }) : null,
        Ae ? On(Tr) : null,
        qe ? Kt : null
      ] }) }),
      be ? Er ? /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ n(Rt, { cell: Rr, ...qt }) }) : Pn : null,
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        Xe("S"),
        o.S ? te ? Gt("S", Ce) : Ut("S", Ce) : yt("S", { w: Ce.backW, h: Ce.h }),
        Qe("S", o.S ? Ce.w + Math.max(0, e.hands.S.length - 1) * (Ce.w - 1) : 390)
      ] }) })
    ] }),
    /* @__PURE__ */ n(et, { side: "bottom", items: Zt(S ?? H), condensed: !0, thickness: ge.bar, bg: R.barBg, accent: R.accent })
  ] }), Kr = (f) => /* @__PURE__ */ c("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Xe(f, 22),
    Qe(f, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    o[f] && mt(f, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), Yn = (f) => /* @__PURE__ */ c("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Xe(f, 22),
    Qe(f, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    o[f] && mt(f, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), Jr = (f) => /* @__PURE__ */ c("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Xe(f, 22),
    Qe(f, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    o[f] && mt(f, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), qr = /* @__PURE__ */ c("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: R.stageBg }, children: [
    /* @__PURE__ */ n(et, { side: "top", items: Qt, scale: Pe, minTouch: 44, bg: R.barBg, accent: R.accent }),
    /* @__PURE__ */ c("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: R.felt }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Kr("N") }),
      /* @__PURE__ */ c("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        Yn("W"),
        /* @__PURE__ */ c("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...C }, children: [
          be && p === "box" ? Vt({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          Ae ? Hr : null,
          qe ? Kt : null
        ] }),
        Yn("E")
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: Jr("S") })
    ] }),
    be ? X ? jr : Pn : null,
    /* @__PURE__ */ n(et, { side: "bottom", items: Zt(S ?? H), scale: Pe, minTouch: 44, bg: R.barBg, accent: R.accent })
  ] }), Qr = /* @__PURE__ */ c("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    /* @__PURE__ */ n(et, { side: "top", items: Qt, scale: Pe, bg: R.barBg, accent: R.accent }),
    /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: R.felt }, children: /* @__PURE__ */ c("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: An("N") }),
      /* @__PURE__ */ c("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        Hn("W"),
        /* @__PURE__ */ n("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...C }, children: /* @__PURE__ */ c(Oi, { children: [
          be && X ? Xr : be && p === "box" ? Vt() : null,
          Ae ? On() : null,
          qe ? Kt : null
        ] }) }),
        Hn("E")
      ] }),
      /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ n("div", { style: { height: be && !X ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: be && !X ? Pr : null }),
        An("S")
      ] })
    ] }) }),
    /* @__PURE__ */ n(et, { side: "bottom", items: Zt(H), scale: Pe, bg: R.barBg, accent: R.accent })
  ] });
  return Z ? /* @__PURE__ */ c("div", { ref: L, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: R.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: $n, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: Vr }) }),
    Lt > 0 && /* @__PURE__ */ n("div", { style: { flex: Lt, minHeight: 0, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: wr && /* @__PURE__ */ n(Ri, { title: M, accent: R.accent, lines: ee, actions: Q }) }),
    jn,
    W && !I && /* @__PURE__ */ n(eo, { accent: R.accent, items: oe, onClose: () => j(!1) })
  ] }) : /* @__PURE__ */ n("div", { ref: L, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: R.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: R.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ c("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: Wr, height: jt, transform: `scale(${Pe})` }, children: [
    ae ? qr : Qr,
    jn,
    W && !I && /* @__PURE__ */ n(eo, { accent: R.accent, items: oe, onClose: () => j(!1) })
  ] }) });
}
const ho = "#ffce04", St = "#cb0200", po = "#016700", Li = "#cbcbcb", go = "#99cccc", Pi = "#336799", or = 648, yn = 400, mn = 8, xn = 8, Me = { w: xn * 2 + or * 3 + mn * 2, h: xn * 2 + yn * 3 + mn * 2 }, bo = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, yo = ["W", "N", "E", "S"], _i = ["S", "H", "D", "C"], mo = (e) => e === "H" || e === "D", Xi = (e) => /^[1-7][CDHSN]$/.test(e), ji = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e);
function Yi({
  boardLabel: e,
  dealer: t,
  vul: o,
  hands: r,
  names: a,
  visible: l,
  auction: i = [],
  highlightSeat: s = null,
  info: d = [],
  result: p = [],
  nav: h
}) {
  const g = ie(null), [b, k] = K({ w: Me.w, h: Me.h });
  pt(() => {
    const x = g.current;
    if (!x) return;
    const T = () => k({ w: x.clientWidth || Me.w, h: x.clientHeight || Me.h });
    T();
    const v = new ResizeObserver(T);
    return v.observe(x), () => v.disconnect();
  }, []);
  const u = Math.min(b.w / Me.w, b.h / Me.h) || 1, m = (x) => {
    const T = o.toLowerCase();
    return T === "both" || T === "all" || T === (x === "N" || x === "S" ? "ns" : "ew");
  }, N = 57, $ = 145, I = (x) => {
    const T = m(x), v = x === t;
    return /* @__PURE__ */ n("div", { style: { background: v ? ho : T ? St : "#fff", color: T && !v ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }, children: x });
  }, F = /* @__PURE__ */ c("div", { style: { width: N * 2 + $ + 4, display: "grid", gridTemplateColumns: `${N}px ${$}px ${N}px`, gridTemplateRows: `${N}px ${$}px ${N}px`, gap: 2, padding: 2, background: "#000", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("N"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("W"),
    /* @__PURE__ */ n("div", { title: String(e), style: { background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(e).length > 8 ? 24 : String(e).length > 3 ? 40 : 104, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }, children: e }),
    I("E"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("S"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } })
  ] }), y = (x) => {
    const T = (l == null ? void 0 : l[x]) ?? !0;
    return /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: "column", alignSelf: "stretch" }, children: [
      /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", height: 70, background: x === s ? ho : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }, children: [
        /* @__PURE__ */ n("span", { style: { flex: "none", width: 70, height: 70, background: Pi, color: "#fff", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: x }),
        /* @__PURE__ */ n("span", { style: { padding: "0 14px", fontSize: 52, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: a[x] }),
        !T && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", paddingRight: 14, fontSize: 24, color: "#666" }, children: "hidden" })
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: 1, background: Li, padding: "4px 14px 10px" }, children: _i.map((v) => {
        const O = [...r[x]].filter((M) => M.suit === v).sort((M, ee) => ee.rank - M.rank);
        return /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.35, fontSize: 58, color: mo(v) ? St : "#000" }, children: [
          /* @__PURE__ */ n("span", { style: { flex: "none", width: 58 }, children: bo[v] }),
          /* @__PURE__ */ n("span", { style: { color: "#000", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }, children: T && O.length ? O.map((M) => ji(M.rank)).join("") : "—" })
        ] }, v);
      }) })
    ] });
  }, H = [];
  {
    const x = [
      ...Array.from({ length: yo.indexOf(t) }, () => null),
      ...i
    ];
    for (let T = 0; T < x.length; T += 4) H.push(x.slice(T, T + 4));
  }
  const S = (x) => Xi(x) ? /* @__PURE__ */ c(Ne, { children: [
    x[0],
    /* @__PURE__ */ n("span", { style: { color: mo(x[1] ?? "") ? St : "#000" }, children: bo[x[1] ?? ""] })
  ] }) : x === "P" ? "P" : x, G = /* @__PURE__ */ c("div", { style: { width: "100%", height: 374, background: go, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: yo.map((x) => /* @__PURE__ */ n("span", { style: { padding: "2px 0", fontSize: 42, fontWeight: 700, lineHeight: 1.15, background: m(x) ? St : "#fff", color: m(x) ? "#fff" : "#000" }, children: x }, x)) }),
    /* @__PURE__ */ c("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px" }, children: [
      H.map((x, T) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }, children: [0, 1, 2, 3].map((v) => /* @__PURE__ */ n("span", { style: { fontSize: 42, lineHeight: 1.25, color: "#000" }, children: x[v] ? S(x[v].call) : "" }, v)) }, T)),
      i.length === 0 && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 32, color: "#1e4747", paddingTop: 10 }, children: "No calls yet" })
    ] })
  ] }), A = (x) => /* @__PURE__ */ n("div", { style: { width: "100%", alignSelf: "end", background: go, padding: "10px 16px", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: x.map((T, v) => /* @__PURE__ */ c("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 40, lineHeight: 1.3, color: "#000" }, children: [
    /* @__PURE__ */ n("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: T.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700 }, children: T.value })
  ] }, v)) });
  return /* @__PURE__ */ n("div", { ref: g, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: po, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ n("div", { style: { flex: "none", transformOrigin: "center center", width: Me.w, height: Me.h, transform: `scale(${u})` }, children: /* @__PURE__ */ c("div", { style: { position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${or}px)`, gridTemplateRows: `repeat(3, ${yn}px)`, gap: mn, padding: xn, background: po }, children: [
    /* @__PURE__ */ c("div", { style: { justifySelf: "start", alignSelf: "start", display: "flex", gap: 24, alignItems: "flex-start", maxHeight: yn, overflow: "hidden" }, children: [
      F,
      h
    ] }),
    y("N"),
    /* @__PURE__ */ n("div", { style: { alignSelf: "start", width: "100%" }, children: G }),
    y("W"),
    /* @__PURE__ */ n("div", {}),
    y("E"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: A(d) }),
    y("S"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: A(p) })
  ] }) }) });
}
const gt = "#0d707c", Ui = "#1c8a5a", Gi = "#c0392b", Vi = "#8b9a93", ft = "#55636f", xo = "#17211d", kn = "#9aa8a1", ko = "#eef2ef", Ki = "#0e1a1c", ht = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", rr = "✕", Ji = "◆", qi = "⇄", Qi = "–", Zi = "—", ir = "·";
function Re(e) {
  return e === "pos" ? Ui : e === "neg" ? Gi : Vi;
}
function At(e) {
  return e == null || !Number.isFinite(e) ? "neutral" : e > 0 ? "pos" : e < 0 ? "neg" : "neutral";
}
const lr = 40;
function el({
  title: e,
  boardNo: t,
  boardsTotal: o,
  showResults: r,
  onResults: a,
  accent: l = gt,
  height: i = lr
}) {
  const s = Math.max(0, Math.round(o)), d = Math.max(1, Math.round(t)), p = Math.max(0, Math.min(s, d - 1)), h = s > 0 ? Math.round(p / s * 100) : 0;
  return /* @__PURE__ */ c("div", { style: {
    position: "relative",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: i,
    padding: "0 12px",
    background: Ki,
    fontFamily: ht
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
        children: `Board ${d} of ${s}`
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
        "aria-valuenow": p,
        "aria-valuetext": `${p} of ${s} boards done`,
        style: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: "rgba(255,255,255,.10)",
          display: "block"
        },
        children: /* @__PURE__ */ n("span", { style: { display: "block", height: "100%", width: `${h}%`, background: l } })
      }
    )
  ] });
}
function tl(e) {
  if (e.length > 0 && e.every((i) => typeof i.rank == "number")) return e.map((i) => ({ ...i, rank: i.rank }));
  const o = e.map((i, s) => ({ r: i, i: s }));
  o.sort((i, s) => {
    const d = typeof i.r.value == "number" ? i.r.value : Number.NEGATIVE_INFINITY, p = typeof s.r.value == "number" ? s.r.value : Number.NEGATIVE_INFINITY;
    return p === d ? i.i - s.i : p - d;
  });
  let r = 0, a = 0, l = null;
  return o.map(({ r: i }) => {
    a += 1;
    const s = typeof i.value == "number" ? i.value : Number.NEGATIVE_INFINITY;
    return (l === null || s !== l) && (r = a, l = s), { ...i, rank: r };
  });
}
function nl(e) {
  if (!e) return Number.NaN;
  if (typeof e.value == "number" && Number.isFinite(e.value)) return e.value;
  const t = (e.text ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!t) return Number.NaN;
  const o = Number(t.replace(/^\+/, ""));
  return Number.isFinite(o) ? o : Number.NaN;
}
function ol(e) {
  const t = e.map(nl);
  let o = Number.NEGATIVE_INFINITY;
  for (const r of t) Number.isFinite(r) && r > o && (o = r);
  return Number.isFinite(o) ? t.map((r) => Number.isFinite(r) && r === o) : t.map(() => !1);
}
const ar = { active: !1, picks: [] };
function rl(e, t) {
  switch (t.type) {
    case "start":
      return { active: !0, picks: [] };
    case "cancel":
      return ar;
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
function il(e) {
  const [t, o] = e.picks;
  return !t || !o ? null : { boardNo: t.boardNo, a: t.key, b: o.key };
}
function ll(e, t) {
  const o = e.picks[0];
  return e.active && !!o && o.boardNo !== t;
}
function al(e, t, o) {
  return e.picks.some((r) => r.boardNo === t && r.key === o);
}
const rn = {
  display: "grid",
  gridTemplateColumns: "26px 1fr auto",
  alignItems: "center",
  gap: 10
};
function sl({
  rows: e,
  benRow: t,
  scoringLabel: o,
  accent: r = gt,
  note: a,
  legend: l,
  emptyLabel: i = "No finished players yet."
}) {
  const s = tl(e);
  return /* @__PURE__ */ c("div", { style: { fontFamily: ht, color: "#17211d" }, children: [
    a && /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: kn, marginBottom: 2 }, children: a }),
    /* @__PURE__ */ c(
      "div",
      {
        style: {
          ...rn,
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
    s.length === 0 && /* @__PURE__ */ n("div", { style: { padding: "10px 8px", fontSize: 12.5, color: kn }, children: i }),
    /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: s.map((d, p) => {
      const h = !!d.isYou, g = d.marks ?? [], b = d.tone ? Re(d.tone) : Re(At(d.value));
      return /* @__PURE__ */ c(
        "div",
        {
          style: {
            ...rn,
            padding: "9px 8px",
            borderRadius: 9,
            background: h ? "#eff7f6" : "transparent"
          },
          children: [
            /* @__PURE__ */ n(
              "span",
              {
                style: {
                  fontSize: 13,
                  fontWeight: 800,
                  textAlign: "center",
                  color: d.rank <= 3 ? "#22302a" : "#8b9a93"
                },
                children: d.rank
              }
            ),
            /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, children: [
              /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13.5,
                    fontWeight: h ? 800 : 600,
                    color: h ? r : "#25332c"
                  },
                  children: d.name
                }
              ),
              g.includes("editor") && /* @__PURE__ */ n(
                "span",
                {
                  role: "img",
                  title: "Set the boards - opened the pack editor",
                  "aria-label": "Set the boards",
                  style: { flex: "none", fontSize: 10, lineHeight: 1, color: r },
                  children: Ji
                }
              ),
              g.includes("moderator") && /* @__PURE__ */ n(
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
                    color: ft,
                    fontSize: 8.5,
                    fontWeight: 800,
                    letterSpacing: ".07em",
                    lineHeight: 1
                  },
                  children: "MOD"
                }
              )
            ] }),
            /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 800, textAlign: "right", color: b }, children: d.total })
          ]
        },
        `${d.name}-${p}`
      );
    }) }),
    t && /* @__PURE__ */ c(
      "div",
      {
        style: {
          ...rn,
          marginTop: 7,
          padding: "11px 8px 3px",
          borderTop: `1px solid ${ko}`
        },
        children: [
          /* @__PURE__ */ n("span", { "aria-hidden": !0, style: { textAlign: "center", fontSize: 12, color: "#9aa8b0" }, children: Qi }),
          /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: 13, fontWeight: 700, color: ft }, children: t.label ?? "BEN" }),
            /* @__PURE__ */ n("span", { style: { fontSize: 10.5, color: "#8a949c" }, children: t.note ?? `benchmark ${ir} unranked` })
          ] }),
          /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 800, textAlign: "right", color: ft }, children: t.total })
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
          borderTop: `1px solid ${ko}`,
          fontSize: 10,
          color: "#a2ada7",
          flexWrap: "wrap"
        },
        children: l
      }
    )
  ] });
}
function dl({
  open: e,
  onClose: t,
  standings: o,
  children: r,
  boards: a,
  viewportPhone: l = !0,
  heading: i = "Results",
  subtitle: s,
  boardsHeading: d = "Board by board",
  accent: p = gt
}) {
  if (ye(() => {
    if (!e) return;
    const b = (k) => {
      k.key === "Escape" && t();
    };
    return window.addEventListener("keydown", b), () => window.removeEventListener("keydown", b);
  }, [e, t]), !e) return null;
  const h = l;
  return /* @__PURE__ */ c(Ne, { children: [
    /* @__PURE__ */ n(
      "div",
      {
        onClick: t,
        "aria-hidden": !0,
        style: { position: "absolute", inset: 0, zIndex: 40, background: "rgba(6,14,11,.52)" }
      }
    ),
    /* @__PURE__ */ c("div", { role: "dialog", "aria-modal": "true", "aria-label": i, style: h ? {
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
      fontFamily: ht,
      color: xo
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
      fontFamily: ht,
      color: xo
    }, children: [
      h && /* @__PURE__ */ n(
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
      /* @__PURE__ */ c(
        "div",
        {
          style: {
            flex: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: h ? "6px 18px 12px" : "18px 20px 12px"
          },
          children: [
            /* @__PURE__ */ c("div", { style: { minWidth: 0 }, children: [
              /* @__PURE__ */ n("div", { style: { fontSize: 16, fontWeight: 800, color: "#16201c", lineHeight: 1.2 }, children: i }),
              s && /* @__PURE__ */ n(
                "div",
                {
                  style: {
                    marginTop: 3,
                    fontSize: 11.5,
                    color: kn,
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
                children: rr
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ c(
        "div",
        {
          style: {
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: h ? "0 18px 22px" : "0 20px 20px"
          },
          children: [
            o && /* @__PURE__ */ n(sl, { ...o, accent: o.accent ?? p }),
            r,
            a.length > 0 && /* @__PURE__ */ c(Ne, { children: [
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
                  children: d
                }
              ),
              /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, marginTop: 8, overflowX: "auto", paddingBottom: 4 }, children: a.map((b) => {
                const k = !!b.current, u = b.tone ? Re(b.tone) : Re(At(b.value));
                return /* @__PURE__ */ c(
                  "div",
                  {
                    title: `Board ${b.boardNo}${k ? " - open at the table behind this sheet" : ""}`,
                    style: {
                      flex: "none",
                      width: h ? 38 : 48,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      padding: "6px 2px",
                      borderRadius: 8,
                      background: k ? "#eff7f6" : "#f7faf8",
                      border: `1px solid ${k ? p : "#e8eeea"}`
                    },
                    children: [
                      /* @__PURE__ */ n("span", { style: { fontSize: 9.5, fontWeight: 700, color: k ? p : "#a2ada7" }, children: b.boardNo }),
                      /* @__PURE__ */ n("span", { style: { fontSize: 12.5, fontWeight: 800, color: u }, children: b.text })
                    ]
                  },
                  b.boardNo
                );
              }) })
            ] })
          ]
        }
      )
    ] })
  ] });
}
const cl = "Tinted cell = best score on that board (ties share it). BEN is a benchmark column and is never ranked.", vt = 46;
function fl({
  columns: e,
  rows: t,
  totals: o,
  onCompare: r,
  accent: a = gt,
  legend: l = cl,
  viewportPhone: i = !0
}) {
  const [s, d] = ti(rl, ar), p = typeof r == "function", h = p && s.active, g = il(s), b = i ? 46 : 54, k = vt + e.length * (b + 4) + 8, u = (y) => {
    const H = e.find((S) => S.key === y);
    return H ? H.name ?? H.label : y;
  }, m = s.picks[0], N = h ? m ? g ? `Board ${g.boardNo} ${ir} ${u(g.a)} vs ${u(g.b)}` : `Board ${m.boardNo}: ${u(m.key)} picked ${Zi} now pick a second player in that row.` : "Pick two players on the same board." : "Pick two cells on the same board to compare those two lines.", $ = {
    marginTop: 6,
    minHeight: 34,
    lineHeight: 1.45,
    fontSize: g ? 12 : 11.5,
    fontWeight: g ? 800 : h && m ? 700 : 600,
    color: g ? "#22302a" : h ? m ? a : "#5f6f68" : "#9aa8a1"
  }, I = () => {
    !g || !r || (r(g), d({ type: "cancel" }));
  }, F = (y) => ({
    width: b,
    flex: "none",
    textAlign: "center",
    padding: "5px 2px",
    borderRadius: "7px 7px 0 0",
    fontSize: 10.5,
    fontWeight: 800,
    background: y.isBenchmark ? "#eef1f4" : y.isYou ? "#eff7f6" : "#f7faf8",
    color: y.isBenchmark ? ft : y.isYou ? a : "#5a6a63"
  });
  return /* @__PURE__ */ c("div", { style: { fontFamily: ht, color: "#17211d" }, children: [
    p && /* @__PURE__ */ c("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minHeight: 32 }, children: [
        !h && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => d({ type: "start" }),
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
            children: `${qi} Compare`
          }
        ),
        h && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => d({ type: "cancel" }),
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
            children: `${rr} Cancel`
          }
        ),
        h && g && /* @__PURE__ */ n(
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
    /* @__PURE__ */ n("div", { style: { overflowX: "auto", WebkitOverflowScrolling: "touch" }, children: /* @__PURE__ */ c("div", { style: { minWidth: k }, children: [
      /* @__PURE__ */ c("div", { style: { display: "flex", gap: 4, marginBottom: 5 }, children: [
        /* @__PURE__ */ n("span", { style: { width: vt, flex: "none" } }),
        e.map((y) => /* @__PURE__ */ n("span", { style: F(y), title: y.name ?? y.label, children: y.label }, y.key))
      ] }),
      t.map((y) => {
        const H = ol(y.cells), S = ll(s, y.boardNo);
        return /* @__PURE__ */ c(
          "div",
          {
            style: { display: "flex", gap: 4, marginBottom: 3, alignItems: "stretch" },
            children: [
              /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    width: vt,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 7px",
                    borderRadius: 7,
                    background: "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#3f4f48",
                    opacity: S ? 0.32 : 1
                  },
                  children: y.label ?? `Bd ${y.boardNo}`
                }
              ),
              e.map((G, A) => {
                const x = y.cells[A], T = (x == null ? void 0 : x.text) ?? "", v = !!H[A], O = al(s, y.boardNo, G.key), M = h && !S, ee = G.name ?? G.label, Q = O ? "#d9efeb" : v ? "#e4f2ef" : G.isBenchmark ? "#f6f8f9" : G.isYou ? "#f3faf9" : "#fff", R = O ? `2px solid ${a}` : M ? "1px dashed #b3d2ce" : v ? "1px solid #a9d3cd" : G.isYou ? "1px solid #dcefec" : G.isBenchmark ? "1px solid #dde3e7" : "1px solid #eef2ef", te = h ? S ? `Not this row - both picks must be on Board ${m ? m.boardNo : y.boardNo}` : O ? "Click again to deselect" : `Pick ${ee} on Board ${y.boardNo}` : v ? `Best on Board ${y.boardNo}` : "";
                return /* @__PURE__ */ n(
                  "button",
                  {
                    type: "button",
                    disabled: !M,
                    "aria-pressed": M ? O : void 0,
                    "aria-label": `${ee}, board ${y.boardNo}${T ? `: ${T}` : ""}${v ? ", best on this board" : ""}`,
                    title: te,
                    onClick: () => d({ type: "pick", boardNo: y.boardNo, key: G.key }),
                    style: {
                      width: b,
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      padding: O ? "5px 1px" : "6px 2px",
                      background: Q,
                      border: R,
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: v ? 800 : G.isYou || G.isBenchmark ? 700 : 600,
                      color: x != null && x.tone ? Re(x.tone) : Re(At(x == null ? void 0 : x.value)),
                      opacity: S ? 0.32 : 1,
                      cursor: h ? S ? "not-allowed" : "pointer" : "default"
                    },
                    children: T
                  },
                  G.key
                );
              })
            ]
          },
          y.boardNo
        );
      }),
      o && o.length > 0 && /* @__PURE__ */ c(
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
                  width: vt,
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
              const S = o[H];
              return /* @__PURE__ */ n(
                "span",
                {
                  style: {
                    width: b,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 2px",
                    borderRadius: 6,
                    background: y.isBenchmark ? "#eef1f4" : y.isYou ? "#eff7f6" : "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: y.isBenchmark ? ft : S != null && S.tone ? Re(S.tone) : Re(At(S == null ? void 0 : S.value))
                  },
                  children: (S == null ? void 0 : S.text) ?? ""
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
const So = ["N", "E", "S", "W"], ul = { N: "S", S: "N", E: "W", W: "E" }, hl = { N: "North", E: "East", S: "South", W: "West" };
function pl({
  deal: e,
  seed: t = 1,
  dealer: o = "N",
  vul: r = "none",
  humanSeat: a = "S",
  showAllHands: l = !1,
  appearance: i,
  decide: s,
  robotDelayMs: d = 350,
  showCoach: p = !1,
  coachShare: h,
  onComplete: g,
  onState: b
}) {
  var R, te, X;
  const k = me(() => e ?? Je(t), [e, t]), [u, m] = K(
    () => ut("embed", o, r, k)
  ), N = `${o}:${r}:${t}:${k.N.length}:${((R = k.N[0]) == null ? void 0 : R.suit) ?? ""}${((te = k.N[0]) == null ? void 0 : te.rank) ?? ""}`, $ = ie(N);
  ye(() => {
    $.current !== N && ($.current = N, I.current = 0, m(ut("embed", o, r, k)));
  }, [N, o, r, k]);
  const I = ie(0), F = Fe((D, C) => {
    m(
      (z) => Oe(z, {
        category: "bid-event",
        seq: I.current += 1,
        boardRef: z.boardRef,
        seat: D,
        call: C
      })
    );
  }, []), y = Fe((D, C) => {
    m(
      (z) => Oe(z, {
        category: "play-event",
        seq: I.current += 1,
        boardRef: z.boardRef,
        seat: D,
        card: C
      })
    );
  }, []), H = ((X = u.contract) == null ? void 0 : X.declarer) ?? null, S = H && u.phase !== "auction" ? ul[H] : null, G = Fe(
    (D) => D === a || D === S && H === a,
    [a, S, H]
  ), A = u.phase !== "complete" && G(u.turn), x = ie(!1);
  ye(() => {
    if (!s || A || u.phase === "complete" || x.current) return;
    const D = u.turn, C = u;
    x.current = !0;
    let z = !1;
    return (async () => {
      try {
        if (await new Promise((q) => setTimeout(q, d)), z) return;
        const J = await s(C, D);
        if (z || !J) return;
        m((q) => q !== C && q.turn !== D ? q : J.call && q.phase === "auction" ? Ke(q.auction, D).has(J.call) ? Oe(q, {
          category: "bid-event",
          seq: I.current += 1,
          ts: Date.now(),
          boardRef: q.boardRef,
          seat: D,
          call: J.call,
          fallback: !1
        }) : q : J.card && q.phase === "play" && It(q, D).some(
          (ne) => ne.suit === J.card.suit && ne.rank === J.card.rank
        ) ? Oe(q, {
          category: "play-event",
          seq: I.current += 1,
          ts: Date.now(),
          boardRef: q.boardRef,
          seat: D,
          card: J.card,
          fallback: !1
        }) : q);
      } finally {
        x.current = !1;
      }
    })(), () => {
      z = !0, x.current = !1;
    };
  }, [s, A, u, d]);
  const T = ie(b);
  T.current = b, ye(() => {
    var D;
    (D = T.current) == null || D.call(T, u);
  }, [u]);
  const v = ie(!1);
  ye(() => {
    u.phase !== "complete" || v.current || (v.current = !0, g == null || g(u));
  }, [u, g]);
  const O = me(() => ({
    ...Ko((i == null ? void 0 : i.skin) ?? "bbo", i == null ? void 0 : i.overrides),
    handLayout: (i == null ? void 0 : i.handLayout) ?? "row",
    bidPad: (i == null ? void 0 : i.bidPad) ?? "grid",
    centreFrame: (i == null ? void 0 : i.centreFrame) ?? !1,
    fanSpread: (i == null ? void 0 : i.fanSpread) ?? 56,
    fanRadius: (i == null ? void 0 : i.fanRadius) ?? 0
  }), [i]), M = me(() => {
    const D = {};
    for (const C of So)
      D[C] = l || C === a || C === S;
    return D;
  }, [l, a, S]), ee = me(() => {
    const D = {};
    for (const C of So)
      D[C] = {
        name: C === a ? "You" : hl[C],
        human: C === a
      };
    return D;
  }, [a]), Q = u.phase === "complete" ? Go(u) : null;
  return /* @__PURE__ */ n(
    Fi,
    {
      state: u,
      seats: ee,
      visible: M,
      mySeat: a,
      myTurn: A,
      legalCalls: u.phase === "auction" && A ? [...Ke(u.auction, u.turn)] : [],
      legalPlays: u.phase === "play" && A ? It(u, u.turn) : [],
      appearance: O,
      showCoach: p,
      ...h === void 0 ? {} : { coachShare: h },
      resultLine: Q ? Vo(Q) : "",
      resultScore: Q ? `${Q.declarerScore >= 0 ? "+" : ""}${Q.declarerScore}` : "",
      onCall: (D) => {
        A && F(u.turn, D);
      },
      onPlay: (D, C) => {
        A && y(u.turn, C);
      }
    }
  );
}
const ln = ["W", "N", "E", "S"], gl = { N: "North", E: "East", S: "South", W: "West" }, bl = {
  none: "Neither vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable"
}, yl = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, ml = (e) => e === "H" || e === "D", xl = (e) => /^[1-7][CDHSN]$/.test(e), kl = "#dbe8e8", an = "#fbfbfa", Ye = "rgba(0,0,0,0.10)", rt = "#111827", De = "#6B7280", sn = "#2f5c8f", Sl = (e, t) => t === "both" || t === (e === "N" || e === "S" ? "ns" : "ew");
function wt({ call: e, size: t = 15 }) {
  if (!xl(e))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: rt }, children: e === "P" ? "Pass" : e });
  const o = e[1] ?? "N";
  return /* @__PURE__ */ c("span", { style: { fontSize: t, fontWeight: 700, color: rt, whiteSpace: "nowrap" }, children: [
    e[0],
    /* @__PURE__ */ n("span", { style: { color: ml(o) ? "#cc0000" : rt }, children: yl[o] })
  ] });
}
function vl(e, t, o) {
  const r = e.deal ? null : e.seed ?? 1, a = e.deal ?? Je(r ?? 1), l = e.dealer ?? t.dealer, i = e.vul ?? t.vul, s = e.seat ?? t.seat;
  let d = ut(`drill-${o}`, l, i, a);
  const p = (g) => {
    d = Oe(d, {
      category: "bid-event",
      boardRef: d.boardRef,
      seat: d.turn,
      call: g
    });
  };
  for (const g of e.auction ?? []) {
    if (d.phase !== "auction" || d.turn === s || !Ke(d.auction, d.turn).has(g)) break;
    p(g);
  }
  for (let g = 0; g < 4 && d.phase === "auction" && d.turn !== s; g++) p("P");
  const h = d.phase === "auction" && d.turn === s;
  return {
    seed: r,
    seat: s,
    dealer: l,
    vul: i,
    state: d,
    legal: h ? [...Ke(d.auction, s)] : [],
    askable: h,
    note: e.note ?? ""
  };
}
function ja({
  hands: e,
  dealer: t = "N",
  vul: o = "none",
  seat: r = "S",
  decide: a,
  prefetchConcurrency: l = 2,
  onComplete: i
}) {
  const s = me(
    () => JSON.stringify([
      t,
      o,
      r,
      e.map((W) => [W.seed ?? null, W.dealer ?? null, W.vul ?? null, W.seat ?? null, W.auction ?? null, W.note ?? "", W.deal ? Object.values(W.deal).flat().length : 0])
    ]),
    [e, t, o, r]
  ), d = ie({ sig: "", list: [] });
  d.current.sig !== s && (d.current = { sig: s, list: e.map((W, j) => vl(W, { dealer: t, vul: o, seat: r }, j)) });
  const p = d.current.list, h = ie(a);
  h.current = a;
  const g = !!a, [b, k] = K({});
  ye(() => {
    const W = d.current.list, j = {};
    for (let U = 0; U < W.length; U++)
      j[U] = { status: g && W[U].askable ? "pending" : "off", call: null, ms: null };
    if (k(j), !g) return;
    let P = !1, oe = 0;
    const B = async () => {
      var U;
      for (; ; ) {
        const Z = oe++;
        if (P || Z >= W.length) return;
        const ae = W[Z];
        if (!ae.askable) continue;
        const ze = Date.now();
        try {
          const de = await ((U = h.current) == null ? void 0 : U.call(h, ae.state, ae.seat));
          if (P) return;
          const We = Date.now() - ze;
          k((he) => ({
            ...he,
            [Z]: de != null && de.call ? { status: "ready", call: de.call, ms: We } : { status: "failed", call: null, ms: We }
          }));
        } catch {
          if (P) return;
          k((de) => ({ ...de, [Z]: { status: "failed", call: null, ms: Date.now() - ze } }));
        }
      }
    }, _ = Math.max(1, Math.min(l, W.length));
    return Promise.all(Array.from({ length: _ }, () => B())), () => {
      P = !0;
    };
  }, [s, g, l]);
  const [u, m] = K(0), [N, $] = K({}), [I, F] = K(null), [y, H] = K(!1), S = Fe(() => {
    m(0), $({}), F(null), H(!1), x.current = !1;
  }, []), G = ie(s);
  G.current !== s && (G.current = s, (u !== 0 || y || Object.keys(N).length) && S());
  const A = me(
    () => p.flatMap((W, j) => {
      const P = N[j];
      if (!P) return [];
      const oe = b[j], B = (oe == null ? void 0 : oe.status) === "ready" ? oe.call : null;
      return [
        {
          index: j,
          seat: W.seat,
          seed: W.seed,
          yourCall: P,
          benCall: B,
          agreed: B ? B === P : null,
          benMs: (oe == null ? void 0 : oe.ms) ?? null
        }
      ];
    }),
    [p, N, b]
  ), x = ie(!1);
  ye(() => {
    !y || x.current || (x.current = !0, i == null || i(A));
  }, [y, A, i]);
  const T = ie(null), [v, O] = K(560);
  ye(() => {
    const W = T.current;
    if (!W) return;
    const j = () => O(W.clientWidth || 560);
    j();
    const P = new ResizeObserver(j);
    return P.observe(W), () => P.disconnect();
  }, []);
  const M = 280, ee = 14, Q = 14, R = v >= M + Q + 240 + ee * 2, te = (R ? v - ee * 2 - Q - M : v - ee * 2) - 6, X = Math.max(26, Math.min(46, Math.floor((te - 70) / 5.65))), D = 5 * (X + 14) + 4 * Math.round(X * 0.13);
  if (p.length === 0)
    return /* @__PURE__ */ n("div", { style: { padding: 16, fontSize: 13, color: De, background: an, border: `1px solid ${Ye}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const C = p[Math.min(u, p.length - 1)], z = N[u] ?? null, L = b[u], J = [];
  {
    const W = [
      ...Array.from({ length: ln.indexOf(C.dealer) }, () => null),
      ...C.state.auction,
      // The learner's own call, once made, belongs in the grid like any other.
      ...z ? [{ seat: C.seat, call: z }] : []
    ];
    for (let j = 0; j < W.length; j += 4) J.push(W.slice(j, j + 4));
  }
  const q = ln.map((W) => ({ seat: W, vul: Sl(W, C.vul), isDealer: W === C.dealer })), re = /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, alignItems: "center" }, children: p.map((W, j) => /* @__PURE__ */ n(
    "span",
    {
      title: `Hand ${j + 1}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: N[j] ? sn : "transparent",
        border: `1.5px solid ${j === u && !y ? sn : "rgba(0,0,0,0.22)"}`,
        boxSizing: "border-box"
      }
    },
    j
  )) }), pe = () => {
    if (!z) return null;
    const W = (L == null ? void 0 : L.status) === "ready" && L.call === z;
    return /* @__PURE__ */ c("div", { style: { background: "#fff", border: `1px solid ${Ye}`, borderRadius: 10, padding: "10px 12px" }, children: [
      /* @__PURE__ */ c("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: De }, children: [
        /* @__PURE__ */ n("span", { children: "You bid" }),
        /* @__PURE__ */ n(wt, { call: z, size: 17 }),
        (L == null ? void 0 : L.status) === "ready" && L.call ? W ? /* @__PURE__ */ n("span", { style: { color: "#1a7f4b", fontWeight: 600 }, children: "— BEN bids that too." }) : /* @__PURE__ */ c(Ne, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN bid" }),
          /* @__PURE__ */ n(wt, { call: L.call, size: 17 })
        ] }) : (L == null ? void 0 : L.status) === "pending" ? /* @__PURE__ */ c(Ne, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "BEN is still working on this hand…" })
        ] }) : (L == null ? void 0 : L.status) === "failed" ? /* @__PURE__ */ c(Ne, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN unavailable" })
        ] }) : null
      ] }),
      C.note && /* @__PURE__ */ n("p", { style: { fontSize: 13, lineHeight: 1.45, color: rt, marginTop: 8, marginBottom: 0 }, children: C.note }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: () => u + 1 < p.length ? m(u + 1) : H(!0),
          style: {
            marginTop: 12,
            height: 38,
            padding: "0 18px",
            border: 0,
            borderRadius: 8,
            background: sn,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer"
          },
          children: u + 1 < p.length ? "Next hand →" : "See how you did"
        }
      )
    ] });
  };
  if (y) {
    const W = A.filter((P) => P.benCall), j = W.filter((P) => P.agreed).length;
    return /* @__PURE__ */ c("div", { ref: T, style: { background: an, border: `1px solid ${Ye}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        nr,
        {
          line: "Drill complete",
          score: W.length ? `Same call as BEN on ${j} of ${W.length}` : "",
          detail: `${A.length} hand${A.length === 1 ? "" : "s"} bid`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 14 }, children: A.map((P) => /* @__PURE__ */ c(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${Ye}`,
            fontSize: 13,
            color: De
          },
          children: [
            /* @__PURE__ */ c("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              P.index + 1
            ] }),
            /* @__PURE__ */ c("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(wt, { call: P.yourCall })
            ] }),
            /* @__PURE__ */ c("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "BEN" }),
              P.benCall ? /* @__PURE__ */ n(wt, { call: P.benCall }) : /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "unavailable" })
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
          onClick: S,
          style: {
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${Ye}`,
            borderRadius: 8,
            background: "#fff",
            color: rt,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Bid them again"
        }
      ),
      /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: De, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
    ] });
  }
  const ne = /* @__PURE__ */ c("div", { style: { flex: R ? "1 1 0" : void 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ n(Mt, { cards: C.state.hands[C.seat], panelBg: "#fff", width: "100%", font: 20, suitW: 18, pad: "6px 10px" }),
    /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: R ? "flex-start" : "center" }, children: /* @__PURE__ */ n(
      tr,
      {
        bg: kl,
        m: { width: 236, height: "auto", headFont: 16, cellFont: 15, radius: 6, cellMinH: 20 },
        heads: q,
        rows: J,
        dealerCol: ln.indexOf(C.dealer),
        emptyText: J.length === 0 ? `${C.dealer === C.seat ? "You deal" : `${C.dealer} deals`}` : null
      }
    ) })
  ] }), w = /* @__PURE__ */ c(
    "div",
    {
      style: {
        flex: R ? `0 0 ${D}px` : void 0,
        width: R ? D : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8
      },
      children: [
        C.askable ? z ? null : /* @__PURE__ */ c(Ne, { children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 12, color: De, alignSelf: "flex-start" }, children: I ? "Confirm your call" : "Your call?" }),
          /* @__PURE__ */ n(
            Rt,
            {
              cell: X,
              radius: 6,
              legalCalls: C.legal,
              live: !0,
              pending: I,
              onStage: F,
              onConfirm: () => {
                I && ($((W) => ({ ...W, [u]: I })), F(null));
              },
              onCancel: () => F(null)
            }
          )
        ] }) : /* @__PURE__ */ n("p", { style: { fontSize: 13, color: De, textAlign: "center", margin: 0 }, children: "This hand's auction is already over — nothing to bid." }),
        (z || !C.askable) && /* @__PURE__ */ n("div", { style: { width: "100%" }, children: z ? pe() : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => u + 1 < p.length ? m(u + 1) : H(!0),
            style: { height: 34, padding: "0 14px", border: `1px solid ${Ye}`, borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
            children: "Skip this hand →"
          }
        ) })
      ]
    }
  );
  return /* @__PURE__ */ c("div", { ref: T, style: { background: an, border: `1px solid ${Ye}`, borderRadius: 12, padding: 14 }, children: [
    /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }, children: [
      /* @__PURE__ */ c("span", { style: { fontSize: 12.5, fontWeight: 700, color: rt }, children: [
        "Hand ",
        u + 1,
        " of ",
        p.length
      ] }),
      re
    ] }),
    /* @__PURE__ */ c("p", { style: { fontSize: 12, color: De, margin: "0 0 10px" }, children: [
      "You are ",
      gl[C.seat],
      " · ",
      bl[C.vul]
    ] }),
    /* @__PURE__ */ c("div", { style: { display: "flex", flexDirection: R ? "row" : "column", gap: 14, alignItems: "flex-start" }, children: [
      ne,
      w
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: De, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
  ] });
}
const vo = ["N", "E", "S", "W"], wo = { N: "North", E: "East", S: "South", W: "West" }, wl = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, Nl = 1976 / 1232, Nt = (e) => e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
function Ya({
  seed: e = 1,
  deal: t,
  dealer: o = "N",
  vul: r = "none",
  show: a = "all",
  boardLabel: l,
  names: i,
  auction: s = [],
  highlightSeat: d = null,
  hiddenSeats: p = []
}) {
  const h = me(() => t ?? Je(e), [t, e]), g = me(() => {
    let u = ut("diagram", o, r, h);
    for (const m of s) {
      if (u.phase !== "auction" || !Ke(u.auction, u.turn).has(m)) break;
      u = Oe(u, {
        category: "bid-event",
        boardRef: u.boardRef,
        seat: u.turn,
        call: m
      });
    }
    return u.auction;
  }, [s, o, r, h]);
  if (a !== "all")
    return /* @__PURE__ */ n(
      Mt,
      {
        cards: h[a],
        panelBg: "#fff",
        width: "100%",
        font: 21,
        suitW: 19,
        pad: "8px 12px"
      }
    );
  const b = {};
  for (const u of vo) b[u] = (i == null ? void 0 : i[u]) ?? wo[u];
  const k = {};
  for (const u of vo) k[u] = !p.includes(u);
  return /* @__PURE__ */ n("div", { style: { width: "100%", aspectRatio: String(Nl) }, children: /* @__PURE__ */ n(
    Yi,
    {
      boardLabel: l ?? e,
      dealer: o,
      vul: r,
      hands: h,
      names: b,
      visible: k,
      auction: g,
      highlightSeat: d,
      info: [
        { label: "Dealer", value: wo[o] },
        { label: "Vulnerable", value: wl[r] }
      ],
      result: [
        { label: "N-S points", value: String(Nt(h.N) + Nt(h.S)) },
        { label: "E-W points", value: String(Nt(h.E) + Nt(h.W)) }
      ]
    }
  ) });
}
function sr(e) {
  return e.format === "bidding-only" ? "bidding-only" : "full";
}
function $l(e) {
  return sr(e) === "bidding-only";
}
function dr(e, t) {
  return t ? e !== "auction" : e === "complete";
}
const it = 1, Be = 16;
function Cl(e) {
  return ["N", "E", "S", "W"][(e - 1) % 4];
}
function cr(e) {
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
function Bl(e) {
  const t = e.auction.map((r) => `${r.seat}${r.call}`).join(","), o = e.play.map((r) => `${r.seat}${r.card.suit}${r.card.rank}`).join(",");
  return `${e.dealer}/${t}/${o}`;
}
function El(e) {
  const t = Bl(e);
  let o = 2166136261;
  for (let r = 0; r < t.length; r++)
    o ^= t.charCodeAt(r), o = Math.imul(o, 16777619) >>> 0;
  return `${o.toString(16).padStart(8, "0")}${t.length.toString(16)}`;
}
const dn = [
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
function Rl(e) {
  const t = Math.abs(e), o = dn.find((r) => t <= r.to) ?? dn[dn.length - 1];
  return o.imps === 0 ? 0 : e < 0 ? -o.imps : o.imps;
}
function No(e) {
  return e === void 0 ? "?" : e === null ? "PASS" : `${e.level}${e.strain}${e.doubled}`;
}
function Tl(e, t) {
  return e === void 0 || t === void 0 ? !1 : No(e) === No(t);
}
const Wl = "—";
function $o(e, t) {
  const o = Math.round(t);
  return e === "mp" ? `${o}` : o > 0 ? `+${o}` : `${o}`;
}
function Il(e, t) {
  if (e === "mp") return `${t.toFixed(1)}%`;
  const o = Math.round(t);
  return e === "total" ? `${o >= 0 ? "+" : ""}${o.toLocaleString("en-US")}` : `${o >= 0 ? "+" : ""}${o}`;
}
const fr = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
  N: "NT"
};
function cn(e) {
  if (e === void 0) return "";
  if (e === null) return "Pass";
  const t = e.doubled === 1 ? "×" : e.doubled === 2 ? "××" : "";
  return `${e.level}${fr[e.strain] ?? e.strain}${t}${e.declarer}`;
}
function Co(e) {
  if (e === void 0) return Wl;
  if (e === null) return "Passed out";
  const t = e.doubled === 1 ? " ×" : e.doubled === 2 ? " ××" : "";
  return `${e.level}${fr[e.strain] ?? e.strain}${t} by ${e.declarer}`;
}
function zl(e, t) {
  return e === "unrated" ? "BEN has not bid this board yet" : e === "differed" ? "A different contract" : t ? "Matched BEN" : "Matched BEN, from the other side";
}
function fn(e) {
  return e === "matched" ? "pos" : "neutral";
}
const Al = {
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
}, Hl = { 1: "S", 2: "W", 3: "N", 4: "E" };
function Ml() {
  const e = [];
  for (const t of ["S", "H", "D", "C"])
    for (const o of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
      e.push({ suit: t, rank: o });
  return e;
}
function Dl(e) {
  const t = [];
  let o = null;
  for (const r of e) {
    const a = r.toUpperCase();
    if (a === "S" || a === "H" || a === "D" || a === "C") {
      o = a;
      continue;
    }
    const l = Al[a];
    l && o && t.push({ suit: o, rank: l });
  }
  return t;
}
function Ol(e) {
  const t = Hl[e[0]];
  if (!t) return null;
  const o = e.slice(1).split(","), r = { S: [], W: [], N: [], E: [] };
  Te.forEach((i, s) => {
    o[s] && (r[i] = Dl(o[s]));
  });
  const a = /* @__PURE__ */ new Set();
  for (const i of Te) for (const s of r[i]) a.add(`${s.suit}${s.rank}`);
  const l = Ml().filter((i) => !a.has(`${i.suit}${i.rank}`));
  for (const i of Te)
    for (; r[i].length < 13 && l.length; ) r[i].push(l.shift());
  return { dealer: t, hands: r };
}
function Fl(e) {
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
function Ll(e) {
  const t = e.replace(/\r/g, "").split("|"), o = [];
  for (let r = 0; r < t.length - 1; r += 2)
    o.push([t[r].trim(), t[r + 1]]);
  return o;
}
function Pl(e) {
  var h;
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a LIN string first." };
  if (!t.includes("md|") && !t.includes("|md|"))
    return {
      ok: !1,
      error: 'No deal found — this doesn’t look like a LIN file (expected an "md|" tag).'
    };
  const o = Ll(t), r = [];
  let a = { S: "", W: "", N: "", E: "" }, l = "none", i = null, s = 0;
  const d = (g) => {
    s += 1;
    const b = {
      name: g || `Board ${s}`,
      dealer: "S",
      vul: l,
      players: { ...a },
      hands: { S: [], W: [], N: [], E: [] },
      auction: []
    };
    return r.push(b), b;
  };
  for (const [g, b] of o)
    switch (g) {
      case "pn": {
        const k = b.split(",");
        a = {
          S: (k[0] ?? "").trim(),
          W: (k[1] ?? "").trim(),
          N: (k[2] ?? "").trim(),
          E: (k[3] ?? "").trim()
        }, i && (i.players = { ...a });
        break;
      }
      case "sv": {
        const k = b.trim().toLowerCase();
        l = k === "n" ? "ns" : k === "e" ? "ew" : k === "b" ? "both" : "none", i && (i.vul = l);
        break;
      }
      case "qx": {
        const k = (h = b.match(/(\d+)/)) == null ? void 0 : h[1];
        i = d(k ? `Board ${k}` : "");
        break;
      }
      case "ah":
        i && (i.name = b.trim() || i.name);
        break;
      case "md": {
        const k = Ol(b.trim());
        k && ((!i || i.hands.S.length) && (i = d("")), i.dealer = k.dealer, i.hands = k.hands);
        break;
      }
      case "mb": {
        if (!i) break;
        const { call: k, alert: u } = Fl(b), m = Te[(Te.indexOf(i.dealer) + i.auction.length) % 4];
        i.auction.push({ seat: m, call: k, alert: u });
        break;
      }
      case "an": {
        i && i.auction.length && (i.auction[i.auction.length - 1].note = b.trim());
        break;
      }
    }
  const p = r.filter((g) => g.hands.S.length === 13);
  return p.length ? { ok: !0, boards: p } : { ok: !1, error: "Couldn’t read any complete deals from that LIN." };
}
const _l = "SWNE", Bo = 3;
function Xl(e) {
  const t = e.trim().charAt(0).toUpperCase();
  if (!t) return Bo;
  const o = _l.indexOf(t);
  return o < 0 ? Bo : o + 1;
}
function jl(e) {
  if (!/%[0-9a-f]{2}/i.test(e)) return e;
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function Yl(e) {
  const t = e.trim();
  if (!/^(https?:)?\/\//i.test(t) && !/^www\./i.test(t)) return null;
  try {
    return new URL(t.startsWith("www.") ? `https://${t}` : t);
  } catch {
    return null;
  }
}
function Ul(e) {
  const t = (h) => (e.searchParams.get(h) ?? "").trim(), o = t("s"), r = t("w"), a = t("n"), l = t("e");
  if (!o && !r && !a && !l) return null;
  const i = `md|${Xl(t("d"))}${o},${r},${a},${l}|`, s = `sv|${t("v")}|`, d = Number.parseInt(t("b"), 10), p = d > 0 ? `ah|Board ${d}|` : "";
  return `${i}${s}${p}`;
}
function Gl(e) {
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a BBO hand link first." };
  const o = Yl(t);
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
    const l = jl(r);
    return l.includes("md|") ? { ok: !0, lin: l } : { ok: !1, error: "That link’s lin= has no deal in it (no “md|” tag)." };
  }
  const a = Ul(o);
  return a ? { ok: !0, lin: a } : {
    ok: !1,
    error: "No deal in that link — a Hand Viewer URL carries one in lin=, or in n/e/s/w hand parameters."
  };
}
function ur(e) {
  const t = Gl(e);
  return t.ok ? Pl(t.lin) : { ok: !1, error: t.error };
}
const Ve = ["S", "H", "D", "C"], Vl = {
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
function Kl(e) {
  const t = e.toUpperCase().replaceAll("10", "T").replace(/[\s,.]/g, ""), o = [];
  for (const r of t) {
    const a = Vl[r];
    if (!a) return { error: `"${r}" is not a card rank` };
    o.push(a);
  }
  return o;
}
function Jl(e) {
  const t = e.split(".");
  if (t.length !== 4) return { error: "expected four dot-separated suits" };
  const o = [];
  for (let r = 0; r < 4; r++) {
    const a = Kl(t[r] ?? "");
    if ("error" in a) return a;
    for (const l of a) o.push({ suit: Ve[r], rank: l });
  }
  return o;
}
function ql(e) {
  const t = { S: "", H: "", D: "", C: "" };
  for (const o of Ve)
    t[o] = e.filter((r) => r.suit === o).sort((r, a) => a.rank - r.rank).map((r) => dt(r.rank)).join("");
  return t;
}
function Ql(e) {
  const t = ql(e);
  return Ve.map((o) => t[o]).join(".");
}
const ve = gt, hr = "#eff7f6", Le = "#17211d", fe = "#5c6b64", se = "#8b9a93", ce = "#e4ebe7", ue = "#ffffff", Se = "#f7faf8", Zl = "#8a6d1f", ea = "#fdf6e3", Dt = "#c0392b", pr = "#fdeeec", Ot = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", ta = {
  fontFamily: Ot,
  color: Le,
  fontSize: 13,
  lineHeight: 1.45,
  boxSizing: "border-box"
};
function tt({
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
        color: se,
        ...t
      },
      children: e
    }
  );
}
function Eo({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        background: hr,
        color: "#14403f",
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function na({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f0e2b8",
        background: ea,
        color: Zl,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function Ro({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      role: "alert",
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f3c9c2",
        background: pr,
        color: Dt,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function $t({
  num: e,
  title: t,
  aside: o,
  children: r,
  innerRef: a
}) {
  return /* @__PURE__ */ c(
    "section",
    {
      ref: a,
      style: {
        scrollMarginTop: 84,
        padding: "16px 0",
        borderBottom: `8px solid ${Se}`
      },
      children: [
        /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }, children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: ve }, children: e }),
          /* @__PURE__ */ n("h3", { style: { margin: 0, fontSize: 16, fontWeight: 800, color: Le }, children: t }),
          o && /* @__PURE__ */ c(Ne, { children: [
            /* @__PURE__ */ n("span", { style: { flex: 1 } }),
            /* @__PURE__ */ n("span", { style: { fontSize: 11.5, color: se }, children: o })
          ] })
        ] }),
        r
      ]
    }
  );
}
function To({
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
          border: `1px solid ${l ? ve : ce}`,
          background: l ? ve : ue,
          color: l ? "#fff" : fe,
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
function oa({
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
        background: o ? "#d7ded9" : ve,
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
function st({
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
    border: `1px solid ${a === "accent" ? "#b9dcd9" : a === "alarm" ? "#f3c9c2" : ce}`,
    background: a === "accent" ? hr : a === "alarm" ? pr : ue,
    color: a === "accent" ? "#14403f" : a === "alarm" ? Dt : fe,
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
  return /* @__PURE__ */ c(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 12px",
        borderBottom: o ? 0 : `1px solid ${Se}`
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
              color: se
            },
            children: e
          }
        ),
        /* @__PURE__ */ n("span", { style: { flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }, children: t })
      ]
    }
  );
}
const Tt = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${ce}`,
  background: ue,
  color: Le,
  fontFamily: "inherit",
  fontSize: 13.5,
  boxSizing: "border-box"
}, un = ["N", "E", "S", "W"], at = { N: "North", E: "East", S: "South", W: "West" }, Ct = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2], Wo = { S: "♠", H: "♥", D: "♦", C: "♣" }, Io = "#b03a2e", zo = (e) => e === "H" || e === "D", nt = {
  N: "#2a7ab0",
  E: "#6f4bb0",
  S: "#1c8a5a",
  W: "#b08328"
}, ot = (e, t) => `${e}${t}`;
function ra({
  hands: e,
  onApply: t,
  onCancel: o,
  applyLabel: r = "Use this pack"
}) {
  const [a, l] = K(() => {
    const u = {};
    for (const m of un)
      for (const N of e[m] ?? []) u[ot(N.suit, N.rank)] = m;
    return u;
  }), [i, s] = K("N"), d = me(() => {
    const u = { N: 0, E: 0, S: 0, W: 0 };
    for (const m of Object.values(a)) m && u[m]++;
    return u;
  }, [a]), p = 52 - d.N - d.E - d.S - d.W, h = un.every((u) => d[u] === 13), g = (u, m) => {
    const N = ot(u, m);
    l(($) => ({ ...$, [N]: $[N] === i ? "" : i }));
  }, b = () => l((u) => {
    const m = { ...u };
    for (const N of Ve)
      for (const $ of Ct) {
        const I = ot(N, $);
        m[I] || (m[I] = i);
      }
    return m;
  }), k = () => {
    const u = { N: [], E: [], S: [], W: [] };
    for (const m of Ve)
      for (const N of Ct) {
        const $ = a[ot(m, N)];
        $ && u[$].push({ suit: m, rank: N });
      }
    t(u);
  };
  return /* @__PURE__ */ c(
    "div",
    {
      role: "group",
      "aria-label": h ? "Pack editor — all four hands hold 13 cards" : "Pack editor — hands are not yet 13 cards each",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: `2px solid ${h ? "#79c2a4" : "#e8b1a8"}`,
        background: ue
      },
      children: [
        /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }, children: un.map((u) => {
          const m = i === u, N = Ve.map(($) => ({
            suit: $,
            text: Ct.filter((I) => a[ot($, I)] === u).map((I) => dt(I)).join(" ")
          }));
          return /* @__PURE__ */ c(
            "button",
            {
              type: "button",
              onClick: () => s(u),
              title: `Click cards below to give them to ${at[u]}`,
              style: {
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 8,
                border: `1px solid ${m ? nt[u] : ce}`,
                background: m ? `${nt[u]}14` : ue,
                cursor: "pointer",
                fontFamily: "inherit"
              },
              children: [
                /* @__PURE__ */ c(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: m ? nt[u] : fe
                    },
                    children: [
                      /* @__PURE__ */ n("span", { children: at[u] }),
                      /* @__PURE__ */ c("span", { style: { color: d[u] === 13 ? "#1c8a5a" : Dt }, children: [
                        d[u],
                        "/13"
                      ] })
                    ]
                  }
                ),
                N.map(({ suit: $, text: I }) => /* @__PURE__ */ c(
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
                      /* @__PURE__ */ n("span", { style: { color: zo($) ? Io : Le }, children: Wo[$] }),
                      /* @__PURE__ */ n(
                        "span",
                        {
                          style: {
                            color: fe,
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
            u
          );
        }) }),
        /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: Ve.map((u) => /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 3 }, children: [
          /* @__PURE__ */ n(
            "span",
            {
              style: {
                width: 14,
                flex: "none",
                fontSize: 12,
                textAlign: "center",
                color: zo(u) ? Io : Le
              },
              children: Wo[u]
            }
          ),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 2, flex: 1, minWidth: 0 }, children: Ct.map((m) => {
            const N = a[ot(u, m)] || "", $ = {
              flex: 1,
              minWidth: 0,
              height: 24,
              padding: 0,
              borderRadius: 4,
              border: `1px solid ${N ? nt[N] : ce}`,
              background: N ? `${nt[N]}1f` : Se,
              color: N ? nt[N] : se,
              fontFamily: "inherit",
              fontSize: 10.5,
              fontWeight: N ? 800 : 600,
              cursor: "pointer"
            };
            return /* @__PURE__ */ n(
              "button",
              {
                type: "button",
                onClick: () => g(u, m),
                "aria-label": `${dt(m)} of ${u}${N ? ` — ${at[N]}` : ""}`,
                title: N ? at[N] : "In the pool",
                style: $,
                children: dt(m)
              },
              m
            );
          }) })
        ] }, u)) }),
        /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ c("span", { style: { fontSize: 11, color: se }, children: [
            p,
            " in the pool · filling ",
            at[i]
          ] }),
          /* @__PURE__ */ n("span", { style: { flex: 1 } }),
          /* @__PURE__ */ c(
            "button",
            {
              type: "button",
              onClick: b,
              disabled: p === 0,
              style: {
                height: 30,
                padding: "0 10px",
                borderRadius: 7,
                border: `1px solid ${ce}`,
                background: ue,
                color: p === 0 ? se : fe,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 700,
                cursor: p === 0 ? "default" : "pointer"
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
                border: `1px solid ${ce}`,
                background: ue,
                color: fe,
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
              onClick: k,
              disabled: !h,
              style: {
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                border: 0,
                background: h ? ve : "#d7ded9",
                color: h ? "#fff" : "#8b9a93",
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 800,
                cursor: h ? "pointer" : "default"
              },
              children: r
            }
          )
        ] })
      ]
    }
  );
}
const Ao = ["N", "E", "S", "W"], ia = { N: "North", E: "East", S: "South", W: "West" }, la = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, Ho = (e) => Ao[(Ao.indexOf(e) + 1) % 4] ?? "N";
function aa({
  board: e,
  onChange: t,
  onReroll: o
}) {
  const [r, a] = K(!1), [l, i] = K(!1), [s, d] = K(""), [p, h] = K(null), g = () => {
    const b = ur(s);
    if (!b.ok) {
      h(b.error);
      return;
    }
    const k = b.boards[0];
    if (!k) {
      h("That link holds no boards.");
      return;
    }
    h(null), d(""), i(!1), t({
      hands: k.hands,
      dealer: k.dealer,
      vul: k.vul,
      edited: !0
    });
  };
  return /* @__PURE__ */ c(
    "div",
    {
      style: {
        overflow: "hidden",
        borderRadius: 10,
        border: `1px solid ${e.edited ? "#e2cf9a" : ce}`,
        background: ue
      },
      children: [
        /* @__PURE__ */ c(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              borderBottom: `1px solid ${Se}`
            },
            children: [
              /* @__PURE__ */ c("span", { style: { fontSize: 12.5, fontWeight: 800, color: Le }, children: [
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
              /* @__PURE__ */ n(st, { onClick: o, title: "Re-roll this deal", children: "↻ Re-roll" })
            ]
          }
        ),
        /* @__PURE__ */ c("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px 4px" }, children: [
          /* @__PURE__ */ c(st, { tone: e.vul === "none" ? "plain" : "alarm", children: [
            "Vul ",
            la[e.vul]
          ] }),
          /* @__PURE__ */ c(st, { onClick: () => t({ dealer: Ho(e.dealer) }), title: "Cycle the dealer", children: [
            "Dealer ",
            e.dealer
          ] }),
          /* @__PURE__ */ c(
            st,
            {
              tone: "accent",
              onClick: () => t({ humanSeat: Ho(e.humanSeat) }),
              title: "Cycle the seat the learner sits",
              children: [
                "You: ",
                e.humanSeat
              ]
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "4px 10px" }, children: /* @__PURE__ */ n(
          Mt,
          {
            cards: e.hands[e.humanSeat],
            panelBg: ue,
            width: "100%",
            font: 14,
            suitW: 14,
            pad: "4px 8px"
          }
        ) }),
        /* @__PURE__ */ c(
          "p",
          {
            style: {
              margin: 0,
              padding: "2px 10px 8px",
              textAlign: "center",
              fontSize: 10,
              color: se
            },
            children: [
              "You play ",
              ia[e.humanSeat],
              " · the other three hands stay hidden"
            ]
          }
        ),
        p && !r && /* @__PURE__ */ n(
          "p",
          {
            style: {
              margin: "0 10px 8px",
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid #f3c9c2",
              background: "#fdeeec",
              color: Dt,
              fontSize: 10.5
            },
            children: p
          }
        ),
        /* @__PURE__ */ c("div", { style: { display: "flex", borderTop: `1px solid ${Se}` }, children: [
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => i((b) => !b),
              style: {
                flex: 1,
                padding: "8px 4px",
                border: 0,
                borderRight: `1px solid ${Se}`,
                background: l ? "#eef2ef" : Se,
                color: fe,
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
              onClick: () => a((b) => !b),
              style: {
                flex: 1,
                padding: "8px 4px",
                border: 0,
                background: r ? "#eff7f6" : Se,
                color: r ? ve : fe,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer"
              },
              children: r ? "Close pack editor" : "Edit pack →"
            }
          )
        ] }),
        l && /* @__PURE__ */ c("div", { style: { display: "flex", gap: 6, padding: "8px 10px", background: Se }, children: [
          /* @__PURE__ */ n(
            "input",
            {
              value: s,
              onChange: (b) => d(b.target.value),
              placeholder: "Paste a Hand Viewer URL",
              "aria-label": `BBO hand link for board ${e.boardNo}`,
              style: { ...Tt, height: 34, fontSize: 12 }
            }
          ),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: g,
              disabled: !s.trim(),
              style: {
                flex: "none",
                height: 34,
                padding: "0 12px",
                borderRadius: 8,
                border: 0,
                background: s.trim() ? "#22302a" : "#e4ebe7",
                color: s.trim() ? "#fff" : se,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
                cursor: s.trim() ? "pointer" : "default"
              },
              children: "Use deal"
            }
          )
        ] }),
        r && /* @__PURE__ */ n("div", { style: { padding: 10, background: Se }, children: /* @__PURE__ */ n(
          ra,
          {
            hands: e.hands,
            onCancel: () => a(!1),
            onApply: (b) => {
              t({ hands: b, edited: !0 }), a(!1);
            }
          },
          `${e.boardNo}:${e.seed}:${e.edited}`
        ) })
      ]
    }
  );
}
const Mo = 120, Do = 240, Sn = [
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
], vn = [
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
], Ft = [
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
], sa = [
  { key: "default", label: "Default" },
  { key: "show", label: "Show" },
  { key: "hide", label: "Hide" }
];
function da() {
  const e = {};
  for (const t of Ft) e[t.key] = t.def;
  return e;
}
function Oo(e) {
  const t = {};
  for (const o of Ft) {
    const r = e[o.key];
    (r === "show" || r === "hide") && (t[o.key] = r);
  }
  return t;
}
function ca(e) {
  return { showAllHands: (e == null ? void 0 : e["table.hands_view"]) === "show" };
}
const Ht = new Set(Te), gr = new Set(Object.keys(oi)), fa = new Set(Sn.map((e) => e.key)), br = new Set(vn.map((e) => e.key)), ua = new Set(Ft.map((e) => e.key));
function Nn(e) {
  const t = { N: [], E: [], S: [], W: [] }, o = /* @__PURE__ */ new Set();
  for (const r of Te) {
    const a = Jl(e[r] ?? "");
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
function ha(e) {
  const t = [], o = e.title.trim();
  o || t.push("Give the challenge a title."), o.length > Mo && t.push(`Titles are at most ${Mo} characters.`), e.description.trim().length > Do && t.push(`Descriptions are at most ${Do} characters.`), e.format !== void 0 && !fa.has(e.format) && t.push("Pick whether the board is bid and played, or bidding only."), br.has(e.scoring) || t.push("Pick a scoring method."), (e.boards.length < it || e.boards.length > Be) && t.push(`A challenge has ${it}–${Be} boards.`), e.boards.forEach((r, a) => {
    if (r.boardNo !== a + 1 && t.push(`Board ${a + 1} is numbered ${r.boardNo}.`), Number.isInteger(r.seed) || t.push(`Board ${r.boardNo} has no deal.`), Ht.has(r.dealer) || t.push(`Board ${r.boardNo} has no dealer.`), Ht.has(r.humanSeat) || t.push(`Board ${r.boardNo} has no seat for you.`), r.vul !== void 0 && !gr.has(r.vul) && t.push(`Board ${r.boardNo} has no vulnerability.`), r.pack) {
      const l = Nn(r.pack);
      "error" in l && t.push(`Board ${r.boardNo} pack — ${l.error}.`);
    }
  });
  for (const [r, a] of Object.entries(e.controlOverrides ?? {}))
    ua.has(r) ? a !== "show" && a !== "hide" && t.push(`"${r}" must be shown or hidden.`) : t.push(`"${r}" is not a table control.`);
  return t;
}
function yr(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (!Array.isArray(t.boards) || t.boards.length === 0) return null;
  const o = t.boards.slice(0, Be).map((r, a) => ({
    boardNo: a + 1,
    seed: Number.isInteger(r == null ? void 0 : r.seed) ? r.seed : 1,
    dealer: Ht.has(r == null ? void 0 : r.dealer) ? r.dealer : "N",
    humanSeat: Ht.has(r == null ? void 0 : r.humanSeat) ? r.humanSeat : "S",
    ...r != null && r.vul && gr.has(r.vul) ? { vul: r.vul } : {},
    ...r != null && r.pack ? { pack: r.pack } : {}
  }));
  return {
    title: typeof t.title == "string" ? t.title : "",
    description: typeof t.description == "string" ? t.description : "",
    ...t.format === "bidding-only" || t.format === "full" ? { format: t.format } : {},
    scoring: br.has(t.scoring) ? t.scoring : "imps",
    boards: o,
    controlOverrides: t.controlOverrides && typeof t.controlOverrides == "object" ? t.controlOverrides : {}
  };
}
const pa = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Controls", num: "03" },
  { key: "review", label: "Review", num: "04" }
], ga = { N: "North", E: "East", S: "South", W: "West" }, ba = 4, ya = [2, 4, 6, 8], Fo = (e, t) => e + t * 7919 >>> 0, hn = () => Math.floor(Math.random() * 4294967295) + 1 >>> 0;
function Lo(e, t) {
  return {
    boardNo: t,
    seed: e,
    dealer: Cl(t),
    humanSeat: "S",
    vul: cr(t),
    hands: Je(e),
    edited: !1
  };
}
function ma(e) {
  const t = {};
  for (const o of ["N", "E", "S", "W"]) t[o] = Ql(e[o]);
  return t;
}
function xa(e) {
  var t;
  return (t = e == null ? void 0 : e.boards) != null && t.length ? e.boards.map((o, r) => {
    let a = Je(o.seed), l = !1;
    if (o.pack) {
      const i = Nn(o.pack);
      "error" in i || (a = i.hands, l = !0);
    }
    return {
      boardNo: r + 1,
      seed: o.seed,
      dealer: o.dealer,
      humanSeat: o.humanSeat,
      vul: o.vul ?? cr(r + 1),
      hands: a,
      edited: l
    };
  }) : null;
}
function Ua({
  draft: e,
  onCreate: t,
  onChange: o,
  createLabel: r = "Create challenge",
  seedBase: a
}) {
  const l = ie(yr(e) ?? void 0).current, i = ie(a ?? hn()), [s, d] = K("basics"), [p, h] = K((l == null ? void 0 : l.title) ?? ""), [g, b] = K((l == null ? void 0 : l.description) ?? ""), [k, u] = K(
    (l == null ? void 0 : l.format) === "bidding-only" ? "bidding-only" : "full"
  ), [m, N] = K((l == null ? void 0 : l.scoring) ?? "imps"), [$, I] = K(
    () => xa(l) ?? Array.from({ length: ba }, (B, _) => Lo(Fo(i.current, _ + 1), _ + 1))
  ), [F, y] = K(() => {
    const B = da();
    for (const [_, U] of Object.entries((l == null ? void 0 : l.controlOverrides) ?? {})) B[_] = U;
    return B;
  }), [H, S] = K(""), [G, A] = K(null), [x, T] = K(null), [v, O] = K(null), M = ie({}), ee = (B) => {
    var _;
    d(B), (_ = M.current[B]) == null || _.scrollIntoView({ behavior: "smooth", block: "start" });
  }, Q = (B) => (_) => {
    M.current[B] = _;
  }, R = (B) => {
    const _ = Math.max(it, Math.min(Be, Math.round(B)));
    I(
      (U) => Array.from({ length: _ }, (Z, ae) => U[ae] ?? Lo(Fo(i.current, ae + 1), ae + 1))
    );
  }, te = (B, _) => I((U) => U.map((Z, ae) => ae === B ? { ...Z, ..._ } : Z)), X = (B) => I(
    (_) => _.map((U, Z) => {
      if (Z !== B) return U;
      const ae = hn();
      return { ...U, seed: ae, hands: Je(ae), edited: !1 };
    })
  ), D = () => {
    const B = H.split(/\n+/).map((U) => U.trim()).filter(Boolean);
    if (!B.length)
      return A("Paste a BBO hand link first."), null;
    const _ = [];
    for (const U of B) {
      const Z = ur(U);
      if (!Z.ok)
        return A(Z.error), null;
      for (const ae of Z.boards)
        _.push({
          boardNo: 0,
          // renumbered by position below
          seed: hn(),
          dealer: ae.dealer,
          humanSeat: "S",
          vul: ae.vul,
          hands: ae.hands,
          edited: !0
        });
    }
    return _;
  }, C = (B) => {
    const _ = D();
    if (!_) return;
    const U = Be - (B === "replace" ? 0 : $.length);
    I((ae) => [...B === "replace" ? [] : ae, ..._].slice(0, Be).map((de, We) => ({ ...de, boardNo: We + 1 }))), A(null), S("");
    const Z = Math.min(_.length, Math.max(0, U));
    T(
      Z < _.length ? `Took ${Z} of ${_.length} — a challenge holds ${Be} boards.` : `${Z} board${Z === 1 ? "" : "s"} from BBO.`
    );
  }, z = me(() => {
    const B = (U) => U === "hide" ? "hidden" : U === "show" ? "shown" : "platform", _ = Object.keys(Oo(F)).length;
    return `Hands ${B(F["table.hands_view"])} · Undo ${B(
      F["table.undo"]
    )} · ${_} override${_ === 1 ? "" : "s"}`;
  }, [F]), L = [...new Set($.map((B) => B.humanSeat))], J = Sn.find((B) => B.key === k), q = vn.find((B) => B.key === m), re = k === "bidding-only", pe = re ? J.label : q.label, ne = `${$.length}-board ${pe}`, w = p.trim().length > 0, W = w ? p.trim() : ne, j = () => ({
    title: W,
    description: g.trim(),
    format: k,
    scoring: m,
    boards: $.map((B) => ({
      boardNo: B.boardNo,
      seed: B.seed,
      dealer: B.dealer,
      humanSeat: B.humanSeat,
      vul: B.vul,
      ...B.edited ? { pack: ma(B.hands) } : {}
    })),
    controlOverrides: Oo(F)
  }), P = JSON.stringify(j());
  ye(() => {
    o && o(JSON.parse(P));
  }, [P]);
  const oe = () => {
    const B = j(), _ = ha(B);
    if (_.length) {
      O(_[0]), ee("review");
      return;
    }
    O(null), t(B);
  };
  return /* @__PURE__ */ c("div", { style: { ...ta, display: "flex", flexDirection: "column", minWidth: 0 }, children: [
    /* @__PURE__ */ c(
      "div",
      {
        style: {
          background: ue,
          borderBottom: `1px solid ${ce}`,
          paddingBottom: 8
        },
        children: [
          /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }, children: [
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
                  background: ve,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 900
                },
                children: "+"
              }
            ),
            /* @__PURE__ */ c("div", { style: { minWidth: 0, flex: 1 }, children: [
              /* @__PURE__ */ n("div", { style: { fontSize: 14, fontWeight: 800, lineHeight: 1.2 }, children: "Create challenge" }),
              /* @__PURE__ */ n("div", { style: { fontSize: 11, color: se }, children: "Your boards · your seat · BEN in the other three" })
            ] })
          ] }),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }, children: pa.map((B) => /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => ee(B.key),
              style: {
                flex: "none",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${s === B.key ? ve : ce}`,
                background: s === B.key ? ve : ue,
                color: s === B.key ? "#fff" : fe,
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: s === B.key ? 800 : 600,
                cursor: "pointer"
              },
              children: B.label
            },
            B.key
          )) })
        ]
      }
    ),
    /* @__PURE__ */ c($t, { innerRef: Q("basics"), num: "01", title: "Basics", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: fe, lineHeight: 1.5 }, children: "Name it, pick what a board asks for, and how many boards." }),
      /* @__PURE__ */ n(tt, { children: "Title" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge title",
          value: p,
          onChange: (B) => h(B.target.value),
          placeholder: ne,
          style: Tt
        }
      ),
      /* @__PURE__ */ n("p", { style: { margin: "6px 0 0", fontSize: 11, color: se }, children: w ? "The learner sees this above the board." : `Optional — left blank it is called “${ne}.”` }),
      /* @__PURE__ */ n(tt, { style: { marginTop: 16 }, children: "Description" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge description",
          value: g,
          onChange: (B) => b(B.target.value),
          placeholder: "One line the learner sees before starting",
          style: { ...Tt, height: 36, fontSize: 12.5 }
        }
      ),
      /* @__PURE__ */ n(tt, { style: { marginTop: 16 }, children: "What a board asks" }),
      /* @__PURE__ */ n(
        To,
        {
          ariaLabel: "What a board asks",
          options: Sn.map((B) => ({ key: B.key, label: B.label })),
          value: k,
          onChange: u
        }
      ),
      /* @__PURE__ */ n(Eo, { children: J.note }),
      !re && /* @__PURE__ */ c(Ne, { children: [
        /* @__PURE__ */ n(tt, { style: { marginTop: 16 }, children: "Scoring" }),
        /* @__PURE__ */ n(
          To,
          {
            ariaLabel: "Scoring",
            options: vn.map((B) => ({ key: B.key, label: B.label })),
            value: m,
            onChange: N
          }
        ),
        /* @__PURE__ */ n(Eo, { children: q.note })
      ] }),
      /* @__PURE__ */ n(tt, { style: { marginTop: 16 }, children: "Boards" }),
      /* @__PURE__ */ n(ka, { count: $.length, onCount: R }),
      /* @__PURE__ */ c("p", { style: { margin: "8px 0 0", fontSize: 11, color: se, lineHeight: 1.5 }, children: [
        it,
        "–",
        Be,
        " boards. Vulnerability follows the standard board cycle; dealer and the learner's seat are per-board below."
      ] })
    ] }),
    /* @__PURE__ */ c(
      $t,
      {
        innerRef: Q("boards"),
        num: "02",
        title: "Boards",
        aside: `${$.length} board${$.length === 1 ? "" : "s"}`,
        children: [
          /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: fe, lineHeight: 1.5 }, children: "Each board is a random deal. Re-roll for a new one, paste a BBO hand link, or open the pack editor to set the cards by hand." }),
          /* @__PURE__ */ c(
            "div",
            {
              style: {
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${ce}`,
                background: Se
              },
              children: [
                /* @__PURE__ */ n(tt, { children: "From BBO" }),
                /* @__PURE__ */ n(
                  "textarea",
                  {
                    value: H,
                    onChange: (B) => S(B.target.value),
                    rows: 2,
                    placeholder: "Paste Hand Viewer links, one per line",
                    "aria-label": "BBO hand links",
                    style: {
                      ...Tt,
                      height: "auto",
                      padding: 8,
                      resize: "vertical",
                      fontSize: 12,
                      lineHeight: 1.4
                    }
                  }
                ),
                /* @__PURE__ */ c("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }, children: [
                  /* @__PURE__ */ n(
                    "button",
                    {
                      type: "button",
                      onClick: () => C("add"),
                      disabled: !H.trim(),
                      style: {
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: 0,
                        background: H.trim() ? "#22302a" : "#e4ebe7",
                        color: H.trim() ? "#fff" : se,
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
                      onClick: () => C("replace"),
                      disabled: !H.trim(),
                      style: {
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 8,
                        border: `1px solid ${ce}`,
                        background: ue,
                        color: H.trim() ? fe : se,
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: H.trim() ? "pointer" : "default"
                      },
                      children: "Replace all"
                    }
                  )
                ] }),
                G && /* @__PURE__ */ n(Ro, { children: G }),
                !G && x && /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11.5, color: ve }, children: x }),
                /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11, color: se, lineHeight: 1.5 }, children: "An imported board keeps its own dealer and vulnerability. The auction and play in the link are ignored — the learner bids it themselves." })
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
              children: $.map((B, _) => /* @__PURE__ */ n(
                aa,
                {
                  board: B,
                  onChange: (U) => te(_, U),
                  onReroll: () => X(_)
                },
                B.boardNo
              ))
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ c($t, { innerRef: Q("controls"), num: "03", title: "Table controls", children: [
      /* @__PURE__ */ c("p", { style: { margin: "0 0 12px", fontSize: 12, color: fe, lineHeight: 1.5 }, children: [
        "Override the table's own controls for this challenge, in both directions. ",
        /* @__PURE__ */ n("b", { children: "Undo" }),
        " and",
        " ",
        /* @__PURE__ */ n("b", { children: "show-all-hands" }),
        " are off by default: this is scored play."
      ] }),
      /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: Ft.map((B) => {
        const _ = F[B.key] ?? "default";
        return /* @__PURE__ */ c(
          "div",
          {
            style: {
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${ce}`,
              background: ue
            },
            children: [
              /* @__PURE__ */ c("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                /* @__PURE__ */ c("div", { style: { minWidth: 0, flex: 1 }, children: [
                  /* @__PURE__ */ n("div", { style: { fontSize: 12.5, fontWeight: 700 }, children: B.label }),
                  /* @__PURE__ */ n("div", { style: { fontSize: 11, color: se }, children: B.sub })
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
                    children: sa.map((U) => {
                      const Z = _ === U.key;
                      return /* @__PURE__ */ n(
                        "button",
                        {
                          type: "button",
                          onClick: () => y((ae) => ({ ...ae, [B.key]: U.key })),
                          style: {
                            padding: "5px 9px",
                            borderRadius: 6,
                            border: 0,
                            background: Z ? U.key === "show" ? "#1c8a5a" : U.key === "hide" ? "#c0392b" : ve : "transparent",
                            color: Z ? "#fff" : se,
                            fontFamily: "inherit",
                            fontSize: 10.5,
                            fontWeight: Z ? 800 : 600,
                            cursor: "pointer"
                          },
                          children: U.label
                        },
                        U.key
                      );
                    })
                  }
                )
              ] }),
              B.note && /* @__PURE__ */ n(na, { children: B.note })
            ]
          },
          B.key
        );
      }) }),
      /* @__PURE__ */ n("p", { style: { margin: "10px 0 0", fontSize: 11.5, color: se }, children: z })
    ] }),
    /* @__PURE__ */ c($t, { innerRef: Q("review"), num: "04", title: "Review & create", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: fe, lineHeight: 1.5 }, children: re ? "BEN bids every board silently while the learner bids it — that auction is the one theirs is set beside. It needs no card play, so it is quick." : "BEN plays every board silently while the learner plays it, and the two results are set side by side." }),
      v && /* @__PURE__ */ n(Ro, { children: v }),
      /* @__PURE__ */ c(
        "dl",
        {
          style: {
            margin: "0 0 12px",
            overflow: "hidden",
            borderRadius: 10,
            border: `1px solid ${ce}`,
            background: ue
          },
          children: [
            /* @__PURE__ */ n(Ue, { k: "Title", v: w ? W : `${W} — auto-named` }),
            /* @__PURE__ */ n(Ue, { k: "Format", v: J.review }),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "Scoring",
                v: re ? "Matched BEN's contract, board by board — no play score" : q.full
              }
            ),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "Boards",
                v: `${$.length} · ${$.filter((B) => B.edited).length} hand-set`
              }
            ),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "The seat",
                v: L.length === 1 && L[0] ? `${ga[L[0]]} on every board` : `Mixed (${L.join(", ")})`
              }
            ),
            /* @__PURE__ */ n(Ue, { k: "Controls", v: z }),
            /* @__PURE__ */ n(
              Ue,
              {
                k: "Opponents",
                v: re ? "3 BEN robots · BEN's own auction is the reference" : "3 BEN robots · a silent BEN line is the reference",
                last: !0
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ n(oa, { onClick: oe, children: r }),
      /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", textAlign: "center", fontSize: 11.5, color: se }, children: "Solo — one learner, three robots, no field" })
    ] }),
    /* @__PURE__ */ c(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 0",
          borderTop: `1px solid ${ce}`,
          background: ue
        },
        children: [
          /* @__PURE__ */ c("div", { style: { minWidth: 0, flex: 1 }, children: [
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
            /* @__PURE__ */ c("div", { style: { fontSize: 11, color: se }, children: [
              $.length,
              " board",
              $.length === 1 ? "" : "s",
              " · ",
              pe,
              " · solo"
            ] })
          ] }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: oe,
              style: {
                flex: "none",
                height: 40,
                padding: "0 18px",
                borderRadius: 9,
                border: 0,
                background: ve,
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
function ka({
  count: e,
  onCount: t
}) {
  const o = (r) => t(e + r);
  return /* @__PURE__ */ c("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }, children: [
    /* @__PURE__ */ c(
      "div",
      {
        style: {
          display: "flex",
          overflow: "hidden",
          alignItems: "center",
          borderRadius: 8,
          border: `1px solid ${ce}`,
          background: ue
        },
        children: [
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(-1),
              disabled: e <= it,
              "aria-label": "One board fewer",
              style: Po(e <= it),
              children: "−"
            }
          ),
          /* @__PURE__ */ n("span", { style: { minWidth: 46, textAlign: "center", fontSize: 18, fontWeight: 800 }, children: e }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(1),
              disabled: e >= Be,
              "aria-label": "One board more",
              style: Po(e >= Be),
              children: "+"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: ya.map((r) => /* @__PURE__ */ n(st, { tone: e === r ? "accent" : "plain", onClick: () => t(r), children: r }, r)) })
  ] });
}
const Po = (e) => ({
  width: 40,
  height: 40,
  border: 0,
  background: Se,
  color: e ? se : Le,
  fontFamily: "inherit",
  fontSize: 18,
  fontWeight: 800,
  cursor: e ? "default" : "pointer",
  opacity: e ? 0.5 : 1
}), Sa = 400;
async function va(e) {
  const { hands: t, dealer: o, vul: r, humanSeat: a, biddingOnly: l, decide: i, cancelled: s } = e;
  let d = ut("ben-reference", o, r, t);
  for (let p = 0; p < Sa; p++) {
    if (s()) return null;
    if (dr(d.phase, l)) break;
    const h = d.turn;
    let g;
    try {
      g = await i(d, h);
    } catch {
      return null;
    }
    if (s() || !g) return null;
    if (d.phase === "auction" && g.call) {
      if (!Ke(d.auction, h).has(g.call)) return null;
      d = Oe(d, {
        category: "bid-event",
        boardRef: d.boardRef,
        seat: h,
        call: g.call
      });
      continue;
    }
    if (d.phase === "play" && g.card) {
      const b = g.card;
      if (!It(d, h).some((k) => k.suit === b.suit && k.rank === b.rank))
        return null;
      d = Oe(d, {
        category: "play-event",
        boardRef: d.boardRef,
        seat: h,
        card: b
      });
      continue;
    }
    return null;
  }
  return mr(d, a, l);
}
function mr(e, t, o) {
  const r = o ? null : Go(e), a = r ? t === "N" || t === "S" ? r.nsScore : -r.nsScore : void 0;
  return {
    contract: e.contract ?? null,
    ...e.contract ? { contractLabel: li(e.contract) } : {},
    ...r ? { resultLabel: Vo(r) } : {},
    ...a === void 0 ? {} : { rawScore: a }
  };
}
const pn = "·", Ge = "—", wa = "BEN", Na = "YOU";
function _o(e, t, o) {
  return e === "imps" ? Rl(t - o) : e === "total" ? t - o : t > o ? 100 : t === o ? 50 : 0;
}
function $a(e, t) {
  return e === "bidding-only" ? { label: "vs BEN", name: "Contract vs BEN" } : t === "mp" ? { label: "MP %", name: "Matchpoints vs BEN" } : t === "total" ? { label: "Pts", name: "Points vs BEN" } : { label: "IMPs", name: "IMPs vs BEN" };
}
function Ca(e, t) {
  return !e || !t || t.contract === void 0 ? "unrated" : Tl(e.contract, t.contract) ? "matched" : "differed";
}
function Xo(e) {
  if (!e) return Ge;
  const t = e.resultLabel || e.contractLabel || Ge, o = e.rawScore;
  return typeof o == "number" ? `${t} (${o > 0 ? "+" : ""}${o})` : t;
}
function Ba(e, t) {
  const o = e == null ? void 0 : e.contract, r = t == null ? void 0 : t.contract;
  return o != null && r != null ? o.declarer === r.declarer : o === null && r === null;
}
function Ea(e) {
  const { format: t, scoring: o, boardsTotal: r, outcomes: a, currentBoardNo: l } = e, i = t === "bidding-only", s = $a(t, o), d = new Map(a.map((A) => [A.boardNo, A])), p = Array.from({ length: r }, (A, x) => x + 1), h = [
    { key: Na, label: "You", name: "You", isYou: !0 },
    { key: wa, label: "BEN", name: "BEN", isBenchmark: !0 }
  ], g = [], b = [], k = {};
  let u = 0, m = 0, N = 0;
  const $ = [];
  for (const A of p) {
    const x = d.get(A), T = x == null ? void 0 : x.you, v = x == null ? void 0 : x.ben, O = !!T;
    O && (u += 1);
    let M = { text: "" }, ee = { text: "" }, Q, R, te;
    if (i) {
      const X = Ca(T, v);
      X !== "unrated" && O && (m += 1), X === "matched" && (N += 1), M = O ? {
        text: cn(T == null ? void 0 : T.contract),
        ...X === "matched" ? { value: 1 } : {},
        tone: fn(X)
      } : { text: "" }, ee = { text: v ? cn(v.contract) : "" }, O && (Q = cn(T == null ? void 0 : T.contract), X === "matched" && (R = 1), te = fn(X), k[A] = {
        headline: zl(X, Ba(T, v)),
        sub: v === void 0 ? x != null && x.benFailed ? "BEN could not bid this board" : "BEN is still bidding this board" : `You: ${Co(T == null ? void 0 : T.contract)} ${pn} BEN: ${Co(v.contract)}`,
        tone: fn(X)
      });
    } else {
      const X = T == null ? void 0 : T.rawScore, D = v == null ? void 0 : v.rawScore, C = typeof X == "number" && typeof D == "number";
      if (C) {
        m += 1;
        const z = _o(o, X, D);
        $.push(z);
        const L = o === "mp" ? 50 : 0;
        z >= L && (N += 1), M = {
          text: $o(o, z),
          value: Math.round(z),
          tone: z > L ? "pos" : z < L ? "neg" : "neutral"
        }, Q = M.text, R = M.value, te = M.tone;
      } else O && (M = { text: Ge }, Q = Ge, te = "neutral");
      ee = { text: typeof D == "number" ? `${D > 0 ? "+" : ""}${D}` : "" }, O && (k[A] = {
        headline: C ? `${$o(o, _o(o, X, D))} ${s.label}` : v === void 0 ? x != null && x.benFailed ? "BEN could not play this board" : "BEN is still playing this board" : Ge,
        sub: `You: ${Xo(T)}` + (typeof D == "number" ? ` ${pn} BEN: ${Xo(v)}` : ""),
        tone: C ? M.tone ?? "neutral" : "neutral"
      });
    }
    g.push({ boardNo: A, cells: [M, ee] }), b.push({
      boardNo: A,
      state: O ? "done" : A === l ? "current" : "todo",
      ...Q === void 0 ? {} : { score: Q },
      ...R === void 0 ? {} : { value: R },
      ...te === void 0 ? {} : { tone: te },
      disabled: !O
    });
  }
  const I = u === r && r > 0;
  let F, y, H, S;
  if (i)
    y = N, F = m === 0 ? Ge : `${N}/${m}`, H = m > 0 && N === m ? "pos" : "neutral", S = m === 0 ? "BEN has not bid any of these boards yet" : `Reached BEN's contract on ${N} of ${m} board${m === 1 ? "" : "s"}`;
  else {
    const A = $.reduce((T, v) => T + v, 0);
    y = $.length === 0 ? 0 : o === "mp" ? A / $.length : A, F = $.length === 0 ? Ge : Il(o, y);
    const x = o === "mp" ? 50 : 0;
    H = $.length === 0 ? "neutral" : y > x ? "pos" : y < x ? "neg" : "neutral", S = $.length === 0 ? "BEN has not played any of these boards yet" : y > x ? `Ahead of BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : y < x ? `Behind BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : `Level with BEN over ${$.length} board${$.length === 1 ? "" : "s"}`;
  }
  const G = [
    { text: F, ...H === "neutral" ? {} : { tone: H } },
    { text: "" }
  ];
  return {
    unitLabel: s.label,
    unitName: s.name,
    subtitle: `${r} board${r === 1 ? "" : "s"} ${pn} ${s.name}`,
    headline: { text: F, sub: S, tone: H },
    columns: h,
    rows: g,
    totals: G,
    squares: b,
    details: k,
    mark: {
      boardsTotal: r,
      boardsDone: u,
      completed: I,
      boardsWon: N,
      rated: m,
      scoreText: F,
      scoreValue: y,
      percent: m === 0 ? 0 : Math.round(N / m * 100)
    }
  };
}
function Ra(e) {
  return e.boards.map((t, o) => {
    let r = Je(t.seed);
    if (t.pack) {
      const a = Nn(t.pack);
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
function Ga({
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
  const d = me(
    () => yr(e) ?? {
      title: "",
      description: "",
      scoring: "imps",
      boards: [],
      controlOverrides: {}
    },
    [e]
  ), p = me(() => Ra(d), [d]), h = sr(d), g = $l(d), { showAllHands: b } = ca(d.controlOverrides), [k, u] = K(0), [m, N] = K({}), [$, I] = K(!1), [F, y] = K(!0), H = ie(null), S = p[Math.min(k, p.length - 1)], G = S ? !!((D = m[S.boardNo]) != null && D.you) : !1;
  ye(() => {
    const C = H.current;
    if (!C) return;
    const z = () => {
      const J = C.clientWidth || 390, q = C.clientHeight || 844;
      y(J / Math.max(1, q) < 1.25 && J < 640);
    };
    z();
    const L = new ResizeObserver(z);
    return L.observe(C), () => L.disconnect();
  }, []);
  const A = ie(/* @__PURE__ */ new Map()), x = me(() => {
    if (t)
      return async (C, z) => {
        var re, pe;
        const L = `${C.dealer}|${z}|${El({
          dealer: C.dealer,
          auction: C.auction.map((ne) => ({ seat: ne.seat, call: ne.call })),
          play: C.tricks.flatMap((ne) => ne.plays.map((w) => ({ seat: w.seat, card: w.card })))
        })}|${C.hands[z].length}|${((re = C.hands[z][0]) == null ? void 0 : re.suit) ?? ""}${((pe = C.hands[z][0]) == null ? void 0 : pe.rank) ?? ""}`, J = A.current.get(L);
        if (J) return await J;
        const q = Promise.resolve(t(C, z));
        A.current.set(L, q);
        try {
          const ne = await q;
          return ne || A.current.delete(L), ne;
        } catch (ne) {
          throw A.current.delete(L), ne;
        }
      };
  }, [t]);
  ye(() => {
    var z, L;
    if (!l || !x || !S || (z = m[S.boardNo]) != null && z.ben || (L = m[S.boardNo]) != null && L.benFailed) return;
    let C = !1;
    return (async () => {
      const J = await va({
        hands: S.hands,
        dealer: S.dealer,
        vul: S.vul,
        humanSeat: S.humanSeat,
        biddingOnly: g,
        decide: x,
        cancelled: () => C
      });
      C || N((q) => ({
        ...q,
        [S.boardNo]: {
          boardNo: S.boardNo,
          ...q[S.boardNo],
          ...J ? { ben: J } : { benFailed: !0 }
        }
      }));
    })(), () => {
      C = !0;
    };
  }, [l, x, S == null ? void 0 : S.boardNo, g]);
  const T = Fe(
    (C) => {
      S && N(
        (z) => {
          var L;
          return (L = z[S.boardNo]) != null && L.you ? z : {
            ...z,
            [S.boardNo]: {
              boardNo: S.boardNo,
              ...z[S.boardNo],
              you: mr(C, S.humanSeat, g)
            }
          };
        }
      );
    },
    [S, g]
  ), v = Fe(
    (C) => {
      dr(C.phase, g) && T(C);
    },
    [g, T]
  ), O = me(
    () => Ea({
      format: h,
      scoring: d.scoring,
      boardsTotal: p.length,
      outcomes: Object.values(m),
      ...S ? { currentBoardNo: S.boardNo } : {}
    }),
    [h, d.scoring, p.length, m, S]
  ), M = JSON.stringify(O.mark), ee = ie(""), Q = ie(!1);
  ye(() => {
    if (ee.current === M) return;
    ee.current = M;
    const C = JSON.parse(M);
    i == null || i(C), C.completed && !Q.current && (Q.current = !0, s == null || s(C));
  }, [M]);
  const R = O.squares.map((C) => ({
    boardNo: C.boardNo,
    text: C.score ?? "",
    ...C.value === void 0 ? {} : { value: C.value },
    ...C.tone === void 0 ? {} : { tone: C.tone },
    current: (S == null ? void 0 : S.boardNo) === C.boardNo
  })), te = k >= p.length - 1, X = S ? O.details[S.boardNo] : void 0;
  return S ? /* @__PURE__ */ c(
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
          el,
          {
            title: d.title || "Challenge",
            boardNo: S.boardNo,
            boardsTotal: p.length,
            showResults: O.mark.boardsDone > 0,
            height: lr,
            onResults: () => I(!0)
          }
        ),
        /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative" }, children: G ? /* @__PURE__ */ n(
          Wa,
          {
            boardNo: S.boardNo,
            boardsTotal: p.length,
            headline: (X == null ? void 0 : X.headline) ?? "",
            sub: (X == null ? void 0 : X.sub) ?? "",
            tone: (X == null ? void 0 : X.tone) ?? "neutral",
            last: te,
            onNext: () => u((C) => C + 1),
            onResults: () => I(!0)
          }
        ) : /* @__PURE__ */ n(
          pl,
          {
            deal: S.hands,
            seed: S.seed,
            dealer: S.dealer,
            vul: S.vul,
            humanSeat: S.humanSeat,
            showAllHands: b,
            robotDelayMs: a,
            ...r ? { appearance: r } : {},
            ...x ? { decide: x } : {},
            onState: v
          },
          `${S.boardNo}:${S.seed}`
        ) }),
        /* @__PURE__ */ n(
          dl,
          {
            open: $,
            onClose: () => I(!1),
            boards: R,
            viewportPhone: F,
            subtitle: O.subtitle,
            children: /* @__PURE__ */ n(Ta, { view: O })
          }
        )
      ]
    }
  ) : /* @__PURE__ */ n("div", { style: { fontFamily: Ot, padding: 16, color: fe }, children: "This challenge has no boards yet." });
}
function Ta({ view: e }) {
  return /* @__PURE__ */ c("div", { style: { fontFamily: Ot }, children: [
    /* @__PURE__ */ c(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "10px 8px 12px"
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 28, fontWeight: 800, color: Re(e.headline.tone) }, children: e.headline.text }),
          /* @__PURE__ */ c("div", { style: { minWidth: 0 }, children: [
            /* @__PURE__ */ n("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#8b9a93" }, children: e.unitLabel.toUpperCase() }),
            /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: "#5c6b64" }, children: e.headline.sub })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ n(fl, { columns: e.columns, rows: e.rows, totals: e.totals }),
    /* @__PURE__ */ n("div", { style: { marginTop: 10, fontSize: 10.5, color: "#a2ada7", lineHeight: 1.5 }, children: "Solo — there is no field. Every figure is your board set beside BEN's on the same deal, and a different contract is a difference, not a mistake." })
  ] });
}
function Wa({
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
        fontFamily: Ot
      },
      children: /* @__PURE__ */ c(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: 380,
            padding: 16,
            borderRadius: 14,
            background: ue,
            color: Le,
            boxShadow: "0 18px 48px rgba(0,0,0,.42)"
          },
          children: [
            /* @__PURE__ */ c(
              "div",
              {
                style: {
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: se
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
            /* @__PURE__ */ n("div", { style: { marginTop: 6, fontSize: 19, fontWeight: 800, color: Re(a) }, children: o || "Board complete" }),
            /* @__PURE__ */ n("div", { style: { marginTop: 6, fontSize: 12.5, color: fe, lineHeight: 1.5 }, children: r }),
            /* @__PURE__ */ c("div", { style: { display: "flex", gap: 8, marginTop: 14 }, children: [
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
                    border: `1px solid ${ce}`,
                    background: Se,
                    color: fe,
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
                    background: ve,
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
            /* @__PURE__ */ n("div", { style: { marginTop: 8, fontSize: 11, color: se }, children: l ? `All ${t} board${t === 1 ? "" : "s"} played` : `${t - e} board${t - e === 1 ? "" : "s"} left` })
          ]
        }
      )
    }
  );
}
const Ia = ["S", "H", "D", "C"], za = { N: "S", S: "N", E: "W", W: "E" }, Aa = {
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
function xr(e) {
  return e === 10 ? "T" : dt(e);
}
function Bt(e) {
  return Ia.map(
    (t) => e.filter((o) => o.suit === t).sort((o, r) => r.rank - o.rank).map((o) => xr(o.rank)).join("")
  ).join(".");
}
function Ha(e) {
  return e === "P" ? "--" : e === "X" ? "Db" : e === "XX" ? "Rd" : e;
}
function Ma(e) {
  return e.map((t) => Ha(t.call)).join("");
}
function Da(e) {
  return e === "both" ? "@v@V" : e === "ns" ? "@v" : e === "ew" ? "@V" : "";
}
function Oa(e) {
  return e.tricks.flatMap((t) => t.plays).map((t) => `${t.card.suit}${xr(t.card.rank)}`).join("");
}
function Et(e, t) {
  return [
    ...e.hands[t],
    ...e.tricks.flatMap(
      (o) => o.plays.filter((r) => r.seat === t).map((r) => r.card)
    )
  ];
}
function Fa(e) {
  const t = e.trim().toUpperCase();
  if (t === "PASS" || t === "P" || t === "--" || t === "PA") return "P";
  if (t === "X" || t === "DB" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RD" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = /^([1-7])(NT|N|C|D|H|S)$/.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function La(e) {
  const t = /^([SHDC])([2-9TJQKA])$/.exec(e.trim().toUpperCase());
  return t ? { suit: t[1], rank: Aa[t[2]] } : null;
}
function Va({
  endpoint: e,
  timeoutMs: t = 6e4,
  fetchImpl: o,
  onProblem: r
}) {
  const a = e.replace(/\/$/, ""), l = o ?? ((...s) => fetch(...s)), i = async (s, d) => {
    const p = `${a}${s}?${new URLSearchParams({ ...d, details: "true" })}`, h = new AbortController(), g = setTimeout(() => h.abort(), t);
    try {
      const b = await l(p, { signal: h.signal });
      if (!b.ok) throw new Error(`HTTP ${b.status}`);
      return await b.json();
    } finally {
      clearTimeout(g);
    }
  };
  return async (s, d) => {
    var g;
    const p = Da(s.vul), h = Ma(s.auction);
    try {
      if (s.phase === "auction") {
        const b = await i("/bid", {
          hand: Bt(Et(s, d)),
          seat: d,
          dealer: s.dealer,
          vul: p,
          ctx: h
        }), k = typeof b.bid == "string" ? b.bid : "", u = Fa(k);
        return Ke(s.auction, d).has(u) ? { call: u } : (r == null || r(`BEN answered "${k}" for ${d}, which is not legal here`), null);
      }
      if (s.phase === "play") {
        const b = Oa(s), k = ((g = s.contract) == null ? void 0 : g.declarer) ?? null, u = k ? za[k] : null, m = d === u && k ? k : d, N = b === "" ? await i("/lead", {
          hand: Bt(Et(s, d)),
          seat: d,
          dealer: s.dealer,
          vul: p,
          ctx: h
        }) : await i("/play", {
          hand: Bt(Et(s, m)),
          dummy: u ? Bt(Et(s, u)) : "",
          seat: m,
          dealer: s.dealer,
          vul: p,
          ctx: h,
          played: b
        }), $ = typeof N.card == "string" ? N.card : "", I = La($);
        return I ? It(s, d).some((y) => y.suit === I.suit && y.rank === I.rank) ? { card: I } : (r == null || r(`BEN's ${$} is not legal for ${d} here`), null) : (r == null || r(`BEN answered "${$}" for ${d}, which is not a card`), null);
      }
      return null;
    } catch (b) {
      return r == null || r(`BEN could not be reached (${b.message})`), null;
    }
  };
}
export {
  ja as BiddingDrill,
  pl as BridgeTable,
  Ua as ChallengeCreator,
  Ga as ChallengePlayer,
  Ya as DealDiagram,
  Be as MAX_BOARDS,
  it as MIN_BOARDS,
  Ea as buildSoloResults,
  Va as createBenDecider,
  yr as normalizeDraft,
  Nn as packFromDraft,
  Je as seededDeal,
  ha as validateDraft
};
//# sourceMappingURL=table-embed.js.map
