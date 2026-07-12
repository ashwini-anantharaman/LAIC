import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./demo.css"; // demo chrome only — the shell's stylesheet ships with @laic/app-shell

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
