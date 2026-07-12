import { defaultSettingValues } from "@bridge/config";
import { generateConstrainedBoards, specFromTeachingScope } from "@bridge/dealer";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { profileService } from "@/lib/profiles";
import { latestPackage, sessionService } from "@/lib/sessions";

/**
 * Learning Platform domain-activity contract, bridge side (LP §13.3):
 * POST launches a scoped bridge activity for a learner and returns the
 * session + URL; Learning later polls GET /activities/:launchId for the
 * completion result. Body: { launchId, learnerId, bridgeActivityType,
 * teachingScopeId?, seed? }.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    const body = (await request.json()) as {
      launchId: string;
      learnerId?: string;
      bridgeActivityType?: string;
      teachingScopeId?: string;
      seed?: number;
    };
    if (!body.launchId)
      return NextResponse.json({ error: "launchId is required" }, { status: 400 });

    const service = await profileService();
    const scope =
      (await service.getScope(body.teachingScopeId ?? "ts_system_bn_level1", context)) ??
      (await service.listScopes(context))[0];
    if (!scope) return NextResponse.json({ error: "No teaching scope available" }, { status: 409 });

    const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
    const values = defaultSettingValues(pkg.settings);
    const seed = body.seed ?? Math.floor(Math.random() * 1_000_000);
    const board = generateConstrainedBoards(
      specFromTeachingScope(
        scope.teachingScopeId,
        { scopeId: scope.teachingScopeId, evaluatorFilter: scope.evaluatorFilter, targetConceptIds: scope.targetConceptIds },
        { seed, count: 1, dealer: "S", namePrefix: body.bridgeActivityType ?? "Learning activity" },
      ),
      { pkg, values },
    ).boards[0]!;

    const record = await sessionService().createSession({
      context,
      sessionType: "practice_set",
      board,
      pkg,
      resolvedValues: values,
      seats: {
        S: { seat: "S", playerKind: "human", occupantId: body.learnerId ?? context.nexusUserId },
      },
      launchRef: body.launchId,
    });
    return NextResponse.json(
      {
        launchId: body.launchId,
        bridgeSessionId: record.bridgeSessionId,
        url: `/bridge/play/${record.bridgeSessionId}`,
        targetConceptIds: scope.targetConceptIds,
      },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
