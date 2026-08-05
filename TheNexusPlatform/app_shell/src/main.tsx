import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Studio } from "./studio/Studio";
import { Player, MissingLinkScreen } from "./player/Player";
import { LivePlayer } from "./player/live/LivePlayer";
import { resolvePlayerTarget } from "./share";

/**
 * Dependency-free routing:
 *   ?live=<slug>&api=…   →  the LIVE published app (real boot + auth + backend)
 *   #config=… or ?app=…  →  the standalone mock Player (a design preview)
 *   otherwise            →  the Studio (the design tool)
 */
function Root() {
  const target = resolvePlayerTarget();
  if (target.mode === "live") return <LivePlayer slug={target.slug} api={target.api} />;
  if (target.mode === "config") return <Player config={target.config} />;
  if (target.mode === "missing") return <MissingLinkScreen id={target.id} />;
  return <Studio />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
