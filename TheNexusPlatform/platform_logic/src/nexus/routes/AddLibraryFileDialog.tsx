/**
 * Add a file to the content library — a handout, an image, a recording.
 *
 * TWO WAYS IN, and video is why. Production stores uploads as base64 rows behind
 * a ~4.5 MB request cap, which is about 3 MB of actual file: fine for a handout,
 * useless for a MOV. So the dialog offers Upload *or* Link, says the ceiling
 * before a file is chosen rather than after, and steers anything large to a link
 * instead of failing at the end of a long read.
 *
 * FOLDERS BY NAME, and a new one can be typed. Studio folders live in that app's
 * localStorage, so names are the only shared truth — which is also what lets a
 * name that exists in no author's Studio appear here the moment it is used. The
 * existing folders are offered as chips; anything else is a new folder.
 */
import { useMemo, useRef, useState } from "react";
import { Check, FileText, Film, Image as ImageIcon, Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { addLibraryAsset } from "@/services/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/app/components/ui/dialog";
import { cn } from "@/app/components/ui/utils";

/** Mirrors _MAX_ASSET_BYTES on the server, which enforces it. */
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = ".pdf,image/*,video/*";

const iconFor = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return FileText;
  if (["mov", "mp4", "m4v", "webm"].includes(ext)) return Film;
  return ImageIcon;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function AddLibraryFileDialog({
  programId,
  folders,
  defaultFolder,
  onClose,
  onSaved,
}: {
  programId: string;
  /** Folder names already in the library, offered as chips. */
  folders: string[];
  /** The folder open when "Add file" was pressed, pre-selected. */
  defaultFolder: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(defaultFolder && defaultFolder !== "Unfiled" ? [defaultFolder] : []),
  );
  const [newFolder, setNewFolder] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tooBig = !!file && file.size > MAX_BYTES;
  const allFolders = useMemo(
    () => [...new Set([...folders.filter((f) => f !== "Unfiled"), ...picked])].sort(),
    [folders, picked],
  );

  const canSave =
    !!title.trim() &&
    !saving &&
    (mode === "upload" ? !!file && !tooBig : /^https?:\/\/\S+$/.test(url.trim()));

  function chooseFile(f: File | null) {
    setFile(f);
    // Offer the filename as the title — it is almost always what they want, and
    // retyping "Stayman handout.pdf" is a tax on the common case.
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function save() {
    setSaving(true);
    try {
      const names = [...picked];
      if (newFolder.trim()) names.push(newFolder.trim());

      if (mode === "link") {
        await addLibraryAsset(programId, {
          title: title.trim(),
          externalUrl: url.trim(),
          collectionNames: names,
        });
      } else if (file) {
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          // readAsDataURL gives "data:<ct>;base64,<payload>" — the server wants
          // the payload alone.
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(new Error("Couldn't read that file"));
          r.readAsDataURL(file);
        });
        await addLibraryAsset(programId, {
          title: title.trim(),
          data,
          contentType: file.type || "application/octet-stream",
          collectionNames: names,
        });
      }
      toast.success(`Added “${title.trim()}”`);
      onSaved();
      onClose();
    } catch (e) {
      // The server's 413 names the ceiling and the alternative; show it verbatim.
      toast.error(e instanceof Error ? e.message : "Couldn't add that file");
    } finally {
      setSaving(false);
    }
  }

  const FileIcon = file ? iconFor(file.name) : Upload;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a file</DialogTitle>
          <DialogDescription>
            A PDF, an image or a video, filed into folders beside the authored content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-lg border p-0.5">
          {(["upload", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "upload" ? "Upload" : "Link"}
            </button>
          ))}
        </div>

        {mode === "upload" ? (
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-4 text-left hover:bg-accent/40"
            >
              <FileIcon className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {file ? file.name : "Choose a file"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {file ? mb(file.size) : `PDF, image or video · up to ${mb(MAX_BYTES)}`}
                </span>
              </span>
              {file && <X className="size-4 text-muted-foreground" onClick={(e) => { e.stopPropagation(); chooseFile(null); }} />}
            </button>
            {tooBig && (
              // Said before they hit Save, with the way round it.
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                That file is {mb(file!.size)}. This deployment can store up to {mb(MAX_BYTES)} —
                use <button type="button" className="underline" onClick={() => setMode("link")}>Link</button> for
                anything larger, which is how video is expected to arrive until a storage bucket exists.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="asset-url">File URL</Label>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="asset-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/lesson-recording.mov"
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The file stays where it is; the library records where to find it.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="asset-title">Name</Label>
          <Input
            id="asset-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Stayman handout"
          />
        </div>

        <div className="space-y-2">
          <Label>Folders</Label>
          {allFolders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allFolders.map((f) => {
                const on = picked.has(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        n.has(f) ? n.delete(f) : n.add(f);
                        return n;
                      })
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      on
                        ? "border-primary bg-primary/10 font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {f}
                  </button>
                );
              })}
            </div>
          )}
          <div className="relative">
            <Plus className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="Or type a new folder name"
              className="pl-7 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Pick as many as you like. A new folder here appears in this library — the Content
            Studio keeps its own folders per author.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Adding…" : "Add file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
