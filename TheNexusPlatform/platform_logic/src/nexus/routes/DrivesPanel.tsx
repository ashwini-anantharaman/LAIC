/**
 * Who has a drive, and what they may do in it.
 *
 * A drive is a folder root owned by somebody rather than by the program (0014),
 * and the four owner kinds are ONE list here rather than four screens: a personal
 * drive is simply one whose owner is a person. Four screens would say the same
 * thing four times and let the copies drift.
 *
 * A DENSE TABLE, NOT A CARD PER PERSON. A program has dozens of members and only
 * a handful will ever have a drive, so the screen's real job is "show me who does"
 * — not "render everybody equally and make me scroll". Hence: the people who have
 * one float to the top, a filter defaults to hiding the rest, and each row is one
 * line until you open it.
 *
 * Two toggles rather than one, because all four combinations are real: a drive
 * things are shared INTO but nothing is authored in; create rights with nowhere
 * personal to put the result; both; neither.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, HardDrive, Loader2, Search, Smartphone, User, Users,
} from "lucide-react";
import { toast } from "sonner";

import { listDrives, listShareTargets, setDrive, type DriveRow } from "@/services/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";

/** The Studio's object types, as an author picks them on the Create screen. */
const OBJECT_TYPES: { id: string; label: string }[] = [
  { id: "tutorial-v3", label: "Tutorial" },
  { id: "quiz", label: "Quiz" },
  { id: "flashcard-set", label: "Flashcards" },
  { id: "concept-card", label: "Concept card" },
  { id: "summary", label: "Summary" },
  { id: "reflection", label: "Reflection" },
  { id: "scenario", label: "Scenario" },
  { id: "assignment", label: "Assignment" },
  { id: "drill", label: "Drill" },
  { id: "video-script", label: "Video script" },
];

/** The Studio's tabs, by surface id from the access catalogue. */
const SURFACES: { id: string; label: string }[] = [
  { id: "learning.create", label: "Create" },
  { id: "learning.sources", label: "Sources" },
  { id: "learning.library", label: "Object Library" },
  { id: "learning.submissions", label: "My Submissions" },
  { id: "learning.object_reviews", label: "Object Reviews" },
  { id: "learning.publishing", label: "Versions & Publishing" },
  { id: "learning.assignments", label: "Assignments" },
  { id: "learning.progress", label: "Progress" },
  { id: "learning.ai_tools", label: "AI Study Tools" },
];

/** What a phone can realistically author — the app case, in one click. */
const PHONE_TYPES = ["flashcard-set", "concept-card", "quiz"];

interface Candidate {
  subject_type: DriveRow["subject_type"];
  subject_id: string;
  label: string;
  sub: string;
}

export function DrivesPanel({ programId }: { programId: string }) {
  const [rows, setRows] = useState<DriveRow[]>([]);
  const [people, setPeople] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyWithDrives, setOnlyWithDrives] = useState(true);

  const key = (t: string, id: string) => `${t}:${id}`;

  const load = async () => {
    try {
      const [drives, targets] = await Promise.all([
        listDrives(programId),
        listShareTargets(programId).catch(() => null),
      ]);
      setRows(drives);
      const cand: Candidate[] = [];
      const seen = new Set<string>();
      const add = (c: Candidate) => {
        if (seen.has(key(c.subject_type, c.subject_id))) return;
        seen.add(key(c.subject_type, c.subject_id));
        cand.push(c);
      };
      add({ subject_type: "app", subject_id: "clubapp", label: "Bridge Bird", sub: "app" });
      for (const cl of targets?.clubs ?? []) {
        add({ subject_type: "club", subject_id: cl.id, label: cl.name, sub: `club · ${cl.members.length} members` });
      }
      for (const co of targets?.coaches ?? []) {
        add({ subject_type: "profile", subject_id: co.profile_id, label: co.display_name,
              sub: `coach · ${co.learners.length} learners` });
      }
      for (const cl of targets?.clubs ?? []) {
        for (const m of cl.members) add({ subject_type: "profile", subject_id: m.profile_id, label: m.display_name, sub: cl.name });
      }
      for (const m of targets?.programMembers ?? []) {
        add({ subject_type: "profile", subject_id: m.profile_id, label: m.display_name, sub: "no club" });
      }
      setPeople(cand);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read drives");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [programId]);

  const byKey = useMemo(() => {
    const m = new Map<string, DriveRow>();
    for (const r of rows) m.set(key(r.subject_type, r.subject_id), r);
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((c) => {
        const has = byKey.get(key(c.subject_type, c.subject_id))?.has_drive ?? false;
        if (onlyWithDrives && !has && !needle) return false;
        if (!needle) return true;
        return c.label.toLowerCase().includes(needle) || c.sub.toLowerCase().includes(needle);
      })
      // Whoever has a drive first: this screen is read far more often than edited.
      .sort((a, b) => {
        const ah = byKey.get(key(a.subject_type, a.subject_id))?.has_drive ? 0 : 1;
        const bh = byKey.get(key(b.subject_type, b.subject_id))?.has_drive ? 0 : 1;
        return ah - bh || a.label.localeCompare(b.label);
      });
  }, [people, byKey, q, onlyWithDrives]);

  const withDrives = rows.filter((r) => r.has_drive).length;

  async function save(c: Candidate, patch: Partial<DriveRow>) {
    const k = key(c.subject_type, c.subject_id);
    const cur = byKey.get(k);
    setSaving(k);
    try {
      await setDrive(programId, {
        subject_type: c.subject_type,
        subject_id: c.subject_id,
        has_drive: patch.has_drive ?? cur?.has_drive ?? false,
        can_create: patch.can_create ?? cur?.can_create ?? false,
        create_types: patch.create_types !== undefined ? patch.create_types : cur?.create_types ?? null,
        surfaces: patch.surfaces !== undefined ? patch.surfaces : cur?.surfaces ?? null,
        name: cur?.drive_name ?? `${c.label}'s drive`,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Reading drives…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            placeholder="Search people, clubs, coaches…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant={onlyWithDrives ? "default" : "outline"}
          onClick={() => setOnlyWithDrives((v) => !v)}
        >
          <HardDrive className="size-3.5" />
          {onlyWithDrives ? `With drives · ${withDrives}` : `Everyone · ${people.length}`}
        </Button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm">
          <p className="font-medium">
            {onlyWithDrives && !q ? "Nobody has a drive yet" : "Nothing matches"}
          </p>
          <p className="mt-1 max-w-prose text-muted-foreground">
            {onlyWithDrives && !q
              ? "Switch to Everyone to give someone one. A drive is a space of their own, separate from the shared library."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8" />
                <th className="px-3 py-2 font-semibold">Who</th>
                <th className="px-3 py-2 font-semibold">Drive</th>
                <th className="px-3 py-2 font-semibold">Create</th>
                <th className="px-3 py-2 font-semibold">May make</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const k = key(c.subject_type, c.subject_id);
                const row = byKey.get(k);
                const has = row?.has_drive ?? false;
                const canCreate = row?.can_create ?? false;
                const types = row?.create_types ?? null;
                const surfaces = row?.surfaces ?? null;
                const Icon = c.subject_type === "app" ? Smartphone : c.subject_type === "club" ? Users : User;
                const expanded = open === k;
                const busy = saving === k;
                return (
                  <>
                    <tr key={k} className={cn("border-t", expanded && "bg-accent/30")}>
                      <td className="pl-2">
                        {has && (
                          <button
                            type="button"
                            aria-label={expanded ? "Hide details" : "Show details"}
                            onClick={() => setOpen(expanded ? null : k)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{c.label}</span>
                            <span className="text-[11px] text-muted-foreground">{c.sub}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant={has ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => void save(c, { has_drive: !has })}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          {has ? "Yes" : "No"}
                        </Button>
                      </td>
                      <td className="px-3 py-2">
                        {has ? (
                          <Button
                            size="sm"
                            variant={canCreate ? "default" : "outline"}
                            disabled={busy}
                            onClick={() => void save(c, { can_create: !canCreate })}
                          >
                            {canCreate ? "Yes" : "No"}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {/* The answer at a glance, so the common case needs no click. */}
                        {!has ? "—"
                          : !canCreate ? "nothing"
                          : types === null ? "anything"
                          : types.length === 0 ? (
                            <span className="text-amber-600 dark:text-amber-400">nothing ticked</span>
                          ) : types.length <= 2
                            ? types.map((t) => OBJECT_TYPES.find((o) => o.id === t)?.label ?? t).join(", ")
                            : `${types.length} types`}
                      </td>
                    </tr>

                    {has && expanded && (
                      <tr key={`${k}-detail`} className="border-t bg-accent/20">
                        <td />
                        <td colSpan={4} className="px-3 py-3">
                          <div className="space-y-3">
                            <div>
                              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Types they may create
                                </span>
                                <button
                                  type="button"
                                  disabled={!canCreate || busy}
                                  onClick={() => void save(c, { create_types: PHONE_TYPES })}
                                  className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
                                >
                                  phone-sized
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCreate || busy}
                                  onClick={() => void save(c, { create_types: OBJECT_TYPES.map((t) => t.id) })}
                                  className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
                                >
                                  all
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCreate || busy}
                                  onClick={() => void save(c, { create_types: [] })}
                                  className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
                                >
                                  none
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {OBJECT_TYPES.map((t) => {
                                  const on = types !== null && types.includes(t.id);
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      aria-pressed={on}
                                      disabled={!canCreate || busy}
                                      onClick={() => {
                                        const cur = types ?? [];
                                        void save(c, {
                                          create_types: on ? cur.filter((x) => x !== t.id) : [...cur, t.id],
                                        });
                                      }}
                                      className={cn(
                                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-40",
                                        on ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground",
                                      )}
                                    >
                                      {t.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Tabs inside the drive
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {SURFACES.map((sf) => {
                                  const on = surfaces !== null && surfaces.includes(sf.id);
                                  return (
                                    <button
                                      key={sf.id}
                                      type="button"
                                      aria-pressed={on}
                                      disabled={busy}
                                      onClick={() => {
                                        const cur = surfaces ?? [];
                                        void save(c, {
                                          surfaces: on ? cur.filter((x) => x !== sf.id) : [...cur, sf.id],
                                        });
                                      }}
                                      className={cn(
                                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                                        on ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground",
                                      )}
                                    >
                                      {sf.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {row?.drive_name && (
                              <p className="text-[11px] text-muted-foreground">
                                Drive: {row.drive_name}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
