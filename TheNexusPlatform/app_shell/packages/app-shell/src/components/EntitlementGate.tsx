/**
 * Entitlement gate. Consumers wrap anything behind the door with this: if the
 * launch context lacks the required key, the children are not rendered (and,
 * when the consumer lazy-loads them, never even fetched).
 */
import type { AppShellConfig, LaunchContext } from "../types";

export function EntitlementGate({
  required,
  config,
  ctx,
  onNavigate,
  children,
}: {
  required?: string;
  config: AppShellConfig;
  ctx: LaunchContext;
  onNavigate: (to: string) => void;
  children: React.ReactNode;
}) {
  if (!required || ctx.entitlements.includes(required)) return <>{children}</>;

  const upsell = config.entitlements.coachUpsellEnabled;
  return (
    <div className="gate rise d1">
      <div className="gate-icon">◈</div>
      <h3>This area is locked</h3>
      <div>
        <span className="gate-key">requires: {required}</span>
      </div>
      <p>
        Your {ctx.selectedRole.replace(/_/g, " ")} account doesn't include this entitlement yet.
        {upsell
          ? " Upgrading unlocks the full toolkit."
          : " Ask your program administrator to enable it for you."}
      </p>
      <button
        className="btn-primary"
        onClick={() => onNavigate((upsell && config.entitlements.upgradeRoute) || config.navigation.homeRoute)}
      >
        {upsell ? "See upgrade options" : "Back to home"}
      </button>
    </div>
  );
}
