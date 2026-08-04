"use server";

// Saved-view writes for the component tester. A saved view is a name + the
// current URL-state (the whole grid lives in the query string). Both actions
// are gated by the same page key that gates the tester itself, so only the
// admin-area roles that can open the harness can persist views.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { TesterView } from "@bridge/tester-views";
import { requireContext } from "@/lib/api";
import { requireFeature } from "@/lib/access";
import { testerViewStore } from "@/lib/testerViews";

const ROUTE = "/bridge/component-tester";

/** Persist the current grid as a named view. */
export async function saveViewAction(name: string, config: Record<string, string>): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.component_tester");
  const trimmed = name.trim();
  if (!trimmed) return;
  const view: TesterView = {
    id: `tv_${randomUUID()}`,
    name: trimmed.slice(0, 80),
    config,
    createdBy: context.nexusUserId,
    createdAt: new Date().toISOString(),
  };
  await testerViewStore().put(view);
  revalidatePath(ROUTE);
}

/** Delete a saved view by id. */
export async function deleteViewAction(id: string): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.component_tester");
  await testerViewStore().delete(id);
  revalidatePath(ROUTE);
}
