/**
 * Who has a drive, and what they may do in it.
 *
 * A drive is a folder root owned by somebody rather than by the program (0014),
 * and the four owner kinds are one list here rather than four screens: a personal
 * drive is simply one whose owner is a person. Splitting them would mean saying
 * the same thing four times and letting the four copies drift.
 *
 * TWO TOGGLES, NOT ONE, because all four combinations are real: a drive things
 * are shared INTO but nothing is authored in; create rights with nowhere personal
 * to put the result; both; neither.
 *
 * The type list is where the real control is. Nobody authors a 38-block tutorial
 * on a phone, so an app's drive is normally limited to what a phone can actually
 * hold — a flashcard set, a concept card. Empty means they may create nothing,
 * which is a decision and reads differently from "unrestricted".
 */
import { useEffect, useMemo, useState } from "react";
import { HardDrive, Loader2, Smartphone, User, Users } from "lucide-react";
import { toast } from "sonner";

import { listDrives, listShareTargets, setDrive, type DriveRow } from "@/services/api";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/components/ui/utils";

/** The Studio's object types, as an author picks them on the Create screen. */
const OBJECT_TYPES: { id: string; label: string }[] = [
  { id: "tutorial-v3", label: "Tutorial" },
  { id: "quiz", label: "Quiz" },
  { id: "flashcard-set", label: "Flashcard set" },
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

interface Candidate {
  subject_type: DriveRow["subject_type"];
  subject_id: string;
  label: string;
  sub?: string;
}

export function DrivesPanel({ programId }: { programId: string }) {
  const [rows, setRows] = useState<DriveRow[]>([]);
  const [people, setPeople] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const key = (t: string, id: string) => `${t}:${id}`;

  const load = async () => {
    setLoading(true);
    try {
      const [drives, targets] = await Promise.all([
        listDrives(programId),
        listShareTargets(programId).catch(() => null),
      ]);
      setRows(drives);
      const cand: Candidate[] = [];
      const seen = new Set<string>();
      for (const cl of targets?.clubs ?? []) {
        if (!seen.has(key("club", cl.id))) {
          seen.add(key("club", cl.id));
          cand.push({ subject_type: "club", subject_id: cl.id, label: cl.name, sub: "club" });
        }
        for (const m of cl.members ?? []) {
          if (seen.has(key("profile", m.profile_id))) continue;
          seen.add(key("profile", m.profile_id));
          cand.push({ subject_type: "profile", subject_id: m.profile_id, label: m.display_name, sub: cl.name });
        }
      }
      for (const m of targets?.programMembers ?? []) {
        if (seen.has(key("profile", m.profile_id))) continue;
        seen.add(key("profile", m.profile_id));
        cand.push({ subject_type: "profile", subject_id: m.profile_id, label: m.display_name, sub: "no club" });
      }
      // Apps are not on the roster — they are audiences, not people — so the one
      // this program can publish to is named here rather than discovered.
      cand.push({ subject_type: "app", subject_id: "clubapp", label: "Bridge Bird", sub: "app" });
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

  async function save(c: Candidate, patch: Partial<DriveRow>) {
    const k = key(c.subject_type, c.subject_id);
    const cur = byKey.get(k);
    const next = {
      subject_type: c.subject_type,
      subject_id: c.subject_id,
      has_drive: patch.has_drive ?? cur?.has_drive ?? false,
      can_create: patch.can_create ?? cur?.can_create ?? false,
      create_types: patch.create_types !== undefined ? patch.create_types : cur?.create_types ?? null,
      surfaces: patch.surfaces !== undefined ? patch.surfaces : cur?.surfaces ?? null,
      name: cur?.drive_name ?? `${c.label}'s drive`,
    };
    setSaving(k);
    try {
      await setDrive(programId, next);
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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        A drive is a space of someone&rsquo;s own — folders and content that belong to them rather
        than to the shared library. Nobody has one until you say so, and having one is separate
        from being able to create in it.
      </p>
      <ul className="space-y-2">
        {people.map((c) => {
          const k = key(c.subject_type, c.subject_id);
          const row = byKey.get(k);
          const has = row?.has_drive ?? false;
          const canCreate = row?.can_create ?? false;
          const types = row?.create_types ?? null;
          const surfaces = row?.surfaces ?? null;
          const Icon = c.subject_type === "app" ? Smartphone : c.subject_type === "club" ? Users : User;
          const expanded = open === k;
          return (
            <li key={k} className="rounded-xl border">
              <div className="flex flex-wrap items-center gap-3 p-3">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.label}</span>
                  <span className="text-[11px] text-muted-foreground">{c.sub}</span>
                </span>
                <Button
                  size="sm"
                  variant={has ? "default" : "outline"}
                  disabled={saving === k}
                  onClick={() => void save(c, { has_drive: !has })}
                >
                  {saving === k ? <Loader2 className="size-3.5 animate-spin" /> : <HardDrive className="size-3.5" />}
                  {has ? "Has a drive" : "No drive"}
                </Button>
                {has && (
                  <>
                    <Button
                      size="sm"
                      variant={canCreate ? "default" : "outline"}
                      disabled={saving === k}
                      onClick={() => void save(c, { can_create: !canCreate })}
                    >
                      {canCreate ? "Can create" : "Cannot create"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(expanded ? null : k)}>
                      {expanded ? "Hide" : "What they may make"}
                    </Button>
                  </>
                )}
              </div>

              {has && expanded && (
                <div className="space-y-4 border-t p-3">
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Types they may create
                    </p>
                    {/* Nothing ticked means they may create NOTHING, and it says so —
                        an empty list is a decision, not an oversight. */}
                    <div className="flex flex-wrap gap-1.5">
                      {OBJECT_TYPES.map((t) => {
                        const on = types === null ? false : types.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            aria-pressed={on}
                            disabled={!canCreate || saving === k}
                            onClick={() => {
                              const cur = types ?? [];
                              const next = on ? cur.filter((x) => x !== t.id) : [...cur, t.id];
                              void save(c, { create_types: next });
                            }}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-40",
                              on ? "border-transparent bg-accent text-accent-foreground" : "text-muted-foreground",
                            )}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                    {canCreate && (types?.length ?? 0) === 0 && (
                      <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        Nothing ticked — they can open the drive but make nothing in it.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Tabs inside the drive
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SURFACES.map((sf) => {
                        const on = surfaces === null ? false : surfaces.includes(sf.id);
                        return (
                          <button
                            key={sf.id}
                            type="button"
                            aria-pressed={on}
                            disabled={saving === k}
                            onClick={() => {
                              const cur = surfaces ?? [];
                              const next = on ? cur.filter((x) => x !== sf.id) : [...cur, sf.id];
                              void save(c, { surfaces: next });
                            }}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs transition-colors",
                              on ? "border-transparent bg-accent text-accent-foreground" : "text-muted-foreground",
                            )}
                          >
                            {sf.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {row?.drive_id && (
                    <p className="text-[11px] text-muted-foreground">
                      Drive: {row.drive_name} · {row.drive_id}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
