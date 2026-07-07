/**
 * Zone 3 — Bridge implementation: assemble knowledge packages from the
 * hand-authored JSON chunk files described in each manifest.json.
 *
 *  - Beginner 1 bidding package (opening bids & simple responses)
 *  - Card-play package (Watson's tactics for the play of the hand)
 *  - A combined package covering both, for a coach that spans bidding + play
 */
import type { KnowledgePackage, KnowledgeChunk } from "../../../platform/types/index.js";

import biddingManifest from "./beginner-1/manifest.json";
import openingBids from "./beginner-1/opening-bids.json";
import simpleResponses from "./beginner-1/simple-responses.json";
import handEvaluation from "./beginner-1/hand-evaluation.json";

import cardplayManifest from "./card-play/manifest.json";
import declarerPlay from "./card-play/declarer-play.json";
import defense from "./card-play/defense.json";
import planning from "./card-play/planning.json";

export function loadBeginner1Package(): KnowledgePackage {
  const chunks: KnowledgeChunk[] = [
    ...(openingBids as KnowledgeChunk[]),
    ...(simpleResponses as KnowledgeChunk[]),
    ...(handEvaluation as KnowledgeChunk[]),
  ];
  return {
    packageId: biddingManifest.packageId,
    domainId: biddingManifest.domainId,
    version: biddingManifest.version,
    chunks,
  };
}

export function loadCardPlayPackage(): KnowledgePackage {
  const chunks: KnowledgeChunk[] = [
    ...(declarerPlay as KnowledgeChunk[]),
    ...(defense as KnowledgeChunk[]),
    ...(planning as KnowledgeChunk[]),
  ];
  return {
    packageId: cardplayManifest.packageId,
    domainId: cardplayManifest.domainId,
    version: cardplayManifest.version,
    chunks,
  };
}

/** Combined bidding + card-play knowledge for the full bridge coach. */
export function loadBridgeKnowledge(): KnowledgePackage {
  const bidding = loadBeginner1Package();
  const cardplay = loadCardPlayPackage();
  return {
    packageId: "bridge_gameplay_all_v1",
    domainId: "bridge_gameplay",
    version: "1.0.0",
    chunks: [...bidding.chunks, ...cardplay.chunks],
  };
}
