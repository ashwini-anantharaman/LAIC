/**
 * The LIVE published app. It renders the EXACT screens designed in the Studio
 * (the same components the preview uses), driven by real behavior: it boots the
 * published config from Nexus, authenticates a real student, runs onboarding
 * (saved to Postgres), and shows the designed home. "Published == what you
 * designed" — same pixels, real backend.
 */
import { useEffect, useState } from "react";

import { contentOf } from "../../data/constants";
import type { AppShellConfig, ContentConnection, PreviewScreen } from "../../types";
import { StartScreen } from "../../preview/screens/StartScreen";
import { SignInScreen } from "../../preview/screens/SignInScreen";
import { OnboardingScreen, type OnboardingAnswers } from "../../preview/screens/OnboardingScreen";
import { HomeScreen } from "../../preview/screens/HomeScreen";
import { PlatformScreen } from "../../preview/screens/PlatformScreen";
import { DEFAULT_BASE_URL } from "../../nexus/client";
import {
  clearPlayerSession,
  fetchBootConfig,
  getMyData,
  launchBridge,
  loadPlayerSession,
  loginStudent,
  putMyData,
  savePlayerSession,
  validateToken,
  type BootConfig,
  type PlayerSession,
} from "./api";

type Phase = "booting" | "error" | "ready";

const numKeys = (a: Record<string, unknown>): OnboardingAnswers =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [Number(k), v as string | string[]]));
const strKeys = (a: OnboardingAnswers): Record<string, unknown> =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [String(k), v]));

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#0b0f1a]">
      <div className="relative flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-[#0E1320] shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export function LivePlayer({ slug, api }: { slug: string; api: string | null }) {
  const baseUrl = (api || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const [phase, setPhase] = useState<Phase>("booting");
  const [boot, setBoot] = useState<BootConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Runtime state for the designed screens.
  const [screen, setScreen] = useState<PreviewScreen>("start");
  const [role, setRole] = useState("");
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [openConnection, setOpenConnection] = useState<ContentConnection | null>(null);

  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [obBusy, setObBusy] = useState(false);
  const [obError, setObError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  // When set, a connected platform (Bridge) is loaded IN-APP via an iframe —
  // the student stays inside the app frame instead of navigating away.
  const [embed, setEmbed] = useState<{ url: string; label: string } | null>(null);

  const config: AppShellConfig | null = boot?.studio ?? null;
  // "Create an account" target: top-level (Studio URL or the program's
  // auto-resolved sign-up gate), falling back to the studio config field.
  const signupGateUrl = boot?.signupGateUrl || boot?.studio?.signupGateUrl || null;

  function landingScreen(b: BootConfig, onboardingDone: boolean): PreviewScreen {
    const questions = b.studio?.onboardingQuestions ?? [];
    return !onboardingDone && questions.length > 0 ? "onboarding" : "home";
  }

  // Boot: fetch the published config, resume a stored session if its token still
  // validates and it's still an enrolled participant.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const b = await fetchBootConfig(baseUrl, slug);
        if (!live) return;
        setBoot(b);
        const stored = loadPlayerSession(slug);
        if (stored && (await validateToken(baseUrl, stored.token))) {
          const data = await getMyData(baseUrl, slug, stored.token).catch(() => null);
          if (live && data?.enrolled) {
            setSession(stored);
            setAnswers(numKeys(data.answers ?? {}));
            setScreen(landingScreen(b, data.onboarding_completed));
            setPhase("ready");
            return;
          }
          clearPlayerSession(slug);
        }
        if (live) setPhase("ready");
      } catch (e) {
        if (live) {
          setBootError(e instanceof Error ? e.message : "Couldn't load this app.");
          setPhase("error");
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, slug]);

  useEffect(() => {
    if (boot) document.title = boot.identity.displayName || "App";
  }, [boot]);

  async function handleSignIn(email: string, password: string) {
    if (!boot || !email || !password) return;
    setSignInBusy(true);
    setSignInError(null);
    try {
      if (!boot.org) throw new Error("This app isn't linked to an organization yet.");
      const s = await loginStudent(baseUrl, boot.org.slug, email, password);
      if (!s.participantOnly) throw new Error("This app is for students. Staff sign in through the Nexus console.");
      const data = await getMyData(baseUrl, slug, s.token);
      if (!data.enrolled) throw new Error("You're not enrolled in this program yet. Ask your organization to add you.");
      savePlayerSession(slug, s);
      setSession(s);
      setAnswers(numKeys(data.answers ?? {}));
      setScreen(landingScreen(boot, data.onboarding_completed));
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleOnboardingDone(a: OnboardingAnswers) {
    if (!session) return;
    setObBusy(true);
    setObError(null);
    try {
      const saved = await putMyData(baseUrl, slug, session.token, {
        answers: strKeys(a),
        onboarding_completed: true,
      });
      setAnswers(numKeys(saved.answers ?? strKeys(a)));
      setScreen("home");
    } catch (err) {
      setObError(err instanceof Error ? err.message : "Couldn't save your answers");
    } finally {
      setObBusy(false);
    }
  }

  // Tapping a content tile. A Bridge connection launches the REAL Bridge
  // platform: mint a single-use ticket, then redirect the browser there (Bridge
  // exchanges the token for a session). Other platforms still use the preview.
  async function handleOpenPlatform(conn: ContentConnection) {
    if (conn.platform !== "bridge") {
      setOpenConnection(conn);
      setScreen("platform");
      return;
    }
    if (!session || !boot) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const url = await launchBridge(baseUrl, session.token, boot.programContext.programId, window.location.href);
      // Load Bridge IN-APP (iframe) rather than navigating away. `embedded=1`
      // tells Bridge it's hosted here, so it hides its own sign-out (the app
      // owns the session + exit).
      const embedUrl = `${url}${url.includes("?") ? "&" : "?"}embedded=1`;
      setEmbed({ url: embedUrl, label: conn.label || "Bridge" });
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Couldn't open the Bridge Platform.");
    } finally {
      setLaunching(false);
    }
  }

  function signOut() {
    clearPlayerSession(slug);
    setSession(null);
    setAnswers({});
    setRole("");
    setSignInError(null);
    setScreen("start");
  }

  if (phase === "booting") {
    return (
      <Frame>
        <div className="flex h-full items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      </Frame>
    );
  }
  if (phase === "error" || !boot || !config) {
    return (
      <Frame>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="grid size-11 place-items-center rounded-2xl text-lg" style={{ background: "#1C2333", color: "#9AA6BF" }}>!</div>
          <h1 className="text-base font-bold text-white">This app isn't available</h1>
          <p className="max-w-xs text-xs leading-relaxed" style={{ color: "#9AA6BF" }}>
            {bootError ?? "This app was published without a full design."}
          </p>
        </div>
      </Frame>
    );
  }

  const platformConnection = openConnection ?? contentOf(config).connections.find((c) => c.enabled) ?? null;

  // In-app platform view: Bridge (or any connected platform) loaded inside the
  // app frame via an iframe. The student stays in the app; a Back returns home.
  if (embed) {
    return (
      <Frame>
        <div className="flex h-full flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <button
              onClick={() => setEmbed(null)}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              ‹ Back
            </button>
            <span className="flex-1 truncate text-center text-sm font-semibold text-gray-900">{embed.label}</span>
            <span className="w-10" />
          </div>
          <iframe src={embed.url} title={embed.label} className="min-h-0 w-full flex-1 border-0" />
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex h-full flex-col bg-[#0E1320]">
        <div className="relative flex items-center justify-between px-5 pb-0.5 pt-3">
          <span className="text-[9px] font-bold text-white">9:41</span>
          <span className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>{config.name}</span>
          {session ? (
            <button onClick={signOut} className="text-[9px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }} title="Sign out">
              Sign out
            </button>
          ) : (
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>•••</span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {screen === "start" && (
            <StartScreen
              config={config}
              onPickRole={(r) => {
                setRole(r);
                setScreen("signin");
              }}
            />
          )}
          {screen === "signin" && (
            <SignInScreen
              config={config}
              role={role}
              onBack={() => setScreen("start")}
              onContinue={() => setScreen("onboarding")}
              live={{
                onSubmit: handleSignIn,
                busy: signInBusy,
                error: signInError,
                onCreateAccount: signupGateUrl
                  ? () => {
                      window.location.href = signupGateUrl;
                    }
                  : undefined,
              }}
            />
          )}
          {screen === "onboarding" && (
            <OnboardingScreen
              config={config}
              initial={answers}
              busy={obBusy}
              error={obError}
              onBack={() => setScreen(session ? "home" : "signin")}
              onDone={handleOnboardingDone}
            />
          )}
          {screen === "home" && <HomeScreen config={config} role={role} onOpenPlatform={handleOpenPlatform} />}
          {screen === "platform" &&
            (platformConnection ? (
              <PlatformScreen config={config} connection={platformConnection} role={role} onBack={() => setScreen("home")} />
            ) : (
              <HomeScreen config={config} role={role} />
            ))}
        </div>

        {launching ? (
          <div className="absolute inset-0 z-10 grid place-items-center" style={{ background: "rgba(14,19,32,0.72)" }}>
            <div className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        ) : null}
        {launchError ? (
          <button
            onClick={() => setLaunchError(null)}
            className="absolute inset-x-3 bottom-3 z-10 rounded-lg bg-red-600 px-3 py-2 text-left text-xs text-white shadow-lg"
          >
            {launchError} <span className="opacity-70">(tap to dismiss)</span>
          </button>
        ) : null}
      </div>
    </Frame>
  );
}
