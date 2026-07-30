/**
 * Test 1 — a throwaway operator tab used to demonstrate the "add a feature"
 * flow end-to-end: catalogue capability → role-builder area → nav gating.
 * Visible only to operators whose role holds `nexus.test1.view` (Super Admins
 * always see it). Disabling the Test 1 area on a role hides this tab.
 */
import { PageHeader } from "@/nexus/ui/kit";

export function Test1() {
  return (
    <div>
      <PageHeader title="Test 1" subtitle="Demo tab gated by the nexus.test1.view capability." />
      <div className="glass-card p-6 text-sm text-muted-foreground">
        If you can see this tab, your operator role holds <code>nexus.test1.view</code> (or
        you're a platform Super Admin). Turn the “Test 1” area off on a custom operator role and
        this tab disappears for anyone with that role.
      </div>
    </div>
  );
}
