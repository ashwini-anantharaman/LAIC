import type { AppShellConfig, ContentConnection } from "../../types";
import { PLATFORM_META } from "../../data/constants";

/**
 * Mock of what a content card opens: the connected platform's learner view.
 * In the published app this moment is a real handoff — the shell asks Nexus
 * for a single-use launch token and navigates to the platform, which swaps
 * the token for its own session. Here it's sketched so the flow can be felt.
 */
export function PlatformScreen({
  config,
  connection,
  role,
  onBack,
}: {
  config: AppShellConfig;
  connection: ContentConnection;
  role: string;
  onBack: () => void;
}) {
  const meta = PLATFORM_META[connection.platform];

  return (
    <div className="flex h-full flex-col">
      {/* platform chrome — deliberately NOT the app's accent: the learner has left the shell */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-white px-4 pb-3 pt-3">
        <button onClick={onBack} className="mb-1.5 text-[9px] font-semibold" style={{ color: config.accentColor }}>
          ‹ Back to {config.name || "app"}
        </button>
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gray-900 text-sm text-white">
            {meta.glyph}
          </div>
          <div>
            <p className="text-[12px] font-bold leading-tight text-gray-800">{meta.name}</p>
            <p className="text-[8px] text-gray-400">
              Signed in as Alex · {role || "Learner"} · via Nexus launch
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 px-3 py-3">
        {connection.platform === "bridge" ? (
          <>
            <MockCard title="Continue your session" line1="Board 7 · You are South" line2="Bidding: 1NT – ?" />
            <MockCard title="Play a new deal" line1="Practice with your assigned player" line2="Tuesday Beginners · SAYC" />
            <MockCard title="My convention card" line1="SAYC — Floor set" line2="Updated by your coach" />
          </>
        ) : (
          <>
            <MockCard title="Continue learning" line1="Module 2 · Lesson 3 of 8" line2="Opening bids and hand evaluation" />
            <MockCard title="Daily quiz" line1="5 questions · ~3 minutes" line2="Based on what you missed last time" />
            <MockCard title="My progress" line1="62% of course complete" line2="4-day streak" />
          </>
        )}

        <p className="mt-3 px-1 text-center text-[8px] leading-relaxed text-gray-300">
          Prototype — the published app opens the real {meta.name} learner view here.
        </p>
      </div>
    </div>
  );
}

function MockCard({ title, line1, line2 }: { title: string; line1: string; line2: string }) {
  return (
    <div className="mb-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold text-gray-800">{title}</p>
      <p className="mt-1 text-[9px] text-gray-500">{line1}</p>
      <p className="mt-0.5 text-[8px] text-gray-400">{line2}</p>
    </div>
  );
}
