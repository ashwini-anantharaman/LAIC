// BBO Hand Viewer URLs -> LIN.
//
// A handviewer link carries its deal in one of two shapes, and this module
// turns either into the LIN string `parseLin` already reads:
//
//   ?lin=pn|...|md|3S...|sv|o|      the share link BBO's own "copy" produces
//   ?s=SAK..&w=..&n=..&e=..&d=n&v=o&b=3    the per-hand parameter form
//
// The second shape is NOT guesswork. BBO's handviewer.js builds a LIN string
// out of those parameters itself, and this mirrors that code exactly:
//
//   var hands = new Array(pSouth, pWest, pNorth, pEast);
//   var dealer = interpretSeatString(pDealer) + 1;   // seats = S,W,N,E
//   if (dealer <= 0) dealer = 3;                     // default: North
//   var md = 'md|' + dealer + pSouth + ',' + pWest + ',' + pNorth + ',' + pEast + '|';
//   var sv = 'sv|' + pVul + '|';
//   if (board > 0) ah = 'ah|Board ' + board + '|';
//
// so the seat order, the dealer digits and the vulnerability letters are BBO's
// own, not a reading of them. `v` is passed straight through to `sv`, which is
// why nothing here interprets it: parseLin already speaks that vocabulary.
//
// What is deliberately NOT supported: `linurl`, `myhand` and `linlocal`, which
// name a LIN file to FETCH rather than carrying the deal. Following a URL out
// of a pasted link is a request the server should never make on a user's say-so,
// so those get an honest error naming the file to open and paste instead.

import { parseLin, type LinParseResult } from "./lin";

export type BboLinResult = { ok: true; lin: string } | { ok: false; error: string };

/** BBO's seat order — `interpretSeatString` matches on the first letter. */
const SEAT_DIGITS = "SWNE";
/** handviewer.js: `if (dealer <= 0) dealer = 3` — an unnamed dealer is North. */
const DEALER_DEFAULT = 3;

/** The LIN dealer digit for a `d=` value: S=1, W=2, N=3, E=4. */
function dealerDigit(raw: string): number {
  const first = raw.trim().charAt(0).toUpperCase();
  // `interpretSeatString` bails on an empty direction before it matches
  // anything; indexOf("") would happily answer 0 and deal it to South.
  if (!first) return DEALER_DEFAULT;
  const index = SEAT_DIGITS.indexOf(first);
  return index < 0 ? DEALER_DEFAULT : index + 1;
}

/** Percent-decode once more when a link was encoded twice on its way here. */
function safeDecode(value: string): string {
  if (!/%[0-9a-f]{2}/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function urlOf(text: string): URL | null {
  const trimmed = text.trim();
  if (!/^(https?:)?\/\//i.test(trimmed) && !/^www\./i.test(trimmed)) return null;
  try {
    return new URL(trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed);
  } catch {
    return null;
  }
}

/** The per-hand parameter form, assembled the way handviewer.js assembles it. */
function linFromParams(url: URL): string | null {
  const get = (key: string) => (url.searchParams.get(key) ?? "").trim();
  const south = get("s");
  const west = get("w");
  const north = get("n");
  const east = get("e");
  if (!south && !west && !north && !east) return null;

  const md = `md|${dealerDigit(get("d"))}${south},${west},${north},${east}|`;
  const sv = `sv|${get("v")}|`;
  const board = Number.parseInt(get("b"), 10);
  const ah = board > 0 ? `ah|Board ${board}|` : "";
  return `${md}${sv}${ah}`;
}

/**
 * The LIN behind a BBO Hand Viewer link — or behind a LIN string pasted
 * straight in, so one field takes either.
 */
export function linFromBbo(input: string): BboLinResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste a BBO hand link first." };

  const url = urlOf(text);
  if (!url) {
    // Not a link: a raw LIN string is the other thing people have to hand.
    if (text.includes("md|")) return { ok: true, lin: text };
    return {
      ok: false,
      error:
        "That is neither a BBO hand link nor a LIN string. Copy the link from the Hand Viewer’s address bar.",
    };
  }

  for (const remote of ["linurl", "myhand", "linlocal"]) {
    if (url.searchParams.get(remote)) {
      return {
        ok: false,
        error: `This link points at a LIN file (${remote}) rather than carrying the deal. Open it and paste the LIN itself.`,
      };
    }
  }

  const lin = url.searchParams.get("lin");
  if (lin) {
    const decoded = safeDecode(lin);
    if (!decoded.includes("md|"))
      return { ok: false, error: "That link’s lin= has no deal in it (no “md|” tag)." };
    return { ok: true, lin: decoded };
  }

  const fromParams = linFromParams(url);
  if (fromParams) return { ok: true, lin: fromParams };

  return {
    ok: false,
    error:
      "No deal in that link — a Hand Viewer URL carries one in lin=, or in n/e/s/w hand parameters.",
  };
}

/** A BBO link (or LIN string) straight to parsed boards. */
export function parseBbo(input: string): LinParseResult {
  const lin = linFromBbo(input);
  if (!lin.ok) return { ok: false, error: lin.error };
  return parseLin(lin.lin);
}
