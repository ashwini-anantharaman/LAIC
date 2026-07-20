/**
 * Bridge People & Roles — thin client over Nexus's central assignment store.
 * The management UI lives HERE (Bridge decides its own role vocabulary and
 * views), but who-holds-what is Nexus data: the same answer drives org-portal
 * logins, test-as, and /bridge/context. http mode only.
 */
import { cookies } from "next/headers";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NEXUS_TOKEN_COOKIE } from "./nexusToken";

export interface BridgePerson {
  email: string | null;
  display_name: string | null;
  status: string;
  bridge_role: string | null;
  is_admin: boolean;
}

/** The real Nexus program uuid rides the context as an additive extension. */
export function nexusProgramId(context: NexusBridgeContext): string | null {
  const ext = context as NexusBridgeContext & { nexus_program_id?: string };
  return ext.nexus_program_id ?? null;
}

async function nexusFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = process.env.NEXUS_API_BASE_URL;
  if (!baseUrl) throw new Error("People & Roles requires NEXUS_API_BASE_URL (http mode)");
  const cookieStore = await cookies();
  const token = cookieStore.get(NEXUS_TOKEN_COOKIE)?.value;
  if (!token) throw new Error("Not signed in through Nexus");
  return fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function listBridgePeople(programId: string): Promise<BridgePerson[]> {
  const res = await nexusFetch(`/api/platform/bridge/people?program_id=${encodeURIComponent(programId)}`);
  if (!res.ok) throw new Error(`Nexus people request failed: ${res.status}`);
  return (await res.json()) as BridgePerson[];
}

export async function setBridgeRole(
  programId: string,
  email: string,
  role: string | null,
): Promise<void> {
  const res = await nexusFetch("/api/platform/bridge/people/role", {
    method: "PUT",
    body: JSON.stringify({ program_id: programId, email, role }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? `Nexus role update failed: ${res.status}`);
  }
}
