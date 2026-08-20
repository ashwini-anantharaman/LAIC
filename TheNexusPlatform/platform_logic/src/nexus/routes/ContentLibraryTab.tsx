/**
 * The Content Library — a program tab, answered by Nexus.
 *
 * Deliberately NOT the Content Studio in a frame. This screen exists to decide who
 * content reaches, which is a governance question the console owns; the Studio owns
 * authoring. Framing it would have put an authoring tool inside a permissions tab
 * and left the sharing controls one app away from the person doing the granting.
 *
 * The shape is a folder list, because that is how the library is already organised
 * and how someone thinks about "share this lot". Every row — the whole library, one
 * folder, one item — is the same gesture at a different scale, so `share` and
 * `publish` take a list of objects and nothing else knows the difference.
 *
 * SELECTION IS BY OBJECT, NOT BY FOLDER. An object can sit in several folders, so
 * ticking two folders that overlap must not share the same item twice or count it
 * twice; the selection is a set of object ids and the folder checkboxes are a view
 * onto it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  Check, ChevronRight, Folder, FolderOpen, Loader2, RefreshCw, Search,
  Share2, Send, Users, User, Smartphone,
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

/** The tri-state box used across this screen. A dash means "some", and that
 *  distinction is the whole reason the screen is worth having. */
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
  // Sub-roles are a second job on this tab, not a second tab in the sidebar:
  // deciding who may share is the same remit as deciding what gets shared, and a
  // Content Manager should not have to leave the library to delegate part of it.
  // Admins see it too — they hold every capability, so the ceiling is everything.
  const canDelegate =
    access.isAdmin || access.capabilities.includes("learning.roles.delegate");
  const [view, setView] = useState<"content" | "roles">("content");
  const [objects, setObjects] = useState<LibraryObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<{ objects: LibraryObject[]; label: string } | null>(null);
  const [publishing, setPublishing] = useState<{ objects: LibraryObject[]; label: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    return getContentLibrary(programId)
      .then(setObjects)
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
    const list = (objects ?? []).filter((o) =>
      query.trim() ? o.title.toLowerCase().includes(query.trim().toLowerCase()) : true,
    );
    const byKey = new Map<string, FolderGroup>();
    for (const o of list) {
      const names = o.collection_names.length ? o.collection_names : [UNFILED];
      names.forEach((name, i) => {
        const key = o.collection_ids[i] ?? name;
        const g = byKey.get(key) ?? {
          key,
          name: name === UNFILED ? "Unfiled" : name,
          objects: [],
        };
        g.objects.push(o);
        byKey.set(key, g);
      });
    }
    return [...byKey.values()].sort((a, b) =>
      a.name === "Unfiled" ? 1 : b.name === "Unfiled" ? -1 : a.name.localeCompare(b.name),
    );
  }, [objects, query]);

  const allIds = useMemo(
    () => [...new Set(folders.flatMap((f) => f.objects.map((o) => o.id)))],
    [folders],
  );
  const byId = useMemo(
    () => new Map((objects ?? []).map((o) => [o.id, o])),
    [objects],
  );

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

  const reload = () => {
    void load();
  };

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
              <Button variant="outline" size="sm" onClick={reload} disabled={objects === null}>
                <RefreshCw className={cn("size-4", objects === null && "animate-spin")} /> Refresh
              </Button>
            )}
          </>
        }
      />

      {view === "roles" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SubRolesPanel programId={programId} />
        </div>
      ) : (
      <>

      {error ? (
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

          {/* The action bar appears only with a selection: a permanently visible
              "share 0 items" is a control that spends a click to say no. */}
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-accent/40 px-3 py-2">
              <span className="text-sm font-medium">
                {selected.size} {selected.size === 1 ? "item" : "items"} selected
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setSharing({ objects: selectedObjects, label: `${selected.size} items` })
                }
              >
                <Share2 className="size-4" /> Share
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setPublishing({ objects: selectedObjects, label: `${selected.size} items` })
                }
              >
                <Send className="size-4" /> Publish
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
            {folders.map((f) => {
              const ids = f.objects.map((o) => o.id);
              const isOpen = open.has(f.key);
              return (
                <div key={f.key} className="border-b last:border-b-0">
                  <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/30">
                    <button
                      type="button"
                      aria-label={isOpen ? "Collapse folder" : "Expand folder"}
                      onClick={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          n.has(f.key) ? n.delete(f.key) : n.add(f.key);
                          return n;
                        })
                      }
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setMany(ids, triOf(ids) !== "on")}
                      aria-pressed={triOf(ids) === "on"}
                      className="flex flex-1 items-center gap-2.5 text-left"
                    >
                      <Box state={triOf(ids)} />
                      {isOpen ? (
                        <FolderOpen className="size-4 text-muted-foreground" />
                      ) : (
                        <Folder className="size-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.objects.length} {f.objects.length === 1 ? "item" : "items"}
                      </span>
                    </button>

                    {/* Per-folder, per the brief: share everything in it in one act. */}
                    <Button
                      size="icon"
                      variant="ghost"
                      title={`Share “${f.name}” and everything in it`}
                      aria-label={`Share ${f.name}`}
                      onClick={() => setSharing({ objects: f.objects, label: f.name })}
                    >
                      <Share2 className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={`Publish “${f.name}”`}
                      aria-label={`Publish ${f.name}`}
                      onClick={() => setPublishing({ objects: f.objects, label: f.name })}
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="bg-muted/20">
                      <button
                        type="button"
                        onClick={() => setMany(ids, triOf(ids) !== "on")}
                        className="flex w-full items-center gap-2.5 border-t px-3 py-1.5 pl-12 text-left text-xs text-muted-foreground hover:bg-accent/30"
                      >
                        <Box state={triOf(ids)} className="size-3.5" />
                        Select everything in this folder
                      </button>
                      {f.objects.map((o) => (
                        <div
                          key={`${f.key}:${o.id}`}
                          className="flex items-center gap-2.5 border-t px-3 py-2 pl-12 hover:bg-accent/30"
                        >
                          <button
                            type="button"
                            onClick={() => setMany([o.id], !selected.has(o.id))}
                            aria-pressed={selected.has(o.id)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <Box state={selected.has(o.id) ? "on" : "off"} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{o.title || "Untitled"}</span>
                              <span className="mt-0.5 flex items-center gap-2">
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {o.type.replace(/_/g, " ")}
                                </span>
                                <ReachSummary o={o} />
                              </span>
                            </span>
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Share this item"
                            aria-label={`Share ${o.title}`}
                            onClick={() => setSharing({ objects: [o], label: o.title || "Untitled" })}
                          >
                            <Share2 className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Publish this item"
                            aria-label={`Publish ${o.title}`}
                            onClick={() => setPublishing({ objects: [o], label: o.title || "Untitled" })}
                          >
                            <Send className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
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
          objects={publishing.objects}
          label={publishing.label}
          onClose={() => setPublishing(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
