"use client";

// The studio's front-door FORM (curated v2; boss direction 2026-08-18: reuse
// the library's board-creation screen). The children are the SAME <DealEditor>
// the library's "New board" page mounts — its LIN/PBN prefill, seat tiles,
// card grid and "give the rest to…" — plus <CuratedExtras> in its footer slot.
//
// This wrapper owns the submit: instead of the library's server action it
// reads the editor's own form contract (`hand:{seat}` serialized hands, name,
// dealer, vul, notes) plus the extras, opens the authoring session, stashes
// the board settings for the studio rail, and walks into the table. The
// deletion of a duplicate picker is the point — one board editor, everywhere.

import { useState, type ReactNode } from "react";

import type { Card, Seat, Vul } from "@bridge/events";

import { parseKItemIds, parseKTags } from "@/lib/coach/kItems";
import type { CuratedConstraint } from "@/lib/curated";
import { handFromSerialized } from "@/lib/dealText";

import { CURATE_SETTINGS_KEY, type CuratedBoardSettings } from "./curateSettings";
import { LessonField } from "./LessonField";

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

export function CurateBoardForm({
  tableBase,
  children,
}: Readonly<{ tableBase: string; children: ReactNode }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);

    // The editor's contract, re-parsed exactly as the library action parses it.
    const hands = {} as Record<Seat, Card[]>;
    for (const seat of SEATS) {
      const parsed = handFromSerialized(String(fd.get(`hand:${seat}`) ?? ""));
      if ("error" in parsed) {
        setError(`${SEAT_NAME[seat]}'s hand: ${parsed.error}`);
        return;
      }
      hands[seat] = parsed;
    }

    // The learner's chair decides which two hands the coach plays in the studio
    // (owner direction 2026-08-19) — so it travels with the CREATE, stamped on
    // the record, not only in the sessionStorage the rail reads.
    const learnerSeat = SEATS.includes(fd.get("learnerSeat") as Seat)
      ? (fd.get("learnerSeat") as Seat)
      : "S";

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bridge/curated/author", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hands,
          dealer: String(fd.get("dealer") ?? "N"),
          vul: String(fd.get("vul") ?? "none") as Vul,
          name: String(fd.get("name") ?? "").trim() || undefined,
          learnerSeat,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { sessionId?: string; error?: string };
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? "Couldn't open the studio — try again.");
        setBusy(false);
        return;
      }
      const settings: CuratedBoardSettings = {
        learnerSeat,
        constraint: (["locked", "guided", "free"].includes(String(fd.get("constraint")))
          ? String(fd.get("constraint"))
          : "guided") as CuratedConstraint,
        intro: String(fd.get("intro") ?? "").trim(),
        debrief: String(fd.get("debrief") ?? "").trim(),
        pin: String(fd.get("pin") ?? "").trim(),
        notes: String(fd.get("notes") ?? "").trim(),
        // Through the registry's own door, so a stale value can never reach
        // storage as a tag or a card nothing recognizes.
        kTags: parseKTags(fd.getAll("kTag")),
        kItems: parseKItemIds(fd.getAll("kItem")),
      };
      try {
        sessionStorage.setItem(CURATE_SETTINGS_KEY(data.sessionId), JSON.stringify(settings));
      } catch {
        // Storage refused (private mode) — the rail falls back to its
        // defaults; everything here is editable again at publish.
      }
      window.location.assign(`${tableBase}${data.sessionId}?author=1`);
    } catch {
      setError("Couldn't open the studio — try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      {/* One submission at a time — the fieldset stills every control while
          the studio opens, including the editor's own submit button. */}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
      </fieldset>
      {busy && (
        <p className="mt-2 text-sm font-semibold text-emerald-900">Opening the studio…</p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}

/** The curated-only fields, rendered through DealEditor's `footer` slot —
 *  plain form controls, read by the wrapper above off the one FormData. */
export function CuratedExtras({ app = false }: Readonly<{ app?: boolean }>) {
  const input = app
    ? "w-full rounded-[10px] border border-[#d3ccbb] bg-white px-3 py-2 text-sm"
    : "w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";
  const caption = "mb-1 block text-xs text-neutral-500";

  return (
    <div
      className={
        app
          ? "space-y-3 rounded-xl border border-[#e0d7c2] bg-[#fffdf6] p-3"
          : "space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      }
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#541015]">
        The learner&rsquo;s experience
      </p>

      {/* WHAT THIS BOARD TEACHES (owner direction 2026-08-18; the CARDS
          themselves, filtered by tag, 2026-08-19). The coach picks the K items
          the learner's Know panel leads with, so the flip cards become a
          curriculum decision card by card instead of whatever the position
          happens to yield. The tag chips above the list are the filter that
          makes 49 cards choosable — and, because a topic is also the lesson's
          name, they ride along with the board. Nothing chosen at all = no
          lesson, and the panel stays exactly as it is on an ordinary board.

          PLAIN BUTTONS AND HIDDEN INPUTS, NOT CHECKBOX LABELS (bug report
          2026-08-18: tapping a chip in the app broke the screen) — the rule
          the picker itself keeps; see LessonPicker.tsx for why. */}
      <fieldset>
        <legend className={caption}>
          What this board teaches{" "}
          <span className="text-neutral-400">(optional)</span>
        </legend>
        <LessonField skin={app ? "app" : "web"} />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className={caption}>The learner sits</span>
          <select name="learnerSeat" defaultValue="S" className={input}>
            <option value="S">South</option>
            <option value="N">North</option>
            <option value="E">East</option>
            <option value="W">West</option>
          </select>
          <span className="mt-1 block text-xs text-neutral-500">
            The table seats them at the bottom of the screen wherever you put them, with
            their partner opposite.
          </span>
        </label>
      </div>

      <fieldset>
        <legend className={caption}>How tightly they&rsquo;re held</legend>
        <div className="space-y-1.5">
          {(
            [
              ["locked", "Locked", "Only your line plays — a wrong move never leaves their hand; your why appears, and hints open after two tries."],
              ["guided", "Guided", "They can stray — the robots hold, and your nudge offers the take-back with your reason."],
              ["free", "Free", "No interruptions. Your notes, hints and pin stay in the panel for whenever they ask."],
            ] as const
          ).map(([value, label, note]) => (
            <label
              key={value}
              className={
                app
                  ? "flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[#e0d7c2] bg-white px-3 py-2 has-[:checked]:border-[#105431] has-[:checked]:bg-[#f0f7f2]"
                  : "flex cursor-pointer items-start gap-2.5 rounded border border-neutral-200 bg-white px-3 py-2 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50"
              }
            >
              <input
                type="radio"
                name="constraint"
                value={value}
                defaultChecked={value === "guided"}
                className="mt-0.5 accent-emerald-800"
              />
              <span className="min-w-0 text-sm">
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs leading-relaxed text-neutral-500">{note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className={caption}>Before they play (intro)</span>
        <textarea
          name="intro"
          rows={2}
          maxLength={500}
          placeholder="Your framing, shown before their first decision."
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className={caption}>When the board ends (debrief)</span>
        <textarea
          name="debrief"
          rows={2}
          maxLength={500}
          placeholder="Your closing words, shown when the board completes."
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className={caption}>Pinned read (rides the Know pane)</span>
        <input
          name="pin"
          maxLength={220}
          placeholder='e.g. "West is the danger hand."'
          className={input}
        />
      </label>
    </div>
  );
}
