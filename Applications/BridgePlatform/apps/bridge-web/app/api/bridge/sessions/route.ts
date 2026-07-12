import { seededBoard } from "@bridge/engine";
import { defaultSettingValues } from "@bridge/config";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { latestPackage, sessionService } from "@/lib/sessions";

/** GET /api/bridge/sessions — list sessions visible in the caller's scope. */
export async function GET() {
  try {
    const context = await requireContext();
    const sessions = await sessionService().listSessions(context);
    return NextResponse.json({ sessions });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * POST /api/bridge/sessions — create a session.
 * Body: { seed?: number, sessionType?: string, humanSeat?: "N"|"E"|"S"|"W" }
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    const body = (await request.json().catch(() => ({}))) as {
      seed?: number;
      sessionType?: string;
      humanSeat?: "N" | "E" | "S" | "W";
    };
    const seed = Number.isFinite(body.seed) ? Number(body.seed) : 1;
    const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
    const { assertAiAllowed, assertPackageAllowed } = await import("@/lib/org");
  await assertAiAllowed(context); // §3.4 org policy
  await assertPackageAllowed(context, pkg);
  const record = await sessionService().createSession({
      context,
      sessionType: (body.sessionType as never) ?? "single_board",
      board: seededBoard(seed),
      pkg,
      resolvedValues: defaultSettingValues(pkg.settings),
      seats: body.humanSeat
        ? {
            [body.humanSeat]: {
              seat: body.humanSeat,
              playerKind: "human",
              occupantId: context.nexusUserId,
            },
          }
        : undefined,
    });
    return NextResponse.json({ session: record }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
