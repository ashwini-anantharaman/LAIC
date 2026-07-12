import { claudeJSON, claudeText } from "../lib/anthropic.js";
import { formatRetrievedContext, getCourseRagStats, retrieveContextForLesson, type RagChunk } from "../lib/rag.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { extractYouTubeId } from "../lib/youtube.js";
import { draftCourseStructure } from "./conceptTutor.js";
import {
  DEFAULT_IMPORTANCE,
  moduleToPage,
  placeImagesOnPages,
} from "../../shared/studio/build-pages.js";
import type {
  ContentPolicy,
  GeneratedStudioModule,
  StudioCourseData,
  StudioTool,
} from "../../shared/studio/types.js";
import { friendlyGenerationError, isSkeletonStudio } from "../../shared/studio/skeleton.js";
import {
  linkVocabInStudio,
  normalizeCardItem,
  normalizeVocabItem,
  syncStudioTools,
} from "../../shared/studio/vocab.js";
import { formatErrorMessage } from "../lib/errors.js";
import { config } from "../lib/config.js";

const STUDIO_GENERATE_PROMPT =
  "Build a structured course from the uploaded sources. If the source is a multi-chapter textbook, preserve its chapter structure with one module per chapter.";

export type StudioGenerateJob = {
  status: "idle" | "running" | "done" | "error";
  progress?: string;
  moduleIndex?: number;
  moduleTotal?: number;
  studio?: StudioCourseData;
  error?: string;
  startedAt: number;
};

const generateJobs = new Map<string, StudioGenerateJob>();

export function getStudioGenerateJob(courseId: string): StudioGenerateJob | null {
  return generateJobs.get(courseId) ?? null;
}

export function startStudioGenerateJob(
  courseId: string,
  policy: ContentPolicy,
  prompt?: string
): StudioGenerateJob {
  const existing = generateJobs.get(courseId);
  if (existing?.status === "running") return existing;

  const job: StudioGenerateJob = {
    status: "running",
    progress: "Analyzing sources and drafting structure…",
    startedAt: Date.now(),
  };
  generateJobs.set(courseId, job);

  void (async () => {
    try {
      const studio = await generateStudioCourse(courseId, policy, prompt, {
        onProgress: (message, moduleIndex, moduleTotal) => {
          generateJobs.set(courseId, {
            status: "running",
            progress: message,
            moduleIndex,
            moduleTotal,
            startedAt: job.startedAt,
          });
        },
      });
      generateJobs.set(courseId, {
        status: "done",
        studio,
        progress: "Course ready",
        startedAt: job.startedAt,
      });
    } catch (err) {
      generateJobs.set(courseId, {
        status: "error",
        error: friendlyGenerationError(formatErrorMessage(err)),
        startedAt: job.startedAt,
      });
    }
  })();

  return job;
}

const POLICY_HINT: Record<ContentPolicy, string> = {
  strict:
    "Use ONLY facts from the retrieved source excerpts. Do not invent cases, patients, or mechanisms not supported by the text.",
  generate:
    "Ground content in the sources but you may add helpful clarifying examples and questions that support understanding.",
  open:
    "Ground lessons in sources; supplementary examples are allowed when they aid learning.",
};

const BRAIN_REGIONS = [
  "amyg",
  "insula",
  "pag",
  "hippo",
  "vta",
  "nacc",
  "pfc",
  "broca",
  "wernicke",
  "temporal",
  "ffa",
  "striatum",
  "cortex",
] as const;

function policyLine(policy: ContentPolicy) {
  return POLICY_HINT[policy];
}

function uid() {
  return crypto.randomUUID();
}

function normalizeModule(raw: unknown, moduleName: string): GeneratedStudioModule {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hook = (o.hook as { q?: string; sub?: string }) ?? {};
  const lessons = Array.isArray(o.lessons) ? o.lessons : [];
  const cases = Array.isArray(o.cases) ? o.cases : [];
  const animation = (o.animation as GeneratedStudioModule["animation"]) ?? {
    title: `${moduleName} — brain walkthrough`,
    steps: [{ region: "cortex", head: moduleName, text: "Key structures for this topic." }],
  };
  const quiz = (o.quiz as GeneratedStudioModule["quiz"]) ?? { concepts: [] };
  const vocab = Array.isArray(o.vocab) ? o.vocab : [];
  const cards = Array.isArray(o.cards) ? o.cards : [];

  return {
    hook: {
      q: String(hook.q ?? `What makes "${moduleName}" worth understanding?`),
      sub: String(hook.sub ?? "Let's build intuition from your source material."),
    },
    lessons: lessons.slice(0, 4).map((l: Record<string, unknown>, i) => {
      const src = (l.src as Record<string, unknown>) ?? {};
      const check = (l.check as Record<string, unknown>) ?? {};
      const opts = Array.isArray(check.opts) ? check.opts.map(String).slice(0, 4) : ["A", "B", "C", "D"];
      while (opts.length < 4) opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
      return {
        kind: String(l.kind ?? (i === 0 ? "Build intuition" : "Go deeper")),
        title: String(l.title ?? `Lesson ${i + 1}`),
        html: String(l.html ?? `<p>${moduleName}</p>`),
        src: {
          cite: String(src.cite ?? "Course materials"),
          quote: typeof src.quote === "string" ? src.quote : undefined,
          page: typeof src.page === "number" ? src.page : 1,
        },
        check: {
          concept: String(check.concept ?? moduleName),
          stem: String(check.stem ?? `Quick check on ${moduleName}?`),
          opts,
          ans: typeof check.ans === "number" ? check.ans : 0,
          exp: String(check.exp ?? "See the lesson above."),
        },
      };
    }),
    cases: cases.slice(0, 2).map((c: Record<string, unknown>) => ({
      name: String(c.name ?? "Case study"),
      tag: String(c.tag ?? "Topic"),
      color: String(c.color ?? "#3fd0c0"),
      rows: (Array.isArray(c.rows) ? c.rows : [["Field", "Value"]]).map((r: unknown) => {
        const pair = Array.isArray(r) ? r : ["Field", "Value"];
        return [String(pair[0] ?? ""), String(pair[1] ?? "")] as [string, string];
      }),
      lesson: String(c.lesson ?? "What this case demonstrates."),
    })),
    animation: {
      title: String(animation.title ?? moduleName),
      steps: (Array.isArray(animation.steps) ? animation.steps : []).slice(0, 6).map((s: Record<string, unknown>) => ({
        region: BRAIN_REGIONS.includes(s.region as (typeof BRAIN_REGIONS)[number])
          ? String(s.region)
          : "cortex",
        head: String(s.head ?? ""),
        text: String(s.text ?? ""),
      })),
    },
    quiz: {
      concepts: (Array.isArray(quiz.concepts) ? quiz.concepts : []).slice(0, 4).map((c: Record<string, unknown>) => {
        const pool = Array.isArray(c.pool) ? c.pool : [];
        return {
          id: String(c.id ?? uid()),
          name: String(c.name ?? "Concept"),
          pool: pool.slice(0, 4).map((q: Record<string, unknown>) => {
            const opts = Array.isArray(q.opts) ? q.opts.map(String).slice(0, 4) : ["A", "B", "C", "D"];
            while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);
            return {
              stem: String(q.stem ?? ""),
              opts,
              ans: typeof q.ans === "number" ? q.ans : 0,
              exp: String(q.exp ?? ""),
            };
          }),
        };
      }),
    },
    vocab: vocab
      .slice(0, 12)
      .map((v: unknown) => {
        const pair = Array.isArray(v) ? v : ["term", "definition"];
        return [String(pair[0] ?? ""), String(pair[1] ?? "")] as [string, string];
      })
      .filter(([w]) => w),
    cards: cards
      .slice(0, 10)
      .map((c: unknown) => {
        const pair = Array.isArray(c) ? c : ["Front", "Back"];
        return [String(pair[0] ?? ""), String(pair[1] ?? "")] as [string, string];
      })
      .filter(([f, b]) => f && b),
  };
}

function pageFromCitation(citation: string): number | null {
  const pageMatch = citation.match(/(?:pp?\.|pages?\s*)(\d+)/i);
  if (pageMatch) return parseInt(pageMatch[1], 10);
  return null;
}

function citeLabel(citation: string): string {
  return citation.split(" · ")[0]?.trim() || citation;
}

function enrichLessonsFromChunks(mod: GeneratedStudioModule, chunks: RagChunk[]): GeneratedStudioModule {
  if (!chunks.length) return mod;
  return {
    ...mod,
    lessons: mod.lessons.map((lesson, i) => {
      const chunk = chunks[Math.min(i, chunks.length - 1)];
      const page =
        (typeof chunk.page_start === "number" && chunk.page_start > 0 ? chunk.page_start : null) ??
        pageFromCitation(chunk.citation ?? "") ??
        (typeof lesson.src.page === "number" && lesson.src.page > 0 ? lesson.src.page : 1);
      const cite = citeLabel(chunk.citation ?? "") || lesson.src.cite || "Course materials";
      return {
        ...lesson,
        src: {
          cite,
          quote: lesson.src.quote || chunk.content?.slice(0, 500),
          page,
        },
      };
    }),
  };
}

export async function generateStudioModule(
  courseId: string,
  moduleName: string,
  policy: ContentPolicy,
  opts?: { chapter?: string; subtitle?: string }
): Promise<GeneratedStudioModule> {
  const chunks = await retrieveContextForLesson(courseId, moduleName, {
    chapter: opts?.chapter,
    subtitle: opts?.subtitle,
    count: 12,
  });
  const context = formatRetrievedContext(chunks);

  const raw = await claudeJSON<unknown>(
    `You are the Owlwise Studio course builder. Create ONE module in the Brain Bee block model from retrieved sources.

Content policy: ${policyLine(policy)}

Return JSON only:
{
  "hook": { "q": string (curious question), "sub": string (one-sentence scene-setter) },
  "lessons": [
    {
      "kind": "Build intuition" | "Go deeper" | "Connect ideas",
      "title": string,
      "html": string (2-4 short <p> paragraphs, use <b> for key terms),
      "src": { "cite": string, "quote": string (verbatim excerpt), "page": number },
      "check": {
        "concept": string,
        "stem": string,
        "opts": [string, string, string, string],
        "ans": number (0-3),
        "exp": string
      }
    }
  ],
  "cases": [
    {
      "name": string,
      "tag": string,
      "color": "#3fd0c0",
      "rows": [["Label", "Value"], ...],
      "lesson": string
    }
  ],
  "animation": {
    "title": string,
    "steps": [{ "region": "${BRAIN_REGIONS.join("|")}", "head": string, "text": string }]
  },
  "quiz": {
    "concepts": [
      {
        "id": "c-...",
        "name": string,
        "pool": [
          { "stem": string, "opts": [string,string,string,string], "ans": number, "exp": string }
        ]
      }
    ]
  },
  "vocab": [["term", "definition"], ...],
  "cards": [["front", "back"], ...]
}

Rules:
- 2-3 lessons per module, each with its own inline check.
- 0-2 case files only when the source supports a patient, experiment, or concrete example.
- Animation: 3-5 steps with valid region keys.
- Mastery quiz: 2-3 concepts, each with 2-3 questions in the pool for retry variety.
- Vocab: 4-8 terms from the module. Cards: 4-6 flashcards.`,
    `Module: ${moduleName}
Chapter: ${opts?.chapter ?? "General"}

Sources:
${context || "(no chunks — use module title and general knowledge sparingly)"}`,
    12000
  );

  const mod = enrichLessonsFromChunks(normalizeModule(raw, moduleName), chunks);
  if (!mod.lessons.length) {
    mod.lessons.push({
      kind: "Build intuition",
      title: moduleName,
      html: `<p>Overview of <b>${moduleName}</b> from your uploaded materials.</p>`,
      src: { cite: "Course materials", page: 1 },
      check: {
        concept: moduleName,
        stem: `Which statement best describes ${moduleName}?`,
        opts: ["Option A", "Option B", "Option C", "Option D"],
        ans: 0,
        exp: "Review the lesson text above.",
      },
    });
  }
  if (!mod.quiz.concepts.length) {
    const check = mod.lessons[0]?.check;
    mod.quiz.concepts.push({
      id: uid(),
      name: moduleName,
      pool: check
        ? [{ stem: check.stem, opts: check.opts, ans: check.ans, exp: check.exp }]
        : [
            {
              stem: `Mastery check: ${moduleName}`,
              opts: ["A", "B", "C", "D"],
              ans: 0,
              exp: "Review the module.",
            },
          ],
    });
  }
  if (!mod.animation.steps.length) {
    mod.animation.steps = [{ region: "cortex", head: moduleName, text: "Key idea for this module." }];
  }
  return mod;
}

function seedTools(
  pages: StudioCourseData["pages"],
  allCards: [string, string][],
  allVocab: [string, string, number][]
): StudioTool[] {
  const caseItems = pages.flatMap((p) =>
    p.blocks
      .filter((b) => b.type === "case")
      .map((b) => (b.type === "case" ? { ...b, module: p.title } : null))
      .filter(Boolean)
  );
  return [
    { id: "tool-cases", kind: "cases", name: "Cases", items: caseItems },
    { id: "tool-cards", kind: "cards", name: "Cards", items: allCards.map(([front, back]) => [front, back] as [string, string]) },
    {
      id: "tool-vocab",
      kind: "vocab",
      name: "Vocab",
      items: allVocab.map(([term, def, pageIndex]) => [term, def, pageIndex]),
    },
  ];
}

export async function generateStudioCourse(
  courseId: string,
  policy: ContentPolicy,
  prompt?: string,
  opts?: {
    onProgress?: (message: string, moduleIndex?: number, moduleTotal?: number) => void;
  }
): Promise<StudioCourseData> {
  const report = (message: string, moduleIndex?: number, moduleTotal?: number) => {
    opts?.onProgress?.(message, moduleIndex, moduleTotal);
  };

  report("Checking indexed sources…");
  const stats = await getCourseRagStats(courseId);
  if (!stats.chunkCount) {
    throw new Error(
      stats.errorCount > 0
        ? "Source indexing failed — re-upload materials and wait until sources show Ready."
        : "No indexed sources yet — upload PDFs and wait until indexing completes."
    );
  }

  report("Drafting course structure from sources…");
  const draft = await draftCourseStructure(courseId, prompt ?? STUDIO_GENERATE_PROMPT);
  const chapters = draft.chapters ?? [];
  const flatModules: { id: string; name: string; chapter: string; chapterLabel: string; sort_order: number }[] = [];

  for (const ch of chapters) {
    for (const m of ch.modules ?? []) {
      if (!m?.name?.trim()) continue;
      flatModules.push({
        id: crypto.randomUUID(),
        name: m.name.trim(),
        chapter: ch.title ?? "General",
        chapterLabel: ch.label ?? ch.title ?? "CH 1",
        sort_order: flatModules.length,
      });
    }
  }

  if (!flatModules.length) {
    throw new Error("Could not derive modules from sources — add more material or try again.");
  }

  const maxModules = Math.max(1, config.studioMaxModules || 24);
  const modulesToBuild = flatModules.slice(0, maxModules);
  if (flatModules.length > maxModules) {
    console.warn(
      `[studio] Draft has ${flatModules.length} modules; building first ${maxModules}. Set STUDIO_MAX_MODULES to raise.`
    );
  }

  if (draft.title) {
    await supabaseAdmin.from("courses").update({ title: draft.title }).eq("id", courseId);
  }

  await supabaseAdmin.from("modules").delete().eq("course_id", courseId);
  await supabaseAdmin.from("chapters").delete().eq("course_id", courseId);

  for (const ch of chapters) {
    await supabaseAdmin.from("chapters").insert({
      course_id: courseId,
      title: ch.title,
      label: ch.label,
      sort_order: chapters.indexOf(ch),
    });
  }

  const { data: chapterRows } = await supabaseAdmin
    .from("chapters")
    .select("id, title")
    .eq("course_id", courseId);
  const chapterIdByTitle = Object.fromEntries((chapterRows ?? []).map((c) => [c.title, c.id]));

  for (const m of modulesToBuild) {
    await supabaseAdmin.from("modules").insert({
      id: m.id,
      course_id: courseId,
      name: m.name,
      sort_order: m.sort_order,
      chapter_id: chapterIdByTitle[m.chapter] ?? chapterRows?.[0]?.id ?? null,
    });
  }

  const pages = [];
  const allVocab: [string, string, number][] = [];
  const allCards: [string, string][] = [];

  for (let i = 0; i < modulesToBuild.length; i++) {
    const m = modulesToBuild[i];
    report(`Building module ${i + 1} of ${modulesToBuild.length}: ${m.name}`, i + 1, modulesToBuild.length);
    const generated = await generateStudioModule(courseId, m.name, policy, { chapter: m.chapter });
    const importance = DEFAULT_IMPORTANCE[i] ?? "core";
    const page = moduleToPage(m.id, m.name, generated, importance);
    pages.push(page);

    generated.vocab.forEach(([w, d]) => allVocab.push([w, d, i]));
    generated.cards.forEach((c) => allCards.push(c));

    const partial: StudioCourseData = linkVocabInStudio({
      policy,
      pages: [...pages],
      tools: seedTools(pages, allCards, allVocab),
      vocab: allVocab,
      cards: allCards,
    });
    const { error: partialError } = await supabaseAdmin
      .from("courses")
      .update({ content_policy: policy, studio_json: partial })
      .eq("id", courseId);
    if (partialError) {
      throw new Error(
        partialError.message.includes("studio_json")
          ? "Studio storage is not set up — run migration 003_studio_course.sql on Supabase."
          : `Could not save generated module: ${partialError.message}`
      );
    }
  }

  report("Placing images into lessons…");
  const { data: imageSources } = await supabaseAdmin
    .from("sources")
    .select("id, name, storage_path")
    .eq("course_id", courseId)
    .eq("type", "File");

  const images: { name: string; src: string }[] = [];
  for (const src of imageSources ?? []) {
    if (!src.storage_path) continue;
    const { data } = await supabaseAdmin.storage.from("sources").createSignedUrl(src.storage_path, 3600);
    if (data?.signedUrl) images.push({ name: src.name, src: data.signedUrl });
  }

  const pagesWithImages = placeImagesOnPages(pages, images);

  const studio: StudioCourseData = linkVocabInStudio({
    policy,
    pages: pagesWithImages,
    tools: seedTools(pagesWithImages, allCards, allVocab),
    vocab: allVocab,
    cards: allCards,
  });

  const { error: saveError } = await supabaseAdmin
    .from("courses")
    .update({ content_policy: policy, studio_json: studio })
    .eq("id", courseId);

  if (saveError) {
    throw new Error(
      saveError.message.includes("studio_json")
        ? "Studio storage is not set up — run migration 003_studio_course.sql on Supabase."
        : `Could not save generated course: ${saveError.message}`
    );
  }

  return studio;
}

export async function generateToolItems(
  courseId: string,
  policy: ContentPolicy,
  kind: string,
  pageTitles: string[],
  existing: unknown[]
): Promise<unknown[]> {
  const context = pageTitles.join(", ");
  const shape =
    kind === "cases"
      ? `[{ "name", "tag", "color", "rows": [["k","v"]], "lesson" }]`
      : kind === "cards"
        ? `[{ "front", "back" }]`
        : kind === "vocab"
          ? `[{ "word", "def" }]`
          : `[{ "title", "body" }]`;

  try {
    const raw = await claudeJSON<unknown>(
      `Generate supplementary ${kind} items for an instructor sidebar tool. Policy: ${policyLine(policy)}. Return JSON array only: ${shape}`,
      `Course pages: ${context}\nExisting count: ${existing.length}`,
      3000
    );
    const items = Array.isArray(raw) ? raw : [];
    if (kind === "cards") return items.map(normalizeCardItem);
    if (kind === "vocab") return items.map((item, i) => normalizeVocabItem(item, i));
    return items;
  } catch {
    if (kind === "cases") {
      return [{ name: "New case", tag: "Topic", color: "#3fd0c0", rows: [["Field", "Value"]], lesson: "Edit this case." }];
    }
    if (kind === "cards") return [normalizeCardItem({ front: "Term", back: "Definition" })];
    if (kind === "vocab") return [normalizeVocabItem({ word: "Term", def: "Definition" }, 0)];
    return [{ title: "New note", body: "Content here." }];
  }
}

export async function saveStudioCourse(courseId: string, data: StudioCourseData) {
  await supabaseAdmin
    .from("courses")
    .update({
      content_policy: data.policy,
      studio_json: data,
    })
    .eq("id", courseId);

  for (const page of data.pages) {
    if (!page.moduleId) continue;
    await supabaseAdmin
      .from("modules")
      .update({ name: page.title })
      .eq("id", page.moduleId);
  }
}

export async function loadStudioCourse(courseId: string): Promise<StudioCourseData | null> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("studio_json, content_policy")
    .eq("id", courseId)
    .single();
  if (error) {
    if (/studio_json|content_policy|column/i.test(error.message)) {
      console.warn("[loadStudioCourse] studio columns missing — run migration 003_studio_course.sql");
    }
    return null;
  }
  if (!data?.studio_json || typeof data.studio_json !== "object") return null;
  const studio = data.studio_json as StudioCourseData;
  if (!Array.isArray(studio.pages) || !studio.pages.length) return null;
  const hydrated = { ...studio, policy: (data.content_policy as ContentPolicy) ?? studio.policy ?? "generate" };
  if (isSkeletonStudio(hydrated)) return null;
  return linkVocabInStudio(syncStudioTools(hydrated));
}

export type StudioSuggestionVideo = {
  title: string;
  why: string;
  source: string;
  duration?: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
};

export type StudioSuggestionImage = {
  title: string;
  why: string;
  source: string;
  imageUrl?: string;
};

export type StudioPageSuggestions = {
  videos: StudioSuggestionVideo[];
  images: StudioSuggestionImage[];
};

function youtubeThumbnailForUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

async function listCourseImageAssets(courseId: string): Promise<{ name: string; imageUrl: string }[]> {
  const { data } = await supabaseAdmin
    .from("sources")
    .select("name, storage_path")
    .eq("course_id", courseId)
    .not("storage_path", "is", null);

  const images: { name: string; imageUrl: string }[] = [];
  for (const src of data ?? []) {
    if (!src.storage_path) continue;
    const isImage =
      IMAGE_EXT.test(src.name) ||
      IMAGE_EXT.test(src.storage_path) ||
      src.storage_path.includes("/studio-images/");
    if (!isImage) continue;
    const { data: signed } = await supabaseAdmin.storage.from("sources").createSignedUrl(src.storage_path, 60 * 60);
    if (signed?.signedUrl) images.push({ name: src.name, imageUrl: signed.signedUrl });
  }
  return images;
}

async function listCourseVideoAssets(
  courseId: string
): Promise<{ name: string; youtubeUrl: string; thumbnailUrl: string }[]> {
  const { data } = await supabaseAdmin
    .from("sources")
    .select("name, url")
    .eq("course_id", courseId)
    .eq("type", "Video")
    .not("url", "is", null);

  const videos: { name: string; youtubeUrl: string; thumbnailUrl: string }[] = [];
  for (const src of data ?? []) {
    if (!src.url) continue;
    const id = extractYouTubeId(src.url);
    if (!id) continue;
    videos.push({
      name: src.name,
      youtubeUrl: src.url,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return videos;
}

function enrichSuggestionMedia(
  suggestions: StudioPageSuggestions,
  courseVideos: { name: string; youtubeUrl: string; thumbnailUrl: string }[],
  courseImages: { name: string; imageUrl: string }[]
): StudioPageSuggestions {
  const videos = (suggestions.videos ?? []).map((video) => ({
    ...video,
    thumbnailUrl: video.thumbnailUrl ?? youtubeThumbnailForUrl(video.youtubeUrl),
  }));

  for (const cv of courseVideos) {
    if (videos.length >= 4) break;
    if (videos.some((v) => v.youtubeUrl === cv.youtubeUrl)) continue;
    videos.push({
      title: cv.name.replace(/^YouTube · /, ""),
      why: "From a YouTube source in your course library.",
      source: "Course video",
      youtubeUrl: cv.youtubeUrl,
      thumbnailUrl: cv.thumbnailUrl,
    });
  }

  let images = (suggestions.images ?? []).map((image, i) => {
    const fallback = courseImages[i % courseImages.length];
    if (image.imageUrl || !fallback) return image;
    return {
      ...image,
      imageUrl: fallback.imageUrl,
      source: image.source || `Figure from ${fallback.name}`,
    };
  });

  if (!images.length && courseImages.length) {
    images = courseImages.slice(0, 4).map((img) => ({
      title: img.name.replace(/\.[^.]+$/, ""),
      why: "From your uploaded course images.",
      source: `Figure from ${img.name}`,
      imageUrl: img.imageUrl,
    }));
  }

  return {
    videos: videos.slice(0, 4),
    images: images.slice(0, 4),
  };
}

export async function generateStudioSuggestions(
  courseId: string,
  policy: ContentPolicy,
  pageTitle: string,
  pageSummary?: string
): Promise<StudioPageSuggestions> {
  const [rag, courseVideos, courseImages] = await Promise.all([
    retrieveContextForLesson(courseId, pageTitle, 6),
    listCourseVideoAssets(courseId),
    listCourseImageAssets(courseId),
  ]);
  const context = formatRetrievedContext(rag);

  try {
    const raw = await claudeJSON<StudioPageSuggestions>(
      `You suggest embeddable teaching media for one course page. Policy: ${policyLine(policy)}.
Return JSON only:
{
  "videos": [{ "title", "why", "source", "duration", "youtubeUrl" }],
  "images": [{ "title", "why", "source", "imageUrl" }]
}
Rules:
- 2-4 videos and 2-4 images max.
- youtubeUrl must be a real YouTube watch or youtu.be URL when possible; otherwise omit.
- imageUrl may be a direct image URL or empty if only a diagram description.
- Tailor to the page topic and source material.`,
      `Page: ${pageTitle}\n${pageSummary ? `Page context: ${pageSummary}\n` : ""}${context}`,
      2500
    );
    return enrichSuggestionMedia(
      {
        videos: Array.isArray(raw?.videos) ? raw.videos.slice(0, 4) : [],
        images: Array.isArray(raw?.images) ? raw.images.slice(0, 4) : [],
      },
      courseVideos,
      courseImages
    );
  } catch {
    return enrichSuggestionMedia(
      {
        videos: [
          {
            title: `${pageTitle} — overview`,
            why: "Short explainer video to anchor the main idea.",
            source: "YouTube",
            duration: "5:00",
          },
        ],
        images: [
          {
            title: `Diagram for ${pageTitle}`,
            why: "Visual summary students can reference while reading.",
            source: "Course material",
          },
        ],
      },
      courseVideos,
      courseImages
    );
  }
}

/** Rewrite a focused field or append items — server-side assistant. */
export async function studioAssist(
  courseId: string,
  policy: ContentPolicy,
  fieldLabel: string,
  currentValue: string,
  instruction: string
): Promise<string> {
  const lower = instruction.toLowerCase().trim();
  if (lower.includes("shorten")) {
    const sentences = currentValue.split(/(?<=[.!?])\s+/);
    return sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(" ");
  }

  const chunks = await retrieveContextForLesson(courseId, fieldLabel, { count: 6 });
  const context = formatRetrievedContext(chunks);

  const result = await claudeText(
    `Rewrite the instructor's field. Policy: ${policyLine(policy)}. Return only the rewritten text.`,
    `Field: ${fieldLabel}
Current:
${currentValue}

Instruction: ${instruction}

Sources:
${context}`,
    2000
  );
  return result.trim() || currentValue;
}
