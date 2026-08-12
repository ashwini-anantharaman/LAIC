const C = ["C", "D", "H", "S"], ke = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], A = { S: 3, H: 2, D: 1, C: 0 }, ye = (e) => e === "H" || e === "S", Se = (e) => e === "C" || e === "D";
function Ee(e) {
  return e === 11 ? "J" : e === 12 ? "Q" : e === 13 ? "K" : e === 14 ? "A" : String(e);
}
function I(e) {
  return `${e.suit}${e.rank}`;
}
const L = ["S", "W", "N", "E"], Be = {
  S: "South",
  W: "West",
  N: "North",
  E: "East"
};
function m(e) {
  return L[(L.indexOf(e) + 1) % 4];
}
function $(e) {
  return m(m(e));
}
function O(e, n) {
  return e === n || $(e) === n;
}
const ve = {
  none: "None",
  ns: "N-S",
  ew: "E-W",
  both: "Both"
};
function G(e, n) {
  if (e === "both") return !0;
  if (e === "none") return !1;
  const t = n === "N" || n === "S";
  return e === "ns" ? t : !t;
}
const H = { C: "♣", D: "♦", H: "♥", S: "♠" };
function N(e) {
  return e !== "P" && e !== "X" && e !== "XX";
}
function Te(e) {
  if (e === "P") return "P";
  if (e === "X") return "X";
  if (e === "XX") return "XX";
  const n = e[0], t = e[1];
  return t === "N" ? `${n}NT` : `${n}${H[t]}`;
}
function Re(e) {
  return N(e) && (e[1] === "D" || e[1] === "H");
}
function Ce(e) {
  const n = e.strain === "N" ? "NT" : H[e.strain], t = e.doubled === 1 ? " X" : e.doubled === 2 ? " XX" : "";
  return `${e.level}${n}${t} by ${e.declarer}`;
}
function Ae(e) {
  let n = e >>> 0;
  return function() {
    n |= 0, n = n + 1831565813 | 0;
    let t = n;
    return t = Math.imul(t ^ t >>> 15, t | 1), t ^= t + Math.imul(t ^ t >>> 7, t | 61), ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const Ie = (e) => e.category === "bid-event" || e.category === "play-event", Le = (e) => e.category === "bid-logic-event" || e.category === "play-logic-event", M = [
  "bid-event",
  "bid-logic-event",
  "play-event",
  "play-logic-event"
];
function W(e) {
  return { all: e = e || /* @__PURE__ */ new Map(), on: function(n, t) {
    var r = e.get(n);
    r ? r.push(t) : e.set(n, [t]);
  }, off: function(n, t) {
    var r = e.get(n);
    r && (t ? r.splice(r.indexOf(t) >>> 0, 1) : e.set(n, []));
  }, emit: function(n, t) {
    var r = e.get(n);
    r && r.slice().map(function(c) {
      c(t);
    }), (r = e.get("*")) && r.slice().map(function(c) {
      c(n, t);
    });
  } };
}
const Pe = () => W();
function Fe(e) {
  let n = [];
  const t = /* @__PURE__ */ new Set(), r = (o) => {
    n.push(o);
    for (const a of t) a(o);
  }, c = M.map(
    (o) => (() => {
      const a = (s) => r(s);
      return e.on(o, a), () => e.off(o, a);
    })()
  );
  return {
    append: r,
    getAll: () => n,
    filter: (o) => n.filter((a) => a.category === o),
    bySeat: (o) => n.filter((a) => "seat" in a && a.seat === o),
    clear: () => {
      n = [];
    },
    rollback: (o) => {
      n = n.filter((a) => a.seq < o);
      for (const a of t) a();
    },
    subscribe: (o) => (t.add(o), () => t.delete(o)),
    export: () => JSON.stringify(n, null, 2),
    import: (o) => {
      const a = JSON.parse(o);
      if (!Array.isArray(a)) throw new Error("Event log JSON must be an array.");
      n = a;
    },
    dispose: () => {
      for (const o of c) o();
      t.clear();
    }
  };
}
function De(e) {
  let n = 0;
  for (const t of e)
    t.rank === 14 ? n += 4 : t.rank === 13 ? n += 3 : t.rank === 12 ? n += 2 : t.rank === 11 && (n += 1);
  return n;
}
function _(e) {
  const n = { C: 0, D: 0, H: 0, S: 0 };
  for (const t of e) n[t.suit] += 1;
  return n;
}
function Y(e) {
  const n = _(e), t = C.map((r) => n[r]).sort((r, c) => c - r);
  return [t[0], t[1], t[2], t[3]];
}
function Oe(e) {
  const n = Y(e).join("-");
  return n === "4-3-3-3" || n === "4-4-3-2" || n === "5-3-3-2";
}
function He(e) {
  const n = _(e), t = Math.max(...C.map((r) => n[r]));
  return C.filter((r) => n[r] === t).map((r) => ({ suit: r, length: t })).sort((r, c) => A[c.suit] - A[r.suit]);
}
const x = ["C", "D", "H", "S", "N"];
function P(e) {
  return N(e) ? (Number(e[0]) - 1) * 5 + x.indexOf(e[1]) : -1;
}
function _e(e, n) {
  const t = /* @__PURE__ */ new Set(["P"]);
  let r = -1;
  for (const o of e) r = Math.max(r, P(o.call));
  for (let o = 1; o <= 7; o++)
    for (const a of x) {
      const s = `${o}${a}`;
      P(s) > r && t.add(s);
    }
  let c = null;
  for (let o = e.length - 1; o >= 0; o--)
    if (e[o].call !== "P") {
      c = e[o];
      break;
    }
  return c && !O(c.seat, n) && (N(c.call) ? t.add("X") : c.call === "X" && t.add("XX")), t;
}
function K(e) {
  if (e.length < 4) return !1;
  const n = e.slice(-3);
  return n.length === 3 && n.every((t) => t.call === "P");
}
function U(e) {
  let n = null, t = 0;
  for (const a of e)
    N(a.call) ? (n = a, t = 0) : a.call === "X" ? t = 1 : a.call === "XX" && (t = 2);
  if (!n) return null;
  const r = n.call[1], c = n.seat;
  let o = n.seat;
  for (const a of e)
    if (N(a.call) && a.call[1] === r && O(a.seat, c)) {
      o = a.seat;
      break;
    }
  return { level: Number(n.call[0]), strain: r, doubled: t, declarer: o };
}
function V(e, n, t, r) {
  return {
    boardRef: e,
    dealer: n,
    vul: t,
    hands: {
      N: [...r.N],
      E: [...r.E],
      S: [...r.S],
      W: [...r.W]
    },
    auction: [],
    contract: null,
    phase: "auction",
    turn: n,
    tricks: [],
    trickCount: { NS: 0, EW: 0 }
  };
}
const X = (e) => e === "N" || e === "S" ? "NS" : "EW";
function z(e, n) {
  const t = e.plays[0].card.suit, r = (o, a) => {
    const s = n !== "N" && o.suit === n, i = n !== "N" && a.suit === n;
    if (s && !i) return !0;
    if (i && !s) return !1;
    if (s && i) return o.rank > a.rank;
    const d = o.suit === t, b = a.suit === t;
    return d && !b ? !0 : b && !d ? !1 : o.rank > a.rank;
  };
  let c = e.plays[0];
  for (const o of e.plays.slice(1)) r(o.card, c.card) && (c = o);
  return c.seat;
}
function xe(e, n) {
  const t = e.hands[n], r = e.tricks[e.tricks.length - 1];
  if (!r || r.plays.length === 0 || r.plays.length === 4) return [...t];
  const o = r.plays[0].card.suit, a = t.filter((s) => s.suit === o);
  return a.length ? a : [...t];
}
function J(e, n) {
  if (n.category === "bid-event") {
    const l = [...e.auction, { seat: n.seat, call: n.call }];
    if (!K(l))
      return { ...e, auction: l, turn: m(n.seat) };
    const p = U(l);
    if (!p)
      return { ...e, auction: l, contract: null, phase: "complete" };
    const g = m(p.declarer);
    return {
      ...e,
      auction: l,
      contract: p,
      phase: "play",
      turn: g,
      tricks: [{ leader: g, plays: [] }]
    };
  }
  const t = n.seat, r = {
    ...e.hands,
    [t]: e.hands[t].filter((l) => I(l) !== I(n.card))
  }, c = e.tricks.map((l) => ({ ...l, plays: [...l.plays] }));
  let o = c[c.length - 1];
  if ((!o || o.plays.length === 4) && (o = { leader: t, plays: [] }, c.push(o)), o.plays.push({ seat: t, card: n.card }), o.plays.length < 4)
    return { ...e, hands: r, tricks: c, turn: m(t) };
  const a = e.contract ? e.contract.strain : "N", s = z(o, a);
  o.winner = s;
  const i = X(s), d = { ...e.trickCount, [i]: e.trickCount[i] + 1 }, b = r.N.length === 0 && r.E.length === 0 && r.S.length === 0 && r.W.length === 0;
  return {
    ...e,
    hands: r,
    tricks: c,
    trickCount: d,
    turn: s,
    phase: b ? "complete" : "play"
  };
}
function Xe(e, n) {
  let t = V(e.boardRef, e.dealer, e.vul, e.hands);
  for (const r of n) t = J(t, r);
  return t;
}
const F = { C: 20, D: 20, H: 30, S: 30 };
function we(e) {
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
  const t = X(n.declarer), r = e.trickCount[t], c = 6 + n.level, o = r - c, a = o >= 0, s = G(e.vul, n.declarer), i = n.doubled, d = i === 2 ? 4 : i === 1 ? 2 : 1;
  let b = 0, l = 0, p = 0, g = 0, h = 0, T = 0, k = 0;
  if (a) {
    b = n.strain === "N" ? (40 + (n.level - 1) * 30) * d : F[n.strain] * n.level * d;
    const y = i === 0 ? n.strain === "N" ? 30 : F[n.strain] : (s ? 200 : 100) * (i === 2 ? 2 : 1);
    l = o * y, b >= 100 ? p = s ? 500 : 300 : g = 50, n.level === 6 && (h = s ? 750 : 500), n.level === 7 && (h = s ? 1500 : 1e3), i > 0 && (T = 50 * i);
  } else {
    const y = -o;
    if (i === 0)
      k = y * (s ? 100 : 50);
    else {
      let S = 0;
      for (let E = 1; E <= y; E++)
        E === 1 ? S += s ? 200 : 100 : E <= 3 ? S += s ? 300 : 200 : S += 300;
      k = S * (i === 2 ? 2 : 1);
    }
  }
  const R = a ? b + l + p + g + h + T : -k;
  return {
    contract: n,
    tricksTaken: r,
    result: o,
    made: a,
    vulnerable: s,
    trickScore: b,
    overtrickScore: l,
    gameBonus: p,
    partscoreBonus: g,
    slamBonus: h,
    insultBonus: T,
    penalty: k,
    declarerScore: R,
    nsScore: t === "NS" ? R : -R
  };
}
function $e(e) {
  if (!e.contract) return "Passed out";
  const n = e.contract, t = n.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[n.strain], r = n.doubled === 1 ? " X" : n.doubled === 2 ? " XX" : "", c = e.result === 0 ? "made" : e.result > 0 ? `made +${e.result}` : `down ${-e.result}`;
  return `${n.level}${t}${r} by ${n.declarer}, ${c}`;
}
const j = ["bbo", "midnight", "parchment", "noir", "claret"], Q = { bbo: { label: "Green baize", note: "The BBO table: green felt, olive tray, cyan card backs.", felt: "radial-gradient(125% 115% at 33% 20%,#26805e 0%,#1c6b4f 45%,#14563f 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.12) 100%),#1c6b4f", stageBg: "#000", barBg: "rgba(9,22,17,.90)", accent: "#384bb3", chip: "#acc5c5", trayBg: "#cccc9b", strainBg: "#f8f8f8", levelBorder: "#8a8a6a", auctionBg: "#acc5c5", cardBack: "#0d707c", radius: "5px", font: "Arial, Helvetica, sans-serif", barThickness: 44, cardW: 54 }, midnight: { label: "Midnight", note: "Cool indigo felt and slate chrome — easy on the eyes at night.", felt: "radial-gradient(125% 115% at 33% 20%,#2f3f6b 0%,#212e4f 45%,#151d36 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.14) 100%),#212e4f", stageBg: "#080b14", barBg: "rgba(12,18,33,.93)", accent: "#4b62d8", chip: "#9fb3d9", trayBg: "#3a4360", strainBg: "#f5f7fc", levelBorder: "#6d7899", auctionBg: "#b9c6de", cardBack: "#27407a", radius: "8px", font: '"Helvetica Neue", Helvetica, Arial, sans-serif', barThickness: 44, cardW: 54 }, parchment: { label: "Parchment", note: "A paper hand-record: warm light table, serif type, brown chrome.", felt: "linear-gradient(160deg,#f4e9d2 0%,#e9dabb 55%,#dcc9a4 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.35) 0%,rgba(120,90,50,.14) 100%),#e9dabb", stageBg: "#cabb9c", barBg: "rgba(58,43,26,.93)", accent: "#8a5a2b", chip: "#efe4cc", trayBg: "#cdb994", strainBg: "#fffdf6", levelBorder: "#a58d63", auctionBg: "#f1e7d1", cardBack: "#8a5a2b", radius: "3px", font: 'Georgia, "Times New Roman", serif', barThickness: 42, cardW: 54 }, noir: { label: "Noir", note: "Near-black, minimal chrome, hard corners — a broadcast table.", felt: "linear-gradient(180deg,#1e1e1e 0%,#131313 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.05) 0%,rgba(0,0,0,.18) 100%),#181818", stageBg: "#000", barBg: "rgba(0,0,0,.94)", accent: "#2f6fd0", chip: "#d8d8d8", trayBg: "#2b2b2b", strainBg: "#fafafa", levelBorder: "#5a5a5a", auctionBg: "#d2d2d2", cardBack: "#3a3a3a", radius: "2px", font: '"Arial Narrow", Arial, Helvetica, sans-serif', barThickness: 40, cardW: 54 }, claret: { label: "Claret", note: "Club room: burgundy cloth, gold tray, warm serif type.", felt: "radial-gradient(125% 115% at 33% 20%,#7d2136 0%,#631427 45%,#480e1c 100%)", feltFlat: "radial-gradient(140% 120% at 50% 50%,rgba(255,255,255,.06) 0%,rgba(0,0,0,.16) 100%),#631427", stageBg: "#1a0a0d", barBg: "rgba(34,10,17,.93)", accent: "#a8863c", chip: "#e3cfa4", trayBg: "#b4a06a", strainBg: "#fdfaf2", levelBorder: "#8d7642", auctionBg: "#e6d7b3", cardBack: "#7a2338", radius: "6px", font: 'Georgia, "Times New Roman", serif', barThickness: 44, cardW: 54 } }, q = { N: { bg: "#cfe4f7", ink: "#12508f", edge: "#8fbde8" }, S: { bg: "#c6cfd9", ink: "#1b2a3a", edge: "#9aa7b5" }, H: { bg: "#f7cccc", ink: "#c02020", edge: "#e39a9a" }, D: { bg: "#f9dcae", ink: "#c9761a", edge: "#e0b477" }, C: { bg: "#e0e6ea", ink: "#2c3b47", edge: "#b6c1c8" } }, Z = { feltColor: ["#1c6b4f", "#14563f", "#0d707c", "#1d5c8f"], accent: ["#384bb3", "#1f2f80", "#0d707c"], bidBoxColor: ["#cccc9b", "#c2c8a8", "#b9b98c"], auctionColor: ["#acc5c5", "#c3d6d6", "#9bb5b5"], cardBackColor: ["#0d707c", "#12525e", "#8f1d1d"] }, ee = { spread: { min: 30, max: 140, step: 2, default: 56 }, radius: { min: 120, max: 900, default: 0 } }, ne = { skin: "bbo", handLayout: "row", bidPad: "grid", centreFrame: !1, fanSpread: 56, fanRadius: 0 }, te = { "classic-club": { label: "Classic club", note: "Fanned hand, suit-column bidding, gold centre frame.", appearance: { skin: "bbo", handLayout: "fan", bidPad: "columns", centreFrame: !0 } }, "green-baize": { label: "Green baize", appearance: { skin: "bbo", handLayout: "row", bidPad: "grid", centreFrame: !1 } }, midnight: { label: "Midnight", appearance: { skin: "midnight", handLayout: "row", bidPad: "grid", centreFrame: !1 } }, parchment: { label: "Parchment", appearance: { skin: "parchment", handLayout: "row", bidPad: "grid", centreFrame: !1 } }, noir: { label: "Noir", appearance: { skin: "noir", handLayout: "row", bidPad: "grid", centreFrame: !1 } }, claret: { label: "Claret", appearance: { skin: "claret", handLayout: "row", bidPad: "grid", centreFrame: !1 } } }, re = {
  order: j,
  skins: Q,
  strainTint: q,
  overrideOptions: Z,
  fan: ee,
  defaults: ne,
  presets: te
}, u = re, v = u.skins, B = u.order, Ge = u.strainTint, Me = u.overrideOptions, w = u.fan, ae = u.presets, oe = [
  "feltColor",
  "accent",
  "bidBoxColor",
  "auctionColor",
  "cardBackColor"
], f = {
  skin: u.defaults.skin,
  handLayout: u.defaults.handLayout,
  bidPad: u.defaults.bidPad,
  centreFrame: u.defaults.centreFrame,
  fanSpread: u.defaults.fanSpread,
  fanRadius: u.defaults.fanRadius,
  overrides: {}
};
function ce(e) {
  return typeof e == "string" && B.includes(e);
}
function We(e, n = {}) {
  const t = v[e] ?? v[f.skin], r = (o) => {
    const a = n[o];
    return typeof a == "string" && a.trim() !== "" ? a : void 0;
  }, c = r("feltColor");
  return {
    ...t,
    felt: c ?? t.felt,
    feltFlat: c ?? t.feltFlat,
    accent: r("accent") ?? t.accent,
    trayBg: r("bidBoxColor") ?? t.trayBg,
    auctionBg: r("auctionColor") ?? t.auctionBg,
    cardBack: r("cardBackColor") ?? t.cardBack
  };
}
function Ye(e) {
  const n = B.indexOf(e);
  return B[(n + 1) % B.length] ?? f.skin;
}
function Ke(e) {
  return (v[e] ?? v[f.skin]).label;
}
function se(e) {
  const n = e && typeof e == "object" ? e : {}, t = {};
  for (const r of oe) {
    const c = n[r];
    typeof c == "string" && c.trim() !== "" && (t[r] = c);
  }
  return t;
}
function ie(e) {
  const { min: n, max: t, step: r, default: c } = w.spread;
  if (typeof e != "number" || !Number.isFinite(e)) return c;
  const o = Math.min(t, Math.max(n, e)), a = n + Math.round((o - n) / r) * r;
  return Math.min(t, Math.max(n, a));
}
function le(e) {
  const { min: n, max: t } = w.radius;
  return typeof e != "number" || !Number.isFinite(e) ? f.fanRadius : e === 0 ? 0 : Math.min(t, Math.max(n, Math.round(e)));
}
function D(e) {
  const n = e && typeof e == "object" ? e : {};
  return {
    skin: ce(n.skin) ? n.skin : f.skin,
    handLayout: n.handLayout === "fan" || n.handLayout === "row" ? n.handLayout : f.handLayout,
    bidPad: n.bidPad === "columns" || n.bidPad === "grid" ? n.bidPad : f.bidPad,
    centreFrame: typeof n.centreFrame == "boolean" ? n.centreFrame : f.centreFrame,
    fanSpread: ie(n.fanSpread),
    fanRadius: le(n.fanRadius),
    overrides: se(n.overrides)
  };
}
function Ue(e) {
  const n = ae[e];
  return D(n ? { ...f, ...n.appearance } : f);
}
class Ve {
  constructor(n = { entries: {} }) {
    this.data = n;
  }
  persist() {
  }
  async getForUser(n) {
    return this.data.entries[n] ?? null;
  }
  async putForUser(n, t) {
    this.data.entries[n] = t, this.persist();
  }
}
function ze(e) {
  if (e.length > 0 && e.every((a) => typeof a.rank == "number")) return e.map((a) => ({ ...a, rank: a.rank }));
  const t = e.map((a, s) => ({ r: a, i: s }));
  t.sort((a, s) => {
    const i = typeof a.r.value == "number" ? a.r.value : Number.NEGATIVE_INFINITY, d = typeof s.r.value == "number" ? s.r.value : Number.NEGATIVE_INFINITY;
    return d === i ? a.i - s.i : d - i;
  });
  let r = 0, c = 0, o = null;
  return t.map(({ r: a }) => {
    c += 1;
    const s = typeof a.value == "number" ? a.value : Number.NEGATIVE_INFINITY;
    return (o === null || s !== o) && (r = c, o = s), { ...a, rank: r };
  });
}
function ue(e) {
  if (!e) return Number.NaN;
  if (typeof e.value == "number" && Number.isFinite(e.value)) return e.value;
  const n = (e.text ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!n) return Number.NaN;
  const t = Number(n.replace(/^\+/, ""));
  return Number.isFinite(t) ? t : Number.NaN;
}
function Je(e) {
  const n = e.map(ue);
  let t = Number.NEGATIVE_INFINITY;
  for (const r of n) Number.isFinite(r) && r > t && (t = r);
  return Number.isFinite(t) ? n.map((r) => Number.isFinite(r) && r === t) : n.map(() => !1);
}
const de = { active: !1, picks: [] };
function je(e, n) {
  switch (n.type) {
    case "start":
      return { active: !0, picks: [] };
    case "cancel":
      return de;
    case "pick": {
      if (!e.active) return e;
      const { boardNo: t, key: r } = n;
      if (e.picks.some((a) => a.boardNo === t && a.key === r))
        return {
          active: !0,
          picks: e.picks.filter((a) => !(a.boardNo === t && a.key === r))
        };
      const o = e.picks[0];
      return o && o.boardNo !== t || e.picks.length >= 2 ? e : { active: !0, picks: [...e.picks, { boardNo: t, key: r }] };
    }
    default:
      return e;
  }
}
function Qe(e) {
  const [n, t] = e.picks;
  return !n || !t ? null : { boardNo: n.boardNo, a: n.key, b: t.key };
}
function qe(e, n) {
  const t = e.picks[0];
  return e.active && !!t && t.boardNo !== n;
}
function Ze(e, n, t) {
  return e.picks.some((r) => r.boardNo === n && r.key === t);
}
function en({
  challengeId: e,
  boardsLeft: n,
  boardsTotal: t
}) {
  const r = `/bridge/challenges/${encodeURIComponent(e)}`;
  return n <= 0 ? {
    label: "See your results",
    href: `${r}/results`,
    note: `All ${t} boards played`
  } : {
    label: "Next board",
    href: `${r}/play`,
    note: n === 1 ? "1 board left" : `${n} boards left`
  };
}
const fe = "#cc0000", nn = "#fecd07", tn = "#d3d3d3", rn = "#f2e2b8", an = "#b8901f", on = "#12525e", be = { S: "♠", H: "♥", C: "♣", D: "♦", N: "NT" }, cn = ["C", "D", "H", "S", "N"], sn = ["W", "N", "E", "S"], ln = ["S", "H", "C", "D"], un = { N: "S", S: "N", E: "W", W: "E" }, pe = (e) => e === "H" || e === "D", dn = (e) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[e] ?? String(e), ge = (e) => /^[1-7][CDHSN]$/.test(e), fn = (e) => e === "P" ? "Pass" : e === "X" ? "X" : e === "XX" ? "XX" : `${e[0]}${be[e[1] ?? ""] ?? ""}`, bn = (e) => ge(e) && pe(e[1] ?? "") ? fe : "#000", pn = "#0d707c", me = "#1c8a5a", Ne = "#c0392b", he = "#8b9a93", gn = "#55636f", mn = "#17211d", Nn = "#22302a", hn = "#8b9a93", kn = "#9aa8a1", yn = "#eef2ef", Sn = "#0e1a1c", En = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", Bn = "✕", vn = "◆", Tn = "⇄", Rn = "–", Cn = "—", An = "→", In = "·";
function Ln(e) {
  return e === "pos" ? me : e === "neg" ? Ne : he;
}
function Pn(e) {
  return e == null || !Number.isFinite(e) ? "neutral" : e > 0 ? "pos" : e < 0 ? "neg" : "neutral";
}
export {
  M as CATEGORIES,
  pn as CHALLENGE_ACCENT,
  de as COMPARE_IDLE,
  an as DEALER_RING,
  rn as DEALER_TINT,
  f as DEFAULT_APPEARANCE,
  ln as DISPLAY,
  w as FAN_LIMITS,
  be as GLYPH,
  An as GLYPH_ARROW,
  Bn as GLYPH_CLOSE,
  Tn as GLYPH_COMPARE,
  vn as GLYPH_EDITOR,
  Cn as GLYPH_EMDASH,
  Rn as GLYPH_ENDASH,
  nn as GOLD,
  tn as GREY,
  yn as HAIRLINE,
  mn as INK,
  kn as INK_FAINT,
  hn as INK_MUTED,
  Nn as INK_STRONG,
  Ve as InMemoryTableConfigStore,
  In as MIDDOT,
  Ne as NEG,
  he as NEU,
  sn as ORDER,
  Me as OVERRIDE_OPTIONS,
  un as PARTNER,
  me as POS,
  ae as PRESETS,
  ke as RANKS,
  fe as RED,
  L as SEATS,
  on as SEAT_BADGE,
  Be as SEAT_LABEL,
  B as SKIN_ORDER,
  gn as SLATE,
  cn as STRAINS,
  Ge as STRAIN_TINT,
  Sn as STRIP_BG,
  C as SUITS,
  A as SUIT_RANK,
  v as TABLE_SKINS,
  En as UI_FONT,
  ve as VUL_LABEL,
  J as applyEvent,
  Ue as applyPreset,
  K as auctionComplete,
  bn as callColor,
  Te as callLabel,
  fn as callText,
  I as cardId,
  Qe as comparePair,
  Ze as comparePicked,
  je as compareReduce,
  qe as compareRowInert,
  Ce as contractLabel,
  P as contractRank,
  Pe as createBus,
  Fe as createEventLog,
  ue as displayedValue,
  U as finalContract,
  De as hcp,
  V as initialState,
  Ie as isActionEvent,
  Oe as isBalanced,
  ge as isBid,
  N as isContractBid,
  Le as isLogicEvent,
  ye as isMajor,
  Se as isMinor,
  pe as isRed,
  Re as isRedStrain,
  G as isVulnerable,
  Je as leaderFlags,
  _e as legalCalls,
  xe as legalPlays,
  He as longestSuits,
  Ae as mulberry32,
  m as nextSeat,
  Ye as nextSkin,
  D as normalizeAppearance,
  en as onwardFromBoard,
  $ as partnerOf,
  Ee as rankLabel,
  ze as rankRows,
  dn as rankText,
  Xe as reconstruct,
  We as resolveSkin,
  $e as resultLabel,
  O as sameSide,
  we as scoreBoard,
  Y as shape,
  X as sideOf,
  Ke as skinLabel,
  _ as suitCounts,
  Ln as toneColor,
  Pn as toneOf,
  z as trickWinner
};
//# sourceMappingURL=table-kernel.js.map
