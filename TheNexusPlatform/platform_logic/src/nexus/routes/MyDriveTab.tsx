/**
 * My Drive — a space of this person's own, beside the shared library rather than
 * inside it.
 *
 * A drive and the Content Library are DIFFERENT SPACES, not two views of one.
 * Putting a personal drive in the program's folder tree sat somebody's private
 * work next to the program's and made "whose is this?" unanswerable at a glance,
 * which is the confusion drives exist to end. So the library read subtracts every
 * drive folder and this screen is the only thing that adds one back
 * (`?scope=drive`).
 *
 * CREATING opens the real Content Studio, confined to this drive and filtered to
 * the types this person was permitted. Not a second editor: the Studio is what
 * actually authors content, and a parallel one here would be a worse copy that
 * drifts from it.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { FolderTree, HardDrive, Loader2, Plus, SquarePen } from "lucide-react";
import { toast } from "sonner";

import {
  getContentLibrary, getMyDrive, launchLearningPlatform,
  type LibraryObject,
} from "@/services/api";
import { PageHeader } from "@/nexus/ui/kit";
import { Button } from "@/app/components/ui/button";
import { PipelineStudioDialog } from "@/nexus/routes/PipelineStudioDialog";

interface Drive {
  has_drive: boolean;
  can_create?: boolean;
  create_types?: string[] | null;
  drive_id?: string | null;
  drive_name?: string | null;
  drafts_id?: string | null;
}

export function MyDriveTab() {
  const { programId = "" } = useParams();
  const [drive, setDrive] = useState<Drive | null>(null);
  const [objects, setObjects] = useState<LibraryObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openObject, setOpenObject] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getMyDrive(programId);
      setDrive(d);
      if (d.has_drive && d.drive_id) {
        const lib = await getContentLibrary(programId, { scope: "drive", drive: d.drive_id });
        setObjects(lib.objects ?? []);
      } else {
        setObjects([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open your drive");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  async function openCreator() {
    if (!drive?.drive_id) return;
    setCreating(true);
    try {
      const l = await launchLearningPlatform(programId);
      if (!l.launch_url) throw new Error("The Content Studio is not configured here.");
      const u = new URL(l.launch_url);
      u.searchParams.set("launch_token", l.launch_token);
      u.searchParams.set("create", "1");
      // Drafts, not the root: everything authored lands in one named place.
      u.searchParams.set("drive", drive.drafts_id ?? drive.drive_id);
      u.searchParams.set("program_id", programId);
      // Absent means unrestricted; present-and-empty means none. Sending the
      // list only when there IS one keeps that difference intact across the URL.
      if (drive.create_types !== null && drive.create_types !== undefined) {
        u.searchParams.set("types", drive.create_types.join(","));
      }
      window.open(u.toString(), "_blank", "noopener,width=1200,height=900");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the creator");
    } finally {
      setCreating(false);
    }
  }

  const canCreate = drive?.can_create === true && (drive.create_types?.length ?? 1) > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={drive?.drive_name ?? "My Drive"}
        subtitle="Yours. Nothing here reaches anyone else until you share it out."
        actions={
          drive?.has_drive ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Refresh
              </Button>
              {canCreate && (
                <Button size="sm" disabled={creating} onClick={() => void openCreator()}>
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
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
          {/* Not having one is an ordinary state, not a failure — so this says who
              can change it rather than reading like something went wrong. */}
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            A drive is a space of your own, separate from the shared Content Library. Whoever
            manages the library can give you one.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {drive.can_create && (drive.create_types?.length ?? 1) === 0 && (
            <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              You have a drive, but no content types have been turned on for it yet.
            </p>
          )}
          {objects.length === 0 ? (
            <div className="rounded-xl border p-6 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <FolderTree className="size-4 text-muted-foreground" /> Nothing here yet
              </p>
              <p className="mt-1 text-muted-foreground">
                {canCreate
                  ? "Make something, and it lands here rather than in the shared library."
                  : "Content shared into your drive will appear here."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {/* Grouped by folder, so Drafts reads as a place rather than the
                  list happening to begin with the newest thing. */}
              {objects.map((o) => (
                <li key={o.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.title || "Untitled"}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {o.type.replace(/-/g, " ")}
                      {o.version_number != null && ` · v${o.version_number}`}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={`Open ${o.title || "this content"}`}
                    onClick={() => setOpenObject({ id: o.id, title: o.title })}
                  >
                    <SquarePen className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {openObject && (
        <PipelineStudioDialog
          programId={programId}
          objectId={openObject.id}
          title={openObject.title}
          canEdit
          onClose={() => { setOpenObject(null); void load(); }}
        />
      )}
    </div>
  );
}
