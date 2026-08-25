/**
 * Org space → Dashboard. A quiet overview: headline counts, the programs in this
 * space, and recent activity. No narration, no decorative callouts (§6).
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { listAuditEvents, listPrograms } from "@/services/api";
import type { AuditEvent, Program } from "@/types/platform";
import { EmptyState, PageHeader, Section, Spinner, StatPill } from "@/nexus/ui/kit";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteProgram } from "@/services/api";
import { ConfirmByName } from "@/nexus/ui/ConfirmByName";

export function OrgDashboard() {
  const { orgId = "" } = useParams();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The program queued for deletion — confirmed by typing its name. */
  const [pendingDelete, setPendingDelete] = useState<Program | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [ps, ev] = await Promise.all([
          listPrograms(orgId),
          listAuditEvents(orgId, 6).catch(() => [] as AuditEvent[]),
        ]);
        if (!live) return;
        setPrograms(ps);
        setAudit(ev);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      live = false;
    };
  }, [orgId]);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!programs) return <Spinner />;

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="mb-8 flex flex-wrap gap-2">
        <StatPill label="Programs" value={programs.length} />
        <StatPill label="Learners" value={programs.reduce((n, p) => n + (p.learner_count ?? 0), 0)} />
        <StatPill label="Courses" value={programs.reduce((n, p) => n + (p.course_count ?? 0), 0)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-start [&>*]:min-w-0">
        <Section title="Programs">
          {programs.length === 0 ? (
            <EmptyState>No programs yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {programs.map((p) => (
                /* The card is a Link, so the delete cannot be inside it — a
                   button nested in a link navigates on click in some browsers,
                   which on a delete is the worst possible place to find out. */
                <div
                  key={p.id}
                  className="flex items-center gap-3 glass-card px-4 py-3 hover:border-foreground/20 transition-colors"
                >
                  <Link to={`/o/${orgId}/p/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{p.name}</div>
                      {p.description ? (
                        <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{p.category}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                  <button
                    type="button"
                    title={`Delete ${p.name}`}
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setPendingDelete(p)}
                    className="shrink-0 rounded p-1.5 opacity-60 hover:opacity-100"
                  >
                    <Trash2 className="size-4 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Recent activity">
          <div className="glass-card divide-y divide-border">
            {audit.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No activity yet.</div>
            ) : (
              audit.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="text-sm text-foreground">{a.actor_name ?? "System"}</div>
                  <div className="text-xs text-muted-foreground font-mono break-all">{a.action}</div>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>
      {pendingDelete && (
        <ConfirmByName
          name={pendingDelete.name}
          what="program"
          consequences="its offerings, apps, groups, registrations, roles and its whole content library go with it, and anyone whose only membership was here is deactivated"
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void (async () => {
              setDeleting(true);
              try {
                const r = await deleteProgram(pendingDelete.id, pendingDelete.name);
                const bits = Object.entries(r.removed ?? {})
                  .filter(([k]) => k !== "program")
                  .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`);
                toast.success(
                  bits.length ? `Deleted "${r.name}" — also removed ${bits.join(", ")}` : `Deleted "${r.name}"`,
                );
                setPendingDelete(null);
                setPrograms((ps) => (ps ?? []).filter((x) => x.id !== pendingDelete.id));
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't delete that program");
              } finally {
                setDeleting(false);
              }
            })();
          }}
        />
      )}
    </div>
  );
}
