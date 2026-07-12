import { defaultSettingValues } from "@bridge/config";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { importBoardText } from "@/lib/formats";
import { latestPackage, sessionService, sessionStoreInstance } from "@/lib/sessions";

/**
 * POST /api/bridge/import — create a session from pasted PBN or LIN (§7.2).
 * Body: { text: string }. Any recorded auction/play is primed as action
 * events with no logic events (imported = no decision trace).
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const imported = importBoardText(String(body.text ?? ""));
    const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
    const { assertAiAllowed, assertPackageAllowed } = await import("@/lib/org");
  await assertAiAllowed(context); // §3.4 org policy
  await assertPackageAllowed(context, pkg);
  const record = await sessionService().createSession({
      context,
      sessionType: "single_board",
      board: imported.board,
      pkg,
      resolvedValues: defaultSettingValues(pkg.settings),
    });
    if (imported.events.length)
      await sessionStoreInstance().appendEvents(record.bridgeSessionId, imported.events);
    return NextResponse.json(
      {
        bridgeSessionId: record.bridgeSessionId,
        format: imported.format,
        importedEvents: imported.events.length,
        warnings: imported.warnings,
      },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
