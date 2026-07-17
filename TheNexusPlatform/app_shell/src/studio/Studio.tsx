import { useState } from "react";
import type { AppCategory, AppShellConfig, EditorTab, Template } from "../types";
import { uid } from "../data/constants";
import { clonePresets } from "../data/presets";
import { templateFor } from "../data/templates";
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
  };
}

export function Studio() {
  const [configs, setConfigs] = useState<AppShellConfig[]>(() => clonePresets());
  const [activeId, setActiveId] = useState(configs[0].id);
  const [tab, setTab] = useState<EditorTab>("identity");
  const [mode, setMode] = useState<Mode>("studio");
  const [showPublish, setShowPublish] = useState(false);

  const active = configs.find((c) => c.id === activeId) ?? configs[0];

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

  const headerBtn = "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors";

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: "var(--studio-bg)", color: "#e0e0f0" }}>
      {mode === "preview" && <PreviewMode config={active} onExit={() => setMode("studio")} key={active.id} />}
      {showPublish && <PublishModal config={active} onClose={() => setShowPublish(false)} />}

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
          <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)" }}>
            design tool
          </span>
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

      {mode === "newapp" ? (
        <NewAppPicker onPick={addFromTemplate} onCancel={() => setMode("studio")} />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Editor
            configs={configs}
            active={active}
            tab={tab}
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
