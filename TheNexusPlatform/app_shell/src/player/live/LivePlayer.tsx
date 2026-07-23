/**
 * The LIVE published app — the real thing, not the design mock. It boots its
 * config from Nexus by slug, authenticates a real student (the org's
 * participant), and runs the app. Phase 1: boot + sign-in + student gate + a
 * basic home. Onboarding + profile land in later phases.
 */
import { useEffect, useState, type FormEvent } from "react";

import { DEFAULT_BASE_URL } from "../../nexus/client";
import {
  clearPlayerSession,
  fetchBootConfig,
  loadPlayerSession,
  loginStudent,
  savePlayerSession,
  validateToken,
  type BootConfig,
  type PlayerSession,
} from "./api";

type Phase = "booting" | "error" | "signin" | "app";

/** Mobile-width column on a dark backdrop — same frame as the mock Player. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#0b0f1a]">
      <div className="relative flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-[#f8f8fb] shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">{children}</div>;
}

function Brand({ boot, size = 44 }: { boot: BootConfig; size?: number }) {
  const accent = boot.branding.primaryColor || "#4f46e5";
  const logoUrl = boot.studio?.logoUrl;
  const glyph = boot.studio?.logoInitials || boot.branding.markGlyph || (boot.identity.displayName || "A").slice(0, 1).toUpperCase();
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="rounded-2xl object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="grid place-items-center rounded-2xl font-bold text-white"
      style={{ width: size, height: size, background: accent, fontSize: size * 0.4 }}
    >
      {glyph}
    </div>
  );
}

export function LivePlayer({ slug, api }: { slug: string; api: string | null }) {
  const baseUrl = (api || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const [phase, setPhase] = useState<Phase>("booting");
  const [boot, setBoot] = useState<BootConfig | null>(null);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Boot: fetch the published config, then resume a stored session if its token
  // still validates. A dead/rejected token drops to sign-in.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const b = await fetchBootConfig(baseUrl, slug);
        if (!live) return;
        setBoot(b);
        const stored = loadPlayerSession(slug);
        if (stored && (await validateToken(baseUrl, stored.token))) {
          if (!live) return;
          setSession(stored);
          setPhase("app");
          return;
        }
        if (stored) clearPlayerSession(slug);
        if (live) setPhase("signin");
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
  }, [baseUrl, slug]);

  // Tab title + theme color follow the app's identity.
  useEffect(() => {
    if (!boot) return;
    document.title = boot.identity.displayName || "App";
  }, [boot]);

  if (phase === "booting") {
    return (
      <Frame>
        <Centered>
          <div className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </Centered>
      </Frame>
    );
  }
  if (phase === "error" || !boot) {
    return (
      <Frame>
        <Centered>
          <div className="grid size-11 place-items-center rounded-2xl bg-gray-200 text-lg text-gray-500">!</div>
          <h1 className="text-base font-bold text-gray-900">This app isn't available</h1>
          <p className="max-w-xs text-xs leading-relaxed text-gray-500">{bootError}</p>
        </Centered>
      </Frame>
    );
  }
  if (phase === "signin" || !session) {
    return (
      <Frame>
        <LiveSignIn
          boot={boot}
          baseUrl={baseUrl}
          onSignedIn={(s) => {
            savePlayerSession(slug, s);
            setSession(s);
            setPhase("app");
          }}
        />
      </Frame>
    );
  }
  return (
    <Frame>
      <LiveHome
        boot={boot}
        session={session}
        onSignOut={() => {
          clearPlayerSession(slug);
          setSession(null);
          setPhase("signin");
        }}
      />
    </Frame>
  );
}

function LiveSignIn({
  boot,
  baseUrl,
  onSignedIn,
}: {
  boot: BootConfig;
  baseUrl: string;
  onSignedIn: (s: PlayerSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = boot.branding.primaryColor || "#4f46e5";
  const welcome = boot.studio?.welcomeTitle || boot.copy.welcomeTitle || `Sign in to ${boot.identity.displayName}`;
  const subtitle = boot.studio?.welcomeSubtitle || boot.copy.welcomeSubtitle || "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!boot.org) throw new Error("This app isn't linked to an organization yet — ask your program admin.");
      const s = await loginStudent(baseUrl, boot.org.slug, email.trim(), password);
      // The student app admits ONLY learner-participant sessions. Staff (org/
      // program admins) have a place in the Nexus console, not here.
      if (!s.participantOnly) {
        throw new Error("This app is for students. Staff sign in through the Nexus console.");
      }
      onSignedIn(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-gray-400";

  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-14">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Brand boot={boot} />
        <div>
          <h1 className="text-lg font-bold text-gray-900">{welcome}</h1>
          {subtitle ? <p className="mt-1 text-xs leading-relaxed text-gray-500">{subtitle}</p> : null}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          placeholder="Email address"
          required
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          placeholder="Password"
          required
        />
        {error ? <p className="text-xs leading-relaxed text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: accent }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-auto pt-6 text-center text-[10px] leading-relaxed text-gray-400">
        {boot.org?.name ?? "Your organization"} · sign in with the account you registered.
      </p>
    </div>
  );
}

function LiveHome({
  boot,
  session,
  onSignOut,
}: {
  boot: BootConfig;
  session: PlayerSession;
  onSignOut: () => void;
}) {
  const accent = boot.branding.primaryColor || "#4f46e5";
  const home = boot.studio?.homeConfig;
  const greeting = home?.greeting || `Welcome, ${session.displayName}`;
  const subtitle = home?.subtitle || "";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
        <Brand boot={boot} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">{boot.identity.displayName}</div>
          <div className="truncate text-[10px] text-gray-400">{session.email}</div>
        </div>
        <button
          onClick={onSignOut}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-50"
        >
          Sign out
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <h1 className="text-xl font-bold text-gray-900">{greeting}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}

        {home?.tiles?.length ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {home.tiles.map((tile, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-2 size-8 rounded-lg" style={{ background: `${accent}22` }} />
                <div className="text-sm font-semibold text-gray-800">{tile.label}</div>
                {tile.description ? <div className="mt-0.5 text-[11px] leading-snug text-gray-400">{tile.description}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white/50 p-6 text-center text-xs text-gray-400">
            You're signed in. Your program's content will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
