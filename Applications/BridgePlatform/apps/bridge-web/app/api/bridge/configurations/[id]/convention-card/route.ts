import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { generateConventionCard, packagePresets, resolveProfileValues } from "@bridge/profiles";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { knowledgeStore } from "@/lib/knowledge";
import { profileService } from "@/lib/profiles";
import { latestPackage } from "@/lib/sessions";

/** GET /api/bridge/configurations/:id/convention-card — derived output (§11.5). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const profile = await (await profileService()).getProfile(id, context);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const record = await knowledgeStore().getPackage(
      profile.packageRef.packageId,
      profile.packageRef.version,
    );
    const pkg = record?.pkg ?? (await latestPackage(BEGINNER_NATURAL_PACKAGE_ID));
    const { values } = resolveProfileValues(
      pkg.settings,
      profile.selectedPresetId,
      profile.valueOverrides,
      packagePresets(pkg),
    );
    return NextResponse.json({ card: generateConventionCard(pkg, values, profile.name) });
  } catch (e) {
    return apiError(e);
  }
}
