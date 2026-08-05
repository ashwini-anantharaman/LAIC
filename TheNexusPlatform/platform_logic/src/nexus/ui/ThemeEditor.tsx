/**
 * The one theme editor used at every level (Nexus / org / program): a HUE
 * slider (lightness & saturation are mode-derived, so a 2-D picker would lie),
 * light/dark preview swatches, a big logo preview + upload, and an optional
 * Revert for levels that inherit a parent's branding.
 */
import { useEffect, useRef, useState } from "react";
import { ImageIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { accentForMode, hexFromHue, hueOf } from "@/nexus/theme/accent";

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 60% 62%), hsl(60 60% 62%), hsl(120 60% 62%), hsl(180 60% 62%), hsl(240 60% 62%), hsl(300 60% 62%), hsl(360 60% 62%))";

export function ThemeEditor({
  accent,
  logoUrl,
  faviconUrl,
  onSaveAccent,
  onUploadLogo,
  onUploadFavicon,
  onRevert,
  revertLabel,
  name,
  onSaveName,
  nameLabel = "Display name",
  namePlaceholder,
}: {
  accent: string | null;
  logoUrl: string | null;
  /** The browser-tab icon (separate from the sidebar logo). */
  faviconUrl?: string | null;
  onSaveAccent: (hex: string) => Promise<void>;
  onUploadLogo: (file: File) => Promise<void>;
  /** When provided, a second "Favicon" upload is shown. */
  onUploadFavicon?: (file: File) => Promise<void>;
  onRevert?: () => Promise<void>;
  revertLabel?: string;
  /** When provided (with onSaveName), an editable display-name field is shown. */
  name?: string | null;
  onSaveName?: (name: string) => Promise<void>;
  nameLabel?: string;
  namePlaceholder?: string;
}) {
  const [hue, setHue] = useState(() => hueOf(accent ?? "#4f46e5"));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [nameDraft, setNameDraft] = useState(name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  useEffect(() => setNameDraft(name ?? ""), [name]);

  useEffect(() => {
    setHue(hueOf(accent ?? "#4f46e5"));
    setDirty(false);
  }, [accent]);

  const hex = hexFromHue(hue);
  const nameDirty = onSaveName != null && nameDraft.trim() !== "" && nameDraft.trim() !== (name ?? "");

  async function saveName() {
    setNameBusy(true);
    try {
      await onSaveName!(nameDraft.trim());
      toast.success("Name saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save name");
    } finally {
      setNameBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await onSaveAccent(hex);
      setDirty(false);
      toast.success("Theme saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save theme");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {onSaveName ? (
        <div className="glass-card p-5 space-y-2 max-w-md">
          <Label htmlFor="brand-name">{nameLabel}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="brand-name"
              value={nameDraft}
              placeholder={namePlaceholder}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nameDirty && !nameBusy) void saveName();
              }}
            />
            <Button size="sm" onClick={saveName} disabled={nameBusy || !nameDirty}>
              {nameBusy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="glass-card p-5">
        <div className="space-y-2">
        <Label htmlFor="hue">Accent color</Label>
        <p className="text-xs text-muted-foreground -mt-0.5">
          Pick a hue — the exact shade adapts to light and dark mode automatically.
        </p>
        <input
          id="hue"
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => {
            setHue(Number(e.target.value));
            setDirty(true);
          }}
          className="h-3 w-full cursor-pointer appearance-none rounded-full outline-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md"
          style={{ background: HUE_GRADIENT }}
        />
        <div className="flex items-center gap-4 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-5 rounded-full border border-border" style={{ background: accentForMode(hex, false) }} />
            Light
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-5 rounded-full border border-border" style={{ background: accentForMode(hex, true) }} />
            Dark
          </span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save theme"}
          </Button>
          {onRevert ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRevert();
                  toast.success(revertLabel ?? "Reverted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to revert");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RotateCcw className="size-3.5" /> {revertLabel ?? "Revert"}
            </Button>
          ) : null}
        </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <ImageUpload
          label="Logo"
          hint="Shown in the sidebar. A square PNG or SVG works best."
          url={logoUrl}
          onUpload={onUploadLogo}
        />
        {onUploadFavicon ? (
          <ImageUpload
            label="Favicon"
            hint="Shown in the browser tab. A small square PNG or SVG works best."
            url={faviconUrl ?? null}
            onUpload={onUploadFavicon}
          />
        ) : null}
      </div>
    </div>
  );
}

/** One labelled image drop target — used for both the logo and the favicon. */
function ImageUpload({
  label,
  hint,
  url,
  onUpload,
}: {
  label: string;
  hint: string;
  url: string | null;
  onUpload: (file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="glass-card p-5 space-y-2 flex-1 min-w-[220px]">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground -mt-0.5">{hint}</p>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="group relative grid size-28 place-items-center overflow-hidden rounded-2xl border border-border bg-background/40 hover:border-foreground/30 transition-colors disabled:opacity-50"
        title={`Upload ${label.toLowerCase()}`}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-contain p-2" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground/60" />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-background/80 py-1 text-center text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          {url ? "Replace" : "Upload"}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            await onUpload(file);
            toast.success(`${label} uploaded`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
