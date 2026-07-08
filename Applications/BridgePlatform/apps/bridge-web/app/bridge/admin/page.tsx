const SECTIONS = [
  {
    title: "Knowledge sources",
    body: "Register SAYC/2-over-1/Laws sources with rights status; every rule traces back here.",
  },
  {
    title: "Human-readable knowledge base",
    body: "The reviewed source of truth: readable rules with structured fields, linked to source passages.",
  },
  {
    title: "Gap registry",
    body: "Unresolved ambiguities and level decisions — explicit, never silently filled.",
  },
  {
    title: "Generation runs & packages",
    body: "Approved knowledge generates versioned rule packages (draft/review/published) with diffs.",
  },
] as const;

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Admin & Expert Review
        </h1>
        <p className="text-sm text-neutral-600">
          Bridge knowledge base authoring, review, and package publication.
          Functionality lands in Phase 3 (core) and Phase 9 (LLM-assisted
          extraction at scale).
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-lg border border-neutral-200 p-5"
          >
            <h2 className="mb-2 font-medium">{section.title}</h2>
            <p className="text-sm text-neutral-600">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
