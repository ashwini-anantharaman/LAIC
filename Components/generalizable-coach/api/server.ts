/**
 * Entry point for the standalone Coach service (LAIC M0).
 *
 *   npm run start:coach     # listens on COACH_PORT or 3100
 */
import { createCoachService } from "./coachService.js";

const port = Number(process.env.COACH_PORT ?? 3100);
const { app } = createCoachService();

app.listen(port, () => {
  process.stdout.write(`LAIC Coach service listening on http://localhost:${port}\n`);
  process.stdout.write(`  POST /api/coaching/events   (validated ActivityEvent ingest)\n`);
  process.stdout.write(`  GET  /health\n`);
});
