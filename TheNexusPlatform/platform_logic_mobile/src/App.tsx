import { Navigate, Route, Routes } from "react-router";
import { SessionProvider } from "./session";
import { PortalScreen } from "./screens/Portal";
import { HomeScreen } from "./screens/Home";
import { ProgramScreen } from "./screens/Program";

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/@/:slug" element={<PortalScreen />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/p/:programId" element={<ProgramScreen />} />
        <Route path="*" element={<Navigate to="/@/life-in-ai-center" replace />} />
      </Routes>
    </SessionProvider>
  );
}
