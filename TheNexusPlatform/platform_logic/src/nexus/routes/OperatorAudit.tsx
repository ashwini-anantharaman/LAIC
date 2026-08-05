/**
 * Nexus operator → Platform audit. Boundary-level actions across all spaces:
 * provisioning, governance, entitlements. Never an org's internal content.
 */
import { useEffect, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { listAllAuditEvents, type PlatformAuditEvent } from "@/services/api";
import { EmptyState, PageHeader, Spinner } from "@/nexus/ui/kit";

export function OperatorAudit() {
  const [events, setEvents] = useState<PlatformAuditEvent[] | null>(null);

  useEffect(() => {
    listAllAuditEvents(100)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  return (
    <div>
      <PageHeader title="Platform audit" />
      {!events ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState>No platform-level activity recorded yet.</EmptyState>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Organization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium text-foreground">{e.actor_name ?? "System"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{e.action}</TableCell>
                  <TableCell className="text-muted-foreground">{e.organization_name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
