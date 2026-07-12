import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { packagePresets } from "@bridge/profiles";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { knowledgeStore } from "@/lib/knowledge";
import { profileService } from "@/lib/profiles";
import { latestPackage } from "@/lib/sessions";

/** GET /api/bridge/player-profiles — profiles visible in the caller's scope (§16.3). */
export async function GET() {
  try {
    const context = await requireContext();
    const profiles = await (await profileService()).listProfiles(context);
    return NextResponse.json({ profiles });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * POST /api/bridge/player-profiles — create a profile (§16.3).
 * Body: { name, packageId?, version?, selectedPresetId? } — defaults to the
 * latest Beginner Natural version.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      packageId?: string;
      version?: string;
      selectedPresetId?: string;
    };
    if (!body.name) return NextResponse.json({ error: "Body must include name" }, { status: 400 });
    const record =
      body.packageId && body.version
        ? await knowledgeStore().getPackage(body.packageId, body.version)
        : null;
    const pkg = record?.pkg ?? (await latestPackage(BEGINNER_NATURAL_PACKAGE_ID));
    const profile = await (await profileService()).createProfile(context, {
      name: body.name,
      packageRef: { packageId: pkg.packageId, version: pkg.version },
      settings: pkg.settings,
      selectedPresetId: body.selectedPresetId,
      presets: packagePresets(pkg),
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
