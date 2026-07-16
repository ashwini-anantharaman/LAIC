import type { AppShellConfig } from "../../types";
import { APP_TYPES } from "../../data/constants";
import { templateFor } from "../../data/templates";
import { GroupTitle, Label, Select, TextInput } from "../../ui/fields";

export function IdentityTab({
  config,
  update,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
}) {
  const catAccent = templateFor(config.category).accent;

  function onLogoFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => update({ logoUrl: String(e.target?.result) });
    reader.readAsDataURL(file);
  }

  return (
    <>
      <div className="mb-3">
        <span
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-semibold tracking-wide"
          style={{ backgroundColor: `${catAccent}22`, color: catAccent }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: catAccent, opacity: 0.7 }} />
          {config.category[0].toUpperCase() + config.category.slice(1)}
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <Label>App name</Label>
          <TextInput value={config.name} onChange={(v) => update({ name: v })} placeholder="Give your app a name" />
        </div>
        <div>
          <Label>Tagline</Label>
          <TextInput value={config.tagline} onChange={(v) => update({ tagline: v })} placeholder="Short tagline" />
        </div>
        <div>
          <Label>Logo</Label>
          <div className="flex items-end gap-3">
            <label className="group relative block flex-shrink-0 cursor-pointer">
              <div
                className="grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-xl text-xs font-bold"
                style={{
                  background: config.logoUrl ? "transparent" : config.accentColor,
                  color: config.accentForeground,
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {config.logoUrl ? <img src={config.logoUrl} alt="" className="h-full w-full object-cover" /> : config.logoInitials}
                <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-[9px] font-semibold text-white">Upload</span>
                </div>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0])} />
            </label>
            <div className="flex flex-1 flex-col gap-1.5">
              <div>
                <Label>Initials</Label>
                <TextInput value={config.logoInitials} onChange={(v) => update({ logoInitials: v.slice(0, 3) })} placeholder="AB" />
              </div>
              {config.logoUrl && (
                <button onClick={() => update({ logoUrl: undefined })} className="text-left text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Remove uploaded logo ×
                </button>
              )}
            </div>
          </div>
        </div>
        <div>
          <Label>App type</Label>
          <Select value={config.appType} onChange={(v) => update({ appType: v })} options={APP_TYPES.map((t) => ({ value: t, label: t }))} />
        </div>
      </div>

      <GroupTitle>Branding</GroupTitle>
      <div className="flex items-end gap-3">
        <div>
          <Label>Swatch</Label>
          <div className="relative h-9 w-10 cursor-pointer overflow-hidden rounded-lg" style={{ backgroundColor: config.accentColor, border: "1px solid rgba(255,255,255,0.1)" }}>
            <input
              type="color"
              value={config.accentColor}
              onChange={(e) => update({ accentColor: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        </div>
        <div className="flex-1">
          <Label>Accent hex</Label>
          <TextInput value={config.accentColor} onChange={(v) => update({ accentColor: v })} mono />
        </div>
        <div style={{ width: 96 }}>
          <Label>Text on accent</Label>
          <TextInput value={config.accentForeground} onChange={(v) => update({ accentForeground: v })} mono />
        </div>
      </div>
    </>
  );
}
