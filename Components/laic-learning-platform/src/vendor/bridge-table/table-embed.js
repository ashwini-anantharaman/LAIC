import { jsxs as h, jsx as r, Fragment as ut } from "react/jsx-runtime";
import { createContext as Qn, useContext as Zn, useState as se, useRef as ie, useCallback as Me, useLayoutEffect as Ue, useEffect as $e, useMemo as Xe } from "react";
function er(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function jt(e) {
  return `${e.suit}${e.rank}`;
}
const ht = ["S", "W", "N", "E"];
function Ne(e) {
  return ht[(ht.indexOf(e) + 1) % 4];
}
function tr(e) {
  return Ne(Ne(e));
}
function sn(e, t) {
  return e === t || tr(e) === t;
}
function nr(e, t) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const o = t === "N" || t === "S";
  return e === "ns" ? o : !o;
}
function Pe(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
const dn = ["C", "D", "H", "S", "N"];
function _t(e) {
  return Pe(e) ? (Number(e[0]) - 1) * 5 + dn.indexOf(e[1]) : -1;
}
function pt(e, t) {
  const o = /* @__PURE__ */ new Set(["P"]);
  let l = -1;
  for (const c of e) l = Math.max(l, _t(c.call));
  for (let c = 1; c <= 7; c++)
    for (const a of dn) {
      const i = `${c}${a}`;
      _t(i) > l && o.add(i);
    }
  let u = null;
  for (let c = e.length - 1; c >= 0; c--)
    if (e[c].call !== "P") {
      u = e[c];
      break;
    }
  return u && !sn(u.seat, t) && (Pe(u.call) ? o.add("X") : u.call === "X" && o.add("XX")), o;
}
function rr(e) {
  if (e.length < 4) return !1;
  const t = e.slice(-3);
  return t.length === 3 && t.every((o) => o.call === "P");
}
function or(e) {
  let t = null, o = 0;
  for (const a of e)
    Pe(a.call) ? (t = a, o = 0) : a.call === "X" ? o = 1 : a.call === "XX" && (o = 2);
  if (!t) return null;
  const l = t.call[1], u = t.seat;
  let c = t.seat;
  for (const a of e)
    if (Pe(a.call) && a.call[1] === l && sn(a.seat, u)) {
      c = a.seat;
      break;
    }
  return { level: Number(t.call[0]), strain: l, doubled: o, declarer: c };
}
function Pt(e, t, o, l) {
  return {
    boardRef: e,
    dealer: t,
    vul: o,
    hands: {
      N: [...l.N],
      E: [...l.E],
      S: [...l.S],
      W: [...l.W]
    },
    auction: [],
    contract: null,
    phase: "auction",
    turn: t,
    tricks: [],
    trickCount: { NS: 0, EW: 0 }
  };
}
const fn = (e) => e === "N" || e === "S" ? "NS" : "EW";
function ir(e, t) {
  const o = e.plays[0].card.suit, l = (c, a) => {
    const i = t !== "N" && c.suit === t, f = t !== "N" && a.suit === t;
    if (i && !f) return !0;
    if (f && !i) return !1;
    if (i && f) return c.rank > a.rank;
    const p = c.suit === o, x = a.suit === o;
    return p && !x ? !0 : x && !p ? !1 : c.rank > a.rank;
  };
  let u = e.plays[0];
  for (const c of e.plays.slice(1)) l(c.card, u.card) && (u = c);
  return u.seat;
}
function gt(e, t) {
  const o = e.hands[t], l = e.tricks[e.tricks.length - 1];
  if (!l || l.plays.length === 0 || l.plays.length === 4) return [...o];
  const c = l.plays[0].card.suit, a = o.filter((i) => i.suit === c);
  return a.length ? a : [...o];
}
function Fe(e, t) {
  if (t.category === "bid-event") {
    const m = [...e.auction, { seat: t.seat, call: t.call }];
    if (!rr(m))
      return { ...e, auction: m, turn: Ne(t.seat) };
    const k = or(m);
    if (!k)
      return { ...e, auction: m, contract: null, phase: "complete" };
    const g = Ne(k.declarer);
    return {
      ...e,
      auction: m,
      contract: k,
      phase: "play",
      turn: g,
      tricks: [{ leader: g, plays: [] }]
    };
  }
  const o = t.seat, l = {
    ...e.hands,
    [o]: e.hands[o].filter((m) => jt(m) !== jt(t.card))
  }, u = e.tricks.map((m) => ({ ...m, plays: [...m.plays] }));
  let c = u[u.length - 1];
  if ((!c || c.plays.length === 4) && (c = { leader: o, plays: [] }, u.push(c)), c.plays.push({ seat: o, card: t.card }), c.plays.length < 4)
    return { ...e, hands: l, tricks: u, turn: Ne(o) };
  const a = e.contract ? e.contract.strain : "N", i = ir(c, a);
  c.winner = i;
  const f = fn(i), p = { ...e.trickCount, [f]: e.trickCount[f] + 1 }, x = l.N.length === 0 && l.E.length === 0 && l.S.length === 0 && l.W.length === 0;
  return {
    ...e,
    hands: l,
    tricks: u,
    trickCount: p,
    turn: i,
    phase: x ? "complete" : "play"
  };
}
const Yt = { C: 20, D: 20, H: 30, S: 30 };
function lr(e) {
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
  const o = fn(t.declarer), l = e.trickCount[o], u = 6 + t.level, c = l - u, a = c >= 0, i = nr(e.vul, t.declarer), f = t.doubled, p = f === 2 ? 4 : f === 1 ? 2 : 1;
  let x = 0, m = 0, k = 0, g = 0, w = 0, W = 0, B = 0;
  if (a) {
    x = t.strain === "N" ? (40 + (t.level - 1) * 30) * p : Yt[t.strain] * t.level * p;
    const A = f === 0 ? t.strain === "N" ? 30 : Yt[t.strain] : (i ? 200 : 100) * (f === 2 ? 2 : 1);
    m = c * A, x >= 100 ? k = i ? 500 : 300 : g = 50, t.level === 6 && (w = i ? 750 : 500), t.level === 7 && (w = i ? 1500 : 1e3), f > 0 && (W = 50 * f);
  } else {
    const A = -c;
    if (f === 0)
      B = A * (i ? 100 : 50);
    else {
      let D = 0;
      for (let y = 1; y <= A; y++)
        y === 1 ? D += i ? 200 : 100 : y <= 3 ? D += i ? 300 : 200 : D += 300;
      B = D * (f === 2 ? 2 : 1);
    }
  }
  const M = a ? x + m + k + g + w + W : -B;
  return {
    contract: t,
    tricksTaken: l,
    result: c,
    made: a,
    vulnerable: i,
    trickScore: x,
    overtrickScore: m,
    gameBonus: k,
    partscoreBonus: g,
    slamBonus: w,
    insultBonus: W,
    penalty: B,
    declarerScore: M,
    nsScore: o === "NS" ? M : -M
  };
}
function ar(e) {
  if (!e.contract) return "Passed out";
  const t = e.contract, o = t.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[t.strain], l = t.doubled === 1 ? " X" : t.doubled === 2 ? " XX" : "", u = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${t.level}${o}${l} by ${t.declarer}, ${u}`;
}
function cr(e) {
  let t = e >>> 0;
  return () => {
    t |= 0, t = t + 1831565813 | 0;
    let o = Math.imul(t ^ t >>> 15, 1 | t);
    return o = o + Math.imul(o ^ o >>> 7, 61 | o) ^ o, ((o ^ o >>> 14) >>> 0) / 4294967296;
  };
}
function sr(e) {
  const t = cr(e), l = ["S", "H", "D", "C"].flatMap(
    (c) => Array.from({ length: 13 }, (a, i) => ({ suit: c, rank: i + 2 }))
  );
  for (let c = l.length - 1; c > 0; c--) {
    const a = Math.floor(t() * (c + 1));
    [l[c], l[a]] = [l[a], l[c]];
  }
  const u = { N: [], E: [], S: [], W: [] };
  return l.forEach((c, a) => u[ht[a % 4]].push(c)), u;
}
const dr = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, fr = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, ur = { skin: "bbo" }, hr = {
  skins: dr,
  strainTint: fr,
  defaults: ur
}, xt = hr, Ut = xt.skins, at = xt.strainTint, pr = {
  skin: xt.defaults.skin
};
function un(e, t = {}) {
  const o = Ut[e] ?? Ut[pr.skin], l = (c) => {
    const a = t[c];
    return typeof a == "string" && a.trim() !== "" ? a : void 0;
  }, u = l("feltColor");
  return {
    ...o,
    felt: u ?? o.felt,
    feltFlat: u ?? o.feltFlat,
    accent: l("accent") ?? o.accent,
    trayBg: l("bidBoxColor") ?? o.trayBg,
    auctionBg: l("auctionColor") ?? o.auctionBg,
    cardBack: l("cardBackColor") ?? o.cardBack
  };
}
const gr = ["N", "S", "H", "D", "C"], hn = { N: "NT", S: "♠", H: "♥", D: "♦", C: "♣" }, br = [1, 2, 3, 4, 5, 6, 7], yr = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${hn[e[1] ?? "N"] ?? ""}`;
function ct({
  cell: e = 46,
  minCellH: t = 0,
  radius: o = 5,
  legalCalls: l,
  live: u,
  pending: c,
  onStage: a,
  onConfirm: i,
  onCancel: f
}) {
  const p = Math.round(e * 0.13), x = Math.round(e * 0.11), m = e, k = Math.max(Math.round(e * 0.92), t), g = Math.round(e * 3.4), w = Math.round(e * 0.62), W = Math.round(e * 0.42), B = new Set(l), M = c != null, A = (y, I) => {
    const O = `${I}${y}`, z = at[y], X = B.has(O), q = u && !M && X;
    return /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        disabled: M,
        onClick: q ? () => a(O) : void 0,
        "aria-label": `${I}${y === "N" ? "NT" : y}`,
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 1,
          width: m,
          height: k,
          padding: 0,
          background: "transparent",
          border: 0,
          color: z.ink,
          lineHeight: 1,
          cursor: q ? "pointer" : "default",
          opacity: X ? 1 : 0.3
        },
        children: [
          /* @__PURE__ */ r("span", { style: { fontSize: w, fontWeight: 700, lineHeight: 1 }, children: I }),
          /* @__PURE__ */ r("span", { style: { fontSize: W, fontWeight: 700, lineHeight: 1 }, children: hn[y] })
        ]
      },
      O
    );
  }, D = (y, I, O, z, X, q) => {
    const le = B.has(y), S = u && !M && le;
    return /* @__PURE__ */ r(
      "button",
      {
        type: "button",
        disabled: M,
        onClick: S ? () => a(y) : void 0,
        "aria-label": y === "P" ? "Pass" : y === "X" ? "Double" : "Redouble",
        style: {
          width: O,
          height: k,
          background: z,
          border: `2px solid ${X}`,
          borderRadius: o,
          color: "#fff",
          fontWeight: 700,
          fontSize: w,
          lineHeight: 1,
          cursor: S ? "pointer" : "default",
          opacity: le ? 1 : 0.3,
          ...q
        },
        children: I
      },
      y
    );
  };
  return /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: p }, children: [
    c != null && /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }, children: [
      /* @__PURE__ */ r("span", { style: { fontSize: 20, fontWeight: 700, color: "#12281f" }, children: yr(c) }),
      /* @__PURE__ */ r(
        "button",
        {
          type: "button",
          onClick: i,
          style: { height: 38, padding: "0 16px", border: "1px solid #0c4b0b", borderRadius: o, background: "#116710", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Confirm"
        }
      ),
      /* @__PURE__ */ r(
        "button",
        {
          type: "button",
          onClick: f,
          style: { height: 38, padding: "0 16px", border: "1px solid #5e1c1c", borderRadius: o, background: "#8a3030", color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: "Cancel"
        }
      )
    ] }),
    /* @__PURE__ */ r("div", { style: { display: "flex", gap: p }, children: gr.map((y) => /* @__PURE__ */ r(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: p,
          padding: x,
          background: at[y].bg,
          border: `2px solid ${at[y].edge}`,
          borderRadius: o
        },
        children: br.map((I) => A(y, I))
      },
      y
    )) }),
    /* @__PURE__ */ h("div", { style: { display: "flex", gap: p }, children: [
      D("P", "Pass", g, "#116710", "#0c4b0b", { letterSpacing: ".04em" }),
      D("X", "X", m, "#7a5b3a", "#5e4227"),
      D("XX", "XX", m, "#2b6b73", "#1c4d53")
    ] })
  ] });
}
const xr = {
  LinkComponent: "a",
  navigate: (e, { replace: t }) => {
    typeof window > "u" || (t ? window.location.replace(e) : window.location.assign(e));
  }
}, mr = Qn(xr);
function pn() {
  return Zn(mr);
}
const bt = "#384bb3", Kt = {
  plain: { bg: "rgba(255,255,255,.10)", border: "rgba(255,255,255,.18)", color: "#eef4f1" },
  accent: { bg: bt, border: "#5468d6", color: "#fff" },
  warn: { bg: "#8a3030", border: "#a94848", color: "#fff" },
  go: { bg: "#116710", border: "#1a8a18", color: "#fff" }
}, Gt = 48;
function Be({
  side: e,
  items: t,
  thickness: o = 44,
  condensed: l = !1,
  scale: u,
  minTouch: c = 30,
  bg: a = "rgba(9,22,17,.90)",
  accent: i = bt
}) {
  const [f, p] = se(99), [x, m] = se(99), [k, g] = se(!1), w = ie(null), W = ie(null), B = ie(null), M = ie(() => {
  }), A = i === bt ? Kt : { ...Kt, accent: { bg: i, border: i, color: "#fff" } }, D = o, y = Math.min(
    Math.round(D * 2.2),
    Math.max(
      Math.round(D * 0.68),
      D - 14,
      u ? Math.ceil(c / Math.max(0.05, u)) : 0
    )
  ), { LinkComponent: I } = pn(), O = l ? 5 : 7, z = Math.round(y * (l ? 0.17 : 0.4)), X = Math.max(l ? 11 : 13, Math.round(y * (l ? 0.28 : 0.4))), q = Math.round(y * 0.86), le = Math.max(9, Math.round(y * 0.26));
  let S = -1;
  t.forEach((s, E) => {
    s.kind === "spacer" && (S = E);
  });
  const L = S < 0 ? t : t.slice(0, S), T = S < 0 ? [] : t.slice(S + 1), ne = L.length, b = T.length, J = Math.max(0, Math.min(f, ne)), R = Math.max(1, Math.min(x, b)), N = T.slice(T.length - R), j = L.slice(J).concat(T.slice(0, T.length - R)).filter((s) => s.kind !== "divider"), Q = j.length > 0, _ = k && Q, $ = Me(() => {
    const s = w.current;
    if (!s) return;
    const E = Math.min(f, ne), Y = s.clientWidth;
    if (Y > 0) {
      if (s.scrollWidth > Y + 1) {
        const ye = parseFloat(getComputedStyle(s).gap) || 0;
        let pe = 0, re = 0;
        for (const Ee of Array.from(s.children))
          if (pe += Ee.offsetWidth + (re ? ye : 0), pe <= Y) re++;
          else break;
        re < E && p(re);
        return;
      }
      if (Y - s.scrollWidth > Gt && E < ne) {
        p(E + 1);
        return;
      }
      if (E !== f) {
        p(E);
        return;
      }
    }
    const F = W.current;
    if (!F) return;
    const K = Math.min(x, b);
    E === 0 && F.scrollWidth > F.clientWidth + 1 && K > 1 ? m(K - 1) : F.clientWidth - F.scrollWidth > Gt && K < b ? m(K + 1) : K !== x && m(K);
  }, [f, x, ne, b]);
  Ue(() => {
    M.current = $, $();
  }), $e(() => {
    const s = (E) => {
      W.current && !W.current.contains(E.target) && g(!1);
    };
    return document.addEventListener("mousedown", s), () => {
      document.removeEventListener("mousedown", s), B.current && B.current.disconnect();
    };
  }, []);
  const Te = Me((s) => {
    B.current && (B.current.disconnect(), B.current = null), w.current = s, W.current = s ? s.parentElement : null, s && (typeof ResizeObserver == "function" && (B.current = new ResizeObserver(() => M.current()), B.current.observe(s)), M.current());
  }, []), P = (s, E) => {
    if (s.kind === "spacer") return null;
    if (s.kind === "node")
      return /* @__PURE__ */ r("span", { style: { flex: "none", display: "flex", alignItems: "center", gap: O }, children: s.node }, E);
    if (s.kind === "divider")
      return /* @__PURE__ */ r("span", { style: { display: "block", flex: "none", width: 1, height: 20, background: "rgba(255,255,255,.16)" } }, E);
    if (s.kind === "chip")
      return /* @__PURE__ */ h("div", { title: s.title ?? s.label, style: { flex: "none", display: "flex", alignItems: "baseline", gap: 5, padding: "0 8px", height: q, borderRadius: 5, background: "rgba(255,255,255,.07)", whiteSpace: "nowrap" }, children: [
        /* @__PURE__ */ r("span", { style: { fontSize: le, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: s.label }),
        /* @__PURE__ */ r("span", { style: { fontSize: X, fontWeight: 700, lineHeight: 1, color: s.color ?? "#eef4f1" }, children: s.value })
      ] }, E);
    const Y = A[s.tone ?? "plain"], F = s.disabled === !0, K = {
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: s.kind === "icon" ? y : void 0,
      height: y,
      padding: s.kind === "icon" ? 0 : `0 ${z}px`,
      border: `1px solid ${Y.border}`,
      borderRadius: 6,
      background: Y.bg,
      color: Y.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: X,
      fontWeight: s.kind === "icon" ? 400 : 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: F || !s.on && !s.href ? "default" : "pointer",
      opacity: F ? 0.42 : 1
    };
    return s.href && !F ? /* @__PURE__ */ r(I, { href: s.href, title: s.title ?? s.label, "aria-label": s.ariaLabel, style: K, children: s.label }, E) : /* @__PURE__ */ r("button", { type: "button", title: s.title ?? s.label, "aria-label": s.ariaLabel, disabled: F, onClick: F ? void 0 : s.on ?? void 0, style: K, children: s.label }, E);
  }, fe = (s, E) => {
    if (s.kind === "divider" || s.kind === "spacer") return null;
    if (s.kind === "chip")
      return /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 4px" }, children: [
        /* @__PURE__ */ r("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#8fa39a" }, children: s.label }),
        /* @__PURE__ */ r("span", { style: { fontSize: 14, fontWeight: 700, color: s.color ?? "#eef4f1" }, children: s.value })
      ] }, E);
    if (s.kind === "node")
      return /* @__PURE__ */ r("div", { style: { display: "flex", alignItems: "center", marginBottom: 4 }, children: s.node }, E);
    const Y = A[s.tone ?? "plain"], F = s.disabled === !0, K = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      height: y,
      marginBottom: 4,
      padding: `0 ${z}px`,
      border: `1px solid ${Y.border}`,
      borderRadius: 6,
      background: Y.bg,
      color: Y.color,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: X,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: "nowrap",
      textDecoration: "none",
      cursor: F || !s.on && !s.href ? "default" : "pointer",
      opacity: F ? 0.42 : 1
    }, ye = () => g(!1);
    return s.href && !F ? /* @__PURE__ */ r(I, { href: s.href, title: s.title ?? s.label, "aria-label": s.ariaLabel, style: K, onClick: ye, children: s.label }, E) : /* @__PURE__ */ r("button", { type: "button", title: s.title ?? s.label, "aria-label": s.ariaLabel, disabled: F, onClick: F ? void 0 : () => {
      var pe;
      (pe = s.on) == null || pe.call(s), ye();
    }, style: K, children: s.label }, E);
  }, ue = Math.max(D, y + 14), ve = {
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
  return /* @__PURE__ */ h(
    "div",
    {
      "data-testid": "edge-toolbar",
      style: { width: "100%", [l ? "height" : "minHeight"]: ue, flex: "none", display: "flex", alignItems: "center", gap: O, padding: `6px ${l ? 8 : 10}px`, background: a, boxSizing: "border-box", ...e === "top" ? { borderBottom: "1px solid rgba(255,255,255,.13)" } : { borderTop: "1px solid rgba(255,255,255,.13)" } },
      children: [
        /* @__PURE__ */ r(
          "div",
          {
            ref: Te,
            style: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "safe center", gap: O, ...l ? { overflow: "hidden", flexWrap: "nowrap" } : { flexWrap: "wrap" } },
            children: L.slice(0, J).map(P)
          }
        ),
        Q && /* @__PURE__ */ h("div", { style: { position: "relative", flex: "none" }, children: [
          /* @__PURE__ */ h(
            "button",
            {
              type: "button",
              onClick: () => g((s) => !s),
              title: `${j.length} more`,
              "aria-label": "More controls",
              style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: y, padding: `0 ${z}px`, border: `1px solid ${_ ? "#12909f" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: _ ? "#0d707c" : "rgba(255,255,255,.10)", color: "#eef4f1", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, fontSize: X, lineHeight: 1, cursor: "pointer" },
              children: [
                /* @__PURE__ */ r("span", { children: "⋯" }),
                /* @__PURE__ */ r("span", { style: { fontSize: le, opacity: 0.8 }, children: j.length })
              ]
            }
          ),
          _ && /* @__PURE__ */ r("div", { style: ve, children: j.map(fe) })
        ] }),
        N.length > 0 && /* @__PURE__ */ r("div", { style: { flex: "none", minWidth: 0, display: "flex", alignItems: "center", gap: O }, children: N.map(P) })
      ]
    }
  );
}
function Vt({
  title: e = "Table settings",
  accent: t = "#384bb3",
  items: o,
  onClose: l
}) {
  const { navigate: u } = pn(), c = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" }, a = (i) => /* @__PURE__ */ h(ut, { children: [
    /* @__PURE__ */ r("span", { children: i.label }),
    /* @__PURE__ */ r("span", { style: { flex: "none", fontWeight: 700, color: t }, children: i.value })
  ] });
  return /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, zIndex: 20 }, children: [
    /* @__PURE__ */ r(
      "div",
      {
        style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" },
        onClick: l,
        "aria-hidden": !0
      }
    ),
    /* @__PURE__ */ h("div", { style: { position: "absolute", left: 12, top: 12, width: 268, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.5)", overflow: "hidden" }, children: [
      /* @__PURE__ */ r("div", { style: { background: t, color: "#fff", fontSize: 17, fontWeight: 700, padding: "6px 10px" }, children: e }),
      o.map(
        (i) => i.action ? (
          // A server action persists the change; the resulting server
          // re-render preserves the client menuOpen state, so the menu stays
          // open exactly as an href row does.
          /* @__PURE__ */ r("form", { action: i.action, style: { margin: 0, display: "block" }, children: /* @__PURE__ */ r("button", { type: "submit", style: c, children: a(i) }) }, i.label)
        ) : /* @__PURE__ */ r(
          "button",
          {
            type: "button",
            onClick: i.on ?? (i.href ? () => {
              const f = i.href.split("?")[0] === window.location.pathname;
              u(i.href, { replace: f });
            } : void 0),
            style: c,
            children: a(i)
          },
          i.label
        )
      )
    ] })
  ] });
}
const ae = "#cc0000", st = "#fecd07", gn = "#d3d3d3", qt = "#f2e2b8", kr = "#b8901f", bn = "#12525e", te = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, Le = ["C", "D", "H", "S", "N"], dt = ["W", "N", "E", "S"], Ye = ["S", "H", "C", "D"], Sr = { N: "S", S: "N", E: "W", W: "E" }, de = (e) => e === "H" || e === "D", he = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), vr = (e) => /^[1-7][CDHSN]$/.test(e), yt = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${te[e[1] ?? ""] ?? ""}`, yn = (e) => vr(e) && de(e[1] ?? "") ? ae : "#000", wr = (e) => e === "N" || e === "S" ? "NS" : "EW";
function ft({
  cards: e,
  metrics: t,
  layout: o,
  hidden: l = !1,
  fanSpread: u,
  fanRadius: c,
  backColor: a,
  backCount: i,
  backMetrics: f = { w: 14, h: 71 },
  isPlayable: p,
  onPlay: x
}) {
  if (l) {
    const S = Math.max(1, i ?? e.length);
    return /* @__PURE__ */ r("div", { style: { display: "flex", border: "2px solid rgba(255,255,255,.92)", borderRadius: 3, overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,.35)" }, children: Array.from({ length: S }, (L, T) => /* @__PURE__ */ r("span", { style: { display: "block", width: f.w, height: f.h, background: a, borderLeft: T ? "1.5px solid rgba(255,255,255,.92)" : "none" } }, T)) });
  }
  const m = [...e].sort(
    (S, L) => Ye.indexOf(S.suit) - Ye.indexOf(L.suit) || L.rank - S.rank
  );
  if (o === "row")
    return /* @__PURE__ */ r("div", { style: { display: "flex", boxShadow: "0 2px 5px rgba(0,0,0,.35)" }, children: m.map((S, L) => {
      const T = p ? p(S) : !1;
      return /* @__PURE__ */ r(
        "button",
        {
          type: "button",
          onClick: T ? () => x == null ? void 0 : x(S) : void 0,
          "aria-label": `Play ${he(S.rank)}${te[S.suit]}`,
          style: {
            position: "relative",
            display: "block",
            width: t.w,
            height: t.h,
            flex: "none",
            background: "#fff",
            border: "1px solid #6b6b6b",
            borderRadius: L === 0 ? "3px 0 0 3px" : "0 3px 3px 0",
            marginLeft: L === 0 ? 0 : -1,
            padding: 0,
            cursor: T ? "pointer" : "default",
            transform: T ? "translateY(-6px)" : "none",
            transition: "transform 120ms ease"
          },
          children: /* @__PURE__ */ h("span", { style: { position: "absolute", left: t.inset, top: t.inset > 3 ? t.inset : 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: de(S.suit) ? ae : "#000" }, children: [
            /* @__PURE__ */ r("span", { style: { fontSize: t.rank, fontWeight: 700 }, children: he(S.rank) }),
            /* @__PURE__ */ r("span", { style: { fontSize: t.glyph }, children: te[S.suit] })
          ] })
        },
        `${S.suit}${S.rank}`
      );
    }) });
  const k = m.length, g = t.w, w = t.h, W = u, B = c > 0 ? c : Math.round(w * 4.2), M = (S) => k <= 1 ? 0 : -W / 2 + S * (W / (k - 1));
  let A = 0, D = 0, y = 0, I = 0;
  for (let S = 0; S < k; S++) {
    const L = M(S) * Math.PI / 180, T = Math.cos(L), ne = Math.sin(L);
    for (const b of [-g / 2, g / 2])
      for (const J of [-B, -B + w]) {
        const R = b * T - J * ne, N = b * ne + J * T;
        R < A && (A = R), R > D && (D = R), N < y && (y = N), N > I && (I = N);
      }
  }
  const O = Math.ceil(Math.max(-A, D) * 2) + 4, z = Math.ceil(I - y) + 4, X = Math.ceil(-y - B) + 2, q = t.rank, le = t.glyph;
  return /* @__PURE__ */ r("div", { style: { position: "relative", width: O, height: z }, children: m.map((S, L) => {
    const T = p ? p(S) : !1;
    return /* @__PURE__ */ r(
      "button",
      {
        type: "button",
        onClick: T ? () => x == null ? void 0 : x(S) : void 0,
        "aria-label": `Play ${he(S.rank)}${te[S.suit]}`,
        style: {
          position: "absolute",
          left: "50%",
          top: X,
          width: g,
          height: w,
          padding: 0,
          background: "#fff",
          border: "1px solid #6b6b6b",
          borderRadius: 4,
          boxShadow: "-2px 1px 4px rgba(0,0,0,.28)",
          transform: `translateX(-50%) rotate(${M(L)}deg)${T ? " translateY(-14px)" : ""}`,
          transformOrigin: `50% ${B}px`,
          transition: "transform 120ms ease",
          cursor: T ? "pointer" : "default"
        },
        children: /* @__PURE__ */ h("span", { style: { position: "absolute", left: t.inset, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: de(S.suit) ? ae : "#000" }, children: [
          /* @__PURE__ */ r("span", { style: { fontSize: q, fontWeight: 700 }, children: he(S.rank) }),
          /* @__PURE__ */ r("span", { style: { fontSize: le }, children: te[S.suit] })
        ] })
      },
      `${S.suit}${S.rank}`
    );
  }) });
}
function Cr({
  seat: e,
  name: t,
  tag: o,
  strip: l,
  bg: u,
  width: c,
  isDealer: a,
  metrics: i = {}
}) {
  const f = i.height ?? 22, p = i.badge ?? 20, x = i.font ?? 15, m = i.tagFont ?? 11;
  return /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "stretch", gap: 5, width: c, height: f, padding: "0 3px 0 0", background: u, boxShadow: "0 1px 2px rgba(0,0,0,.45)", border: `2px solid ${a ? kr : "transparent"}`, boxSizing: "border-box", overflow: "hidden" }, children: [
    /* @__PURE__ */ r("span", { style: { flex: "none", width: 6, background: l ?? "transparent" } }),
    /* @__PURE__ */ r("span", { style: { flex: "none", width: p, height: p, alignSelf: "center", background: bn, color: "#fff", fontSize: x - 1, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: e }),
    /* @__PURE__ */ r("span", { style: { alignSelf: "center", fontSize: x, color: "#000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: t }),
    a && /* @__PURE__ */ r("span", { style: { alignSelf: "center", flex: "none", padding: "0 2px", fontSize: m, fontWeight: 700, color: "#7a5a12" }, children: "DEALER" }),
    /* @__PURE__ */ r("span", { style: { marginLeft: "auto", alignSelf: "center", flex: "none", fontSize: m, color: "#555" }, children: o ?? "" })
  ] });
}
function Rr({
  cards: e,
  panelBg: t,
  width: o,
  suitW: l,
  font: u,
  pad: c,
  bare: a,
  touch: i,
  isPlayable: f,
  onPlay: p
}) {
  const x = u ?? 19, m = !!i;
  return /* @__PURE__ */ r("div", { style: { width: o, background: a ? t : "#fff", border: a ? 0 : "1px solid #8a8a8a", borderRadius: a ? 0 : 3, padding: c ?? "4px 8px", boxShadow: "0 2px 5px rgba(0,0,0,.4)", boxSizing: "border-box" }, children: Ye.map((k) => {
    const g = e.filter((w) => w.suit === k).sort((w, W) => W.rank - w.rank);
    return /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 5, lineHeight: 1.3, color: de(k) ? ae : "#000" }, children: [
      /* @__PURE__ */ r("span", { style: { flex: "none", width: l ?? 16, fontSize: x }, children: te[k] }),
      /* @__PURE__ */ r("span", { style: { display: "flex", flexWrap: "wrap", gap: m ? "0 4px" : "0 5px", fontSize: x }, children: g.length === 0 ? /* @__PURE__ */ r("span", { children: "—" }) : g.map((w) => {
        const W = f ? f(w) : !1;
        return /* @__PURE__ */ r(
          "button",
          {
            type: "button",
            onClick: W ? () => p == null ? void 0 : p(w) : void 0,
            "aria-label": `Play ${he(w.rank)}${te[k]}`,
            style: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: m ? 84 : 0, minHeight: m ? 78 : 0, background: W ? "#d9f2d9" : "transparent", border: 0, borderRadius: m ? 6 : 0, padding: m ? "0 4px" : "0 1px", fontSize: x, fontWeight: W ? 700 : 400, color: "inherit", cursor: W ? "pointer" : "default" },
            children: he(w.rank)
          },
          w.rank
        );
      }) })
    ] }, k);
  }) });
}
function Br({
  bg: e,
  m: t = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 },
  heads: o,
  rows: l,
  dealerCol: u,
  emptyText: c = null
}) {
  const a = ie(null);
  return Ue(() => {
    const i = a.current;
    i && (i.scrollTop = i.scrollHeight);
  }, [l.length]), /* @__PURE__ */ h("div", { style: { width: t.width, height: t.height, maxHeight: t.height === "auto" ? 340 : void 0, background: e, borderRadius: t.radius ?? 0, boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
    /* @__PURE__ */ r("div", { style: { flex: "none", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, padding: 2, textAlign: "center" }, children: o.map((i) => /* @__PURE__ */ h("span", { style: { padding: "2px 0", fontSize: t.headFont, fontWeight: 700, lineHeight: 1.1, background: i.vul ? "#cc1111" : i.isDealer ? qt : "#fff", color: i.vul ? "#fff" : "#000" }, children: [
      i.seat,
      i.isDealer ? " •" : ""
    ] }, i.seat)) }),
    /* @__PURE__ */ h("div", { ref: a, "data-testid": "auction-rows", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "3px 5px", display: "flex", flexDirection: "column", gap: 3 }, children: [
      l.map((i, f) => /* @__PURE__ */ r("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, textAlign: "center" }, children: [0, 1, 2, 3].map((p) => {
        const x = i[p];
        return /* @__PURE__ */ r("span", { style: { borderRadius: 3, padding: "2px 0", minHeight: t.cellMinH ?? 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.cellFont, lineHeight: 1.15, background: x ? p === u ? qt : gn : "transparent", color: x ? yn(x.call) : "#000" }, children: x ? yt(x.call) : "" }, p);
      }) }, f)),
      c != null && /* @__PURE__ */ r("div", { style: { textAlign: "center", fontSize: 17, color: "#3c4c4c", paddingTop: 6 }, children: c })
    ] })
  ] });
}
function Jt({ plays: e, turn: t, scale: o = 1, variant: l = "cross" }) {
  if (l === "pill")
    return /* @__PURE__ */ r("div", { style: { position: "relative", width: 300, height: 220 }, children: ["N", "E", "S", "W"].map((c) => {
      const a = e.find((f) => f.seat === c), i = c === "N" ? { left: "50%", top: 0, transform: "translateX(-50%)" } : c === "S" ? { left: "50%", bottom: 0, transform: "translateX(-50%)" } : c === "W" ? { left: 0, top: "50%", transform: "translateY(-50%)" } : { right: 0, top: "50%", transform: "translateY(-50%)" };
      return a ? /* @__PURE__ */ h("div", { style: { position: "absolute", ...i, display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #9a9a9a", padding: "4px 10px", boxShadow: "0 2px 6px rgba(0,0,0,.45)", color: de(a.card.suit) ? ae : "#000" }, children: [
        /* @__PURE__ */ r("span", { style: { fontSize: 36, lineHeight: 1 }, children: te[a.card.suit] }),
        /* @__PURE__ */ r("span", { style: { fontSize: 36, lineHeight: 1 }, children: he(a.card.rank) })
      ] }, c) : null;
    }) });
  const u = o;
  return /* @__PURE__ */ r("div", { style: { width: 262 * u, height: 262 * u, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ r("div", { style: { position: "relative", width: 262, height: 262, flex: "none", transform: `scale(${u})`, transformOrigin: "center center" }, children: ["N", "E", "S", "W"].map((c) => {
    const a = e.find((p) => p.seat === c), i = c === "N" ? { left: "50%", top: "0", tr: "translateX(-50%)" } : c === "S" ? { left: "50%", top: "182px", tr: "translateX(-50%)" } : c === "W" ? { left: "0", top: "50%", tr: "translateY(-50%)" } : { left: "206px", top: "50%", tr: "translateY(-50%)" }, f = c === t;
    return /* @__PURE__ */ r("div", { style: { position: "absolute", left: i.left, top: i.top, transform: i.tr, zIndex: a ? 2 : 1 }, children: a ? /* @__PURE__ */ r("span", { "data-testid": "trick-card", style: { position: "relative", display: "block", width: 56, height: 80, background: "#fff", border: "1px solid #6b6b6b", borderRadius: 3, boxShadow: "0 2px 5px rgba(0,0,0,.4)" }, children: /* @__PURE__ */ h("span", { style: { position: "absolute", left: 4, top: 2, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 0.95, color: de(a.card.suit) ? ae : "#000" }, children: [
      /* @__PURE__ */ r("span", { style: { fontSize: 27, fontWeight: 700 }, children: he(a.card.rank) }),
      /* @__PURE__ */ r("span", { style: { fontSize: 24 }, children: te[a.card.suit] })
    ] }) }) : /* @__PURE__ */ r("span", { style: { display: "flex", width: 56, height: 80, alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ r("span", { style: { display: "block", width: f ? 22 : 0, height: 12, background: f ? "#9a9a9a" : "transparent" } }) }) }, c);
  }) }) });
}
function Wr({
  line: e,
  score: t,
  detail: o,
  action: l,
  actionNote: u,
  accent: c = "#384bb3"
}) {
  return /* @__PURE__ */ h("div", { style: { background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, padding: "16px 28px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" }, children: [
    /* @__PURE__ */ r("div", { style: { fontSize: 28, fontWeight: 700, color: "#000" }, children: e || "Board complete" }),
    t && /* @__PURE__ */ r("div", { style: { fontSize: 18, color: "#444", marginTop: 4 }, children: t }),
    /* @__PURE__ */ r("div", { style: { fontSize: 15, color: "#666", marginTop: 6 }, children: o }),
    l && /* @__PURE__ */ r(
      "a",
      {
        href: l.href,
        style: { display: "flex", alignItems: "center", justifyContent: "center", height: 48, marginTop: 14, borderRadius: 6, background: c, color: "#fff", fontSize: 19, fontWeight: 700, lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap" },
        children: l.label
      }
    ),
    l && u && /* @__PURE__ */ r("div", { style: { fontSize: 13, color: "#666", marginTop: 6 }, children: u })
  ] });
}
function Mr({ onClose: e, children: t }) {
  return /* @__PURE__ */ r("div", { onClick: e, style: { position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }, children: /* @__PURE__ */ h("div", { onClick: (o) => o.stopPropagation(), style: { width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, children: [
      /* @__PURE__ */ r("span", { style: { fontSize: 15, fontWeight: 700, color: "#eef4f1" }, children: "Seats" }),
      /* @__PURE__ */ r("button", { type: "button", "aria-label": "Close", onClick: e, style: { width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }, children: "✕" })
    ] }),
    t
  ] }) });
}
const $r = "#384bb3", Nr = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#f4f6f4",
  fontFamily: "Arial, Helvetica, sans-serif"
};
function Tr({
  title: e = "Coach",
  status: t = "",
  accent: o = $r,
  lines: l,
  actions: u
}) {
  const c = (l && l.length ? l : []).map(
    (f) => typeof f == "string" ? { text: f, color: "#28312c" } : { text: f.text ?? "", color: f.color ?? "#28312c" }
  ), a = c.length === 0, i = u && u.length ? u : [];
  return /* @__PURE__ */ h("div", { style: Nr, children: [
    /* @__PURE__ */ h("div", { style: { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid #dde2dd" }, children: [
      /* @__PURE__ */ r("span", { style: { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, flex: "none", borderRadius: 11, background: o, color: "#fff", fontSize: 12, fontWeight: 700 }, children: "C" }),
      /* @__PURE__ */ r("span", { style: { fontSize: 14, fontWeight: 700, color: "#1d2421" }, children: e }),
      /* @__PURE__ */ r("span", { style: { flex: 1 } }),
      /* @__PURE__ */ r("span", { style: { fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "#6b7570" }, children: t })
    ] }),
    /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }, children: [
      c.map((f, p) => /* @__PURE__ */ r("div", { style: { fontSize: 14, lineHeight: 1.45, color: f.color }, children: f.text }, p)),
      a && /* @__PURE__ */ r("div", { style: { fontSize: 13.5, lineHeight: 1.5, color: "#6b7570" }, children: "Coach commentary appears here as the deal goes on." })
    ] }),
    i.length > 0 && /* @__PURE__ */ r("div", { style: { flex: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 11px" }, children: i.map((f, p) => /* @__PURE__ */ r(
      "button",
      {
        type: "button",
        onClick: f.on ?? void 0,
        style: { height: 34, padding: "0 13px", border: "1px solid #c6cec8", borderRadius: 6, background: "#fff", color: "#1d2421", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: f.on ? "pointer" : "default" },
        children: f.label
      },
      p
    )) })
  ] });
}
const We = { w: 1040, h: 678 }, Oe = 720, ce = { w: 54, h: 128, rank: 42, glyph: 38, inset: 5, backW: 52 }, Qt = 52, Zt = 44, en = 54, tn = { row: 172, fan: 238 }, nn = 52, rn = 30, Er = 0.3, Hr = 250, Dr = 900, on = 150, Ar = (e) => Math.ceil(24 / (e || 1)), Ir = 0, ln = (e) => Math.round(e * 8.8), zr = 24, an = { w: 50, h: 71, rank: 25, glyph: 22, inset: 3 }, Xr = {
  ...un("bbo"),
  handLayout: "row",
  bidPad: "grid",
  centreFrame: !1,
  fanSpread: 56,
  fanRadius: 0
}, Fr = { border: "3px solid #c9992b", borderRadius: 10, padding: 10 };
function Lr({ children: e }) {
  const t = ie(null), o = ie(null), [l, u] = se(1);
  return Ue(() => {
    const c = () => {
      const i = t.current, f = o.current;
      if (!i || !f) return;
      const p = i.clientWidth, x = i.clientHeight, m = f.offsetWidth, k = f.offsetHeight;
      if (!p || !x || !m || !k) return;
      const g = Math.min(1, p / m, x / k);
      u((w) => Math.abs(g - w) > 5e-3 ? g : w);
    };
    c();
    const a = new ResizeObserver(c);
    return t.current && a.observe(t.current), o.current && a.observe(o.current), () => a.disconnect();
  }), /* @__PURE__ */ r("div", { ref: t, style: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch", position: "relative", overflow: "hidden" }, children: /* @__PURE__ */ r(
    "div",
    {
      ref: o,
      style: { position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) scale(${l})`, display: "flex", alignItems: "center", justifyContent: "center" },
      children: e
    }
  ) });
}
function Or({
  state: e,
  seats: t,
  visible: o,
  mySeat: l = null,
  legalCalls: u = [],
  legalPlays: c = [],
  myTurn: a = !1,
  boardLabel: i = "1",
  scoringLabel: f = "IMPs",
  auctionDisplay: p = "box",
  confirmBids: x = !1,
  completedAction: m,
  completedNote: k,
  resultLine: g = "",
  resultScore: w = "",
  onCall: W,
  onPlay: B,
  onMenu: M,
  onScoring: A,
  onClaim: D,
  controlsExtra: y,
  controlsExtraNarrow: I,
  railExtra: O,
  settings: z,
  viewHref: X,
  appearance: q,
  showCoach: le = !0,
  coachShare: S = 30,
  coachTitle: L = "Coach",
  coachLines: T,
  coachActions: ne
}) {
  var Lt;
  const b = q ?? Xr, J = b.handLayout === "fan", R = b.bidPad === "columns", N = b.centreFrame, j = N ? Fr : {}, Q = Number.parseInt(b.radius, 10) || 5, _ = ie(null), [$, Te] = se({ w: We.w, h: We.h });
  Ue(() => {
    const n = _.current;
    if (!n) return;
    const d = () => Te({ w: n.clientWidth || We.w, h: n.clientHeight || We.h });
    d();
    const C = new ResizeObserver(d);
    return C.observe(n), () => C.disconnect();
  }, []);
  const [P, fe] = se(null), [ue, ve] = se(null);
  $e(() => {
    fe(null), ve(null);
  }, [e.auction.length]);
  const [s, E] = se(!1), Y = M ?? (z ? () => E((n) => !n) : void 0), F = [...z ?? []], [K, ye] = se(!1), pe = $.w / Math.max(1, $.h) < 1.25, re = pe && $.w < 640, Ee = pe && !re, He = Ee ? { w: Oe, h: 1268 } : We, oe = e.contract, De = (oe == null ? void 0 : oe.declarer) ?? null, G = De && e.phase !== "auction" ? Sr[De] : null, V = e.phase === "auction", ge = e.phase === "play", we = e.phase === "complete", be = new Set(u), mn = new Set(c.map((n) => `${n.suit}${n.rank}`)), Z = V && a && !ue, kn = (n) => e.vul === "both" || e.vul === "All" || wr(n).toLowerCase() === String(e.vul).toLowerCase(), Sn = dt.indexOf(e.dealer), vn = le !== !1, Ke = Math.max(0, Math.min(55, S ?? 30)), mt = 100 - Ke, kt = ge || we, wn = De ? !!t[De].human : !1, Ge = kt && !!G && G !== "S" && wn, St = kt && !!G && G !== "S" && !Ge, Cn = R && V, Ve = Math.min(1, $.w / Oe), Ae = Math.max(240, $.h * (mt / 100) || 590), Rn = (n) => {
    const d = Math.max(Qt, Math.ceil(Zt / (n || 1)) + 14);
    return Math.min(d, Math.max(Qt, Math.round(0.13 * Ae / (n || 1))));
  }, vt = (n) => {
    const d = Math.max(nn, Math.ceil(Zt / (n || 1))), C = Er * Ae / (n || 1) - rn;
    return Math.min(d, Math.max(nn, Math.floor(C / 3)));
  }, Bn = (n) => 3 * vt(n) + rn, wt = (n, d) => {
    const C = Rn(n), v = Ae / (n || 1), H = C * 2 + Ir + Ar(n) + (St ? en : 0) + (Ge ? tn.row : 0) + (!d && V ? Bn(n) : 0) + tn[J ? "fan" : "row"];
    let ee = 0, Re;
    d ? (ee = Math.max(30, Math.min(62, Math.floor((v - H - on) / 8.3))), Re = Math.max(on, Math.round(v - H - ln(ee)))) : Re = Math.max(Hr, Math.min(Dr, Math.round(v - H)));
    const Ot = H + (d ? ln(ee) : 0) + Re;
    return { bar: C, cell: ee, centre: Re, content: Ot, usePad: d, trayRow: vt(n), scale: Math.min(1, Ve, Ae / Ot) };
  }, Ct = (n) => {
    let d = wt(Ve, n);
    for (let C = 0; C < 10 && d.scale < Ve - 5e-4; C++) {
      const v = wt(d.scale, n);
      if (Math.abs(v.scale - d.scale) < 5e-4) {
        d = v;
        break;
      }
      d = v;
    }
    return d;
  };
  let U = Ct(Cn);
  U.usePad && U.cell * U.scale < zr && (U = Ct(!1));
  const Wn = U.usePad, Mn = U.usePad ? U.cell : 38, Rt = U.centre, $n = Math.max(0.6, Math.min(1.6, (Rt - 8) / 262)), qe = Math.min($.w / He.w, $.h / He.h) || 1, xe = re ? U.scale : qe, Nn = re ? Oe : Math.max(He.w, $.w / qe), Je = re ? U.content : Math.max(He.h, $.h / qe), Tn = re ? -Math.round(U.content * (1 - U.scale)) : 0, En = (n) => t[n].human ? st : !we && n === e.turn ? "#e8e8c8" : gn, Hn = (n) => n === G || !we && n === e.turn ? "#fff" : "#b3b3b3", me = (n) => {
    Z && (x ? ve(n) : W == null || W(n));
  }, Bt = () => {
    if (ue == null) return;
    const n = ue;
    ve(null), W == null || W(n);
  }, Wt = () => {
    ve(null), fe(null);
  }, Qe = (n) => (d) => a && ge && e.turn === n && mn.has(`${d.suit}${d.rank}`), Ie = (n, d = { w: 14, h: 71 }) => /* @__PURE__ */ r(ft, { cards: e.hands[n], hidden: !0, metrics: an, layout: "row", fanSpread: b.fanSpread, fanRadius: b.fanRadius, backColor: b.cardBack, backMetrics: d }), Ce = (n, d, C = {}) => /* @__PURE__ */ r(Cr, { seat: n, name: t[n].name, tag: t[n].tag, strip: t[n].strip, bg: En(n), width: d, isDealer: n === e.dealer, metrics: C }), ke = (n, d = 16) => {
    if (!V || p !== "seats") return null;
    const C = e.auction.filter((v) => v.seat === n);
    return C.length ? /* @__PURE__ */ r("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3 }, children: C.map((v, H) => {
      const ee = H === C.length - 1;
      return /* @__PURE__ */ r("span", { style: { background: ee ? "#fff" : "#e8e8e8", border: "1px solid #7d7d7d", borderRadius: 3, minWidth: 34, textAlign: "center", fontSize: d, fontWeight: ee ? 700 : 400, padding: "0 5px", color: yn(v.call) }, children: yt(v.call) }, H);
    }) }) : null;
  }, Ze = (n, d = an) => /* @__PURE__ */ r(
    ft,
    {
      cards: e.hands[n],
      metrics: d,
      layout: "row",
      fanSpread: b.fanSpread,
      fanRadius: b.fanRadius,
      backColor: b.cardBack,
      isPlayable: Qe(n),
      onPlay: (C) => B == null ? void 0 : B(n, C)
    }
  ), ze = (n, d = { width: 197 }) => /* @__PURE__ */ r(
    Rr,
    {
      cards: e.hands[n],
      panelBg: Hn(n),
      width: d.width,
      suitW: d.suitW,
      font: d.font,
      pad: d.pad,
      bare: d.bare,
      touch: !!d.touch && a && ge && e.turn === n,
      isPlayable: Qe(n),
      onPlay: (C) => B == null ? void 0 : B(n, C)
    }
  ), et = (n, d) => {
    const C = d ?? {
      w: b.cardW,
      h: Math.round(b.cardW * 1.42),
      rank: Math.round(b.cardW * 0.46),
      glyph: Math.round(b.cardW * 0.4),
      inset: 4
    };
    return /* @__PURE__ */ r(
      ft,
      {
        cards: e.hands[n],
        metrics: C,
        layout: "fan",
        fanSpread: b.fanSpread,
        fanRadius: b.fanRadius,
        backColor: b.cardBack,
        isPlayable: Qe(n),
        onPlay: (v) => B == null ? void 0 : B(n, v)
      }
    );
  }, Mt = (n) => {
    const d = J && o[n];
    return /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      ke(n),
      o[n] ? d ? et(n) : Ze(n) : Ie(n),
      Ce(n, d ? 197 : o[n] ? 50 + Math.max(0, e.hands[n].length - 1) * 49 : 197)
    ] });
  }, $t = (n) => /* @__PURE__ */ h("div", { style: { width: 197, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
    ke(n),
    o[n] ? ze(n, { width: 197 }) : Ie(n),
    Ce(n, 197)
  ] }), Nt = [];
  {
    const n = [
      ...Array.from({ length: dt.indexOf(e.dealer) }, () => null),
      ...e.auction
    ];
    for (let d = 0; d < n.length; d += 4) Nt.push(n.slice(d, d + 4));
  }
  const tt = (n = { width: 356, height: 207, headFont: 25, cellFont: 21, radius: 4 }) => /* @__PURE__ */ r(
    Br,
    {
      bg: b.auctionBg,
      m: n,
      heads: dt.map((d) => ({ seat: d, vul: kn(d), isDealer: d === e.dealer })),
      rows: Nt,
      dealerCol: Sn,
      emptyText: e.auction.length === 0 ? e.dealer === l ? "You deal" : `${e.dealer} deals` : null
    }
  ), Tt = ge ? ((Lt = e.tricks[e.tricks.length - 1]) == null ? void 0 : Lt.plays) ?? [] : [], Et = (n = 1) => /* @__PURE__ */ r(Jt, { plays: Tt, turn: e.turn, scale: n }), nt = /* @__PURE__ */ r(
    Wr,
    {
      line: g,
      score: w,
      detail: `NS ${e.trickCount.NS} · EW ${e.trickCount.EW}`,
      action: m,
      actionNote: k,
      accent: b.accent
    }
  ), Dn = /* @__PURE__ */ r(Jt, { variant: "pill", plays: Tt, turn: e.turn }), rt = (n, d, C, v, H, ee = 21) => ({
    flex: "none",
    width: n,
    height: d,
    border: `1px solid ${v}`,
    borderRadius: Q,
    background: C,
    color: "#fff",
    fontSize: ee,
    fontWeight: 700,
    lineHeight: 1,
    cursor: H ? "pointer" : "default",
    opacity: H ? 1 : 0.42
  }), Ht = (n, d) => /* @__PURE__ */ h(ut, { children: [
    /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        onClick: Bt,
        style: rt(240, n, "#116710", "#0c4b0b", !0, d),
        children: [
          "Confirm ",
          yt(ue ?? "")
        ]
      }
    ),
    /* @__PURE__ */ r(
      "button",
      {
        type: "button",
        onClick: Wt,
        style: rt(120, n, "#8a3030", "#5e1c1c", !0, d),
        children: "Cancel"
      }
    )
  ] }), An = (n, d, C) => [1, 2, 3, 4, 5, 6, 7].map((v) => {
    const H = Le.some((Re) => be.has(`${v}${Re}`)), ee = Z && H;
    return /* @__PURE__ */ r(
      "button",
      {
        type: "button",
        onClick: ee ? () => fe(P === v ? null : v) : void 0,
        "aria-label": `Level ${v}`,
        style: { flex: "none", width: n, height: d, border: "1px solid #8a8a6a", borderRadius: Q, background: P === v ? st : "#f8f8f8", color: "#000", fontSize: C, lineHeight: 1, cursor: ee ? "pointer" : "default", opacity: ee ? 1 : 0.42 },
        children: v
      },
      v
    );
  }), In = (n, d, C, v) => P ? Le.filter((H) => be.has(`${P}${H}`)).map((H) => /* @__PURE__ */ r(
    "button",
    {
      type: "button",
      onClick: () => me(`${P}${H}`),
      "aria-label": `${P}${H === "N" ? "NT" : H}`,
      style: { flex: "none", width: H === "N" ? C : v, height: n, border: "1px solid #8a8a6a", borderRadius: Q, background: "#f8f8f8", color: de(H) ? ae : "#000", fontSize: d, lineHeight: 1, cursor: "pointer" },
      children: te[H]
    },
    H
  )) : null, zn = (n, d, C) => ["X", "XX"].map((v) => Z && be.has(v) ? /* @__PURE__ */ r(
    "button",
    {
      type: "button",
      onClick: () => me(v),
      "aria-label": v === "X" ? "Double" : "Redouble",
      style: { flex: "none", width: n, height: d, border: `1px solid ${v === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: Q, background: v === "X" ? ae : "#1034a6", color: "#fff", fontSize: C, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
      children: v
    },
    v
  ) : /* @__PURE__ */ r("span", { style: { width: n, height: d } }, v)), Xn = (n, d, C) => /* @__PURE__ */ r(
    "button",
    {
      type: "button",
      onClick: Z ? () => me("P") : void 0,
      "aria-label": "Pass",
      style: rt(n, d, Z ? "#116710" : "#a7b8a2", "#0c4b0b", Z, C),
      children: "Pass"
    }
  ), Fn = be.has("X") || be.has("XX"), Dt = P ? Le.filter((n) => be.has(`${P}${n}`)) : [], Ln = /* @__PURE__ */ r("div", { style: { width: 581, flex: "none", background: b.trayBg, borderRadius: 4, padding: "9px 10px", boxShadow: "0 3px 8px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", gap: 7, boxSizing: "border-box" }, children: ue ? /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 8, height: 81 }, children: [
    /* @__PURE__ */ r("span", { style: { fontSize: 19, color: "#3a3a20" }, children: "Confirm your call:" }),
    Ht(44, 21)
  ] }) : /* @__PURE__ */ h(ut, { children: [
    /* @__PURE__ */ h("div", { style: { display: "flex", justifyContent: "flex-start", gap: 6, alignItems: "center" }, children: [
      Xn(120, 37, 21),
      /* @__PURE__ */ r("div", { style: { display: "flex", gap: 6 }, children: An(57, 37, 23) })
    ] }),
    (Fn || Dt.length > 0) && /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ r("div", { style: { flex: "none", width: 120, display: "flex", gap: 6 }, children: zn(57, 37, 21) }),
      /* @__PURE__ */ r("div", { style: { display: "flex", gap: 6 }, children: In(37, 23, 120, 57) })
    ] })
  ] }) }), Se = re ? U.trayRow : Math.max(52, Math.ceil(44 / Math.max(0.05, xe))), On = [0, 1, 2, 3, 4].map((n) => {
    const d = Dt[n];
    return d ? /* @__PURE__ */ r(
      "button",
      {
        type: "button",
        onClick: () => me(`${P}${d}`),
        "aria-label": `${P}${d === "N" ? "NT" : d}`,
        style: { height: Se, border: "1px solid #8a8a6a", borderRadius: Q, background: "#f8f8f8", color: de(d) ? ae : "#000", fontSize: 26, lineHeight: 1, cursor: "pointer" },
        children: te[d]
      },
      n
    ) : /* @__PURE__ */ r("span", { style: { height: Se, pointerEvents: "none" } }, n);
  }), At = /* @__PURE__ */ r("div", { "data-testid": "bid-tray", style: { width: "100%", flex: "none", background: b.trayBg, padding: "8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: ue ? /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }, children: [
    /* @__PURE__ */ r("span", { style: { fontSize: 20, color: "#3a3a20" }, children: "Confirm your call" }),
    /* @__PURE__ */ r("div", { style: { display: "flex", gap: 10 }, children: Ht(52, 28) })
  ] }) : /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }, children: [
    /* @__PURE__ */ h("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [
      /* @__PURE__ */ r(
        "button",
        {
          type: "button",
          onClick: Z ? () => me("P") : void 0,
          "aria-label": "Pass",
          style: { gridColumn: "span 3", minWidth: 0, height: Se, border: "1px solid #0c4b0b", borderRadius: Q, background: Z ? "#116710" : "#a7b8a2", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: Z ? "pointer" : "default", opacity: Z ? 1 : 0.42 },
          children: "Pass"
        }
      ),
      ["X", "XX"].map((n) => Z && be.has(n) ? /* @__PURE__ */ r(
        "button",
        {
          type: "button",
          onClick: () => me(n),
          "aria-label": n === "X" ? "Double" : "Redouble",
          style: { gridColumn: "span 2", minWidth: 0, height: Se, border: `1px solid ${n === "X" ? "#8f0000" : "#0a2170"}`, borderRadius: Q, background: n === "X" ? ae : "#1034a6", color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: "pointer" },
          children: n
        },
        n
      ) : /* @__PURE__ */ r("span", { style: { gridColumn: "span 2", minWidth: 0, height: Se } }, n))
    ] }),
    /* @__PURE__ */ r("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }, children: [1, 2, 3, 4, 5, 6, 7].map((n) => {
      const d = Le.some((v) => be.has(`${n}${v}`)), C = Z && d;
      return /* @__PURE__ */ r(
        "button",
        {
          type: "button",
          onClick: C ? () => fe(P === n ? null : n) : void 0,
          "aria-label": `Level ${n}`,
          style: { height: Se, border: "1px solid #8a8a6a", borderRadius: Q, background: P === n ? st : "#f8f8f8", color: "#000", fontSize: 26, lineHeight: 1, cursor: C ? "pointer" : "default", opacity: C ? 1 : 0.42 },
          children: n
        },
        n
      );
    }) }),
    /* @__PURE__ */ r("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }, children: On })
  ] }) }), ot = {
    legalCalls: u,
    live: Z,
    pending: ue,
    onStage: me,
    onConfirm: Bt,
    onCancel: Wt,
    radius: Q
  }, jn = /* @__PURE__ */ r(ct, { cell: 46, ...ot }), _n = /* @__PURE__ */ r("div", { style: { width: "100%", flex: "none", background: b.trayBg, padding: 10, display: "flex", justifyContent: "center", boxShadow: "0 -2px 8px rgba(0,0,0,.45)", boxSizing: "border-box" }, children: /* @__PURE__ */ r(ct, { cell: 84, minCellH: Se, ...ot }) }), It = { N: "North", E: "East", S: "South", W: "West" }, zt = e.vul === "both" || e.vul === "All" ? "Both" : e.vul === "none" || e.vul === "None" ? "None" : String(e.vul).toUpperCase(), it = [
    { kind: "chip", label: "Board", value: String(i) },
    { kind: "chip", label: "Dealer", value: e.dealer },
    { kind: "chip", label: "Vul", value: zt, color: zt === "None" ? "#eef4f1" : "#ff9c9c" },
    { kind: "divider" },
    { kind: "chip", label: "Contract", value: oe ? `${oe.level}${te[oe.strain]}${oe.doubled === 1 ? "X" : oe.doubled === 2 ? "XX" : ""}` : "—", color: oe && de(oe.strain) ? "#ff8a8a" : "#eef4f1" },
    { kind: "chip", label: "By", value: oe ? It[oe.declarer] : "—" },
    { kind: "spacer" },
    { kind: "chip", label: "NS", value: String(e.trickCount.NS) },
    { kind: "chip", label: "EW", value: String(e.trickCount.EW) },
    { kind: "button", label: f, title: "Scoring mode", on: A ?? null }
  ], lt = (n) => [
    ...n ? [{ kind: "node", node: n }] : [],
    { kind: "divider" },
    ...X ? [{ kind: "button", label: X.label, title: "Four-hand record", href: X.href }] : [],
    ...O ? [{ kind: "button", label: "Seats", title: "Who is in each seat", on: () => ye(!0) }] : [],
    { kind: "spacer" },
    ...D && ge ? [{ kind: "button", label: "Claim", tone: "accent", on: D }] : [],
    ...Y ? [{ kind: "icon", label: "☰", tone: "accent", title: "Table settings", ariaLabel: "Table menu", on: Y }] : []
  ], Xt = K && O ? /* @__PURE__ */ r(Mr, { onClose: () => ye(!1), children: O }) : null, Pn = (n) => Ye.map((d) => {
    const C = e.hands[n].filter((v) => v.suit === d).sort((v, H) => H.rank - v.rank).map((v) => he(v.rank)).join("");
    return C ? { suit: d, ranks: C } : null;
  }).filter((d) => d != null), Yn = St && G ? /* @__PURE__ */ h("div", { "data-testid": "dummy-strip", style: { flex: "none", height: en, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: "rgba(0,0,0,.16)", overflow: "hidden" }, children: [
    /* @__PURE__ */ r("span", { style: { fontSize: 19, fontWeight: 700, color: "#dfe9e4", whiteSpace: "nowrap" }, children: It[G] }),
    o[G] ? Pn(G).map((n) => /* @__PURE__ */ h("span", { style: { fontSize: 26, fontWeight: 700, color: "#f2f6f4", whiteSpace: "nowrap" }, children: [
      /* @__PURE__ */ r("span", { style: { color: de(n.suit) ? ae : "#111" }, children: te[n.suit] }),
      n.ranks
    ] }, n.suit)) : null
  ] }) : null, Un = Ge && G ? (
    // paddingTop reserves headroom for a playable card's translateY(-6px) lift
    // (well within the HAND_H.row budget), so the raised top is never clipped.
    /* @__PURE__ */ r("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: o[G] ? J ? et(G, ce) : Ze(G, ce) : Ie(G, { w: ce.backW, h: ce.h }) })
  ) : null, Kn = /* @__PURE__ */ h("div", { style: { width: Oe, minHeight: Je, height: Je, transform: `scale(${xe})`, transformOrigin: "top center", marginBottom: Tn, display: "flex", flexDirection: "column", background: "#fff" }, children: [
    /* @__PURE__ */ r(Be, { side: "top", items: it, condensed: !0, thickness: U.bar, bg: b.barBg, accent: b.accent }),
    /* @__PURE__ */ h("div", { style: { flex: "none", display: "flex", flexDirection: "column", background: b.feltFlat }, children: [
      Yn,
      Un,
      /* @__PURE__ */ r("div", { "data-testid": "centre-band", style: { flex: "none", height: Rt, display: "flex", alignItems: "flex-start", overflow: "hidden", padding: "0 10px" }, children: /* @__PURE__ */ h("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: V ? "flex-start" : "center", justifyContent: "center", ...N ? { border: "3px solid #c9992b", borderRadius: 10, boxSizing: "border-box" } : {} }, children: [
        V && p === "box" ? tt({ width: 430, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
        V && p === "seats" ? /* @__PURE__ */ r("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: 10 }, children: ["N", "E", "S", "W"].map((n) => /* @__PURE__ */ h("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ r("span", { style: { width: 30, height: 30, background: bn, color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }, children: n }),
          ke(n, 22) ?? /* @__PURE__ */ r("span", { style: { fontSize: 18, color: "rgba(255,255,255,.6)" }, children: "—" })
        ] }, n)) }) : null,
        ge ? Et($n) : null,
        we ? nt : null
      ] }) }),
      V ? Wn ? /* @__PURE__ */ r("div", { style: { display: "flex", justifyContent: "center", padding: "6px 0" }, children: /* @__PURE__ */ r(ct, { cell: Mn, ...ot }) }) : At : null,
      /* @__PURE__ */ r("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "10px 0 0" }, children: /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
        ke("S"),
        o.S ? J ? et("S", ce) : Ze("S", ce) : Ie("S", { w: ce.backW, h: ce.h }),
        Ce("S", o.S ? ce.w + Math.max(0, e.hands.S.length - 1) * (ce.w - 1) : 390)
      ] }) })
    ] }),
    /* @__PURE__ */ r(Be, { side: "bottom", items: lt(I ?? y), condensed: !0, thickness: U.bar, bg: b.barBg, accent: b.accent })
  ] }), Gn = (n) => /* @__PURE__ */ h("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    ke(n, 22),
    Ce(n, "100%", { height: 44, badge: 44, font: 28, tagFont: 15 }),
    o[n] && ze(n, { width: "100%", suitW: 38, font: 40, pad: "6px 10px 8px", bare: !0 })
  ] }), Ft = (n) => /* @__PURE__ */ h("div", { style: { width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 3 }, children: [
    ke(n, 22),
    Ce(n, "100%", { height: 44, badge: 44, font: 24, tagFont: 13 }),
    o[n] && ze(n, { width: 168, suitW: 22, font: 25, pad: "5px 7px 7px", bare: !0 })
  ] }), Vn = (n) => /* @__PURE__ */ h("div", { style: { width: 390, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 3 }, children: [
    ke(n, 22),
    Ce(n, "100%", { height: 48, badge: 48, font: 30, tagFont: 15 }),
    o[n] && ze(n, { width: "100%", suitW: 44, font: 42, pad: "6px 10px 10px", bare: !0, touch: !0 })
  ] }), qn = /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: b.stageBg }, children: [
    /* @__PURE__ */ r(Be, { side: "top", items: it, scale: xe, minTouch: 44, bg: b.barBg, accent: b.accent }),
    /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden", background: b.felt }, children: [
      /* @__PURE__ */ r("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "12px 8px 0" }, children: Gn("N") }),
      /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8 }, children: [
        Ft("W"),
        /* @__PURE__ */ h("div", { style: { flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...j }, children: [
          V && p === "box" ? tt({ width: 330, height: "100%", headFont: 26, cellFont: 24, radius: 0, cellMinH: 56 }) : null,
          ge ? Dn : null,
          we ? nt : null
        ] }),
        Ft("E")
      ] }),
      /* @__PURE__ */ r("div", { style: { flex: "none", display: "flex", justifyContent: "center", padding: "0 8px 14px" }, children: Vn("S") })
    ] }),
    V ? R ? _n : At : null,
    /* @__PURE__ */ r(Be, { side: "bottom", items: lt(I ?? y), scale: xe, minTouch: 44, bg: b.barBg, accent: b.accent })
  ] }), Jn = /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#0b1512" }, children: [
    /* @__PURE__ */ r(Be, { side: "top", items: it, scale: xe, bg: b.barBg, accent: b.accent }),
    /* @__PURE__ */ r("div", { style: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: b.felt }, children: /* @__PURE__ */ h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, padding: "14px 16px" }, children: [
      /* @__PURE__ */ r("div", { style: { display: "flex", justifyContent: "center" }, children: Mt("N") }),
      /* @__PURE__ */ h("div", { style: { flex: 1, minHeight: 207, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0" }, children: [
        $t("W"),
        /* @__PURE__ */ r("div", { style: { flex: 1, minWidth: 0, alignSelf: "stretch", display: "flex", ...j }, children: /* @__PURE__ */ h(Lr, { children: [
          V && R ? jn : V && p === "box" ? tt() : null,
          ge ? Et() : null,
          we ? nt : null
        ] }) }),
        $t("E")
      ] }),
      /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ r("div", { style: { height: V && !R ? 113 : 0, flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "center" }, children: V && !R ? Ln : null }),
        Mt("S")
      ] })
    ] }) }),
    /* @__PURE__ */ r(Be, { side: "bottom", items: lt(y), scale: xe, bg: b.barBg, accent: b.accent })
  ] });
  return re ? /* @__PURE__ */ h("div", { ref: _, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", fontFamily: b.font, WebkitFontSmoothing: "antialiased" }, children: [
    /* @__PURE__ */ r("div", { style: { flex: mt, minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }, children: /* @__PURE__ */ r("div", { style: { flex: 1, minHeight: 0, width: "100%", background: "#fff", display: "flex", justifyContent: "center", alignItems: "flex-start", overflowX: "hidden", overflowY: "auto" }, children: Kn }) }),
    Ke > 0 && /* @__PURE__ */ r("div", { style: { flex: Ke, minHeight: 0, display: "flex", background: "#fff", borderTop: "1px solid #d8ded9" }, children: vn && /* @__PURE__ */ r(Tr, { title: L, accent: b.accent, lines: T, actions: ne }) }),
    Xt,
    s && !M && /* @__PURE__ */ r(Vt, { accent: b.accent, items: F, onClose: () => E(!1) })
  ] }) : /* @__PURE__ */ r("div", { ref: _, style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: b.stageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: b.font, WebkitFontSmoothing: "antialiased" }, children: /* @__PURE__ */ h("div", { style: { position: "relative", flex: "none", transformOrigin: "center center", width: Nn, height: Je, transform: `scale(${xe})` }, children: [
    Ee ? qn : Jn,
    Xt,
    s && !M && /* @__PURE__ */ r(Vt, { accent: b.accent, items: F, onClose: () => E(!1) })
  ] }) });
}
const cn = ["N", "E", "S", "W"], jr = { N: "S", S: "N", E: "W", W: "E" }, _r = { N: "North", E: "East", S: "South", W: "West" };
function no({
  deal: e,
  seed: t = 1,
  dealer: o = "N",
  vul: l = "none",
  humanSeat: u = "S",
  showAllHands: c = !1,
  appearance: a,
  decide: i,
  robotDelayMs: f = 350,
  showCoach: p = !1,
  coachShare: x,
  onComplete: m
}) {
  var ne, b, J;
  const k = Xe(() => e ?? sr(t), [e, t]), [g, w] = se(
    () => Pt("embed", o, l, k)
  ), W = `${o}:${l}:${t}:${k.N.length}:${((ne = k.N[0]) == null ? void 0 : ne.suit) ?? ""}${((b = k.N[0]) == null ? void 0 : b.rank) ?? ""}`, B = ie(W);
  $e(() => {
    B.current !== W && (B.current = W, M.current = 0, w(Pt("embed", o, l, k)));
  }, [W, o, l, k]);
  const M = ie(0), A = Me((R, N) => {
    w(
      (j) => Fe(j, {
        category: "bid-event",
        seq: M.current += 1,
        boardRef: j.boardRef,
        seat: R,
        call: N
      })
    );
  }, []), D = Me((R, N) => {
    w(
      (j) => Fe(j, {
        category: "play-event",
        seq: M.current += 1,
        boardRef: j.boardRef,
        seat: R,
        card: N
      })
    );
  }, []), y = ((J = g.contract) == null ? void 0 : J.declarer) ?? null, I = y && g.phase !== "auction" ? jr[y] : null, O = Me(
    (R) => R === u || R === I && y === u,
    [u, I, y]
  ), z = g.phase !== "complete" && O(g.turn), X = ie(!1);
  $e(() => {
    if (!i || z || g.phase === "complete" || X.current) return;
    const R = g.turn, N = g;
    X.current = !0;
    let j = !1;
    return (async () => {
      try {
        if (await new Promise(($) => setTimeout($, f)), j) return;
        const _ = await i(N, R);
        if (j || !_) return;
        w(($) => $ !== N && $.turn !== R ? $ : _.call && $.phase === "auction" ? pt($.auction, R).has(_.call) ? Fe($, {
          category: "bid-event",
          seq: M.current += 1,
          ts: Date.now(),
          boardRef: $.boardRef,
          seat: R,
          call: _.call,
          fallback: !1
        }) : $ : _.card && $.phase === "play" && gt($, R).some(
          (fe) => fe.suit === _.card.suit && fe.rank === _.card.rank
        ) ? Fe($, {
          category: "play-event",
          seq: M.current += 1,
          ts: Date.now(),
          boardRef: $.boardRef,
          seat: R,
          card: _.card,
          fallback: !1
        }) : $);
      } finally {
        X.current = !1;
      }
    })(), () => {
      j = !0, X.current = !1;
    };
  }, [i, z, g, f]);
  const q = ie(!1);
  $e(() => {
    g.phase !== "complete" || q.current || (q.current = !0, m == null || m(g));
  }, [g, m]);
  const le = Xe(() => ({
    ...un((a == null ? void 0 : a.skin) ?? "bbo", a == null ? void 0 : a.overrides),
    handLayout: (a == null ? void 0 : a.handLayout) ?? "row",
    bidPad: (a == null ? void 0 : a.bidPad) ?? "grid",
    centreFrame: (a == null ? void 0 : a.centreFrame) ?? !1,
    fanSpread: (a == null ? void 0 : a.fanSpread) ?? 56,
    fanRadius: (a == null ? void 0 : a.fanRadius) ?? 0
  }), [a]), S = Xe(() => {
    const R = {};
    for (const N of cn)
      R[N] = c || N === u || N === I;
    return R;
  }, [c, u, I]), L = Xe(() => {
    const R = {};
    for (const N of cn)
      R[N] = {
        name: N === u ? "You" : _r[N],
        human: N === u
      };
    return R;
  }, [u]), T = g.phase === "complete" ? lr(g) : null;
  return /* @__PURE__ */ r(
    Or,
    {
      state: g,
      seats: L,
      visible: S,
      mySeat: u,
      myTurn: z,
      legalCalls: g.phase === "auction" && z ? [...pt(g.auction, g.turn)] : [],
      legalPlays: g.phase === "play" && z ? gt(g, g.turn) : [],
      appearance: le,
      showCoach: p,
      ...x === void 0 ? {} : { coachShare: x },
      resultLine: T ? ar(T) : "",
      resultScore: T ? `${T.declarerScore >= 0 ? "+" : ""}${T.declarerScore}` : "",
      onCall: (R) => {
        z && A(g.turn, R);
      },
      onPlay: (R, N) => {
        z && D(g.turn, N);
      }
    }
  );
}
const Pr = ["S", "H", "D", "C"], Yr = { N: "S", S: "N", E: "W", W: "E" }, Ur = {
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
function xn(e) {
  return e === 10 ? "T" : er(e);
}
function je(e) {
  return Pr.map(
    (t) => e.filter((o) => o.suit === t).sort((o, l) => l.rank - o.rank).map((o) => xn(o.rank)).join("")
  ).join(".");
}
function Kr(e) {
  return e === "P" ? "--" : e === "X" ? "Db" : e === "XX" ? "Rd" : e;
}
function Gr(e) {
  return e.map((t) => Kr(t.call)).join("");
}
function Vr(e) {
  return e === "both" ? "@v@V" : e === "ns" ? "@v" : e === "ew" ? "@V" : "";
}
function qr(e) {
  return e.tricks.flatMap((t) => t.plays).map((t) => `${t.card.suit}${xn(t.card.rank)}`).join("");
}
function _e(e, t) {
  return [
    ...e.hands[t],
    ...e.tricks.flatMap(
      (o) => o.plays.filter((l) => l.seat === t).map((l) => l.card)
    )
  ];
}
function Jr(e) {
  const t = e.trim().toUpperCase();
  if (t === "PASS" || t === "P" || t === "--" || t === "PA") return "P";
  if (t === "X" || t === "DB" || t === "DBL" || t === "DOUBLE") return "X";
  if (t === "XX" || t === "RD" || t === "REDBL" || t === "REDOUBLE") return "XX";
  const o = /^([1-7])(NT|N|C|D|H|S)$/.exec(t);
  return o ? `${o[1]}${o[2] === "NT" ? "N" : o[2]}` : t;
}
function Qr(e) {
  const t = /^([SHDC])([2-9TJQKA])$/.exec(e.trim().toUpperCase());
  return t ? { suit: t[1], rank: Ur[t[2]] } : null;
}
function ro({
  endpoint: e,
  timeoutMs: t = 6e4,
  fetchImpl: o,
  onProblem: l
}) {
  const u = e.replace(/\/$/, ""), c = o ?? ((...i) => fetch(...i)), a = async (i, f) => {
    const p = `${u}${i}?${new URLSearchParams({ ...f, details: "true" })}`, x = new AbortController(), m = setTimeout(() => x.abort(), t);
    try {
      const k = await c(p, { signal: x.signal });
      if (!k.ok) throw new Error(`HTTP ${k.status}`);
      return await k.json();
    } finally {
      clearTimeout(m);
    }
  };
  return async (i, f) => {
    var m;
    const p = Vr(i.vul), x = Gr(i.auction);
    try {
      if (i.phase === "auction") {
        const k = await a("/bid", {
          hand: je(_e(i, f)),
          seat: f,
          dealer: i.dealer,
          vul: p,
          ctx: x
        }), g = typeof k.bid == "string" ? k.bid : "", w = Jr(g);
        return pt(i.auction, f).has(w) ? { call: w } : (l == null || l(`BEN answered "${g}" for ${f}, which is not legal here`), null);
      }
      if (i.phase === "play") {
        const k = qr(i), g = ((m = i.contract) == null ? void 0 : m.declarer) ?? null, w = g ? Yr[g] : null, W = f === w && g ? g : f, B = k === "" ? await a("/lead", {
          hand: je(_e(i, f)),
          seat: f,
          dealer: i.dealer,
          vul: p,
          ctx: x
        }) : await a("/play", {
          hand: je(_e(i, W)),
          dummy: w ? je(_e(i, w)) : "",
          seat: W,
          dealer: i.dealer,
          vul: p,
          ctx: x,
          played: k
        }), M = typeof B.card == "string" ? B.card : "", A = Qr(M);
        return A ? gt(i, f).some((y) => y.suit === A.suit && y.rank === A.rank) ? { card: A } : (l == null || l(`BEN's ${M} is not legal for ${f} here`), null) : (l == null || l(`BEN answered "${M}" for ${f}, which is not a card`), null);
      }
      return null;
    } catch (k) {
      return l == null || l(`BEN could not be reached (${k.message})`), null;
    }
  };
}
export {
  no as BridgeTable,
  ro as createBenDecider
};
//# sourceMappingURL=table-embed.js.map
