import { jsxs as h, jsx as n, Fragment as dt } from "react/jsx-runtime";
import { createContext as Vn, useContext as qn, useState as se, useRef as re, useCallback as Me, useLayoutEffect as _e, useEffect as Ne, useMemo as Fe } from "react";
function Ft(e) {
  return `${e.suit}${e.rank}`;
}
const ft = ["S", "W", "N", "E"];
function He(e) {
  return ft[(ft.indexOf(e) + 1) % 4];
}
function Jn(e) {
  return He(He(e));
}
function an(e, o) {
  return e === o || Jn(e) === o;
}
function Qn(e, o) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const i = o === "N" || o === "S";
  return e === "ns" ? i : !i;
}
function Oe(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
const cn = ["C", "D", "H", "S", "N"];
function Xt(e) {
  return Oe(e) ? (Number(e[0]) - 1) * 5 + cn.indexOf(e[1]) : -1;
}
function Lt(e, o) {
  const i = /* @__PURE__ */ new Set(["P"]);
  let a = -1;
  for (const l of e) a = Math.max(a, Xt(l.call));
  for (let l = 1; l <= 7; l++)
    for (const r of cn) {
      const c = `${l}${r}`;
      Xt(c) > a && i.add(c);
    }
  let f = null;
  for (let l = e.length - 1; l >= 0; l--)
    if (e[l].call !== "P") {
      f = e[l];
      break;
    }
  return f && !an(f.seat, o) && (Oe(f.call) ? i.add("X") : f.call === "X" && i.add("XX")), i;
}
function Zn(e) {
  if (e.length < 4) return !1;
  const o = e.slice(-3);
  return o.length === 3 && o.every((i) => i.call === "P");
}
function eo(e) {
  let o = null, i = 0;
  for (const r of e)
    Oe(r.call) ? (o = r, i = 0) : r.call === "X" ? i = 1 : r.call === "XX" && (i = 2);
  if (!o) return null;
  const a = o.call[1], f = o.seat;
  let l = o.seat;
  for (const r of e)
    if (Oe(r.call) && r.call[1] === a && an(r.seat, f)) {
      l = r.seat;
      break;
    }
  return { level: Number(o.call[0]), strain: a, doubled: i, declarer: l };
}
function Pt(e, o, i, a) {
  return {
    boardRef: e,
    dealer: o,
    vul: i,
    hands: {
      N: [...a.N],
      E: [...a.E],
      S: [...a.S],
      W: [...a.W]
    },
    auction: [],
    contract: null,
    phase: "auction",
    turn: o,
    tricks: [],
    trickCount: { NS: 0, EW: 0 }
  };
}
const sn = (e) => e === "N" || e === "S" ? "NS" : "EW";
function to(e, o) {
  const i = e.plays[0].card.suit, a = (l, r) => {
    const c = o !== "N" && l.suit === o, u = o !== "N" && r.suit === o;
    if (c && !u) return !0;
    if (u && !c) return !1;
    if (c && u) return l.rank > r.rank;
    const g = l.suit === i, m = r.suit === i;
    return g && !m ? !0 : m && !g ? !1 : l.rank > r.rank;
  };
  let f = e.plays[0];
  for (const l of e.plays.slice(1)) a(l.card, f.card) && (f = l);
  return f.seat;
}
function Ot(e, o) {
  const i = e.hands[o], a = e.tricks[e.tricks.length - 1];
  if (!a || a.plays.length === 0 || a.plays.length === 4) return [...i];
  const l = a.plays[0].card.suit, r = i.filter((c) => c.suit === l);
  return r.length ? r : [...i];
}
function Xe(e, o) {
  if (o.category === "bid-event") {
    const x = [...e.auction, { seat: o.seat, call: o.call }];
    if (!Zn(x))
      return { ...e, auction: x, turn: He(o.seat) };
    const C = eo(x);
    if (!C)
      return { ...e, auction: x, contract: null, phase: "complete" };
    const y = He(C.declarer);
    return {
      ...e,
      auction: x,
      contract: C,
      phase: "play",
      turn: y,
      tricks: [{ leader: y, plays: [] }]
    };
  }
  const i = o.seat, a = {
    ...e.hands,
    [i]: e.hands[i].filter((x) => Ft(x) !== Ft(o.card))
  }, f = e.tricks.map((x) => ({ ...x, plays: [...x.plays] }));
  let l = f[f.length - 1];
  if ((!l || l.plays.length === 4) && (l = { leader: i, plays: [] }, f.push(l)), l.plays.push({ seat: i, card: o.card }), l.plays.length < 4)
    return { ...e, hands: a, tricks: f, turn: He(i) };
  const r = e.contract ? e.contract.strain : "N", c = to(l, r);
  l.winner = c;
  const u = sn(c), g = { ...e.trickCount, [u]: e.trickCount[u] + 1 }, m = a.N.length === 0 && a.E.length === 0 && a.S.length === 0 && a.W.length === 0;
  return {
    ...e,
    hands: a,
    tricks: f,
    trickCount: g,
    turn: c,
    phase: m ? "complete" : "play"
  };
}
const jt = { C: 20, D: 20, H: 30, S: 30 };
function no(e) {
  if (e.phase !== "complete") return null;
  const o = e.contract;
  if (!o)
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
  const i = sn(o.declarer), a = e.trickCount[i], f = 6 + o.level, l = a - f, r = l >= 0, c = Qn(e.vul, o.declarer), u = o.doubled, g = u === 2 ? 4 : u === 1 ? 2 : 1;
  let m = 0, x = 0, C = 0, y = 0, W = 0, B = 0, R = 0;
  if (r) {
    m = o.strain === "N" ? (40 + (o.level - 1) * 30) * g : jt[o.strain] * o.level * g;
    const P = u === 0 ? o.strain === "N" ? 30 : jt[o.strain] : (c ? 200 : 100) * (u === 2 ? 2 : 1);
    x = l * P, m >= 100 ? C = c ? 500 : 300 : y = 50, o.level === 6 && (W = c ? 750 : 500), o.level === 7 && (W = c ? 1500 : 1e3), u > 0 && (B = 50 * u);
  } else {
    const P = -l;
    if (u === 0)
      R = P * (c ? 100 : 50);
    else {
      let I = 0;
      for (let b = 1; b <= P; b++)
        b === 1 ? I += c ? 200 : 100 : b <= 3 ? I += c ? 300 : 200 : I += 300;
      R = I * (u === 2 ? 2 : 1);
    }
  }
  const $ = r ? m + x + C + y + W + B : -R;
  return {
    contract: o,
    tricksTaken: a,
    result: l,
    made: r,
    vulnerable: c,
    trickScore: m,
    overtrickScore: x,
    gameBonus: C,
    partscoreBonus: y,
    slamBonus: W,
    insultBonus: B,
    penalty: R,
    declarerScore: $,
    nsScore: i === "NS" ? $ : -$
  };
}
function oo(e) {
  if (!e.contract) return "Passed out";
  const o = e.contract, i = o.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[o.strain], a = o.doubled === 1 ? " X" : o.doubled === 2 ? " XX" : "", f = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${o.level}${i}${a} by ${o.declarer}, ${f}`;
}
function io(e) {
  let o = e >>> 0;
  return () => {
    o |= 0, o = o + 1831565813 | 0;
    let i = Math.imul(o ^ o >>> 15, 1 | o);
    return i = i + Math.imul(i ^ i >>> 7, 61 | i) ^ i, ((i ^ i >>> 14) >>> 0) / 4294967296;
  };
}
function ro(e) {
  const o = io(e), a = ["S", "H", "D", "C"].flatMap(
    (l) => Array.from({ length: 13 }, (r, c) => ({ suit: l, rank: c + 2 }))
  );
  for (let l = a.length - 1; l > 0; l--) {
    const r = Math.floor(o() * (l + 1));
    [a[l], a[r]] = [a[r], a[l]];
  }
  const f = { N: [], E: [], S: [], W: [] };
  return a.forEach((l, r) => f[ft[r % 4]].push(l)), f;
}
const lo = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, ao = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, co = { skin: "bbo" }, so = {
  skins: lo,
  strainTint: ao,
  defaults: co
}, pt = so, _t = pt.skins, rt = pt.strainTint, fo = {
  skin: pt.defaults.skin
};
function dn(e, o = {}) {
  const i = _t[e] ?? _t[fo.skin], a = (l) => {
    const r = o[l];
    return typeof r == "string" && r.trim() !== "" ? r : void 0;
  }, f = a("feltColor");
  return {
    ...i,
    felt: f ?? i.felt,
    feltFlat: f ?? i.feltFlat,
    accent: a("accent") ?? i.accent,
    trayBg: a("bidBoxColor") ?? i.trayBg,
    auctionBg: a("auctionColor") ?? i.auctionBg,
    cardBack: a("cardBackColor") ?? i.cardBack
  };
}
const uo = ["N", "S", "H", "D", "C"], fn = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, ho = [1, 2, 3, 4, 5, 6, 7], po = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${fn[e[1] ?? "N"] ?? ""}`;
function lt({
  cell: e = 46,
  minCellH: o = 0,
  radius: i = 5,
  legalCalls: a,
  live: f,
  pending: l,
  onStage: r,
  onConfirm: c,
  onCancel: u
}) {
  const g = Math.round(e * 0.13), m = Math.round(e * 0.11), x = e, C = Math.max(Math.round(e * 0.92), o), y = Math.round(e * 3.4), W = Math.round(e * 0.62), B = Math.round(e * 0.42), R = new Set(a), $ = l != null, P = (b, z) => {
    const L = `${z}${b}`, A = rt[b], D = R.has(L), q = f && !$ && D;
    return /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: q ? () => r(L) : void 0,
        "aria-label": `${z}${b === "N" ? "NT" : b}`,
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: x,
          height: C,
          padding: 0,
          background: "transparent",
          border: 0,
          color: A.ink,
          lineHeight: 1,
          cursor: q ? "pointer" : "default",
          opacity: D ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ n("span", { style: { fontSize: W, fontWeight: 700, lineHeight: 1 }, children: z }),
          /* @__PURE__ */ n("span", { style: { fontSize: B, fontWeight: 700, lineHeight: 1 }, children: fn[b] })
        ]
      },
      L
    );
  }, I = (b, z, L, A, D, q) => {
    const le = R.has(b), k = f && !$ && le;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        disabled: $,
        onClick: k ? () => r(b) : void 0,
        "aria-label": b === "P" ? "Pass" : b === "X" ? "Double" : "Redouble",
        style: {
          width: L,
          height: C,
          background: A,
          border: `2px solid ${D}`,
          borderRadius: i,
          color: "#fff",
          fontWeight: 700,
          fontSize: W,
          lineHeight: 1,
          cursor: k ? "pointer" : "default",
          opacity: le ? 1 : 0.3,
          ...q
        },
        children: z
      },
      b
    );
  };
  return /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: g }, children: [
    l != null && /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 20, fontWeight: 700, color: "#12281f" }, children: po(l) }),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: c,
          style: { height: 38, padding: "0 16px", border: "1px solid #0c4b0b", borderRadius: i, background: "#116710", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Confirm"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: u,
          style: { height: 38, padding: "0 16px", border: "1px solid #5e1c1c", borderRadius: i, background: "#8a3030", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: g }, children: uo.map((b) => /* @__PURE__ */ n(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: g,
          padding: m,
          background: rt[b].bg,
          border: `2px solid ${rt[b].edge}`,
          borderRadius: i
        },
        children: ho.map((z) => P(b, z))
      },
      b
    )) }),
    /* @__PURE__ */ h("div", { style: { display: "flex", gap: g }, children: [
      I("P", "Pass", y, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      I("X", "X", x, "#7a5b3a", "#5e4227"),
      I("XX", "XX", x, "#2b6b73", "#1c4d53")
    ] })
  ] });
}
const go = {
  LinkComponent: "a",
  navigate: (e, { replace: o }) => {
    typeof window > "u" || (o ? window.location.replace(e) : window.location.assign(e));
  }
}, bo = Vn(go);
function un() {
  return qn(bo);
}
const ut = "#384bb3", Yt = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: ut, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, Gt = 48;
function Re({
  side: e,
  items: o,
  thickness: i = 44,
  condensed: a = !1,
  scale: f,
  minTouch: l = 30,
  bg: r = "rgba(9,22,17,.90)",
  accent: c = ut
}) {
  const [u, g] = se(99), [m, x] = se(99), [C, y] = se(!1), W = re(null), B = re(null), R = re(null), $ = re(() => {
  }), P = c === ut ? Yt : { ...Yt, accent: { bg: c, border: c, color: "#fff" } }, I = i, b = Math.min(
    Math.round(I * 2.2),
    Math.max(
      Math.round(I * 0.68),
      I - 14,
      f ? Math.ceil(l / Math.max(0.05, f)) : 0
    )
  ), { LinkComponent: z } = un(), L = a ? 5 : 7, A = Math.round(b * (a ? 0.17 : 0.4)), D = Math.max(a ? 11 : 13, Math.round(b * (a ? 0.28 : 0.4))), q = Math.round(b * 0.86), le = Math.max(9, Math.round(b * 0.26));
  let k = -1;
  o.forEach((s, E) => {
    s.kind === "spacer" && (k = E);
  });
  const X = k < 0 ? o : o.slice(0, k), H = k < 0 ? [] : o.slice(k + 1), ne = X.length, p = H.length, J = Math.max(0, Math.min(u, ne)), w = Math.max(1, Math.min(m, p)), N = H.slice(H.length - w), O = X.slice(J).concat(H.slice(0, H.length - w)).filter((s) => s.kind !== "divider"), Q = O.length > 0, j = C && Q, M = Me(() => {
    const s = W.current;
    if (!s) return;
    const E = Math.min(u, ne), Y = s.clientWidth;
    if (Y > 0) {
      if (s.scrollWidth > Y + 1) {
        const ye = parseFloat(getComputedStyle(s).gap) || 0;
        let pe = 0, oe = 0;
        for (const Ee of Array.from(s.children))
          if (pe += Ee.offsetWidth + (oe ? ye : 0), pe <= Y) oe++;
          else break;
        oe < E && g(oe);
        return;
      }
      if (Y - s.scrollWidth > Gt && E < ne) {
        g(E + 1);
        return;
      }
      if (E !== u) {
        g(E);
        return;
      }
    }
    const F = B.current;
    if (!F) return;
    const U = Math.min(m, p);
    E === 0 && F.scrollWidth > F.clientWidth + 1 && U > 1 ? x(U - 1) : F.clientWidth - F.scrollWidth > Gt && U < p ? x(U + 1) : U !== m && x(U);
  }, [u, m, ne, p]);
  _e(() => {
    $.current = M, M();
  }), Ne(() => {
    const s = (E) => {
      B.current && !B.current.contains(E.target) && y(!1);
    };
    return document.addEventListener("mousedown", s), () => {
      document.removeEventListener("mousedown", s), R.current && R.current.disconnect();
    };
  }, []);
  const $e = Me((s) => {
    R.current && (R.current.disconnect(), R.current = null), W.current = s, B.current = s ? s.parentElement : null, s && (typeof ResizeObserver == "function" && (R.current = new ResizeObserver(() => $.current()), R.current.observe(s)), $.current());
  }, []), _ = (s, E) => {
    if (s.kind === "spacer") return null;
    if (s.kind === "node")
      return /* @__PURE__ */ n("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: L }, children: s.node }, E);
    if (s.kind === "divider")
      return /* @__PURE__ */ n("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, E);
    if (s.kind === "chip")
      return /* @__PURE__ */ h("div", { title: s.title ?? s.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: q, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: le, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: s.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: D, fontWeight: 700, lineHeight: 1, color: s.color ?? "#eef4f1" }, children: s.value })
      ] }, E);
    const Y = P[s.tone ?? "plain"], F = s.disabled === !0, U = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: s.kind === "icon" ? b : void 0,
      height: b,
      padding: s.kind === "icon" ? 0 : `0 ${A}px`,
      border: `1px solid ${Y.border}`,
      borderRadius: 6,
      background: Y.bg,
      color: Y.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: D,
      fontWeight: s.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: F || !s.on && !s.href ? "default" : "pointer",
      opacity: F ? 0.42 : 1
    };
    return s.href && !F ? /* @__PURE__ */ n(z, { href: s.href, title: s.title ?? s.label, "aria-label": s.ariaLabel, style: U, children: s.label }, E) : /* @__PURE__ */ n("button", { type: "button", title: s.title ?? s.label, "aria-label": s.ariaLabel, disabled: F, onClick: F ? void 0 : s.on ?? void 0, style: U, children: s.label }, E);
  }, fe = (s, E) => {
    if (s.kind === "divider" || s.kind === "spacer") return null;
    if (s.kind === "chip")
      return /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: s.label }),
        /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: s.color ?? "#eef4f1" }, children: s.value })
      ] }, E);
    if (s.kind === "node")
      return /* @__PURE__ */ n("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: s.node }, E);
    const Y = P[s.tone ?? "plain"], F = s.disabled === !0, U = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: b,
      marginBottom: 4,
      padding: `0 ${A}px`,
      border: `1px solid ${Y.border}`,
      borderRadius: 6,
      background: Y.bg,
      color: Y.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: D,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: F || !s.on && !s.href ? "default" : "pointer",
      opacity: F ? 0.42 : 1
    }, ye = () => y(!1);
    return s.href && !F ? /* @__PURE__ */ n(z, { href: s.href, title: s.title ?? s.label, "aria-label": s.ariaLabel, style: U, onClick: ye, children: s.label }, E) : /* @__PURE__ */ n("button", { type: "button", title: s.title ?? s.label, "aria-label": s.ariaLabel, disabled: F, onClick: F ? void 0 : () => {
      var pe;
      (pe = s.on) == null || pe.call(s), ye();
    }, style: U, children: s.label }, E);
  }, ue = Math.max(I, b + 14), ve = {
    position: "absolute",
    ...e === "bottom" ? { bottom: b + 12 } : { top: b + 12 },
    right: 0,
    zIndex: 40,
    minWidth: Math.round(b * 4.2),
    maxHeight: Math.round(b * 7),
    overflowY: "auto",
    padding: 8,
    borderRadius: 8,
    background: "#0f1a16",
    border: "1px solid rgba(255,255,255,.16)",
    boxShadow: "0 10px 26px rgba(0,0,0,.45)"
  };
  return /* @__PURE__ */ h(
    "div",
    {
      "data-testid": "edge-toolbar",
      style: { width: "100%", [a ? "height" : "minHeight"]: ue, flex: "none", display: "flex", alignItems: "center", gap: L, padding: `6px ${a ? 8 : 10}px`, background: r, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ n(
          "div",
          {
            ref: $e,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: L, ...a ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: X.slice(0, J).map(_)
          }
        ),
        Q && /* @__PURE__ */ h("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ h(
            "button",
            {
              type: "button",
              onClick: () => y((s) => !s),
              title: `${O.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: b, padding: `0 ${A}px`, border: `1px solid ${j ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: j ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: D, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ n("span", { children: "⋯" }),
                /* @__PURE__ */ n("span", { style: { fontSize: le, opacity: 0.8 }, children: O.length })
              ]
            }
          ),
          j && /* @__PURE__ */ n("div", { style: ve, children: O.map(fe) })
        ] }),
        N.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: L }, children: N.map(_) })
      ]
    }
  );
}
function Ut({
  title: e = "Table settings",
  accent: o = "#384bb3",
  items: i,
  onClose: a
}) {
  const { navigate: f } = un(), l = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, r = (c) => /* @__PURE__ */ h(dt, { children: [
    /* @__PURE__ */ n("span", { children: c.label }),
    /* @__PURE__ */ n("span", { style: { flex: "none", fontWeight: 700, color: o }, children: c.value })
  ] });
  return /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, zIndex: 20 }, children: [
    /* @__PURE__ */ n(
      "div",
      {
        style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" },
        onClick: a,
        "aria-hidden": !0
      }
    ),
    /* @__PURE__ */ h("div", { style: { position: "absolute", left: 12, top: 12, width: 268, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.5)", overflow: "hidden" }, children: [
      /* @__PURE__ */ n("div", { style: { background: o, color: "#fff", fontSize: 17, fontWeight: 700, padding: "6px 10px" }, children: e }),
      i.map(
        (c) => c.action ? (
          // A server action persists the change; the resulting server
          // re-render preserves the client menuOpen state, so the menu stays
          // open exactly as an href row does.
          /* @__PURE__ */ n("form", { action: c.action, style: { margin: 0, display: "block" }, children: /* @__PURE__ */ n("button", { type: "submit", style: l, children: r(c) }) }, c.label)
        ) : /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: c.on ?? (c.href ? () => {
              const u = c.href.split("?")[0] === window.location.pathname;
              f(c.href, { replace: u });
            } : void 0),
            style: l,
            children: r(c)
          },
          c.label
        )
      )
    ] })
  ] });
}
const ae = "#cc0000", at = "#fecd07", hn = "#d3d3d3", Kt = "#f2e2b8", yo = "#b8901f", pn = "#12525e", te = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Le = ["C", "D", "H", "S", "N"], ct = ["W", "N", "E", "S"], je = ["S", "H", "C", "D"], xo = { N: "S", S: "N", E: "W", W: "E" }, de = (e) => e === "H" || e === "D", he = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), mo = (e) => /^[1-7][CDHSN]$/.test(e), ht = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${te[e[1] ?? ""] ?? ""}`, gn = (e) => mo(e) && de(e[1] ?? "") ? ae : "#000", ko = (e) => e === "N" || e === "S" ? "NS" : "EW";
function st({
  cards: e,
  metrics: o,
  layout: i,
  hidden: a = !1,
  fanSpread: f,
  fanRadius: l,
  backColor: r,
  backCount: c,
  backMetrics: u = { w: 14, h: 71 },
  isPlayable: g,
  onPlay: m
}) {
  if (a) {
    const k = Math.max(1, c ?? e.length);
    return /* @__PURE__ */ n("div", { style: { display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }, children: Array.from({ length: k }, (X, H) => /* @__PURE__ */ n("span", { style: { display: "block", width: u.w, height: u.h, background: r, borderLeft: H ? "1.5px solid rgba(255,255,255,.92)" : "none" } }, H)) });
  }
  const x = [...e].sort(
    (k, X) => je.indexOf(k.suit) - je.indexOf(X.suit) || X.rank - k.rank
  );
  if (i === "row")
    return /* @__PURE__ */ n("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: x.map((k, X) => {
      const H = g ? g(k) : !1;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: H ? () => m == null ? void 0 : m(k) : void 0,
          "aria-label": `Play ${he(k.rank)}${te[k.suit]}`,
          style: {
            position: "relative",
            display: "block",
            width: o.w,
            height: o.h,
            flex: "none",
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: X === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
            marginLeft: X === 0 ? 0 : -1,
            padding: 0,
            cursor: H ? "pointer" : "default",
            transform: H ? "translateY(-6px)" : "none",
            transition: "transform 120ms ease"
          },
          children: /* @__PURE__ */ h("span", { style: { position: "absolute", left: o.inset, top: o.inset > 3 ? o.inset : 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: de(k.suit) ? ae : "#000" }, children: [
            /* @__PURE__ */ n("span", { style: { fontSize: o.rank, fontWeight: 700 }, children: he(k.rank) }),
            /* @__PURE__ */ n("span", { style: { fontSize: o.glyph }, children: te[k.suit] })
          ] })
        },
        `${k.suit}${k.rank}`
      );
    }) });
  const C = x.length, y = o.w, W = o.h, B = f, R = l > 0 ? l : Math.round(W * 4.2), $ = (k) => C <= 1 ? 0 : -B / 2 + k * (B / (C - 1));
  let P = 0, I = 0, b = 0, z = 0;
  for (let k = 0; k < C; k++) {
    const X = $(k) * Math.PI / 180, H = Math.cos(X), ne = Math.sin(X);
    for (const p of [-y / 2, y / 2])
      for (const J of [-R, -R + W]) {
        const w = p * H - J * ne, N = p * ne + J * H;
        w < P && (P = w), w > I && (I = w), N < b && (b = N), N > z && (z = N);
      }
  }
  const L = Math.ceil(Math.max(-P, I) * 2) + 4, A = Math.ceil(z - b) + 4, D = Math.ceil(-b - R) + 2, q = o.rank, le = o.glyph;
  return /* @__PURE__ */ n("div", { style: { position: "relative", width: L, height: A }, children: x.map((k, X) => {
    const H = g ? g(k) : !1;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: H ? () => m == null ? void 0 : m(k) : void 0,
        "aria-label": `Play ${he(k.rank)}${te[k.suit]}`,
        style: {
          position: "absolute",
          left: "50%",
          top: D,
          width: y,
          height: W,
          padding: 0,
          background: "#fff",
          border: "1px solid #6b6b6b",
          borderRadius: 4,
          boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
          transform: `translateX(-50%) rotate(${$(X)}deg)${H ? " translateY(-14px)" : ""}`,
          transformOrigin: `50% ${R}px`,
          transition: "transform 120ms ease",
          cursor: H ? "pointer" : "default"
        },
        children: /* @__PURE__ */ h("span", { style: { position: "absolute", left: o.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: de(k.suit) ? ae : "#000" }, children: [
          /* @__PURE__ */ n("span", { style: { fontSize: q, fontWeight: 700 }, children: he(k.rank) }),
          /* @__PURE__ */ n("span", { style: { fontSize: le }, children: te[k.suit] })
        ] })
      },
      `${k.suit}${k.rank}`
    );
  }) });
}
function So({
  seat: e,
  name: o,
  tag: i,
  strip: a,
  bg: f,
  width: l,
  isDealer: r,
  metrics: c = {}
}) {
  const u = c.height ?? 22, g = c.badge ?? 20, m = c.font ?? 15, x = c.tagFont ?? 11;
  return /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "stretch", gap: 5, width: l, height: u, padding: "0 3px 0 0", background: f, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${r ? yo : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { flex: "none", width: 6, background: a ?? "transparent" } }),
    /* @__PURE__ */ n("span", { style: { flex: "none", width: g, height: g, alignSelf: "center", background: pn, color: "#fff", fontSize: m - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
    /* @__PURE__ */ n("span", { style: { alignSelf: "center", fontSize: m, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: o }),
    r && /* @__PURE__ */ n("span", { style: { alignSelf: "center", flex: "none", padding: "0 2px", fontSize: x, fontWeight: 700, color: "#7a5a12" }, children: "DEALER" }),
    /* @__PURE__ */ n("span", { style: { marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: x, color: "#555" }, children: i ?? "" })
  ] });
}
function vo({
  cards: e,
  panelBg: o,
  width: i,
  suitW: a,
  font: f,
  pad: l,
  bare: r,
  touch: c,
  isPlayable: u,
  onPlay: g
}) {
  const m = f ?? 19, x = !!c;
  return /* @__PURE__ */ n("div", { style: { width: i, background: r ? o : "#fff", border: r ? 0 : "1px solid #8a8a8a", borderRadius: r ? 0 : 3, padding: l ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: je.map((C) => {
    const y = e.filter((W) => W.suit === C).sort((W, B) => B.rank - W.rank);
    return /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: de(C) ? ae : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { flex: "none", width: a ?? 16, fontSize: m }, children: te[C] }),
      /* @__PURE__ */ n("span", { style: { display: "flex", flexWrap: "wrap", gap: x ? "0 4px" : "0 5px", fontSize: m }, children: y.length === 0 ? /* @__PURE__ */ n("span", { children: "—" }) : y.map((W) => {
        const B = u ? u(W) : !1;
        return /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: B ? () => g == null ? void 0 : g(W) : void 0,
            "aria-label": `Play ${he(W.rank)}${te[C]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: x ? 84 : 0, minHeight: x ? 78 : 0, background: B ? "#d9f2d9" : "transparent", border: 0, borderRadius: x ? 6 : 0, padding: x ? "0 4px" : "0 1px", fontSize: m, fontWeight: B ? 700 : 400, color: "inherit", cursor: B ? "pointer" : "default" },
            children: he(W.rank)
          },
          W.rank
        );
      }) })
    ] }, C);
  }) });
}
function wo({
  bg: e,
  m: o = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: i,
  rows: a,
  dealerCol: f,
  emptyText: l = null
}) {
  const r = re(null);
  return _e(() => {
    const c = r.current;
    c && (c.scrollTop = c.scrollHeight);
  }, [a.length]), /* @__PURE__ */ h("div", { style: { width: o.width, height: o.height, maxHeight: o.height === "auto" ? 340 : void 0, background: e, borderRadius: o.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: i.map((c) => /* @__PURE__ */ h("span", { style: { padding: "2px 0", fontSize: o.headFont, fontWeight: 700, lineHeight: 1.1, background: c.vul ? "#cc1111" : c.isDealer ? Kt : "#fff", color: c.vul ? "#fff" : "#000" }, children: [
      c.seat,
      c.isDealer ? " •" : ""
    ] }, c.seat)) }),
    /* @__PURE__ */ h("div", { ref: r, "data-testid": "auction-rows", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }, children: [
      a.map((c, u) => /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((g) => {
        const m = c[g];
        return /* @__PURE__ */ n("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: o.cellMinH ?? 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: o.cellFont, lineHeight: 1.15, background: m ? g === f ? Kt : hn : "transparent", color: m ? gn(m.call) : "#000" }, children: m ? ht(m.call) : "" }, g);
      }) }, u)),
      l != null && /* @__PURE__ */ n("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: l })
    ] })
  ] });
}
function Vt({ plays: e, turn: o, scale: i = 1, variant: a = "cross" }) {
  if (a === "pill")
    return /* @__PURE__ */ n("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((l) => {
      const r = e.find((u) => u.seat === l), c = l === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : l === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : l === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return r ? /* @__PURE__ */ h("div", { style: { position: "absolute", ...c, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: de(r.card.suit) ? ae : "#000" }, children: [
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: te[r.card.suit] }),
        /* @__PURE__ */ n("span", { style: { fontSize: 36, lineHeight: 1 }, children: he(r.card.rank) })
      ] }, l) : null;
    }) });
  const f = i;
  return /* @__PURE__ */ n("div", { style: { width: 262 * f, height: 262 * f, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("div", { style: { position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${f})`, transformOrigin: "center center" }, children: ["N", "E", "S", "W"].map((l) => {
    const r = e.find((g) => g.seat === l), c = l === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" } : l === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" } : l === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" } : { left: "206px", top: "50%", tr: "translateY(-50%)" }, u = l === o;
    return /* @__PURE__ */ n("div", { style: { position: "absolute", left: c.left, top: c.top, transform: c.tr, zIndex: r ? 2 : 1 }, children: r ? /* @__PURE__ */ n("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ h("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: de(r.card.suit) ? ae : "#000" }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 27, fontWeight: 700 }, children: he(r.card.rank) }),
      /* @__PURE__ */ n("span", { style: { fontSize: 24 }, children: te[r.card.suit] })
    ] }) }) : /* @__PURE__ */ n("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ n("span", { style: { display: "block", width: u ? 22 : 0, height: 12, background: u ? "#9a9a9a" : "transparent" } }) }) }, l);
  }) }) });
}
function Co({
  line: e,
  score: o,
  detail: i,
  action: a,
  actionNote: f,
  accent: l = "#384bb3"
}) {
  return /* @__PURE__ */ h("div", { style: { background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }, children: [
    /* @__PURE__ */ n("div", { style: { fontSize: 28, fontWeight: 700, color: "#000" }, children: e || "Board complete" }),
    o && /* @__PURE__ */ n("div", { style: { fontSize: 18, color: "#444", marginTop: 4 }, children: o }),
    /* @__PURE__ */ n("div", { style: { fontSize: 15, color: "#666", marginTop: 6 }, children: i }),
    a && /* @__PURE__ */ n(
      "a",
      {
        href: a.href,
        style: { display: "flex", alignItems: "center", justifyContent: "center", height: 48, marginTop: 14, borderRadius: 6, background: l, color: "#fff", fontSize: 19, fontWeight: 700, lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap" },
        children: a.label
      }
    ),
    a && f && /* @__PURE__ */ n("div", { style: { fontSize: 13, color: "#666", marginTop: 6 }, children: f })
  ] });
}
function Wo({ onClose: e, children: o }) {
  return /* @__PURE__ */ n("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ h("div", { onClick: (i) => i.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ n("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ n("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    o
  ] }) });
}
const Ro = "#384bb3", Bo = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function Mo({
  title: e = "Coach",
  status: o = "",
  accent: i = Ro,
  lines: a,
  actions: f
}) {
  const l = (a && a.length ? a : []).map(
    (u) => typeof u == "string" ? { text: u, color: "#28312c" } : { text: u.text ?? "", color: u.color ?? "#28312c" }
  ), r = l.length === 0, c = f && f.length ? f : [];
  return /* @__PURE__ */ h("div", { style: Bo, children: [
    /* @__PURE__ */ h("div", { style: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }, children: [
      /* @__PURE__ */ n("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: i, color: "#fff", fontSize: 12, fontWeight: 700 }, children: "C" }),
      /* @__PURE__ */ n("span", { style: { fontSize: 14, fontWeight: 700, color: "#1d2421" }, children: e }),
      /* @__PURE__ */ n("span", { style: { flex: 1 } }),
      /* @__PURE__ */ n("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }, children: o })
    ] }),
    /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }, children: [
      l.map((u, g) => /* @__PURE__ */ n("div", { style: { fontSize: 14, lineHeight: 1.45, color: u.color }, children: u.text }, g)),
      r && /* @__PURE__ */ n("div", { style: { fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }, children: "Coach commentary appears here as the deal goes on." })
    ] }),
    c.length > 0 && /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }, children: c.map((u, g) => /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: u.on ?? void 0,
        style: { height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: u.on ? "pointer" : "default" },
        children: u.label
      },
      g
    )) })
  ] });
}
const Be = { w: 1040, h: 678 }, Pe = 720, ce = { w: 54, h: 128, rank: 42, glyph: 38, inset: 5, backW: 52 }, qt = 52, Jt = 44, Qt = 54, Zt = { row: 172, fan: 238 }, en = 52, tn = 30, No = 0.3, Ho = 250, $o = 900, nn = 150, Eo = (e) => Math.ceil(24 / (e || 1)), To = 0, on = (e) => Math.round(e * 8.8), Io = 24, rn = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, zo = {
  ...dn("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, Ao = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function Do({ children: e }) {
  const o = re(null), i = re(null), [a, f] = se(1);
  return _e(() => {
    const l = () => {
      const c = o.current, u = i.current;
      if (!c || !u) return;
      const g = c.clientWidth, m = c.clientHeight, x = u.offsetWidth, C = u.offsetHeight;
      if (!g || !m || !x || !C) return;
      const y = Math.min(1, g / x, m / C);
      f((W) => Math.abs(y - W) > 5e-3 ? y : W);
    };
    l();
    const r = new ResizeObserver(l);
    return o.current && r.observe(o.current), i.current && r.observe(i.current), () => r.disconnect();
  }), /* @__PURE__ */ n("div", { ref: o, style: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch", position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ n(
    "div",
    {
      ref: i,
      style: { position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${a})`, display: "flex", alignItems: "center", justifyContent: "center" },
      children: e
    }
  ) });
}
function Fo({
  state: e,
  seats: o,
  visible: i,
  mySeat: a = null,
  legalCalls: f = [],
  legalPlays: l = [],
  myTurn: r = !1,
  boardLabel: c = "1",
  scoringLabel: u = "IMPs",
  auctionDisplay: g = "box",
  confirmBids: m = !1,
  completedAction: x,
  completedNote: C,
  resultLine: y = "",
  resultScore: W = "",
  onCall: B,
  onPlay: R,
  onMenu: $,
  onScoring: P,
  onClaim: I,
  controlsExtra: b,
  controlsExtraNarrow: z,
  railExtra: L,
  settings: A,
  viewHref: D,
  appearance: q,
  showCoach: le = !0,
  coachShare: k = 30,
  coachTitle: X = "Coach",
  coachLines: H,
  coachActions: ne
}) {
  var At;
  const p = q ?? zo, J = p.handLayout === "fan", w = p.bidPad === "columns", N = p.centreFrame, O = N ? Ao : {}, Q = Number.parseInt(p.radius, 10) || 5, j = re(null), [M, $e] = se({ w: Be.w, h: Be.h });
  _e(() => {
    const t = j.current;
    if (!t) return;
    const d = () => $e({ w: t.clientWidth || Be.w, h: t.clientHeight || Be.h });
    d();
    const v = new ResizeObserver(d);
    return v.observe(t), () => v.disconnect();
  }, []);
  const [_, fe] = se(null), [ue, ve] = se(null);
  Ne(() => {
    fe(null), ve(null);
  }, [e.auction.length]);
  const [s, E] = se(!1), Y = $ ?? (A ? () => E((t) => !t) : void 0), F = [...A ?? []], [U, ye] = se(!1), pe = M.w / Math.max(1, M.h) < 1.25, oe = pe && M.w < 640, Ee = pe && !oe, Te = Ee ? { w: Pe, h: 1268 } : Be, ie = e.contract, Ie = (ie == null ? void 0 : ie.declarer) ?? null, K = Ie && e.phase !== "auction" ? xo[Ie] : null, V = e.phase === "auction", ge = e.phase === "play", we = e.phase === "complete", be = new Set(f), bn = new Set(l.map((t) => `${t.suit}${t.rank}`)), Z = V && r && !ue, yn = (t) => e.vul === "both" || e.vul === "All" || ko(t).toLowerCase() === String(e.vul).toLowerCase(), xn = ct.indexOf(e.dealer), mn = le !== !1, Ye = Math.max(0, Math.min(55, k ?? 30)), gt = 100 - Ye, bt = ge || we, kn = Ie ? !!o[Ie].human : !1, Ge = bt && !!K && K !== "S" && kn, yt = bt && !!K && K !== "S" && !Ge, Sn = w && V, Ue = Math.min(1, M.w / Pe), ze = Math.max(240, M.h * (gt / 100) || 590), vn = (t) => {
    const d = Math.max(qt, Math.ceil(Jt / (t || 1)) + 14);
    return Math.min(d, Math.max(qt, Math.round(0.13 * ze / (t || 1))));
  }, xt = (t) => {
    const d = Math.max(en, Math.ceil(Jt / (t || 1))), v = No * ze / (t || 1) - tn;
    return Math.min(d, Math.max(en, Math.floor(v / 3)));
  }, wn = (t) => 3 * xt(t) + tn, mt = (t, d) => {
    const v = vn(t), S = ze / (t || 1), T = v * 2 + To + Eo(t) + (yt ? Qt : 0) + (Ge ? Zt.row : 0) + (!d && V ? wn(t) : 0) + Zt[J ? "fan" : "row"];
    let ee = 0, We;
    d ? (ee = Math.max(30, Math.min(62, Math.floor((S - T - nn) / 8.3))), We = Math.max(nn, Math.round(S - T - on(ee)))) : We = Math.max(Ho, Math.min($o, Math.round(S - T)));
    const Dt = T + (d ? on(ee) : 0) + We;
    return { bar: v, cell: ee, centre: We, content: Dt, usePad: d, trayRow: xt(t), scale: Math.min(1, Ue, ze / Dt) };
  }, kt = (t) => {
    let d = mt(Ue, t);
    for (let v = 0; v < 10 && d.scale < Ue - 5e-4; v++) {
      const S = mt(d.scale, t);
      if (Math.abs(S.scale - d.scale) < 5e-4) {
        d = S;
        break;
      }
      d = S;
    }
    return d;
  };
  let G = kt(Sn);
  G.usePad && G.cell * G.scale < Io && (G = kt(!1));
  const Cn = G.usePad, Wn = G.usePad ? G.cell : 38, St = G.centre, Rn = Math.max(0.6, Math.min(1.6, (St - 8) / 262)), Ke = Math.min(M.w / Te.w, M.h / Te.h) || 1, xe = oe ? G.scale : Ke, Bn = oe ? Pe : Math.max(Te.w, M.w / Ke), Ve = oe ? G.content : Math.max(Te.h, M.h / Ke), Mn = oe ? -Math.round(G.content * (1 - G.scale)) : 0, Nn = (t) => o[t].human ? at : !we && t === e.turn ? "#e8e8c8" : hn, Hn = (t) => t === K || !we && t === e.turn ? "#fff" : "#b3b3b3", me = (t) => {
    Z && (m ? ve(t) : B == null || B(t));
  }, vt = () => {
    if (ue == null) return;
    const t = ue;
    ve(null), B == null || B(t);
  }, wt = () => {
    ve(null), fe(null);
  }, qe = (t) => (d) => r && ge && e.turn === t && bn.has(`${d.suit}${d.rank}`), Ae = (t, d = { w: 14, h: 71 }) => /* @__PURE__ */ n(st, { cards: e.hands[t], hidden: !0, metrics: rn, layout: "row", fanSpread: p.fanSpread, fanRadius: p.fanRadius, backColor: p.cardBack, backMetrics: d }), Ce = (t, d, v = {}) => /* @__PURE__ */ n(So, { seat: t, name: o[t].name, tag: o[t].tag, strip: o[t].strip, bg: Nn(t), width: d, isDealer: t === e.dealer, metrics: v }), ke = (t, d = 16) => {
    if (!V || g !== "seats") return null;
    const v = e.auction.filter((S) => S.seat === t);
    return v.length ? /* @__PURE__ */ n("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: v.map((S, T) => {
      const ee = T === v.length - 1;
      return /* @__PURE__ */ n("span", { style: { background: ee ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: d, fontWeight: ee ? 700 : 400, padding: "0 5px", color: gn(S.call) }, children: ht(S.call) }, T);
    }) }) : null;
  }, Je = (t, d = rn) => /* @__PURE__ */ n(
    st,
    {
      cards: e.hands[t],
      metrics: d,
      layout: "row",
      fanSpread: p.fanSpread,
      fanRadius: p.fanRadius,
      backColor: p.cardBack,
      isPlayable: qe(t),
      onPlay: (v) => R == null ? void 0 : R(t, v)
    }
  ), De = (t, d = { width: 197 }) => /* @__PURE__ */ n(
    vo,
    {
      cards: e.hands[t],
      panelBg: Hn(t),
      width: d.width,
      suitW: d.suitW,
      font: d.font,
      pad: d.pad,
      bare: d.bare,
      touch: !!d.touch && r && ge && e.turn === t,
      isPlayable: qe(t),
      onPlay: (v) => R == null ? void 0 : R(t, v)
    }
  ), Qe = (t, d) => {
    const v = d ?? {
      w: p.cardW,
      h: Math.round(p.cardW * 1.42),
      rank: Math.round(p.cardW * 0.46),
      glyph: Math.round(p.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ n(
      st,
      {
        cards: e.hands[t],
        metrics: v,
        layout: "fan",
        fanSpread: p.fanSpread,
        fanRadius: p.fanRadius,
        backColor: p.cardBack,
        isPlayable: qe(t),
        onPlay: (S) => R == null ? void 0 : R(t, S)
      }
    );
  }, Ct = (t) => {
    const d = J && i[t];
    return /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      ke(t),
      i[t] ? d ? Qe(t) : Je(t) : Ae(t),
      Ce(t, d ? 197 : i[t] ? 50 + Math.max(0, e.hands[t].length - 1) * 49 : 197)
    ] });
  }, Wt = (t) => /* @__PURE__ */ h("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    ke(t),
    i[t] ? De(t, { width: 197 }) : Ae(t),
    Ce(t, 197)
  ] }), Rt = [];
  {
    const t = [
      ...Array.from({ length: ct.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let d = 0; d < t.length; d += 4) Rt.push(t.slice(d, d + 4));
  }
  const Ze = (t = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ n(
    wo,
    {
      bg: p.auctionBg,
      m: t,
      heads: ct.map((d) => ({ seat: d, vul: yn(d), isDealer: d === e.dealer })),
      rows: Rt,
      dealerCol: xn,
      emptyText: e.auction.length === 0 ? e.dealer === a ? "You deal" : `${e.dealer} deals` : null
    }
  ), Bt = ge ? ((At = e.tricks[e.tricks.length - 1]) == null ? void 0 : At.plays) ?? [] : [], Mt = (t = 1) => /* @__PURE__ */ n(Vt, { plays: Bt, turn: e.turn, scale: t }), et = /* @__PURE__ */ n(
    Co,
    {
      line: y,
      score: W,
      detail: `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: x,
      actionNote: C,
      accent: p.accent
    }
  ), $n = /* @__PURE__ */ n(Vt, { variant: "pill", plays: Bt, turn: e.turn }), tt = (t, d, v, S, T, ee = 21) => ({
    flex: "none",
    width: t,
    height: d,
    border: `1px solid ${S}`,
    borderRadius: Q,
    background: v,
    color: "#fff",
    fontSize: ee,
    fontWeight: 700,
    lineHeight: 1,
    cursor: T ? "pointer" : "default",
    opacity: T ? 1 : 0.42
  }), Nt = (t, d) => /* @__PURE__ */ h(dt, { children: [
    /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        onClick: vt,
        style: tt(240, t, "#116710", "#0c4b0b", !0, d),
        children: [
          "Confirm ",
          ht(ue ?? "")
        ]
      }
    ),
    /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: wt,
        style: tt(120, t, "#8a3030", "#5e1c1c", !0, d),
        children: "Cancel"
      }
    )
  ] }), En = (t, d, v) => [1, 2, 3, 4, 5, 6, 7].map((S) => {
    const T = Le.some((We) => be.has(`${S}${We}`)), ee = Z && T;
    return /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: ee ? () => fe(_ === S ? null : S) : void 0,
        "aria-label": `Level ${S}`,
        style: { flex: "none", width: t, height: d, border: "1px solid #8a8a6a", borderRadius: Q, background: _ === S ? at : "#f8f8f8", color: "#000", fontSize: v, lineHeight: 1, cursor: ee ? "pointer" : "default", opacity: ee ? 1 : 0.42 },
        children: S
      },
      S
    );
  }), Tn = (t, d, v, S) => _ ? Le.filter((T) => be.has(`${_}${T}`)).map((T) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => me(`${_}${T}`),
      "aria-label": `${_}${T === "N" ? "NT" : T}`,
      style: { flex: "none", width: T === "N" ? v : S, height: t, border: "1px solid #8a8a6a", borderRadius: Q, background: "#f8f8f8", color: de(T) ? ae : "#000", fontSize: d, lineHeight: 1, cursor: "pointer" },
      children: te[T]
    },
    T
  )) : null, In = (t, d, v) => ["X", "XX"].map((S) => Z && be.has(S) ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: () => me(S),
      "aria-label": S === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: t, height: d, border: `1px solid ${S === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: Q, background: S === "X" ? ae : "#1034a6", color: "#fff", fontSize: v, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: S
    },
    S
  ) : /* @__PURE__ */ n("span", { style: { width: t, height: d } }, S)), zn = (t, d, v) => /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: Z ? () => me("P") : void 0,
      "aria-label": "Pass",
      style: tt(t, d, Z ? "#116710" : "#a7b8a2", "#0c4b0b", Z, v),
      children: "Pass"
    }
  ), An = be.has("X") || be.has("XX"), Ht = _ ? Le.filter((t) => be.has(`${_}${t}`)) : [], Dn = /* @__PURE__ */ n("div", { style: { width: 581, flex: "none", background: p.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: ue ? /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    Nt(44, 21)
  ] }) : /* @__PURE__ */ h(dt, { children: [
    /* @__PURE__ */ h("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      zn(120, 37, 21),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: En(57, 37, 23) })
    ] }),
    (An || Ht.length > 0) && /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: In(57, 37, 21) }),
      /* @__PURE__ */ n("div", { style: { display: "flex", gap: 6 }, children: Tn(37, 23, 120, 57) })
    ] })
  ] }) }), Se = oe ? G.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, xe))), Fn = [0, 1, 2, 3, 4].map((t) => {
    const d = Ht[t];
    return d ? /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: () => me(`${_}${d}`),
        "aria-label": `${_}${d === "N" ? "NT" : d}`,
        style: { height: Se, border: "1px solid #8a8a6a", borderRadius: Q, background: "#f8f8f8", color: de(d) ? ae : "#000", fontSize: 26, lineHeight: 1, cursor: "pointer" },
        children: te[d]
      },
      t
    ) : /* @__PURE__ */ n("span", { style: { height: Se, pointerEvents: "none" } }, t);
  }), $t = /* @__PURE__ */ n("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: p.trayBg, padding: "8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: ue ? /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 20, color: "#3a3a20" }, children: "Confirm your call" }),
    /* @__PURE__ */ n("div", { style: { display: "flex", gap: 10 }, children: Nt(52, 28) })
  ] }) : /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
    /* @__PURE__ */ h("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: Z ? () => me("P") : void 0,
          "aria-label": "Pass",
          style: { gridColumn: "span 3", minWidth: 0, height: Se, border: "1px solid #0c4b0b", borderRadius: Q, background: Z ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: Z ? "pointer" : "default", opacity: Z ? 1 : 0.42 },
          children: "Pass"
        }
      ),
      ["X", "XX"].map((t) => Z && be.has(t) ? /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: () => me(t),
          "aria-label": t === "X" ? "Double" : "Redouble",
          style: { gridColumn: "span 2", minWidth: 0, height: Se, border: `1px solid ${t === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: Q, background: t === "X" ? ae : "#1034a6", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: t
        },
        t
      ) : /* @__PURE__ */ n("span", { style: { gridColumn: "span 2", minWidth: 0, height: Se } }, t))
    ] }),
    /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [1, 2, 3, 4, 5, 6, 7].map((t) => {
      const d = Le.some((S) => be.has(`${t}${S}`)), v = Z && d;
      return /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: v ? () => fe(_ === t ? null : t) : void 0,
          "aria-label": `Level ${t}`,
          style: { height: Se, border: "1px solid #8a8a6a", borderRadius: Q, background: _ === t ? at : "#f8f8f8", color: "#000", fontSize: 26, lineHeight: 1, cursor: v ? "pointer" : "default", opacity: v ? 1 : 0.42 },
          children: t
        },
        t
      );
    }) }),
    /* @__PURE__ */ n("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }, children: Fn })
  ] }) }), nt = {
    legalCalls: f,
    live: Z,
    pending: ue,
    onStage: me,
    onConfirm: vt,
    onCancel: wt,
    radius: Q
  }, Xn = /* @__PURE__ */ n(lt, { cell: 46, ...nt }), Ln = /* @__PURE__ */ n("div", { style: { width: "100%", flex: "none", background: p.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ n(lt, { cell: 84, minCellH: Se, ...nt }) }), Et = { N: "North", E: "East", S: "South", W: "West" }, Tt = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), ot = [
    { kind: "chip", label: "Board", value: String(c) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: Tt, color: Tt === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: ie ? `${ie.level}${te[ie.strain]}${ie.doubled === 1 ? "X" : ie.doubled === 2 ? "XX" : ""}` : "—", color: ie && de(ie.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: ie ? Et[ie.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: u, title: "Scoring mode", on: P ?? null }
  ], it = (t) => [
    ...t ? [{ kind: "node", node: t }] : [],
    { kind: "divider" },
    ...D ? [{ kind: "button", label: D.label, title: "Four-hand record", href: D.href }] : [],
    ...L ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => ye(!0) }] : [],
    { kind: "spacer" },
    ...I && ge ? [{ kind: "button", label: "Claim", tone: "accent", on: I }] : [],
    ...Y ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: Y }] : []
  ], It = U && L ? /* @__PURE__ */ n(Wo, { onClose: () => ye(!1), children: L }) : null, Pn = (t) => je.map((d) => {
    const v = e.hands[t].filter((S) => S.suit === d).sort((S, T) => T.rank - S.rank).map((S) => he(S.rank)).join("");
    return v ? { suit: d, ranks: v } : null;
  }).filter((d) => d != null), On = yt && K ? /* @__PURE__ */ h("div", { "data-testid": "dummy-strip", style: { flex: "none", height: Qt, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ n("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: Et[K] }),
    i[K] ? Pn(K).map((t) => /* @__PURE__ */ h("span", { style: { fontSize: 26, fontWeight: 700, color: "#f2f6f4", whiteSpace: "nowrap" }, children: [
      /* @__PURE__ */ n("span", { style: { color: de(t.suit) ? ae : "#111" }, children: te[t.suit] }),
      t.ranks
    ] }, t.suit)) : null
  ] }) : null, jn = Ge && K ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: i[K] ? J ? Qe(K, ce) : Je(K, ce) : Ae(K, { w: ce.backW, h: ce.h }) })
  ) : null, _n = /* @__PURE__ */ h("div", { style: { width: Pe, minHeight: Ve, height: Ve, transform: `scale(${xe})`, transformOrigin: "top center", marginBottom: Mn, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    /* @__PURE__ */ n(Re, { side: "top", items: ot, condensed: !0, thickness: G.bar, bg: p.barBg, accent: p.accent }),
    /* @__PURE__ */ h("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: p.feltFlat }, children: [
      On,
      jn,
      /* @__PURE__ */ n("div", { "data-testid": "centre-band", style: { flex: "none", height: St, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: /* @__PURE__ */ h("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: V ? "flex-start" : "center", justifyContent: "center", ...N ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
        V && g === "box" ? Ze({ width: 430, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
        V && g === "seats" ? /* @__PURE__ */ n("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((t) => /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ n("span", { style: { width: 30, height: 30, background: pn, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: t }),
          ke(t, 22) ?? /* @__PURE__ */ n("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
        ] }, t)) }) : null,
        ge ? Mt(Rn) : null,
        we ? et : null
      ] }) }),
      V ? Cn ? /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ n(lt, { cell: Wn, ...nt }) }) : $t : null,
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        ke("S"),
        i.S ? J ? Qe("S", ce) : Je("S", ce) : Ae("S", { w: ce.backW, h: ce.h }),
        Ce("S", i.S ? ce.w + Math.max(0, e.hands.S.length - 1) * (ce.w - 1) : 390)
      ] }) })
    ] }),
    /* @__PURE__ */ n(Re, { side: "bottom", items: it(z ?? b), condensed: !0, thickness: G.bar, bg: p.barBg, accent: p.accent })
  ] }), Yn = (t) => /* @__PURE__ */ h("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    ke(t, 22),
    Ce(t, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    i[t] && De(t, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), zt = (t) => /* @__PURE__ */ h("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    ke(t, 22),
    Ce(t, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    i[t] && De(t, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), Gn = (t) => /* @__PURE__ */ h("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    ke(t, 22),
    Ce(t, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    i[t] && De(t, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), Un = /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: p.stageBg }, children: [
    /* @__PURE__ */ n(Re, { side: "top", items: ot, scale: xe, minTouch: 44, bg: p.barBg, accent: p.accent }),
    /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: p.felt }, children: [
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Yn("N") }),
      /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        zt("W"),
        /* @__PURE__ */ h("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...O }, children: [
          V && g === "box" ? Ze({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          ge ? $n : null,
          we ? et : null
        ] }),
        zt("E")
      ] }),
      /* @__PURE__ */ n("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: Gn("S") })
    ] }),
    V ? w ? Ln : $t : null,
    /* @__PURE__ */ n(Re, { side: "bottom", items: it(z ?? b), scale: xe, minTouch: 44, bg: p.barBg, accent: p.accent })
  ] }), Kn = /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    /* @__PURE__ */ n(Re, { side: "top", items: ot, scale: xe, bg: p.barBg, accent: p.accent }),
    /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: p.felt }, children: /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ n("div", { style: { display: "flex", justifyContent: "center" }, children: Ct("N") }),
      /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        Wt("W"),
        /* @__PURE__ */ n("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...O }, children: /* @__PURE__ */ h(Do, { children: [
          V && w ? Xn : V && g === "box" ? Ze() : null,
          ge ? Mt() : null,
          we ? et : null
        ] }) }),
        Wt("E")
      ] }),
      /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ n("div", { style: { height: V && !w ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: V && !w ? Dn : null }),
        Ct("S")
      ] })
    ] }) }),
    /* @__PURE__ */ n(Re, { side: "bottom", items: it(b), scale: xe, bg: p.barBg, accent: p.accent })
  ] });
  return oe ? /* @__PURE__ */ h("div", { ref: j, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: p.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ n("div", { style: { flex: gt, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ n("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: _n }) }),
    Ye > 0 && /* @__PURE__ */ n("div", { style: { flex: Ye, minHeight: 0, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: mn && /* @__PURE__ */ n(Mo, { title: X, accent: p.accent, lines: H, actions: ne }) }),
    It,
    s && !$ && /* @__PURE__ */ n(Ut, { accent: p.accent, items: F, onClose: () => E(!1) })
  ] }) : /* @__PURE__ */ n("div", { ref: j, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: p.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: p.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ h("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: Bn, height: Ve, transform: `scale(${xe})` }, children: [
    Ee ? Un : Kn,
    It,
    s && !$ && /* @__PURE__ */ n(Ut, { accent: p.accent, items: F, onClose: () => E(!1) })
  ] }) });
}
const ln = ["N", "E", "S", "W"], Xo = { N: "S", S: "N", E: "W", W: "E" }, Lo = { N: "North", E: "East", S: "South", W: "West" };
function _o({
  deal: e,
  seed: o = 1,
  dealer: i = "N",
  vul: a = "none",
  humanSeat: f = "S",
  showAllHands: l = !1,
  appearance: r,
  decide: c,
  robotDelayMs: u = 350,
  showCoach: g = !1,
  coachShare: m,
  onComplete: x
}) {
  var ne, p, J;
  const C = Fe(() => e ?? ro(o), [e, o]), [y, W] = se(
    () => Pt("embed", i, a, C)
  ), B = `${i}:${a}:${o}:${C.N.length}:${((ne = C.N[0]) == null ? void 0 : ne.suit) ?? ""}${((p = C.N[0]) == null ? void 0 : p.rank) ?? ""}`, R = re(B);
  Ne(() => {
    R.current !== B && (R.current = B, $.current = 0, W(Pt("embed", i, a, C)));
  }, [B, i, a, C]);
  const $ = re(0), P = Me((w, N) => {
    W(
      (O) => Xe(O, {
        category: "bid-event",
        seq: $.current += 1,
        boardRef: O.boardRef,
        seat: w,
        call: N
      })
    );
  }, []), I = Me((w, N) => {
    W(
      (O) => Xe(O, {
        category: "play-event",
        seq: $.current += 1,
        boardRef: O.boardRef,
        seat: w,
        card: N
      })
    );
  }, []), b = ((J = y.contract) == null ? void 0 : J.declarer) ?? null, z = b && y.phase !== "auction" ? Xo[b] : null, L = Me(
    (w) => w === f || w === z && b === f,
    [f, z, b]
  ), A = y.phase !== "complete" && L(y.turn), D = re(!1);
  Ne(() => {
    if (!c || A || y.phase === "complete" || D.current) return;
    const w = y.turn, N = y;
    D.current = !0;
    let O = !1;
    return (async () => {
      try {
        if (await new Promise((M) => setTimeout(M, u)), O) return;
        const j = await c(N, w);
        if (O || !j) return;
        W((M) => M !== N && M.turn !== w ? M : j.call && M.phase === "auction" ? Lt(M.auction, w).has(j.call) ? Xe(M, {
          category: "bid-event",
          seq: $.current += 1,
          ts: Date.now(),
          boardRef: M.boardRef,
          seat: w,
          call: j.call,
          fallback: !1
        }) : M : j.card && M.phase === "play" && Ot(M, w).some(
          (fe) => fe.suit === j.card.suit && fe.rank === j.card.rank
        ) ? Xe(M, {
          category: "play-event",
          seq: $.current += 1,
          ts: Date.now(),
          boardRef: M.boardRef,
          seat: w,
          card: j.card,
          fallback: !1
        }) : M);
      } finally {
        D.current = !1;
      }
    })(), () => {
      O = !0, D.current = !1;
    };
  }, [c, A, y, u]);
  const q = re(!1);
  Ne(() => {
    y.phase !== "complete" || q.current || (q.current = !0, x == null || x(y));
  }, [y, x]);
  const le = Fe(() => ({
    ...dn((r == null ? void 0 : r.skin) ?? "bbo", r == null ? void 0 : r.overrides),
    handLayout: (r == null ? void 0 : r.handLayout) ?? "row",
    bidPad: (r == null ? void 0 : r.bidPad) ?? "grid",
    centreFrame: (r == null ? void 0 : r.centreFrame) ?? !1,
    fanSpread: (r == null ? void 0 : r.fanSpread) ?? 56,
    fanRadius: (r == null ? void 0 : r.fanRadius) ?? 0
  }), [r]), k = Fe(() => {
    const w = {};
    for (const N of ln)
      w[N] = l || N === f || N === z;
    return w;
  }, [l, f, z]), X = Fe(() => {
    const w = {};
    for (const N of ln)
      w[N] = {
        name: N === f ? "You" : Lo[N],
        human: N === f
      };
    return w;
  }, [f]), H = y.phase === "complete" ? no(y) : null;
  return /* @__PURE__ */ n(
    Fo,
    {
      state: y,
      seats: X,
      visible: k,
      mySeat: f,
      myTurn: A,
      legalCalls: y.phase === "auction" && A ? [...Lt(y.auction, y.turn)] : [],
      legalPlays: y.phase === "play" && A ? Ot(y, y.turn) : [],
      appearance: le,
      showCoach: g,
      ...m === void 0 ? {} : { coachShare: m },
      resultLine: H ? oo(H) : "",
      resultScore: H ? `${H.declarerScore >= 0 ? "+" : ""}${H.declarerScore}` : "",
      onCall: (w) => {
        A && P(y.turn, w);
      },
      onPlay: (w, N) => {
        A && I(y.turn, N);
      }
    }
  );
}
export {
  _o as BridgeTable
};
//# sourceMappingURL=table-embed.js.map
