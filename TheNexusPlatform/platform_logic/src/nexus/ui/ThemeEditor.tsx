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
import { Label } from "@/app/components/ui/label";
import { accentForMode, hexFromHue, hueOf } from "@/nexus/theme/accent";

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 60% 62%), hsl(60 60% 62%), hsl(120 60% 62%), hsl(180 60% 62%), hsl(240 60% 62%), hsl(300 60% 62%), hsl(360 60% 62%))";

export function ThemeEditor({
  accent,
  logoUrl,
  onSaveAccent,
  onUploadLogo,
  onRevert,
  revertLabel,
}: {
  accent: string | null;
  logoUrl: string | null;
  onSaveAccent: (hex: string) => Promise<void>;
  onUploadLogo: (file: File) => Promise<void>;
  onRevert?: () => Promise<void>;
  revertLabel?: string;
}) {
  const [hue, setHue] = useState(() => hueOf(accent ?? "#4f46e5"));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHue(hueOf(accent ?? "#4f46e5"));
    setDirty(false);
  }, [accent]);

  const hex = hexFromHue(hue);

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
    <div className="glass-card p-5 flex flex-wrap items-start gap-8">
      <div className="space-y-2 min-w-64 flex-1">
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

      <div className="space-y-2">
        <Label>Logo</Label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative grid size-28 place-items-center overflow-hidden rounded-2xl border border-border bg-background/40 hover:border-foreground/30 transition-colors"
          title="Upload logo"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-full object-contain p-2" />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground/60" />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-background/80 py-1 text-center text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {logoUrl ? "Replace" : "Upload"}
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
              await onUploadLogo(file);
              toast.success("Logo uploaded");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}
