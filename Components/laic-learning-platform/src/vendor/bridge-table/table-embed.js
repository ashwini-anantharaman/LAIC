import { jsxs as d, jsx as t, Fragment as We } from "react/jsx-runtime";
import { createContext as Ci, useContext as Wi, useState as te, useRef as Z, useCallback as Fe, useLayoutEffect as je, useEffect as Ne, useMemo as Re } from "react";
function Ri(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function on(e) {
  return `${e.suit}${e.rank}`;
}
const Wt = ["S", "W", "N", "E"];
function Pe(e) {
  return Wt[(Wt.indexOf(e) + 1) % 4];
}
function Ni(e) {
  return Pe(Pe(e));
}
function Mn(e, n) {
  return e === n || Ni(e) === n;
}
function Bi(e, n) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const l = n === "N" || n === "S";
  return e === "ns" ? l : !l;
}
function tt(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
const Dn = ["C", "D", "H", "S", "N"];
function rn(e) {
  return tt(e) ? (Number(e[0]) - 1) * 5 + Dn.indexOf(e[1]) : -1;
}
function Xe(e, n) {
  const l = /* @__PURE__ */ new Set(["P"]);
  let a = -1;
  for (const s of e) a = Math.max(a, rn(s.call));
  for (let s = 1; s <= 7; s++)
    for (const r of Dn) {
      const o = `${s}${r}`;
      rn(o) > a && l.add(o);
    }
  let f = null;
  for (let s = e.length - 1; s >= 0; s--)
    if (e[s].call !== "P") {
      f = e[s];
      break;
    }
  return f && !Mn(f.seat, n) && (tt(f.call) ? l.add("X") : f.call === "X" && l.add("XX")), l;
}
function $i(e) {
  if (e.length < 4) return !1;
  const n = e.slice(-3);
  return n.length === 3 && n.every((l) => l.call === "P");
}
function Ei(e) {
  let n = null, l = 0;
  for (const r of e)
    tt(r.call) ? (n = r, l = 0) : r.call === "X" ? l = 1 : r.call === "XX" && (l = 2);
  if (!n) return null;
  const a = n.call[1], f = n.seat;
  let s = n.seat;
  for (const r of e)
    if (tt(r.call) && r.call[1] === a && Mn(r.seat, f)) {
      s = r.seat;
      break;
    }
  return { level: Number(n.call[0]), strain: a, doubled: l, declarer: s };
}
function nt(e, n, l, a) {
  return {
    boardRef: e,
    dealer: n,
    vul: l,
    hands: {
      N: [...a.N],
      E: [...a.E],
      S: [...a.S],
      W: [...a.W]
    },
    auction: [],
    contract: null,
    phase: "auction",
    turn: n,
    tricks: [],
    trickCount: { NS: 0, EW: 0 }
  };
}
const An = (e) => e === "N" || e === "S" ? "NS" : "EW";
function Ti(e, n) {
  const l = e.plays[0].card.suit, a = (s, r) => {
    const o = n !== "N" && s.suit === n, c = n !== "N" && r.suit === n;
    if (o && !c) return !0;
    if (c && !o) return !1;
    if (o && c) return s.rank > r.rank;
    const p = s.suit === l, b = r.suit === l;
    return p && !b ? !0 : b && !p ? !1 : s.rank > r.rank;
  };
  let f = e.plays[0];
  for (const s of e.plays.slice(1)) a(s.card, f.card) && (f = s);
  return f.seat;
}
function Rt(e, n) {
  const l = e.hands[n], a = e.tricks[e.tricks.length - 1];
  if (!a || a.plays.length === 0 || a.plays.length === 4) return [...l];
  const s = a.plays[0].card.suit, r = l.filter((o) => o.suit === s);
  return r.length ? r : [...l];
}
function Ie(e, n) {
  if (n.category === "bid-event") {
    const y = [...e.auction, { seat: n.seat, call: n.call }];
    if (!$i(y))
      return { ...e, auction: y, turn: Pe(n.seat) };
    const w = Ei(y);
    if (!w)
      return { ...e, auction: y, contract: null, phase: "complete" };
    const S = Pe(w.declarer);
    return {
      ...e,
      auction: y,
      contract: w,
      phase: "play",
      turn: S,
      tricks: [{ leader: S, plays: [] }]
    };
  }
  const l = n.seat, a = {
    ...e.hands,
    [l]: e.hands[l].filter((y) => on(y) !== on(n.card))
  }, f = e.tricks.map((y) => ({ ...y, plays: [...y.plays] }));
  let s = f[f.length - 1];
  if ((!s || s.plays.length === 4) && (s = { leader: l, plays: [] }, f.push(s)), s.plays.push({ seat: l, card: n.card }), s.plays.length < 4)
    return { ...e, hands: a, tricks: f, turn: Pe(l) };
  const r = e.contract ? e.contract.strain : "N", o = Ti(s, r);
  s.winner = o;
  const c = An(o), p = { ...e.trickCount, [c]: e.trickCount[c] + 1 }, b = a.N.length === 0 && a.E.length === 0 && a.S.length === 0 && a.W.length === 0;
  return {
    ...e,
    hands: a,
    tricks: f,
    trickCount: p,
    turn: o,
    phase: b ? "complete" : "play"
  };
}
const an = { C: 20, D: 20, H: 30, S: 30 };
function Mi(e) {
  if (e.phase !== "complete") return null;
  const n = e.contract;
  if (!n)
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
  const l = An(n.declarer), a = e.trickCount[l], f = 6 + n.level, s = a - f, r = s >= 0, o = Bi(e.vul, n.declarer), c = n.doubled, p = c === 2 ? 4 : c === 1 ? 2 : 1;
  let b = 0, y = 0, w = 0, S = 0, g = 0, R = 0, W = 0;
  if (r) {
    b = n.strain === "N" ? (40 + (n.level - 1) * 30) * p : an[n.strain] * n.level * p;
    const z = c === 0 ? n.strain === "N" ? 30 : an[n.strain] : (o ? 200 : 100) * (c === 2 ? 2 : 1);
    y = s * z, b >= 100 ? w = o ? 500 : 300 : S = 50, n.level === 6 && (g = o ? 750 : 500), n.level === 7 && (g = o ? 1500 : 1e3), c > 0 && (R = 50 * c);
  } else {
    const z = -s;
    if (c === 0)
      W = z * (o ? 100 : 50);
    else {
      let L = 0;
      for (let k = 1; k <= z; k++)
        k === 1 ? L += o ? 200 : 100 : k <= 3 ? L += o ? 300 : 200 : L += 300;
      W = L * (c === 2 ? 2 : 1);
    }
  }
  const A = r ? b + y + w + S + g + R : -W;
  return {
    contract: n,
    tricksTaken: a,
    result: s,
    made: r,
    vulnerable: o,
    trickScore: b,
    overtrickScore: y,
    gameBonus: w,
    partscoreBonus: S,
    slamBonus: g,
    insultBonus: R,
    penalty: W,
    declarerScore: A,
    nsScore: l === "NS" ? A : -A
  };
}
function Di(e) {
  if (!e.contract) return "Passed out";
  const n = e.contract, l = n.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[n.strain], a = n.doubled === 1 ? " X" : n.doubled === 2 ? " XX" : "", f = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${n.level}${l}${a} by ${n.declarer}, ${f}`;
}
function Ai(e) {
  let n = e >>> 0;
  return () => {
    n |= 0, n = n + 1831565813 | 0;
    let l = Math.imul(n ^ n >>> 15, 1 | n);
    return l = l + Math.imul(l ^ l >>> 7, 61 | l) ^ l, ((l ^ l >>> 14) >>> 0) / 4294967296;
  };
}
function Mt(e) {
  const n = Ai(e), a = ["S", "H", "D", "C"].flatMap(
    (s) => Array.from({ length: 13 }, (r, o) => ({ suit: s, rank: o + 2 }))
  );
  for (let s = a.length - 1; s > 0; s--) {
    const r = Math.floor(n() * (s + 1));
    [a[s], a[r]] = [a[r], a[s]];
  }
  const f = { N: [], E: [], S: [], W: [] };
  return a.forEach((s, r) => f[Wt[r % 4]].push(s)), f;
}
const Hi = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, zi = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, Ii = { skin: "bbo" }, Fi = {
  skins: Hi,
  strainTint: zi,
  defaults: Ii
}, Dt = Fi, sn = Dt.skins, xt = Dt.strainTint, Li = {
  skin: Dt.defaults.skin
};
function Hn(e, n = {}) {
  const l = sn[e] ?? sn[Li.skin], a = (s) => {
    const r = n[s];
    return typeof r == "string" && r.trim() !== "" ? r : void 0;
  }, f = a("feltColor");
  return {
    ...l,
    felt: f ?? l.felt,
    feltFlat: f ?? l.feltFlat,
    accent: a("accent") ?? l.accent,
    trayBg: a("bidBoxColor") ?? l.trayBg,
    auctionBg: a("auctionColor") ?? l.auctionBg,
    cardBack: a("cardBackColor") ?? l.cardBack
  };
}
const Xi = ["N", "S", "H", "D", "C"], zn = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, Oi = [1, 2, 3, 4, 5, 6, 7], Pi = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${zn[e[1] ?? "N"] ?? ""}`;
function et({
  cell: e = 46,
  minCellH: n = 0,
  radius: l = 5,
  legalCalls: a,
  live: f,
  pending: s,
  onStage: r,
  onConfirm: o,
  onCancel: c
}) {
  const p = Math.round(e * 0.13), b = Math.round(e * 0.11), y = e, w = Math.max(Math.round(e * 0.92), n), S = Math.round(e * 3.4), g = Math.round(e * 0.62), R = Math.round(e * 0.42), W = new Set(a), A = s != null, z = (k, O) => {
    const G = `${O}${k}`, P = xt[k], X = W.has(G), C = f && !A && X;
    return /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        disabled: A,
        onClick: C ? () => r(G) : void 0,
        "aria-label": `${O}${k === "N" ? "NT" : k}`,
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: y,
          height: w,
          padding: 0,
          background: "transparent",
          border: 0,
          color: P.ink,
          lineHeight: 1,
          cursor: C ? "pointer" : "default",
          opacity: X ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ t("span", { style: { fontSize: g, fontWeight: 700, lineHeight: 1 }, children: O }),
          /* @__PURE__ */ t("span", { style: { fontSize: R, fontWeight: 700, lineHeight: 1 }, children: zn[k] })
        ]
      },
      G
    );
  }, L = (k, O, G, P, X, C) => {
    const D = W.has(k), x = f && !A && D;
    return /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        disabled: A,
        onClick: x ? () => r(k) : void 0,
        "aria-label": k === "P" ? "Pass" : k === "X" ? "Double" : "Redouble",
        style: {
          width: G,
          height: w,
          background: P,
          border: `2px solid ${X}`,
          borderRadius: l,
          color: "#fff",
          fontWeight: 700,
          fontSize: g,
          lineHeight: 1,
          cursor: x ? "pointer" : "default",
          opacity: D ? 1 : 0.3,
          ...C
        },
        children: O
      },
      k
    );
  };
  return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: p }, children: [
    s != null && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 20, fontWeight: 700, color: "#12281f" }, children: Pi(s) }),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: o,
          style: { height: 38, padding: "0 16px", border: "1px solid #0c4b0b", borderRadius: l, background: "#116710", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Confirm"
        }
      ),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: c,
          style: { height: 38, padding: "0 16px", border: "1px solid #5e1c1c", borderRadius: l, background: "#8a3030", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ t("div", { style: { display: "flex", gap: p }, children: Xi.map((k) => /* @__PURE__ */ t(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: p,
          padding: b,
          background: xt[k].bg,
          border: `2px solid ${xt[k].edge}`,
          borderRadius: l
        },
        children: Oi.map((O) => z(k, O))
      },
      k
    )) }),
    /* @__PURE__ */ d("div", { style: { display: "flex", gap: p }, children: [
      L("P", "Pass", S, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      L("X", "X", y, "#7a5b3a", "#5e4227"),
      L("XX", "XX", y, "#2b6b73", "#1c4d53")
    ] })
  ] });
}
const ji = {
  LinkComponent: "a",
  navigate: (e, { replace: n }) => {
    typeof window > "u" || (n ? window.location.replace(e) : window.location.assign(e));
  }
}, _i = Ci(ji);
function In() {
  return Wi(_i);
}
const Nt = "#384bb3", cn = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: Nt, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, dn = 48;
function ze({
  side: e,
  items: n,
  thickness: l = 44,
  condensed: a = !1,
  scale: f,
  minTouch: s = 30,
  bg: r = "rgba(9,22,17,.90)",
  accent: o = Nt
}) {
  const [c, p] = te(99), [b, y] = te(99), [w, S] = te(!1), g = Z(null), R = Z(null), W = Z(null), A = Z(() => {
  }), z = o === Nt ? cn : { ...cn, accent: { bg: o, border: o, color: "#fff" } }, L = l, k = Math.min(
    Math.round(L * 2.2),
    Math.max(
      Math.round(L * 0.68),
      L - 14,
      f ? Math.ceil(s / Math.max(0.05, f)) : 0
    )
  ), { LinkComponent: O } = In(), G = a ? 5 : 7, P = Math.round(k * (a ? 0.17 : 0.4)), X = Math.max(a ? 11 : 13, Math.round(k * (a ? 0.28 : 0.4))), C = Math.round(k * 0.86), D = Math.max(9, Math.round(k * 0.26));
  let x = -1;
  n.forEach((u, m) => {
    u.kind === "spacer" && (x = m);
  });
  const Y = x < 0 ? n : n.slice(0, x), H = x < 0 ? [] : n.slice(x + 1), J = Y.length, v = H.length, K = Math.max(0, Math.min(c, J)), E = Math.max(1, Math.min(b, v)), I = H.slice(H.length - E), V = Y.slice(K).concat(H.slice(0, H.length - E)).filter((u) => u.kind !== "divider"), F = V.length > 0, j = w && F, N = Fe(() => {
    const u = g.current;
    if (!u) return;
    const m = Math.min(c, J), T = u.clientWidth;
    if (T > 0) {
      if (u.scrollWidth > T + 1) {
        const oe = parseFloat(getComputedStyle(u).gap) || 0;
        let he = 0, Q = 0;
        for (const be of Array.from(u.children))
          if (he += be.offsetWidth + (Q ? oe : 0), he <= T) Q++;
          else break;
        Q < m && p(Q);
        return;
      }
      if (T - u.scrollWidth > dn && m < J) {
        p(m + 1);
        return;
      }
      if (m !== c) {
        p(m);
        return;
      }
    }
    const B = R.current;
    if (!B) return;
    const U = Math.min(b, v);
    m === 0 && B.scrollWidth > B.clientWidth + 1 && U > 1 ? y(U - 1) : B.clientWidth - B.scrollWidth > dn && U < v ? y(U + 1) : U !== b && y(U);
  }, [c, b, J, v]);
  je(() => {
    A.current = N, N();
  }), Ne(() => {
    const u = (m) => {
      R.current && !R.current.contains(m.target) && S(!1);
    };
    return document.addEventListener("mousedown", u), () => {
      document.removeEventListener("mousedown", u), W.current && W.current.disconnect();
    };
  }, []);
  const xe = Fe((u) => {
    W.current && (W.current.disconnect(), W.current = null), g.current = u, R.current = u ? u.parentElement : null, u && (typeof ResizeObserver == "function" && (W.current = new ResizeObserver(() => A.current()), W.current.observe(u)), A.current());
  }, []), q = (u, m) => {
    if (u.kind === "spacer") return null;
    if (u.kind === "node")
      return /* @__PURE__ */ t("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: G }, children: u.node }, m);
    if (u.kind === "divider")
      return /* @__PURE__ */ t("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, m);
    if (u.kind === "chip")
      return /* @__PURE__ */ d("div", { title: u.title ?? u.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: C, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ t("span", { style: { fontSize: D, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: u.label }),
        /* @__PURE__ */ t("span", { style: { fontSize: X, fontWeight: 700, lineHeight: 1, color: u.color ?? "#eef4f1" }, children: u.value })
      ] }, m);
    const T = z[u.tone ?? "plain"], B = u.disabled === !0, U = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: u.kind === "icon" ? k : void 0,
      height: k,
      padding: u.kind === "icon" ? 0 : `0 ${P}px`,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.bg,
      color: T.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: X,
      fontWeight: u.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: B || !u.on && !u.href ? "default" : "pointer",
      opacity: B ? 0.42 : 1
    };
    return u.href && !B ? /* @__PURE__ */ t(O, { href: u.href, title: u.title ?? u.label, "aria-label": u.ariaLabel, style: U, children: u.label }, m) : /* @__PURE__ */ t("button", { type: "button", title: u.title ?? u.label, "aria-label": u.ariaLabel, disabled: B, onClick: B ? void 0 : u.on ?? void 0, style: U, children: u.label }, m);
  }, ce = (u, m) => {
    if (u.kind === "divider" || u.kind === "spacer") return null;
    if (u.kind === "chip")
      return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ t("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: u.label }),
        /* @__PURE__ */ t("span", { style: { fontSize: 14, fontWeight: 700, color: u.color ?? "#eef4f1" }, children: u.value })
      ] }, m);
    if (u.kind === "node")
      return /* @__PURE__ */ t("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: u.node }, m);
    const T = z[u.tone ?? "plain"], B = u.disabled === !0, U = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: k,
      marginBottom: 4,
      padding: `0 ${P}px`,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.bg,
      color: T.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: X,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: B || !u.on && !u.href ? "default" : "pointer",
      opacity: B ? 0.42 : 1
    }, oe = () => S(!1);
    return u.href && !B ? /* @__PURE__ */ t(O, { href: u.href, title: u.title ?? u.label, "aria-label": u.ariaLabel, style: U, onClick: oe, children: u.label }, m) : /* @__PURE__ */ t("button", { type: "button", title: u.title ?? u.label, "aria-label": u.ariaLabel, disabled: B, onClick: B ? void 0 : () => {
      var he;
      (he = u.on) == null || he.call(u), oe();
    }, style: U, children: u.label }, m);
  }, de = Math.max(L, k + 14), me = {
    position: "absolute",
    ...e === "bottom" ? { bottom: k + 12 } : { top: k + 12 },
    right: 0,
    zIndex: 40,
    minWidth: Math.round(k * 4.2),
    maxHeight: Math.round(k * 7),
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
      style: { width: "100%", [a ? "height" : "minHeight"]: de, flex: "none", display: "flex", alignItems: "center", gap: G, padding: `6px ${a ? 8 : 10}px`, background: r, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ t(
          "div",
          {
            ref: xe,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: G, ...a ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: Y.slice(0, K).map(q)
          }
        ),
        F && /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ d(
            "button",
            {
              type: "button",
              onClick: () => S((u) => !u),
              title: `${V.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: k, padding: `0 ${P}px`, border: `1px solid ${j ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: j ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: X, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ t("span", { children: "⋯" }),
                /* @__PURE__ */ t("span", { style: { fontSize: D, opacity: 0.8 }, children: V.length })
              ]
            }
          ),
          j && /* @__PURE__ */ t("div", { style: me, children: V.map(ce) })
        ] }),
        I.length > 0 && /* @__PURE__ */ t("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: G }, children: I.map(q) })
      ]
    }
  );
}
function fn({
  title: e = "Table settings",
  accent: n = "#384bb3",
  items: l,
  onClose: a
}) {
  const { navigate: f } = In(), s = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, r = (o) => /* @__PURE__ */ d(We, { children: [
    /* @__PURE__ */ t("span", { children: o.label }),
    /* @__PURE__ */ t("span", { style: { flex: "none", fontWeight: 700, color: n }, children: o.value })
  ] });
  return /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, zIndex: 20 }, children: [
    /* @__PURE__ */ t(
      "div",
      {
        style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" },
        onClick: a,
        "aria-hidden": !0
      }
    ),
    /* @__PURE__ */ d("div", { style: { position: "absolute", left: 12, top: 12, width: 268, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.5)", overflow: "hidden" }, children: [
      /* @__PURE__ */ t("div", { style: { background: n, color: "#fff", fontSize: 17, fontWeight: 700, padding: "6px 10px" }, children: e }),
      l.map(
        (o) => o.action ? (
          // A server action persists the change; the resulting server
          // re-render preserves the client menuOpen state, so the menu stays
          // open exactly as an href row does.
          /* @__PURE__ */ t("form", { action: o.action, style: { margin: 0, display: "block" }, children: /* @__PURE__ */ t("button", { type: "submit", style: s, children: r(o) }) }, o.label)
        ) : /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            onClick: o.on ?? (o.href ? () => {
              const c = o.href.split("?")[0] === window.location.pathname;
              f(o.href, { replace: c });
            } : void 0),
            style: s,
            children: r(o)
          },
          o.label
        )
      )
    ] })
  ] });
}
const ue = "#cc0000", mt = "#fecd07", Fn = "#d3d3d3", un = "#f2e2b8", Yi = "#b8901f", Ln = "#12525e", se = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Ge = ["C", "D", "H", "S", "N"], St = ["W", "N", "E", "S"], it = ["S", "H", "C", "D"], Ui = { N: "S", S: "N", E: "W", W: "E" }, ge = (e) => e === "H" || e === "D", ye = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), Gi = (e) => /^[1-7][CDHSN]$/.test(e), Bt = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${se[e[1] ?? ""] ?? ""}`, Xn = (e) => Gi(e) && ge(e[1] ?? "") ? ue : "#000", Ki = (e) => e === "N" || e === "S" ? "NS" : "EW";
function kt({
  cards: e,
  metrics: n,
  layout: l,
  hidden: a = !1,
  fanSpread: f,
  fanRadius: s,
  backColor: r,
  backCount: o,
  backMetrics: c = { w: 14, h: 71 },
  isPlayable: p,
  onPlay: b
}) {
  if (a) {
    const x = Math.max(1, o ?? e.length);
    return /* @__PURE__ */ t("div", { style: { display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }, children: Array.from({ length: x }, (Y, H) => /* @__PURE__ */ t("span", { style: { display: "block", width: c.w, height: c.h, background: r, borderLeft: H ? "1.5px solid rgba(255,255,255,.92)" : "none" } }, H)) });
  }
  const y = [...e].sort(
    (x, Y) => it.indexOf(x.suit) - it.indexOf(Y.suit) || Y.rank - x.rank
  );
  if (l === "row")
    return /* @__PURE__ */ t("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: y.map((x, Y) => {
      const H = p ? p(x) : !1;
      return /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: H ? () => b == null ? void 0 : b(x) : void 0,
          "aria-label": `Play ${ye(x.rank)}${se[x.suit]}`,
          style: {
            position: "relative",
            display: "block",
            width: n.w,
            height: n.h,
            flex: "none",
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: Y === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
            marginLeft: Y === 0 ? 0 : -1,
            padding: 0,
            cursor: H ? "pointer" : "default",
            transform: H ? "translateY(-6px)" : "none",
            transition: "transform 120ms ease"
          },
          children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: n.inset, top: n.inset > 3 ? n.inset : 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: ge(x.suit) ? ue : "#000" }, children: [
            /* @__PURE__ */ t("span", { style: { fontSize: n.rank, fontWeight: 700 }, children: ye(x.rank) }),
            /* @__PURE__ */ t("span", { style: { fontSize: n.glyph }, children: se[x.suit] })
          ] })
        },
        `${x.suit}${x.rank}`
      );
    }) });
  const w = y.length, S = n.w, g = n.h, R = f, W = s > 0 ? s : Math.round(g * 4.2), A = (x) => w <= 1 ? 0 : -R / 2 + x * (R / (w - 1));
  let z = 0, L = 0, k = 0, O = 0;
  for (let x = 0; x < w; x++) {
    const Y = A(x) * Math.PI / 180, H = Math.cos(Y), J = Math.sin(Y);
    for (const v of [-S / 2, S / 2])
      for (const K of [-W, -W + g]) {
        const E = v * H - K * J, I = v * J + K * H;
        E < z && (z = E), E > L && (L = E), I < k && (k = I), I > O && (O = I);
      }
  }
  const G = Math.ceil(Math.max(-z, L) * 2) + 4, P = Math.ceil(O - k) + 4, X = Math.ceil(-k - W) + 2, C = n.rank, D = n.glyph;
  return /* @__PURE__ */ t("div", { style: { position: "relative", width: G, height: P }, children: y.map((x, Y) => {
    const H = p ? p(x) : !1;
    return /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        onClick: H ? () => b == null ? void 0 : b(x) : void 0,
        "aria-label": `Play ${ye(x.rank)}${se[x.suit]}`,
        style: {
          position: "absolute",
          left: "50%",
          top: X,
          width: S,
          height: g,
          padding: 0,
          background: "#fff",
          border: "1px solid #6b6b6b",
          borderRadius: 4,
          boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
          transform: `translateX(-50%) rotate(${A(Y)}deg)${H ? " translateY(-14px)" : ""}`,
          transformOrigin: `50% ${W}px`,
          transition: "transform 120ms ease",
          cursor: H ? "pointer" : "default"
        },
        children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: n.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: ge(x.suit) ? ue : "#000" }, children: [
          /* @__PURE__ */ t("span", { style: { fontSize: C, fontWeight: 700 }, children: ye(x.rank) }),
          /* @__PURE__ */ t("span", { style: { fontSize: D }, children: se[x.suit] })
        ] })
      },
      `${x.suit}${x.rank}`
    );
  }) });
}
function Vi({
  seat: e,
  name: n,
  tag: l,
  strip: a,
  bg: f,
  width: s,
  isDealer: r,
  metrics: o = {}
}) {
  const c = o.height ?? 22, p = o.badge ?? 20, b = o.font ?? 15, y = o.tagFont ?? 11;
  return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "stretch", gap: 5, width: s, height: c, padding: "0 3px 0 0", background: f, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${r ? Yi : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ t("span", { style: { flex: "none", width: 6, background: a ?? "transparent" } }),
    /* @__PURE__ */ t("span", { style: { flex: "none", width: p, height: p, alignSelf: "center", background: Ln, color: "#fff", fontSize: b - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
    /* @__PURE__ */ t("span", { style: { alignSelf: "center", fontSize: b, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: n }),
    r && /* @__PURE__ */ t("span", { style: { alignSelf: "center", flex: "none", padding: "0 2px", fontSize: y, fontWeight: 700, color: "#7a5a12" }, children: "DEALER" }),
    /* @__PURE__ */ t("span", { style: { marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: y, color: "#555" }, children: l ?? "" })
  ] });
}
function At({
  cards: e,
  panelBg: n,
  width: l,
  suitW: a,
  font: f,
  pad: s,
  bare: r,
  touch: o,
  isPlayable: c,
  onPlay: p
}) {
  const b = f ?? 19, y = !!o;
  return /* @__PURE__ */ t("div", { style: { width: l, background: r ? n : "#fff", border: r ? 0 : "1px solid #8a8a8a", borderRadius: r ? 0 : 3, padding: s ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: it.map((w) => {
    const S = e.filter((g) => g.suit === w).sort((g, R) => R.rank - g.rank);
    return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: ge(w) ? ue : "#000" }, children: [
      /* @__PURE__ */ t("span", { style: { flex: "none", width: a ?? 16, fontSize: b }, children: se[w] }),
      /* @__PURE__ */ t("span", { style: { display: "flex", flexWrap: "wrap", gap: y ? "0 4px" : "0 5px", fontSize: b }, children: S.length === 0 ? /* @__PURE__ */ t("span", { children: "—" }) : S.map((g) => {
        const R = c ? c(g) : !1;
        return /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            onClick: R ? () => p == null ? void 0 : p(g) : void 0,
            "aria-label": `Play ${ye(g.rank)}${se[w]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: y ? 84 : 0, minHeight: y ? 78 : 0, background: R ? "#d9f2d9" : "transparent", border: 0, borderRadius: y ? 6 : 0, padding: y ? "0 4px" : "0 1px", fontSize: b, fontWeight: R ? 700 : 400, color: "inherit", cursor: R ? "pointer" : "default" },
            children: ye(g.rank)
          },
          g.rank
        );
      }) })
    ] }, w);
  }) });
}
function On({
  bg: e,
  m: n = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: l,
  rows: a,
  dealerCol: f,
  emptyText: s = null
}) {
  const r = Z(null);
  return je(() => {
    const o = r.current;
    o && (o.scrollTop = o.scrollHeight);
  }, [a.length]), /* @__PURE__ */ d("div", { style: { width: n.width, height: n.height, maxHeight: n.height === "auto" ? 340 : void 0, background: e, borderRadius: n.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ t("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: l.map((o) => /* @__PURE__ */ d("span", { style: { padding: "2px 0", fontSize: n.headFont, fontWeight: 700, lineHeight: 1.1, background: o.vul ? "#cc1111" : o.isDealer ? un : "#fff", color: o.vul ? "#fff" : "#000" }, children: [
      o.seat,
      o.isDealer ? " •" : ""
    ] }, o.seat)) }),
    /* @__PURE__ */ d("div", { ref: r, "data-testid": "auction-rows", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }, children: [
      a.map((o, c) => /* @__PURE__ */ t("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((p) => {
        const b = o[p];
        return /* @__PURE__ */ t("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: n.cellMinH ?? 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: n.cellFont, lineHeight: 1.15, background: b ? p === f ? un : Fn : "transparent", color: b ? Xn(b.call) : "#000" }, children: b ? Bt(b.call) : "" }, p);
      }) }, c)),
      s != null && /* @__PURE__ */ t("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: s })
    ] })
  ] });
}
function hn({ plays: e, turn: n, scale: l = 1, variant: a = "cross" }) {
  if (a === "pill")
    return /* @__PURE__ */ t("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((s) => {
      const r = e.find((c) => c.seat === s), o = s === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : s === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : s === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return r ? /* @__PURE__ */ d("div", { style: { position: "absolute", ...o, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: ge(r.card.suit) ? ue : "#000" }, children: [
        /* @__PURE__ */ t("span", { style: { fontSize: 36, lineHeight: 1 }, children: se[r.card.suit] }),
        /* @__PURE__ */ t("span", { style: { fontSize: 36, lineHeight: 1 }, children: ye(r.card.rank) })
      ] }, s) : null;
    }) });
  const f = l;
  return /* @__PURE__ */ t("div", { style: { width: 262 * f, height: 262 * f, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ t("div", { style: { position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${f})`, transformOrigin: "center center" }, children: ["N", "E", "S", "W"].map((s) => {
    const r = e.find((p) => p.seat === s), o = s === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" } : s === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" } : s === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" } : { left: "206px", top: "50%", tr: "translateY(-50%)" }, c = s === n;
    return /* @__PURE__ */ t("div", { style: { position: "absolute", left: o.left, top: o.top, transform: o.tr, zIndex: r ? 2 : 1 }, children: r ? /* @__PURE__ */ t("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ d("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: ge(r.card.suit) ? ue : "#000" }, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 27, fontWeight: 700 }, children: ye(r.card.rank) }),
      /* @__PURE__ */ t("span", { style: { fontSize: 24 }, children: se[r.card.suit] })
    ] }) }) : /* @__PURE__ */ t("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ t("span", { style: { display: "block", width: c ? 22 : 0, height: 12, background: c ? "#9a9a9a" : "transparent" } }) }) }, s);
  }) }) });
}
function Pn({
  line: e,
  score: n,
  detail: l,
  action: a,
  actionNote: f,
  accent: s = "#384bb3"
}) {
  return /* @__PURE__ */ d("div", { style: { background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }, children: [
    /* @__PURE__ */ t("div", { style: { fontSize: 28, fontWeight: 700, color: "#000" }, children: e || "Board complete" }),
    n && /* @__PURE__ */ t("div", { style: { fontSize: 18, color: "#444", marginTop: 4 }, children: n }),
    /* @__PURE__ */ t("div", { style: { fontSize: 15, color: "#666", marginTop: 6 }, children: l }),
    a && /* @__PURE__ */ t(
      "a",
      {
        href: a.href,
        style: { display: "flex", alignItems: "center", justifyContent: "center", height: 48, marginTop: 14, borderRadius: 6, background: s, color: "#fff", fontSize: 19, fontWeight: 700, lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap" },
        children: a.label
      }
    ),
    a && f && /* @__PURE__ */ t("div", { style: { fontSize: 13, color: "#666", marginTop: 6 }, children: f })
  ] });
}
function Qi({ onClose: e, children: n }) {
  return /* @__PURE__ */ t("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ d("div", { onClick: (l) => l.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ t("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    n
  ] }) });
}
const Ji = "#384bb3", qi = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function Zi({
  title: e = "Coach",
  status: n = "",
  accent: l = Ji,
  lines: a,
  actions: f
}) {
  const s = (a && a.length ? a : []).map(
    (c) => typeof c == "string" ? { text: c, color: "#28312c" } : { text: c.text ?? "", color: c.color ?? "#28312c" }
  ), r = s.length === 0, o = f && f.length ? f : [];
  return /* @__PURE__ */ d("div", { style: qi, children: [
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }, children: [
      /* @__PURE__ */ t("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: l, color: "#fff", fontSize: 12, fontWeight: 700 }, children: "C" }),
      /* @__PURE__ */ t("span", { style: { fontSize: 14, fontWeight: 700, color: "#1d2421" }, children: e }),
      /* @__PURE__ */ t("span", { style: { flex: 1 } }),
      /* @__PURE__ */ t("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }, children: n })
    ] }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }, children: [
      s.map((c, p) => /* @__PURE__ */ t("div", { style: { fontSize: 14, lineHeight: 1.45, color: c.color }, children: c.text }, p)),
      r && /* @__PURE__ */ t("div", { style: { fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }, children: "Coach commentary appears here as the deal goes on." })
    ] }),
    o.length > 0 && /* @__PURE__ */ t("div", { style: { flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }, children: o.map((c, p) => /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        onClick: c.on ?? void 0,
        style: { height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: c.on ? "pointer" : "default" },
        children: c.label
      },
      p
    )) })
  ] });
}
const Oe = { w: 1040, h: 678 }, Ke = 720, pe = { w: 54, h: 128, rank: 42, glyph: 38, inset: 5, backW: 52 }, pn = 52, gn = 44, bn = 54, yn = { row: 172, fan: 238 }, xn = 52, mn = 30, el = 0.3, tl = 250, nl = 900, Sn = 150, il = (e) => Math.ceil(24 / (e || 1)), ll = 0, kn = (e) => Math.round(e * 8.8), ol = 24, vn = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, rl = {
  ...Hn("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, al = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function sl({ children: e }) {
  const n = Z(null), l = Z(null), [a, f] = te(1);
  return je(() => {
    const s = () => {
      const o = n.current, c = l.current;
      if (!o || !c) return;
      const p = o.clientWidth, b = o.clientHeight, y = c.offsetWidth, w = c.offsetHeight;
      if (!p || !b || !y || !w) return;
      const S = Math.min(1, p / y, b / w);
      f((g) => Math.abs(S - g) > 5e-3 ? S : g);
    };
    s();
    const r = new ResizeObserver(s);
    return n.current && r.observe(n.current), l.current && r.observe(l.current), () => r.disconnect();
  }), /* @__PURE__ */ t("div", { ref: n, style: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch", position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ t(
    "div",
    {
      ref: l,
      style: { position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${a})`, display: "flex", alignItems: "center", justifyContent: "center" },
      children: e
    }
  ) });
}
function cl({
  state: e,
  seats: n,
  visible: l,
  mySeat: a = null,
  legalCalls: f = [],
  legalPlays: s = [],
  myTurn: r = !1,
  boardLabel: o = "1",
  scoringLabel: c = "IMPs",
  auctionDisplay: p = "box",
  confirmBids: b = !1,
  completedAction: y,
  completedNote: w,
  resultLine: S = "",
  resultScore: g = "",
  onCall: R,
  onPlay: W,
  onMenu: A,
  onScoring: z,
  onClaim: L,
  controlsExtra: k,
  controlsExtraNarrow: O,
  railExtra: G,
  settings: P,
  viewHref: X,
  appearance: C,
  showCoach: D = !0,
  coachShare: x = 30,
  coachTitle: Y = "Coach",
  coachLines: H,
  coachActions: J
}) {
  var nn;
  const v = C ?? rl, K = v.handLayout === "fan", E = v.bidPad === "columns", I = v.centreFrame, V = I ? al : {}, F = Number.parseInt(v.radius, 10) || 5, j = Z(null), [N, xe] = te({ w: Oe.w, h: Oe.h });
  je(() => {
    const i = j.current;
    if (!i) return;
    const h = () => xe({ w: i.clientWidth || Oe.w, h: i.clientHeight || Oe.h });
    h();
    const M = new ResizeObserver(h);
    return M.observe(i), () => M.disconnect();
  }, []);
  const [q, ce] = te(null), [de, me] = te(null);
  Ne(() => {
    ce(null), me(null);
  }, [e.auction.length]);
  const [u, m] = te(!1), T = A ?? (P ? () => m((i) => !i) : void 0), B = [...P ?? []], [U, oe] = te(!1), he = N.w / Math.max(1, N.h) < 1.25, Q = he && N.w < 640, be = he && !Q, Se = be ? { w: Ke, h: 1268 } : Oe, ie = e.contract, fe = (ie == null ? void 0 : ie.declarer) ?? null, ee = fe && e.phase !== "auction" ? Ui[fe] : null, ne = e.phase === "auction", ke = e.phase === "play", De = e.phase === "complete", ve = new Set(f), Yn = new Set(s.map((i) => `${i.suit}${i.rank}`)), re = ne && r && !de, Un = (i) => e.vul === "both" || e.vul === "All" || Ki(i).toLowerCase() === String(e.vul).toLowerCase(), Gn = St.indexOf(e.dealer), Kn = D !== !1, lt = Math.max(0, Math.min(55, x ?? 30)), Ht = 100 - lt, zt = ke || De, Vn = fe ? !!n[fe].human : !1, ot = zt && !!ee && ee !== "S" && Vn, It = zt && !!ee && ee !== "S" && !ot, Qn = E && ne, rt = Math.min(1, N.w / Ke), _e = Math.max(240, N.h * (Ht / 100) || 590), Jn = (i) => {
    const h = Math.max(pn, Math.ceil(gn / (i || 1)) + 14);
    return Math.min(h, Math.max(pn, Math.round(0.13 * _e / (i || 1))));
  }, Ft = (i) => {
    const h = Math.max(xn, Math.ceil(gn / (i || 1))), M = el * _e / (i || 1) - mn;
    return Math.min(h, Math.max(xn, Math.floor(M / 3)));
  }, qn = (i) => 3 * Ft(i) + mn, Lt = (i, h) => {
    const M = Jn(i), $ = _e / (i || 1), _ = M * 2 + ll + il(i) + (It ? bn : 0) + (ot ? yn.row : 0) + (!h && ne ? qn(i) : 0) + yn[K ? "fan" : "row"];
    let ae = 0, He;
    h ? (ae = Math.max(30, Math.min(62, Math.floor(($ - _ - Sn) / 8.3))), He = Math.max(Sn, Math.round($ - _ - kn(ae)))) : He = Math.max(tl, Math.min(nl, Math.round($ - _)));
    const ln = _ + (h ? kn(ae) : 0) + He;
    return { bar: M, cell: ae, centre: He, content: ln, usePad: h, trayRow: Ft(i), scale: Math.min(1, rt, _e / ln) };
  }, Xt = (i) => {
    let h = Lt(rt, i);
    for (let M = 0; M < 10 && h.scale < rt - 5e-4; M++) {
      const $ = Lt(h.scale, i);
      if (Math.abs($.scale - h.scale) < 5e-4) {
        h = $;
        break;
      }
      h = $;
    }
    return h;
  };
  let le = Xt(Qn);
  le.usePad && le.cell * le.scale < ol && (le = Xt(!1));
  const Zn = le.usePad, ei = le.usePad ? le.cell : 38, Ot = le.centre, ti = Math.max(0.6, Math.min(1.6, (Ot - 8) / 262)), at = Math.min(N.w / Se.w, N.h / Se.h) || 1, Be = Q ? le.scale : at, ni = Q ? Ke : Math.max(Se.w, N.w / at), st = Q ? le.content : Math.max(Se.h, N.h / at), ii = Q ? -Math.round(le.content * (1 - le.scale)) : 0, li = (i) => n[i].human ? mt : !De && i === e.turn ? "#e8e8c8" : Fn, oi = (i) => i === ee || !De && i === e.turn ? "#fff" : "#b3b3b3", $e = (i) => {
    re && (b ? me(i) : R == null || R(i));
  }, Pt = () => {
    if (de == null) return;
    const i = de;
    me(null), R == null || R(i);
  }, jt = () => {
    me(null), ce(null);
  }, ct = (i) => (h) => r && ke && e.turn === i && Yn.has(`${h.suit}${h.rank}`), Ye = (i, h = { w: 14, h: 71 }) => /* @__PURE__ */ t(kt, { cards: e.hands[i], hidden: !0, metrics: vn, layout: "row", fanSpread: v.fanSpread, fanRadius: v.fanRadius, backColor: v.cardBack, backMetrics: h }), Ae = (i, h, M = {}) => /* @__PURE__ */ t(Vi, { seat: i, name: n[i].name, tag: n[i].tag, strip: n[i].strip, bg: li(i), width: h, isDealer: i === e.dealer, metrics: M }), Ee = (i, h = 16) => {
    if (!ne || p !== "seats") return null;
    const M = e.auction.filter(($) => $.seat === i);
    return M.length ? /* @__PURE__ */ t("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: M.map(($, _) => {
      const ae = _ === M.length - 1;
      return /* @__PURE__ */ t("span", { style: { background: ae ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: h, fontWeight: ae ? 700 : 400, padding: "0 5px", color: Xn($.call) }, children: Bt($.call) }, _);
    }) }) : null;
  }, dt = (i, h = vn) => /* @__PURE__ */ t(
    kt,
    {
      cards: e.hands[i],
      metrics: h,
      layout: "row",
      fanSpread: v.fanSpread,
      fanRadius: v.fanRadius,
      backColor: v.cardBack,
      isPlayable: ct(i),
      onPlay: (M) => W == null ? void 0 : W(i, M)
    }
  ), Ue = (i, h = { width: 197 }) => /* @__PURE__ */ t(
    At,
    {
      cards: e.hands[i],
      panelBg: oi(i),
      width: h.width,
      suitW: h.suitW,
      font: h.font,
      pad: h.pad,
      bare: h.bare,
      touch: !!h.touch && r && ke && e.turn === i,
      isPlayable: ct(i),
      onPlay: (M) => W == null ? void 0 : W(i, M)
    }
  ), ft = (i, h) => {
    const M = h ?? {
      w: v.cardW,
      h: Math.round(v.cardW * 1.42),
      rank: Math.round(v.cardW * 0.46),
      glyph: Math.round(v.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ t(
      kt,
      {
        cards: e.hands[i],
        metrics: M,
        layout: "fan",
        fanSpread: v.fanSpread,
        fanRadius: v.fanRadius,
        backColor: v.cardBack,
        isPlayable: ct(i),
        onPlay: ($) => W == null ? void 0 : W(i, $)
      }
    );
  }, _t = (i) => {
    const h = K && l[i];
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      Ee(i),
      l[i] ? h ? ft(i) : dt(i) : Ye(i),
      Ae(i, h ? 197 : l[i] ? 50 + Math.max(0, e.hands[i].length - 1) * 49 : 197)
    ] });
  }, Yt = (i) => /* @__PURE__ */ d("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    Ee(i),
    l[i] ? Ue(i, { width: 197 }) : Ye(i),
    Ae(i, 197)
  ] }), Ut = [];
  {
    const i = [
      ...Array.from({ length: St.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let h = 0; h < i.length; h += 4) Ut.push(i.slice(h, h + 4));
  }
  const ut = (i = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ t(
    On,
    {
      bg: v.auctionBg,
      m: i,
      heads: St.map((h) => ({ seat: h, vul: Un(h), isDealer: h === e.dealer })),
      rows: Ut,
      dealerCol: Gn,
      emptyText: e.auction.length === 0 ? e.dealer === a ? "You deal" : `${e.dealer} deals` : null
    }
  ), Gt = ke ? ((nn = e.tricks[e.tricks.length - 1]) == null ? void 0 : nn.plays) ?? [] : [], Kt = (i = 1) => /* @__PURE__ */ t(hn, { plays: Gt, turn: e.turn, scale: i }), ht = /* @__PURE__ */ t(
    Pn,
    {
      line: S,
      score: g,
      detail: `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: y,
      actionNote: w,
      accent: v.accent
    }
  ), ri = /* @__PURE__ */ t(hn, { variant: "pill", plays: Gt, turn: e.turn }), pt = (i, h, M, $, _, ae = 21) => ({
    flex: "none",
    width: i,
    height: h,
    border: `1px solid ${$}`,
    borderRadius: F,
    background: M,
    color: "#fff",
    fontSize: ae,
    fontWeight: 700,
    lineHeight: 1,
    cursor: _ ? "pointer" : "default",
    opacity: _ ? 1 : 0.42
  }), Vt = (i, h) => /* @__PURE__ */ d(We, { children: [
    /* @__PURE__ */ d(
      "button",
      {
        type: "button",
        onClick: Pt,
        style: pt(240, i, "#116710", "#0c4b0b", !0, h),
        children: [
          "Confirm ",
          Bt(de ?? "")
        ]
      }
    ),
    /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        onClick: jt,
        style: pt(120, i, "#8a3030", "#5e1c1c", !0, h),
        children: "Cancel"
      }
    )
  ] }), ai = (i, h, M) => [1, 2, 3, 4, 5, 6, 7].map(($) => {
    const _ = Ge.some((He) => ve.has(`${$}${He}`)), ae = re && _;
    return /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        onClick: ae ? () => ce(q === $ ? null : $) : void 0,
        "aria-label": `Level ${$}`,
        style: { flex: "none", width: i, height: h, border: "1px solid #8a8a6a", borderRadius: F, background: q === $ ? mt : "#f8f8f8", color: "#000", fontSize: M, lineHeight: 1, cursor: ae ? "pointer" : "default", opacity: ae ? 1 : 0.42 },
        children: $
      },
      $
    );
  }), si = (i, h, M, $) => q ? Ge.filter((_) => ve.has(`${q}${_}`)).map((_) => /* @__PURE__ */ t(
    "button",
    {
      type: "button",
      onClick: () => $e(`${q}${_}`),
      "aria-label": `${q}${_ === "N" ? "NT" : _}`,
      style: { flex: "none", width: _ === "N" ? M : $, height: i, border: "1px solid #8a8a6a", borderRadius: F, background: "#f8f8f8", color: ge(_) ? ue : "#000", fontSize: h, lineHeight: 1, cursor: "pointer" },
      children: se[_]
    },
    _
  )) : null, ci = (i, h, M) => ["X", "XX"].map(($) => re && ve.has($) ? /* @__PURE__ */ t(
    "button",
    {
      type: "button",
      onClick: () => $e($),
      "aria-label": $ === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: i, height: h, border: `1px solid ${$ === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: F, background: $ === "X" ? ue : "#1034a6", color: "#fff", fontSize: M, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: $
    },
    $
  ) : /* @__PURE__ */ t("span", { style: { width: i, height: h } }, $)), di = (i, h, M) => /* @__PURE__ */ t(
    "button",
    {
      type: "button",
      onClick: re ? () => $e("P") : void 0,
      "aria-label": "Pass",
      style: pt(i, h, re ? "#116710" : "#a7b8a2", "#0c4b0b", re, M),
      children: "Pass"
    }
  ), fi = ve.has("X") || ve.has("XX"), Qt = q ? Ge.filter((i) => ve.has(`${q}${i}`)) : [], ui = /* @__PURE__ */ t("div", { style: { width: 581, flex: "none", background: v.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: de ? /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ t("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    Vt(44, 21)
  ] }) : /* @__PURE__ */ d(We, { children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      di(120, 37, 21),
      /* @__PURE__ */ t("div", { style: { display: "flex", gap: 6 }, children: ai(57, 37, 23) })
    ] }),
    (fi || Qt.length > 0) && /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ t("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: ci(57, 37, 21) }),
      /* @__PURE__ */ t("div", { style: { display: "flex", gap: 6 }, children: si(37, 23, 120, 57) })
    ] })
  ] }) }), Te = Q ? le.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, Be))), hi = [0, 1, 2, 3, 4].map((i) => {
    const h = Qt[i];
    return h ? /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        onClick: () => $e(`${q}${h}`),
        "aria-label": `${q}${h === "N" ? "NT" : h}`,
        style: { height: Te, border: "1px solid #8a8a6a", borderRadius: F, background: "#f8f8f8", color: ge(h) ? ue : "#000", fontSize: 26, lineHeight: 1, cursor: "pointer" },
        children: se[h]
      },
      i
    ) : /* @__PURE__ */ t("span", { style: { height: Te, pointerEvents: "none" } }, i);
  }), Jt = /* @__PURE__ */ t("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: v.trayBg, padding: "8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: de ? /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }, children: [
    /* @__PURE__ */ t("span", { style: { fontSize: 20, color: "#3a3a20" }, children: "Confirm your call" }),
    /* @__PURE__ */ t("div", { style: { display: "flex", gap: 10 }, children: Vt(52, 28) })
  ] }) : /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: re ? () => $e("P") : void 0,
          "aria-label": "Pass",
          style: { gridColumn: "span 3", minWidth: 0, height: Te, border: "1px solid #0c4b0b", borderRadius: F, background: re ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: re ? "pointer" : "default", opacity: re ? 1 : 0.42 },
          children: "Pass"
        }
      ),
      ["X", "XX"].map((i) => re && ve.has(i) ? /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: () => $e(i),
          "aria-label": i === "X" ? "Double" : "Redouble",
          style: { gridColumn: "span 2", minWidth: 0, height: Te, border: `1px solid ${i === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: F, background: i === "X" ? ue : "#1034a6", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: i
        },
        i
      ) : /* @__PURE__ */ t("span", { style: { gridColumn: "span 2", minWidth: 0, height: Te } }, i))
    ] }),
    /* @__PURE__ */ t("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [1, 2, 3, 4, 5, 6, 7].map((i) => {
      const h = Ge.some(($) => ve.has(`${i}${$}`)), M = re && h;
      return /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: M ? () => ce(q === i ? null : i) : void 0,
          "aria-label": `Level ${i}`,
          style: { height: Te, border: "1px solid #8a8a6a", borderRadius: F, background: q === i ? mt : "#f8f8f8", color: "#000", fontSize: 26, lineHeight: 1, cursor: M ? "pointer" : "default", opacity: M ? 1 : 0.42 },
          children: i
        },
        i
      );
    }) }),
    /* @__PURE__ */ t("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }, children: hi })
  ] }) }), gt = {
    legalCalls: f,
    live: re,
    pending: de,
    onStage: $e,
    onConfirm: Pt,
    onCancel: jt,
    radius: F
  }, pi = /* @__PURE__ */ t(et, { cell: 46, ...gt }), gi = /* @__PURE__ */ t("div", { style: { width: "100%", flex: "none", background: v.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ t(et, { cell: 84, minCellH: Te, ...gt }) }), qt = { N: "North", E: "East", S: "South", W: "West" }, Zt = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), bt = [
    { kind: "chip", label: "Board", value: String(o) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: Zt, color: Zt === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: ie ? `${ie.level}${se[ie.strain]}${ie.doubled === 1 ? "X" : ie.doubled === 2 ? "XX" : ""}` : "—", color: ie && ge(ie.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: ie ? qt[ie.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: c, title: "Scoring mode", on: z ?? null }
  ], yt = (i) => [
    ...i ? [{ kind: "node", node: i }] : [],
    { kind: "divider" },
    ...X ? [{ kind: "button", label: X.label, title: "Four-hand record", href: X.href }] : [],
    ...G ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => oe(!0) }] : [],
    { kind: "spacer" },
    ...L && ke ? [{ kind: "button", label: "Claim", tone: "accent", on: L }] : [],
    ...T ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: T }] : []
  ], en = U && G ? /* @__PURE__ */ t(Qi, { onClose: () => oe(!1), children: G }) : null, bi = (i) => it.map((h) => {
    const M = e.hands[i].filter(($) => $.suit === h).sort(($, _) => _.rank - $.rank).map(($) => ye($.rank)).join("");
    return M ? { suit: h, ranks: M } : null;
  }).filter((h) => h != null), yi = It && ee ? /* @__PURE__ */ d("div", { "data-testid": "dummy-strip", style: { flex: "none", height: bn, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ t("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: qt[ee] }),
    l[ee] ? bi(ee).map((i) => /* @__PURE__ */ d("span", { style: { fontSize: 26, fontWeight: 700, color: "#f2f6f4", whiteSpace: "nowrap" }, children: [
      /* @__PURE__ */ t("span", { style: { color: ge(i.suit) ? ue : "#111" }, children: se[i.suit] }),
      i.ranks
    ] }, i.suit)) : null
  ] }) : null, xi = ot && ee ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ t("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: l[ee] ? K ? ft(ee, pe) : dt(ee, pe) : Ye(ee, { w: pe.backW, h: pe.h }) })
  ) : null, mi = /* @__PURE__ */ d("div", { style: { width: Ke, minHeight: st, height: st, transform: `scale(${Be})`, transformOrigin: "top center", marginBottom: ii, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    /* @__PURE__ */ t(ze, { side: "top", items: bt, condensed: !0, thickness: le.bar, bg: v.barBg, accent: v.accent }),
    /* @__PURE__ */ d("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: v.feltFlat }, children: [
      yi,
      xi,
      /* @__PURE__ */ t("div", { "data-testid": "centre-band", style: { flex: "none", height: Ot, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: /* @__PURE__ */ d("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: ne ? "flex-start" : "center", justifyContent: "center", ...I ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
        ne && p === "box" ? ut({ width: 430, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
        ne && p === "seats" ? /* @__PURE__ */ t("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((i) => /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ t("span", { style: { width: 30, height: 30, background: Ln, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: i }),
          Ee(i, 22) ?? /* @__PURE__ */ t("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
        ] }, i)) }) : null,
        ke ? Kt(ti) : null,
        De ? ht : null
      ] }) }),
      ne ? Zn ? /* @__PURE__ */ t("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ t(et, { cell: ei, ...gt }) }) : Jt : null,
      /* @__PURE__ */ t("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        Ee("S"),
        l.S ? K ? ft("S", pe) : dt("S", pe) : Ye("S", { w: pe.backW, h: pe.h }),
        Ae("S", l.S ? pe.w + Math.max(0, e.hands.S.length - 1) * (pe.w - 1) : 390)
      ] }) })
    ] }),
    /* @__PURE__ */ t(ze, { side: "bottom", items: yt(O ?? k), condensed: !0, thickness: le.bar, bg: v.barBg, accent: v.accent })
  ] }), Si = (i) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ee(i, 22),
    Ae(i, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    l[i] && Ue(i, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), tn = (i) => /* @__PURE__ */ d("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ee(i, 22),
    Ae(i, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    l[i] && Ue(i, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), ki = (i) => /* @__PURE__ */ d("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    Ee(i, 22),
    Ae(i, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    l[i] && Ue(i, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), vi = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: v.stageBg }, children: [
    /* @__PURE__ */ t(ze, { side: "top", items: bt, scale: Be, minTouch: 44, bg: v.barBg, accent: v.accent }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: v.felt }, children: [
      /* @__PURE__ */ t("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Si("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        tn("W"),
        /* @__PURE__ */ d("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...V }, children: [
          ne && p === "box" ? ut({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          ke ? ri : null,
          De ? ht : null
        ] }),
        tn("E")
      ] }),
      /* @__PURE__ */ t("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: ki("S") })
    ] }),
    ne ? E ? gi : Jt : null,
    /* @__PURE__ */ t(ze, { side: "bottom", items: yt(O ?? k), scale: Be, minTouch: 44, bg: v.barBg, accent: v.accent })
  ] }), wi = /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    /* @__PURE__ */ t(ze, { side: "top", items: bt, scale: Be, bg: v.barBg, accent: v.accent }),
    /* @__PURE__ */ t("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: v.felt }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ t("div", { style: { display: "flex", justifyContent: "center" }, children: _t("N") }),
      /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        Yt("W"),
        /* @__PURE__ */ t("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...V }, children: /* @__PURE__ */ d(sl, { children: [
          ne && E ? pi : ne && p === "box" ? ut() : null,
          ke ? Kt() : null,
          De ? ht : null
        ] }) }),
        Yt("E")
      ] }),
      /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ t("div", { style: { height: ne && !E ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: ne && !E ? ui : null }),
        _t("S")
      ] })
    ] }) }),
    /* @__PURE__ */ t(ze, { side: "bottom", items: yt(k), scale: Be, bg: v.barBg, accent: v.accent })
  ] });
  return Q ? /* @__PURE__ */ d("div", { ref: j, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: v.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ t("div", { style: { flex: Ht, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ t("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: mi }) }),
    lt > 0 && /* @__PURE__ */ t("div", { style: { flex: lt, minHeight: 0, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: Kn && /* @__PURE__ */ t(Zi, { title: Y, accent: v.accent, lines: H, actions: J }) }),
    en,
    u && !A && /* @__PURE__ */ t(fn, { accent: v.accent, items: B, onClose: () => m(!1) })
  ] }) : /* @__PURE__ */ t("div", { ref: j, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: v.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: v.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ d("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: ni, height: st, transform: `scale(${Be})` }, children: [
    be ? vi : wi,
    en,
    u && !A && /* @__PURE__ */ t(fn, { accent: v.accent, items: B, onClose: () => m(!1) })
  ] }) });
}
const wn = "#ffce04", Ve = "#cb0200", Cn = "#016700", dl = "#cbcbcb", Wn = "#99cccc", fl = "#336799", jn = 648, $t = 400, Et = 8, Tt = 8, we = { w: Tt * 2 + jn * 3 + Et * 2, h: Tt * 2 + $t * 3 + Et * 2 }, Rn = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Nn = ["W", "N", "E", "S"], ul = ["S", "H", "D", "C"], Bn = (e) => e === "H" || e === "D", hl = (e) => /^[1-7][CDHSN]$/.test(e), pl = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e);
function gl({
  boardLabel: e,
  dealer: n,
  vul: l,
  hands: a,
  names: f,
  visible: s,
  auction: r = [],
  highlightSeat: o = null,
  info: c = [],
  result: p = [],
  nav: b
}) {
  const y = Z(null), [w, S] = te({ w: we.w, h: we.h });
  je(() => {
    const C = y.current;
    if (!C) return;
    const D = () => S({ w: C.clientWidth || we.w, h: C.clientHeight || we.h });
    D();
    const x = new ResizeObserver(D);
    return x.observe(C), () => x.disconnect();
  }, []);
  const g = Math.min(w.w / we.w, w.h / we.h) || 1, R = (C) => {
    const D = l.toLowerCase();
    return D === "both" || D === "all" || D === (C === "N" || C === "S" ? "ns" : "ew");
  }, W = 57, A = 145, z = (C) => {
    const D = R(C), x = C === n;
    return /* @__PURE__ */ t("div", { style: { background: x ? wn : D ? Ve : "#fff", color: D && !x ? "#fff" : "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }, children: C });
  }, L = /* @__PURE__ */ d("div", { style: { width: W * 2 + A + 4, display: "grid", gridTemplateColumns: `${W}px ${A}px ${W}px`, gridTemplateRows: `${W}px ${A}px ${W}px`, gap: 2, padding: 2, background: "#000", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ t("div", { style: { background: "#000" } }),
    z("N"),
    /* @__PURE__ */ t("div", { style: { background: "#000" } }),
    z("W"),
    /* @__PURE__ */ t("div", { title: String(e), style: { background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: String(e).length > 8 ? 24 : String(e).length > 3 ? 40 : 104, fontWeight: 700, color: "#000", overflow: "hidden", padding: "0 4px", textAlign: "center", lineHeight: 1.05, wordBreak: "break-all" }, children: e }),
    z("E"),
    /* @__PURE__ */ t("div", { style: { background: "#000" } }),
    z("S"),
    /* @__PURE__ */ t("div", { style: { background: "#000" } })
  ] }), k = (C) => {
    const D = (s == null ? void 0 : s[C]) ?? !0;
    return /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: "column", alignSelf: "stretch" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", height: 70, background: C === o ? wn : "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }, children: [
        /* @__PURE__ */ t("span", { style: { flex: "none", width: 70, height: 70, background: fl, color: "#fff", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: C }),
        /* @__PURE__ */ t("span", { style: { padding: "0 14px", fontSize: 52, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: f[C] }),
        !D && /* @__PURE__ */ t("span", { style: { marginLeft: "auto", paddingRight: 14, fontSize: 24, color: "#666" }, children: "hidden" })
      ] }),
      /* @__PURE__ */ t("div", { style: { flex: 1, background: dl, padding: "4px 14px 10px" }, children: ul.map((x) => {
        const Y = [...a[C]].filter((H) => H.suit === x).sort((H, J) => J.rank - H.rank);
        return /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "baseline", gap: 10, lineHeight: 1.35, fontSize: 58, color: Bn(x) ? Ve : "#000" }, children: [
          /* @__PURE__ */ t("span", { style: { flex: "none", width: 58 }, children: Rn[x] }),
          /* @__PURE__ */ t("span", { style: { color: "#000", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden" }, children: D && Y.length ? Y.map((H) => pl(H.rank)).join("") : "—" })
        ] }, x);
      }) })
    ] });
  }, O = [];
  {
    const C = [
      ...Array.from({ length: Nn.indexOf(n) }, () => null),
      ...r
    ];
    for (let D = 0; D < C.length; D += 4) O.push(C.slice(D, D + 4));
  }
  const G = (C) => hl(C) ? /* @__PURE__ */ d(We, { children: [
    C[0],
    /* @__PURE__ */ t("span", { style: { color: Bn(C[1] ?? "") ? Ve : "#000" }, children: Rn[C[1] ?? ""] })
  ] }) : C === "P" ? "P" : C, P = /* @__PURE__ */ d("div", { style: { width: "100%", height: 374, background: Wn, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: [
    /* @__PURE__ */ t("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: Nn.map((C) => /* @__PURE__ */ t("span", { style: { padding: "2px 0", fontSize: 42, fontWeight: 700, lineHeight: 1.15, background: R(C) ? Ve : "#fff", color: R(C) ? "#fff" : "#000" }, children: C }, C)) }),
    /* @__PURE__ */ d("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px" }, children: [
      O.map((C, D) => /* @__PURE__ */ t("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", textAlign: "center" }, children: [0, 1, 2, 3].map((x) => /* @__PURE__ */ t("span", { style: { fontSize: 42, lineHeight: 1.25, color: "#000" }, children: C[x] ? G(C[x].call) : "" }, x)) }, D)),
      r.length === 0 && /* @__PURE__ */ t("div", { style: { textAlign: "center", fontSize: 32, color: "#1e4747", paddingTop: 10 }, children: "No calls yet" })
    ] })
  ] }), X = (C) => /* @__PURE__ */ t("div", { style: { width: "100%", alignSelf: "end", background: Wn, padding: "10px 16px", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }, children: C.map((D, x) => /* @__PURE__ */ d("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 40, lineHeight: 1.3, color: "#000" }, children: [
    /* @__PURE__ */ t("span", { style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: D.label }),
    /* @__PURE__ */ t("span", { style: { flex: "none", fontWeight: 700 }, children: D.value })
  ] }, x)) });
  return /* @__PURE__ */ t("div", { ref: y, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: Cn, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, Helvetica, sans-serif", WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ t("div", { style: { flex: "none", transformOrigin: "center center", width: we.w, height: we.h, transform: `scale(${g})` }, children: /* @__PURE__ */ d("div", { style: { position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(3, ${jn}px)`, gridTemplateRows: `repeat(3, ${$t}px)`, gap: Et, padding: Tt, background: Cn }, children: [
    /* @__PURE__ */ d("div", { style: { justifySelf: "start", alignSelf: "start", display: "flex", gap: 24, alignItems: "flex-start", maxHeight: $t, overflow: "hidden" }, children: [
      L,
      b
    ] }),
    k("N"),
    /* @__PURE__ */ t("div", { style: { alignSelf: "start", width: "100%" }, children: P }),
    k("W"),
    /* @__PURE__ */ t("div", {}),
    k("E"),
    /* @__PURE__ */ t("div", { style: { display: "flex", alignItems: "end" }, children: X(c) }),
    k("S"),
    /* @__PURE__ */ t("div", { style: { display: "flex", alignItems: "end" }, children: X(p) })
  ] }) }) });
}
const $n = ["N", "E", "S", "W"], bl = { N: "S", S: "N", E: "W", W: "E" }, yl = { N: "North", E: "East", S: "South", W: "West" };
function Xl({
  deal: e,
  seed: n = 1,
  dealer: l = "N",
  vul: a = "none",
  humanSeat: f = "S",
  showAllHands: s = !1,
  appearance: r,
  decide: o,
  robotDelayMs: c = 350,
  showCoach: p = !1,
  coachShare: b,
  onComplete: y
}) {
  var J, v, K;
  const w = Re(() => e ?? Mt(n), [e, n]), [S, g] = te(
    () => nt("embed", l, a, w)
  ), R = `${l}:${a}:${n}:${w.N.length}:${((J = w.N[0]) == null ? void 0 : J.suit) ?? ""}${((v = w.N[0]) == null ? void 0 : v.rank) ?? ""}`, W = Z(R);
  Ne(() => {
    W.current !== R && (W.current = R, A.current = 0, g(nt("embed", l, a, w)));
  }, [R, l, a, w]);
  const A = Z(0), z = Fe((E, I) => {
    g(
      (V) => Ie(V, {
        category: "bid-event",
        seq: A.current += 1,
        boardRef: V.boardRef,
        seat: E,
        call: I
      })
    );
  }, []), L = Fe((E, I) => {
    g(
      (V) => Ie(V, {
        category: "play-event",
        seq: A.current += 1,
        boardRef: V.boardRef,
        seat: E,
        card: I
      })
    );
  }, []), k = ((K = S.contract) == null ? void 0 : K.declarer) ?? null, O = k && S.phase !== "auction" ? bl[k] : null, G = Fe(
    (E) => E === f || E === O && k === f,
    [f, O, k]
  ), P = S.phase !== "complete" && G(S.turn), X = Z(!1);
  Ne(() => {
    if (!o || P || S.phase === "complete" || X.current) return;
    const E = S.turn, I = S;
    X.current = !0;
    let V = !1;
    return (async () => {
      try {
        if (await new Promise((N) => setTimeout(N, c)), V) return;
        const j = await o(I, E);
        if (V || !j) return;
        g((N) => N !== I && N.turn !== E ? N : j.call && N.phase === "auction" ? Xe(N.auction, E).has(j.call) ? Ie(N, {
          category: "bid-event",
          seq: A.current += 1,
          ts: Date.now(),
          boardRef: N.boardRef,
          seat: E,
          call: j.call,
          fallback: !1
        }) : N : j.card && N.phase === "play" && Rt(N, E).some(
          (ce) => ce.suit === j.card.suit && ce.rank === j.card.rank
        ) ? Ie(N, {
          category: "play-event",
          seq: A.current += 1,
          ts: Date.now(),
          boardRef: N.boardRef,
          seat: E,
          card: j.card,
          fallback: !1
        }) : N);
      } finally {
        X.current = !1;
      }
    })(), () => {
      V = !0, X.current = !1;
    };
  }, [o, P, S, c]);
  const C = Z(!1);
  Ne(() => {
    S.phase !== "complete" || C.current || (C.current = !0, y == null || y(S));
  }, [S, y]);
  const D = Re(() => ({
    ...Hn((r == null ? void 0 : r.skin) ?? "bbo", r == null ? void 0 : r.overrides),
    handLayout: (r == null ? void 0 : r.handLayout) ?? "row",
    bidPad: (r == null ? void 0 : r.bidPad) ?? "grid",
    centreFrame: (r == null ? void 0 : r.centreFrame) ?? !1,
    fanSpread: (r == null ? void 0 : r.fanSpread) ?? 56,
    fanRadius: (r == null ? void 0 : r.fanRadius) ?? 0
  }), [r]), x = Re(() => {
    const E = {};
    for (const I of $n)
      E[I] = s || I === f || I === O;
    return E;
  }, [s, f, O]), Y = Re(() => {
    const E = {};
    for (const I of $n)
      E[I] = {
        name: I === f ? "You" : yl[I],
        human: I === f
      };
    return E;
  }, [f]), H = S.phase === "complete" ? Mi(S) : null;
  return /* @__PURE__ */ t(
    cl,
    {
      state: S,
      seats: Y,
      visible: x,
      mySeat: f,
      myTurn: P,
      legalCalls: S.phase === "auction" && P ? [...Xe(S.auction, S.turn)] : [],
      legalPlays: S.phase === "play" && P ? Rt(S, S.turn) : [],
      appearance: D,
      showCoach: p,
      ...b === void 0 ? {} : { coachShare: b },
      resultLine: H ? Di(H) : "",
      resultScore: H ? `${H.declarerScore >= 0 ? "+" : ""}${H.declarerScore}` : "",
      onCall: (E) => {
        P && z(S.turn, E);
      },
      onPlay: (E, I) => {
        P && L(S.turn, I);
      }
    }
  );
}
const vt = ["W", "N", "E", "S"], xl = { N: "North", E: "East", S: "South", W: "West" }, ml = {
  none: "Neither vulnerable",
  ns: "N-S vulnerable",
  ew: "E-W vulnerable",
  both: "Both vulnerable"
}, Sl = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, kl = (e) => e === "H" || e === "D", vl = (e) => /^[1-7][CDHSN]$/.test(e), wl = "#dbe8e8", wt = "#fbfbfa", Me = "rgba(0,0,0,0.10)", Le = "#111827", Ce = "#6B7280", Ct = "#2f5c8f", Cl = (e, n) => n === "both" || n === (e === "N" || e === "S" ? "ns" : "ew");
function Qe({ call: e, size: n = 15 }) {
  if (!vl(e))
    return /* @__PURE__ */ t("span", { style: { fontSize: n, fontWeight: 700, color: Le }, children: e === "P" ? "Pass" : e });
  const l = e[1] ?? "N";
  return /* @__PURE__ */ d("span", { style: { fontSize: n, fontWeight: 700, color: Le, whiteSpace: "nowrap" }, children: [
    e[0],
    /* @__PURE__ */ t("span", { style: { color: kl(l) ? "#cc0000" : Le }, children: Sl[l] })
  ] });
}
function Wl(e, n, l) {
  const a = e.deal ? null : e.seed ?? 1, f = e.deal ?? Mt(a ?? 1), s = e.dealer ?? n.dealer, r = e.vul ?? n.vul, o = e.seat ?? n.seat;
  let c = nt(`drill-${l}`, s, r, f);
  const p = (y) => {
    c = Ie(c, {
      category: "bid-event",
      boardRef: c.boardRef,
      seat: c.turn,
      call: y
    });
  };
  for (const y of e.auction ?? []) {
    if (c.phase !== "auction" || c.turn === o || !Xe(c.auction, c.turn).has(y)) break;
    p(y);
  }
  for (let y = 0; y < 4 && c.phase === "auction" && c.turn !== o; y++) p("P");
  const b = c.phase === "auction" && c.turn === o;
  return {
    seed: a,
    seat: o,
    dealer: s,
    vul: r,
    state: c,
    legal: b ? [...Xe(c.auction, o)] : [],
    askable: b,
    note: e.note ?? ""
  };
}
function Ol({
  hands: e,
  dealer: n = "N",
  vul: l = "none",
  seat: a = "S",
  decide: f,
  prefetchConcurrency: s = 2,
  onComplete: r
}) {
  const o = Re(
    () => JSON.stringify([
      n,
      l,
      a,
      e.map((m) => [m.seed ?? null, m.dealer ?? null, m.vul ?? null, m.seat ?? null, m.auction ?? null, m.note ?? "", m.deal ? Object.values(m.deal).flat().length : 0])
    ]),
    [e, n, l, a]
  ), c = Z({ sig: "", list: [] });
  c.current.sig !== o && (c.current = { sig: o, list: e.map((m, T) => Wl(m, { dealer: n, vul: l, seat: a }, T)) });
  const p = c.current.list, b = Z(f);
  b.current = f;
  const y = !!f, [w, S] = te({});
  Ne(() => {
    const m = c.current.list, T = {};
    for (let Q = 0; Q < m.length; Q++)
      T[Q] = { status: y && m[Q].askable ? "pending" : "off", call: null, ms: null };
    if (S(T), !y) return;
    let B = !1, U = 0;
    const oe = async () => {
      var Q;
      for (; ; ) {
        const be = U++;
        if (B || be >= m.length) return;
        const Se = m[be];
        if (!Se.askable) continue;
        const ie = Date.now();
        try {
          const fe = await ((Q = b.current) == null ? void 0 : Q.call(b, Se.state, Se.seat));
          if (B) return;
          const ee = Date.now() - ie;
          S((ne) => ({
            ...ne,
            [be]: fe != null && fe.call ? { status: "ready", call: fe.call, ms: ee } : { status: "failed", call: null, ms: ee }
          }));
        } catch {
          if (B) return;
          S((fe) => ({ ...fe, [be]: { status: "failed", call: null, ms: Date.now() - ie } }));
        }
      }
    }, he = Math.max(1, Math.min(s, m.length));
    return Promise.all(Array.from({ length: he }, () => oe())), () => {
      B = !0;
    };
  }, [o, y, s]);
  const [g, R] = te(0), [W, A] = te({}), [z, L] = te(null), [k, O] = te(!1), G = Fe(() => {
    R(0), A({}), L(null), O(!1), C.current = !1;
  }, []), P = Z(o);
  P.current !== o && (P.current = o, (g !== 0 || k || Object.keys(W).length) && G());
  const X = Re(
    () => p.flatMap((m, T) => {
      const B = W[T];
      if (!B) return [];
      const U = w[T], oe = (U == null ? void 0 : U.status) === "ready" ? U.call : null;
      return [
        {
          index: T,
          seat: m.seat,
          seed: m.seed,
          yourCall: B,
          benCall: oe,
          agreed: oe ? oe === B : null,
          benMs: (U == null ? void 0 : U.ms) ?? null
        }
      ];
    }),
    [p, W, w]
  ), C = Z(!1);
  Ne(() => {
    !k || C.current || (C.current = !0, r == null || r(X));
  }, [k, X, r]);
  const D = Z(null), [x, Y] = te(560);
  Ne(() => {
    const m = D.current;
    if (!m) return;
    const T = () => Y(m.clientWidth || 560);
    T();
    const B = new ResizeObserver(T);
    return B.observe(m), () => B.disconnect();
  }, []);
  const H = 280, J = 14, v = 14, K = x >= H + v + 240 + J * 2, E = (K ? x - J * 2 - v - H : x - J * 2) - 6, I = Math.max(26, Math.min(46, Math.floor((E - 70) / 5.65))), V = 5 * (I + 14) + 4 * Math.round(I * 0.13);
  if (p.length === 0)
    return /* @__PURE__ */ t("div", { style: { padding: 16, fontSize: 13, color: Ce, background: wt, border: `1px solid ${Me}`, borderRadius: 12 }, children: "This drill has no hands yet." });
  const F = p[Math.min(g, p.length - 1)], j = W[g] ?? null, N = w[g], xe = [];
  {
    const m = [
      ...Array.from({ length: vt.indexOf(F.dealer) }, () => null),
      ...F.state.auction,
      // The learner's own call, once made, belongs in the grid like any other.
      ...j ? [{ seat: F.seat, call: j }] : []
    ];
    for (let T = 0; T < m.length; T += 4) xe.push(m.slice(T, T + 4));
  }
  const q = vt.map((m) => ({ seat: m, vul: Cl(m, F.vul), isDealer: m === F.dealer })), ce = /* @__PURE__ */ t("div", { style: { display: "flex", gap: 5, alignItems: "center" }, children: p.map((m, T) => /* @__PURE__ */ t(
    "span",
    {
      title: `Hand ${T + 1}`,
      style: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: W[T] ? Ct : "transparent",
        border: `1.5px solid ${T === g && !k ? Ct : "rgba(0,0,0,0.22)"}`,
        boxSizing: "border-box"
      }
    },
    T
  )) }), de = () => {
    if (!j) return null;
    const m = (N == null ? void 0 : N.status) === "ready" && N.call === j;
    return /* @__PURE__ */ d("div", { style: { background: "#fff", border: `1px solid ${Me}`, borderRadius: 10, padding: "10px 12px" }, children: [
      /* @__PURE__ */ d("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13, color: Ce }, children: [
        /* @__PURE__ */ t("span", { children: "You bid" }),
        /* @__PURE__ */ t(Qe, { call: j, size: 17 }),
        (N == null ? void 0 : N.status) === "ready" && N.call ? m ? /* @__PURE__ */ t("span", { style: { color: "#1a7f4b", fontWeight: 600 }, children: "— BEN bids that too." }) : /* @__PURE__ */ d(We, { children: [
          /* @__PURE__ */ t("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ t("span", { children: "BEN bid" }),
          /* @__PURE__ */ t(Qe, { call: N.call, size: 17 })
        ] }) : (N == null ? void 0 : N.status) === "pending" ? /* @__PURE__ */ d(We, { children: [
          /* @__PURE__ */ t("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ t("span", { style: { fontStyle: "italic" }, children: "BEN is still working on this hand…" })
        ] }) : (N == null ? void 0 : N.status) === "failed" ? /* @__PURE__ */ d(We, { children: [
          /* @__PURE__ */ t("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
          /* @__PURE__ */ t("span", { children: "BEN unavailable" })
        ] }) : null
      ] }),
      F.note && /* @__PURE__ */ t("p", { style: { fontSize: 13, lineHeight: 1.45, color: Le, marginTop: 8, marginBottom: 0 }, children: F.note }),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: () => g + 1 < p.length ? R(g + 1) : O(!0),
          style: {
            marginTop: 12,
            height: 38,
            padding: "0 18px",
            border: 0,
            borderRadius: 8,
            background: Ct,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer"
          },
          children: g + 1 < p.length ? "Next hand →" : "See how you did"
        }
      )
    ] });
  };
  if (k) {
    const m = X.filter((B) => B.benCall), T = m.filter((B) => B.agreed).length;
    return /* @__PURE__ */ d("div", { ref: D, style: { background: wt, border: `1px solid ${Me}`, borderRadius: 12, padding: 14 }, children: [
      /* @__PURE__ */ t("div", { style: { display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ t(
        Pn,
        {
          line: "Drill complete",
          score: m.length ? `Same call as BEN on ${T} of ${m.length}` : "",
          detail: `${X.length} hand${X.length === 1 ? "" : "s"} bid`
        }
      ) }),
      /* @__PURE__ */ t("div", { style: { marginTop: 14 }, children: X.map((B) => /* @__PURE__ */ d(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 4px",
            borderTop: `1px solid ${Me}`,
            fontSize: 13,
            color: Ce
          },
          children: [
            /* @__PURE__ */ d("span", { style: { width: 58, flex: "none" }, children: [
              "Hand ",
              B.index + 1
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ t("span", { children: "you" }),
              /* @__PURE__ */ t(Qe, { call: B.yourCall })
            ] }),
            /* @__PURE__ */ d("span", { style: { display: "flex", alignItems: "baseline", gap: 5 }, children: [
              /* @__PURE__ */ t("span", { style: { color: "rgba(0,0,0,0.25)" }, children: "·" }),
              /* @__PURE__ */ t("span", { children: "BEN" }),
              B.benCall ? /* @__PURE__ */ t(Qe, { call: B.benCall }) : /* @__PURE__ */ t("span", { style: { fontStyle: "italic" }, children: "unavailable" })
            ] }),
            B.agreed && /* @__PURE__ */ t("span", { style: { marginLeft: "auto", color: "#1a7f4b", fontWeight: 700 }, children: "same" })
          ]
        },
        B.index
      )) }),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          onClick: G,
          style: {
            marginTop: 12,
            height: 34,
            padding: "0 14px",
            border: `1px solid ${Me}`,
            borderRadius: 8,
            background: "#fff",
            color: Le,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Bid them again"
        }
      ),
      /* @__PURE__ */ t("p", { style: { fontSize: 11.5, color: Ce, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
    ] });
  }
  const me = /* @__PURE__ */ d("div", { style: { flex: K ? "1 1 0" : void 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }, children: [
    /* @__PURE__ */ t(At, { cards: F.state.hands[F.seat], panelBg: "#fff", width: "100%", font: 20, suitW: 18, pad: "6px 10px" }),
    /* @__PURE__ */ t("div", { style: { display: "flex", justifyContent: K ? "flex-start" : "center" }, children: /* @__PURE__ */ t(
      On,
      {
        bg: wl,
        m: { width: 236, height: "auto", headFont: 16, cellFont: 15, radius: 6, cellMinH: 20 },
        heads: q,
        rows: xe,
        dealerCol: vt.indexOf(F.dealer),
        emptyText: xe.length === 0 ? `${F.dealer === F.seat ? "You deal" : `${F.dealer} deals`}` : null
      }
    ) })
  ] }), u = /* @__PURE__ */ d(
    "div",
    {
      style: {
        flex: K ? `0 0 ${V}px` : void 0,
        width: K ? V : "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8
      },
      children: [
        F.askable ? j ? null : /* @__PURE__ */ d(We, { children: [
          /* @__PURE__ */ t("span", { style: { fontSize: 12, color: Ce, alignSelf: "flex-start" }, children: z ? "Confirm your call" : "Your call?" }),
          /* @__PURE__ */ t(
            et,
            {
              cell: I,
              radius: 6,
              legalCalls: F.legal,
              live: !0,
              pending: z,
              onStage: L,
              onConfirm: () => {
                z && (A((m) => ({ ...m, [g]: z })), L(null));
              },
              onCancel: () => L(null)
            }
          )
        ] }) : /* @__PURE__ */ t("p", { style: { fontSize: 13, color: Ce, textAlign: "center", margin: 0 }, children: "This hand's auction is already over — nothing to bid." }),
        (j || !F.askable) && /* @__PURE__ */ t("div", { style: { width: "100%" }, children: j ? de() : /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            onClick: () => g + 1 < p.length ? R(g + 1) : O(!0),
            style: { height: 34, padding: "0 14px", border: `1px solid ${Me}`, borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
            children: "Skip this hand →"
          }
        ) })
      ]
    }
  );
  return /* @__PURE__ */ d("div", { ref: D, style: { background: wt, border: `1px solid ${Me}`, borderRadius: 12, padding: 14 }, children: [
    /* @__PURE__ */ d("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }, children: [
      /* @__PURE__ */ d("span", { style: { fontSize: 12.5, fontWeight: 700, color: Le }, children: [
        "Hand ",
        g + 1,
        " of ",
        p.length
      ] }),
      ce
    ] }),
    /* @__PURE__ */ d("p", { style: { fontSize: 12, color: Ce, margin: "0 0 10px" }, children: [
      "You are ",
      xl[F.seat],
      " · ",
      ml[F.vul]
    ] }),
    /* @__PURE__ */ d("div", { style: { display: "flex", flexDirection: K ? "row" : "column", gap: 14, alignItems: "flex-start" }, children: [
      me,
      u
    ] }),
    /* @__PURE__ */ t("p", { style: { fontSize: 11.5, color: Ce, marginTop: 12, marginBottom: 0, lineHeight: 1.45 }, children: "BEN is a neural engine bidding its own system. Where it differs from you, read it as a second opinion — not a correction." })
  ] });
}
const En = ["N", "E", "S", "W"], Tn = { N: "North", E: "East", S: "South", W: "West" }, Rl = { none: "None", ns: "N-S", ew: "E-W", both: "Both" }, Nl = 1976 / 1232, Je = (e) => e.reduce((n, l) => n + Math.max(0, l.rank - 10), 0);
function Pl({
  seed: e = 1,
  deal: n,
  dealer: l = "N",
  vul: a = "none",
  show: f = "all",
  boardLabel: s,
  names: r,
  auction: o = [],
  highlightSeat: c = null,
  hiddenSeats: p = []
}) {
  const b = Re(() => n ?? Mt(e), [n, e]), y = Re(() => {
    let g = nt("diagram", l, a, b);
    for (const R of o) {
      if (g.phase !== "auction" || !Xe(g.auction, g.turn).has(R)) break;
      g = Ie(g, {
        category: "bid-event",
        boardRef: g.boardRef,
        seat: g.turn,
        call: R
      });
    }
    return g.auction;
  }, [o, l, a, b]);
  if (f !== "all")
    return /* @__PURE__ */ t(
      At,
      {
        cards: b[f],
        panelBg: "#fff",
        width: "100%",
        font: 21,
        suitW: 19,
        pad: "8px 12px"
      }
    );
  const w = {};
  for (const g of En) w[g] = (r == null ? void 0 : r[g]) ?? Tn[g];
  const S = {};
  for (const g of En) S[g] = !p.includes(g);
  return /* @__PURE__ */ t("div", { style: { width: "100%", aspectRatio: String(Nl) }, children: /* @__PURE__ */ t(
    gl,
    {
      boardLabel: s ?? e,
      dealer: l,
      vul: a,
      hands: b,
      names: w,
      visible: S,
      auction: y,
      highlightSeat: c,
      info: [
        { label: "Dealer", value: Tn[l] },
        { label: "Vulnerable", value: Rl[a] }
      ],
      result: [
        { label: "N-S points", value: String(Je(b.N) + Je(b.S)) },
        { label: "E-W points", value: String(Je(b.E) + Je(b.W)) }
      ]
    }
  ) });
}
const Bl = ["S", "H", "D", "C"], $l = { N: "S", S: "N", E: "W", W: "E" }, El = {
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
function _n(e) {
  return e === 10 ? "T" : Ri(e);
}
function qe(e) {
  return Bl.map(
    (n) => e.filter((l) => l.suit === n).sort((l, a) => a.rank - l.rank).map((l) => _n(l.rank)).join("")
  ).join(".");
}
function Tl(e) {
  return e === "P" ? "--" : e === "X" ? "Db" : e === "XX" ? "Rd" : e;
}
function Ml(e) {
  return e.map((n) => Tl(n.call)).join("");
}
function Dl(e) {
  return e === "both" ? "@v@V" : e === "ns" ? "@v" : e === "ew" ? "@V" : "";
}
function Al(e) {
  return e.tricks.flatMap((n) => n.plays).map((n) => `${n.card.suit}${_n(n.card.rank)}`).join("");
}
function Ze(e, n) {
  return [
    ...e.hands[n],
    ...e.tricks.flatMap(
      (l) => l.plays.filter((a) => a.seat === n).map((a) => a.card)
    )
  ];
}
function Hl(e) {
  const n = e.trim().toUpperCase();
  if (n === "PASS" || n === "P" || n === "--" || n === "PA") return "P";
  if (n === "X" || n === "DB" || n === "DBL" || n === "DOUBLE") return "X";
  if (n === "XX" || n === "RD" || n === "REDBL" || n === "REDOUBLE") return "XX";
  const l = /^([1-7])(NT|N|C|D|H|S)$/.exec(n);
  return l ? `${l[1]}${l[2] === "NT" ? "N" : l[2]}` : n;
}
function zl(e) {
  const n = /^([SHDC])([2-9TJQKA])$/.exec(e.trim().toUpperCase());
  return n ? { suit: n[1], rank: El[n[2]] } : null;
}
function jl({
  endpoint: e,
  timeoutMs: n = 6e4,
  fetchImpl: l,
  onProblem: a
}) {
  const f = e.replace(/\/$/, ""), s = l ?? ((...o) => fetch(...o)), r = async (o, c) => {
    const p = `${f}${o}?${new URLSearchParams({ ...c, details: "true" })}`, b = new AbortController(), y = setTimeout(() => b.abort(), n);
    try {
      const w = await s(p, { signal: b.signal });
      if (!w.ok) throw new Error(`HTTP ${w.status}`);
      return await w.json();
    } finally {
      clearTimeout(y);
    }
  };
  return async (o, c) => {
    var y;
    const p = Dl(o.vul), b = Ml(o.auction);
    try {
      if (o.phase === "auction") {
        const w = await r("/bid", {
          hand: qe(Ze(o, c)),
          seat: c,
          dealer: o.dealer,
          vul: p,
          ctx: b
        }), S = typeof w.bid == "string" ? w.bid : "", g = Hl(S);
        return Xe(o.auction, c).has(g) ? { call: g } : (a == null || a(`BEN answered "${S}" for ${c}, which is not legal here`), null);
      }
      if (o.phase === "play") {
        const w = Al(o), S = ((y = o.contract) == null ? void 0 : y.declarer) ?? null, g = S ? $l[S] : null, R = c === g && S ? S : c, W = w === "" ? await r("/lead", {
          hand: qe(Ze(o, c)),
          seat: c,
          dealer: o.dealer,
          vul: p,
          ctx: b
        }) : await r("/play", {
          hand: qe(Ze(o, R)),
          dummy: g ? qe(Ze(o, g)) : "",
          seat: R,
          dealer: o.dealer,
          vul: p,
          ctx: b,
          played: w
        }), A = typeof W.card == "string" ? W.card : "", z = zl(A);
        return z ? Rt(o, c).some((k) => k.suit === z.suit && k.rank === z.rank) ? { card: z } : (a == null || a(`BEN's ${A} is not legal for ${c} here`), null) : (a == null || a(`BEN answered "${A}" for ${c}, which is not a card`), null);
      }
      return null;
    } catch (w) {
      return a == null || a(`BEN could not be reached (${w.message})`), null;
    }
  };
}
export {
  Ol as BiddingDrill,
  Xl as BridgeTable,
  Pl as DealDiagram,
  jl as createBenDecider,
  Mt as seededDeal
};
//# sourceMappingURL=table-embed.js.map
