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
 * NOTHING IS CREATED HERE — no content, no folders. This tab governs an existing
 * library: who each piece reaches, and which app it publishes to. Authoring lives
 * in the Content Studio, and the split is the point rather than a limitation, so
 * there is no New button to imply otherwise.
 *
 * It is also what the data allows. Folders live in the Studio's localStorage, per
 * author (objectCollectionsStore.ts) — no collections table, no API. Nexus can SEE
 * them only because each object carries its folder ids and names (migration 0003
 * denormalises them). Two consequences worth knowing while reading this file:
 * nesting is invisible here (parentId never leaves the Studio), and two authors can
 * see different folders for the same content.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  ChevronRight, Check, Folder, Loader2, RefreshCw, Search,
  Share2, Send, Smartphone, User, Users,
} from "lucide-react";

import { getContentLibrary, type LibraryObject } from "@/services/api";
import { useProgramAccess } from "@/nexus/access";
import { SubRolesPanel } from "@/nexus/routes/SubRolesPanel";
import { PageHeader, EmptyState } from "@/nexus/ui/kit";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";
import { ShareContentDialog } from "@/nexus/routes/ShareContentDialog";
import { PublishContentDialog } from "@/nexus/routes/PublishContentDialog";

const UNFILED = "__unfiled__";
type Tri = "on" | "off" | "some";

interface FolderGroup {
  key: string;
  name: string;
  objects: LibraryObject[];
}

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

export function ContentLibraryTab() {
  const { programId = "" } = useParams();
  const access = useProgramAccess(programId);
  // Sub-roles are a second job on this tab, not a second sidebar entry: deciding
  // who may share is the same remit as deciding what gets shared.
  const canDelegate =
    access.isAdmin || access.capabilities.includes("learning.roles.delegate");

  const [view, setView] = useState<"content" | "roles">("content");
  const [objects, setObjects] = useState<LibraryObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** null = at the root, showing folders. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<{ objects: LibraryObject[]; label: string } | null>(null);
  const [publishing, setPublishing] = useState<{ objects: LibraryObject[]; label: string } | null>(null);

  /** Apps this viewer administers — empty for a content manager who runs none. */
  const [administers, setAdministers] = useState<string[]>([]);

  const load = useCallback(() => {
    setError(null);
    return getContentLibrary(programId)
      .then((r) => {
        setObjects(r.objects);
        setAdministers(r.administersApps);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't load this program's content"),
      );
  }, [programId]);

  useEffect(() => {
    setObjects(null);
    void load();
  }, [load]);

  // One object can belong to several folders, so it appears under each — the same
  // rule the Studio's library follows, and the reason selection is by object id.
  const folders = useMemo<FolderGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const list = (objects ?? []).filter((o) => (q ? o.title.toLowerCase().includes(q) : true));
    const byKey = new Map<string, FolderGroup>();
    for (const o of list) {
      const names = o.collection_names.length ? o.collection_names : [UNFILED];
      names.forEach((name, i) => {
        const key = o.collection_ids[i] ?? name;
        const g = byKey.get(key) ?? { key, name: name === UNFILED ? "Unfiled" : name, objects: [] };
        g.objects.push(o);
        byKey.set(key, g);
      });
    }
    return [...byKey.values()].sort((a, b) =>
      a.name === "Unfiled" ? 1 : b.name === "Unfiled" ? -1 : a.name.localeCompare(b.name),
    );
  }, [objects, query]);

  const openFolder = openKey ? folders.find((f) => f.key === openKey) ?? null : null;
  // Searching while inside a folder that no longer matches would leave someone
  // staring at an empty room with no clue why — go back to the root instead.
  useEffect(() => {
    if (openKey && !folders.some((f) => f.key === openKey)) setOpenKey(null);
  }, [openKey, folders]);

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
      <Button
        size="icon" variant="ghost"
        title={`Share ${label}`} aria-label={`Share ${label}`}
        onClick={() => setSharing({ objects: objs, label })}
      >
        <Share2 className="size-4" />
      </Button>
      <Button
        size="icon" variant="ghost"
        title={`Publish ${label}`} aria-label={`Publish ${label}`}
        onClick={() => setPublishing({ objects: objs, label })}
      >
        <Send className="size-4" />
      </Button>
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
      ) : objects.length === 0 ? (
        <EmptyState>
          <p className="font-medium text-foreground">No content yet</p>
          <p className="mt-1">
            Content authored in the Content Studio for this program appears here, ready to share.
          </p>
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {/* Breadcrumb, so "where am I" is answered without a back button. */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
              <button
                type="button"
                onClick={() => setOpenKey(null)}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  openFolder ? "text-muted-foreground hover:text-foreground" : "font-semibold",
                )}
              >
                All folders
              </button>
              {openFolder && (
                <>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className="font-semibold">{openFolder.name}</span>
                </>
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
              <Button size="sm" variant="secondary"
                onClick={() => setSharing({ objects: selectedObjects, label: `${selected.size} items` })}>
                <Share2 className="size-4" /> Share
              </Button>
              <Button size="sm" variant="secondary"
                onClick={() => setPublishing({ objects: selectedObjects, label: `${selected.size} items` })}>
                <Send className="size-4" /> Publish
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
            {openFolder
              ? openFolder.objects.map((o) => (
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
                          <ReachSummary o={o} />
                        </span>
                      </span>
                    </button>
                    {rowActions([o], o.title || "Untitled")}
                  </div>
                ))
              : folders.map((f) => {
                  const ids = f.objects.map((o) => o.id);
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
                        onClick={() => setOpenKey(f.key)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {f.objects.length} {f.objects.length === 1 ? "item" : "items"}
                        </span>
                      </button>
                      {rowActions(f.objects, f.name)}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                  );
                })}
          </div>
        </>
      )}

      {sharing && (
        <ShareContentDialog
          programId={programId}
          objects={sharing.objects}
          label={sharing.label}
          onClose={() => setSharing(null)}
          onSaved={reload}
        />
      )}
      {publishing && (
        <PublishContentDialog
          programId={programId}
          administersApps={administers}
          objects={publishing.objects}
          label={publishing.label}
          onClose={() => setPublishing(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
