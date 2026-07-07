import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// Entry: the backend-connected auth flow (landing → login/signup → org setup →
// dashboard). From the dashboard, "Open Platform" opens the persona prototype
// (Organization / Coach / Learner flows) — see src/prototype/.
createRoot(document.getElementById("root")!).render(<App />);
