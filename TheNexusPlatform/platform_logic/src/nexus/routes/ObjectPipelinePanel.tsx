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
 * WHAT "THE WHOLE PIPELINE" MEANS HERE — every stage the Studio walked, in the
 * order it walked them, because "how was this made" is the question a reviewer is
 * actually asking:
 *
 *   BUILD PATH   from a template, or written by hand (metadata.authoringPath)
 *   PLAN         the template recipe and its settings — for a quiz that is the
 *                purpose, question count, pass mark, difficulty, question types,
 *                cognitive levels and feedback timing (structuredV2Draft.fv)
 *   SOURCES      the source pool the questions were drawn from, sentence by
 *                sentence, so a reviewer can check a question against what it
 *                claims to come from
 *   AUTHOR       units and slots — each question with its options, the marked
 *                correct answer, and the explanation
 *   REVIEW       the phase and status the object reached
 *
 * A first version of this screen showed a title and "1 block · 8 questions", and
 * called that edit access. It answered nothing about how the quiz was built,
 * which is the whole point of review access.
 *
 * EDIT means the text of the pipeline: question wording, options, explanations,
 * section text, titles. Structure is not editable here — adding a question,
 * repointing a source, changing the template — because those change the shape of
 * a pipeline the Studio owns, and a half-built version would be worse than an
 * honest read-only view. The screen marks what it will not touch.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

interface QuizQuestion {
  question?: string;
  type?: string;
  options?: string[];
  correct?: number;
  explanation?: string;
  hints?: string[];
}
interface Slot {
  id?: string;
  title?: string;
  kind?: string;
  done?: boolean;
  question?: QuizQuestion;
}
interface Unit {
  id?: string;
  title?: string;
  intent?: string;
  authorMode?: string;
  done?: boolean;
  slots?: Slot[];
}
interface SourceEntry {
  id?: string;
  label?: string;
  kind?: string;
  sentences?: { text?: string; page?: number }[];
}
interface StructuredDraft {
  metadata?: { authoringPath?: string };
  templateId?: string;
  fv?: Record<string, unknown>;
  units?: Unit[];
  sourcePool?: SourceEntry[];
  phase?: string;
  status?: string;
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

/** The Studio's own words for a quiz template's settings. */
const FV_LABELS: Record<string, string> = {
  purpose: "Purpose",
  nq: "Questions",
  pass: "Pass mark",
  passOn: "Pass required",
  diff: "Difficulty",
  qtypes: "Question types",
  cog: "Cognitive levels",
  show: "Show answers",
  perq: "Per-question feedback",
  adaptive: "Adaptive",
};

/**
 * One numbered stage of the pipeline.
 *
 * Numbered, because the ORDER is half the information: a reviewer asking how a
 * quiz was built needs to see that the questions came after the sources, not
 * beside them.
 */
function Stage({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border">
      <h3 className="flex items-center gap-2.5 border-b px-4 py-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold">
          {n}
        </span>
        <span className="text-sm font-semibold">{title}</span>
      </h3>
      <div className="space-y-2 p-4">{children}</div>
    </section>
  );
}

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
        setQEdits(new Map());
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
  /** The structured pipeline (quizzes, flashcards, concept cards). */
  const sv: StructuredDraft | null = useMemo(
    () => (data?.pipeline_draft?.structuredV2Draft as StructuredDraft | undefined) ?? null,
    [data],
  );

  /**
   * Question edits, keyed by "unitId/slotId". Separate from block edits because
   * they live in the DRAFT, not the block stream — the draft is what the Studio
   * reopens, so an edit that only touched blocks would vanish the next time
   * anybody looked at the pipeline.
   */
  const [qEdits, setQEdits] = useState<Map<string, Partial<QuizQuestion>>>(new Map());
  const qKey = (u: Unit, sl: Slot) => `${u.id ?? ""}/${sl.id ?? ""}`;
  const qVal = <K extends keyof QuizQuestion>(u: Unit, sl: Slot, f: K): QuizQuestion[K] => {
    const e = qEdits.get(qKey(u, sl));
    if (e && e[f] !== undefined) return e[f] as QuizQuestion[K];
    return sl.question?.[f];
  };
  const setQ = <K extends keyof QuizQuestion>(u: Unit, sl: Slot, f: K, v: QuizQuestion[K]) =>
    setQEdits((m) => {
      const n = new Map(m);
      n.set(qKey(u, sl), { ...(n.get(qKey(u, sl)) ?? {}), [f]: v });
      return n;
    });

  const canEdit = !!data?.can_edit;
  const dirty = title !== (data?.title ?? "") || edits.size > 0 || qEdits.size > 0;

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
      // The draft is the authoritative pipeline — it is what the Studio reopens.
      // The quiz BLOCK is the rendered copy a learner sees. An edit has to land in
      // both or the two disagree, and which one you believe depends on where you
      // happened to look.
      let draft = data.pipeline_draft;
      let blocksOut = next;
      if (qEdits.size && sv) {
        const units = (sv.units ?? []).map((u) => ({
          ...u,
          slots: (u.slots ?? []).map((sl) => {
            const e = qEdits.get(qKey(u, sl));
            return e && sl.question ? { ...sl, question: { ...sl.question, ...e } } : sl;
          }),
        }));
        draft = { ...(data.pipeline_draft ?? {}), structuredV2Draft: { ...sv, units } };
        // Question order in the block mirrors slot order across units.
        const flat = units.flatMap((u) => (u.slots ?? []).filter((sl) => sl.question).map((sl) => sl.question!));
        blocksOut = next.map((b) =>
          b.type === "quiz"
            ? { ...b, content: { ...(b.content ?? {}), questions: flat } }
            : b,
        );
      }
      await saveObjectPipeline(programId, objectId, {
        title: title.trim() || data.title,
        blocks: blocksOut,
        ...(draft !== data.pipeline_draft ? { pipeline_draft: draft } : {}),
      });
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

          {/* HOW THIS WAS BUILT — the stages the Studio walked, in order. This is
              what review access is for: a reviewer checking a question against the
              source it claims to come from should not have to open the Studio. */}
          {sv && (
            <div className="space-y-4">
              <Stage n={1} title="Build path">
                <p className="text-sm">
                  {sv.metadata?.authoringPath === "template"
                    ? "From a template — the organization's assigned recipe."
                    : sv.metadata?.authoringPath === "manual"
                      ? "Written by hand — no template."
                      : "Not recorded."}
                </p>
                {sv.templateId && (
                  <p className="mt-1 text-xs text-muted-foreground">template: {sv.templateId}</p>
                )}
              </Stage>

              {sv.fv && Object.keys(sv.fv).length > 0 && (
                <Stage n={2} title="Plan">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                    {Object.entries(sv.fv)
                      .filter(([k]) => k !== "templateId")
                      .map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {FV_LABELS[k] ?? k}
                          </dt>
                          <dd className="truncate">
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </Stage>
              )}

              {(sv.sourcePool ?? []).length > 0 && (
                <Stage n={3} title={`Sources · ${(sv.sourcePool ?? []).length}`}>
                  {(sv.sourcePool ?? []).map((src, i) => (
                    <details key={src.id ?? i} className="border-t pt-2 first:border-t-0 first:pt-0">
                      <summary className="cursor-pointer text-sm font-medium">
                        {src.label || "Source"}{" "}
                        <span className="font-normal text-muted-foreground">
                          {src.kind ? `· ${src.kind} ` : ""}· {(src.sentences ?? []).length} sentences
                        </span>
                      </summary>
                      <ol className="mt-2 space-y-1 pl-4 text-xs text-muted-foreground">
                        {(src.sentences ?? []).slice(0, 40).map((sn, j) => (
                          <li key={j} className="list-decimal">
                            {sn.text}
                            {sn.page != null && <span className="opacity-60"> (p{sn.page})</span>}
                          </li>
                        ))}
                        {(src.sentences ?? []).length > 40 && (
                          <li className="list-none opacity-70">
                            + {(src.sentences ?? []).length - 40} more
                          </li>
                        )}
                      </ol>
                    </details>
                  ))}
                </Stage>
              )}

              {(sv.units ?? []).length > 0 && (
                <Stage n={4} title="Author">
                  {(sv.units ?? []).map((u, ui) => (
                    <div key={u.id ?? ui} className="border-t pt-3 first:border-t-0 first:pt-0">
                      <p className="text-sm font-semibold">
                        {u.title || "Unit"}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {(u.slots ?? []).length} items
                          {u.authorMode ? ` · ${u.authorMode}` : ""}
                        </span>
                      </p>
                      {u.intent && <p className="mt-0.5 text-xs text-muted-foreground">{u.intent}</p>}
                      <ol className="mt-2 space-y-3">
                        {(u.slots ?? []).map((sl, si) => (
                          <li key={sl.id ?? si} className="rounded-lg border p-3">
                            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                              {sl.title || `Item ${si + 1}`}
                              {sl.question?.type ? ` · ${sl.question.type}` : ""}
                            </p>
                            {sl.question ? (
                              <>
                                {canEdit ? (
                                  <textarea
                                    className="mb-2 min-h-16 w-full resize-y rounded-lg border bg-transparent p-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={String(qVal(u, sl, "question") ?? "")}
                                    onChange={(e) => setQ(u, sl, "question", e.target.value)}
                                  />
                                ) : (
                                  <p className="mb-2 text-sm font-medium">{sl.question.question}</p>
                                )}
                                <ul className="space-y-1">
                                  {((qVal(u, sl, "options") as string[] | undefined) ?? []).map((opt, oi) => {
                                    const correct = (qVal(u, sl, "correct") as number | undefined) === oi;
                                    return (
                                      <li key={oi} className="flex items-start gap-2 text-sm">
                                        <span
                                          className={cn(
                                            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border text-[10px]",
                                            correct
                                              ? "border-emerald-600 bg-emerald-600 text-white"
                                              : "text-muted-foreground",
                                          )}
                                        >
                                          {correct ? "✓" : String.fromCharCode(65 + oi)}
                                        </span>
                                        {canEdit ? (
                                          <Input
                                            className="h-8"
                                            value={opt}
                                            onChange={(e) => {
                                              const next = [...(((qVal(u, sl, "options") as string[]) ?? []))];
                                              next[oi] = e.target.value;
                                              setQ(u, sl, "options", next);
                                            }}
                                          />
                                        ) : (
                                          <span className={correct ? "font-medium" : "text-muted-foreground"}>
                                            {opt}
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                                <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Why
                                </p>
                                {canEdit ? (
                                  <textarea
                                    className="min-h-14 w-full resize-y rounded-lg border bg-transparent p-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    value={String(qVal(u, sl, "explanation") ?? "")}
                                    onChange={(e) => setQ(u, sl, "explanation", e.target.value)}
                                  />
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {sl.question.explanation || "—"}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {sl.kind ?? "item"}
                                {sl.done ? " · done" : ""}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </Stage>
              )}

              <Stage n={5} title="Review">
                <p className="text-sm">
                  Phase <span className="font-medium">{sv.phase ?? "—"}</span>
                  {sv.status ? <> · status <span className="font-medium">{sv.status}</span></> : null}
                </p>
                {/* Structure is the Studio's. Said here rather than left to be
                    discovered by looking for a button that is not there. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Adding or removing questions, repointing sources and changing the template happen
                  in the Content Studio. This screen edits their text.
                </p>
              </Stage>
            </div>
          )}

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
