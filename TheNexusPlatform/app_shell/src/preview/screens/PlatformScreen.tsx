import type { AppShellConfig, ContentConnection } from "../../types";
import { PLATFORM_META } from "../../data/constants";
import { PAL, Icon, platformIcon } from "../kit";

/**
 * Mock of what a content card opens: the connected platform's learner view.
 * In the published app this moment is a real handoff — the shell asks Nexus
 * for a single-use launch token and navigates to the platform, which swaps
 * the token for its own session. Chrome is deliberately NEUTRAL (not the app
 * accent): the learner has left the shell.
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
  const cards =
    connection.platform === "bridge"
      ? [
          { title: "Continue your session", line1: "Board 7 · You are South", line2: "Bidding: 1NT – ?" },
          { title: "Play a new deal", line1: "Practice with your assigned player", line2: "Tuesday Beginners · SAYC" },
          { title: "My convention card", line1: "SAYC — Floor set", line2: "Updated by your coach" },
        ]
      : [
          { title: "Continue learning", line1: "Module 2 · Lesson 3 of 8", line2: "Opening bids and hand evaluation" },
          { title: "Daily quiz", line1: "5 questions · ~3 minutes", line2: "Based on what you missed last time" },
          { title: "My progress", line1: "62% of course complete", line2: "4-day streak" },
        ];

  return (
    <div className="flex h-full flex-col" style={{ background: PAL.surface }}>
      {/* Platform chrome — neutral, not the app's accent */}
      <div className="flex-shrink-0 px-4 pb-3 pt-3" style={{ background: PAL.card, borderBottom: `1px solid ${PAL.hairline}` }}>
        <button onClick={onBack} className="mb-2 flex items-center gap-1 text-[11px] font-semibold" style={{ color: PAL.slate }}>
          <Icon name="chevronLeft" size={13} color={PAL.slate} /> Back to {config.name || "app"}
        </button>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl" style={{ background: "#0A0E18" }}>
            <Icon name={platformIcon(connection.platform)} size={19} color="#C3CCDD" stroke={1.5} />
          </span>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: PAL.ink }}>{meta.name}</p>
            <p className="text-[10px]" style={{ color: PAL.muted }}>Signed in as Alex · {role || "Learner"} · via Nexus launch</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="space-y-2.5">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl p-4" style={{ background: PAL.card, border: `1px solid ${PAL.hairline}` }}>
              <p className="text-[14px] font-semibold" style={{ color: PAL.ink }}>{c.title}</p>
              <p className="mt-1 text-[12px]" style={{ color: PAL.slate }}>{c.line1}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: PAL.muted }}>{c.line2}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 px-2 text-center text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
          Prototype — the published app opens the real {meta.name} learner view here.
        </p>
      </div>
    </div>
  );
}
