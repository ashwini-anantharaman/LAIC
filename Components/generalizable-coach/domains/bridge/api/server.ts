/**
 * Entry point: start the coaching API server.
 * Uses the real Anthropic LLM client (set ANTHROPIC_API_KEY to enable model
 * calls; without it, the coach falls back to canned messages).
 */
import { createServer } from "./createServer";

const port = Number(process.env.PORT ?? 3000);
const app = createServer();

app.listen(port, () => {
  console.log(`LAIC coaching API listening on http://localhost:${port}`);
});
