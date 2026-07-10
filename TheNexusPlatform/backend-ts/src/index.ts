import { serve } from "@hono/node-server";

import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT ?? 8000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Life in AI Center API listening on http://localhost:${info.port}`);
});
