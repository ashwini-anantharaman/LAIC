import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { assertServerConfig, config } from "./lib/config.js";
import agentRoutes from "./routes/agents.js";
import ragRoutes from "./routes/rag.js";
import dataRoutes from "./routes/data.js";

assertServerConfig();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(
  "/api/media/animations",
  express.static(path.join(process.cwd(), "server/data/animations"), {
    maxAge: "7d",
    setHeaders(res) {
      res.setHeader("Content-Type", "video/mp4");
    },
  })
);

app.use("/api/agents", agentRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api", dataRoutes);

app.listen(config.port, () => {
  console.log(`[LAIC] API server http://localhost:${config.port}`);
});
