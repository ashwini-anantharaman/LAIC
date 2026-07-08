// Headless demo: runs the real Phase 3 pipeline (generate + publish Beginner
// Natural v0 from the knowledge seed), then plays one board with four AI
// seats and narrates every decision — including the citation chain from rule
// -> readable knowledge item -> source passage.
//
//   pnpm demo          # curated board G1
//   pnpm demo 7        # deterministic seeded deal #7 (any integer)

import { defaultSettingValues } from "@bridge/config";
import {
  BOARD_G1,
  createGame,
  createPackageDecider,
  initialState,
  seededBoard,
  type AsyncDecider,
} from "@bridge/engine";
import {
  callLabel,
  contractLabel,
  createBus,
  createEventLog,
  rankLabel,
  SEAT_LABEL,
  type Card,
  type Seat,
} from "@bridge/events";
import {
  BEGINNER_NATURAL_PACKAGE_ID,
  BEGINNER_NATURAL_V0_SEED,
  InMemoryKnowledgeStore,
  publishPackage,
  resolveRuleProvenance,
  runGeneration,
} from "@bridge/knowledge";

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const handString = (hand: Card[]): string =>
  (["S", "H", "D", "C"] as const)
    .map(
      (s) =>
        GLYPH[s] +
        (hand
          .filter((c) => c.suit === s)
          .sort((a, b) => b.rank - a.rank)
          .map((c) => rankLabel(c.rank))
          .join("") || "—"),
    )
    .join(" ");

async function main() {
  const seedArg = process.argv[2];
  const board = seedArg ? seededBoard(Number(seedArg)) : BOARD_G1;

  // ---- 1. Real pipeline: knowledge seed -> generation -> publication ------
  console.log("═".repeat(72));
  console.log("1. KNOWLEDGE PIPELINE");
  console.log("═".repeat(72));
  const store = new InMemoryKnowledgeStore(BEGINNER_NATURAL_V0_SEED);
  const run = await runGeneration(store, {
    systemFamily: "natural",
    requestedBy: "demo",
    now: new Date().toISOString(),
    runId: "run_demo",
  });
  console.log(
    `Generated ${run.resultPackageId}@${run.resultVersion} from ${run.inputItems.length} approved knowledge items` +
      ` (${run.diff?.bidRules.length} bid rules, ${run.diff?.playRules.length} play rules, ${run.diff?.settings.length} setting)`,
  );
  const record = await publishPackage(
    store,
    BEGINNER_NATURAL_PACKAGE_ID,
    run.resultVersion!,
    "demo",
    new Date().toISOString(),
  );
  console.log(`Published (provenance gate passed: every entry approved + cited)\n`);

  // ---- 2. Play the board ---------------------------------------------------
  console.log("═".repeat(72));
  console.log(`2. BOARD: ${board.name}  (dealer ${SEAT_LABEL[board.dealer]}, none vul)`);
  console.log("═".repeat(72));
  for (const seat of ["N", "E", "S", "W"] as Seat[])
    console.log(`  ${seat}: ${handString(board.hands[seat])}`);

  const bus = createBus();
  const log = createEventLog(bus);
  const decider = createPackageDecider({
    pkg: record.pkg,
    values: defaultSettingValues(record.pkg.settings),
  });
  const deciders: Record<Seat, AsyncDecider> = { N: decider, E: decider, S: decider, W: decider };
  const game = createGame(
    bus,
    deciders,
    initialState(board.name, board.dealer, board.vul, board.hands),
  );
  let guard = 0;
  while (game.getState().phase !== "complete" && guard++ < 400) await game.step();
  const state = game.getState();

  console.log("\nAUCTION (every call is a cited rule — zero fallbacks):");
  for (const e of log.filter("bid-logic-event")) {
    console.log(`  ${e.seat}: ${callLabel(e.chosen).padEnd(5)} ← ${e.reason}`);
  }

  if (state.contract) {
    console.log(`\nCONTRACT: ${contractLabel(state.contract)}`);
    console.log("\nPLAY:");
    state.tricks.forEach((t, i) => {
      const cards = t.plays
        .map((p) => `${p.seat}:${GLYPH[p.card.suit]}${rankLabel(p.card.rank)}`)
        .join(" ");
      console.log(`  trick ${String(i + 1).padStart(2)}: ${cards}  → ${t.winner}`);
    });
    console.log(
      `\nRESULT: ${contractLabel(state.contract)} — declarer side takes ${
        state.contract.declarer === "N" || state.contract.declarer === "S"
          ? state.trickCount.NS
          : state.trickCount.EW
      } tricks (NS ${state.trickCount.NS} / EW ${state.trickCount.EW})`,
    );
  } else {
    console.log("\nRESULT: passed out");
  }

  // ---- 3. Citation chain for the rules that acted --------------------------
  console.log("\n" + "═".repeat(72));
  console.log("3. WHY? — citation chain for the first three distinct rules used");
  console.log("═".repeat(72));
  const usedRuleIds = [
    ...new Set(
      [...log.filter("bid-logic-event"), ...log.filter("play-logic-event")]
        .map((e) => e.trace.find((r) => r.matched)?.ruleId)
        .filter((id): id is string => !!id),
    ),
  ].slice(0, 3);

  for (const ruleId of usedRuleIds) {
    const p = await resolveRuleProvenance(
      store,
      BEGINNER_NATURAL_PACKAGE_ID,
      record.version,
      ruleId,
    );
    if (!p) continue;
    console.log(`\n  rule ${ruleId} — "${p.ruleTitle}"`);
    for (const item of p.items) {
      console.log(`    ↳ knowledge item ${item.itemId} (${item.itemType}, v${item.version}, ${item.status})`);
      console.log(`      "${item.humanReadableRule}"`);
    }
    for (const c of p.citations) console.log(`    ↳ ${c.sourceId}: ${c.passage}`);
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
