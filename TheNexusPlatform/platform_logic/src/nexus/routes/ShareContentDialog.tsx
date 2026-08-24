/**
 * "Who can see this?" — the sharing dialog for one folder, one item, or a selection.
 *
 * THREE KINDS OF RECIPIENT, and each is really a person or group of people:
 *
 *   an APP    → its administrators, who then decide what goes on the app
 *   a CLUB    → its administrators, who then decide what the club sees
 *   a PERSON  → them, by name
 *
 * Nobody "is" an app or a club, so granting to one is granting to whoever runs it.
 * That indirection is the feature: a content manager hands over a catalogue and
 * the decision about what to do with it, rather than making both decisions.
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
import { Check, ChevronRight, Loader2, Smartphone, Users, User } from "lucide-react";
import { toast } from "sonner";

import {
  listShareTargets,
  type ShareableCoach,
  setContentShares,
  setFolderShares,
  type FolderAccessLevel,
  type ClubMember,
  type LibraryObject,
  type ShareableClub,
} from "@/services/api";
import { CONTENT_APP_TARGETS } from "@/types/platform";
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

/**
 * Review or Edit, for one person on one folder.
 *
 * Two words rather than a checkbox labelled "can edit", because the weaker
 * option needs a name too: a reviewer is not "someone with edit off", they are
 * someone who can open the whole pipeline and read it. Nothing on screen should
 * make read access look like an absence.
 */
function LevelPicker({
  value,
  onChange,
}: {
  value: FolderAccessLevel;
  onChange: (l: FolderAccessLevel) => void;
}) {
  return (
    <span className="flex shrink-0 rounded-md border p-0.5" role="group" aria-label="Access level">
      {(["view", "edit"] as FolderAccessLevel[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          title={
            l === "view"
              ? "Review: open the content and read its whole pipeline"
              : "Edit: change the content and its pipeline"
          }
          onClick={() => onChange(l)}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
            value === l
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l === "view" ? "Review" : "Edit"}
        </button>
      ))}
    </span>
  );
}

export function ShareContentDialog({
  programId,
  objects,
  folder,
  label,
  canShareClubs = true,
  canShareMembers = true,
  canShareApps = true,
  onClose,
  onSaved,
}: {
  programId: string;
  /** The items being shared — one, a folder's worth, or a whole selection. */
  objects: LibraryObject[];
  /**
   * Set to share THE FOLDER ITSELF rather than the items in it.
   *
   * The two are genuinely different promises. Sharing a folder's current contents
   * names the items that happen to be in it today; sharing the folder means it and
   * everything inside, now and later — so content added tomorrow is covered
   * without anyone revisiting this dialog. That is what "give these three people
   * the B2F3 folder" is asking for, and per-item grants cannot express it.
   *
   * Every box reads on or off, never "some": one folder has one answer.
   */
  folder?: {
    id: string;
    name: string;
    clubs: string[];
    people: string[];
    granted_apps: string[];
    /** profile id -> level, so reopening shows what was chosen. */
    levels?: Record<string, FolderAccessLevel>;
  };
  /** What the person thinks they are sharing ("Opening Bids", "4 folders"). */
  label: string;
  /**
   * learning.library.share_club / share_app.
   *
   * A SECTION THE VIEWER CANNOT WRITE IS NOT SHOWN, not shown-and-disabled. The
   * server checks each kind separately, so a role holding only share_club that
   * touched an app row had its whole save refused — losing the club changes it
   * was actually allowed to make. An absent section cannot do that.
   */
  canShareClubs?: boolean;
  /** learning.library.share_member — named people, club or no club. Separate from
   *  share_club because "a whole club" and "one person" are different reach. */
  canShareMembers?: boolean;
  canShareApps?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clubs, setClubs] = useState<ShareableClub[] | null>(null);
  /** People in the program who are in no club — reachable only through this list. */
  const [loners, setLoners] = useState<ClubMember[]>([]);
  /**
   * Coaches, with their learners.
   *
   * A grouping, not a role: somebody is a coach here exactly when learners are
   * assigned to them. Ticking a COACH grants the coach; their learners are listed
   * beneath and tick individually, the same as club members -- so "give this to
   * Milind" and "give this to Milind's fifteen learners" stay separate decisions
   * rather than one implying the other.
   */
  const [coaches, setCoaches] = useState<ShareableCoach[]>([]);
  const [openCoach, setOpenCoach] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // What the dialog opened with, so an untouched row can keep its mixed state
  // instead of being flattened by a save the person did not intend.
  const initialClubs = useMemo(() => new Map<string, Tri>(), []);
  const initialPeople = useMemo(() => new Map<string, Tri>(), []);
  const [clubState, setClubState] = useState<Map<string, Tri>>(new Map());
  const [peopleState, setPeopleState] = useState<Map<string, Tri>>(new Map());
  const initialApps = useMemo(() => new Map<string, Tri>(), []);
  const [appState, setAppState] = useState<Map<string, Tri>>(new Map());
  /**
   * What each ticked person may DO in this folder — review or edit.
   *
   * Folder shares only. A per-object share has no level to carry: the level lives
   * on the folder grant, which is the thing that keeps applying to content added
   * later. Seeded from the folder's stored levels so reopening the dialog shows
   * what was chosen rather than resetting everyone to review.
   */
  const [levels, setLevels] = useState<Map<string, FolderAccessLevel>>(
    () => new Map(Object.entries(folder?.levels ?? {}) as [string, FolderAccessLevel][]),
  );
  const initialLevels = useMemo(
    () => new Map(Object.entries(folder?.levels ?? {}) as [string, FolderAccessLevel][]),
    [folder],
  );
  const levelOf = (id: string): FolderAccessLevel => levels.get(id) ?? "view";
  const setLevel = (id: string, l: FolderAccessLevel) =>
    setLevels((m) => new Map(m).set(id, l));

  useEffect(() => {
    let live = true;
    listShareTargets(programId)
      .then(({ clubs: cs, coaches: co, programMembers }) => {
        if (!live) return;
        setClubs(cs);
        setCoaches(co);
        // Shown under "Program members": whoever is not already listed inside a
        // club, so the two sections never repeat a person.
        const inClubs = new Set(cs.flatMap((c) => c.members.map((m) => m.profile_id)));
        const alone = programMembers.filter((m) => !inClubs.has(m.profile_id));
        setLoners(alone);
        // A folder answers for itself; a selection of objects answers per object
        // and can therefore be mixed.
        const triClub = (id: string): Tri =>
          folder ? (folder.clubs.includes(id) ? "on" : "off") : triFor(objects, (o) => o.clubs, id);
        const triPerson = (id: string): Tri =>
          folder ? (folder.people.includes(id) ? "on" : "off") : triFor(objects, (o) => o.people, id);
        const triApp = (id: string): Tri =>
          folder
            ? (folder.granted_apps.includes(id) ? "on" : "off")
            : triFor(objects, (o) => o.granted_apps, id);

        const c = new Map<string, Tri>();
        const p = new Map<string, Tri>();
        for (const club of cs) {
          const t = triClub(club.id);
          c.set(club.id, t);
          initialClubs.set(club.id, t);
          for (const m of club.members) {
            const mt = triPerson(m.profile_id);
            p.set(m.profile_id, mt);
            initialPeople.set(m.profile_id, mt);
          }
        }
        // Seed the unaffiliated people too, or their boxes would read "off" for
        // someone who already holds a grant.
        for (const m of alone) {
          const mt = triPerson(m.profile_id);
          p.set(m.profile_id, mt);
          initialPeople.set(m.profile_id, mt);
        }
        setClubState(c);
        setPeopleState(p);
        const ap = new Map<string, Tri>();
        for (const app of CONTENT_APP_TARGETS) {
          const t = triApp(app.key);
          ap.set(app.key, t);
          initialApps.set(app.key, t);
        }
        setAppState(ap);
      })
      .catch((e) =>
        live && setLoadError(e instanceof Error ? e.message : "Couldn't load this program's clubs"),
      );
    return () => {
      live = false;
    };
  }, [programId, objects, folder, initialClubs, initialPeople, initialApps]);

  const toggle = (m: Map<string, Tri>, set: (n: Map<string, Tri>) => void, id: string) => {
    const next = new Map(m);
    // A mixed row resolves to ON — "share it with everyone selected" is what
    // clicking a dash means; clearing is the second click.
    next.set(id, m.get(id) === "on" ? "off" : "on");
    set(next);
  };

  const dirty =
    clubs !== null &&
    ((canShareClubs && [...clubState].some(([k, v]) => initialClubs.get(k) !== v)) ||
      (canShareMembers && [...peopleState].some(([k, v]) => initialPeople.get(k) !== v)) ||
      (canShareApps && [...appState].some(([k, v]) => initialApps.get(k) !== v)) ||
      // Changing somebody from review to edit is a change, even when the same
      // people stay ticked. Without this the Save button stayed dead on the one
      // edit this dialog exists to make.
      (!!folder &&
        canShareMembers &&
        [...peopleState]
          .filter(([, v]) => v === "on")
          .some(([k]) => (initialLevels.get(k) ?? "view") !== levelOf(k))));

  // Rows still reading "some" were never touched, and a whole-set save would
  // flatten them. Keep them by writing them ON only where they already were.
  const untouchedMixed =
    [...clubState].filter(([k, v]) => v === "some" && initialClubs.get(k) === "some").length +
    [...peopleState].filter(([k, v]) => v === "some" && initialPeople.get(k) === "some").length +
    [...appState].filter(([k, v]) => v === "some" && initialApps.get(k) === "some").length;

  async function save() {
    setSaving(true);
    try {
      // Send only the kinds this viewer may set. Sending an unchanged app list
      // they cannot write would still trip the server's per-kind check, turning a
      // legitimate club change into a 403.
      // UNDEFINED, not empty. A kind this viewer cannot write is omitted from the
      // request entirely, so the server leaves it alone. Sending [] would revoke
      // it — which for a club-only role means wiping the content manager's app
      // grants as a side effect of ticking a club.
      const clubIds = canShareClubs
        ? [...clubState].filter(([, v]) => v === "on").map(([k]) => k)
        : undefined;
      const personIds = canShareMembers
        ? [...peopleState].filter(([, v]) => v === "on").map(([k]) => k)
        : undefined;
      const appIds = canShareApps
        ? [...appState].filter(([, v]) => v === "on").map(([k]) => k)
        : undefined;
      if (folder) {
        // Only for people actually being granted — a level for somebody unticked
        // is a statement about nobody.
        const lv: Record<string, FolderAccessLevel> = {};
        for (const id of personIds ?? []) lv[id] = levelOf(id);
        await setFolderShares(programId, folder.id, clubIds, personIds, appIds, lv);
        toast.success(`\u201c${folder.name}\u201d and everything in it`);
      } else {
        const res = await setContentShares(
          programId, objects.map((o) => o.id), clubIds, personIds, appIds,
        );
        toast.success(
          res.skipped?.length
            ? `Shared ${res.shared} — ${res.skipped.length} couldn't be updated`
            : `Sharing updated for ${res.shared} ${res.shared === 1 ? "item" : "items"}`,
        );
      }
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
          <DialogTitle>
            {folder ? `Share the \u201c${folder.name}\u201d folder` : `Share \u201c${label}\u201d`}
          </DialogTitle>
          <DialogDescription>
            {/* Said plainly, because it is the part that surprises people: a
                folder share covers what is added later, and a per-item share
                does not. Someone choosing between the two needs to know that
                before they pick, not after. */}
            {folder
              ? "Whoever you choose sees this folder, its subfolders, and everything filed inside — including content added later."
              : objects.length === 1
                ? "Choose the clubs and people who can see this."
                : `Choose the clubs and people who can see these ${objects.length} items.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] min-h-[120px] overflow-y-auto">
          {/* APPS FIRST, because it is the least obvious of the three and the one
              that hands a decision to someone else. Above the clubs, not mixed in
              with them: an app is not a group of learners. */}
          {!loadError && clubs !== null && canShareApps && (
            <div className="mb-3">
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Apps
              </p>
              {CONTENT_APP_TARGETS.map((app) => (
                <button
                  key={app.key}
                  type="button"
                  aria-pressed={appState.get(app.key) === "on"}
                  onClick={() => toggle(appState, setAppState, app.key)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-accent/50"
                >
                  <Box state={appState.get(app.key) ?? "off"} />
                  <Smartphone className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{app.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    its administrators decide
                  </span>
                </button>
              ))}
            </div>
          )}

          {!loadError && clubs !== null && clubs.length > 0 && canShareApps && (
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Clubs and people
            </p>
          )}

          {loadError ? (
            <p className="px-1 py-6 text-center text-sm text-destructive">{loadError}</p>
          ) : clubs === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading clubs…
            </div>
          ) : clubs.length === 0 && loners.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              This program has no clubs or members yet. Add a club on the Partners tab.
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
                        // Nothing to expand into when this viewer cannot grant to
                        // people: the club row is the whole of their reach here.
                        disabled={club.members.length === 0 || !canShareMembers}
                      >
                        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                      </button>
                      {/* A role may be able to reach PEOPLE without reaching
                          whole clubs. Hiding the club row then would hide the
                          only grouping its members are listed under, so the row
                          stays as a heading and simply loses its checkbox. */}
                      {canShareClubs ? (
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
                      ) : (
                        <span className="flex flex-1 items-center gap-2.5">
                          <Users className="size-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{club.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {club.members.length} {club.members.length === 1 ? "member" : "members"}
                          </span>
                        </span>
                      )}
                    </div>

                    {open && canShareMembers &&
                      club.members.map((m) => (
                        <div key={m.profile_id} className="ml-8 flex w-[calc(100%-2rem)] items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggle(peopleState, setPeopleState, m.profile_id)}
                          aria-pressed={peopleState.get(m.profile_id) === "on"}
                          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
                        >
                          <Box state={peopleState.get(m.profile_id) ?? "off"} />
                          <User className="size-3.5 text-muted-foreground" />
                          <span className="truncate text-sm">{m.display_name}</span>
                        </button>
                        {folder && peopleState.get(m.profile_id) === "on" && (
                          <LevelPicker
                            value={levelOf(m.profile_id)}
                            onChange={(l) => setLevel(m.profile_id, l)}
                          />
                        )}
                        </div>
                      ))}
                  </div>
                );
              })}

              {/* COACHES. A coaching relationship is neither a club nor an
                  individual, so fifteen assigned learners had nowhere to appear
                  and "share this with Milind's learners" could not be said. */}
              {canShareMembers && coaches.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Coaches
                  </p>
                  {coaches.map((co) => {
                    const isOpen = openCoach === co.profile_id;
                    return (
                      <div key={`coach-${co.profile_id}`}>
                        <div className="flex w-full items-center gap-2">
                          <button
                            type="button"
                            aria-label={isOpen ? "Hide learners" : "Show learners"}
                            aria-expanded={isOpen}
                            onClick={() => setOpenCoach(isOpen ? null : co.profile_id)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight
                              className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
                            />
                          </button>
                          <button
                            type="button"
                            aria-pressed={peopleState.get(co.profile_id) === "on"}
                            onClick={() => toggle(peopleState, setPeopleState, co.profile_id)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
                          >
                            <Box state={peopleState.get(co.profile_id) ?? "off"} />
                            <User className="size-3.5 text-muted-foreground" />
                            <span className="truncate text-sm">{co.display_name}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                              {co.learners.length} learner{co.learners.length === 1 ? "" : "s"}
                            </span>
                          </button>
                          {folder && peopleState.get(co.profile_id) === "on" && (
                            <LevelPicker
                              value={levelOf(co.profile_id)}
                              onChange={(l) => setLevel(co.profile_id, l)}
                            />
                          )}
                        </div>

                        {isOpen && (
                          <>
                            {/* Ticking the coach does NOT tick their learners.
                                Two different decisions, and collapsing them would
                                hand fifteen people content somebody meant for one. */}
                            <button
                              type="button"
                              onClick={() => {
                                const allOn = co.learners.every(
                                  (l) => peopleState.get(l.profile_id) === "on",
                                );
                                setPeopleState((m) => {
                                  const n = new Map(m);
                                  for (const l of co.learners) n.set(l.profile_id, allOn ? "off" : "on");
                                  return n;
                                });
                              }}
                              className="ml-8 mb-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              {co.learners.every((l) => peopleState.get(l.profile_id) === "on")
                                ? "Clear all learners"
                                : "Select all learners"}
                            </button>
                            {co.learners.map((l) => (
                              <div
                                key={`${co.profile_id}-${l.profile_id}`}
                                className="ml-8 flex w-[calc(100%-2rem)] items-center gap-2"
                              >
                                <button
                                  type="button"
                                  aria-pressed={peopleState.get(l.profile_id) === "on"}
                                  onClick={() => toggle(peopleState, setPeopleState, l.profile_id)}
                                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
                                >
                                  <Box state={peopleState.get(l.profile_id) ?? "off"} />
                                  <User className="size-3.5 text-muted-foreground" />
                                  <span className="truncate text-sm">{l.display_name}</span>
                                </button>
                                {folder && peopleState.get(l.profile_id) === "on" && (
                                  <LevelPicker
                                    value={levelOf(l.profile_id)}
                                    onChange={(lv) => setLevel(l.profile_id, lv)}
                                  />
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PEOPLE WITH NO CLUB. A club is a grouping within the program, not
                  the only way to belong to it — a coach or an administrator who
                  never joined one was previously unreachable, absent from the only
                  list this dialog could draw. */}
              {canShareMembers && loners.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Program members
                  </p>
                  {loners.map((m) => (
                    <div key={m.profile_id} className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={peopleState.get(m.profile_id) === "on"}
                      onClick={() => toggle(peopleState, setPeopleState, m.profile_id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
                    >
                      <Box state={peopleState.get(m.profile_id) ?? "off"} />
                      <User className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-sm">{m.display_name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        no club
                      </span>
                    </button>
                    {folder && peopleState.get(m.profile_id) === "on" && (
                      <LevelPicker
                        value={levelOf(m.profile_id)}
                        onChange={(l) => setLevel(m.profile_id, l)}
                      />
                    )}
                    </div>
                  ))}
                </div>
              )}
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
