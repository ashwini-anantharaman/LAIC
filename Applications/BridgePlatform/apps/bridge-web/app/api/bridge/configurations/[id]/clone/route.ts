import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { packagePresets } from "@bridge/profiles";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { latestPackage } from "@/lib/sessions";
import { profileService } from "@/lib/profiles";

/** POST /api/bridge/configurations/:id/clone — copy-on-customize into the caller's scope (§16.3). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
    const copy = await (await profileService()).customize(
      id,
      context,
      pkg.settings,
      body.name,
      packagePresets(pkg),
    );
    return NextResponse.json({ profile: copy }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
