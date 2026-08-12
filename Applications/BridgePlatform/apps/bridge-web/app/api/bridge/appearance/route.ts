// /api/bridge/appearance — the viewer's table skin & layout, as JSON.
//   GET   → the stored TableAppearance (falls open to the built-in look)
//   PATCH { ...partial } → merge, normalize, persist — the JSON twin of the
//   ☰ menu's patchAppearanceAction, gated the same way (table.skin_settings).

import { normalizeAppearance } from "@bridge/table-config";
import { NextResponse, type NextRequest } from "next/server";

import { canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { getAppearance, saveAppearance } from "@/lib/appearance";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";

const CORS = corsHeaders("GET", "PATCH");

export const OPTIONS = corsOptions("GET", "PATCH");

export async function GET() {
  try {
    const context = await requireContext();
    const appearance = await getAppearance(context.nexusUserId);
    return NextResponse.json({ appearance }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "table.skin_settings"))) {
      throw new AccessError("No appearance settings");
    }
    const patch = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const current = await getAppearance(context.nexusUserId);
    const appearance = normalizeAppearance({ ...current, ...patch });
    await saveAppearance(context.nexusUserId, appearance);
    return NextResponse.json({ appearance }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "PATCH");
  }
}
