import { Router } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { buildDashboardAnalytics } from "../lib/dashboardAnalytics.js";
import * as planner from "../agents/planner.js";

const router = Router();

// Unambiguous alphabet (no 0/O/1/I) for classroom codes like "OWL-7K3M9P"
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomJoinCode(): string {
  let body = "";
  for (let i = 0; i < 6; i++) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `OWL-${body}`;
}

async function assignJoinCode(courseId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomJoinCode();
    const { error } = await supabaseAdmin
      .from("courses")
      .update({ join_code: code })
      .eq("id", courseId);
    if (!error) return code;
    if (!error.message.includes("duplicate")) throw new Error(error.message);
  }
  throw new Error("Could not generate a unique join code — try again");
}

async function seedMasteryForUsers(courseId: string, userIds: string[]) {
  const { data: conceptRows } = await supabaseAdmin
    .from("concepts")
    .select("id")
    .eq("course_id", courseId);
  if (!conceptRows?.length || !userIds.length) return;
  const masteryRows = userIds.flatMap((uid) =>
    conceptRows.map((c) => ({
      user_id: uid,
      course_id: courseId,
      concept_id: c.id,
      level: "not-seen",
    }))
  );
  await supabaseAdmin.from("mastery_states").upsert(masteryRows, {
    onConflict: "user_id,course_id,concept_id",
    ignoreDuplicates: true,
  });
}

function normalizeJoinCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  // Accept a pasted join link too
  const fromUrl = cleaned.match(/[?&]JOIN=([A-Z2-9-]+)/);
  const code = fromUrl ? fromUrl[1] : cleaned;
  return code.startsWith("OWL-") ? code : `OWL-${code}`;
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "User";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "User";
}

/** Open registration — any email can create a student or instructor account. */
router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, role, displayName } = req.body as {
      email?: string;
      password?: string;
      role?: string;
      displayName?: string;
    };
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (role !== "student" && role !== "instructor") {
      return res.status(400).json({ error: "Role must be student or instructor." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const name = (displayName?.trim() || displayNameFromEmail(normalizedEmail)).slice(0, 80);

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
      }
      return res.status(400).json({ error: error.message });
    }

    const userId = data.user.id;
    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: normalizedEmail,
      display_name: name,
      role,
    });
    if (profileErr) throw profileErr;

    if (role === "student") {
      await supabaseAdmin.from("learner_models").upsert({
        user_id: userId,
        default_mode: "conversational",
        streak: 0,
        onboarding_complete: false,
      });
    } else {
      await supabaseAdmin.from("instructor_profiles").upsert({
        user_id: userId,
        onboarding_complete: false,
      });
    }

    res.json({ ok: true, userId, role });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).single();
  const role = profile?.role;

  if (role === "student") {
    const { data: learner } = await supabaseAdmin.from("learner_models").select("*").eq("user_id", userId).single();
    const { data: mastery } = await supabaseAdmin.from("mastery_states").select("*").eq("user_id", userId);
    const { data: reflections } = await supabaseAdmin.from("reflections").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    const { data: misconceptions } = await supabaseAdmin.from("misconceptions").select("*").eq("user_id", userId);
    const { data: modeSwitches } = await supabaseAdmin.from("mode_switch_events").select("*").eq("user_id", userId);
    const { data: enrollments } = await supabaseAdmin
      .from("enrollments")
      .select("course_id, courses(id, title, subject, published, instructor_id)")
      .eq("user_id", userId);
    const publishedEnrollments = (enrollments ?? []).filter(
      (e) => (e.courses as { published?: boolean } | null)?.published
    );
    const instructorIds = [
      ...new Set(
        publishedEnrollments
          .map((e) => (e.courses as { instructor_id?: string } | null)?.instructor_id)
          .filter(Boolean)
      ),
    ] as string[];
    const { data: instructors } = instructorIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", instructorIds)
      : { data: [] };
    const instructorNames = Object.fromEntries((instructors ?? []).map((i) => [i.id, i.display_name]));
    const studentCourses = publishedEnrollments.map((e) => {
      const c = e.courses as unknown as { id: string; title: string; subject: string | null; instructor_id: string };
      return {
        courseId: e.course_id,
        title: c.title,
        subject: c.subject,
        instructorName: instructorNames[c.instructor_id] ?? "Instructor",
      };
    });
    return res.json({
      profile,
      learner,
      mastery,
      reflections,
      misconceptions,
      modeSwitches,
      enrollments: publishedEnrollments,
      studentCourses,
    });
  }

  const { data: instructor } = await supabaseAdmin.from("instructor_profiles").select("*").eq("user_id", userId).single();
  const { data: courses } = await supabaseAdmin.from("courses").select("*").eq("instructor_id", userId).order("created_at", { ascending: false });
  return res.json({ profile, instructor, courses });
});

router.post("/course", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "instructor") {
    res.status(403).json({ error: "Only instructors can create courses" });
    return;
  }

  const title = typeof req.body.title === "string" && req.body.title.trim()
    ? req.body.title.trim()
    : "Untitled course";

  const { data: instructor } = await supabaseAdmin
    .from("instructor_profiles")
    .select("default_modes")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: course, error } = await supabaseAdmin
    .from("courses")
    .insert({
      instructor_id: userId,
      title,
      published: false,
      default_modes: instructor?.default_modes ?? {
        "real-world": true,
        conversational: true,
        textbook: true,
      },
    })
    .select("id, title, published")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(course);
});

router.get("/course/:courseId/full", requireAuth, async (req, res) => {
  const courseId = req.params.courseId;
  const [course, chapters, concepts, modules, edges, blocks, availability, sources] = await Promise.all([
    supabaseAdmin.from("courses").select("*").eq("id", courseId).single(),
    supabaseAdmin.from("chapters").select("*").eq("course_id", courseId).order("sort_order"),
    supabaseAdmin.from("concepts").select("*").eq("course_id", courseId).order("sort_order"),
    supabaseAdmin.from("modules").select("*").eq("course_id", courseId).order("sort_order"),
    supabaseAdmin.from("prerequisite_edges").select("*").eq("course_id", courseId),
    supabaseAdmin.from("content_blocks").select("*, modules!inner(course_id)").eq("modules.course_id", courseId),
    supabaseAdmin.from("concept_mode_availability").select("*").eq("course_id", courseId),
    supabaseAdmin.from("sources").select("*").eq("course_id", courseId),
  ]);
  res.json({
    course: course.data,
    chapters: chapters.data,
    concepts: concepts.data,
    modules: modules.data,
    edges: edges.data,
    blocks: blocks.data,
    availability: availability.data,
    sources: sources.data,
  });
});

router.post("/learner/onboarding", requireAuth, async (req: AuthedRequest, res) => {
  const { age, goal, defaultMode, sessionLength } = req.body;
  const { error } = await supabaseAdmin.from("learner_models").upsert({
    user_id: req.userId,
    age,
    goal,
    default_mode: defaultMode,
    session_length: sessionLength,
    onboarding_complete: true,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.post("/instructor/onboarding", requireAuth, async (req: AuthedRequest, res) => {
  const { template, preferences } = req.body;
  const { error } = await supabaseAdmin.from("instructor_profiles").upsert({
    user_id: req.userId,
    template,
    preferences,
    onboarding_complete: true,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.post("/course/:courseId/publish", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const courseId = String(req.params.courseId);
    const { defaultModes, modules, chapters, edges } = req.body as {
      defaultModes?: Record<string, boolean>;
      modules?: { id: string; name: string; sort_order: number; chapter_title: string }[];
      chapters?: { title: string; label: string; sort_order: number }[];
      edges?: { from: string; to: string }[];
    };

    const { data: course, error: courseErr } = await supabaseAdmin
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .single();
    if (courseErr || !course) return res.status(404).json({ error: "Course not found" });
    if (course.instructor_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const slugify = (name: string, i: number) =>
      (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || `concept-${i}`);

    if (chapters?.length) {
      for (const c of chapters) {
        const { data: existing } = await supabaseAdmin
          .from("chapters")
          .select("id")
          .eq("course_id", courseId)
          .eq("title", c.title)
          .maybeSingle();
        if (existing) {
          await supabaseAdmin
            .from("chapters")
            .update({ label: c.label, sort_order: c.sort_order })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin.from("chapters").insert({ ...c, course_id: courseId });
        }
      }
    }

    const { data: chapterRows } = await supabaseAdmin
      .from("chapters")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order");
    const chapterIdByTitle = Object.fromEntries((chapterRows ?? []).map((c) => [c.title, c.id]));

    if (modules?.length) {
      const keepIds = modules.map((m) => m.id);
      for (const m of modules) {
        await supabaseAdmin.from("modules").upsert({
          id: m.id,
          course_id: courseId,
          name: m.name,
          sort_order: m.sort_order,
          chapter_id: chapterIdByTitle[m.chapter_title] ?? chapterRows?.[0]?.id ?? null,
        });
      }
      const { data: existingMods } = await supabaseAdmin
        .from("modules")
        .select("id")
        .eq("course_id", courseId);
      const orphanIds = (existingMods ?? [])
        .map((m) => m.id)
        .filter((id) => !keepIds.includes(id));
      if (orphanIds.length) {
        await supabaseAdmin.from("modules").delete().in("id", orphanIds);
      }
    }

    if (edges?.length) {
      await supabaseAdmin.from("prerequisite_edges").delete().eq("course_id", courseId);
      await supabaseAdmin.from("prerequisite_edges").insert(
        edges.map((e) => ({ course_id: courseId, from_name: e.from, to_name: e.to }))
      );
    }

    const { data: moduleRows } = await supabaseAdmin
      .from("modules")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order");

    if (moduleRows?.length) {
      await supabaseAdmin.from("concepts").delete().eq("course_id", courseId);
      const conceptRows = moduleRows.map((m, i) => ({
        id: slugify(m.name, i),
        course_id: courseId,
        chapter_id: m.chapter_id ?? chapterRows?.[0]?.id,
        name: m.name,
        subtitle: `Module ${i + 1}`,
        letter: m.name[0]?.toUpperCase() ?? "?",
        sort_order: i,
      }));
      await supabaseAdmin.from("concepts").insert(conceptRows);

      for (let i = 0; i < moduleRows.length; i++) {
        await supabaseAdmin
          .from("modules")
          .update({ concept_id: conceptRows[i].id })
          .eq("id", moduleRows[i].id);
      }

      const { data: blocks } = await supabaseAdmin
        .from("content_blocks")
        .select("type, module_id, modules!inner(course_id)")
        .eq("modules.course_id", courseId);
      const animModules = new Set(
        (blocks ?? []).filter((b) => b.type === "Animation").map((b) => b.module_id)
      );

      const enabledModes = (["real-world", "conversational", "textbook"] as const).filter(
        (m) => defaultModes?.[m] !== false
      );

      await supabaseAdmin.from("concept_mode_availability").delete().eq("course_id", courseId);
      await supabaseAdmin.from("concept_mode_availability").insert(
        conceptRows.map((c, i) => ({
          course_id: courseId,
          concept_id: c.id,
          modes: enabledModes.length ? [...enabledModes] : ["conversational", "textbook"],
          has_interactive: animModules.has(moduleRows[i].id),
        }))
      );
    }

    const joinCode = course.join_code ?? (await assignJoinCode(courseId));
    await supabaseAdmin
      .from("courses")
      .update({ published: true, default_modes: defaultModes ?? course.default_modes })
      .eq("id", courseId);

    // Students join via classroom code/link — no auto-enrollment. Backfill
    // mastery rows for anyone who joined before (re)publish.
    const { data: enrolled } = await supabaseAdmin
      .from("enrollments")
      .select("user_id")
      .eq("course_id", courseId);
    if (enrolled?.length) {
      await seedMasteryForUsers(courseId, enrolled.map((e) => e.user_id));
    }

    res.json({ ok: true, enrolledCount: enrolled?.length ?? 0, joinCode });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Instructor: get or create the classroom join code for a course. */
router.post("/course/:courseId/join-code", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, instructor_id, join_code")
      .eq("id", req.params.courseId)
      .single();
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (course.instructor_id !== req.userId) return res.status(403).json({ error: "Forbidden" });
    const regenerate = Boolean(req.body?.regenerate);
    const joinCode =
      course.join_code && !regenerate ? course.join_code : await assignJoinCode(course.id);
    res.json({ joinCode });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Student: join a published course with a classroom code (or pasted link). */
router.post("/join", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
    if (profile?.role !== "student") {
      return res.status(403).json({ error: "Only students can join courses" });
    }
    const rawCode = typeof req.body?.code === "string" ? req.body.code : "";
    if (!rawCode.trim()) return res.status(400).json({ error: "Enter a classroom code" });
    const code = normalizeJoinCode(rawCode);

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("id, title, subject, published, instructor_id")
      .eq("join_code", code)
      .maybeSingle();
    if (!course) {
      return res.status(404).json({ error: `No course found for code ${code} — check with your teacher.` });
    }
    if (!course.published) {
      return res.status(400).json({ error: "That course isn't published yet — ask your teacher to publish it first." });
    }

    const { error: enrollErr } = await supabaseAdmin
      .from("enrollments")
      .upsert({ user_id: userId, course_id: course.id }, { onConflict: "user_id,course_id" });
    if (enrollErr) throw new Error(enrollErr.message);
    await seedMasteryForUsers(course.id, [userId]);

    const { data: instructor } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", course.instructor_id)
      .single();

    res.json({
      courseId: course.id,
      title: course.title,
      subject: course.subject,
      instructorName: instructor?.display_name ?? "Instructor",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Instructor: enrolled students with per-student mastery summary. */
router.get("/course/:courseId/students", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const courseId = req.params.courseId;
    const [{ data: enrollments }, { data: mastery }, { count: conceptCount }] = await Promise.all([
      supabaseAdmin
        .from("enrollments")
        .select("user_id, profiles(display_name, email)")
        .eq("course_id", courseId),
      supabaseAdmin
        .from("mastery_states")
        .select("user_id, level, bkt_score")
        .eq("course_id", courseId),
      supabaseAdmin
        .from("concepts")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId),
    ]);

    const students = (enrollments ?? []).map((e) => {
      const p = e.profiles as { display_name?: string; email?: string } | null;
      const rows = (mastery ?? []).filter((m) => m.user_id === e.user_id);
      const masteredCount = rows.filter(
        (m) => m.level === "mastered" || Number(m.bkt_score) >= 0.88
      ).length;
      return {
        userId: e.user_id,
        name: p?.display_name ?? "Student",
        email: p?.email ?? "",
        masteredCount,
        conceptCount: conceptCount ?? 0,
      };
    });
    res.json({ students });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/course/:courseId/modules", requireAuth, async (req: AuthedRequest, res) => {
  const { modules, edges, chapters } = req.body;
  const courseId = req.params.courseId;
  if (chapters?.length) {
    await supabaseAdmin.from("chapters").delete().eq("course_id", courseId);
    await supabaseAdmin.from("chapters").insert(chapters.map((c: { title: string; label: string; sort_order: number }) => ({ ...c, course_id: courseId })));
  }
  if (modules?.length) {
    await supabaseAdmin.from("modules").delete().eq("course_id", courseId);
    await supabaseAdmin.from("modules").insert(modules.map((m: Record<string, unknown>) => ({ ...m, course_id: courseId })));
  }
  if (edges?.length) {
    await supabaseAdmin.from("prerequisite_edges").delete().eq("course_id", courseId);
    await supabaseAdmin.from("prerequisite_edges").insert(edges.map((e: { from: string; to: string }) => ({ course_id: courseId, from_name: e.from, to_name: e.to })));
  }
  res.json({ ok: true });
});

router.post("/modules/:moduleId/blocks", requireAuth, async (req, res) => {
  const { type, label, title, content, sort_order } = req.body;
  const { data, error } = await supabaseAdmin
    .from("content_blocks")
    .insert({ module_id: req.params.moduleId, type, label, title, content: content ?? {}, sort_order: sort_order ?? 0 })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete("/blocks/:blockId", requireAuth, async (req, res) => {
  await supabaseAdmin.from("content_blocks").delete().eq("id", req.params.blockId);
  res.json({ ok: true });
});

router.get("/dashboard/:courseId", requireAuth, async (req, res) => {
  try {
    const courseId = req.params.courseId;

    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    const { data: enrollments } = await supabaseAdmin
      .from("enrollments")
      .select("user_id, profiles(display_name)")
      .eq("course_id", courseId);

    const { data: mastery } = await supabaseAdmin
      .from("mastery_states")
      .select("user_id, concept_id, level, bkt_score, updated_at, profiles(display_name)")
      .eq("course_id", courseId);

    const { data: misconceptions } = await supabaseAdmin
      .from("misconceptions")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    const { data: modeSwitches } = await supabaseAdmin
      .from("mode_switch_events")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    const { data: reflections } = await supabaseAdmin
      .from("reflections")
      .select("user_id, concept_id, created_at")
      .eq("course_id", courseId);

    const { data: concepts } = await supabaseAdmin
      .from("concepts")
      .select("id, name")
      .eq("course_id", courseId)
      .order("sort_order");

    const analytics = buildDashboardAnalytics({
      courseTitle: course?.title ?? "Course",
      enrollments: (enrollments ?? []) as unknown as Parameters<typeof buildDashboardAnalytics>[0]["enrollments"],
      mastery: (mastery ?? []) as unknown as Parameters<typeof buildDashboardAnalytics>[0]["mastery"],
      misconceptions: misconceptions ?? [],
      modeSwitches: modeSwitches ?? [],
      reflections: reflections ?? [],
      concepts: concepts ?? [],
    });

    let suggestions: { text: string; action: string }[] = [];
    const hasSignal =
      (misconceptions?.length ?? 0) > 0 ||
      (modeSwitches?.length ?? 0) > 0 ||
      (mastery?.length ?? 0) > 0;

    if (hasSignal) {
      try {
        const miscForAi = analytics.misconceptionLog.map((m) => ({
          concept: m.conceptName,
          issue: m.issue,
          count: m.studentCount,
        }));
        const result = await planner.dashboardSuggestions({
          misconceptions: miscForAi,
          modeSwitches: modeSwitches ?? [],
          engagement: analytics.conceptProgress,
        });
        suggestions = result.suggestions ?? [];
      } catch (err) {
        console.warn("[dashboard] AI suggestions skipped:", err);
      }
    }

    res.json({
      ...analytics,
      mastery,
      misconceptions,
      modeSwitches,
      concepts,
      suggestions,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
