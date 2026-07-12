import { useEffect, useState } from "react";
import { listAuditEvents } from "../../services/api";
import type { AuditEvent } from "../../types/platform";
import { BORDER, MUTED, FONT_BODY } from "../theme";

// Keep the dashboard focused: show only the latest couple of events by default.
const PREVIEW_COUNT = 2;

// Humanized labels for audit actions. Anything unlisted falls back to the raw
// action string, so new backend events show up without a frontend change.
const ACTION_LABELS: Record<string, string> = {
  "organization.created": "created the organization",
  "organization.setup_completed": "completed organization setup",
  "organization.theme_updated": "updated the theme",
  "program.created": "created a program",
  "program.deleted": "deleted a program",
  "offering.created": "created an offering",
  "offering.deleted": "deleted an offering",
  "offering.updated": "updated an offering",
  "offering.published": "published an offering",
  "offering.closed": "closed an offering",
  "registered_app.created": "registered an app",
  "registered_app.updated": "updated an app",
  "registered_app.key_rotated": "rotated an app API key",
  "registered_app.revoked": "revoked an app",
  "registration.hook_received": "received an app signup",
  "registration.admin_added": "added a participant directly",
  "registration.approved": "approved a registration",
  "registration.rejected": "rejected a registration",
  "registration.student_joined": "student joined via join code",
  "member.added": "added a member",
  "member.joined": "joined the organization",
  "member.access_updated": "changed a member's access",
  "integration.created": "connected an integration",
  "entitlement.enabled": "enabled a module",
  "entitlement.disabled": "disabled a module",
};

function describe(e: AuditEvent): string {
  const actor = e.actor_name || (e.action === "registration.hook_received" ? "An app" : "System");
  const verb = ACTION_LABELS[e.action] || e.action;
  const meta = e.metadata || {};
  const detail =
    (meta.name as string) ||
    (meta.app_name as string) ||
    (meta.email as string) ||
    (meta.module as string) ||
    "";
  return detail ? `${actor} ${verb} — ${detail}` : `${actor} ${verb}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ orgId }: { orgId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    listAuditEvents(orgId, 50)
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load activity"));
  }, [orgId]);

  const visible = expanded ? events : events?.slice(0, PREVIEW_COUNT);

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Recent Activity
        </p>
        {events && events.length > PREVIEW_COUNT && (
          <button
            type="button" onClick={() => setExpanded((v) => !v)}
            className="text-[11px] underline underline-offset-2 hover:text-white transition-colors focus:outline-none"
            style={{ color: MUTED, fontFamily: FONT_BODY }}
          >
            {expanded ? "Show less" : `Show all ${events.length}`}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400" style={{ fontFamily: FONT_BODY }}>{error}</p>}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.03)" }}>
        {visible?.map((e, i) => (
          <div
            key={e.id}
            className="px-5 py-3 flex items-center justify-between gap-4"
            style={{ borderBottom: i < visible.length - 1 ? `1px solid ${BORDER}` : "none" }}
          >
            <p className="text-sm text-white/70 truncate" style={{ fontFamily: FONT_BODY }}>{describe(e)}</p>
            <p className="text-[11px] flex-shrink-0" style={{ color: MUTED, fontFamily: FONT_BODY }}>{relativeTime(e.created_at)}</p>
          </div>
        ))}
        {events && events.length === 0 && (
          <div className="px-5 py-3 text-sm text-white/28" style={{ fontFamily: FONT_BODY }}>No activity recorded yet</div>
        )}
        {!events && !error && (
          <div className="px-5 py-3 text-sm text-white/28" style={{ fontFamily: FONT_BODY }}>Loading…</div>
        )}
      </div>
    </div>
  );
}
