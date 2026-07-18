/**
 * Phase 1 — the tenant door. Unit tests over the residency routing decision:
 * shared orgs run on the shared pool; dedicated orgs FAIL LOUDLY until the
 * provisioning flow exists; residency lookups are cached; privileged
 * transactions demand a reason. No Postgres required (injected seams).
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  privilegedTransaction,
  resetResidencyCache,
  residencyFor,
  setDbSupplierForTests,
  setResidencyFetcherForTests,
  tenantTransaction,
  type Residency,
} from "../src/db/tenantDoor";

/** A fake Drizzle db: transaction() hands fn a tx whose execute() is recorded. */
function fakeDb(executed: unknown[]) {
  return {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ execute: async (q: unknown) => executed.push(q) }),
  } as never;
}

afterEach(() => {
  setResidencyFetcherForTests(null);
  setDbSupplierForTests(null);
  resetResidencyCache();
});

describe("tenant door", () => {
  it("runs a shared org's transaction on the shared pool with RLS context bound", async () => {
    const executed: unknown[] = [];
    setDbSupplierForTests(() => fakeDb(executed));
    setResidencyFetcherForTests(async () => "shared");

    const result = await tenantTransaction({ userId: "user-1", orgId: "org-1" }, async () => "ran");
    expect(result).toBe("ran");
    // Two SET LOCALs: app.current_user_id GUC + the non-bypass nexus_app role.
    expect(executed).toHaveLength(2);
  });

  it("fails loudly for a dedicated org until provisioning exists", async () => {
    setDbSupplierForTests(() => fakeDb([]));
    setResidencyFetcherForTests(async () => "dedicated");

    await expect(
      tenantTransaction({ userId: "user-1", orgId: "org-ded" }, async () => "never"),
    ).rejects.toThrow(/dedicated.*not.*provisioned|no dedicated/i);
  });

  it("routes to the shared pool when the org is not determinable (orgId null)", async () => {
    const executed: unknown[] = [];
    setDbSupplierForTests(() => fakeDb(executed));
    setResidencyFetcherForTests(async () => {
      throw new Error("residency must not be fetched without an orgId");
    });

    await expect(tenantTransaction({ userId: null }, async () => "ok")).resolves.toBe("ok");
  });

  it("caches residency per org until reset", async () => {
    const seen: string[] = [];
    setResidencyFetcherForTests(async (orgId): Promise<Residency> => {
      seen.push(orgId);
      return "shared";
    });

    await residencyFor("org-a");
    await residencyFor("org-a");
    expect(seen).toEqual(["org-a"]);

    resetResidencyCache();
    await residencyFor("org-a");
    expect(seen).toEqual(["org-a", "org-a"]);
  });

  it("privileged transactions demand a reason", async () => {
    const executed: unknown[] = [];
    setDbSupplierForTests(() => fakeDb(executed));

    await expect(privilegedTransaction("", async () => "x")).rejects.toThrow(/reason/);
    await expect(
      privilegedTransaction("identity bootstrap at login", async () => "x"),
    ).resolves.toBe("x");
    // Privileged path binds NO tenant context (runs as the connecting role).
    expect(executed).toHaveLength(0);
  });

  it("still refuses a dedicated org on the privileged path", async () => {
    setDbSupplierForTests(() => fakeDb([]));
    setResidencyFetcherForTests(async () => "dedicated");
    await expect(
      privilegedTransaction("test", async () => "x", { orgId: "org-ded" }),
    ).rejects.toThrow(/dedicated/i);
  });
});
