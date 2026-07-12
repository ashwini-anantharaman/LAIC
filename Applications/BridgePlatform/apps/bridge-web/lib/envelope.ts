// Cross-platform event envelope wrapping (Shared Data Model §11): the shape
// every platform publishes in, so Coaching can consume bridge events without
// bridge-specific parsing. Context comes from the session's tenant snapshot.

import type { BridgeSessionRecord } from "@bridge/sessions";
import type { GameEvent } from "@bridge/events";
import type { PlatformContext, PlatformEventEnvelope } from "@laic/learner-contracts";

export function contextOf(record: BridgeSessionRecord): PlatformContext {
  return {
    appId: record.context.appId,
    programId: record.context.programId,
    domainId: "bridge",
    organizationScopeId: record.context.programOrganizationId,
    groupId: record.context.groupId,
  };
}

export function wrapEvent(
  record: BridgeSessionRecord,
  e: GameEvent,
): PlatformEventEnvelope<GameEvent> {
  const actorSeat = "seat" in e ? e.seat : undefined;
  const occupant = actorSeat ? record.seats[actorSeat]?.occupantId : undefined;
  return {
    id: `${record.bridgeSessionId}#${e.seq}`,
    eventType: `bridge.${e.category}`,
    sourcePlatform: "bridge",
    context: contextOf(record),
    actorUserId: occupant,
    objectType: "bridge_session",
    objectId: record.bridgeSessionId,
    payload: e,
    createdAt: new Date(e.ts).toISOString(),
  };
}
