import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import * as orchestrator from "../agents/orchestrator.js";
import * as conceptTutor from "../agents/conceptTutor.js";
import * as quizCoach from "../agents/quizCoach.js";
import * as reflection from "../agents/reflection.js";
import * as planner from "../agents/planner.js";
import * as studentAssistant from "../agents/studentAssistant.js";
import * as animation from "../agents/animation.js";
import * as animation3d from "../agents/animation3d.js";
import * as interactiveAnimation from "../agents/interactiveAnimation.js";
import * as animationManim from "../agents/animationManim.js";
import { isGenerativeManimConfigured } from "../lib/config.js";
import { formatErrorMessage } from "../lib/errors.js";
import * as studyFormatter from "../agents/studyFormatter.js";
import * as studioGenerator from "../agents/studioGenerator.js";
import { isSkeletonStudio } from "../../shared/studio/skeleton.js";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const STUDIO_IMAGES_BUCKET = "sources";

async function ensureStudioImagesBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(STUDIO_IMAGES_BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.warn(`[studio] Could not ensure "${STUDIO_IMAGES_BUCKET}" bucket:`, error.message);
  }
}

router.post("/orchestrator/intent", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await orchestrator.detectIntent(req.body.message);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/rag/query", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, query } = req.body;
    const result = await conceptTutor.queryRAG(courseId, query);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/course/draft", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, prompt } = req.body;
    const result = await conceptTutor.draftCourseStructure(courseId, prompt);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.post("/concept/content", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptName, mode, subtitle } = req.body;
    const result = await conceptTutor.generateModeContent(courseId, conceptName, mode, subtitle);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/study/format", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { rawContent } = req.body;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      res.status(400).json({ error: "rawContent is required" });
      return;
    }
    const blocks = await studyFormatter.formatStudyContent(rawContent);
    res.json({ blocks });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/quiz/generate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptName } = req.body;
    const result = await conceptTutor.generateMCQ(courseId, conceptName);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/quiz/adaptive/generate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const {
      courseId,
      conceptName,
      conceptId,
      masteryLevel,
      previousQuestions,
      misconceptions,
    } = req.body;

    if (!courseId || !conceptName) {
      res.status(400).json({ error: "courseId and conceptName are required" });
      return;
    }

    const { data: masteryRow } = await supabaseAdmin
      .from("mastery_states")
      .select("level, bkt_score")
      .eq("user_id", req.userId!)
      .eq("course_id", courseId)
      .eq("concept_id", conceptId ?? conceptName)
      .maybeSingle();

    const level = masteryRow?.level ?? masteryLevel ?? "not-seen";
    const bkt = Number(masteryRow?.bkt_score ?? 0);

    const { isModuleMastered } = await import("../lib/mastery.js");
    if (isModuleMastered(level, bkt)) {
      res.json({ done: true, reason: "mastered", mastery: level, bktScore: bkt });
      return;
    }

    let recentMisconceptions = misconceptions as string[] | undefined;
    if (!recentMisconceptions?.length && conceptId) {
      const { data: misc } = await supabaseAdmin
        .from("misconceptions")
        .select("description")
        .eq("user_id", req.userId!)
        .eq("course_id", courseId)
        .eq("concept_id", conceptId)
        .order("created_at", { ascending: false })
        .limit(3);
      recentMisconceptions = (misc ?? []).map((m) => m.description).filter(Boolean) as string[];
    }

    const mcq = await conceptTutor.generateAdaptiveMCQ(courseId, conceptName, {
      masteryLevel: level,
      previousQuestions: previousQuestions ?? [],
      misconceptions: recentMisconceptions,
      targetMisconception: recentMisconceptions?.[0],
    });

    res.json({ done: false, mcq, mastery: level, bktScore: bkt });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/test/generate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptName } = req.body;
    if (!courseId || !conceptName) {
      res.status(400).json({ error: "courseId and conceptName are required" });
      return;
    }
    const result = await conceptTutor.generateTestBlock(courseId, conceptName);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/flashcards/generate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptName } = req.body;
    const result = await conceptTutor.generateFlashcards(courseId, conceptName);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/reflection/prompt", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptName } = req.body;
    const result = await conceptTutor.generateReflectionPrompt(courseId, conceptName);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/module/generate-lesson", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, moduleName, chapter, subtitle, prereqs } = req.body;
    if (!courseId || !moduleName) {
      res.status(400).json({ error: "courseId and moduleName are required" });
      return;
    }
    const result = await conceptTutor.generateModuleLesson(courseId, moduleName, {
      chapter,
      subtitle,
      prereqs,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/quiz/evaluate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptId, questionId, selectedIndex, options, hintsUsed } = req.body;

    const { data: masteryRow } = await supabaseAdmin
      .from("mastery_states")
      .select("level, bkt_score")
      .eq("user_id", req.userId!)
      .eq("course_id", courseId)
      .eq("concept_id", conceptId)
      .maybeSingle();

    const result = await quizCoach.evaluateAnswer({
      ...req.body,
      currentMastery: masteryRow?.level ?? req.body.currentMastery ?? "not-seen",
      bktScore: Number(masteryRow?.bkt_score ?? req.body.bktScore ?? 0),
      hintsUsed: hintsUsed ?? 0,
    });

    const newBkt = result.newBktScore;
    await supabaseAdmin.from("mastery_states").upsert({
      user_id: req.userId,
      course_id: courseId,
      concept_id: conceptId,
      level: result.newMastery,
      bkt_score: newBkt,
      updated_at: new Date().toISOString(),
    });

    if (!result.correct && result.misconception) {
      await supabaseAdmin.from("misconceptions").insert({
        user_id: req.userId,
        course_id: courseId,
        concept_id: conceptId,
        question_id: questionId,
        wrong_answer: options[selectedIndex],
        description: result.misconception,
      });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/reflection/evaluate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { conceptId, answers, isSession, courseId } = req.body;
    const result = await reflection.evaluateReflection(conceptId, answers, isSession);
    if (result.accepted) {
      const text = answers.join("\n");
      const [embedding] = await embedTexts([text]);
      await supabaseAdmin.from("reflections").insert({
        user_id: req.userId,
        course_id: courseId,
        concept_id: conceptId,
        answers,
        is_session: !!isSession,
        embedding,
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/planner/next", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await planner.planNextSession(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assistant/chat", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await studentAssistant.assistantRespond({
      ...req.body,
      pastReflections: req.body.pastReflections,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/assistant/greeting", requireAuth, async (req: AuthedRequest, res) => {
  const { conceptName, mode } = req.query;
  res.json({
    content: studentAssistant.greeting(String(conceptName), String(mode)),
  });
});

router.post("/animation/generate-manim", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { description, conceptName, blockId, courseId } = req.body;
    let context: string | undefined;
    if (courseId) {
      const { retrieveChunks, formatRetrievedContext } = await import("../lib/rag.js");
      const chunks = await retrieveChunks(courseId, `${conceptName} ${description}`, 6);
      context = formatRetrievedContext(chunks);
    }
    const manim = await animationManim.generateManimAnimation(description, conceptName, context);
    if (blockId) {
      await supabaseAdmin
        .from("content_blocks")
        .update({
          content: {
            renderer: "manim",
            videoUrl: manim.videoUrl,
            description: manim.description,
            code: manim.code,
            sceneClass: manim.sceneClass,
          },
        })
        .eq("id", blockId);
    }
    res.json(manim);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/animation/generate", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { description, conceptName, blockId, renderer, courseId } = req.body;

    if (renderer === "svg") {
      const config = await animation.generateAnimation(description, conceptName);
      if (blockId) {
        await supabaseAdmin
          .from("content_blocks")
          .update({ content: { animationConfig: config, description } })
          .eq("id", blockId);
      }
      res.json(config);
      return;
    }

    if (renderer === "r3f") {
      const scene3d = await animation3d.generateScene3D(description, conceptName);
      if (blockId) {
        await supabaseAdmin
          .from("content_blocks")
          .update({ content: { renderer: "r3f", scene3d, description } })
          .eq("id", blockId);
      }
      res.json(scene3d);
      return;
    }

    if (renderer === "manim" || (renderer !== "interactive" && isGenerativeManimConfigured())) {
      try {
        let context: string | undefined;
        if (courseId) {
          const { retrieveChunks, formatRetrievedContext } = await import("../lib/rag.js");
          const chunks = await retrieveChunks(courseId, `${conceptName} ${description}`, 6);
          context = formatRetrievedContext(chunks);
        }
        const manim = await animationManim.generateManimAnimation(description, conceptName, context);
        if (blockId) {
          await supabaseAdmin
            .from("content_blocks")
            .update({
              content: {
                renderer: "manim",
                videoUrl: manim.videoUrl,
                description: manim.description,
                code: manim.code,
                sceneClass: manim.sceneClass,
              },
            })
            .eq("id", blockId);
        }
        res.json(manim);
        return;
      } catch (e) {
        if (renderer === "manim") throw e;
        console.warn("[animation] Manim failed, falling back to interactive:", e);
      }
    }

    let context: string | undefined;
    if (courseId) {
      const { retrieveChunks, formatRetrievedContext } = await import("../lib/rag.js");
      const chunks = await retrieveChunks(courseId, `${conceptName} ${description}`, 6);
      context = formatRetrievedContext(chunks);
    }
    const config = await interactiveAnimation.generateInteractiveAnimation(description, conceptName, context);
    const content = interactiveAnimation.toInteractiveContent(config, description);
    if (blockId) {
      await supabaseAdmin
        .from("content_blocks")
        .update({ content })
        .eq("id", blockId);
    }
    res.json(content);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/animation/generate-3d", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { description, conceptName, blockId, courseId } = req.body;
    let context: string | undefined;
    if (courseId) {
      const { retrieveChunks, formatRetrievedContext } = await import("../lib/rag.js");
      const chunks = await retrieveChunks(courseId, `${conceptName} ${description}`, 6);
      context = formatRetrievedContext(chunks);
    }
    const scene3d = await animation3d.generateScene3D(description, conceptName, context);
    if (blockId) {
      await supabaseAdmin
        .from("content_blocks")
        .update({ content: { renderer: "r3f", scene3d, description } })
        .eq("id", blockId);
    }
    res.json(scene3d);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/studio/generate-course", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, policy, prompt } = req.body as {
      courseId?: string;
      policy?: "strict" | "generate" | "open";
      prompt?: string;
    };
    if (!courseId) {
      res.status(400).json({ error: "courseId is required" });
      return;
    }
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("instructor_id")
      .eq("id", courseId)
      .single();
    if (!course || course.instructor_id !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const job = studioGenerator.startStudioGenerateJob(
      courseId,
      policy ?? "generate",
      prompt
    );
    res.json({
      started: true,
      status: job.status,
      progress: job.progress,
    });
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.get("/studio/generate-status/:courseId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const courseId = String(req.params.courseId);
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("instructor_id")
      .eq("id", courseId)
      .single();
    if (!course || course.instructor_id !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const job = studioGenerator.getStudioGenerateJob(courseId);
    if (!job) {
      const saved = await studioGenerator.loadStudioCourse(courseId);
      if (saved?.pages?.length) {
        res.json({ status: "done", studio: saved, progress: "Course ready" });
        return;
      }
      res.json({ status: "idle" });
      return;
    }
    if (job.status === "done" && job.studio && isSkeletonStudio(job.studio)) {
      res.json({
        status: "error",
        error: "Generation produced placeholder content only — retry after fixing API credits or sources.",
        progress: job.progress,
      });
      return;
    }
    res.json({
      status: job.status,
      progress: job.progress,
      moduleIndex: job.moduleIndex,
      moduleTotal: job.moduleTotal,
      studio: job.status === "done" ? job.studio : undefined,
      error: job.error,
    });
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.post("/studio/assist", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, policy, fieldLabel, currentValue, instruction } = req.body;
    if (!courseId || !instruction) {
      res.status(400).json({ error: "courseId and instruction are required" });
      return;
    }
    const text = await studioGenerator.studioAssist(
      courseId,
      policy ?? "generate",
      fieldLabel ?? "field",
      currentValue ?? "",
      instruction
    );
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.post("/studio/generate-tool-items", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, policy, kind, pageTitles, existing } = req.body;
    if (!courseId || !kind) {
      res.status(400).json({ error: "courseId and kind are required" });
      return;
    }
    const items = await studioGenerator.generateToolItems(
      courseId,
      policy ?? "generate",
      kind,
      pageTitles ?? [],
      existing ?? []
    );
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.post("/studio/suggestions", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, policy, pageTitle, pageSummary } = req.body as {
      courseId?: string;
      policy?: "strict" | "generate" | "open";
      pageTitle?: string;
      pageSummary?: string;
    };
    if (!courseId || !pageTitle) {
      res.status(400).json({ error: "courseId and pageTitle are required" });
      return;
    }
    const suggestions = await studioGenerator.generateStudioSuggestions(
      courseId,
      policy ?? "generate",
      pageTitle,
      pageSummary
    );
    res.json(suggestions);
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.post("/studio/upload-image", requireAuth, imageUpload.single("file"), async (req: AuthedRequest, res) => {
  try {
    const { courseId } = req.body as { courseId?: string };
    const file = req.file;
    if (!courseId) return res.status(400).json({ error: "courseId is required" });
    if (!file) return res.status(400).json({ error: "No file" });
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Only image files are allowed" });
    }

    await ensureStudioImagesBucket();
    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, "_") || "image";
    const storagePath = `${courseId}/studio-images/${randomUUID()}-${safeName}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(STUDIO_IMAGES_BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadErr) throw uploadErr;

    const { data, error: urlErr } = await supabaseAdmin.storage
      .from(STUDIO_IMAGES_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (urlErr || !data?.signedUrl) throw urlErr ?? new Error("Could not create image URL");

    res.json({ url: data.signedUrl, storagePath });
  } catch (e) {
    res.status(500).json({ error: formatErrorMessage(e) });
  }
});

router.post("/mode-switch", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { courseId, conceptId, from, to } = req.body;
    await supabaseAdmin.from("mode_switch_events").insert({
      user_id: req.userId,
      course_id: courseId,
      concept_id: conceptId,
      from_mode: from,
      to_mode: to,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
