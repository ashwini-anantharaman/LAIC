// GET /api/bridge/kbs — knowledge bases with live-compile summaries.

import { NextResponse } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";

export async function GET() {
  try {
    await requireContext();
    await ensureSeeds();
    const kbs = await kbStore().listKbs();
    const out = [];
    for (const kb of kbs) {
      const compiled = await kbService().liveCompile(kb.kbId);
      out.push({
        kbId: kb.kbId,
        name: kb.name,
        systemLabel: kb.systemLabel,
        liveCompile: compiled
          ? {
              compileId: compiled.compileId,
              version: compiled.version,
              auctionRules: compiled.auctionRules.length,
              settings: compiled.settings.length,
              packs: compiled.packs.length,
            }
          : null,
        lastCompileError: kb.lastCompileError ?? null,
      });
    }
    return NextResponse.json({ kbs: out });
  } catch (e) {
    return apiError(e);
  }
}
