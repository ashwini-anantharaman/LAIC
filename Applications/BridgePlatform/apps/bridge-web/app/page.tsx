export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Bridge Platform</h1>
      <p className="text-neutral-600">
        Phase 0 scaffold. The app shell (dashboard, play, players, boards,
        progress, admin) lands in Phase 1 — see{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 text-sm">
          laicdocs/Bridge_Workstream_Execution_Plan_v1.md
        </code>
        .
      </p>
    </main>
  );
}
