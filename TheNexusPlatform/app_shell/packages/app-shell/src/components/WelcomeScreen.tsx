/**
 * Start screen — spec §11.1. Everything on it (title, subtitle, role buttons,
 * their order/visibility/flow tags, footer) comes from AppShellConfig.
 */
import type { AppShellConfig, RoleButton } from "../types";
import { Mark } from "./Chrome";

const FLOW_LABEL: Record<RoleButton["entryFlow"], string | null> = {
  signup: null,
  signin: null,
  apply: "apply",
  invite_only: "invite only",
};

export function WelcomeScreen({ config, onPickRole }: { config: AppShellConfig; onPickRole: (r: RoleButton) => void }) {
  const buttons = config.roleButtons.filter((r) => r.visible).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="welcome">
      <div className="rise d1">
        <Mark glyph={config.branding.markGlyph} />
      </div>
      <p className="welcome-kicker rise d2">{config.identity.shortName}</p>
      <h1 className="rise d2">{config.copy.welcomeTitle}</h1>
      {config.copy.welcomeSubtitle && <p className="welcome-sub rise d3">{config.copy.welcomeSubtitle}</p>}

      <div className="role-grid">
        {buttons.map((r, i) => {
          const tag = FLOW_LABEL[r.entryFlow];
          return (
            <button key={r.key} className={`role-btn rise d${Math.min(4 + i, 6)}`} onClick={() => onPickRole(r)}>
              <span className="role-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="role-copy">
                <span className="role-label">
                  {r.label}
                  {tag && <span className="flow-tag">{tag}</span>}
                </span>
                {r.description && <span className="role-desc">{r.description}</span>}
              </span>
              <span className="role-arrow">→</span>
            </button>
          );
        })}
      </div>

      <div className="welcome-footer rise d6">
        <span>{config.copy.footerText}</span>
        <span>
          v{config.version} · {config.build.environment}
        </span>
      </div>
    </div>
  );
}
