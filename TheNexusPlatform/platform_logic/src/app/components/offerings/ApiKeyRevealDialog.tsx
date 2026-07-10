import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { BORDER, INPUT_BG, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";

export function ApiKeyRevealDialog({
  open,
  onOpenChange,
  apiKey,
  accent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string | null;
  accent: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: "#141417", border: `1px solid ${BORDER}`, color: "white" }}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle style={{ fontFamily: FONT_HEAD, color: "white" }}>API key generated</DialogTitle>
          <DialogDescription style={{ fontFamily: FONT_BODY, color: MUTED }}>
            Copy this key now — it will not be shown again. Store it in the app's server-side config, never in a
            browser bundle.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: INPUT_BG, border: `1px solid ${BORDER}` }}>
          <code className="flex-1 text-xs break-all" style={{ color: "white", fontFamily: "monospace" }}>{apiKey}</code>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] flex-shrink-0 transition-colors focus:outline-none"
            style={{ background: accent, color: "#111", fontFamily: FONT_BODY }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
