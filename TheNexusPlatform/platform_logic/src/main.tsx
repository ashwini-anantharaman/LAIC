import { createRoot } from "react-dom/client";
import NexusApp from "./nexus/NexusApp.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<NexusApp />);
