/** Org space → Audit. Every administrative action inside this space. */
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { listAuditEvents } from "@/services/api";
import type { AuditEvent } from "@/types/platform";
import { EmptyState, PageHeader, Spinner } from "@/nexus/ui/kit";

export function OrgAudit() {
  const { orgId = "" } = useParams();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    listAuditEvents(orgId, 100)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [orgId]);

  if (!events) return <Spinner />;

  return (
    <div>
      <PageHeader title="Audit" />
      {events.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium text-foreground">{e.actor_name ?? "System"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{e.action}</TableCell>
                  <TableCell className="text-muted-foreground">{e.target_type ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
