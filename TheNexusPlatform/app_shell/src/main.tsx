import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Studio } from "./studio/Studio";
import { Player, MissingLinkScreen } from "./player/Player";
import { resolvePlayerTarget } from "./share";

/**
 * Dependency-free routing:
 *   #config=… or ?app=…  →  the standalone Player (a published app)
 *   otherwise            →  the Studio (the design tool)
 */
function Root() {
  const target = resolvePlayerTarget();
  if (target.mode === "config") return <Player config={target.config} />;
  if (target.mode === "missing") return <MissingLinkScreen id={target.id} />;
  return <Studio />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
