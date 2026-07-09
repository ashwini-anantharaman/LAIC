/**
 * Coach CLI harness (LAIC §11.2) — M0 scope.
 *
 * "Your tests are the host": this tiny CLI acts as a host, sending an
 * ActivityEvent through the real Coach service (validate → persist to the raw
 * event log) and printing the result + the stored log. It grows in later
 * milestones to print the full AdaptiveCoachResponse + trace once the pipeline
 * is wired behind the service.
 *
 * Run under tsx so it can import the TypeScript service:
 *   npm run cli -- --domain bridge_gameplay --learner L1 --type bid_made --action '{"bid":"1NT"}'
 */
import { createCoachService } from "../api/coachService.ts";
import { CONTRACTS_SCHEMA_VERSION } from "../contracts/index.ts";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) args[key] = argv[i + 1];
  }
  return args;
}

const a = parseArgs(process.argv.slice(2));
const domain = a.domain ?? "bridge_gameplay";
const learner = a.learner ?? "L1";
const sessionId = a.session ?? "cli-session";
const eventType = a.type ?? "bid_made";
let action = {};
if (a.action) {
  try {
    action = JSON.parse(a.action);
  } catch {
    console.error(`--action must be valid JSON, got: ${a.action}`);
    process.exit(1);
  }
}

const event = {
  schemaVersion: CONTRACTS_SCHEMA_VERSION,
  eventId: `cli-${Date.now()}`,
  domainId: domain,
  eventType,
  timestamp: new Date().toISOString(),
  sessionId,
  actorId: learner,
  action,
};

const { app } = createCoachService();
const server = app.listen(0, async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  console.log("→ POST /api/coaching/events");
  console.log(JSON.stringify(event, null, 2));

  const res = await fetch(`${base}/api/coaching/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  console.log(`\n← ${res.status} ${res.statusText}`);
  console.log(JSON.stringify(await res.json(), null, 2));

  const log = await fetch(`${base}/api/coaching/events?sessionId=${sessionId}`).then((r) => r.json());
  console.log(`\nRaw event log for session "${sessionId}" (${log.events.length}):`);
  console.log(JSON.stringify(log.events, null, 2));

  server.close(() => process.exit(res.ok ? 0 : 1));
});
