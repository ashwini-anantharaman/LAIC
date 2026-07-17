import type { AppShellConfig, PreviewScreen } from "../types";
import { StartScreen } from "./screens/StartScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";

/**
 * Controlled preview of the configured app. The parent owns which screen and
 * role are showing; clicking through the screens also advances them, so the
 * same component powers both the side-panel preview and full-screen Preview.
 */
export function AppPreview({
  config,
  screen,
  role,
  onScreen,
  onRole,
}: {
  config: AppShellConfig;
  screen: PreviewScreen;
  role: string;
  onScreen: (s: PreviewScreen) => void;
  onRole: (r: string) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[#f8f8fb]">
      <div className="relative flex items-center justify-between px-5 pb-0.5 pt-3">
        <span className="text-[9px] font-bold text-gray-500">9:41</span>
        <span className="text-[9px] font-semibold text-gray-500">{config.name}</span>
        <span className="text-[9px] text-gray-500">•••</span>
      </div>

      <div className="min-h-0 flex-1">
        {screen === "start" && (
          <StartScreen
            config={config}
            onPickRole={(r) => {
              onRole(r);
              onScreen("signin");
            }}
          />
        )}
        {screen === "signin" && (
          <SignInScreen
            config={config}
            role={role}
            onBack={() => onScreen("start")}
            onContinue={() => onScreen("onboarding")}
          />
        )}
        {screen === "onboarding" && (
          <OnboardingScreen config={config} onBack={() => onScreen("signin")} onDone={() => onScreen("home")} />
        )}
        {screen === "home" && <HomeScreen config={config} role={role} />}
      </div>
    </div>
  );
}
