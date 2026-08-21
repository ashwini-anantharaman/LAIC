/**
 * The Content Library — a program tab, answered by Nexus.
 *
 * Deliberately NOT the Content Studio in a frame. This screen decides who content
 * reaches, which is governance the console owns; the Studio owns authoring.
 *
 * Drive-shaped: a list of folders, click one to go in, breadcrumb back out. Every
 * row carries the same two actions at a different scale — share and publish take a
 * list of objects, so "this folder", "these 24 items" and "this one" are one code
 * path rather than three.
 *
 * SELECTION IS BY OBJECT ID, NOT BY FOLDER. An object can sit in several folders,
 * so ticking two overlapping folders must not share the same item twice or count it
 * twice. The folder checkboxes are a view onto a set of ids.
 *
 * NO CONTENT IS CREATED HERE. Authoring lives in the Content Studio and the split
 * is the point, so there is no New button for content. FOLDERS are different, and
 * are made here: organising a library is governance, not authoring, and a folder
 * has to exist before anything can be filed into it or granted through it.
 *
 * FOLDERS ARE REAL ROWS NOW (migration 0012). They used to live only in the
 * Studio's localStorage per author, which meant an empty folder could not exist,
 * two people saw two trees, and a folder could not be shared as a folder. This
 * screen reads the server tree and nests properly.
 *
 * LEGACY FOLDERS STILL SHOW. Content filed before 0012 carries a folder NAME and a
 * Studio-local id that matches no server row (migration 0003 denormalises both).
 * Those are listed beside the real folders, marked, and are not shareable — there
 * is no row to grant. Hiding them would make content an author had filed look lost.
 *
 * SHARING A FOLDER IS NOT SHARING ITS CONTENTS. The folder grant covers the
 * subtree and everything added to it later; a per-item share names today's items.
 * Both are offered because both are real intentions, and the dialog says which
 * one is happening.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  ChevronRight, Check, FileText, Film, Folder, FolderPlus, Image as ImageIcon, Link2,
  Loader2, Pencil, Plus, RefreshCw, Search, Share2, Send, Smartphone, Trash2, User, Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  createLibraryFolder, deleteLibraryAsset, deleteLibraryFolder, getContentLibrary,
  getLibraryFolders, renameLibraryFolder, type LibraryAsset, type LibraryFolder,
  type LibraryObject,
} from "@/services/api";
import { useProgramAccess } from "@/nexus/access";
import { SubRolesPanel } from "@/nexus/routes/SubRolesPanel";
import { PageHeader, EmptyState } from "@/nexus/ui/kit";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/app/components/ui/dialog";
import { ShareContentDialog } from "@/nexus/routes/ShareContentDialog";
import { PublishContentDialog } from "@/nexus/routes/PublishContentDialog";
import { AddLibraryFileDialog } from "@/nexus/routes/AddLibraryFileDialog";

const UNFILED = "__unfiled__";
type Tri = "on" | "off" | "some";

interface FolderGroup {
  key: string;
  name: string;
  objects: LibraryObject[];
  /** Files filed into this folder. They share the folder and nothing else — a
   *  file has no clubs, no apps and no publish state (see migration 0011). */
  assets: LibraryAsset[];
  /**
   * The server row, when this folder is one (migration 0012). Absent for the two
   * kinds of folder that are not rows: "Unfiled", and a legacy folder that exists
   * only as a name on the content filed into it. Only a real folder can be
   * renamed, deleted, nested into, or shared as a folder — there is nothing to
   * grant otherwise, and offering the action would produce a 404 on save.
   */
  row?: LibraryFolder;
  /** Subfolder count, so a row can say "3 folders" without opening it. */
  childCount: number;
}

const ASSET_ICON: Record<string, typeof FileText> = {
  pdf: FileText, image: ImageIcon, video: Film, link: Link2,
};

/** Tri-state box. A dash means "some", and that distinction is the whole reason
 *  this screen is worth having over a list of checkboxes. */
function Box({ state, className }: { state: Tri; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
        state === "off"
          ? "border-input bg-input-background dark:bg-input/30"
          : "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      {state === "on" && <Check className="size-3.5" />}
      {state === "some" && <span className="h-0.5 w-2 rounded-full bg-current" />}
    </span>
  );
}

/** Who this object reaches, in as few words as fit on a row. */
function ReachSummary({ o }: { o: LibraryObject }) {
  if (!o.clubs.length && !o.people.length && !o.apps.length) {
    return <span className="text-xs text-muted-foreground">Not shared</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {o.clubs.length > 0 && (
        <span className="flex items-center gap-1">
          <Users className="size-3" />
          {o.clubs.length} {o.clubs.length === 1 ? "club" : "clubs"}
        </span>
      )}
      {o.people.length > 0 && (
        <span className="flex items-center gap-1">
          <User className="size-3" />
          {o.people.length}
        </span>
      )}
      {o.apps.length > 0 && (
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Smartphone className="size-3" />
          published
        </span>
      )}
    </span>
  );
}

/**
 * Name a folder — used for both creating and renaming.
 *
 * One component for both because the difference between them is a starting value
 * and a verb, and two near-identical dialogs drift apart the first time one gets
 * a fix. The error is shown IN the dialog rather than as a toast that dismisses
 * itself: a duplicate name is something to correct here, with the typed name
 * still on screen, not something to be told about after the dialog has gone.
 */
function FolderNameDialog({
  title,
  description,
  confirmLabel,
  initial = "",
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = name.trim();
  const unchanged = trimmed === initial.trim();

  async function go() {
    if (!trimmed || unchanged) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save that name");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void go(); }}
          placeholder="Folder name"
          maxLength={120}
          aria-invalid={err ? true : undefined}
        />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void go()} disabled={busy || !trimmed || unchanged}>
            {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContentLibraryTab() {
  const { programId = "" } = useParams();
  const access = useProgramAccess(programId);
  // Sub-roles are a second job on this tab, not a second sidebar entry: deciding
  // who may share is the same remit as deciding what gets shared.
  /**
   * WHAT THIS VIEWER MAY DO, decided once and passed down.
   *
   * Every control below is gated from this block rather than each dialog deciding
   * for itself. The failure this prevents has now happened three times in this
   * feature: a control drawn for someone the server then refuses. Offering the
   * Apps section to a role holding only share_club did not merely waste a click —
   * touching it made the whole save 403, taking their legitimate club changes
   * with it.
   *
   * An app administrator's authority comes from the register, not a capability,
   * so `administers` counts as publish permission for their own app.
   */
  const can = (id: string) => access.isAdmin || access.capabilities.includes(id);
  const canShareClubs = can("learning.library.share_club");
  const canShareMembers = can("learning.library.share_member");
  const canShareApps = can("learning.library.share_app");
  const canDelegate = can("learning.roles.delegate");
  const canUpload = can("learning.library.upload");

  const canManageFolders = can("learning.library.folder_manage");

  const [view, setView] = useState<"content" | "roles">("content");
  const [objects, setObjects] = useState<LibraryObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /**
   * Where we are, as a path of folder ids from the root. Empty = the root.
   *
   * A path rather than a single "open folder", because folders nest now: the
   * breadcrumb has to be able to say B2F3 › Tutorials and walk back to either.
   */
  const [path, setPath] = useState<string[]>([]);
  /** Server folder rows (migration 0012), and whether this viewer is confined. */
  const [serverFolders, setServerFolders] = useState<LibraryFolder[]>([]);
  const [confined, setConfined] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<{ objects: LibraryObject[]; label: string } | null>(null);
  /** Sharing THE FOLDER — the subtree and everything added later. */
  const [sharingFolder, setSharingFolder] = useState<LibraryFolder | null>(null);
  const [newFolder, setNewFolder] = useState<{ parentId: string | null; parentName: string } | null>(null);
  const [renaming, setRenaming] = useState<LibraryFolder | null>(null);
  const [publishing, setPublishing] = useState<{ objects: LibraryObject[]; label: string } | null>(null);

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [addingFile, setAddingFile] = useState(false);
  /** Apps this viewer administers — empty for a content manager who runs none. */
  const [administers, setAdministers] = useState<string[]>([]);
  const canPublish = can("learning.publish.app_target") || administers.length > 0;
  // Narrowing an app's audience to one club is its own permission — and an app's
  // administrator holds it for the app they run, because that IS the job.
  const canScopeToClub = can("learning.app.publish_club") || administers.length > 0;
  // Seeing WHO content reaches is implied by being able to change it.
  const canViewShares =
    can("learning.library.share_view") || canShareClubs || canShareMembers || canShareApps;

  const load = useCallback(() => {
    setError(null);
    // Both in one round trip's worth of waiting. The tree is what the screen
    // draws and the content is what fills it, so showing one without the other
    // would render a library that looks empty or folderless for a beat.
    return Promise.all([getContentLibrary(programId), getLibraryFolders(programId)])
      .then(([lib, tree]) => {
        setObjects(lib.objects);
        setAssets(lib.assets);
        setAdministers(lib.administersApps);
        setServerFolders(tree.folders);
        setConfined(tree.confined);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't load this program's content"),
      );
  }, [programId]);

  useEffect(() => {
    setObjects(null);
    void load();
  }, [load]);

  const currentId = path.length ? path[path.length - 1] : null;
  const folderById = useMemo(
    () => new Map(serverFolders.map((f) => [f.id, f])),
    [serverFolders],
  );

  // A folder id that came back as a server row, so legacy name-only folders can
  // be told apart from real ones without a second pass per object.
  const serverIds = useMemo(() => new Set(serverFolders.map((f) => f.id)), [serverFolders]);

  /**
   * What is at the current location: subfolders, then the content filed here.
   *
   * THE ROOT IS NOT A FOLDER, so it is assembled differently: real root folders,
   * plus the legacy name-only folders, plus Unfiled. Inside a folder the answer is
   * simply its children and its contents.
   *
   * Filed-here is decided by ID, not name. Two folders may legitimately share a
   * name in different parents ("Tutorials" under two clubs), and matching on the
   * name would pour both into whichever the viewer happened to open.
   */
  const { subfolders, hereObjects, hereAssets } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const objs = (objects ?? []).filter((o) => (q ? o.title.toLowerCase().includes(q) : true));
    const files = assets.filter((a) => (q ? a.title.toLowerCase().includes(q) : true));

    const childrenOf = (parent: string | null) =>
      serverFolders.filter((f) => (f.parent_id ?? null) === parent);
    const countChildren = (id: string) =>
      serverFolders.filter((f) => (f.parent_id ?? null) === id).length;
    const objectsIn = (id: string) => objs.filter((o) => o.collection_ids.includes(id));
    const assetsIn = (id: string) => files.filter((a) => a.collection_ids.includes(id));

    const group = (row: LibraryFolder): FolderGroup => ({
      key: row.id,
      name: row.name,
      objects: objectsIn(row.id),
      assets: assetsIn(row.id),
      row,
      childCount: countChildren(row.id),
    });

    if (currentId) {
      return {
        subfolders: childrenOf(currentId).map(group),
        hereObjects: objectsIn(currentId),
        hereAssets: assetsIn(currentId),
      };
    }

    // At the root. Real folders first, then whatever only exists as a name.
    const groups: FolderGroup[] = childrenOf(null).map(group);

    // LEGACY: a folder name carried on content whose id matches no server row.
    // Keyed by name because that is all these ever had — the Studio-local id is
    // per browser and tells two authors' folders apart when they are the same one.
    const legacy = new Map<string, FolderGroup>();
    const addLegacy = (name: string, o?: LibraryObject, a?: LibraryAsset) => {
      const g = legacy.get(name) ?? { key: `legacy:${name}`, name, objects: [], assets: [], childCount: 0 };
      if (o) g.objects.push(o);
      if (a) g.assets.push(a);
      legacy.set(name, g);
    };
    const unfiledObjects: LibraryObject[] = [];
    for (const o of objs) {
      const known = o.collection_ids.filter((id) => serverIds.has(id));
      if (known.length) continue; // lives in a real folder; shown there
      const names = o.collection_names.filter(Boolean);
      if (!names.length) { unfiledObjects.push(o); continue; }
      for (const n of names) addLegacy(n, o, undefined);
    }
    const unfiledAssets: LibraryAsset[] = [];
    for (const a of files) {
      const known = a.collection_ids.filter((id) => serverIds.has(id));
      if (known.length) continue;
      const names = a.collection_names.filter(Boolean);
      if (!names.length) { unfiledAssets.push(a); continue; }
      for (const n of names) addLegacy(n, undefined, a);
    }
    groups.push(...[...legacy.values()].sort((a, b) => a.name.localeCompare(b.name)));
    if (unfiledObjects.length || unfiledAssets.length) {
      groups.push({
        key: UNFILED, name: "Unfiled", objects: unfiledObjects, assets: unfiledAssets, childCount: 0,
      });
    }
    return { subfolders: groups, hereObjects: [] as LibraryObject[], hereAssets: [] as LibraryAsset[] };
  }, [objects, assets, query, serverFolders, serverIds, currentId]);

  /** A legacy or Unfiled pseudo-folder opened from the root. */
  const [openLegacy, setOpenLegacy] = useState<FolderGroup | null>(null);
  const openFolder: FolderGroup | null = currentId
    ? {
        key: currentId,
        name: folderById.get(currentId)?.name ?? "Folder",
        objects: hereObjects,
        assets: hereAssets,
        row: folderById.get(currentId),
        childCount: subfolders.length,
      }
    : openLegacy;

  // A folder that vanished — deleted, renamed, or filtered out by a search —
  // must not leave someone staring at an empty room with no clue why.
  useEffect(() => {
    if (path.length && !path.every((id) => folderById.has(id))) {
      setPath((p) => p.filter((id) => folderById.has(id)));
    }
  }, [path, folderById]);
  useEffect(() => {
    if (openLegacy && !subfolders.some((f) => f.key === openLegacy.key)) setOpenLegacy(null);
  }, [openLegacy, subfolders]);

  /** The breadcrumb trail: every ancestor, so any level is one click away. */
  const trail = useMemo(
    () => path.map((id) => folderById.get(id)).filter(Boolean) as LibraryFolder[],
    [path, folderById],
  );

  const folders = subfolders;

  const allIds = useMemo(
    () => [...new Set(folders.flatMap((f) => f.objects.map((o) => o.id)))],
    [folders],
  );
  const byId = useMemo(() => new Map((objects ?? []).map((o) => [o.id, o])), [objects]);

  const triOf = (ids: string[]): Tri => {
    if (!ids.length) return "off";
    const n = ids.filter((id) => selected.has(id)).length;
    return n === 0 ? "off" : n === ids.length ? "on" : "some";
  };
  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  const selectedObjects = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter(Boolean) as LibraryObject[],
    [selected, byId],
  );
  const reload = () => void load();

  const rowActions = (objs: LibraryObject[], label: string) => (
    <>
      {canViewShares && (
        <Button
          size="icon" variant="ghost"
          title={
            canShareClubs || canShareMembers || canShareApps
              ? `Share ${label}`
              : `Who can see ${label}`
          }
          aria-label={`Share ${label}`}
          onClick={() => setSharing({ objects: objs, label })}
        >
          <Share2 className="size-4" />
        </Button>
      )}
      {canPublish && (
        <Button
          size="icon" variant="ghost"
          title={`Publish ${label}`} aria-label={`Publish ${label}`}
          onClick={() => setPublishing({ objects: objs, label })}
        >
          <Send className="size-4" />
        </Button>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Content Library"
        subtitle="The content in this program, and which clubs and people each piece reaches."
        actions={
          <>
            {canDelegate && (
              <div className="flex rounded-lg border p-0.5">
                {(["content", "roles"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      view === v
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v === "content" ? "Content" : "Sub-roles"}
                  </button>
                ))}
              </div>
            )}
            {view === "content" && (
              <>
                <Button variant="outline" size="sm" onClick={reload} disabled={objects === null}>
                  <RefreshCw className={cn("size-4", objects === null && "animate-spin")} /> Refresh
                </Button>
                {/* Files, not content. Authoring still belongs to the Studio — this
                    adds material that arrives ready-made, which is why the button
                    says "file" and not "new". */}
                {canUpload && (
                  <Button size="sm" variant="outline" onClick={() => setAddingFile(true)}>
                    <Plus className="size-4" /> Add file
                  </Button>
                )}
                {/* FOLDER, not content — and it says so. Organising a library is
                    governance and belongs here; authoring is the Studio's, so the
                    label never shortens to "New". It creates into the folder that
                    is open, which is what "new folder" means anywhere else. */}
                {canManageFolders && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setNewFolder({
                        parentId: currentId,
                        parentName: currentId ? (folderById.get(currentId)?.name ?? "this folder") : "the library",
                      })
                    }
                  >
                    <FolderPlus className="size-4" /> New folder
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {view === "roles" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SubRolesPanel programId={programId} />
        </div>
      ) : error ? (
        <EmptyState>
          <p className="font-medium text-foreground">The content library didn&rsquo;t load</p>
          <p className="mt-1">{error}</p>
        </EmptyState>
      ) : objects === null ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading content…
        </div>
      ) : objects.length === 0 && serverFolders.length === 0 && assets.length === 0 ? (
        // Only when there is genuinely nothing — an empty FOLDER is content-free
        // but not nothing, and this used to swallow the whole tree the moment the
        // program had no objects, hiding folders somebody had just made.
        <EmptyState>
          <p className="font-medium text-foreground">No content yet</p>
          <p className="mt-1">
            Content authored in the Content Studio for this program appears here, ready to share.
            {canManageFolders && " You can create folders now and file content into them later."}
          </p>
        </EmptyState>
      ) : (
        <>
          {/* SAY WHEN THIS IS NOT THE WHOLE LIBRARY. A confined viewer is looking
              at the folders shared with them; letting the screen imply otherwise
              would have them hunting for content that was never theirs. */}
          {confined && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
              <Users className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">Shared with you.</span> You are seeing the
                folders someone gave you access to, not the whole library.
              </span>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-3">
            {/* Breadcrumb across the whole path, so any ancestor is one click. */}
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
              <button
                type="button"
                onClick={() => { setPath([]); setOpenLegacy(null); }}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  openFolder ? "text-muted-foreground hover:text-foreground" : "font-semibold",
                )}
              >
                All folders
              </button>
              {trail.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1.5">
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setPath(path.slice(0, i + 1))}
                    className={cn(
                      "rounded px-1.5 py-0.5",
                      i === trail.length - 1
                        ? "font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
              {openLegacy && (
                <span className="flex items-center gap-1.5">
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className="font-semibold">{openLegacy.name}</span>
                </span>
              )}
            </nav>

            <div className="relative ml-auto w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search content"
                className="pl-8"
              />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            {openFolder ? (
              <button
                type="button"
                onClick={() => {
                  const ids = openFolder.objects.map((o) => o.id);
                  setMany(ids, triOf(ids) !== "on");
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50"
              >
                <Box state={triOf(openFolder.objects.map((o) => o.id))} />
                <span className="font-medium">Select everything in this folder</span>
                <span className="text-xs text-muted-foreground">
                  {openFolder.objects.length}{" "}
                  {openFolder.objects.length === 1 ? "item" : "items"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMany(allIds, triOf(allIds) !== "on")}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50"
              >
                <Box state={triOf(allIds)} />
                <span className="font-medium">Select all</span>
                <span className="text-xs text-muted-foreground">
                  {folders.length} {folders.length === 1 ? "folder" : "folders"} · {allIds.length} items
                </span>
              </button>
            )}
          </div>

          {/* The action bar appears only with a selection: a permanently visible
              "share 0 items" is a control that spends a click to say no. */}
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-accent/40 px-3 py-2">
              <span className="text-sm font-medium">
                {selected.size} {selected.size === 1 ? "item" : "items"} selected
              </span>
              {canViewShares && (
                <Button size="sm" variant="secondary"
                  onClick={() => setSharing({ objects: selectedObjects, label: `${selected.size} items` })}>
                  <Share2 className="size-4" /> Share
                </Button>
              )}
              {canPublish && (
                <Button size="sm" variant="secondary"
                  onClick={() => setPublishing({ objects: selectedObjects, label: `${selected.size} items` })}>
                  <Send className="size-4" /> Publish
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
            {openFolder
              ? [
                  ...openFolder.objects.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 border-b p-3 last:border-b-0 hover:bg-accent/30">
                    <button
                      type="button"
                      onClick={() => setMany([o.id], !selected.has(o.id))}
                      aria-pressed={selected.has(o.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Box state={selected.has(o.id) ? "on" : "off"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{o.title || "Untitled"}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {o.type.replace(/_/g, " ")}
                          </span>
                          {/* WHICH VERSION WOULD GO. Someone deciding whether to
                              carry this on an app needs to know it is v3 and not
                              whatever was saved since — that is the difference
                              between carrying what they reviewed and carrying
                              something they have not seen. */}
                          {o.version_number != null && (
                            <span className="text-[11px] text-muted-foreground">v{o.version_number}</span>
                          )}
                          {o.published_at == null && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">
                              no published version
                            </span>
                          )}
                          <ReachSummary o={o} />
                        </span>
                      </span>
                    </button>
                    {rowActions([o], o.title || "Untitled")}
                  </div>
                  )),
                  // FILES SIT BELOW THE AUTHORED CONTENT, and carry no checkbox:
                  // they cannot be shared or published yet (migration 0011 says
                  // why), so a checkbox would enlist them in a Share the server
                  // would refuse. Their affordances are open and remove.
                  ...openFolder.assets.map((a) => {
                    const Icon = ASSET_ICON[a.kind] ?? Link2;
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 border-b bg-muted/20 p-3 last:border-b-0 hover:bg-accent/30"
                      >
                        <span className="size-4 shrink-0" />
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{a.title || "Untitled file"}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            <span className="uppercase tracking-wide">{a.kind}</span>
                            {a.byte_size ? <span>{(a.byte_size / 1024 / 1024).toFixed(1)} MB</span> : null}
                            <span>{a.external_url ? "linked" : "stored"}</span>
                          </span>
                        </span>
                        {a.external_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={a.external_url} target="_blank" rel="noreferrer">Open</a>
                          </Button>
                        )}
                        {canUpload && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title={`Remove ${a.title}`}
                            aria-label={`Remove ${a.title}`}
                            onClick={() => {
                              void (async () => {
                                try {
                                  await deleteLibraryAsset(programId, a.id);
                                  toast.success(`Removed \u201c${a.title}\u201d`);
                                  reload();
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : "Couldn't remove that file",
                                  );
                                }
                              })();
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    );
                  }),
                ]
              : folders.map((f) => {
                  const ids = f.objects.map((o) => o.id);
                  const real = f.row;
                  const reach =
                    (real?.clubs.length ?? 0) + (real?.people.length ?? 0) + (real?.granted_apps.length ?? 0);
                  return (
                    <div key={f.key} className="flex items-center gap-3 border-b p-3 last:border-b-0 hover:bg-accent/30">
                      <button
                        type="button"
                        onClick={() => setMany(ids, triOf(ids) !== "on")}
                        aria-pressed={triOf(ids) === "on"}
                        aria-label={`Select ${f.name}`}
                        className="shrink-0"
                      >
                        <Box state={triOf(ids)} />
                      </button>
                      {/* The NAME opens the folder — the checkbox selects it.
                          Conflating the two is how a click to look becomes a
                          click that changes what Share will act on. */}
                      <button
                        type="button"
                        onClick={() => (real ? setPath([...path, real.id]) : setOpenLegacy(f))}
                        disabled={real ? !real.reachable : false}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                      >
                        <Folder className={cn(
                          "size-4 shrink-0",
                          real?.reachable === false ? "text-muted-foreground/50" : "text-muted-foreground",
                        )} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-medium">{f.name}</span>
                            {/* A folder that exists only as a name on the content
                                filed into it. Marked, because it cannot be shared,
                                renamed or nested — there is no row to act on. */}
                            {!real && f.key !== UNFILED && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                from the Studio
                              </span>
                            )}
                            {real?.reachable === false && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                on the way to a folder you were given
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {f.childCount > 0 && (
                              <span>{f.childCount} {f.childCount === 1 ? "folder" : "folders"}</span>
                            )}
                            <span>{f.objects.length} {f.objects.length === 1 ? "item" : "items"}</span>
                            {f.assets.length > 0 && (
                              <span>{f.assets.length} {f.assets.length === 1 ? "file" : "files"}</span>
                            )}
                            {/* WHO THE FOLDER ITSELF REACHES — distinct from who
                                its current contents reach, and the only place the
                                subtree grant is visible. */}
                            {canViewShares && real && reach > 0 && (
                              <span className="flex items-center gap-1 text-sky-700 dark:text-sky-300">
                                <Share2 className="size-3" />
                                folder shared with {real.clubs.length ? `${real.clubs.length} club${real.clubs.length === 1 ? "" : "s"}` : ""}
                                {real.clubs.length && real.people.length ? ", " : ""}
                                {real.people.length ? `${real.people.length} ${real.people.length === 1 ? "person" : "people"}` : ""}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>

                      {/* FOLDER actions come before the content actions, because
                          "share this folder" and "share what is in it right now"
                          are different promises and the folder one is the outer
                          scope. Only a real row gets them. */}
                      {real && canViewShares && (
                        <Button
                          size="icon" variant="ghost"
                          title={`Share the "${f.name}" folder itself, and everything in it`}
                          aria-label={`Share the ${f.name} folder`}
                          onClick={() => setSharingFolder(real)}
                        >
                          <Users className="size-4" />
                        </Button>
                      )}
                      {real && canManageFolders && (
                        <>
                          <Button
                            size="icon" variant="ghost"
                            title={`Rename ${f.name}`} aria-label={`Rename ${f.name}`}
                            onClick={() => setRenaming(real)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            title={`Delete the ${f.name} folder`} aria-label={`Delete ${f.name}`}
                            onClick={() => {
                              void (async () => {
                                const inside = f.childCount + f.objects.length + f.assets.length;
                                const warn = f.childCount
                                  ? `Delete "${f.name}" and its ${f.childCount} subfolder${f.childCount === 1 ? "" : "s"}? Content inside is kept and becomes unfiled.`
                                  : inside
                                    ? `Delete "${f.name}"? The ${inside} item${inside === 1 ? "" : "s"} inside are kept and become unfiled.`
                                    : `Delete the empty folder "${f.name}"?`;
                                if (!window.confirm(warn)) return;
                                try {
                                  await deleteLibraryFolder(programId, real.id);
                                  toast.success(`Deleted \u201c${f.name}\u201d — content kept`);
                                  reload();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Couldn't delete that folder");
                                }
                              })();
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                      {rowActions(f.objects, f.name)}
                      <ChevronRight className={cn(
                        "size-4 shrink-0 text-muted-foreground",
                        real?.reachable === false && "opacity-30",
                      )} />
                    </div>
                  );
                })}
          </div>
        </>
      )}

      {sharing && (
        <ShareContentDialog
          programId={programId}
          canShareClubs={canShareClubs}
          canShareMembers={canShareMembers}
          canShareApps={canShareApps}
          objects={sharing.objects}
          label={sharing.label}
          onClose={() => setSharing(null)}
          onSaved={reload}
        />
      )}
      {addingFile && (
        <AddLibraryFileDialog
          programId={programId}
          // Ids where a real folder exists, so a file lands IN it rather than
          // beside it under a matching name — see the dialog's `folders` prop.
          folders={folders.map((f) => ({ id: f.row?.id ?? null, name: f.name }))}
          defaultFolder={openFolder?.name ?? null}
          onClose={() => setAddingFile(false)}
          onSaved={reload}
        />
      )}
      {sharingFolder && (
        <ShareContentDialog
          programId={programId}
          canShareClubs={canShareClubs}
          canShareMembers={canShareMembers}
          canShareApps={canShareApps}
          objects={[]}
          folder={sharingFolder}
          label={sharingFolder.name}
          onClose={() => setSharingFolder(null)}
          onSaved={reload}
        />
      )}
      {newFolder && (
        <FolderNameDialog
          title="New folder"
          description={`Creates a folder in ${newFolder.parentName}. Folders can be shared as a whole, so anything filed here later is covered too.`}
          confirmLabel="Create folder"
          onClose={() => setNewFolder(null)}
          onSubmit={async (name) => {
            await createLibraryFolder(programId, name, newFolder.parentId);
            toast.success(`Created \u201c${name}\u201d`);
            reload();
          }}
        />
      )}
      {renaming && (
        <FolderNameDialog
          title={`Rename \u201c${renaming.name}\u201d`}
          description="Content stays where it is; only the folder's name changes. Anyone it was shared with keeps their access."
          confirmLabel="Rename"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await renameLibraryFolder(programId, renaming.id, name);
            toast.success(`Renamed to \u201c${name}\u201d`);
            reload();
          }}
        />
      )}
      {publishing && (
        <PublishContentDialog
          programId={programId}
          administersApps={administers}
          canScopeToClub={canScopeToClub}
          objects={publishing.objects}
          label={publishing.label}
          onClose={() => setPublishing(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
