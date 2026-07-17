import type { AppShellConfig, EditorTab } from "../types";
import { EDITOR_TABS } from "../data/constants";
import { PRESET_IDS } from "../data/presets";
import { IdentityTab } from "./tabs/IdentityTab";
import { StartTab } from "./tabs/StartTab";
import { AuthTab } from "./tabs/AuthTab";
import { OnboardingTab } from "./tabs/OnboardingTab";
import { HomeTab } from "./tabs/HomeTab";

interface EditorProps {
  configs: AppShellConfig[];
  active: AppShellConfig;
  tab: EditorTab;
  onTab: (t: EditorTab) => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<AppShellConfig>) => void;
  onDuplicate: () => void;
  onDelete: (id: string) => void;
}

export function Editor({ configs, active, tab, onTab, onSelect, onUpdate, onDuplicate, onDelete }: EditorProps) {
  const isPreset = (id: string) => (PRESET_IDS as readonly string[]).includes(id);

  return (
    <div className="flex w-[390px] flex-shrink-0 flex-col overflow-hidden" style={{ borderRight: "1px solid rgba(255,255,255,0.06)", backgroundColor: "var(--studio-panel)" }}>
      {/* app switcher */}
      <div className="flex flex-shrink-0 flex-wrap gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {configs.map((c) => {
          const on = c.id === active.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              style={on ? { backgroundColor: `${c.accentColor}22`, color: c.accentColor, outline: `1px solid ${c.accentColor}3a` } : { color: "rgba(255,255,255,0.32)" }}
            >
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.accentColor }} />
              {c.name || "Untitled"}
              {!isPreset(c.id) && (
                <span
                  className="ml-0.5 text-sm leading-none opacity-40 transition-opacity hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onDuplicate}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] transition-colors hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.22)" }}
          title="Duplicate the active app"
        >
          ⧉
        </button>
      </div>

      {/* tab bar */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {EDITOR_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className="flex-shrink-0 rounded-lg px-3 py-1 text-[10px] font-semibold transition-colors"
            style={tab === t.id ? { backgroundColor: `${active.accentColor}25`, color: active.accentColor } : { color: "rgba(255,255,255,0.3)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* active tab */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "identity" && <IdentityTab config={active} update={onUpdate} />}
        {tab === "start" && <StartTab config={active} update={onUpdate} />}
        {tab === "auth" && <AuthTab config={active} update={onUpdate} />}
        {tab === "onboarding" && <OnboardingTab config={active} update={onUpdate} />}
        {tab === "home" && <HomeTab config={active} update={onUpdate} />}
      </div>
    </div>
  );
}
