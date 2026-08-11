import { jsxs as d, jsx as n, Fragment as ye } from "react/jsx-runtime";
import { createContext as Xi, useContext as ji, useState as J, useRef as ne, useCallback as He, useLayoutEffect as wt, useEffect as me, useReducer as Ki, useMemo as ce } from "react";
function bt(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function wo(e) {
  return `${e.suit}${e.rank}`;
}
const Ie = ["S", "W", "N", "E"];
function yt(e) {
  return Ie[(Ie.indexOf(e) + 1) % 4];
}
function Yi(e) {
  return yt(yt(e));
}
function mr(e, t) {
  return e === t || Yi(e) === t;
}
const Ui = {
  none: "None",
  ns: "N-S",
  ew: "E-W",
  both: "Both"
};
function Gi(e, t) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const o = t === "N" || t === "S";
  return e === "ns" ? o : !o;
}
const Ji = { C: "♣", D: "♦", H: "♥", S: "♠" };
function Yt(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
function Vi(e) {
  const t = e.strain === "N" ? "NT" : Ji[e.strain], o = e.doubled === 1 ? " X" : e.doubled === 2 ? " XX" : "";
  return `${e.level}${t}${o} by ${e.declarer}`;
}
const xr = ["C", "D", "H", "S", "N"];
function No(e) {
  return Yt(e) ? (Number(e[0]) - 1) * 5 + xr.indexOf(e[1]) : -1;
}
function Fe(e, t) {
  const o = /* @__PURE__ */ new Set(["P"]);
  let r = -1;
  for (const l of e) r = Math.max(r, No(l.call));
  for (let l = 1; l <= 7; l++)
    for (const i of xr) {
      const s = `${l}${i}`;
      No(s) > r && o.add(s);
    }
  let a = null;
  for (let l = e.length - 1; l >= 0; l--)
    if (e[l].call !== "P") {
      a = e[l];
      break;
    }
  return a && !mr(a.seat, t) && (Yt(a.call) ? o.add("X") : a.call === "X" && o.add("XX")), o;
}
function Qi(e) {
  if (e.length < 4) return !1;
  const t = e.slice(-3);
  return t.length === 3 && t.every((o) => o.call === "P");
}
function qi(e) {
  let t = null, o = 0;
  for (const i of e)
    Yt(i.call) ? (t = i, o = 0) : i.call === "X" ? o = 1 : i.call === "XX" && (o = 2);
  if (!t) return null;
  const r = t.call[1], a = t.seat;
  let l = t.seat;
  for (const i of e)
    if (Yt(i.call) && i.call[1] === r && mr(i.seat, a)) {
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
const kr = (e) => e === "N" || e === "S" ? "NS" : "EW";
function Zi(e, t) {
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
    if (!Qi(b))
      return { ...e, auction: b, turn: yt(t.seat) };
    const g = qi(b);
    if (!g)
      return { ...e, auction: b, contract: null, phase: "complete" };
    const m = yt(g.declarer);
    return {
      ...e,
      auction: b,
      contract: g,
      phase: "play",
      turn: m,
      tricks: [{ leader: m, plays: [] }]
    };
  }
  const o = t.seat, r = {
    ...e.hands,
    [o]: e.hands[o].filter((b) => wo(b) !== wo(t.card))
  }, a = e.tricks.map((b) => ({ ...b, plays: [...b.plays] }));
  let l = a[a.length - 1];
  if ((!l || l.plays.length === 4) && (l = { leader: o, plays: [] }, a.push(l)), l.plays.push({ seat: o, card: t.card }), l.plays.length < 4)
    return { ...e, hands: r, tricks: a, turn: yt(o) };
  const i = e.contract ? e.contract.strain : "N", s = Zi(l, i);
  l.winner = s;
  const c = kr(s), u = { ...e.trickCount, [c]: e.trickCount[c] + 1 }, p = r.N.length === 0 && r.E.length === 0 && r.S.length === 0 && r.W.length === 0;
  return {
    ...e,
    hands: r,
    tricks: a,
    trickCount: u,
    turn: s,
    phase: p ? "complete" : "play"
  };
}
const $o = { C: 20, D: 20, H: 30, S: 30 };
function Sr(e) {
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
  const o = kr(t.declarer), r = e.trickCount[o], a = 6 + t.level, l = r - a, i = l >= 0, s = Gi(e.vul, t.declarer), c = t.doubled, u = c === 2 ? 4 : c === 1 ? 2 : 1;
  let p = 0, b = 0, g = 0, m = 0, h = 0, y = 0, N = 0;
  if (i) {
    p = t.strain === "N" ? (40 + (t.level - 1) * 30) * u : $o[t.strain] * t.level * u;
    const I = c === 0 ? t.strain === "N" ? 30 : $o[t.strain] : (s ? 200 : 100) * (c === 2 ? 2 : 1);
    b = l * I, p >= 100 ? g = s ? 500 : 300 : m = 50, t.level === 6 && (h = s ? 750 : 500), t.level === 7 && (h = s ? 1500 : 1e3), c > 0 && (y = 50 * c);
  } else {
    const I = -l;
    if (c === 0)
      N = I * (s ? 100 : 50);
    else {
      let _ = 0;
      for (let S = 1; S <= I; S++)
        S === 1 ? _ += s ? 200 : 100 : S <= 3 ? _ += s ? 300 : 200 : _ += 300;
      N = _ * (c === 2 ? 2 : 1);
    }
  }
  const $ = i ? p + b + g + m + h + y : -N;
  return {
    contract: t,
    tricksTaken: r,
    result: l,
    made: i,
    vulnerable: s,
    trickScore: p,
    overtrickScore: b,
    gameBonus: g,
    partscoreBonus: m,
    slamBonus: h,
    insultBonus: y,
    penalty: N,
    declarerScore: $,
    nsScore: o === "NS" ? $ : -$
  };
}
function vr(e) {
  if (!e.contract) return "Passed out";
  const t = e.contract, o = t.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[t.strain], r = t.doubled === 1 ? " X" : t.doubled === 2 ? " XX" : "", a = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${t.level}${o}${r} by ${t.declarer}, ${a}`;
}
function el(e) {
  let t = e >>> 0;
  return () => {
    t |= 0, t = t + 1831565813 | 0;
    let o = Math.imul(t ^ t >>> 15, 1 | t);
    return o = o + Math.imul(o ^ o >>> 7, 61 | o) ^ o, ((o ^ o >>> 14) >>> 0) / 4294967296;
  };
}
function Ve(e) {
  const t = el(e), r = ["S", "H", "D", "C"].flatMap(
    (l) => Array.from({ length: 13 }, (i, s) => ({ suit: l, rank: s + 2 }))
  );
  for (let l = r.length - 1; l > 0; l--) {
    const i = Math.floor(t() * (l + 1));
    [r[l], r[i]] = [r[i], r[l]];
  }
  const a = { N: [], E: [], S: [], W: [] };
  return r.forEach((l, i) => a[Ie[i % 4]].push(l)), a;
}
const tl = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, nl = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, ol = { skin: "bbo" }, rl = {
  skins: tl,
  strainTint: nl,
  defaults: ol
}, Jn = rl, Co = Jn.skins, Sn = Jn.strainTint, il = {
  skin: Jn.defaults.skin
};
function wr(e, t = {}) {
  const o = Co[e] ?? Co[il.skin], r = (l) => {
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
const ll = ["N", "S", "H", "D", "C"], Nr = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, Ln = [1, 2, 3, 4, 5, 6, 7], Gt = 2, $r = 2, al = 46;
function Cr(e) {
  const t = Math.min(1, e / al);
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
const sl = (e) => Cr(e).btnH + $r * 2, dl = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${Nr[e[1] ?? "N"] ?? ""}`;
function cl(e = 46, { pending: t = !1, minCellH: o = 0 } = {}) {
  const r = Math.round(e * 0.13), a = Math.round(e * 0.11), l = Math.max(Math.round(e * 0.92), o), i = Ln.length * l + (Ln.length - 1) * r + a * 2 + Gt * 2, s = l + Gt * 2;
  return (t ? sl(e) + r : 0) + i + r + s;
}
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
  const u = Math.round(e * 0.13), p = Math.round(e * 0.11), b = e, g = Math.max(Math.round(e * 0.92), t), m = Math.round(e * 3.4), h = Math.round(e * 0.62), y = Math.round(e * 0.42), N = new Set(r), $ = l != null, I = Cr(e), _ = (H, x) => {
    const X = `${x}${H}`, M = Sn[H], k = N.has(X), T = a && !$ && k;
    return /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: T ? () => i(X) : void 0,
        "aria-label": `${x}${H === "N" ? "NT" : H}`,
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
          color: M.ink,
          lineHeight: 1,
          cursor: T ? "pointer" : "default",
          opacity: k ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: h, fontWeight: 700, lineHeight: 1 }, children: x }),
          /* @__PURE__ */ n("span", { style: { fontSize: y, fontWeight: 700, lineHeight: 1 }, children: Nr[H] })
        ]
      },
      X
    );
  }, S = (H, x, X, M, k, T) => {
    const R = N.has(H), j = a && !$ && R;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: j ? () => i(H) : void 0,
        "aria-label": H === "P" ? "Pass" : H === "X" ? "Double" : "Redouble",
        style: {
          width: X,
          height: g,
          background: M,
          border: `${Gt}px solid ${k}`,
          borderRadius: o,
          color: "#fff",
          fontWeight: 700,
          fontSize: h,
          lineHeight: 1,
          cursor: j ? "pointer" : "default",
          opacity: R ? 1 : 0.3,
          ...T
        },
        children: x
      },
      H
    );
  };
  return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: u }, children: [
    l != null && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: I.gap, padding: `${$r}px 0` }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: I.callFont, fontWeight: 700, color: "#12281f", whiteSpace: "nowrap" }, children: dl(l) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: s,
          style: { height: I.btnH, padding: `0 ${I.padX}px`, border: "1px solid #0c4b0b", borderRadius: o, background: "#116710", color: "#fff", fontSize: I.btnFont, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" },
          children: "Confirm"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: c,
          style: { height: I.btnH, padding: `0 ${I.padX}px`, border: "1px solid #5e1c1c", borderRadius: o, background: "#8a3030", color: "#fff", fontSize: I.btnFont, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: u }, children: ll.map((H) => /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: u,
          padding: p,
          background: Sn[H].bg,
          border: `${Gt}px solid ${Sn[H].edge}`,
          borderRadius: o
        },
        children: Ln.map((x) => _(H, x))
      },
      H
    )) }),
    /* @__PURE__ */ d("div", { style: { display: "flex", gap: u }, children: [
      S("P", "Pass", m, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      S("X", "X", b, "#7a5b3a", "#5e4227"),
      S("XX", "XX", b, "#2b6b73", "#1c4d53", { fontSize: Math.round(h * 0.78) })
    ] })
  ] });
}
const fl = {
  LinkComponent: "a",
  navigate: (e, { replace: t }) => {
    typeof window > "u" || (t ? window.location.replace(e) : window.location.assign(e));
  }
}, hl = Xi(fl);
function Br() {
  return ji(hl);
}
const Fn = "#384bb3", Bo = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: Fn, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, Eo = 48;
function tt({
  side: e,
  items: t,
  thickness: o = 44,
  condensed: r = !1,
  scale: a,
  minTouch: l = 30,
  bg: i = "rgba(9,22,17,.90)",
  accent: s = Fn
}) {
  const [c, u] = J(99), [p, b] = J(99), [g, m] = J(!1), h = ne(null), y = ne(null), N = ne(null), $ = ne(() => {
  }), I = s === Fn ? Bo : { ...Bo, accent: { bg: s, border: s, color: "#fff" } }, _ = o, S = Math.min(
    Math.round(_ * 2.2),
    Math.max(
      Math.round(_ * 0.68),
      _ - 14,
      a ? Math.ceil(l / Math.max(0.05, a)) : 0
    )
  ), { LinkComponent: H } = Br(), x = r ? 5 : 7, X = Math.round(S * (r ? 0.17 : 0.4)), M = Math.max(r ? 11 : 13, Math.round(S * (r ? 0.28 : 0.4))), k = Math.round(S * 0.86), T = Math.max(9, Math.round(S * 0.26));
  let R = -1;
  t.forEach((v, W) => {
    v.kind === "spacer" && (R = W);
  });
  const j = R < 0 ? t : t.slice(0, R), B = R < 0 ? [] : t.slice(R + 1), q = j.length, P = B.length, te = Math.max(0, Math.min(c, q)), z = Math.max(1, Math.min(p, P)), U = B.slice(B.length - z), D = j.slice(te).concat(B.slice(0, B.length - z)).filter((v) => v.kind !== "divider"), w = D.length > 0, O = g && w, F = He(() => {
    const v = h.current;
    if (!v) return;
    const W = Math.min(c, q), A = v.clientWidth;
    if (A > 0) {
      if (v.scrollWidth > A + 1) {
        const C = parseFloat(getComputedStyle(v).gap) || 0;
        let Y = 0, V = 0;
        for (const oe of Array.from(v.children))
          if (Y += oe.offsetWidth + (V ? C : 0), Y <= A) V++;
          else break;
        V < W && u(V);
        return;
      }
      if (A - v.scrollWidth > Eo && W < q) {
        u(W + 1);
        return;
      }
      if (W !== c) {
        u(W);
        return;
      }
    }
    const L = y.current;
    if (!L) return;
    const Z = Math.min(p, P);
    W === 0 && L.scrollWidth > L.clientWidth + 1 && Z > 1 ? b(Z - 1) : L.clientWidth - L.scrollWidth > Eo && Z < P ? b(Z + 1) : Z !== p && b(Z);
  }, [c, p, q, P]);
  wt(() => {
    $.current = F, F();
  }), me(() => {
    const v = (W) => {
      y.current && !y.current.contains(W.target) && m(!1);
    };
    return document.addEventListener("mousedown", v), () => {
      document.removeEventListener("mousedown", v), N.current && N.current.disconnect();
    };
  }, []);
  const ee = He((v) => {
    N.current && (N.current.disconnect(), N.current = null), h.current = v, y.current = v ? v.parentElement : null, v && (typeof ResizeObserver == "function" && (N.current = new ResizeObserver(() => $.current()), N.current.observe(v)), $.current());
  }, []), K = (v, W) => {
    if (v.kind === "spacer") return null;
    if (v.kind === "node")
      return /* @__PURE__ */ n("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: x }, children: v.node }, W);
    if (v.kind === "divider")
      return /* @__PURE__ */ n("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, W);
    if (v.kind === "chip")
      return /* @__PURE__ */ d("div", { title: v.title ?? v.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: k, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: T, fontWeight: r ? 700 : 400, letterSpacing: ".09em", textTransform: "uppercase", color: r ? "#a3b7ae" : "#8fa39a" }, children: v.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: M, fontWeight: r ? 800 : 700, lineHeight: 1, color: v.color ?? "#eef4f1" }, children: v.value })
      ] }, W);
    const A = I[v.tone ?? "plain"], L = v.disabled === !0, Z = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: v.kind === "icon" ? S : void 0,
      height: S,
      padding: v.kind === "icon" ? 0 : `0 ${X}px`,
      border: `1px solid ${A.border}`,
      borderRadius: 6,
      background: A.bg,
      color: A.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: M,
      fontWeight: v.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: L || !v.on && !v.href ? "default" : "pointer",
      opacity: L ? 0.42 : 1
    };
    return v.href && !L ? /* @__PURE__ */ n(H, { href: v.href, title: v.title ?? v.label, "aria-label": v.ariaLabel, style: Z, children: v.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: v.title ?? v.label, "aria-label": v.ariaLabel, disabled: L, onClick: L ? void 0 : v.on ?? void 0, style: Z, children: v.label }, W);
  }, fe = (v, W) => {
    if (v.kind === "divider" || v.kind === "spacer") return null;
    if (v.kind === "chip")
      return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: v.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: v.color ?? "#eef4f1" }, children: v.value })
      ] }, W);
    if (v.kind === "node")
      return /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: v.node }, W);
    const A = I[v.tone ?? "plain"], L = v.disabled === !0, Z = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: S,
      marginBottom: 4,
      padding: `0 ${X}px`,
      border: `1px solid ${A.border}`,
      borderRadius: 6,
      background: A.bg,
      color: A.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: M,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: L || !v.on && !v.href ? "default" : "pointer",
      opacity: L ? 0.42 : 1
    }, C = () => m(!1);
    return v.href && !L ? /* @__PURE__ */ n(H, { href: v.href, title: v.title ?? v.label, "aria-label": v.ariaLabel, style: Z, onClick: C, children: v.label }, W) : /* @__PURE__ */ n("button", { type: "button", title: v.title ?? v.label, "aria-label": v.ariaLabel, disabled: L, onClick: L ? void 0 : () => {
      var Y;
      (Y = v.on) == null || Y.call(v), C();
    }, style: Z, children: v.label }, W);
  }, le = Math.max(_, S + 14), ie = {
    position: "absolute",
    ...e === "bottom" ? { bottom: S + 12 } : { top: S + 12 },
    right: 0,
    zIndex: 40,
    minWidth: Math.round(S * 4.2),
    maxHeight: Math.round(S * 7),
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
      style: { width: "100%", [r ? "height" : "minHeight"]: le, flex: "none", display: "flex", alignItems: "center", gap: x, padding: `6px ${r ? 8 : 10}px`, background: i, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ n(
          "div",
          {
            ref: ee,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: x, ...r ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: j.slice(0, te).map(K)
          }
        ),
        w && /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: () => m((v) => !v),
              title: `${D.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: S, padding: `0 ${X}px`, border: `1px solid ${O ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: O ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: M, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ n("span", { children: "⋯" }),
                /* @__PURE__ */ n("span", { style: { fontSize: T, opacity: 0.8 }, children: D.length })
              ]
            }
          ),
          O && /* @__PURE__ */ n("div", { style: ie, children: D.map(fe) })
        ] }),
        U.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: x }, children: U.map(K) })
      ]
    }
  );
}
function Ro({
  title: e = "Table settings",
  accent: t = "#384bb3",
  items: o,
  onClose: r
}) {
  const { navigate: a } = Br(), l = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, i = (s) => /* @__PURE__ */ d(ye, { children: [
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
const Be = "#cc0000", vn = "#fecd07", Er = "#d3d3d3", To = "#f2e2b8", ul = "#b8901f", Rr = "#12525e", ve = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, ft = ["C", "D", "H", "S", "N"], wn = ["W", "N", "E", "S"], Jt = ["S", "H", "C", "D"], pl = { N: "S", S: "N", E: "W", W: "E" }, Re = (e) => e === "H" || e === "D", We = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), gl = (e) => /^[1-7][CDHSN]$/.test(e), Pn = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${ve[e[1] ?? ""] ?? ""}`, Tr = (e) => gl(e) && Re(e[1] ?? "") ? Be : "#000", bl = (e) => e === "N" || e === "S" ? "NS" : "EW", yl = `
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
`, Wo = "btu-lift", ml = "btu-deal";
function _n() {
  return /* @__PURE__ */ n("style", { href: "bridge-table-ui-motion", precedence: "default", children: yl });
}
function Nn({
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
    (B, q) => Jt.indexOf(B.suit) - Jt.indexOf(q.suit) || q.rank - B.rank
  ), g = t.weight ?? 700, m = t.weight ?? 400;
  if (o === "row")
    return /* @__PURE__ */ d("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: [
      /* @__PURE__ */ n(_n, {}),
      b.map((B, q) => {
        const P = u ? u(B) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: P ? () => p == null ? void 0 : p(B) : void 0,
            "aria-label": `Play ${We(B.rank)}${ve[B.suit]}`,
            className: Wo,
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
            children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: t.inset, top: t.inset > 3 ? t.inset : 1, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: Re(B.suit) ? Be : "#000" }, children: [
              /* @__PURE__ */ n("span", { style: { fontSize: t.rank, fontWeight: g }, children: We(B.rank) }),
              /* @__PURE__ */ n("span", { style: { fontSize: t.glyph, fontWeight: m }, children: ve[B.suit] })
            ] })
          },
          `${B.suit}${B.rank}`
        );
      })
    ] });
  const h = b.length, y = t.w, N = t.h, $ = a, I = l > 0 ? l : Math.round(N * 4.2), _ = (B) => h <= 1 ? 0 : -$ / 2 + B * ($ / (h - 1));
  let S = 0, H = 0, x = 0, X = 0;
  for (let B = 0; B < h; B++) {
    const q = _(B) * Math.PI / 180, P = Math.cos(q), te = Math.sin(q);
    for (const z of [-y / 2, y / 2])
      for (const U of [-I, -I + N]) {
        const D = z * P - U * te, w = z * te + U * P;
        D < S && (S = D), D > H && (H = D), w < x && (x = w), w > X && (X = w);
      }
  }
  const M = Math.ceil(Math.max(-S, H) * 2) + 4, k = Math.ceil(X - x) + 4, T = Math.ceil(-x - I) + 2, R = t.rank, j = t.glyph;
  return /* @__PURE__ */ d("div", { style: { position: "relative", width: M, height: k }, children: [
    /* @__PURE__ */ n(_n, {}),
    b.map((B, q) => {
      const P = u ? u(B) : !1;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: P ? () => p == null ? void 0 : p(B) : void 0,
          "aria-label": `Play ${We(B.rank)}${ve[B.suit]}`,
          className: Wo,
          style: {
            position: "absolute",
            left: "50%",
            top: T,
            width: y,
            height: N,
            padding: 0,
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: 4,
            boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
            transform: `translateX(-50%) rotate(${_(q)}deg)${P ? " translateY(-14px)" : ""}`,
            transformOrigin: `50% ${I}px`,
            zIndex: P ? 2 : 1,
            cursor: P ? "pointer" : "default"
          },
          children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: t.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 0.95, color: Re(B.suit) ? Be : "#000" }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: R, fontWeight: g }, children: We(B.rank) }),
            /* @__PURE__ */ n("span", { style: { fontSize: j, fontWeight: m }, children: ve[B.suit] })
          ] })
        },
        `${B.suit}${B.rank}`
      );
    })
  ] });
}
function xl({
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
  return /* @__PURE__ */ d("div", { "data-testid": "seat-plate", "data-seat": e, style: { display: "flex", alignItems: "stretch", gap: 5, width: l, height: c, padding: "0 3px 0 0", background: a, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${i ? ul : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { flex: "none", width: 6, background: r ?? "transparent" } }),
    /* @__PURE__ */ n("span", { style: { flex: "none", width: u, height: u, alignSelf: "center", background: Rr, color: "#fff", fontSize: p - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
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
  return /* @__PURE__ */ n("div", { style: { width: o, background: i ? t : "#fff", border: i ? 0 : "1px solid #8a8a8a", borderRadius: i ? 0 : 3, padding: l ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: Jt.map((g) => {
    const m = e.filter((h) => h.suit === g).sort((h, y) => y.rank - h.rank);
    return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: Re(g) ? Be : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", width: r ?? 16, fontSize: p }, children: ve[g] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", gap: b ? "0 4px" : "0 5px", fontSize: p }, children: m.length === 0 ? /* @__PURE__ */ n("span", { children: "—" }) : m.map((h) => {
        const y = c ? c(h) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: y ? () => u == null ? void 0 : u(h) : void 0,
            "aria-label": `Play ${We(h.rank)}${ve[g]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: b ? 84 : 0, minHeight: b ? 78 : 0, background: y ? "#d9f2d9" : "transparent", border: 0, borderRadius: b ? 6 : 0, padding: b ? "0 4px" : "0 1px", fontSize: p, fontWeight: y ? 700 : 400, color: "inherit", cursor: y ? "pointer" : "default" },
            children: We(h.rank)
          },
          h.rank
        );
      }) })
    ] }, g);
  }) });
}
const Wr = 3, Ar = 3;
function Ir(e, t) {
  return e * t + Math.max(0, e - 1) * Wr + Ar * 2;
}
function Hr({
  bg: e,
  m: t = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: o,
  rows: r,
  dealerCol: a,
  emptyText: l = null
}) {
  const i = ne(null);
  wt(() => {
    const u = i.current;
    u && (u.scrollTop = u.scrollHeight);
  }, [r.length]);
  const s = t.cellMinH ?? Math.round(t.cellFont * 1.15) + 4, c = t.rowsVisible != null && t.rowsVisible > 0 ? { flex: "0 1 auto", height: Ir(t.rowsVisible, s), minHeight: 0, boxSizing: "border-box" } : { flex: 1, minHeight: 0 };
  return /* @__PURE__ */ d("div", { style: { width: t.width, height: t.height, maxHeight: t.maxH ?? (t.height === "auto" ? 340 : void 0), background: e, borderRadius: t.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: o.map((u) => /* @__PURE__ */ d("span", { style: { padding: "2px 0", fontSize: t.headFont, fontWeight: 700, lineHeight: 1.1, background: u.vul ? "#cc1111" : u.isDealer ? To : "#fff", color: u.vul ? "#fff" : "#000" }, children: [
      u.seat,
      u.isDealer ? " •" : ""
    ] }, u.seat)) }),
    /* @__PURE__ */ d("div", { ref: i, "data-testid": "auction-rows", style: { ...c, overflowY: "auto", padding: `${Ar}px 5px`, display: "flex", flexDirection: "column", gap: Wr }, children: [
      r.map((u, p) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((b) => {
        const g = u[b];
        return /* @__PURE__ */ n("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: t.cellMinH ?? 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.cellFont, lineHeight: 1.15, background: g ? b === a ? To : Er : "transparent", color: g ? Tr(g.call) : "#000" }, children: g ? Pn(g.call) : "" }, b);
      }) }, p)),
      l != null && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: l })
    ] })
  ] });
}
const Vn = { w: 56, h: 80 }, kl = (e) => Math.round(e * 0.7);
function Qn(e = Vn) {
  return { w: e.w * 2, h: e.h * 2 };
}
Qn(Vn);
const Sl = (e) => {
  const t = Math.round(e.w / 2), o = kl(e.h);
  return {
    N: { left: t, top: 0 },
    W: { left: 0, top: o },
    E: { left: e.w, top: o },
    S: { left: t, top: e.h }
  };
}, vl = ["N", "W", "E", "S"];
function $n({
  plays: e,
  turn: t,
  scale: o = 1,
  variant: r = "cross",
  card: a = Vn,
  index: l = { rank: 38, glyph: 30 }
}) {
  if (r === "pill")
    return /* @__PURE__ */ n("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((s) => {
      const c = e.find((p) => p.seat === s), u = s === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : s === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : s === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return c ? /* @__PURE__ */ d("div", { style: { position: "absolute", ...u, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: Re(c.card.suit) ? Be : "#000" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: ve[c.card.suit] }),
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: We(c.card.rank) })
      ] }, s) : null;
    }) });
  if (r === "cluster") {
    const s = Qn(a), c = Sl(a), u = Math.floor((a.w - 11) / 1.12);
    return /* @__PURE__ */ d("div", { style: { width: s.w * o, height: s.h * o, display: "flex", alignItems: "center", justifyContent: "center" }, children: [
      /* @__PURE__ */ n(_n, {}),
      /* @__PURE__ */ n("div", { style: { position: "relative", width: s.w, height: s.h, flex: "none", transform: `scale(${o})`, transformOrigin: "center center" }, children: vl.map((p, b) => {
        const g = e.find((N) => N.seat === p), m = c[p], h = p === t, y = g ? We(g.card.rank) : "";
        return /* @__PURE__ */ n("div", { style: { position: "absolute", left: m.left, top: m.top, zIndex: b + 1 }, children: g ? (
          // Keyed on the card so a NEW card mounts (and deals in); a
          // re-render of the same card must not replay the animation.
          /* @__PURE__ */ n(
            "span",
            {
              "data-testid": "trick-card",
              "data-seat": p,
              className: ml,
              style: { position: "relative", display: "block", width: a.w, height: a.h, background: "#fff", border: "1.5px solid #4a4a4a", borderRadius: 4, boxShadow: "0 3px 7px rgba(0,0,0,.45)", boxSizing: "border-box" },
              children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.88, color: Re(g.card.suit) ? Be : "#000" }, children: [
                /* @__PURE__ */ n("span", { style: { fontSize: y.length > 1 ? Math.min(l.rank, u) : l.rank, fontWeight: 800, letterSpacing: "-.02em" }, children: y }),
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
    return /* @__PURE__ */ n("div", { style: { position: "absolute", left: u.left, top: u.top, transform: u.tr, zIndex: c ? 2 : 1 }, children: c ? /* @__PURE__ */ n("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: Re(c.card.suit) ? Be : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 27, fontWeight: 700 }, children: We(c.card.rank) }),
      /* @__PURE__ */ n("span", { style: { fontSize: 24 }, children: ve[c.card.suit] })
    ] }) }) : /* @__PURE__ */ n("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: p ? 22 : 0, height: 12, background: p ? "#9a9a9a" : "transparent" } }) }) }, s);
  }) }) });
}
function qn({
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
function wl({ onClose: e, children: t }) {
  return /* @__PURE__ */ n("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ d("div", { onClick: (o) => o.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ n("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    t
  ] }) });
}
const Nl = "#384bb3", $l = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function Cl({
  title: e = "Coach",
  status: t = "",
  accent: o = Nl,
  lines: r,
  actions: a
}) {
  const l = (r && r.length ? r : []).map(
    (c) => typeof c == "string" ? { text: c, color: "#28312c" } : { text: c.text ?? "", color: c.color ?? "#28312c" }
  ), i = l.length === 0, s = a && a.length ? a : [];
  return /* @__PURE__ */ d("div", { "data-testid": "coach-panel", style: $l, children: [
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
}, Bl = ue.w - (ue.overlap ?? 1), zr = { w: ue.w, h: ue.h }, El = { rank: ue.rank, glyph: ue.glyph }, Mr = Qn(zr), Rl = 260, Cn = 52, Tl = 44, Ao = 54, Wl = 136, Al = 10, Il = 22, Io = { row: Al + ue.h + 3 + Il + 9, fan: 238 }, Bn = 2, Ho = 40, Hl = 36, zo = 19, zl = 0.22, Ml = 4, Dr = 52, Dl = 37, Ol = Dl + Ir(2, Dr), Ll = Math.round(Mr.h * 0.7) + 16, Fl = 200, Pl = 900, Mo = 150, _l = (e) => Math.ceil(24 / (e || 1)), Xl = 0, Do = (e) => Math.round(e * 8.8), jl = 24, Oo = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, Kl = {
  ...wr("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, Yl = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function Ul({ children: e }) {
  const t = ne(null), o = ne(null), [r, a] = J(1);
  return wt(() => {
    const l = () => {
      const s = t.current, c = o.current;
      if (!s || !c) return;
      const u = s.clientWidth, p = s.clientHeight, b = c.offsetWidth, g = c.offsetHeight;
      if (!u || !p || !b || !g) return;
      const m = Math.min(1, u / b, p / g);
      a((h) => Math.abs(m - h) > 5e-3 ? m : h);
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
function Gl({
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
  resultLine: m = "",
  resultScore: h = "",
  resultDetail: y,
  onCall: N,
  onPlay: $,
  onMenu: I,
  onScoring: _,
  onClaim: S,
  controlsExtra: H,
  controlsExtraNarrow: x,
  railExtra: X,
  settings: M,
  viewHref: k,
  appearance: T,
  showToolbars: R = !0,
  showCoach: j = !0,
  coachShare: B = 30,
  coachTitle: q = "Coach",
  coachLines: P,
  coachActions: te
}) {
  var So;
  const z = T ?? Kl, U = z.handLayout === "fan", D = z.bidPad === "columns", w = z.centreFrame, O = w ? Yl : {}, F = Number.parseInt(z.radius, 10) || 5, ee = ne(null), [K, fe] = J({ w: ht.w, h: ht.h });
  wt(() => {
    const f = ee.current;
    if (!f) return;
    const E = () => fe({ w: f.clientWidth || ht.w, h: f.clientHeight || ht.h });
    E();
    const G = new ResizeObserver(E);
    return G.observe(f), () => G.disconnect();
  }, []);
  const [le, ie] = J(null), [v, W] = J(null);
  me(() => {
    ie(null), W(null);
  }, [e.auction.length]);
  const [A, L] = J(!1), Z = I ?? (M ? () => L((f) => !f) : void 0), C = [...M ?? []], [Y, V] = J(!1), oe = K.w / Math.max(1, K.h) < 1.25, re = oe && K.w < 640, Qe = oe && !re, we = Qe ? { w: It, h: 1268 } : ht, he = e.contract, qe = (he == null ? void 0 : he.declarer) ?? null, xe = qe && e.phase !== "auction" ? pl[qe] : null, ke = e.phase === "auction", ze = e.phase === "play", _e = e.phase === "complete", Me = new Set(a), li = new Set(l.map((f) => `${f.suit}${f.rank}`)), Ne = ke && i && !v, ai = (f) => e.vul === "both" || e.vul === "All" || bl(f).toLowerCase() === String(e.vul).toLowerCase(), si = wn.indexOf(e.dealer), di = j !== !1, tn = Math.max(0, Math.min(55, B ?? 30)), eo = 100 - tn, to = ze || _e, ci = qe ? !!t[qe].human : !1, nn = to && !!xe && xe !== "S" && ci, on = to && !!xe && xe !== "S" && !nn, fi = D && ke, rn = Math.min(1, K.w / It), Ct = Math.max(240, K.h * (eo / 100) || 590), hi = (f) => {
    const E = Math.max(Cn, Math.ceil(Tl / (f || 1)) + 14);
    return Math.min(E, Math.max(Cn, Math.round(0.13 * Ct / (f || 1))));
  }, no = (f) => {
    const E = Math.max(Ho, Math.ceil(Hl / (f || 1))), G = zl * Ct / (f || 1) - zo;
    return Math.min(E, Math.max(Ho, Math.floor(G / Bn)));
  }, ui = (f) => Bn * no(f) + zo, oo = _e ? Fl : ke ? Ol : Ll, ro = (f, E) => {
    const G = Ct / (f || 1), Q = Xl + _l(f) + (on ? Ao : 0) + (nn ? Io.row : 0) + (!E && ke ? ui(f) : 0) + Io[U ? "fan" : "row"], se = hi(f), Ee = E ? 0 : Q + 2 * se + oo - G, ct = Ee > 0 ? Math.max(Cn, se - Math.ceil(Ee / 2)) : se, Tt = Q + 2 * ct;
    let Wt = 0, At;
    E ? (Wt = Math.max(30, Math.min(62, Math.floor((G - Tt - Mo) / 8.3))), At = Math.max(Mo, Math.round(G - Tt - Do(Wt)))) : At = Math.max(oo, Math.min(Pl, Math.round(G - Tt)));
    const vo = Tt + (E ? Do(Wt) : 0) + At - (R ? 0 : 2 * ct) - (on ? Ao : 0);
    return { bar: ct, cell: Wt, centre: At, content: vo, usePad: E, trayRow: no(f), scale: Math.min(1, rn, Ct / vo) };
  }, io = (f) => {
    let E = ro(rn, f);
    for (let G = 0; G < 10 && E.scale < rn - 5e-4; G++) {
      const Q = ro(E.scale, f);
      if (Math.abs(Q.scale - E.scale) < 5e-4) {
        E = Q;
        break;
      }
      E = Q;
    }
    return E;
  };
  let Se = io(fi);
  Se.usePad && Se.cell * Se.scale < jl && (Se = io(!1));
  const pi = Se.usePad, gi = Se.usePad ? Se.cell : 38, ln = Se.centre, bi = Math.max(0.7, Math.min(1, (ln - 16) / Mr.h)), an = Math.min(K.w / we.w, K.h / we.h) || 1, Xe = re ? Se.scale : an, yi = re ? It : Math.max(we.w, K.w / an), sn = re ? Se.content : Math.max(we.h, K.h / an), mi = re ? -Math.round(Se.content * (1 - Se.scale)) : 0, xi = (f) => t[f].human ? vn : !_e && f === e.turn ? "#e8e8c8" : Er, ki = (f) => f === xe || !_e && f === e.turn ? "#fff" : "#b3b3b3", je = (f) => {
    Ne && (p ? W(f) : N == null || N(f));
  }, lo = () => {
    if (v == null) return;
    const f = v;
    W(null), N == null || N(f);
  }, ao = () => {
    W(null), ie(null);
  }, dn = (f) => (E) => i && ze && e.turn === f && li.has(`${E.suit}${E.rank}`), Bt = (f, E = { w: 14, h: 71 }) => /* @__PURE__ */ n(Nn, { cards: e.hands[f], hidden: !0, metrics: Oo, layout: "row", fanSpread: z.fanSpread, fanRadius: z.fanRadius, backColor: z.cardBack, backMetrics: E }), Ze = (f, E, G = {}) => /* @__PURE__ */ n(xl, { seat: f, name: t[f].name, tag: t[f].tag, strip: t[f].strip, bg: xi(f), width: E, isDealer: f === e.dealer, metrics: G }), Ke = (f, E = 16) => {
    if (!ke || u !== "seats") return null;
    const G = e.auction.filter((Q) => Q.seat === f);
    return G.length ? /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: G.map((Q, se) => {
      const Ee = se === G.length - 1;
      return /* @__PURE__ */ n("span", { style: { background: Ee ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: E, fontWeight: Ee ? 700 : 400, padding: "0 5px", color: Tr(Q.call) }, children: Pn(Q.call) }, se);
    }) }) : null;
  }, cn = (f, E = Oo) => /* @__PURE__ */ n(
    Nn,
    {
      cards: e.hands[f],
      metrics: E,
      layout: "row",
      fanSpread: z.fanSpread,
      fanRadius: z.fanRadius,
      backColor: z.cardBack,
      isPlayable: dn(f),
      onPlay: (G) => $ == null ? void 0 : $(f, G)
    }
  ), Et = (f, E = { width: 197 }) => /* @__PURE__ */ n(
    Nt,
    {
      cards: e.hands[f],
      panelBg: ki(f),
      width: E.width,
      suitW: E.suitW,
      font: E.font,
      pad: E.pad,
      bare: E.bare,
      touch: !!E.touch && i && ze && e.turn === f,
      isPlayable: dn(f),
      onPlay: (G) => $ == null ? void 0 : $(f, G)
    }
  ), fn = (f, E) => {
    const G = E ?? {
      w: z.cardW,
      h: Math.round(z.cardW * 1.42),
      rank: Math.round(z.cardW * 0.46),
      glyph: Math.round(z.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ n(
      Nn,
      {
        cards: e.hands[f],
        metrics: G,
        layout: "fan",
        fanSpread: z.fanSpread,
        fanRadius: z.fanRadius,
        backColor: z.cardBack,
        isPlayable: dn(f),
        onPlay: (Q) => $ == null ? void 0 : $(f, Q)
      }
    );
  }, so = (f) => {
    const E = U && o[f];
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      Ke(f),
      o[f] ? E ? fn(f) : cn(f) : Bt(f),
      Ze(f, E ? 197 : o[f] ? 50 + Math.max(0, e.hands[f].length - 1) * 49 : 197)
    ] });
  }, co = (f) => /* @__PURE__ */ d("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    Ke(f),
    o[f] ? Et(f, { width: 197 }) : Bt(f),
    Ze(f, 197)
  ] }), fo = [];
  {
    const f = [
      ...Array.from({ length: wn.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let E = 0; E < f.length; E += 4) fo.push(f.slice(E, E + 4));
  }
  const hn = (f = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ n(
    Hr,
    {
      bg: z.auctionBg,
      m: f,
      heads: wn.map((E) => ({ seat: E, vul: ai(E), isDealer: E === e.dealer })),
      rows: fo,
      dealerCol: si,
      emptyText: e.auction.length === 0 ? e.dealer === r ? "You deal" : `${e.dealer} deals` : null
    }
  ), un = ze ? ((So = e.tricks[e.tricks.length - 1]) == null ? void 0 : So.plays) ?? [] : [], Si = (f = 1) => /* @__PURE__ */ n($n, { plays: un, turn: e.turn, scale: f }), vi = (f) => /* @__PURE__ */ n($n, { variant: "cluster", plays: un, turn: e.turn, scale: f, card: zr, index: El }), pn = /* @__PURE__ */ n(
    qn,
    {
      line: m,
      score: h,
      detail: y ?? `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: b,
      actionNote: g,
      accent: z.accent
    }
  ), wi = /* @__PURE__ */ n($n, { variant: "pill", plays: un, turn: e.turn }), gn = (f, E, G, Q, se, Ee = 21) => ({
    flex: "none",
    width: f,
    height: E,
    border: `1px solid ${Q}`,
    borderRadius: F,
    background: G,
    color: "#fff",
    fontSize: Ee,
    fontWeight: 700,
    lineHeight: 1,
    cursor: se ? "pointer" : "default",
    opacity: se ? 1 : 0.42
  }), ho = (f, E) => /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        onClick: lo,
        style: gn(240, f, "#116710", "#0c4b0b", !0, E),
        children: [
          "Confirm ",
          Pn(v ?? "")
        ]
      }
    ),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: ao,
        style: gn(120, f, "#8a3030", "#5e1c1c", !0, E),
        children: "Cancel"
      }
    )
  ] }), Ni = (f, E, G) => [1, 2, 3, 4, 5, 6, 7].map((Q) => {
    const se = ft.some((ct) => Me.has(`${Q}${ct}`)), Ee = Ne && se;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: Ee ? () => ie(le === Q ? null : Q) : void 0,
        "aria-label": `Level ${Q}`,
        style: { flex: "none", width: f, height: E, border: "1px solid #8a8a6a", borderRadius: F, background: le === Q ? vn : "#f8f8f8", color: "#000", fontSize: G, lineHeight: 1, cursor: Ee ? "pointer" : "default", opacity: Ee ? 1 : 0.42 },
        children: Q
      },
      Q
    );
  }), $i = (f, E, G, Q) => le ? ft.filter((se) => Me.has(`${le}${se}`)).map((se) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(`${le}${se}`),
      "aria-label": `${le}${se === "N" ? "NT" : se}`,
      style: { flex: "none", width: se === "N" ? G : Q, height: f, border: "1px solid #8a8a6a", borderRadius: F, background: "#f8f8f8", color: Re(se) ? Be : "#000", fontSize: E, lineHeight: 1, cursor: "pointer" },
      children: ve[se]
    },
    se
  )) : null, Ci = (f, E, G) => ["X", "XX"].map((Q) => Ne && Me.has(Q) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(Q),
      "aria-label": Q === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: f, height: E, border: `1px solid ${Q === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: F, background: Q === "X" ? Be : "#1034a6", color: "#fff", fontSize: G, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: Q
    },
    Q
  ) : /* @__PURE__ */ n("span", { style: { width: f, height: E } }, Q)), Bi = (f, E, G) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: Ne ? () => je("P") : void 0,
      "aria-label": "Pass",
      style: gn(f, E, Ne ? "#116710" : "#a7b8a2", "#0c4b0b", Ne, G),
      children: "Pass"
    }
  ), bn = Me.has("X") || Me.has("XX"), uo = le ? ft.filter((f) => Me.has(`${le}${f}`)) : [], Ei = /* @__PURE__ */ n("div", { style: { width: 581, flex: "none", background: z.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: v ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    ho(44, 21)
  ] }) : /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      Bi(120, 37, 21),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Ni(57, 37, 23) })
    ] }),
    (bn || uo.length > 0) && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: Ci(57, 37, 21) }),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: $i(37, 23, 120, 57) })
    ] })
  ] }) }), et = re ? Se.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, Xe))), Ri = "1.75fr repeat(7,1fr)", Ti = bn ? "repeat(4,1fr) 1.75fr 1fr 1fr" : "repeat(4,1fr) 1.75fr", Rt = (f) => ({
    minWidth: 0,
    height: et,
    border: "1px solid #8a8a6a",
    borderRadius: F,
    fontWeight: 800,
    lineHeight: 1,
    padding: 0,
    ...f
  }), Wi = ft.map((f) => !!le && uo.includes(f) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(`${le}${f}`),
      "aria-label": `${le}${f === "N" ? "NT" : f}`,
      style: Rt({ background: "#f8f8f8", color: Re(f) ? Be : "#000", fontSize: f === "N" ? 28 : 38, cursor: "pointer" }),
      children: ve[f]
    },
    f
  ) : /* @__PURE__ */ n("span", { style: { minWidth: 0, height: et, pointerEvents: "none" } }, f)), Ai = bn ? ["X", "XX"].map((f) => Ne && Me.has(f) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => je(f),
      "aria-label": f === "X" ? "Double" : "Redouble",
      style: Rt({ border: `1px solid ${f === "X" ? "#8f0000" : "#0a2170"}`, background: f === "X" ? Be : "#1034a6", color: "#fff", fontSize: 28, cursor: "pointer" }),
      children: f
    },
    f
  ) : /* @__PURE__ */ n("span", { style: { minWidth: 0, height: et } }, f)) : null, po = /* @__PURE__ */ n("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: z.trayBg, padding: "6px 8px 8px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: v ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: Bn * et + 5 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 20, fontWeight: 700, color: "#3a3a20" }, children: "Confirm your call" }),
    ho(et, 26)
  ] }) : /* @__PURE__ */ d(ye, { children: [
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: Ri, gap: 5 }, children: [
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: Ne ? () => je("P") : void 0,
          "aria-label": "Pass",
          style: Rt({ border: "1px solid #0c4b0b", background: Ne ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 28, cursor: Ne ? "pointer" : "default", opacity: Ne ? 1 : 0.42 }),
          children: "Pass"
        }
      ),
      [1, 2, 3, 4, 5, 6, 7].map((f) => {
        const E = ft.some((Q) => Me.has(`${f}${Q}`)), G = Ne && E;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: G ? () => ie(le === f ? null : f) : void 0,
            "aria-label": `Level ${f}`,
            style: Rt({ background: le === f ? vn : "#f8f8f8", color: "#000", fontSize: 30, cursor: G ? "pointer" : "default", opacity: G ? 1 : 0.42 }),
            children: f
          },
          f
        );
      })
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: Ti, gap: 5 }, children: [
      Wi,
      Ai
    ] })
  ] }) }), yn = {
    legalCalls: a,
    live: Ne,
    pending: v,
    onStage: je,
    onConfirm: lo,
    onCancel: ao,
    radius: F
  }, Ii = /* @__PURE__ */ n(mt, { cell: 46, ...yn }), Hi = /* @__PURE__ */ n("div", { style: { width: "100%", flex: "none", background: z.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ n(mt, { cell: 84, minCellH: et, ...yn }) }), go = { N: "North", E: "East", S: "South", W: "West" }, bo = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), mn = [
    { kind: "chip", label: "Board", value: String(s) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: bo, color: bo === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: he ? `${he.level}${ve[he.strain]}${he.doubled === 1 ? "X" : he.doubled === 2 ? "XX" : ""}` : "—", color: he && Re(he.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: he ? go[he.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: c, title: "Scoring mode", on: _ ?? null }
  ], xn = (f) => [
    ...f ? [{ kind: "node", node: f }] : [],
    { kind: "divider" },
    ...k ? [{ kind: "button", label: k.label, title: "Four-hand record", href: k.href }] : [],
    ...X ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => V(!0) }] : [],
    { kind: "spacer" },
    ...S && ze ? [{ kind: "button", label: "Claim", tone: "accent", on: S }] : [],
    ...Z ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: Z }] : []
  ], yo = Y && X ? /* @__PURE__ */ n(wl, { onClose: () => V(!1), children: X }) : null, zi = (f) => Jt.map((E) => {
    const G = e.hands[f].filter((Q) => Q.suit === E).sort((Q, se) => se.rank - Q.rank).map((Q) => We(Q.rank));
    return G.length ? { suit: E, ranks: G } : null;
  }).filter((E) => E != null), mo = xe === "E" ? "right" : "left", xo = on && xe ? /* @__PURE__ */ d("div", { "data-testid": "dummy-strip", style: { flex: "none", width: Wl, alignSelf: "stretch", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, padding: "8px 6px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: go[xe] }),
    o[xe] ? zi(xe).map((f) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "flex-start", gap: 3, fontSize: 24, fontWeight: 700, lineHeight: 1.12 }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", color: Re(f.suit) ? Be : "#111" }, children: ve[f.suit] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", minWidth: 0, color: "#f2f6f4" }, children: f.ranks.map((E, G) => /* @__PURE__ */ n("span", { style: { whiteSpace: "nowrap" }, children: E }, `${E}-${G}`)) })
    ] }, f.suit)) : null
  ] }) : null, Mi = nn && xe ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: o[xe] ? U ? fn(xe, ue) : cn(xe, ue) : Bt(xe, { w: ue.backW, h: ue.h }) })
  ) : null, kn = Math.max(1, e.hands.S.length), Di = o.S ? ue.w + (kn - 1) * Bl : Math.round(ue.backW * kn + 1.5 * (kn - 1)) + 4, Oi = /* @__PURE__ */ d("div", { "data-testid": "phone-stage", style: { flex: "none", width: It, minHeight: sn, height: sn, transform: `scale(${Xe})`, transformOrigin: "top center", marginBottom: mi, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    R && /* @__PURE__ */ n(tt, { side: "top", items: mn, condensed: !0, thickness: Se.bar, bg: z.barBg, accent: z.accent }),
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: z.feltFlat }, children: [
      Mi,
      /* @__PURE__ */ d("div", { "data-testid": "centre-band", style: { flex: "none", height: ln, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: [
        mo === "left" ? xo : null,
        /* @__PURE__ */ d("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: ke ? "flex-start" : "center", justifyContent: "center", ...w ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
          ke && u === "box" ? hn({ width: 430, height: "auto", maxH: ln, headFont: 26, cellFont: 24, radius: 0, cellMinH: Dr, rowsVisible: Ml }) : null,
          ke && u === "seats" ? /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((f) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
            /* @__PURE__ */ n("span", { style: { width: 30, height: 30, background: Rr, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: f }),
            Ke(f, 22) ?? /* @__PURE__ */ n("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
          ] }, f)) }) : null,
          ze ? vi(bi) : null,
          _e ? pn : null
        ] }),
        mo === "right" ? xo : null
      ] }),
      ke ? pi ? /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ n(mt, { cell: gi, ...yn }) }) : po : null,
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        Ke("S"),
        o.S ? U ? fn("S", ue) : cn("S", ue) : Bt("S", { w: ue.backW, h: ue.h }),
        Ze("S", Math.max(Rl, Di), { weight: 700 })
      ] }) })
    ] }),
    R && /* @__PURE__ */ n(tt, { side: "bottom", items: xn(x ?? H), condensed: !0, thickness: Se.bar, bg: z.barBg, accent: z.accent })
  ] }), Li = (f) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ke(f, 22),
    Ze(f, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    o[f] && Et(f, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), ko = (f) => /* @__PURE__ */ d("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ke(f, 22),
    Ze(f, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    o[f] && Et(f, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), Fi = (f) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ke(f, 22),
    Ze(f, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    o[f] && Et(f, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), Pi = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: z.stageBg }, children: [
    R && /* @__PURE__ */ n(tt, { side: "top", items: mn, scale: Xe, minTouch: 44, bg: z.barBg, accent: z.accent }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: z.felt }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Li("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        ko("W"),
        /* @__PURE__ */ d("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...O }, children: [
          ke && u === "box" ? hn({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          ze ? wi : null,
          _e ? pn : null
        ] }),
        ko("E")
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: Fi("S") })
    ] }),
    ke ? D ? Hi : po : null,
    R && /* @__PURE__ */ n(tt, { side: "bottom", items: xn(x ?? H), scale: Xe, minTouch: 44, bg: z.barBg, accent: z.accent })
  ] }), _i = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    R && /* @__PURE__ */ n(tt, { side: "top", items: mn, scale: Xe, bg: z.barBg, accent: z.accent }),
    /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: z.felt }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: so("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        co("W"),
        /* @__PURE__ */ n("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...O }, children: /* @__PURE__ */ d(Ul, { children: [
          ke && D ? Ii : ke && u === "box" ? hn() : null,
          ze ? Si() : null,
          _e ? pn : null
        ] }) }),
        co("E")
      ] }),
      /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ n("div", { style: { height: ke && !D ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: ke && !D ? Ei : null }),
        so("S")
      ] })
    ] }) }),
    R && /* @__PURE__ */ n(tt, { side: "bottom", items: xn(H), scale: Xe, bg: z.barBg, accent: z.accent })
  ] });
  return re ? /* @__PURE__ */ d("div", { ref: ee, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: z.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", maxHeight: `${eo}%`, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: Oi }) }),
    tn > 0 && /* @__PURE__ */ n("div", { style: { flex: "1 1 auto", minHeight: `${tn}%`, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: di && /* @__PURE__ */ n(Cl, { title: q, accent: z.accent, lines: P, actions: te }) }),
    yo,
    A && !I && /* @__PURE__ */ n(Ro, { accent: z.accent, items: C, onClose: () => L(!1) })
  ] }) : /* @__PURE__ */ n("div", { ref: ee, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: z.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: z.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: yi, height: sn, transform: `scale(${Xe})` }, children: [
    Qe ? Pi : _i,
    yo,
    A && !I && /* @__PURE__ */ n(Ro, { accent: z.accent, items: C, onClose: () => L(!1) })
  ] }) });
}
const Lo = "#ffce04", Ht = "#cb0200", Fo = "#016700", Jl = "#cbcbcb", Po = "#99cccc", Vl = "#336799", Or = 648, Xn = 400, jn = 8, Kn = 8, De = { w: Kn * 2 + Or * 3 + jn * 2, h: Kn * 2 + Xn * 3 + jn * 2 }, _o = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Xo = ["W", "N", "E", "S"], Ql = ["S", "H", "D", "C"], jo = (e) => e === "H" || e === "D", ql = (e) => /^[1-7][CDHSN]$/.test(e), Zl = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e);
function ea({
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
  const b = ne(null), [g, m] = J({ w: De.w, h: De.h });
  wt(() => {
    const k = b.current;
    if (!k) return;
    const T = () => m({ w: k.clientWidth || De.w, h: k.clientHeight || De.h });
    T();
    const R = new ResizeObserver(T);
    return R.observe(k), () => R.disconnect();
  }, []);
  const h = Math.min(g.w / De.w, g.h / De.h) || 1, y = (k) => {
    const T = o.toLowerCase();
    return T === "both" || T === "all" || T === (k === "N" || k === "S" ? "ns" : "ew");
  }, N = 57, $ = 145, I = (k) => {
    const T = y(k), R = k === t;
    return /* @__PURE__ */ n("div", { style: { background: R ? Lo : T ? Ht : "#fff", color: T && !R ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }, children: k });
  }, _ = /* @__PURE__ */ d("div", { style: { width: N * 2 + $ + 4, display: "grid", gridTemplateColumns: `${N}px ${$}px ${N}px`, gridTemplateRows: `${N}px ${$}px ${N}px`, gap: 2, padding: 2, background: "#000", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("N"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("W"),
    /* @__PURE__ */ n("div", { title: String(e), style: { background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(e).length > 8 ? 24 : String(e).length > 3 ? 40 : 104, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }, children: e }),
    I("E"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } }),
    I("S"),
    /* @__PURE__ */ n("div", { style: { background: "#000" } })
  ] }), S = (k) => {
    const T = (l == null ? void 0 : l[k]) ?? !0;
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignSelf: "stretch" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", height: 70, background: k === s ? Lo : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }, children: [
        /* @__PURE__ */ n("span", { style: { flex: "none", width: 70, height: 70, background: Vl, color: "#fff", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: k }),
        /* @__PURE__ */ n("span", { style: { padding: "0 14px", fontSize: 52, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: a[k] }),
        !T && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", paddingRight: 14, fontSize: 24, color: "#666" }, children: "hidden" })
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: 1, background: Jl, padding: "4px 14px 10px" }, children: Ql.map((R) => {
        const j = [...r[k]].filter((B) => B.suit === R).sort((B, q) => q.rank - B.rank);
        return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.35, fontSize: 58, color: jo(R) ? Ht : "#000" }, children: [
          /* @__PURE__ */ n("span", { style: { flex: "none", width: 58 }, children: _o[R] }),
          /* @__PURE__ */ n("span", { style: { color: "#000", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }, children: T && j.length ? j.map((B) => Zl(B.rank)).join("") : "—" })
        ] }, R);
      }) })
    ] });
  }, H = [];
  {
    const k = [
      ...Array.from({ length: Xo.indexOf(t) }, () => null),
      ...i
    ];
    for (let T = 0; T < k.length; T += 4) H.push(k.slice(T, T + 4));
  }
  const x = (k) => ql(k) ? /* @__PURE__ */ d(ye, { children: [
    k[0],
    /* @__PURE__ */ n("span", { style: { color: jo(k[1] ?? "") ? Ht : "#000" }, children: _o[k[1] ?? ""] })
  ] }) : k === "P" ? "P" : k, X = /* @__PURE__ */ d("div", { style: { width: "100%", height: 374, background: Po, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: Xo.map((k) => /* @__PURE__ */ n("span", { style: { padding: "2px 0", fontSize: 42, fontWeight: 700, lineHeight: 1.15, background: y(k) ? Ht : "#fff", color: y(k) ? "#fff" : "#000" }, children: k }, k)) }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px" }, children: [
      H.map((k, T) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }, children: [0, 1, 2, 3].map((R) => /* @__PURE__ */ n("span", { style: { fontSize: 42, lineHeight: 1.25, color: "#000" }, children: k[R] ? x(k[R].call) : "" }, R)) }, T)),
      i.length === 0 && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 32, color: "#1e4747", paddingTop: 10 }, children: "No calls yet" })
    ] })
  ] }), M = (k) => /* @__PURE__ */ n("div", { style: { width: "100%", alignSelf: "end", background: Po, padding: "10px 16px", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: k.map((T, R) => /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 40, lineHeight: 1.3, color: "#000" }, children: [
    /* @__PURE__ */ n("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: T.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700 }, children: T.value })
  ] }, R)) });
  return /* @__PURE__ */ n("div", { ref: b, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: Fo, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ n("div", { style: { flex: "none", transformOrigin: "center center", width: De.w, height: De.h, transform: `scale(${h})` }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${Or}px)`, gridTemplateRows: `repeat(3, ${Xn}px)`, gap: jn, padding: Kn, background: Fo }, children: [
    /* @__PURE__ */ d("div", { style: { justifySelf: "start", alignSelf: "start", display: "flex", gap: 24, alignItems: "flex-start", maxHeight: Xn, overflow: "hidden" }, children: [
      _,
      p
    ] }),
    S("N"),
    /* @__PURE__ */ n("div", { style: { alignSelf: "start", width: "100%" }, children: X }),
    S("W"),
    /* @__PURE__ */ n("div", {}),
    S("E"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: M(c) }),
    S("S"),
    /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "end" }, children: M(u) })
  ] }) }) });
}
const $t = "#0d707c", ta = "#1c8a5a", na = "#c0392b", oa = "#8b9a93", xt = "#55636f", Ko = "#17211d", Yn = "#9aa8a1", Yo = "#eef2ef", ra = "#0e1a1c", St = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", Lr = "✕", ia = "◆", la = "⇄", aa = "–", sa = "—", Fr = "·";
function Ae(e) {
  return e === "pos" ? ta : e === "neg" ? na : oa;
}
function Vt(e) {
  return e == null || !Number.isFinite(e) ? "neutral" : e > 0 ? "pos" : e < 0 ? "neg" : "neutral";
}
const Pr = 40;
function da({
  title: e,
  boardNo: t,
  boardsTotal: o,
  showResults: r,
  onResults: a,
  accent: l = $t,
  height: i = Pr
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
    background: ra,
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
function ca(e) {
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
function fa(e) {
  if (!e) return Number.NaN;
  if (typeof e.value == "number" && Number.isFinite(e.value)) return e.value;
  const t = (e.text ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!t) return Number.NaN;
  const o = Number(t.replace(/^\+/, ""));
  return Number.isFinite(o) ? o : Number.NaN;
}
function ha(e) {
  const t = e.map(fa);
  let o = Number.NEGATIVE_INFINITY;
  for (const r of t) Number.isFinite(r) && r > o && (o = r);
  return Number.isFinite(o) ? t.map((r) => Number.isFinite(r) && r === o) : t.map(() => !1);
}
const _r = { active: !1, picks: [] };
function ua(e, t) {
  switch (t.type) {
    case "start":
      return { active: !0, picks: [] };
    case "cancel":
      return _r;
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
function pa(e) {
  const [t, o] = e.picks;
  return !t || !o ? null : { boardNo: t.boardNo, a: t.key, b: o.key };
}
function ga(e, t) {
  const o = e.picks[0];
  return e.active && !!o && o.boardNo !== t;
}
function ba(e, t, o) {
  return e.picks.some((r) => r.boardNo === t && r.key === o);
}
const En = {
  display: "grid",
  gridTemplateColumns: "26px 1fr auto",
  alignItems: "center",
  gap: 10
};
function ya({
  rows: e,
  benRow: t,
  scoringLabel: o,
  accent: r = $t,
  note: a,
  legend: l,
  emptyLabel: i = "No finished players yet."
}) {
  const s = ca(e);
  return /* @__PURE__ */ d("div", { style: { fontFamily: St, color: "#17211d" }, children: [
    a && /* @__PURE__ */ n("div", { style: { fontSize: 11.5, color: Yn, marginBottom: 2 }, children: a }),
    /* @__PURE__ */ d(
      "div",
      {
        style: {
          ...En,
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
    s.length === 0 && /* @__PURE__ */ n("div", { style: { padding: "10px 8px", fontSize: 12.5, color: Yn }, children: i }),
    /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: s.map((c, u) => {
      const p = !!c.isYou, b = c.marks ?? [], g = c.tone ? Ae(c.tone) : Ae(Vt(c.value));
      return /* @__PURE__ */ d(
        "div",
        {
          style: {
            ...En,
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
                  children: ia
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
          ...En,
          marginTop: 7,
          padding: "11px 8px 3px",
          borderTop: `1px solid ${Yo}`
        },
        children: [
          /* @__PURE__ */ n("span", { "aria-hidden": !0, style: { textAlign: "center", fontSize: 12, color: "#9aa8b0" }, children: aa }),
          /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: 13, fontWeight: 700, color: xt }, children: t.label ?? "BEN" }),
            /* @__PURE__ */ n("span", { style: { fontSize: 10.5, color: "#8a949c" }, children: t.note ?? `benchmark ${Fr} unranked` })
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
          borderTop: `1px solid ${Yo}`,
          fontSize: 10,
          color: "#a2ada7",
          flexWrap: "wrap"
        },
        children: l
      }
    )
  ] });
}
function ma({
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
    const g = (m) => {
      m.key === "Escape" && t();
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
      color: Ko
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
      color: Ko
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
                    color: Yn,
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
                children: Lr
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
            o && /* @__PURE__ */ n(ya, { ...o, accent: o.accent ?? u }),
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
                const m = !!g.current, h = g.tone ? Ae(g.tone) : Ae(Vt(g.value));
                return /* @__PURE__ */ d(
                  "div",
                  {
                    title: `Board ${g.boardNo}${m ? " - open at the table behind this sheet" : ""}`,
                    style: {
                      flex: "none",
                      width: p ? 38 : 48,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      padding: "6px 2px",
                      borderRadius: 8,
                      background: m ? "#eff7f6" : "#f7faf8",
                      border: `1px solid ${m ? u : "#e8eeea"}`
                    },
                    children: [
                      /* @__PURE__ */ n("span", { style: { fontSize: 9.5, fontWeight: 700, color: m ? u : "#a2ada7" }, children: g.boardNo }),
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
const xa = "Tinted cell = best score on that board (ties share it). BEN is a benchmark column and is never ranked.", zt = 46;
function ka({
  columns: e,
  rows: t,
  totals: o,
  onCompare: r,
  accent: a = $t,
  legend: l = xa,
  viewportPhone: i = !0
}) {
  const [s, c] = Ki(ua, _r), u = typeof r == "function", p = u && s.active, b = pa(s), g = i ? 46 : 54, m = zt + e.length * (g + 4) + 8, h = (S) => {
    const H = e.find((x) => x.key === S);
    return H ? H.name ?? H.label : S;
  }, y = s.picks[0], N = p ? y ? b ? `Board ${b.boardNo} ${Fr} ${h(b.a)} vs ${h(b.b)}` : `Board ${y.boardNo}: ${h(y.key)} picked ${sa} now pick a second player in that row.` : "Pick two players on the same board." : "Pick two cells on the same board to compare those two lines.", $ = {
    marginTop: 6,
    minHeight: 34,
    lineHeight: 1.45,
    fontSize: b ? 12 : 11.5,
    fontWeight: b ? 800 : p && y ? 700 : 600,
    color: b ? "#22302a" : p ? y ? a : "#5f6f68" : "#9aa8a1"
  }, I = () => {
    !b || !r || (r(b), c({ type: "cancel" }));
  }, _ = (S) => ({
    width: g,
    flex: "none",
    textAlign: "center",
    padding: "5px 2px",
    borderRadius: "7px 7px 0 0",
    fontSize: 10.5,
    fontWeight: 800,
    background: S.isBenchmark ? "#eef1f4" : S.isYou ? "#eff7f6" : "#f7faf8",
    color: S.isBenchmark ? xt : S.isYou ? a : "#5a6a63"
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
            children: `${la} Compare`
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
            children: `${Lr} Cancel`
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
    /* @__PURE__ */ n("div", { style: { overflowX: "auto", WebkitOverflowScrolling: "touch" }, children: /* @__PURE__ */ d("div", { style: { minWidth: m }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", gap: 4, marginBottom: 5 }, children: [
        /* @__PURE__ */ n("span", { style: { width: zt, flex: "none" } }),
        e.map((S) => /* @__PURE__ */ n("span", { style: _(S), title: S.name ?? S.label, children: S.label }, S.key))
      ] }),
      t.map((S) => {
        const H = ha(S.cells), x = ga(s, S.boardNo);
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
                    opacity: x ? 0.32 : 1
                  },
                  children: S.label ?? `Bd ${S.boardNo}`
                }
              ),
              e.map((X, M) => {
                const k = S.cells[M], T = (k == null ? void 0 : k.text) ?? "", R = !!H[M], j = ba(s, S.boardNo, X.key), B = p && !x, q = X.name ?? X.label, P = j ? "#d9efeb" : R ? "#e4f2ef" : X.isBenchmark ? "#f6f8f9" : X.isYou ? "#f3faf9" : "#fff", te = j ? `2px solid ${a}` : B ? "1px dashed #b3d2ce" : R ? "1px solid #a9d3cd" : X.isYou ? "1px solid #dcefec" : X.isBenchmark ? "1px solid #dde3e7" : "1px solid #eef2ef", z = p ? x ? `Not this row - both picks must be on Board ${y ? y.boardNo : S.boardNo}` : j ? "Click again to deselect" : `Pick ${q} on Board ${S.boardNo}` : R ? `Best on Board ${S.boardNo}` : "";
                return /* @__PURE__ */ n(
                  "button",
                  {
                    type: "button",
                    disabled: !B,
                    "aria-pressed": B ? j : void 0,
                    "aria-label": `${q}, board ${S.boardNo}${T ? `: ${T}` : ""}${R ? ", best on this board" : ""}`,
                    title: z,
                    onClick: () => c({ type: "pick", boardNo: S.boardNo, key: X.key }),
                    style: {
                      width: g,
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6,
                      padding: j ? "5px 1px" : "6px 2px",
                      background: P,
                      border: te,
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: R ? 800 : X.isYou || X.isBenchmark ? 700 : 600,
                      color: k != null && k.tone ? Ae(k.tone) : Ae(Vt(k == null ? void 0 : k.value)),
                      opacity: x ? 0.32 : 1,
                      cursor: p ? x ? "not-allowed" : "pointer" : "default"
                    },
                    children: T
                  },
                  X.key
                );
              })
            ]
          },
          S.boardNo
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
            e.map((S, H) => {
              const x = o[H];
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
                    background: S.isBenchmark ? "#eef1f4" : S.isYou ? "#eff7f6" : "#f7faf8",
                    fontSize: 11,
                    fontWeight: 800,
                    color: S.isBenchmark ? xt : x != null && x.tone ? Ae(x.tone) : Ae(Vt(x == null ? void 0 : x.value))
                  },
                  children: (x == null ? void 0 : x.text) ?? ""
                },
                S.key
              );
            })
          ]
        }
      )
    ] }) }),
    l && /* @__PURE__ */ n("div", { style: { fontSize: 10.5, lineHeight: 1.5, color: "#9aa8a1", marginTop: 8 }, children: l })
  ] });
}
const Uo = ["N", "E", "S", "W"], Sa = { N: "S", S: "N", E: "W", W: "E" }, va = { N: "North", E: "East", S: "South", W: "West" };
function wa({
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
  var te, z, U;
  const m = ce(() => e ?? Ve(t), [e, t]), [h, y] = J(
    () => kt("embed", o, r, m)
  ), N = `${o}:${r}:${t}:${m.N.length}:${((te = m.N[0]) == null ? void 0 : te.suit) ?? ""}${((z = m.N[0]) == null ? void 0 : z.rank) ?? ""}`, $ = ne(N);
  me(() => {
    $.current !== N && ($.current = N, I.current = 0, y(kt("embed", o, r, m)));
  }, [N, o, r, m]);
  const I = ne(0), _ = He((D, w) => {
    y(
      (O) => Le(O, {
        category: "bid-event",
        seq: I.current += 1,
        boardRef: O.boardRef,
        seat: D,
        call: w
      })
    );
  }, []), S = He((D, w) => {
    y(
      (O) => Le(O, {
        category: "play-event",
        seq: I.current += 1,
        boardRef: O.boardRef,
        seat: D,
        card: w
      })
    );
  }, []), H = ((U = h.contract) == null ? void 0 : U.declarer) ?? null, x = H && h.phase !== "auction" ? Sa[H] : null, X = He(
    (D) => D === a || D === x && H === a,
    [a, x, H]
  ), M = h.phase !== "complete" && X(h.turn), k = ne(!1);
  me(() => {
    if (!s || M || h.phase === "complete" || k.current) return;
    const D = h.turn, w = h;
    k.current = !0;
    let O = !1;
    return (async () => {
      try {
        if (await new Promise((K) => setTimeout(K, c)), O) return;
        const ee = await s(w, D);
        if (O || !ee) return;
        y((K) => K !== w && K.turn !== D ? K : ee.call && K.phase === "auction" ? Fe(K.auction, D).has(ee.call) ? Le(K, {
          category: "bid-event",
          seq: I.current += 1,
          ts: Date.now(),
          boardRef: K.boardRef,
          seat: D,
          call: ee.call,
          fallback: !1
        }) : K : ee.card && K.phase === "play" && Ut(K, D).some(
          (ie) => ie.suit === ee.card.suit && ie.rank === ee.card.rank
        ) ? Le(K, {
          category: "play-event",
          seq: I.current += 1,
          ts: Date.now(),
          boardRef: K.boardRef,
          seat: D,
          card: ee.card,
          fallback: !1
        }) : K);
      } finally {
        k.current = !1;
      }
    })(), () => {
      O = !0, k.current = !1;
    };
  }, [s, M, h, c]);
  const T = ne(g);
  T.current = g, me(() => {
    var D;
    (D = T.current) == null || D.call(T, h);
  }, [h]);
  const R = ne(!1);
  me(() => {
    h.phase !== "complete" || R.current || (R.current = !0, b == null || b(h));
  }, [h, b]);
  const j = ce(() => ({
    ...wr((i == null ? void 0 : i.skin) ?? "bbo", i == null ? void 0 : i.overrides),
    handLayout: (i == null ? void 0 : i.handLayout) ?? "row",
    bidPad: (i == null ? void 0 : i.bidPad) ?? "grid",
    centreFrame: (i == null ? void 0 : i.centreFrame) ?? !1,
    fanSpread: (i == null ? void 0 : i.fanSpread) ?? 56,
    fanRadius: (i == null ? void 0 : i.fanRadius) ?? 0
  }), [i]), B = ce(() => {
    const D = {};
    for (const w of Uo)
      D[w] = l || w === a || w === x;
    return D;
  }, [l, a, x]), q = ce(() => {
    const D = {};
    for (const w of Uo)
      D[w] = {
        name: w === a ? "You" : va[w],
        human: w === a
      };
    return D;
  }, [a]), P = h.phase === "complete" ? Sr(h) : null;
  return /* @__PURE__ */ n(
    Gl,
    {
      state: h,
      seats: q,
      visible: B,
      mySeat: a,
      myTurn: M,
      legalCalls: h.phase === "auction" && M ? [...Fe(h.auction, h.turn)] : [],
      legalPlays: h.phase === "play" && M ? Ut(h, h.turn) : [],
      appearance: j,
      showCoach: u,
      ...p === void 0 ? {} : { coachShare: p },
      resultLine: P ? vr(P) : "",
      resultScore: P ? `${P.declarerScore >= 0 ? "+" : ""}${P.declarerScore}` : "",
      onCall: (D) => {
        M && _(h.turn, D);
      },
      onPlay: (D, w) => {
        M && S(h.turn, w);
      }
    }
  );
}
const Rn = ["W", "N", "E", "S"], Na = { N: "North", E: "East", S: "South", W: "West" }, $a = {
  none: "Neither vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable"
}, Ca = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Ba = (e) => e === "H" || e === "D", Ea = (e) => /^[1-7][CDHSN]$/.test(e), Ra = "#dbe8e8", Tn = "#fbfbfa", Ye = "rgba(0,0,0,0.10)", st = "#111827", Oe = "#6B7280", Wn = "#2f5c8f", Ta = (e, t) => t === "both" || t === (e === "N" || e === "S" ? "ns" : "ew");
function Mt({ call: e, size: t = 15 }) {
  if (!Ea(e))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: st }, children: e === "P" ? "Pass" : e });
  const o = e[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: t, fontWeight: 700, color: st, whiteSpace: "nowrap" }, children: [
    e[0],
    /* @__PURE__ */ n("span", { style: { color: Ba(o) ? "#cc0000" : st }, children: Ca[o] })
  ] });
}
function Wa(e, t, o) {
  const r = e.deal ? null : e.seed ?? 1, a = e.deal ?? Ve(r ?? 1), l = e.dealer ?? t.dealer, i = e.vul ?? t.vul, s = e.seat ?? t.seat;
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
    if (c.phase !== "auction" || c.turn === s || !Fe(c.auction, c.turn).has(b)) break;
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
    legal: p ? [...Fe(c.auction, s)] : [],
    askable: p,
    note: e.note ?? ""
  };
}
function sd({
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
  ), c = ne({ sig: "", list: [] });
  c.current.sig !== s && (c.current = { sig: s, list: e.map((W, A) => Wa(W, { dealer: t, vul: o, seat: r }, A)) });
  const u = c.current.list, p = ne(a);
  p.current = a;
  const b = !!a, [g, m] = J({});
  me(() => {
    const W = c.current.list, A = {};
    for (let V = 0; V < W.length; V++)
      A[V] = { status: b && W[V].askable ? "pending" : "off", call: null, ms: null };
    if (m(A), !b) return;
    let L = !1, Z = 0;
    const C = async () => {
      var V;
      for (; ; ) {
        const oe = Z++;
        if (L || oe >= W.length) return;
        const re = W[oe];
        if (!re.askable) continue;
        const Qe = Date.now();
        try {
          const we = await ((V = p.current) == null ? void 0 : V.call(p, re.state, re.seat));
          if (L) return;
          const he = Date.now() - Qe;
          m((qe) => ({
            ...qe,
            [oe]: we != null && we.call ? { status: "ready", call: we.call, ms: he } : { status: "failed", call: null, ms: he }
          }));
        } catch {
          if (L) return;
          m((we) => ({ ...we, [oe]: { status: "failed", call: null, ms: Date.now() - Qe } }));
        }
      }
    }, Y = Math.max(1, Math.min(l, W.length));
    return Promise.all(Array.from({ length: Y }, () => C())), () => {
      L = !0;
    };
  }, [s, b, l]);
  const [h, y] = J(0), [N, $] = J({}), [I, _] = J(null), [S, H] = J(!1), x = He(() => {
    y(0), $({}), _(null), H(!1), k.current = !1;
  }, []), X = ne(s);
  X.current !== s && (X.current = s, (h !== 0 || S || Object.keys(N).length) && x());
  const M = ce(
    () => u.flatMap((W, A) => {
      const L = N[A];
      if (!L) return [];
      const Z = g[A], C = (Z == null ? void 0 : Z.status) === "ready" ? Z.call : null;
      return [
        {
          index: A,
          seat: W.seat,
          seed: W.seed,
          yourCall: L,
          benCall: C,
          agreed: C ? C === L : null,
          benMs: (Z == null ? void 0 : Z.ms) ?? null
        }
      ];
    }),
    [u, N, g]
  ), k = ne(!1);
  me(() => {
    !S || k.current || (k.current = !0, i == null || i(M));
  }, [S, M, i]);
  const T = ne(null), [R, j] = J(560);
  me(() => {
    const W = T.current;
    if (!W) return;
    const A = () => j(W.clientWidth || 560);
    A();
    const L = new ResizeObserver(A);
    return L.observe(W), () => L.disconnect();
  }, []);
  const B = 280, q = 14, P = 14, te = R >= B + P + 240 + q * 2, z = (te ? R - q * 2 - P - B : R - q * 2) - 6, U = Math.max(26, Math.min(46, Math.floor((z - 70) / 5.65))), D = 5 * (U + 14) + 4 * Math.round(U * 0.13);
  if (u.length === 0)
    return /* @__PURE__ */ n("div", { style: { padding: 16, fontSize: 13, color: Oe, background: Tn, border: `1px solid ${Ye}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const w = u[Math.min(h, u.length - 1)], O = N[h] ?? null, F = g[h], ee = [];
  {
    const W = [
      ...Array.from({ length: Rn.indexOf(w.dealer) }, () => null),
      ...w.state.auction,
      // The learner's own call, once made, belongs in the grid like any other.
      ...O ? [{ seat: w.seat, call: O }] : []
    ];
    for (let A = 0; A < W.length; A += 4) ee.push(W.slice(A, A + 4));
  }
  const K = Rn.map((W) => ({ seat: W, vul: Ta(W, w.vul), isDealer: W === w.dealer })), fe = /* @__PURE__ */ n("div", { style: { display: "flex", gap: 5, alignItems: "center" }, children: u.map((W, A) => /* @__PURE__ */ n(
    "span",
    {
      title: `Hand ${A + 1}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: N[A] ? Wn : "transparent",
        border: `1.5px solid ${A === h && !S ? Wn : "rgba(0,0,0,0.22)"}`,
        boxSizing: "border-box"
      }
    },
    A
  )) }), le = () => {
    if (!O) return null;
    const W = (F == null ? void 0 : F.status) === "ready" && F.call === O;
    return /* @__PURE__ */ d("div", { style: { background: "#fff", border: `1px solid ${Ye}`, borderRadius: 10, padding: "10px 12px" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: Oe }, children: [
        /* @__PURE__ */ n("span", { children: "You bid" }),
        /* @__PURE__ */ n(Mt, { call: O, size: 17 }),
        (F == null ? void 0 : F.status) === "ready" && F.call ? W ? /* @__PURE__ */ n("span", { style: { color: "#1a7f4b", fontWeight: 600 }, children: "— BEN bids that too." }) : /* @__PURE__ */ d(ye, { children: [
          /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ n("span", { children: "BEN bid" }),
          /* @__PURE__ */ n(Mt, { call: F.call, size: 17 })
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
          onClick: () => h + 1 < u.length ? y(h + 1) : H(!0),
          style: {
            marginTop: 12,
            height: 38,
            padding: "0 18px",
            border: 0,
            borderRadius: 8,
            background: Wn,
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
  if (S) {
    const W = M.filter((L) => L.benCall), A = W.filter((L) => L.agreed).length;
    return /* @__PURE__ */ d("div", { ref: T, style: { background: Tn, border: `1px solid ${Ye}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        qn,
        {
          line: "Drill complete",
          score: W.length ? `Same call as BEN on ${A} of ${W.length}` : "",
          detail: `${M.length} hand${M.length === 1 ? "" : "s"} bid`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 14 }, children: M.map((L) => /* @__PURE__ */ d(
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
              L.index + 1
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(Mt, { call: L.yourCall })
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "BEN" }),
              L.benCall ? /* @__PURE__ */ n(Mt, { call: L.benCall }) : /* @__PURE__ */ n("span", { style: { fontStyle: "italic" }, children: "unavailable" })
            ] }),
            L.agreed && /* @__PURE__ */ n("span", { style: { marginLeft: "auto", color: "#1a7f4b", fontWeight: 700 }, children: "same" })
          ]
        },
        L.index
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
  const ie = /* @__PURE__ */ d("div", { style: { flex: te ? "1 1 0" : void 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ n(Nt, { cards: w.state.hands[w.seat], panelBg: "#fff", width: "100%", font: 20, suitW: 18, pad: "6px 10px" }),
    /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: te ? "flex-start" : "center" }, children: /* @__PURE__ */ n(
      Hr,
      {
        bg: Ra,
        m: { width: 236, height: "auto", headFont: 16, cellFont: 15, radius: 6, cellMinH: 20 },
        heads: K,
        rows: ee,
        dealerCol: Rn.indexOf(w.dealer),
        emptyText: ee.length === 0 ? `${w.dealer === w.seat ? "You deal" : `${w.dealer} deals`}` : null
      }
    ) })
  ] }), v = /* @__PURE__ */ d(
    "div",
    {
      style: {
        flex: te ? `0 0 ${D}px` : void 0,
        width: te ? D : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8
      },
      children: [
        w.askable ? O ? null : /* @__PURE__ */ d(ye, { children: [
          /* @__PURE__ */ n("span", { style: { fontSize: 12, color: Oe, alignSelf: "flex-start" }, children: I ? "Confirm your call" : "Your call?" }),
          /* @__PURE__ */ n(
            mt,
            {
              cell: U,
              radius: 6,
              legalCalls: w.legal,
              live: !0,
              pending: I,
              onStage: _,
              onConfirm: () => {
                I && ($((W) => ({ ...W, [h]: I })), _(null));
              },
              onCancel: () => _(null)
            }
          )
        ] }) : /* @__PURE__ */ n("p", { style: { fontSize: 13, color: Oe, textAlign: "center", margin: 0 }, children: "This hand's auction is already over — nothing to bid." }),
        (O || !w.askable) && /* @__PURE__ */ n("div", { style: { width: "100%" }, children: O ? le() : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: () => h + 1 < u.length ? y(h + 1) : H(!0),
            style: { height: 34, padding: "0 14px", border: `1px solid ${Ye}`, borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
            children: "Skip this hand →"
          }
        ) })
      ]
    }
  );
  return /* @__PURE__ */ d("div", { ref: T, style: { background: Tn, border: `1px solid ${Ye}`, borderRadius: 12, padding: 14 }, children: [
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
      Na[w.seat],
      " · ",
      $a[w.vul]
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: te ? "row" : "column", gap: 14, alignItems: "flex-start" }, children: [
      ie,
      v
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 11.5, color: Oe, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
  ] });
}
const Go = ["N", "E", "S", "W"], Jo = { N: "North", E: "East", S: "South", W: "West" }, Aa = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, Ia = 1976 / 1232, Dt = (e) => e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
function dd({
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
  const p = ce(() => t ?? Ve(e), [t, e]), b = ce(() => {
    let h = kt("diagram", o, r, p);
    for (const y of s) {
      if (h.phase !== "auction" || !Fe(h.auction, h.turn).has(y)) break;
      h = Le(h, {
        category: "bid-event",
        boardRef: h.boardRef,
        seat: h.turn,
        call: y
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
  for (const h of Go) g[h] = (i == null ? void 0 : i[h]) ?? Jo[h];
  const m = {};
  for (const h of Go) m[h] = !u.includes(h);
  return /* @__PURE__ */ n("div", { style: { width: "100%", aspectRatio: String(Ia) }, children: /* @__PURE__ */ n(
    ea,
    {
      boardLabel: l ?? e,
      dealer: o,
      vul: r,
      hands: p,
      names: g,
      visible: m,
      auction: b,
      highlightSeat: c,
      info: [
        { label: "Dealer", value: Jo[o] },
        { label: "Vulnerable", value: Aa[r] }
      ],
      result: [
        { label: "N-S points", value: String(Dt(p.N) + Dt(p.S)) },
        { label: "E-W points", value: String(Dt(p.E) + Dt(p.W)) }
      ]
    }
  ) });
}
function Xr(e) {
  return e.format === "bidding-only" ? "bidding-only" : "full";
}
function Ha(e) {
  return Xr(e) === "bidding-only";
}
function jr(e, t) {
  return t ? e !== "auction" : e === "complete";
}
const dt = 1, Te = 16;
function za(e) {
  return ["N", "E", "S", "W"][(e - 1) % 4];
}
function Kr(e) {
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
function Ma(e) {
  const t = e.auction.map((r) => `${r.seat}${r.call}`).join(","), o = e.play.map((r) => `${r.seat}${r.card.suit}${r.card.rank}`).join(",");
  return `${e.dealer}/${t}/${o}`;
}
function Da(e) {
  const t = Ma(e);
  let o = 2166136261;
  for (let r = 0; r < t.length; r++)
    o ^= t.charCodeAt(r), o = Math.imul(o, 16777619) >>> 0;
  return `${o.toString(16).padStart(8, "0")}${t.length.toString(16)}`;
}
const An = [
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
function Oa(e) {
  const t = Math.abs(e), o = An.find((r) => t <= r.to) ?? An[An.length - 1];
  return o.imps === 0 ? 0 : e < 0 ? -o.imps : o.imps;
}
function Vo(e) {
  return e === void 0 ? "?" : e === null ? "PASS" : `${e.level}${e.strain}${e.doubled}`;
}
function La(e, t) {
  return e === void 0 || t === void 0 ? !1 : Vo(e) === Vo(t);
}
const Fa = "—";
function Qo(e, t) {
  const o = Math.round(t);
  return e === "mp" ? `${o}` : o > 0 ? `+${o}` : `${o}`;
}
function Pa(e, t) {
  if (e === "mp") return `${t.toFixed(1)}%`;
  const o = Math.round(t);
  return e === "total" ? `${o >= 0 ? "+" : ""}${o.toLocaleString("en-US")}` : `${o >= 0 ? "+" : ""}${o}`;
}
const Yr = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
  N: "NT"
};
function In(e) {
  if (e === void 0) return "";
  if (e === null) return "Pass";
  const t = e.doubled === 1 ? "×" : e.doubled === 2 ? "××" : "";
  return `${e.level}${Yr[e.strain] ?? e.strain}${t}${e.declarer}`;
}
function qo(e) {
  if (e === void 0) return Fa;
  if (e === null) return "Passed out";
  const t = e.doubled === 1 ? " ×" : e.doubled === 2 ? " ××" : "";
  return `${e.level}${Yr[e.strain] ?? e.strain}${t} by ${e.declarer}`;
}
function _a(e, t) {
  return e === "unrated" ? "BEN has not bid this board yet" : e === "differed" ? "A different contract" : t ? "Matched BEN" : "Matched BEN, from the other side";
}
function Hn(e) {
  return e === "matched" ? "pos" : "neutral";
}
const Xa = {
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
}, ja = { 1: "S", 2: "W", 3: "N", 4: "E" };
function Ka() {
  const e = [];
  for (const t of ["S", "H", "D", "C"])
    for (const o of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
      e.push({ suit: t, rank: o });
  return e;
}
function Ya(e) {
  const t = [];
  let o = null;
  for (const r of e) {
    const a = r.toUpperCase();
    if (a === "S" || a === "H" || a === "D" || a === "C") {
      o = a;
      continue;
    }
    const l = Xa[a];
    l && o && t.push({ suit: o, rank: l });
  }
  return t;
}
function Ua(e) {
  const t = ja[e[0]];
  if (!t) return null;
  const o = e.slice(1).split(","), r = { S: [], W: [], N: [], E: [] };
  Ie.forEach((i, s) => {
    o[s] && (r[i] = Ya(o[s]));
  });
  const a = /* @__PURE__ */ new Set();
  for (const i of Ie) for (const s of r[i]) a.add(`${s.suit}${s.rank}`);
  const l = Ka().filter((i) => !a.has(`${i.suit}${i.rank}`));
  for (const i of Ie)
    for (; r[i].length < 13 && l.length; ) r[i].push(l.shift());
  return { dealer: t, hands: r };
}
function Ga(e) {
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
function Ja(e) {
  const t = e.replace(/\r/g, "").split("|"), o = [];
  for (let r = 0; r < t.length - 1; r += 2)
    o.push([t[r].trim(), t[r + 1]]);
  return o;
}
function Va(e) {
  var p;
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a LIN string first." };
  if (!t.includes("md|") && !t.includes("|md|"))
    return {
      ok: !1,
      error: 'No deal found — this doesn’t look like a LIN file (expected an "md|" tag).'
    };
  const o = Ja(t), r = [];
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
        const m = g.split(",");
        a = {
          S: (m[0] ?? "").trim(),
          W: (m[1] ?? "").trim(),
          N: (m[2] ?? "").trim(),
          E: (m[3] ?? "").trim()
        }, i && (i.players = { ...a });
        break;
      }
      case "sv": {
        const m = g.trim().toLowerCase();
        l = m === "n" ? "ns" : m === "e" ? "ew" : m === "b" ? "both" : "none", i && (i.vul = l);
        break;
      }
      case "qx": {
        const m = (p = g.match(/(\d+)/)) == null ? void 0 : p[1];
        i = c(m ? `Board ${m}` : "");
        break;
      }
      case "ah":
        i && (i.name = g.trim() || i.name);
        break;
      case "md": {
        const m = Ua(g.trim());
        m && ((!i || i.hands.S.length) && (i = c("")), i.dealer = m.dealer, i.hands = m.hands);
        break;
      }
      case "mb": {
        if (!i) break;
        const { call: m, alert: h } = Ga(g), y = Ie[(Ie.indexOf(i.dealer) + i.auction.length) % 4];
        i.auction.push({ seat: y, call: m, alert: h });
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
const Qa = "SWNE", Zo = 3;
function qa(e) {
  const t = e.trim().charAt(0).toUpperCase();
  if (!t) return Zo;
  const o = Qa.indexOf(t);
  return o < 0 ? Zo : o + 1;
}
function Za(e) {
  if (!/%[0-9a-f]{2}/i.test(e)) return e;
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
function es(e) {
  const t = e.trim();
  if (!/^(https?:)?\/\//i.test(t) && !/^www\./i.test(t)) return null;
  try {
    return new URL(t.startsWith("www.") ? `https://${t}` : t);
  } catch {
    return null;
  }
}
function ts(e) {
  const t = (p) => (e.searchParams.get(p) ?? "").trim(), o = t("s"), r = t("w"), a = t("n"), l = t("e");
  if (!o && !r && !a && !l) return null;
  const i = `md|${qa(t("d"))}${o},${r},${a},${l}|`, s = `sv|${t("v")}|`, c = Number.parseInt(t("b"), 10), u = c > 0 ? `ah|Board ${c}|` : "";
  return `${i}${s}${u}`;
}
function ns(e) {
  const t = e.trim();
  if (!t) return { ok: !1, error: "Paste a BBO hand link first." };
  const o = es(t);
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
    const l = Za(r);
    return l.includes("md|") ? { ok: !0, lin: l } : { ok: !1, error: "That link’s lin= has no deal in it (no “md|” tag)." };
  }
  const a = ts(o);
  return a ? { ok: !0, lin: a } : {
    ok: !1,
    error: "No deal in that link — a Hand Viewer URL carries one in lin=, or in n/e/s/w hand parameters."
  };
}
function Ur(e) {
  const t = ns(e);
  return t.ok ? Va(t.lin) : { ok: !1, error: t.error };
}
const Je = ["S", "H", "D", "C"], os = {
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
function rs(e) {
  const t = e.toUpperCase().replaceAll("10", "T").replace(/[\s,.]/g, ""), o = [];
  for (const r of t) {
    const a = os[r];
    if (!a) return { error: `"${r}" is not a card rank` };
    o.push(a);
  }
  return o;
}
function is(e) {
  const t = e.split(".");
  if (t.length !== 4) return { error: "expected four dot-separated suits" };
  const o = [];
  for (let r = 0; r < 4; r++) {
    const a = rs(t[r] ?? "");
    if ("error" in a) return a;
    for (const l of a) o.push({ suit: Je[r], rank: l });
  }
  return o;
}
function ls(e) {
  const t = { S: "", H: "", D: "", C: "" };
  for (const o of Je)
    t[o] = e.filter((r) => r.suit === o).sort((r, a) => a.rank - r.rank).map((r) => bt(r.rank)).join("");
  return t;
}
function as(e) {
  const t = ls(e);
  return Je.map((o) => t[o]).join(".");
}
const Ce = $t, Gr = "#eff7f6", Pe = "#17211d", ge = "#5c6b64", de = "#8b9a93", pe = "#e4ebe7", be = "#ffffff", $e = "#f7faf8", ss = "#8a6d1f", ds = "#fdf6e3", qt = "#c0392b", Jr = "#fdeeec", Zt = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", cs = {
  fontFamily: Zt,
  color: Pe,
  fontSize: 13,
  lineHeight: 1.45,
  boxSizing: "border-box"
};
function nt({
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
function er({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        background: Gr,
        color: "#14403f",
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function fs({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f0e2b8",
        background: ds,
        color: ss,
        fontSize: 11.5,
        lineHeight: 1.5
      },
      children: e
    }
  );
}
function tr({ children: e }) {
  return /* @__PURE__ */ n(
    "div",
    {
      role: "alert",
      style: {
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f3c9c2",
        background: Jr,
        color: qt,
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
          /* @__PURE__ */ n("h3", { style: { margin: 0, fontSize: 16, fontWeight: 800, color: Pe }, children: t }),
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
function nr({
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
function hs({
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
    background: a === "accent" ? Gr : a === "alarm" ? Jr : be,
    color: a === "accent" ? "#14403f" : a === "alarm" ? qt : ge,
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
  color: Pe,
  fontFamily: "inherit",
  fontSize: 13.5,
  boxSizing: "border-box"
}, zn = ["N", "E", "S", "W"], ut = { N: "North", E: "East", S: "South", W: "West" }, Lt = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2], or = { S: "♠", H: "♥", D: "♦", C: "♣" }, rr = "#b03a2e", ir = (e) => e === "H" || e === "D", ot = {
  N: "#2a7ab0",
  E: "#6f4bb0",
  S: "#1c8a5a",
  W: "#b08328"
}, rt = (e, t) => `${e}${t}`;
function us({
  hands: e,
  onApply: t,
  onCancel: o,
  applyLabel: r = "Use this pack"
}) {
  const [a, l] = J(() => {
    const h = {};
    for (const y of zn)
      for (const N of e[y] ?? []) h[rt(N.suit, N.rank)] = y;
    return h;
  }), [i, s] = J("N"), c = ce(() => {
    const h = { N: 0, E: 0, S: 0, W: 0 };
    for (const y of Object.values(a)) y && h[y]++;
    return h;
  }, [a]), u = 52 - c.N - c.E - c.S - c.W, p = zn.every((h) => c[h] === 13), b = (h, y) => {
    const N = rt(h, y);
    l(($) => ({ ...$, [N]: $[N] === i ? "" : i }));
  }, g = () => l((h) => {
    const y = { ...h };
    for (const N of Je)
      for (const $ of Lt) {
        const I = rt(N, $);
        y[I] || (y[I] = i);
      }
    return y;
  }), m = () => {
    const h = { N: [], E: [], S: [], W: [] };
    for (const y of Je)
      for (const N of Lt) {
        const $ = a[rt(y, N)];
        $ && h[$].push({ suit: y, rank: N });
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
        /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }, children: zn.map((h) => {
          const y = i === h, N = Je.map(($) => ({
            suit: $,
            text: Lt.filter((I) => a[rt($, I)] === h).map((I) => bt(I)).join(" ")
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
                border: `1px solid ${y ? ot[h] : pe}`,
                background: y ? `${ot[h]}14` : be,
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
                      color: y ? ot[h] : ge
                    },
                    children: [
                      /* @__PURE__ */ n("span", { children: ut[h] }),
                      /* @__PURE__ */ d("span", { style: { color: c[h] === 13 ? "#1c8a5a" : qt }, children: [
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
                      /* @__PURE__ */ n("span", { style: { color: ir($) ? rr : Pe }, children: or[$] }),
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
        /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: Je.map((h) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 3 }, children: [
          /* @__PURE__ */ n(
            "span",
            {
              style: {
                width: 14,
                flex: "none",
                fontSize: 12,
                textAlign: "center",
                color: ir(h) ? rr : Pe
              },
              children: or[h]
            }
          ),
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 2, flex: 1, minWidth: 0 }, children: Lt.map((y) => {
            const N = a[rt(h, y)] || "", $ = {
              flex: 1,
              minWidth: 0,
              height: 24,
              padding: 0,
              borderRadius: 4,
              border: `1px solid ${N ? ot[N] : pe}`,
              background: N ? `${ot[N]}1f` : $e,
              color: N ? ot[N] : de,
              fontFamily: "inherit",
              fontSize: 10.5,
              fontWeight: N ? 800 : 600,
              cursor: "pointer"
            };
            return /* @__PURE__ */ n(
              "button",
              {
                type: "button",
                onClick: () => b(h, y),
                "aria-label": `${bt(y)} of ${h}${N ? ` — ${ut[N]}` : ""}`,
                title: N ? ut[N] : "In the pool",
                style: $,
                children: bt(y)
              },
              y
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
              onClick: m,
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
const lr = ["N", "E", "S", "W"], ps = { N: "North", E: "East", S: "South", W: "West" }, gs = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, ar = (e) => lr[(lr.indexOf(e) + 1) % 4] ?? "N";
function bs({
  board: e,
  onChange: t,
  onReroll: o
}) {
  const [r, a] = J(!1), [l, i] = J(!1), [s, c] = J(""), [u, p] = J(null), b = () => {
    const g = Ur(s);
    if (!g.ok) {
      p(g.error);
      return;
    }
    const m = g.boards[0];
    if (!m) {
      p("That link holds no boards.");
      return;
    }
    p(null), c(""), i(!1), t({
      hands: m.hands,
      dealer: m.dealer,
      vul: m.vul,
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
              /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 800, color: Pe }, children: [
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
            gs[e.vul]
          ] }),
          /* @__PURE__ */ d(gt, { onClick: () => t({ dealer: ar(e.dealer) }), title: "Cycle the dealer", children: [
            "Dealer ",
            e.dealer
          ] }),
          /* @__PURE__ */ d(
            gt,
            {
              tone: "accent",
              onClick: () => t({ humanSeat: ar(e.humanSeat) }),
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
              ps[e.humanSeat],
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
              color: qt,
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
          us,
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
const sr = 120, dr = 240, Un = [
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
], Gn = [
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
], en = [
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
], ys = [
  { key: "default", label: "Default" },
  { key: "show", label: "Show" },
  { key: "hide", label: "Hide" }
];
function ms() {
  const e = {};
  for (const t of en) e[t.key] = t.def;
  return e;
}
function cr(e) {
  const t = {};
  for (const o of en) {
    const r = e[o.key];
    (r === "show" || r === "hide") && (t[o.key] = r);
  }
  return t;
}
function xs(e) {
  return { showAllHands: (e == null ? void 0 : e["table.hands_view"]) === "show" };
}
const Qt = new Set(Ie), Vr = new Set(Object.keys(Ui)), ks = new Set(Un.map((e) => e.key)), Qr = new Set(Gn.map((e) => e.key)), Ss = new Set(en.map((e) => e.key));
function Zn(e) {
  const t = { N: [], E: [], S: [], W: [] }, o = /* @__PURE__ */ new Set();
  for (const r of Ie) {
    const a = is(e[r] ?? "");
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
function vs(e) {
  const t = [], o = e.title.trim();
  o || t.push("Give the challenge a title."), o.length > sr && t.push(`Titles are at most ${sr} characters.`), e.description.trim().length > dr && t.push(`Descriptions are at most ${dr} characters.`), e.format !== void 0 && !ks.has(e.format) && t.push("Pick whether the board is bid and played, or bidding only."), Qr.has(e.scoring) || t.push("Pick a scoring method."), (e.boards.length < dt || e.boards.length > Te) && t.push(`A challenge has ${dt}–${Te} boards.`), e.boards.forEach((r, a) => {
    if (r.boardNo !== a + 1 && t.push(`Board ${a + 1} is numbered ${r.boardNo}.`), Number.isInteger(r.seed) || t.push(`Board ${r.boardNo} has no deal.`), Qt.has(r.dealer) || t.push(`Board ${r.boardNo} has no dealer.`), Qt.has(r.humanSeat) || t.push(`Board ${r.boardNo} has no seat for you.`), r.vul !== void 0 && !Vr.has(r.vul) && t.push(`Board ${r.boardNo} has no vulnerability.`), r.pack) {
      const l = Zn(r.pack);
      "error" in l && t.push(`Board ${r.boardNo} pack — ${l.error}.`);
    }
  });
  for (const [r, a] of Object.entries(e.controlOverrides ?? {}))
    Ss.has(r) ? a !== "show" && a !== "hide" && t.push(`"${r}" must be shown or hidden.`) : t.push(`"${r}" is not a table control.`);
  return t;
}
function qr(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (!Array.isArray(t.boards) || t.boards.length === 0) return null;
  const o = t.boards.slice(0, Te).map((r, a) => ({
    boardNo: a + 1,
    seed: Number.isInteger(r == null ? void 0 : r.seed) ? r.seed : 1,
    dealer: Qt.has(r == null ? void 0 : r.dealer) ? r.dealer : "N",
    humanSeat: Qt.has(r == null ? void 0 : r.humanSeat) ? r.humanSeat : "S",
    ...r != null && r.vul && Vr.has(r.vul) ? { vul: r.vul } : {},
    ...r != null && r.pack ? { pack: r.pack } : {}
  }));
  return {
    title: typeof t.title == "string" ? t.title : "",
    description: typeof t.description == "string" ? t.description : "",
    ...t.format === "bidding-only" || t.format === "full" ? { format: t.format } : {},
    scoring: Qr.has(t.scoring) ? t.scoring : "imps",
    boards: o,
    controlOverrides: t.controlOverrides && typeof t.controlOverrides == "object" ? t.controlOverrides : {}
  };
}
const ws = [
  { key: "basics", label: "Basics", num: "01" },
  { key: "boards", label: "Boards", num: "02" },
  { key: "controls", label: "Controls", num: "03" },
  { key: "review", label: "Review", num: "04" }
], Ns = { N: "North", E: "East", S: "South", W: "West" }, $s = 4, Cs = [2, 4, 6, 8], fr = (e, t) => e + t * 7919 >>> 0, Mn = () => Math.floor(Math.random() * 4294967295) + 1 >>> 0;
function hr(e, t) {
  return {
    boardNo: t,
    seed: e,
    dealer: za(t),
    humanSeat: "S",
    vul: Kr(t),
    hands: Ve(e),
    edited: !1
  };
}
function Bs(e) {
  const t = {};
  for (const o of ["N", "E", "S", "W"]) t[o] = as(e[o]);
  return t;
}
function Es(e) {
  var t;
  return (t = e == null ? void 0 : e.boards) != null && t.length ? e.boards.map((o, r) => {
    let a = Ve(o.seed), l = !1;
    if (o.pack) {
      const i = Zn(o.pack);
      "error" in i || (a = i.hands, l = !0);
    }
    return {
      boardNo: r + 1,
      seed: o.seed,
      dealer: o.dealer,
      humanSeat: o.humanSeat,
      vul: o.vul ?? Kr(r + 1),
      hands: a,
      edited: l
    };
  }) : null;
}
function cd({
  draft: e,
  onCreate: t,
  onChange: o,
  createLabel: r = "Create challenge",
  seedBase: a
}) {
  const l = ne(qr(e) ?? void 0).current, i = ne(a ?? Mn()), [s, c] = J("basics"), [u, p] = J((l == null ? void 0 : l.title) ?? ""), [b, g] = J((l == null ? void 0 : l.description) ?? ""), [m, h] = J(
    (l == null ? void 0 : l.format) === "bidding-only" ? "bidding-only" : "full"
  ), [y, N] = J((l == null ? void 0 : l.scoring) ?? "imps"), [$, I] = J(
    () => Es(l) ?? Array.from({ length: $s }, (C, Y) => hr(fr(i.current, Y + 1), Y + 1))
  ), [_, S] = J(() => {
    const C = ms();
    for (const [Y, V] of Object.entries((l == null ? void 0 : l.controlOverrides) ?? {})) C[Y] = V;
    return C;
  }), [H, x] = J(""), [X, M] = J(null), [k, T] = J(null), [R, j] = J(null), B = ne({}), q = (C) => {
    var Y;
    c(C), (Y = B.current[C]) == null || Y.scrollIntoView({ behavior: "smooth", block: "start" });
  }, P = (C) => (Y) => {
    B.current[C] = Y;
  }, te = (C) => {
    const Y = Math.max(dt, Math.min(Te, Math.round(C)));
    I(
      (V) => Array.from({ length: Y }, (oe, re) => V[re] ?? hr(fr(i.current, re + 1), re + 1))
    );
  }, z = (C, Y) => I((V) => V.map((oe, re) => re === C ? { ...oe, ...Y } : oe)), U = (C) => I(
    (Y) => Y.map((V, oe) => {
      if (oe !== C) return V;
      const re = Mn();
      return { ...V, seed: re, hands: Ve(re), edited: !1 };
    })
  ), D = () => {
    const C = H.split(/\n+/).map((V) => V.trim()).filter(Boolean);
    if (!C.length)
      return M("Paste a BBO hand link first."), null;
    const Y = [];
    for (const V of C) {
      const oe = Ur(V);
      if (!oe.ok)
        return M(oe.error), null;
      for (const re of oe.boards)
        Y.push({
          boardNo: 0,
          // renumbered by position below
          seed: Mn(),
          dealer: re.dealer,
          humanSeat: "S",
          vul: re.vul,
          hands: re.hands,
          edited: !0
        });
    }
    return Y;
  }, w = (C) => {
    const Y = D();
    if (!Y) return;
    const V = Te - (C === "replace" ? 0 : $.length);
    I((re) => [...C === "replace" ? [] : re, ...Y].slice(0, Te).map((we, he) => ({ ...we, boardNo: he + 1 }))), M(null), x("");
    const oe = Math.min(Y.length, Math.max(0, V));
    T(
      oe < Y.length ? `Took ${oe} of ${Y.length} — a challenge holds ${Te} boards.` : `${oe} board${oe === 1 ? "" : "s"} from BBO.`
    );
  }, O = ce(() => {
    const C = (V) => V === "hide" ? "hidden" : V === "show" ? "shown" : "platform", Y = Object.keys(cr(_)).length;
    return `Hands ${C(_["table.hands_view"])} · Undo ${C(
      _["table.undo"]
    )} · ${Y} override${Y === 1 ? "" : "s"}`;
  }, [_]), F = [...new Set($.map((C) => C.humanSeat))], ee = Un.find((C) => C.key === m), K = Gn.find((C) => C.key === y), fe = m === "bidding-only", le = fe ? ee.label : K.label, ie = `${$.length}-board ${le}`, v = u.trim().length > 0, W = v ? u.trim() : ie, A = () => ({
    title: W,
    description: b.trim(),
    format: m,
    scoring: y,
    boards: $.map((C) => ({
      boardNo: C.boardNo,
      seed: C.seed,
      dealer: C.dealer,
      humanSeat: C.humanSeat,
      vul: C.vul,
      ...C.edited ? { pack: Bs(C.hands) } : {}
    })),
    controlOverrides: cr(_)
  }), L = JSON.stringify(A());
  me(() => {
    o && o(JSON.parse(L));
  }, [L]);
  const Z = () => {
    const C = A(), Y = vs(C);
    if (Y.length) {
      j(Y[0]), q("review");
      return;
    }
    j(null), t(C);
  };
  return /* @__PURE__ */ d("div", { style: { ...cs, display: "flex", flexDirection: "column", minWidth: 0 }, children: [
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
          /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }, children: ws.map((C) => /* @__PURE__ */ n(
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
      /* @__PURE__ */ n(nt, { children: "Title" }),
      /* @__PURE__ */ n(
        "input",
        {
          "aria-label": "Challenge title",
          value: u,
          onChange: (C) => p(C.target.value),
          placeholder: ie,
          style: Kt
        }
      ),
      /* @__PURE__ */ n("p", { style: { margin: "6px 0 0", fontSize: 11, color: de }, children: v ? "The learner sees this above the board." : `Optional — left blank it is called “${ie}.”` }),
      /* @__PURE__ */ n(nt, { style: { marginTop: 16 }, children: "Description" }),
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
      /* @__PURE__ */ n(nt, { style: { marginTop: 16 }, children: "What a board asks" }),
      /* @__PURE__ */ n(
        nr,
        {
          ariaLabel: "What a board asks",
          options: Un.map((C) => ({ key: C.key, label: C.label })),
          value: m,
          onChange: h
        }
      ),
      /* @__PURE__ */ n(er, { children: ee.note }),
      !fe && /* @__PURE__ */ d(ye, { children: [
        /* @__PURE__ */ n(nt, { style: { marginTop: 16 }, children: "Scoring" }),
        /* @__PURE__ */ n(
          nr,
          {
            ariaLabel: "Scoring",
            options: Gn.map((C) => ({ key: C.key, label: C.label })),
            value: y,
            onChange: N
          }
        ),
        /* @__PURE__ */ n(er, { children: K.note })
      ] }),
      /* @__PURE__ */ n(nt, { style: { marginTop: 16 }, children: "Boards" }),
      /* @__PURE__ */ n(Rs, { count: $.length, onCount: te }),
      /* @__PURE__ */ d("p", { style: { margin: "8px 0 0", fontSize: 11, color: de, lineHeight: 1.5 }, children: [
        dt,
        "–",
        Te,
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
                /* @__PURE__ */ n(nt, { children: "From BBO" }),
                /* @__PURE__ */ n(
                  "textarea",
                  {
                    value: H,
                    onChange: (C) => x(C.target.value),
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
                X && /* @__PURE__ */ n(tr, { children: X }),
                !X && k && /* @__PURE__ */ n("p", { style: { margin: "8px 0 0", fontSize: 11.5, color: Ce }, children: k }),
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
                bs,
                {
                  board: C,
                  onChange: (V) => z(Y, V),
                  onReroll: () => U(Y)
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
      /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: en.map((C) => {
        const Y = _[C.key] ?? "default";
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
                    children: ys.map((V) => {
                      const oe = Y === V.key;
                      return /* @__PURE__ */ n(
                        "button",
                        {
                          type: "button",
                          onClick: () => S((re) => ({ ...re, [C.key]: V.key })),
                          style: {
                            padding: "5px 9px",
                            borderRadius: 6,
                            border: 0,
                            background: oe ? V.key === "show" ? "#1c8a5a" : V.key === "hide" ? "#c0392b" : Ce : "transparent",
                            color: oe ? "#fff" : de,
                            fontFamily: "inherit",
                            fontSize: 10.5,
                            fontWeight: oe ? 800 : 600,
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
              C.note && /* @__PURE__ */ n(fs, { children: C.note })
            ]
          },
          C.key
        );
      }) }),
      /* @__PURE__ */ n("p", { style: { margin: "10px 0 0", fontSize: 11.5, color: de }, children: O })
    ] }),
    /* @__PURE__ */ d(Ot, { innerRef: P("review"), num: "04", title: "Review & create", children: [
      /* @__PURE__ */ n("p", { style: { margin: "0 0 12px", fontSize: 12, color: ge, lineHeight: 1.5 }, children: fe ? "BEN bids every board silently while the learner bids it — that auction is the one theirs is set beside. It needs no card play, so it is quick." : "BEN plays every board silently while the learner plays it, and the two results are set side by side." }),
      R && /* @__PURE__ */ n(tr, { children: R }),
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
            /* @__PURE__ */ n(Ue, { k: "Title", v: v ? W : `${W} — auto-named` }),
            /* @__PURE__ */ n(Ue, { k: "Format", v: ee.review }),
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
                v: F.length === 1 && F[0] ? `${Ns[F[0]]} on every board` : `Mixed (${F.join(", ")})`
              }
            ),
            /* @__PURE__ */ n(Ue, { k: "Controls", v: O }),
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
      /* @__PURE__ */ n(hs, { onClick: Z, children: r }),
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
              le,
              " · solo"
            ] })
          ] }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: Z,
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
function Rs({
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
              style: ur(e <= dt),
              children: "−"
            }
          ),
          /* @__PURE__ */ n("span", { style: { minWidth: 46, textAlign: "center", fontSize: 18, fontWeight: 800 }, children: e }),
          /* @__PURE__ */ n(
            "button",
            {
              type: "button",
              onClick: () => o(1),
              disabled: e >= Te,
              "aria-label": "One board more",
              style: ur(e >= Te),
              children: "+"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Cs.map((r) => /* @__PURE__ */ n(gt, { tone: e === r ? "accent" : "plain", onClick: () => t(r), children: r }, r)) })
  ] });
}
const ur = (e) => ({
  width: 40,
  height: 40,
  border: 0,
  background: $e,
  color: e ? de : Pe,
  fontFamily: "inherit",
  fontSize: 18,
  fontWeight: 800,
  cursor: e ? "default" : "pointer",
  opacity: e ? 0.5 : 1
}), Ts = 400;
async function Ws(e) {
  const { hands: t, dealer: o, vul: r, humanSeat: a, biddingOnly: l, decide: i, cancelled: s } = e;
  let c = kt("ben-reference", o, r, t);
  for (let u = 0; u < Ts; u++) {
    if (s()) return null;
    if (jr(c.phase, l)) break;
    const p = c.turn;
    let b;
    try {
      b = await i(c, p);
    } catch {
      return null;
    }
    if (s() || !b) return null;
    if (c.phase === "auction" && b.call) {
      if (!Fe(c.auction, p).has(b.call)) return null;
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
      if (!Ut(c, p).some((m) => m.suit === g.suit && m.rank === g.rank))
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
  return Zr(c, a, l);
}
function Zr(e, t, o) {
  const r = o ? null : Sr(e), a = r ? t === "N" || t === "S" ? r.nsScore : -r.nsScore : void 0;
  return {
    contract: e.contract ?? null,
    ...e.contract ? { contractLabel: Vi(e.contract) } : {},
    ...r ? { resultLabel: vr(r) } : {},
    ...a === void 0 ? {} : { rawScore: a }
  };
}
const Dn = "·", Ge = "—", As = "BEN", Is = "YOU";
function pr(e, t, o) {
  return e === "imps" ? Oa(t - o) : e === "total" ? t - o : t > o ? 100 : t === o ? 50 : 0;
}
function Hs(e, t) {
  return e === "bidding-only" ? { label: "vs BEN", name: "Contract vs BEN" } : t === "mp" ? { label: "MP %", name: "Matchpoints vs BEN" } : t === "total" ? { label: "Pts", name: "Points vs BEN" } : { label: "IMPs", name: "IMPs vs BEN" };
}
function zs(e, t) {
  return !e || !t || t.contract === void 0 ? "unrated" : La(e.contract, t.contract) ? "matched" : "differed";
}
function gr(e) {
  if (!e) return Ge;
  const t = e.resultLabel || e.contractLabel || Ge, o = e.rawScore;
  return typeof o == "number" ? `${t} (${o > 0 ? "+" : ""}${o})` : t;
}
function Ms(e, t) {
  const o = e == null ? void 0 : e.contract, r = t == null ? void 0 : t.contract;
  return o != null && r != null ? o.declarer === r.declarer : o === null && r === null;
}
function Ds(e) {
  const { format: t, scoring: o, boardsTotal: r, outcomes: a, currentBoardNo: l } = e, i = t === "bidding-only", s = Hs(t, o), c = new Map(a.map((M) => [M.boardNo, M])), u = Array.from({ length: r }, (M, k) => k + 1), p = [
    { key: Is, label: "You", name: "You", isYou: !0 },
    { key: As, label: "BEN", name: "BEN", isBenchmark: !0 }
  ], b = [], g = [], m = {};
  let h = 0, y = 0, N = 0;
  const $ = [];
  for (const M of u) {
    const k = c.get(M), T = k == null ? void 0 : k.you, R = k == null ? void 0 : k.ben, j = !!T;
    j && (h += 1);
    let B = { text: "" }, q = { text: "" }, P, te, z;
    if (i) {
      const U = zs(T, R);
      U !== "unrated" && j && (y += 1), U === "matched" && (N += 1), B = j ? {
        text: In(T == null ? void 0 : T.contract),
        ...U === "matched" ? { value: 1 } : {},
        tone: Hn(U)
      } : { text: "" }, q = { text: R ? In(R.contract) : "" }, j && (P = In(T == null ? void 0 : T.contract), U === "matched" && (te = 1), z = Hn(U), m[M] = {
        headline: _a(U, Ms(T, R)),
        sub: R === void 0 ? k != null && k.benFailed ? "BEN could not bid this board" : "BEN is still bidding this board" : `You: ${qo(T == null ? void 0 : T.contract)} ${Dn} BEN: ${qo(R.contract)}`,
        tone: Hn(U)
      });
    } else {
      const U = T == null ? void 0 : T.rawScore, D = R == null ? void 0 : R.rawScore, w = typeof U == "number" && typeof D == "number";
      if (w) {
        y += 1;
        const O = pr(o, U, D);
        $.push(O);
        const F = o === "mp" ? 50 : 0;
        O >= F && (N += 1), B = {
          text: Qo(o, O),
          value: Math.round(O),
          tone: O > F ? "pos" : O < F ? "neg" : "neutral"
        }, P = B.text, te = B.value, z = B.tone;
      } else j && (B = { text: Ge }, P = Ge, z = "neutral");
      q = { text: typeof D == "number" ? `${D > 0 ? "+" : ""}${D}` : "" }, j && (m[M] = {
        headline: w ? `${Qo(o, pr(o, U, D))} ${s.label}` : R === void 0 ? k != null && k.benFailed ? "BEN could not play this board" : "BEN is still playing this board" : Ge,
        sub: `You: ${gr(T)}` + (typeof D == "number" ? ` ${Dn} BEN: ${gr(R)}` : ""),
        tone: w ? B.tone ?? "neutral" : "neutral"
      });
    }
    b.push({ boardNo: M, cells: [B, q] }), g.push({
      boardNo: M,
      state: j ? "done" : M === l ? "current" : "todo",
      ...P === void 0 ? {} : { score: P },
      ...te === void 0 ? {} : { value: te },
      ...z === void 0 ? {} : { tone: z },
      disabled: !j
    });
  }
  const I = h === r && r > 0;
  let _, S, H, x;
  if (i)
    S = N, _ = y === 0 ? Ge : `${N}/${y}`, H = y > 0 && N === y ? "pos" : "neutral", x = y === 0 ? "BEN has not bid any of these boards yet" : `Reached BEN's contract on ${N} of ${y} board${y === 1 ? "" : "s"}`;
  else {
    const M = $.reduce((T, R) => T + R, 0);
    S = $.length === 0 ? 0 : o === "mp" ? M / $.length : M, _ = $.length === 0 ? Ge : Pa(o, S);
    const k = o === "mp" ? 50 : 0;
    H = $.length === 0 ? "neutral" : S > k ? "pos" : S < k ? "neg" : "neutral", x = $.length === 0 ? "BEN has not played any of these boards yet" : S > k ? `Ahead of BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : S < k ? `Behind BEN over ${$.length} board${$.length === 1 ? "" : "s"}` : `Level with BEN over ${$.length} board${$.length === 1 ? "" : "s"}`;
  }
  const X = [
    { text: _, ...H === "neutral" ? {} : { tone: H } },
    { text: "" }
  ];
  return {
    unitLabel: s.label,
    unitName: s.name,
    subtitle: `${r} board${r === 1 ? "" : "s"} ${Dn} ${s.name}`,
    headline: { text: _, sub: x, tone: H },
    columns: p,
    rows: b,
    totals: X,
    squares: g,
    details: m,
    mark: {
      boardsTotal: r,
      boardsDone: h,
      completed: I,
      boardsWon: N,
      rated: y,
      scoreText: _,
      scoreValue: S,
      percent: y === 0 ? 0 : Math.round(N / y * 100)
    }
  };
}
function Os(e) {
  return e.boards.map((t, o) => {
    let r = Ve(t.seed);
    if (t.pack) {
      const a = Zn(t.pack);
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
function fd({
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
    () => qr(e) ?? {
      title: "",
      description: "",
      scoring: "imps",
      boards: [],
      controlOverrides: {}
    },
    [e]
  ), u = ce(() => Os(c), [c]), p = Xr(c), b = Ha(c), { showAllHands: g } = xs(c.controlOverrides), [m, h] = J(0), [y, N] = J({}), [$, I] = J(!1), [_, S] = J(!0), H = ne(null), x = u[Math.min(m, u.length - 1)], X = x ? !!((D = y[x.boardNo]) != null && D.you) : !1;
  me(() => {
    const w = H.current;
    if (!w) return;
    const O = () => {
      const ee = w.clientWidth || 390, K = w.clientHeight || 844;
      S(ee / Math.max(1, K) < 1.25 && ee < 640);
    };
    O();
    const F = new ResizeObserver(O);
    return F.observe(w), () => F.disconnect();
  }, []);
  const M = ne(/* @__PURE__ */ new Map()), k = ce(() => {
    if (t)
      return async (w, O) => {
        var fe, le;
        const F = `${w.dealer}|${O}|${Da({
          dealer: w.dealer,
          auction: w.auction.map((ie) => ({ seat: ie.seat, call: ie.call })),
          play: w.tricks.flatMap((ie) => ie.plays.map((v) => ({ seat: v.seat, card: v.card })))
        })}|${w.hands[O].length}|${((fe = w.hands[O][0]) == null ? void 0 : fe.suit) ?? ""}${((le = w.hands[O][0]) == null ? void 0 : le.rank) ?? ""}`, ee = M.current.get(F);
        if (ee) return await ee;
        const K = Promise.resolve(t(w, O));
        M.current.set(F, K);
        try {
          const ie = await K;
          return ie || M.current.delete(F), ie;
        } catch (ie) {
          throw M.current.delete(F), ie;
        }
      };
  }, [t]);
  me(() => {
    var O, F;
    if (!l || !k || !x || (O = y[x.boardNo]) != null && O.ben || (F = y[x.boardNo]) != null && F.benFailed) return;
    let w = !1;
    return (async () => {
      const ee = await Ws({
        hands: x.hands,
        dealer: x.dealer,
        vul: x.vul,
        humanSeat: x.humanSeat,
        biddingOnly: b,
        decide: k,
        cancelled: () => w
      });
      w || N((K) => ({
        ...K,
        [x.boardNo]: {
          boardNo: x.boardNo,
          ...K[x.boardNo],
          ...ee ? { ben: ee } : { benFailed: !0 }
        }
      }));
    })(), () => {
      w = !0;
    };
  }, [l, k, x == null ? void 0 : x.boardNo, b]);
  const T = He(
    (w) => {
      x && N(
        (O) => {
          var F;
          return (F = O[x.boardNo]) != null && F.you ? O : {
            ...O,
            [x.boardNo]: {
              boardNo: x.boardNo,
              ...O[x.boardNo],
              you: Zr(w, x.humanSeat, b)
            }
          };
        }
      );
    },
    [x, b]
  ), R = He(
    (w) => {
      jr(w.phase, b) && T(w);
    },
    [b, T]
  ), j = ce(
    () => Ds({
      format: p,
      scoring: c.scoring,
      boardsTotal: u.length,
      outcomes: Object.values(y),
      ...x ? { currentBoardNo: x.boardNo } : {}
    }),
    [p, c.scoring, u.length, y, x]
  ), B = JSON.stringify(j.mark), q = ne(""), P = ne(!1);
  me(() => {
    if (q.current === B) return;
    q.current = B;
    const w = JSON.parse(B);
    i == null || i(w), w.completed && !P.current && (P.current = !0, s == null || s(w));
  }, [B]);
  const te = j.squares.map((w) => ({
    boardNo: w.boardNo,
    text: w.score ?? "",
    ...w.value === void 0 ? {} : { value: w.value },
    ...w.tone === void 0 ? {} : { tone: w.tone },
    current: (x == null ? void 0 : x.boardNo) === w.boardNo
  })), z = m >= u.length - 1, U = x ? j.details[x.boardNo] : void 0;
  return x ? /* @__PURE__ */ d(
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
          da,
          {
            title: c.title || "Challenge",
            boardNo: x.boardNo,
            boardsTotal: u.length,
            showResults: j.mark.boardsDone > 0,
            height: Pr,
            onResults: () => I(!0)
          }
        ),
        /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative" }, children: X ? /* @__PURE__ */ n(
          Fs,
          {
            boardNo: x.boardNo,
            boardsTotal: u.length,
            headline: (U == null ? void 0 : U.headline) ?? "",
            sub: (U == null ? void 0 : U.sub) ?? "",
            tone: (U == null ? void 0 : U.tone) ?? "neutral",
            last: z,
            onNext: () => h((w) => w + 1),
            onResults: () => I(!0)
          }
        ) : /* @__PURE__ */ n(
          wa,
          {
            deal: x.hands,
            seed: x.seed,
            dealer: x.dealer,
            vul: x.vul,
            humanSeat: x.humanSeat,
            showAllHands: g,
            robotDelayMs: a,
            ...r ? { appearance: r } : {},
            ...k ? { decide: k } : {},
            onState: R
          },
          `${x.boardNo}:${x.seed}`
        ) }),
        /* @__PURE__ */ n(
          ma,
          {
            open: $,
            onClose: () => I(!1),
            boards: te,
            viewportPhone: _,
            subtitle: j.subtitle,
            children: /* @__PURE__ */ n(Ls, { view: j })
          }
        )
      ]
    }
  ) : /* @__PURE__ */ n("div", { style: { fontFamily: Zt, padding: 16, color: ge }, children: "This challenge has no boards yet." });
}
function Ls({ view: e }) {
  return /* @__PURE__ */ d("div", { style: { fontFamily: Zt }, children: [
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
    /* @__PURE__ */ n(ka, { columns: e.columns, rows: e.rows, totals: e.totals }),
    /* @__PURE__ */ n("div", { style: { marginTop: 10, fontSize: 10.5, color: "#a2ada7", lineHeight: 1.5 }, children: "Solo — there is no field. Every figure is your board set beside BEN's on the same deal, and a different contract is a difference, not a mistake." })
  ] });
}
function Fs({
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
        fontFamily: Zt
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
            color: Pe,
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
const Ps = ["S", "H", "D", "C"], _s = { N: "S", S: "N", E: "W", W: "E" }, Xs = {
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
function ei(e) {
  return e === 10 ? "T" : bt(e);
}
function Ft(e) {
  return Ps.map(
    (t) => e.filter((o) => o.suit === t).sort((o, r) => r.rank - o.rank).map((o) => ei(o.rank)).join("")
  ).join(".");
}
function js(e) {
  return e === "P" ? "--" : e === "X" ? "Db" : e === "XX" ? "Rd" : e;
}
function Ks(e) {
  return e.map((t) => js(t.call)).join("");
}
function Ys(e) {
  return e === "both" ? "@v@V" : e === "ns" ? "@v" : e === "ew" ? "@V" : "";
}
function Us(e) {
  return e.tricks.flatMap((t) => t.plays).map((t) => `${t.card.suit}${ei(t.card.rank)}`).join("");
}
function Pt(e, t) {
  return [
    ...e.hands[t],
    ...e.tricks.flatMap(
      (o) => o.plays.filter((r) => r.seat === t).map((r) => r.card)
    )
  ];
}
function Gs(e) {
  const t = e.trim().toUpperCase();
  if (t === "PASS" || t === "P" || t === "--" || t === "PA") return "P";
  if (t === "X" || t === "DB" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RD" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = /^([1-7])(NT|N|C|D|H|S)$/.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function Js(e) {
  const t = /^([SHDC])([2-9TJQKA])$/.exec(e.trim().toUpperCase());
  return t ? { suit: t[1], rank: Xs[t[2]] } : null;
}
function hd({
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
    const u = Ys(s.vul), p = Ks(s.auction);
    try {
      if (s.phase === "auction") {
        const g = await i("/bid", {
          hand: Ft(Pt(s, c)),
          seat: c,
          dealer: s.dealer,
          vul: u,
          ctx: p
        }), m = typeof g.bid == "string" ? g.bid : "", h = Gs(m);
        return Fe(s.auction, c).has(h) ? { call: h } : (r == null || r(`BEN answered "${m}" for ${c}, which is not legal here`), null);
      }
      if (s.phase === "play") {
        const g = Us(s), m = ((b = s.contract) == null ? void 0 : b.declarer) ?? null, h = m ? _s[m] : null, y = c === h && m ? m : c, N = g === "" ? await i("/lead", {
          hand: Ft(Pt(s, c)),
          seat: c,
          dealer: s.dealer,
          vul: u,
          ctx: p
        }) : await i("/play", {
          hand: Ft(Pt(s, y)),
          dummy: h ? Ft(Pt(s, h)) : "",
          seat: y,
          dealer: s.dealer,
          vul: u,
          ctx: p,
          played: g
        }), $ = typeof N.card == "string" ? N.card : "", I = Js($);
        return I ? Ut(s, c).some((S) => S.suit === I.suit && S.rank === I.rank) ? { card: I } : (r == null || r(`BEN's ${$} is not legal for ${c} here`), null) : (r == null || r(`BEN answered "${$}" for ${c}, which is not a card`), null);
      }
      return null;
    } catch (g) {
      return r == null || r(`BEN could not be reached (${g.message})`), null;
    }
  };
}
const Vs = {
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
    const r = Vs[o.toUpperCase()];
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
function ti(e) {
  return e.reduce((t, o) => t + Math.max(0, o.rank - 10), 0);
}
const ni = [
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
function Qs(e = ni) {
  var o;
  const t = [];
  for (const r of e) {
    r.hand.length !== 13 && t.push({ no: r.no, kind: "short", detail: `${r.hand.length} cards, not 13` });
    const a = (o = /(\d+)\s*HCP/i.exec(r.why)) == null ? void 0 : o[1], l = ti(r.hand);
    a && Number(a) !== l && t.push({ no: r.no, kind: "hcp", detail: `note says ${a} HCP, cards hold ${l}` });
  }
  return t;
}
const qs = /^([1-7])(NT?|[CDHS])$/;
function vt(e) {
  const t = (e ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (t === "P" || t === "PASS" || t === "NB" || t === "NOBID") return "P";
  if (t === "X" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RDBL" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = qs.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function ud(e, t) {
  return vt(e) === vt(t);
}
function Zs(e, t, o) {
  const r = vt(e.bid), a = vt(o);
  return { index: t, no: e.no, yourCall: a, authorCall: r, matched: a === r };
}
function ed(e, t) {
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
const td = [...Fe([], "S")], nd = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, od = (e) => e === "H" || e === "D", rd = (e) => /^[1-7][CDHSN]$/.test(e), On = "#fbfbfa", it = "rgba(0,0,0,0.10)", at = "#111827", lt = "#6B7280", br = "#2f5c8f", pt = "#1a7f4b", Xt = "#b4451c", oi = "#8a5a00", ri = "#fff8e6", ii = "rgba(180,130,0,0.35)";
function jt({ call: e, size: t = 15, tone: o = at }) {
  const r = vt(e);
  if (!rd(r))
    return /* @__PURE__ */ n("span", { style: { fontSize: t, fontWeight: 700, color: o }, children: r === "P" ? "Pass" : r });
  const a = r[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: t, fontWeight: 700, color: o, whiteSpace: "nowrap" }, children: [
    r[0],
    /* @__PURE__ */ n("span", { style: { color: od(a) ? "#cc0000" : o }, children: nd[a] })
  ] });
}
function yr({ problems: e }) {
  const t = e.filter((r) => r.kind === "short"), o = e.filter((r) => r.kind === "hcp");
  return /* @__PURE__ */ d(
    "div",
    {
      style: {
        background: ri,
        border: `1px solid ${ii}`,
        borderRadius: 10,
        padding: "8px 10px",
        marginBottom: 10,
        fontSize: 12,
        lineHeight: 1.45,
        color: oi
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
function pd({
  hands: e = ni,
  limit: t,
  showDataNotice: o = !0,
  onProgress: r,
  onComplete: a
}) {
  const l = ce(
    () => t && t > 0 ? e.slice(0, t) : e.slice(),
    [e, t]
  ), i = ce(() => Qs([...e]), [e]), s = ce(
    () => JSON.stringify(l.map((A) => [A.no, A.bid, A.hand.length])),
    [l]
  ), [c, u] = J(0), [p, b] = J({}), [g, m] = J(null), [h, y] = J(!1), N = ne(!1), $ = He(() => {
    u(0), b({}), m(null), y(!1), N.current = !1;
  }, []), I = ne(s);
  I.current !== s && (I.current = s, (c !== 0 || h || Object.keys(p).length) && $());
  const _ = ce(
    () => l.flatMap((A, L) => {
      const Z = p[L];
      return Z ? [Zs(A, L, Z)] : [];
    }),
    [l, p]
  ), S = ce(() => ed(_, l.length), [_, l.length]), H = ne(r);
  H.current = r;
  const x = ne(a);
  x.current = a, me(() => {
    var A;
    S.handsDone === 0 && !h || (A = H.current) == null || A.call(H, S);
  }, [S, h]), me(() => {
    var A;
    !h || N.current || (N.current = !0, (A = x.current) == null || A.call(x, S, _));
  }, [h, S, _]);
  const X = ne(null), [M, k] = J(560);
  me(() => {
    const A = X.current;
    if (!A) return;
    const L = () => k(A.clientWidth || 560);
    L();
    const Z = new ResizeObserver(L);
    return Z.observe(A), () => Z.disconnect();
  }, []);
  const T = 260, R = 12, j = 12, B = M >= T + j + 230 + R * 2, q = (B ? M - R * 2 - j - T : M - R * 2) - 6, P = Math.max(24, Math.min(34, Math.floor((q - 70) / 5.65))), te = 5 * (P + 14) + 4 * Math.round(P * 0.13), z = 24, U = z + cl(P, { pending: !0 }), D = B ? M - R * 2 - j - te : M - R * 2, w = Math.max(17, Math.min(28, Math.floor(D / 13)));
  if (l.length === 0)
    return /* @__PURE__ */ n("div", { style: { padding: 16, fontSize: 13, color: lt, background: On, border: `1px solid ${it}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const O = l[Math.min(c, l.length - 1)], F = _.find((A) => A.index === c) ?? null, ee = ti(O.hand), K = 13 - O.hand.length, fe = /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }, children: l.map((A, L) => {
    const Z = _.find((C) => C.index === L);
    return /* @__PURE__ */ n(
      "span",
      {
        title: `Hand ${L + 1}`,
        style: {
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: Z ? Z.matched ? pt : Xt : "transparent",
          border: `1.5px solid ${L === c && !h ? br : "rgba(0,0,0,0.22)"}`,
          boxSizing: "border-box"
        }
      },
      L
    );
  }) }), le = () => c + 1 < l.length ? u(c + 1) : y(!0);
  if (h)
    return /* @__PURE__ */ d("div", { ref: X, style: { background: On, border: `1px solid ${it}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ n(
        qn,
        {
          line: "Drill complete",
          score: `${S.matched} of ${S.handsDone} matched`,
          detail: `the author's opening bid · ${S.percent}%`
        }
      ) }),
      /* @__PURE__ */ n("div", { style: { marginTop: 12, maxHeight: 240, overflowY: "auto" }, children: _.map((A) => /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${it}`,
            fontSize: 13,
            color: lt
          },
          children: [
            /* @__PURE__ */ d("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              A.no
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { children: "you" }),
              /* @__PURE__ */ n(jt, { call: A.yourCall, tone: A.matched ? pt : Xt })
            ] }),
            !A.matched && /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ n("span", { children: "the book" }),
              /* @__PURE__ */ n(jt, { call: A.authorCall })
            ] }),
            /* @__PURE__ */ n("span", { style: { marginLeft: "auto", color: A.matched ? pt : Xt, fontWeight: 700 }, children: A.matched ? "match" : "no" })
          ]
        },
        A.index
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
            border: `1px solid ${it}`,
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
      o && i.length > 0 && /* @__PURE__ */ n("div", { style: { marginTop: 12 }, children: /* @__PURE__ */ n(yr, { problems: i }) })
    ] });
  const ie = /* @__PURE__ */ d("div", { style: { flex: B ? "1 1 0" : void 0, minWidth: 0, alignSelf: B ? "stretch" : void 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }, children: [
    /* @__PURE__ */ n(Nt, { cards: O.hand, panelBg: "#fff", width: "100%", font: w, suitW: Math.round(w * 0.9), pad: "6px 10px" }),
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, color: lt }, children: [
      /* @__PURE__ */ d("span", { style: { fontWeight: 700, color: at }, children: [
        ee,
        " HCP"
      ] }),
      /* @__PURE__ */ d("span", { children: [
        O.hand.length,
        " cards"
      ] })
    ] }),
    K > 0 && /* @__PURE__ */ d("p", { style: { fontSize: 11.5, lineHeight: 1.4, color: oi, background: ri, border: `1px solid ${ii}`, borderRadius: 8, padding: "6px 8px", margin: 0 }, children: [
      "This hand was supplied ",
      K === 1 ? "one card" : `${K} cards`,
      " short, so the diagram is incomplete. The opening call it teaches is unaffected — bid it as it stands."
    ] })
  ] }), v = F && // height:100% + the button on `marginTop:auto` — the card fills the slot the
  // pad vacated and puts "Next hand" on the slot's bottom edge, so it is in
  // the same place on every one of the 25 hands rather than wherever this
  // hand's reason happened to end.
  /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", background: "#fff", border: `1px solid ${it}`, borderRadius: 10, padding: "10px 12px" }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: lt }, children: [
      /* @__PURE__ */ n("span", { children: "You bid" }),
      /* @__PURE__ */ n(jt, { call: F.yourCall, size: 17, tone: F.matched ? pt : at }),
      F.matched ? /* @__PURE__ */ n("span", { style: { color: pt, fontWeight: 700 }, children: "— that is the opening bid." }) : /* @__PURE__ */ d(ye, { children: [
        /* @__PURE__ */ n("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
        /* @__PURE__ */ n("span", { children: "the opening bid is" }),
        /* @__PURE__ */ n(jt, { call: F.authorCall, size: 17, tone: Xt })
      ] })
    ] }),
    /* @__PURE__ */ n("p", { style: { fontSize: 12.5, lineHeight: 1.4, color: at, marginTop: 6, marginBottom: 0 }, children: O.why }),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: le,
        style: {
          marginTop: "auto",
          alignSelf: "flex-start",
          height: 38,
          padding: "0 18px",
          border: 0,
          borderRadius: 8,
          background: br,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer"
        },
        children: c + 1 < l.length ? "Next hand →" : "See how you did"
      }
    )
  ] }), W = /* @__PURE__ */ n(
    "div",
    {
      style: {
        flex: B ? `0 0 ${te}px` : void 0,
        width: B ? te : "100%",
        minHeight: U,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 6
      },
      children: F ? /* @__PURE__ */ n("div", { style: { width: "100%", flex: 1, minHeight: 0, display: "flex" }, children: v }) : /* @__PURE__ */ d(ye, { children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 12, lineHeight: `${z - 6}px`, color: lt, alignSelf: "flex-start" }, children: g ? "Confirm your call" : "Your opening call?" }),
        /* @__PURE__ */ n(
          mt,
          {
            cell: P,
            radius: 6,
            legalCalls: td,
            live: !0,
            pending: g,
            onStage: m,
            onConfirm: () => {
              g && (b((A) => ({ ...A, [c]: g })), m(null));
            },
            onCancel: () => m(null)
          }
        )
      ] })
    }
  );
  return /* @__PURE__ */ d("div", { ref: X, style: { background: On, border: `1px solid ${it}`, borderRadius: 12, padding: R }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 10px", marginBottom: 8 }, children: [
      /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 700, color: at, flex: "none" }, children: [
        "Hand ",
        c + 1,
        " of ",
        l.length
      ] }),
      /* @__PURE__ */ n("span", { style: { fontSize: 12, color: lt, flex: "none" }, children: "you deal, nobody vulnerable" }),
      fe
    ] }),
    o && i.length > 0 && /* @__PURE__ */ n(yr, { problems: i }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: B ? "row" : "column", gap: j, alignItems: "flex-start" }, children: [
      ie,
      W
    ] })
  ] });
}
export {
  pd as BiddingChallenge,
  sd as BiddingDrill,
  wa as BridgeTable,
  cd as ChallengeCreator,
  fd as ChallengePlayer,
  dd as DealDiagram,
  Te as MAX_BOARDS,
  dt as MIN_BOARDS,
  ni as OPENING_BID_HANDS,
  Ds as buildSoloResults,
  ud as callsMatch,
  hd as createBenDecider,
  ti as hcp,
  Zs as judgeHand,
  ed as markAnswers,
  vt as normalizeCall,
  qr as normalizeDraft,
  Zn as packFromDraft,
  Ve as seededDeal,
  vs as validateDraft,
  Qs as validateDrillHands
};
//# sourceMappingURL=table-embed.js.map
