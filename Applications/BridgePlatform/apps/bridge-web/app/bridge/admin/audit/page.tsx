import { redirect } from "next/navigation";
import { auditStore } from "@/lib/audit";
import { isFellowDemo } from "@/lib/nexus";

/** §21: the append-only trail of privileged actions. Read-only by design. */
export default async function AuditPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ actor?: string; action?: string }> }>) {
  // Hidden on the fellows-testing deployment.
  if (await isFellowDemo()) redirect("/bridge/table");
  const { actor, action } = await searchParams;
  const records = await auditStore().query({
    actorUserId: actor || undefined,
    action: (action as never) || undefined,
    limit: 200,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-neutral-600">
          Append-only record of expert and admin actions (§21). Entries are
          written by the server on every privileged mutation and never edited.
        </p>
      </header>

      <form className="flex items-center gap-2">
        <input
          name="actor"
          defaultValue={actor ?? ""}
          placeholder="filter by actor user id"
          className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          name="action"
          defaultValue={action ?? ""}
          placeholder="filter by action (e.g. generation.run)"
          className="w-64 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
          Filter
        </button>
      </form>

      {records.length === 0 ? (
        <p className="text-sm text-neutral-500">No audit records match.</p>
      ) : (
        <ul className="space-y-1">
          {records.map((r) => (
            <li key={r.auditId} className="rounded border border-neutral-200 px-3 py-2 text-xs">
              <span className="text-neutral-400">{r.ts}</span>{" "}
              <span className="font-medium">{r.actorUserId}</span>{" "}
              <span className="text-neutral-500">({r.actorAccessLevel})</span> ·{" "}
              <span className="font-mono text-emerald-800">{r.action}</span> →{" "}
              <span className="font-mono">
                {r.resourceType}/{r.resourceId}
              </span>
              {Object.keys(r.details).length > 0 && (
                <span className="text-neutral-500"> · {JSON.stringify(r.details)}</span>
              )}
              {r.programOrganizationId && (
                <span className="text-neutral-400"> · org {r.programOrganizationId}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
