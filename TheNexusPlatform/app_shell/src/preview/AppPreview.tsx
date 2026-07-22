import { useState } from "react";
import type { AppShellConfig, ContentConnection, PreviewScreen } from "../types";
import { contentOf } from "../data/constants";
import { StartScreen } from "./screens/StartScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PlatformScreen } from "./screens/PlatformScreen";

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
  // Which content connection is open. Local state: the stepper never jumps
  // here directly — a "platform" screen with nothing open falls back to the
  // first connected platform (or home if none is connected).
  const [openConnection, setOpenConnection] = useState<ContentConnection | null>(null);
  const platformConnection = openConnection ?? contentOf(config).connections.find((c) => c.enabled) ?? null;

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
        {screen === "home" && (
          <HomeScreen
            config={config}
            role={role}
            onOpenPlatform={(conn) => {
              setOpenConnection(conn);
              onScreen("platform");
            }}
          />
        )}
        {screen === "platform" &&
          (platformConnection ? (
            <PlatformScreen config={config} connection={platformConnection} role={role} onBack={() => onScreen("home")} />
          ) : (
            <HomeScreen config={config} role={role} />
          ))}
      </div>
    </div>
  );
}
