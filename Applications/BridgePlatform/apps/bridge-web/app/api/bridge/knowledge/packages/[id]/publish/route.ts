import { NextResponse } from "next/server";

/** 410: there is no publish step (revised decision 3) — every generated
 *  version is immediately usable and immutable. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Gone: packages have no publish step (revised decision 3). POST /api/bridge/knowledge/generation-runs creates an immediately usable immutable version.",
    },
    { status: 410 },
  );
}
