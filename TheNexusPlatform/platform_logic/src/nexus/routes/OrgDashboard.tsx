/**
 * Org space → Dashboard. A quiet overview: headline counts, the programs in this
 * space, and recent activity. No narration, no decorative callouts (§6).
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { listAuditEvents, listPrograms } from "@/services/api";
import type { AuditEvent, Program } from "@/types/platform";
import { EmptyState, PageHeader, Section, Spinner, Stat } from "@/nexus/ui/kit";
import { ChevronRight } from "lucide-react";

export function OrgDashboard() {
  const { orgId = "" } = useParams();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      <PageHeader title="Dashboard" subtitle="Everything your organization runs, in one place." />

      <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-3">
        <Stat label="Programs" value={programs.length} />
        <Stat label="Learners" value={programs.reduce((n, p) => n + (p.learner_count ?? 0), 0)} />
        <Stat label="Courses" value={programs.reduce((n, p) => n + (p.course_count ?? 0), 0)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-start">
        <Section title="Programs">
          {programs.length === 0 ? (
            <EmptyState>No programs yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {programs.map((p) => (
                <Link
                  key={p.id}
                  to={`/o/${orgId}/p/${p.id}`}
                  className="flex items-center gap-3 glass-card px-4 py-3 hover:border-foreground/20 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">{p.name}</div>
                    {p.description ? (
                      <div className="text-xs text-muted-foreground truncate">{p.description}</div>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{p.category}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
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
                  <div className="text-xs text-muted-foreground font-mono">{a.action}</div>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
