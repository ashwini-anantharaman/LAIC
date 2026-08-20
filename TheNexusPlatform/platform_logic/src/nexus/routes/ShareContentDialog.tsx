/**
 * "Who can see this?" — the sharing dialog for one folder, one item, or a selection.
 *
 * A club is a row you can tick on its own, and it expands to the people inside it.
 * Ticking the club shares with the club; ticking a person shares with that person
 * by name. They are separate grants, deliberately: someone can lose their club
 * membership and keep a share made to them directly, and a club share must not
 * quietly enumerate into a list of individuals that stops tracking the club.
 *
 * MIXED STATE IS REAL AND IS SHOWN. A selection of twelve items where nine are
 * shared with a club is neither on nor off, and rendering it as either would be a
 * lie that the Save button then makes true. Those boxes show a dash, and the
 * footer says what saving will do.
 *
 * Saving writes the WHOLE set (see setContentShares), so the dialog refuses to
 * open in a state it could not read — a failed load followed by a save would be a
 * silent revoke-everything.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Loader2, Users, User } from "lucide-react";
import { toast } from "sonner";

import {
  listShareableClubs,
  setContentShares,
  type LibraryObject,
  type ShareableClub,
} from "@/services/api";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { cn } from "@/app/components/ui/utils";

/** on | off | some — "some" only ever arises across a multi-item selection. */
type Tri = "on" | "off" | "some";

function triFor(objects: LibraryObject[], pick: (o: LibraryObject) => string[], id: string): Tri {
  if (!objects.length) return "off";
  const n = objects.filter((o) => pick(o).includes(id)).length;
  return n === 0 ? "off" : n === objects.length ? "on" : "some";
}

export function ShareContentDialog({
  programId,
  objects,
  label,
  onClose,
  onSaved,
}: {
  programId: string;
  /** The items being shared — one, a folder's worth, or a whole selection. */
  objects: LibraryObject[];
  /** What the person thinks they are sharing ("Opening Bids", "4 folders"). */
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clubs, setClubs] = useState<ShareableClub[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // What the dialog opened with, so an untouched row can keep its mixed state
  // instead of being flattened by a save the person did not intend.
  const initialClubs = useMemo(() => new Map<string, Tri>(), []);
  const initialPeople = useMemo(() => new Map<string, Tri>(), []);
  const [clubState, setClubState] = useState<Map<string, Tri>>(new Map());
  const [peopleState, setPeopleState] = useState<Map<string, Tri>>(new Map());

  useEffect(() => {
    let live = true;
    listShareableClubs(programId)
      .then((cs) => {
        if (!live) return;
        setClubs(cs);
        const c = new Map<string, Tri>();
        const p = new Map<string, Tri>();
        for (const club of cs) {
          const t = triFor(objects, (o) => o.clubs, club.id);
          c.set(club.id, t);
          initialClubs.set(club.id, t);
          for (const m of club.members) {
            const mt = triFor(objects, (o) => o.people, m.profile_id);
            p.set(m.profile_id, mt);
            initialPeople.set(m.profile_id, mt);
          }
        }
        setClubState(c);
        setPeopleState(p);
      })
      .catch((e) =>
        live && setLoadError(e instanceof Error ? e.message : "Couldn't load this program's clubs"),
      );
    return () => {
      live = false;
    };
  }, [programId, objects, initialClubs, initialPeople]);

  const toggle = (m: Map<string, Tri>, set: (n: Map<string, Tri>) => void, id: string) => {
    const next = new Map(m);
    // A mixed row resolves to ON — "share it with everyone selected" is what
    // clicking a dash means; clearing is the second click.
    next.set(id, m.get(id) === "on" ? "off" : "on");
    set(next);
  };

  const dirty =
    clubs !== null &&
    ([...clubState].some(([k, v]) => initialClubs.get(k) !== v) ||
      [...peopleState].some(([k, v]) => initialPeople.get(k) !== v));

  // Rows still reading "some" were never touched, and a whole-set save would
  // flatten them. Keep them by writing them ON only where they already were.
  const untouchedMixed =
    [...clubState].filter(([k, v]) => v === "some" && initialClubs.get(k) === "some").length +
    [...peopleState].filter(([k, v]) => v === "some" && initialPeople.get(k) === "some").length;

  async function save() {
    setSaving(true);
    try {
      const clubIds = [...clubState].filter(([, v]) => v === "on").map(([k]) => k);
      const personIds = [...peopleState].filter(([, v]) => v === "on").map(([k]) => k);
      const res = await setContentShares(
        programId, objects.map((o) => o.id), clubIds, personIds,
      );
      toast.success(
        res.skipped?.length
          ? `Shared ${res.shared} — ${res.skipped.length} couldn't be updated`
          : `Sharing updated for ${res.shared} ${res.shared === 1 ? "item" : "items"}`,
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update sharing");
    } finally {
      setSaving(false);
    }
  }

  /**
   * A tri-state box, local to this dialog.
   *
   * The shared Checkbox renders a tick for `indeterminate` as well as for
   * `checked`, so "some of the selection" would be indistinguishable from "all of
   * it" — precisely the distinction this screen exists to show. A dash is the
   * whole point, so the box is drawn here rather than by widening a component the
   * rest of the console depends on.
   */
  const Box = ({ state }: { state: Tri }) => (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
        state === "off" ? "border-input bg-input-background dark:bg-input/30" : "border-primary bg-primary text-primary-foreground",
      )}
    >
      {state === "on" && <Check className="size-3.5" />}
      {state === "some" && <span className="h-0.5 w-2 rounded-full bg-current" />}
    </span>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{label}&rdquo;</DialogTitle>
          <DialogDescription>
            {objects.length === 1
              ? "Choose the clubs and people who can see this."
              : `Choose the clubs and people who can see these ${objects.length} items.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] min-h-[120px] overflow-y-auto">
          {loadError ? (
            <p className="px-1 py-6 text-center text-sm text-destructive">{loadError}</p>
          ) : clubs === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading clubs…
            </div>
          ) : clubs.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              This program has no clubs yet. Add one on the Partners tab.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {clubs.map((club) => {
                const open = expanded.has(club.id);
                return (
                  <div key={club.id}>
                    <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/50">
                      <button
                        type="button"
                        aria-label={open ? "Hide members" : "Show members"}
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            n.has(club.id) ? n.delete(club.id) : n.add(club.id);
                            return n;
                          })
                        }
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        disabled={club.members.length === 0}
                      >
                        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(clubState, setClubState, club.id)}
                        aria-pressed={clubState.get(club.id) === "on"}
                        className="flex flex-1 items-center gap-2.5 text-left"
                      >
                        <Box state={clubState.get(club.id) ?? "off"} />
                        <Users className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{club.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {club.members.length} {club.members.length === 1 ? "member" : "members"}
                        </span>
                      </button>
                    </div>

                    {open &&
                      club.members.map((m) => (
                        <button
                          key={m.profile_id}
                          type="button"
                          onClick={() => toggle(peopleState, setPeopleState, m.profile_id)}
                          aria-pressed={peopleState.get(m.profile_id) === "on"}
                          className="ml-8 flex w-[calc(100%-2rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
                        >
                          <Box state={peopleState.get(m.profile_id) ?? "off"} />
                          <User className="size-3.5 text-muted-foreground" />
                          <span className="truncate text-sm">{m.display_name}</span>
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* The two things a whole-set save can surprise someone with. */}
        <div className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <p>
            Sharing adds access. A club that already sees this content — because it authored it, or
            because it comes from this program — keeps it whether or not it is ticked.
          </p>
          {untouchedMixed > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              {untouchedMixed} {untouchedMixed === 1 ? "row applies" : "rows apply"} to only some of
              the selection. Saving will clear those unless you tick them.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || clubs === null || !dirty}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
