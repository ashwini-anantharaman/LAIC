/**
 * One piece of content's whole pipeline, inside Nexus.
 *
 * WHY THIS EXISTS AND NOT A LINK TO THE STUDIO. Being trusted with one folder is
 * not the same as being handed the authoring app. A club mentor given "Staging"
 * should be able to read — or change — what is in it, and nothing else: no
 * library of everybody's drafts, no create flow, no other program's content. A
 * Studio link cannot express that, because the Studio's unit of access is the
 * whole Studio.
 *
 * TWO LEVELS, AND THE SERVER DECIDES WHICH. `can_edit` comes from the folder
 * grant (migration 0012's `level`), so this screen never infers permission from
 * a capability list. A reviewer is shown a read-only surface rather than an
 * editable one that fails on save — the failure a client-side guess produces.
 *
 * WHAT "THE WHOLE PIPELINE" MEANS HERE. For a V3 tutorial: its sections, in
 * order, with each section's intent and its authored parts, plus the block
 * stream that renders to a learner. Rich text is editable in place; embeds and
 * quizzes are shown as what they are and left alone, because editing a quiz's
 * question model or repointing a library embed are authoring operations with
 * their own screens, and a half-built version of either here would be worse than
 * an honest read-only card.
 *
 * NOT A GENERATOR. "Generate something totally different" is the Studio's
 * pipeline — sources, markup, model calls. This surface reads and edits what
 * exists. That boundary is stated on screen rather than implied by a missing
 * button.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Eye, FileText, HelpCircle, Layers, Link2, Loader2, Lock, Save,
} from "lucide-react";
import { toast } from "sonner";

import { getObjectPipeline, saveObjectPipeline, type ObjectPipeline } from "@/services/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";

interface Block {
  id?: string;
  type?: string;
  content?: Record<string, unknown>;
}

interface V3Section {
  id?: string;
  order?: number;
  title?: string;
  intent?: string;
  parts?: unknown[];
  units?: unknown[];
  done?: boolean;
}

const BLOCK_ICON: Record<string, typeof FileText> = {
  "rich-text": FileText,
  quiz: HelpCircle,
  "library-embed": Link2,
};

export function ObjectPipelinePanel({
  programId,
  objectId,
  onClose,
}: {
  programId: string;
  objectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ObjectPipeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Local edits, keyed by block id. Absent = untouched. */
  const [title, setTitle] = useState("");
  const [edits, setEdits] = useState<Map<string, { heading?: string; text?: string }>>(new Map());

  const load = useCallback(() => {
    setError(null);
    return getObjectPipeline(programId, objectId)
      .then((d) => {
        setData(d);
        setTitle(d.title);
        setEdits(new Map());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't open this content"));
  }, [programId, objectId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const blocks: Block[] = useMemo(
    () => (Array.isArray(data?.blocks) ? (data!.blocks as Block[]) : []),
    [data],
  );
  const sections: V3Section[] = useMemo(() => {
    const raw = data?.pipeline_draft?.tutorialV3Draft?.sections;
    return Array.isArray(raw) ? (raw as V3Section[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
  }, [data]);

  const canEdit = !!data?.can_edit;
  const dirty = title !== (data?.title ?? "") || edits.size > 0;

  const valueOf = (b: Block, field: "heading" | "text"): string => {
    const local = b.id ? edits.get(b.id) : undefined;
    if (local && local[field] !== undefined) return local[field] as string;
    return String((b.content?.[field] as string | undefined) ?? "");
  };
  const setField = (b: Block, field: "heading" | "text", v: string) => {
    if (!b.id) return;
    setEdits((m) => {
      const n = new Map(m);
      n.set(b.id!, { ...(n.get(b.id!) ?? {}), [field]: v });
      return n;
    });
  };

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      // Send the WHOLE block list with edits folded in. The endpoint replaces
      // blocks wholesale, so a partial list would delete everything untouched.
      const next = blocks.map((b) => {
        const e = b.id ? edits.get(b.id) : undefined;
        if (!e) return b;
        return { ...b, content: { ...(b.content ?? {}), ...e } };
      });
      await saveObjectPipeline(programId, objectId, { title: title.trim() || data.title, blocks: next });
      toast.success("Saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="size-4" /> Content Library
        </Button>
        {data && (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              canEdit
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
            )}
          >
            {canEdit ? <Save className="size-3" /> : <Eye className="size-3" />}
            {canEdit ? "Edit access" : "Review access — read only"}
          </span>
        )}
        {canEdit && (
          <Button size="sm" className="ml-auto" disabled={!dirty || saving} onClick={() => void save()}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save changes
          </Button>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-foreground">This content didn&rsquo;t open</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening the pipeline…
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="rounded-xl border p-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Title
            </label>
            {canEdit ? (
              <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
            ) : (
              <p className="mt-1 text-lg font-semibold">{data.title}</p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="uppercase tracking-wide">{data.type.replace(/-/g, " ")}</span>
              <span>{data.status}</span>
              {data.version_number != null && <span>v{data.version_number}</span>}
              {data.collection_names.length > 0 && <span>in {data.collection_names.join(", ")}</span>}
            </p>
          </div>

          {sections.length > 0 && (
            <div className="rounded-xl border">
              <p className="border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline · {sections.length} sections
              </p>
              {sections.map((sec, i) => (
                <div key={sec.id ?? i} className="flex items-start gap-3 border-b p-3 last:border-b-0">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold">
                    {sec.order ?? i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{sec.title || "Untitled section"}</span>
                    {sec.intent ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{sec.intent}</span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                      <span>{(sec.parts ?? []).length} parts</span>
                      <span>{(sec.units ?? []).length} units</span>
                      {sec.done ? <span className="text-emerald-600 dark:text-emerald-400">generated</span> : null}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border">
            <p className="border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Content · {blocks.length} blocks
            </p>
            {blocks.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">This object has no blocks yet.</p>
            )}
            {blocks.map((b, i) => {
              const Icon = BLOCK_ICON[b.type ?? ""] ?? Layers;
              const editable = canEdit && b.type === "rich-text";
              return (
                <div key={b.id ?? i} className="border-b p-3 last:border-b-0">
                  <p className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-3.5" />
                    {(b.type ?? "block").replace(/-/g, " ")}
                    {/* Said out loud on the blocks this surface will not touch, so
                        read-only is never mistaken for broken. */}
                    {canEdit && !editable && (
                      <span className="ml-auto flex items-center gap-1 normal-case">
                        <Lock className="size-3" /> edited in the Studio
                      </span>
                    )}
                  </p>
                  {b.type === "rich-text" ? (
                    <>
                      {editable ? (
                        <Input
                          className="mb-1.5"
                          placeholder="Heading"
                          value={valueOf(b, "heading")}
                          onChange={(e) => setField(b, "heading", e.target.value)}
                        />
                      ) : (
                        valueOf(b, "heading") && (
                          <p className="mb-1 text-sm font-semibold">{valueOf(b, "heading")}</p>
                        )
                      )}
                      {editable ? (
                        <textarea
                          className="min-h-24 w-full resize-y rounded-lg border bg-transparent p-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          value={valueOf(b, "text")}
                          onChange={(e) => setField(b, "text", e.target.value)}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {valueOf(b, "text") || "—"}
                        </p>
                      )}
                    </>
                  ) : b.type === "quiz" ? (
                    <p className="text-sm text-muted-foreground">
                      {((b.content?.questions as unknown[]) ?? []).length} question(s)
                      {b.content?.passMark != null && ` · pass mark ${String(b.content.passMark)}`}
                    </p>
                  ) : b.type === "library-embed" ? (
                    <p className="text-sm text-muted-foreground">
                      {String(b.content?.libraryTitle ?? b.content?.label ?? "Embedded object")}
                      {b.content?.objectType ? ` · ${String(b.content.objectType)}` : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {Object.keys(b.content ?? {}).length} field(s)
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="pb-2 text-xs text-muted-foreground">
            Sections, quizzes and embedded objects are authored in the Content Studio. This screen
            reads the pipeline and edits its text.
          </p>
        </div>
      )}
    </div>
  );
}
