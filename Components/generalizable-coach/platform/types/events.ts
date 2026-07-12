/**
 * Zone 2 — Domain Contracts: generic activity event envelope.
 *
 * The platform core never mentions "bridge". A domain supplies its own
 * TAction payload type; the envelope stays domain-agnostic.
 */
export interface ActivityEvent<TAction = unknown> {
  eventId: string;
  /** e.g., "bridge_gameplay" */
  domainId: string;
  /** e.g., "bid_made", "hint_requested", "deal_started" */
  eventType: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  sessionId: string;
  /** the learnerId */
  actorId: string;
  /** domain-specific payload */
  action: TAction;
}
