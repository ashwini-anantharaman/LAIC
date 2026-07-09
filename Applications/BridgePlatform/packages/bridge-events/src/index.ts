/**
 * @bridge/events
 *
 * Base package: the shared bridge vocabulary plus the event-sourcing
 * infrastructure ported from the bridgebot prototype — four event categories
 * (bid/play action events + bid/play logic events), typed mitt bus, and the
 * append-only event log. Higher packages (@bridge/engine, @bridge/formats)
 * build on this; @bridge/engine re-exports the vocabulary.
 */

export * from "./vocabulary";
export * from "./types";
export { createBus, type Bus, type BusEvents } from "./bus";
export { createEventLog, type EventLog } from "./log";
