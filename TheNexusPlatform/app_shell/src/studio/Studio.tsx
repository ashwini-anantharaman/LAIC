import { useEffect, useMemo, useState } from "react";
import type { AppCategory, AppShellConfig, EditorTab, Template } from "../types";
import { uid } from "../data/constants";
import { clonePresets } from "../data/presets";
import { templateFor } from "../data/templates";
import { getAppConfig, listGates, listPrograms, loadSession, saveLink, type NexusGate } from "../nexus/client";
import { adoptHandoffSession, studioScope } from "../nexus/handoff";
import { studioFromConsoleRecord, studioFromServerRecord } from "../nexus/dialect";
import { Editor } from "./Editor";
import { StudioPreview } from "./StudioPreview";
import { NewAppPicker } from "./NewAppPicker";
import { PreviewMode } from "./PreviewMode";
import { PublishModal } from "./PublishModal";

type Mode = "studio" | "newapp" | "preview";

function fromTemplate(t: Template): AppShellConfig {
  return {
    id: uid(),
    name: "",
    tagline: t.taglineHint,
    appType: t.defaultAppType,
    category: t.categoryId,
    accentColor: t.accent,
    accentForeground: t.accentForeground,
    logoInitials: t.defaultInitials,
    welcomeTitle: t.welcomeTitle,
    welcomeSubtitle: t.welcomeSubtitle,
    roles: t.roles.map((r) => ({ ...r })),
    registrationPath: t.registrationPath,
    requireApproval: t.requireApproval,
    authToggles: { ...t.authToggles },
    onboardingQuestions: t.onboardingQuestions.map((q) => ({ ...q, options: [...q.options] })),
    onboardingOptional: t.onboardingOptional,
    homeConfig: {
      ...t.homeConfig,
      tiles: t.homeConfig.tiles.map((x) => ({ ...x })),
      navItems: t.homeConfig.navItems.map((n) => ({ ...n })),
    },
    content: t.content && {
      ...t.content,
      connections: t.content.connections.map((c) => ({ ...c })),
    },
  };
}

/**
 * Workspace storage. Two kinds, deliberately separate:
 *
 *   • SCOPED (opened from the Nexus console for one app): each app has its
 *     OWN workspace under `shell.studio.app.<appId>` — one config, no
 *     presets, no other apps. Opening app A can never see or touch app B.
 *   • SANDBOX (the Studio opened directly, no app): the local playground
 *     with the demo presets, under `shell.studio.workspace`.
 *
 * Publishing to Nexus is the durable, versioned record; these are local
 * working copies that survive refreshes.
 */
const SANDBOX_KEY = "shell.studio.workspace";
const APP_WS_PREFIX = "shell.studio.app.";

function validConfig(c: AppShellConfig | undefined): boolean {
  return !!c && typeof c.id === "string" && Array.isArray(c.roles) && !!c.homeConfig;
}

function loadSandbox(): { configs: AppShellConfig[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(SANDBOX_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as { configs?: AppShellConfig[]; activeId?: string };
    if (!Array.isArray(w.configs) || w.configs.length === 0) return null;
    return w.configs.every(validConfig) ? { configs: w.configs, activeId: w.activeId ?? w.configs[0].id } : null;
  } catch {
    return null;
  }
}

function loadAppWorkspace(appId: string): AppShellConfig | null {
  try {
    const raw = localStorage.getItem(APP_WS_PREFIX + appId);
    if (!raw) return null;
    const c = JSON.parse(raw) as AppShellConfig;
    return validConfig(c) ? c : null;
  } catch {
    return null;
  }
}

export function Studio() {
  // Scoped to one app (console handoff / refreshed scoped tab) or sandbox.
  const scope = useMemo(() => studioScope(), []);

  const [configs, setConfigs] = useState<AppShellConfig[]>(() => {
    if (scope) {
      const local = loadAppWorkspace(scope.appId);
      return local ? [local] : []; // empty → the import effect fills it
    }
    return loadSandbox()?.configs ?? clonePresets();
  });
  const [activeId, setActiveId] = useState(() => {
    if (scope) return configs[0]?.id ?? "";
    const w = loadSandbox();
    return w && w.configs.some((c) => c.id === w.activeId) ? w.activeId : configs[0].id;
  });
  const [tab, setTab] = useState<EditorTab>("identity");
  const [mode, setMode] = useState<Mode>("studio");
  // Scoped app with no config yet → show the template picker before editing,
  // so a brand-new app chooses Learning / Bridge / Community instead of being
  // silently defaulted.
  const [needTemplate, setNeedTemplate] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  // When bound to an app, the program's participant sign-up gates — offered in
  // the Auth tab so you pick the "Create an account" gate right there. Undefined
  // until loaded (or when unbound: no program context → picked at Publish).
  const [signupGates, setSignupGates] = useState<NexusGate[] | undefined>(undefined);
  // The bound program's feature switches — a content tile whose platform is off
  // would 403 at launch, so the Content tab warns before you publish it.
  // Undefined until loaded / when unbound.
  const [programFeatures, setProgramFeatures] = useState<Record<string, boolean> | undefined>(undefined);

  const active = configs.find((c) => c.id === activeId) ?? configs[0];

  // Persist the working copy on every change — into THIS app's workspace when
  // scoped, into the sandbox otherwise.
  useEffect(() => {
    if (scope) {
      if (configs[0]) localStorage.setItem(APP_WS_PREFIX + scope.appId, JSON.stringify(configs[0]));
    } else {
      localStorage.setItem(SANDBOX_KEY, JSON.stringify({ configs, activeId }));
    }
  }, [configs, activeId, scope]);

  // Scoped boot: adopt the console's session, and if this app has no local
  // working copy yet, import its stored config from the org's space (Studio
  // dialect first, console dialect as best effort, fresh template last).
  // THE LOCAL WORKING COPY ALWAYS WINS — the server copy never clobbers it.
  useEffect(() => {
    if (!scope) return;
    let stale = false;
    void (async () => {
      const session = (await adoptHandoffSession()) ?? loadSession();
      if (stale) return;
      // The program's participant sign-up gates power the Auth-tab picker.
      if (session && scope.programId) {
        listGates(session, scope.programId)
          .then((gs) => {
            if (!stale) setSignupGates(gs.filter((g) => g.audience === "participant" && g.allow_signup));
          })
          .catch(() => {
            if (!stale) setSignupGates([]);
          });
        // The bound program's feature switches gate the Content tab's tiles.
        listPrograms(session, scope.orgId)
          .then((ps) => {
            if (!stale) setProgramFeatures(ps.find((p) => p.id === scope.programId)?.features ?? {});
          })
          .catch(() => {
            if (!stale) setProgramFeatures(undefined);
          });
      }
      if (loadAppWorkspace(scope.appId)) return; // local copy wins; session adopted above
      let imported: AppShellConfig | null = null;
      if (session) {
        try {
          const record = (await getAppConfig(session, scope.appId)).config ?? {};
          imported =
            studioFromServerRecord(record) ??
            studioFromConsoleRecord(record, { id: `nx-${scope.appId.slice(0, 8)}`, name: scope.appName });
        } catch (err) {
          console.error("Scoped Studio: could not read the app's config", err);
        }
      }
      // No stored config anywhere → this is a fresh app: let the user pick a
      // template (the import effect leaves configs empty; the picker fills it).
      if (!imported) {
        if (!stale) setNeedTemplate(true);
        return;
      }
      saveLink(imported.id, {
        appId: scope.appId,
        appSlug: scope.appSlug,
        programId: scope.programId,
        orgId: scope.orgId,
      });
      if (!stale) {
        setConfigs([imported]);
        setActiveId(imported.id);
      }
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<AppShellConfig>) =>
    setConfigs((cs) => cs.map((c) => (c.id === activeId ? { ...c, ...patch } : c)));

  const duplicate = () => {
    const copy: AppShellConfig = { ...structuredClone(active), id: uid(), name: `Copy of ${active.name}` };
    setConfigs((cs) => [...cs, copy]);
    setActiveId(copy.id);
  };

  const remove = (id: string) => {
    if (configs.length <= 1) return;
    const next = configs.filter((c) => c.id !== id);
    setConfigs(next);
    if (id === activeId) setActiveId(next[0].id);
  };

  const addFromTemplate = (category: AppCategory) => {
    const created = fromTemplate(templateFor(category));
    setConfigs((cs) => [...cs, created]);
    setActiveId(created.id);
    setTab("identity");
    setMode("studio");
  };

  // A fresh SCOPED app picks its template here: build from the choice, keep the
  // scoped id/name, and bind the local↔Nexus link so publishing targets it.
  const pickScopedTemplate = (category: AppCategory) => {
    if (!scope) return;
    const created: AppShellConfig = {
      ...fromTemplate(templateFor(category)),
      id: `nx-${scope.appId.slice(0, 8)}`,
      name: scope.appName,
    };
    saveLink(created.id, { appId: scope.appId, appSlug: scope.appSlug, programId: scope.programId, orgId: scope.orgId });
    setConfigs([created]);
    setActiveId(created.id);
    setNeedTemplate(false);
    setTab("identity");
  };

  // Choose a template — on first open (no config yet) or any time via the
  // header "Templates" button. Cancelling keeps the current app if one exists,
  // else falls back to a default so a fresh app is never left empty.
  if (scope && needTemplate) {
    return (
      <div className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: "var(--studio-bg)", color: "#e0e0f0" }}>
        <NewAppPicker onPick={pickScopedTemplate} onCancel={() => (active ? setNeedTemplate(false) : pickScopedTemplate("learning"))} />
      </div>
    );
  }

  // Scoped tab still importing: a quiet holding screen, never the sandbox.
  if (scope && !active) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-3"
        style={{ backgroundColor: "var(--studio-bg)", color: "rgba(255,255,255,0.4)" }}
      >
        <div className="h-2 w-2 animate-pulse rounded-full bg-white/40" />
        <p className="text-xs">Opening {scope.appName}…</p>
      </div>
    );
  }

  const headerBtn = "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors";

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: "var(--studio-bg)", color: "#e0e0f0" }}>
      {mode === "preview" && <PreviewMode config={active} onExit={() => setMode("studio")} key={active.id} />}
      {showPublish && <PublishModal config={active} scope={scope} onClose={() => setShowPublish(false)} />}

      {/* header */}
      <header
        className="flex h-12 flex-shrink-0 items-center justify-between px-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "#0e0e15" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="grid h-6 w-6 place-items-center rounded-lg text-[9px] font-bold"
            style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            AS
          </div>
          <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>
            App Shell
          </span>
          {scope ? (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ backgroundColor: `${active.accentColor}1f`, color: active.accentColor }}
              title={`This Studio is scoped to ${scope.appName} — other apps are not reachable here`}
            >
              {scope.appSlug || scope.appName}
            </span>
          ) : (
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)" }}>
              sandbox
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === "studio" && (
            <div className="mr-1 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active.accentColor }} />
              <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                {active.name || "Untitled"}
              </span>
            </div>
          )}
          {!scope && (
            <button
              onClick={() => setMode(mode === "newapp" ? "studio" : "newapp")}
              className={headerBtn}
              style={{
                backgroundColor: mode === "newapp" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.07)",
                color: mode === "newapp" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {mode === "newapp" ? "‹ Cancel" : "+ New app"}
            </button>
          )}
          {scope && (
            <button
              onClick={() => setNeedTemplate(true)}
              className={headerBtn}
              style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}
              title="Pick a starting template (Learning / Bridge / Community)"
            >
              ▦ Templates
            </button>
          )}
          <button
            onClick={() => setMode("preview")}
            className={headerBtn}
            style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            ▷ Preview
          </button>
          <button
            onClick={() => setShowPublish(true)}
            className={headerBtn}
            style={{ backgroundColor: active.accentColor, color: active.accentForeground }}
          >
            Publish
          </button>
        </div>
      </header>

      {mode === "newapp" && !scope ? (
        <NewAppPicker onPick={addFromTemplate} onCancel={() => setMode("studio")} />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Editor
            configs={configs}
            active={active}
            tab={tab}
            scoped={!!scope}
            signupGates={signupGates}
            programFeatures={programFeatures}
            onTab={setTab}
            onSelect={setActiveId}
            onUpdate={update}
            onDuplicate={duplicate}
            onDelete={remove}
          />
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {/* dotted backdrop + accent glow */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-700"
              style={{ background: `radial-gradient(circle, ${active.accentColor}18 0%, transparent 70%)` }}
            />
            <div className="relative z-10 flex h-full w-full items-center justify-center py-8">
              <StudioPreview key={active.id} config={active} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
