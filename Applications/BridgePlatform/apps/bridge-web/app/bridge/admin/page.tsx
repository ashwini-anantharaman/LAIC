import Link from "next/link";

/** Plumbing landing during the rework: only the audit trail remains here. */
export default function AdminPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-2xl font-medium">Administration</h1>
      <p className="mt-3 text-sm text-neutral-600">
        The knowledge admin area is being replaced by the knowledge-base
        workspace (rebuild in progress). The append-only audit trail stays
        available:
      </p>
      <p className="mt-4">
        <Link
          href="/bridge/admin/audit"
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          Audit log →
        </Link>
      </p>
    </div>
  );
}
