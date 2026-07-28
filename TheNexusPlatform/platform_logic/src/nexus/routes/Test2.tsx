/**
 * Test 2 — sibling of Test1, gated by `nexus.test2.view`. Together they show
 * that two independent features gate independently: a role can hold one and not
 * the other, and each tab appears/disappears on its own.
 */
import { PageHeader } from "@/nexus/ui/kit";

export function Test2() {
  return (
    <div>
      <PageHeader title="Test 2" subtitle="Demo tab gated by the nexus.test2.view capability." />
      <div className="glass-card p-6 text-sm text-muted-foreground">
        Gated independently from Test 1 by <code>nexus.test2.view</code>. A role can be granted
        Test 1 but not Test 2 (or vice versa) and each tab shows/hides on its own.
      </div>
    </div>
  );
}
