/**
 * My Drive — a space of this person's own, beside the shared library rather than
 * inside it.
 *
 * A drive and the Content Library are DIFFERENT SPACES, not two views of one.
 * The library read subtracts every drive folder, and this screen is the only
 * thing that adds one back (`?scope=drive`). That is why nothing here appears at
 * program level until somebody shares it out — which is the promise printed at
 * the top of the screen, and the reason a draft cannot leak into the library the
 * moment it is typed.
 *
 * PARITY WITH THE APP is deliberate: the same drive, the same Drafts folder, the
 * same collapsed folders, the same three things you can do to a piece of content.
 * Two surfaces onto one place should not have two vocabularies.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight, FolderPlus, HardDrive, Loader2, Plus, SquarePen, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  createMyDriveFolder, deleteMyDriveObject, getContentLibrary, getDriveFolders,
  getMyDrive, launchLearningPlatform, type LibraryFolder, type LibraryObject,
} from "@/services/api";
import { PageHeader } from "@/nexus/ui/kit";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";
import { PipelineStudioDialog } from "@/nexus/routes/PipelineStudioDialog";
import { useParams } from "react-router";

interface Drive {
  has_drive: boolean;
  can_create?: boolean;
  create_types?: string[] | null;
  drive_id?: string | null;
  drive_name?: string | null;
  drafts_id?: string | null;
  program_id?: string | null;
}

export function MyDriveTab() {
  const { programId = "" } = useParams();
  const [drive, setDrive] = useState<Drive | null>(null);
  const [objects, setObjects] = useState<LibraryObject[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  /** The folder a new piece of content should go into. Null means Drafts. */
  const [target, setTarget] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ id: string; title: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getMyDrive(programId);
      setDrive(d);
      if (d.has_drive && d.drive_id) {
        // The DRIVE's scope, not the page's: a drive lives under the parent
        // program, and asking a club id returns nothing.
        const scope = d.program_id ?? programId;
        const [lib, tree] = await Promise.all([
          getContentLibrary(scope, { scope: "drive", drive: d.drive_id }),
          getDriveFolders(scope, d.drive_id),
        ]);
        setObjects(lib.objects ?? []);
        setFolders(tree.filter((f) => f.id !== d.drive_id));
      } else {
        setObjects([]);
        setFolders([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open your drive");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const scope = drive?.program_id ?? programId;

  async function openCreator(collectionId: string | null) {
    if (!drive?.drive_id) return;
    setOpening(true);
    try {
      const l = await launchLearningPlatform(scope);
      if (!l.launch_url) throw new Error("The Content Studio is not configured here.");
      const u = new URL(l.launch_url);
      u.searchParams.set("launch_token", l.launch_token);
      u.searchParams.set("create", "1");
      // The chosen folder, or Drafts. Decided BEFORE anything is authored, so a
      // save cannot land somewhere nobody picked.
      u.searchParams.set("drive", collectionId ?? drive.drafts_id ?? drive.drive_id);
      u.searchParams.set("program_id", scope);
      if (drive.create_types != null) u.searchParams.set("types", drive.create_types.join(","));
      window.open(u.toString(), "_blank", "noopener,width=1200,height=900");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the creator");
    } finally {
      setOpening(false);
    }
  }

  async function makeFolder() {
    if (!folderName.trim()) return;
    try {
      await createMyDriveFolder(scope, folderName.trim());
      setFolderName("");
      setNewFolder(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make that folder");
    }
  }

  async function remove(o: LibraryObject) {
    if (!window.confirm(`Delete "${o.title}"? This cannot be undone.`)) return;
    setBusyId(o.id);
    try {
      const r = await deleteMyDriveObject(scope, o.id);
      toast.success(r.unfiled ? `Removed "${o.title}" from your drive` : `Deleted "${o.title}"`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that");
    } finally {
      setBusyId(null);
    }
  }

  const loose = useMemo(
    () => objects.filter((o) => !folders.some((f) => (o.collection_ids ?? []).includes(f.id))),
    [objects, folders],
  );

  const canCreate = drive?.can_create === true && (drive.create_types?.length ?? 1) > 0;

  const card = (o: LibraryObject) => (
    <li key={o.id} className="flex items-center gap-3 rounded-xl border p-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{o.title || "Untitled"}</span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {o.type.replace(/-/g, " ")}
          {o.version_number != null && ` · v${o.version_number}`}
        </span>
      </span>
      {/* View opens the finished thing as a learner sees it; Edit reopens its
          pipeline. Two different questions, so two buttons. */}
      <Button size="sm" variant="ghost" onClick={() => setViewing({ id: o.id, title: o.title })}>
        View
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: o.id, title: o.title })}>
        <SquarePen className="size-3.5" /> Edit
      </Button>
      <Button size="sm" variant="ghost" disabled={busyId === o.id} onClick={() => void remove(o)}>
        {busyId === o.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />}
      </Button>
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={drive?.drive_name ?? "My Drive"}
        subtitle="Yours. Nothing here reaches anyone else until you share it out."
        actions={
          drive?.has_drive ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
              <Button variant="outline" size="sm" onClick={() => setNewFolder((v) => !v)}>
                <FolderPlus className="size-4" /> New folder
              </Button>
              {canCreate && (
                <Button size="sm" disabled={opening} onClick={() => void openCreator(target)}>
                  {opening ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Make something
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening your drive…
        </div>
      ) : !drive?.has_drive ? (
        <div className="rounded-xl border p-6">
          <p className="flex items-center gap-2 font-medium">
            <HardDrive className="size-4 text-muted-foreground" /> You don&rsquo;t have a drive
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            A drive is a space of your own, separate from the shared Content Library. Whoever
            manages the library can give you one.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {newFolder && (
            <div className="flex items-center gap-2 rounded-xl border p-3">
              <Input
                autoFocus
                placeholder="Folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void makeFolder(); }}
              />
              <Button size="sm" disabled={!folderName.trim()} onClick={() => void makeFolder()}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNewFolder(false); setFolderName(""); }}>Cancel</Button>
            </div>
          )}

          {canCreate && folders.length > 0 && (
            /* Where the next thing goes, decided before it is made — the same
               choice the app offers, so the two surfaces behave alike. */
            <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
              <span className="text-muted-foreground">New content goes into</span>
              <button
                type="button"
                onClick={() => setTarget(null)}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs",
                  target === null ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                Drafts
              </button>
              {folders.filter((f) => f.name.toLowerCase() !== "drafts").map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTarget(f.id)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs",
                    target === f.id ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {folders.length === 0 && objects.length === 0 ? (
            <div className="rounded-xl border p-6 text-sm">
              <p className="font-medium">Nothing here yet</p>
              <p className="mt-1 text-muted-foreground">
                {canCreate
                  ? "Make something and it lands in Drafts."
                  : "Content shared into your drive will appear here."}
              </p>
            </div>
          ) : (
            <>
              {/* Collapsed by default: the folder names are the map, and a drive
                  with several folders should be a short list rather than a scroll. */}
              {folders.map((f) => {
                const inside = objects.filter((o) => (o.collection_ids ?? []).includes(f.id));
                const isOpen = open[f.id] ?? false;
                return (
                  <div key={f.id} className="rounded-xl border">
                    <button
                      type="button"
                      onClick={() => setOpen((m) => ({ ...m, [f.id]: !isOpen }))}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                      <span className="flex-1 text-sm font-medium">{f.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {inside.length} {inside.length === 1 ? "item" : "items"}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="space-y-2 border-t p-3">
                        {inside.length === 0 ? (
                          <li className="text-xs text-muted-foreground">Nothing in here yet.</li>
                        ) : (
                          inside.map(card)
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
              {loose.length > 0 && <ul className="space-y-2">{loose.map(card)}</ul>}
            </>
          )}
        </div>
      )}

      {viewing && (
        <PipelineStudioDialog
          programId={scope}
          objectId={viewing.id}
          title={viewing.title}
          canEdit={false}
          view="output"
          onClose={() => { setViewing(null); void load(); }}
        />
      )}
      {editing && (
        <PipelineStudioDialog
          programId={scope}
          objectId={editing.id}
          title={editing.title}
          canEdit
          onClose={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}
