import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ContentBlock,
  ContentMode,
  CourseModule,
  InstructorProfile,
  LearnerModel,
  MasteryLevel,
  PrerequisiteEdge,
  RAGSource,
  RagCourseStatus,
  Role,
  Screen,
  StudentCourseEnrollment,
  InstructorCourseSummary,
} from "../types";
import type { DashboardPayload } from "../types/dashboard";
import { supabase } from "../lib/supabase";
import { DataAPI } from "../lib/api";
import { AgentAPI } from "../lib/api";
import { formatSourceDetail } from "../lib/format";
import type { InstructorBuildAction, LessonPanel, PendingBuild, StudentToolsTab } from "../lib/ui-actions";

const emptyLearner: LearnerModel = {
  name: "",
  email: "",
  age: null,
  goal: null,
  defaultMode: "conversational",
  sessionLength: null,
  streak: 0,
  conceptMastery: {},
  conceptBkt: {},
  reflections: [],
  modeSwitchLog: [],
  misconceptions: [],
  completedReflectionForConcept: {},
  lastSessionConcept: null,
};

const emptyInstructor: InstructorProfile = {
  name: "",
  template: null,
  preferences: {
    autoGenerateModes: true,
    suggestPrereqGraph: true,
    recommendVideos: true,
    flagStrugglingStudents: false,
  },
  defaultModes: { "real-world": true, conversational: true, textbook: true },
};

interface AppContextValue {
  screen: Screen;
  role: Role;
  courseId: string | null;
  courseTitle: string;
  learner: LearnerModel;
  instructor: InstructorProfile;
  ragSources: RAGSource[];
  ragStatus: RagCourseStatus | null;
  coursePublished: boolean;
  instructorCourses: InstructorCourseSummary[];
  studentEnrollments: StudentCourseEnrollment[];
  modules: CourseModule[];
  concepts: { id: string; name: string; chapter: number; letter: string; subtitle?: string }[];
  prerequisiteGraph: PrerequisiteEdge[];
  conceptAvailability: Record<string, { modes: ContentMode[]; hasInteractive: boolean }>;
  activeConceptId: string;
  createStep: "sources" | "structure" | "build" | "done";
  currentModuleIndex: number;
  loading: boolean;
  dashboardData: DashboardPayload | null;
  loginIntent: Role;
  setScreen: (s: Screen) => void;
  setLoginIntent: (role: Role) => void;
  login: (email: string, password: string, role: Role) => Promise<void>;
  register: (email: string, password: string, role: Role) => Promise<void>;
  logout: () => Promise<void>;
  updateLearner: (patch: Partial<LearnerModel>) => void;
  saveLearnerOnboarding: () => Promise<void>;
  saveInstructorOnboarding: () => Promise<void>;
  setLearnerMastery: (conceptId: string, level: MasteryLevel) => void;
  logModeSwitch: (conceptId: string, from: ContentMode, to: ContentMode) => void;
  completeReflection: (conceptId: string) => void;
  updateInstructor: (patch: Partial<InstructorProfile>) => void;
  addRAGSource: (name: string, type: string) => Promise<void>;
  uploadRAGFile: (file: File) => Promise<void>;
  addRAGUrl: (url: string, type: string) => Promise<void>;
  removeRAGSource: (id: string) => Promise<void>;
  refreshSources: () => Promise<void>;
  refreshRagStatus: () => Promise<void>;
  setModules: (modules: CourseModule[]) => void;
  addBlockToModule: (moduleIndex: number, block: ContentBlock) => Promise<void>;
  addBlocksToModule: (moduleIndex: number, blocks: ContentBlock[]) => Promise<void>;
  removeBlockFromModule: (moduleIndex: number, blockIndex: number) => Promise<void>;
  reorderModules: (from: number, to: number) => void;
  publishCourse: () => Promise<{ enrolledCount: number }>;
  joinCourseByCode: (code: string) => Promise<StudentCourseEnrollment>;
  generateAllModules: (
    onProgress?: (done: number, total: number, moduleName: string) => void
  ) => Promise<{ generated: number; skipped: number; failed: { name: string; error: string }[] }>;
  draftCourseStructure: (prompt: string) => Promise<void>;
  setCreateStep: (step: "sources" | "structure" | "build" | "done") => void;
  setCurrentModuleIndex: (i: number) => void;
  setActiveConceptId: (id: string) => void;
  setDefaultModes: (modes: Record<ContentMode, boolean>) => void;
  refreshDashboard: () => Promise<void>;
  syncCourse: () => Promise<void>;
  loadCourse: (courseId: string) => Promise<void>;
  startNewCourse: (title?: string) => Promise<void>;
  openCourseEditor: () => void;
  hydrate: () => Promise<void>;
  studentToolsTab: StudentToolsTab;
  setStudentToolsTab: (tab: StudentToolsTab) => void;
  lessonPanel: LessonPanel;
  setLessonPanel: (panel: LessonPanel) => void;
  examDate: string | null;
  setExamDate: (date: string | null) => void;
  toast: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
  pendingBuild: PendingBuild | null;
  queueBuild: (build: PendingBuild) => void;
  clearPendingBuild: () => void;
  openStudentLesson: (conceptId?: string) => void;
  openStudentAssistant: () => void;
  coachPanelOpen: boolean;
  setCoachPanelOpen: (open: boolean) => void;
  toggleCoachPanel: () => void;
  lessonCoachFocus: { conceptId: string; conceptName: string } | null;
  setLessonCoachFocus: (focus: { conceptId: string; conceptName: string } | null) => void;
  duplicateModule: (index: number) => Promise<void>;
  removeModule: (index: number) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [loginIntent, setLoginIntent] = useState<Role>("student");
  const [role, setRole] = useState<Role>("student");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("Untitled course");
  const [learner, setLearner] = useState<LearnerModel>(emptyLearner);
  const [instructor, setInstructor] = useState<InstructorProfile>(emptyInstructor);
  const [ragSources, setRagSources] = useState<RAGSource[]>([]);
  const [ragStatus, setRagStatus] = useState<RagCourseStatus | null>(null);
  const [coursePublished, setCoursePublished] = useState(false);
  const [instructorCourses, setInstructorCourses] = useState<InstructorCourseSummary[]>([]);
  const [studentEnrollments, setStudentEnrollments] = useState<StudentCourseEnrollment[]>([]);
  const [modules, setModulesState] = useState<CourseModule[]>([]);
  const [concepts, setConcepts] = useState<AppContextValue["concepts"]>([]);
  const [prerequisiteGraph, setPrerequisiteGraph] = useState<PrerequisiteEdge[]>([]);
  const [conceptAvailability, setConceptAvailability] = useState<Record<string, { modes: ContentMode[]; hasInteractive: boolean }>>({});
  const [activeConceptId, setActiveConceptId] = useState("synapses");
  const [createStep, setCreateStep] = useState<"sources" | "structure" | "build" | "done">("sources");
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [studentToolsTab, setStudentToolsTab] = useState<StudentToolsTab>("quizzes");
  const [lessonPanel, setLessonPanel] = useState<LessonPanel>("split");
  const [examDate, setExamDateState] = useState<string | null>(() => localStorage.getItem("owlwise-exam-date"));
  const [toast, setToast] = useState<string | null>(null);
  const [coachPanelOpen, setCoachPanelOpen] = useState(true);
  const [lessonCoachFocus, setLessonCoachFocus] = useState<{ conceptId: string; conceptName: string } | null>(null);
  const [pendingBuild, setPendingBuild] = useState<PendingBuild | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const setExamDate = useCallback((date: string | null) => {
    setExamDateState(date);
    if (date) localStorage.setItem("owlwise-exam-date", date);
    else localStorage.removeItem("owlwise-exam-date");
  }, []);

  const queueBuild = useCallback((build: PendingBuild) => setPendingBuild(build), []);
  const clearPendingBuild = useCallback(() => setPendingBuild(null), []);

  const mapCourseFull = useCallback((data: Record<string, unknown>) => {
    const course = data.course as { id: string; published: boolean; title?: string; default_modes?: Record<ContentMode, boolean> };
    setCourseId(course.id);
    setCourseTitle(course.title ?? "Untitled course");
    setCoursePublished(course.published);

    const chaps = (data.chapters as { id: string; title: string; label: string; sort_order: number }[]) ?? [];
    const mods = (data.modules as { id: string; name: string; chapter_id: string; concept_id: string; sort_order: number }[]) ?? [];
    const blocks = (data.blocks as { id: string; module_id: string; type: string; label: string; title: string; content: Record<string, unknown>; sort_order: number }[]) ?? [];
    const edges = (data.edges as { from_name: string; to_name: string }[]) ?? [];
    const avail = (data.availability as { concept_id: string; modes: string[]; has_interactive: boolean }[]) ?? [];
    const conceptRows = (data.concepts as { id: string; name: string; subtitle: string; letter: string; chapter_id: string; sort_order: number }[]) ?? [];

    setPrerequisiteGraph(edges.map((e) => ({ from: e.from_name, to: e.to_name })));

    const availability: typeof conceptAvailability = {};
    avail.forEach((a) => {
      availability[a.concept_id] = {
        modes: a.modes as ContentMode[],
        hasInteractive: a.has_interactive,
      };
    });
    setConceptAvailability(availability);

    const chapterOrder = Object.fromEntries(chaps.map((c, i) => [c.id, i + 1]));
    setConcepts(
      conceptRows.map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.subtitle,
        letter: c.letter ?? c.name[0],
        chapter: chapterOrder[c.chapter_id] ?? 1,
      }))
    );

    const mappedModules: CourseModule[] = mods.map((m) => {
      const ch = chaps.find((c) => c.id === m.chapter_id);
      return {
        id: m.id,
        name: m.name,
        chapter: ch?.title ?? "",
        chapterLabel: ch?.label ?? "",
        prereqs: edges.filter((e) => e.to_name === m.name).map((e) => e.from_name),
        conceptId: m.concept_id,
        blocks: blocks
          .filter((b) => b.module_id === m.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => ({
            id: b.id,
            type: b.type as ContentBlock["type"],
            label: b.label,
            title: b.title,
            content: b.content,
            masterySignal: (b.mastery_signal ?? "none") as "binary" | "none",
          })),
      };
    });
    setModulesState(mappedModules);

    const sources = (data.sources as RAGSource[]) ?? [];
    setRagSources(sources.map((s) => ({
      id: s.id,
      name: (s as { name: string }).name,
      type: (s as { type: string }).type,
      status: (s as { status: RAGSource["status"] }).status,
      detail: formatSourceDetail((s as { detail: unknown }).detail),
    })));
  }, []);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setScreen("landing");
        setLoading(false);
        return;
      }

      const me = await DataAPI.me();
      const profile = me.profile as { role: Role; display_name: string; email: string };
      setRole(profile.role);

      if (profile.role === "student") {
        const lm = me.learner as Record<string, unknown> | null;
        const masteryRows = (me.mastery as { concept_id: string; level: string; bkt_score?: number }[]) ?? [];
        const masteryMap = Object.fromEntries(masteryRows.map((m) => [m.concept_id, m.level as MasteryLevel]));
        const bktMap = Object.fromEntries(masteryRows.map((m) => [m.concept_id, Number(m.bkt_score ?? 0)]));
        setLearner({
          name: profile.display_name,
          email: profile.email,
          age: (lm?.age as string) ?? null,
          goal: (lm?.goal as string) ?? null,
          defaultMode: ((lm?.default_mode as ContentMode) ?? "conversational"),
          sessionLength: (lm?.session_length as string) ?? null,
          streak: (lm?.streak as number) ?? 0,
          conceptMastery: masteryMap,
          conceptBkt: bktMap,
          reflections: ((me.reflections as LearnerModel["reflections"]) ?? []),
          modeSwitchLog: [],
          misconceptions: ((me.misconceptions as LearnerModel["misconceptions"]) ?? []),
          completedReflectionForConcept: Object.fromEntries(
            ((me.reflections as { concept_id: string; is_session: boolean }[]) ?? [])
              .filter((r) => r.is_session)
              .map((r) => [r.concept_id, true])
          ),
          lastSessionConcept: null,
        });

        const enrollments = me.enrollments as { course_id: string }[] | undefined;
        const studentCourses = (me.studentCourses as StudentCourseEnrollment[]) ?? [];
        setStudentEnrollments(studentCourses);
        const cid = enrollments?.[0]?.course_id ?? studentCourses[0]?.courseId;
        if (cid) {
          const full = await DataAPI.courseFull(cid);
          mapCourseFull(full);
          const conceptRows = (full.concepts as { id: string }[]) ?? [];
          if (conceptRows.length) setActiveConceptId(conceptRows[0].id);
          setScreen(lm?.onboarding_complete ? "student-courses" : "student-onboarding");
        } else {
          setScreen("student-onboarding");
        }
      } else {
        const inst = me.instructor as Record<string, unknown> | null;
        setInstructor({
          name: profile.display_name,
          template: (inst?.template as string) ?? null,
          preferences: (inst?.preferences as InstructorProfile["preferences"]) ?? emptyInstructor.preferences,
          defaultModes: (inst?.default_modes as InstructorProfile["defaultModes"]) ?? emptyInstructor.defaultModes,
        });
        const courseRows = (me.courses as { id: string; title: string; published: boolean }[]) ?? [];
        setInstructorCourses(
          courseRows.map((c) => ({ id: c.id, title: c.title, published: c.published }))
        );
        const cid = courseRows[0]?.id;
        if (cid) {
          const full = await DataAPI.courseFull(cid);
          mapCourseFull(full);
          setScreen(inst?.onboarding_complete ? "instructor-home" : "instructor-onboarding");
        } else {
          setScreen(inst?.onboarding_complete ? "instructor-home" : "instructor-onboarding");
        }
      }
    } catch (e) {
      console.error("Hydrate failed", e);
      setScreen("landing");
    } finally {
      setLoading(false);
    }
  }, [mapCourseFull]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = useCallback(async (email: string, password: string, expectedRole: Role) => {
    const normalizedEmail = email.trim().toLowerCase();
    let { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (error?.message?.toLowerCase().includes("invalid login credentials")) {
      try {
        await DataAPI.register({ email: normalizedEmail, password, role: expectedRole });
        const retry = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        data = retry.data;
        error = retry.error;
      } catch {
        /* keep original login error */
      }
    }

    if (error) throw error;
    if (!data.session) throw new Error("Sign in failed — no session returned.");

    const me = await DataAPI.me();
    const profile = me.profile as { role: Role };
    if (profile.role !== expectedRole) {
      await supabase.auth.signOut();
      throw new Error(`This account is registered as ${profile.role}, not ${expectedRole}.`);
    }
    await hydrate();
  }, [hydrate]);

  const register = useCallback(async (email: string, password: string, role: Role) => {
    await DataAPI.register({ email: email.trim().toLowerCase(), password, role });
    await login(email.trim().toLowerCase(), password, role);
  }, [login]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setScreen("landing");
  }, []);

  const updateLearner = useCallback((patch: Partial<LearnerModel>) => {
    setLearner((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveLearnerOnboarding = useCallback(async () => {
    await DataAPI.learnerOnboarding({
      age: learner.age,
      goal: learner.goal,
      defaultMode: learner.defaultMode,
      sessionLength: learner.sessionLength,
    });
    setScreen("student-courses");
  }, [learner]);

  const saveInstructorOnboarding = useCallback(async () => {
    await DataAPI.instructorOnboarding({
      template: instructor.template,
      preferences: instructor.preferences,
    });
    setCreateStep("sources");
    setScreen("instructor-create");
  }, [instructor]);

  const setLearnerMastery = useCallback((conceptId: string, level: MasteryLevel, bkt?: number) => {
    setLearner((prev) => ({
      ...prev,
      conceptMastery: { ...prev.conceptMastery, [conceptId]: level },
      ...(bkt !== undefined
        ? { conceptBkt: { ...prev.conceptBkt, [conceptId]: bkt } }
        : {}),
    }));
  }, []);

  const logModeSwitch = useCallback(async (conceptId: string, from: ContentMode, to: ContentMode) => {
    if (!courseId) return;
    await AgentAPI.modeSwitch({ courseId, conceptId, from, to });
    setLearner((prev) => ({
      ...prev,
      modeSwitchLog: [...prev.modeSwitchLog, { conceptId, from, to, timestamp: Date.now() }],
    }));
  }, [courseId]);

  const completeReflection = useCallback((conceptId: string) => {
    setLearner((prev) => ({
      ...prev,
      completedReflectionForConcept: { ...prev.completedReflectionForConcept, [conceptId]: true },
      lastSessionConcept: conceptId,
    }));
  }, []);

  const updateInstructor = useCallback((patch: Partial<InstructorProfile>) => {
    setInstructor((prev) => ({ ...prev, ...patch }));
  }, []);

  const refreshRagStatus = useCallback(async () => {
    if (!courseId) return;
    try {
      const status = await DataAPI.ragStatus(courseId);
      setRagStatus(status);
    } catch {
      setRagStatus(null);
    }
  }, [courseId]);

  const refreshSources = useCallback(async () => {
    if (!courseId) return;
    const sources = await DataAPI.sources(courseId);
    setRagSources(
      (sources as RAGSource[]).map((s) => ({
        ...s,
        detail: formatSourceDetail((s as { detail: unknown }).detail),
      }))
    );
    await refreshRagStatus();
  }, [courseId, refreshRagStatus]);

  const waitForSourceIndexing = useCallback(async () => {
    if (!courseId) return;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const sources = await DataAPI.sources(courseId);
      setRagSources(sources as RAGSource[]);
      await refreshRagStatus();
      const status = await DataAPI.ragStatus(courseId);
      setRagStatus(status);
      if (status.chunkCount > 0) return;

      const pending = (sources as RAGSource[]).some(
        (s) => s.status === "indexing" || s.status === "transcribing"
      );
      const failed = (sources as RAGSource[]).find((s) => s.status === "error");
      if (failed) throw new Error(formatSourceDetail(failed.detail) || "Source indexing failed");
      if (!pending) return;
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error("Indexing timed out — check Sources for status and try again");
  }, [courseId, refreshRagStatus]);

  const addRAGSource = useCallback(async (name: string, type: string) => {
    if (!courseId) return;
    await DataAPI.registerSource(courseId, name, type);
    await refreshSources();
  }, [courseId, refreshSources]);

  const uploadRAGFile = useCallback(async (file: File) => {
    if (!courseId) {
      throw new Error("No course loaded — go to Home and click Create Course first.");
    }
    await DataAPI.uploadSource(courseId, file);
    await waitForSourceIndexing();
  }, [courseId, waitForSourceIndexing]);

  const addRAGUrl = useCallback(async (url: string, type: string) => {
    if (!courseId) throw new Error("No course loaded — go to Home and create a course first.");
    await DataAPI.sourceUrl(courseId, url, type);
    await waitForSourceIndexing();
  }, [courseId, waitForSourceIndexing]);

  const removeRAGSource = useCallback(async (id: string) => {
    await DataAPI.deleteSource(id);
    await refreshSources();
  }, [refreshSources]);

  useEffect(() => {
    if (!courseId) return;
    refreshSources().catch(() => {});
  }, [courseId, refreshSources]);

  useEffect(() => {
    const indexing = ragSources.some(
      (s) => s.status === "indexing" || s.status === "transcribing"
    );
    if (!courseId || !indexing) return;
    const id = setInterval(() => {
      refreshSources().catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [courseId, ragSources, refreshSources]);

  const setModules = useCallback((m: CourseModule[]) => setModulesState(m), []);

  const addBlockToModule = useCallback(async (moduleIndex: number, block: ContentBlock) => {
    const mod = modules[moduleIndex];
    if (!mod) throw new Error("Module not found");
    const created = await DataAPI.addBlock(mod.id, {
      type: block.type,
      label: block.label,
      title: block.title,
      content: block.content ?? {},
      sort_order: mod.blocks.length,
      masterySignal: block.masterySignal,
    }) as ContentBlock;
    setModulesState((prev) =>
      prev.map((m, i) =>
        i === moduleIndex ? { ...m, blocks: [...m.blocks, { ...block, id: created.id }] } : m
      )
    );
  }, [modules]);

  const addBlocksToModule = useCallback(async (moduleIndex: number, blocks: ContentBlock[]) => {
    const mod = modules[moduleIndex];
    if (!mod) throw new Error("Module not found");
    const createdBlocks: ContentBlock[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const created = await DataAPI.addBlock(mod.id, {
        type: block.type,
        label: block.label,
        title: block.title,
        content: block.content ?? {},
        sort_order: mod.blocks.length + i,
        masterySignal: block.masterySignal,
      }) as ContentBlock;
      createdBlocks.push({ ...block, id: created.id });
    }
    setModulesState((prev) =>
      prev.map((m, i) =>
        i === moduleIndex ? { ...m, blocks: [...m.blocks, ...createdBlocks] } : m
      )
    );
  }, [modules]);

  const removeBlockFromModule = useCallback(async (moduleIndex: number, blockIndex: number) => {
    const block = modules[moduleIndex]?.blocks[blockIndex];
    if (!block) return;
    await DataAPI.deleteBlock(block.id);
    setModulesState((prev) =>
      prev.map((m, i) =>
        i === moduleIndex ? { ...m, blocks: m.blocks.filter((_, bi) => bi !== blockIndex) } : m
      )
    );
  }, [modules]);

  const reorderModules = useCallback((from: number, to: number) => {
    setModulesState((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const publishCourse = useCallback(async () => {
    if (!courseId) throw new Error("No course loaded");
    const chapterTitles = [...new Set(modules.map((m) => m.chapter).filter(Boolean))];
    const chapters = (chapterTitles.length ? chapterTitles : ["General"]).map((title, i) => {
      const mod = modules.find((m) => m.chapter === title);
      return { title, label: mod?.chapterLabel ?? title, sort_order: i };
    });
    const result = await DataAPI.publishCourse(courseId, {
      defaultModes: instructor.defaultModes,
      chapters,
      modules: modules.map((m, i) => ({
        id: m.id,
        name: m.name,
        sort_order: i,
        chapter_title: m.chapter || chapterTitles[0] || "General",
      })),
      edges: prerequisiteGraph.map((e) => ({ from: e.from, to: e.to })),
    }) as { enrolledCount: number };
    setCoursePublished(true);
    const full = await DataAPI.courseFull(courseId);
    mapCourseFull(full);
    const publishedTitle = (full.course as { title?: string })?.title ?? courseTitle;
    setInstructorCourses((prev) => {
      const entry: InstructorCourseSummary = { id: courseId, title: publishedTitle, published: true };
      if (prev.some((c) => c.id === courseId)) {
        return prev.map((c) => (c.id === courseId ? entry : c));
      }
      return [entry, ...prev];
    });
    return result;
  }, [courseId, courseTitle, instructor.defaultModes, mapCourseFull, modules, prerequisiteGraph]);

  const loadCourse = useCallback(async (cid: string) => {
    const full = await DataAPI.courseFull(cid);
    mapCourseFull(full);
    const conceptRows = (full.concepts as { id: string }[]) ?? [];
    if (conceptRows.length) setActiveConceptId(conceptRows[0].id);
  }, [mapCourseFull]);

  const joinCourseByCode = useCallback(async (code: string) => {
    const joined = await DataAPI.joinCourse(code);
    const enrollment: StudentCourseEnrollment = {
      courseId: joined.courseId,
      title: joined.title,
      subject: joined.subject,
      instructorName: joined.instructorName,
    };
    setStudentEnrollments((prev) =>
      prev.some((e) => e.courseId === enrollment.courseId) ? prev : [...prev, enrollment]
    );
    await loadCourse(joined.courseId);
    return enrollment;
  }, [loadCourse]);

  const generateAllModules = useCallback(
    async (onProgress?: (done: number, total: number, moduleName: string) => void) => {
      if (!courseId) throw new Error("No course loaded");
      const targets = modules.map((m, index) => ({ ...m, index }));
      const total = targets.length;
      let generated = 0;
      let skipped = 0;
      const failed: { name: string; error: string }[] = [];

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        onProgress?.(i, total, target.name);
        if (target.blocks.length > 0) {
          skipped++;
          continue;
        }
        try {
          const result = await AgentAPI.generateModuleLesson(courseId, target.name, {
            chapter: target.chapter,
            prereqs: target.prereqs,
          });
          const rawBlocks = Array.isArray(result.blocks) ? result.blocks : [];
          if (!rawBlocks.length) throw new Error("No blocks returned");
          const blocks: ContentBlock[] = rawBlocks.map((b) => ({
            id: "",
            type: b.type as ContentBlock["type"],
            label: b.label,
            title: b.title,
            content: b.content,
          }));
          await addBlocksToModule(target.index, blocks);
          generated++;
        } catch (e) {
          failed.push({ name: target.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
      onProgress?.(total, total, "");
      return { generated, skipped, failed };
    },
    [courseId, modules, addBlocksToModule]
  );

  // Auto-join when a student opens a classroom link (…/?join=OWL-XXXXXX)
  const [joinLinkHandled, setJoinLinkHandled] = useState(false);
  useEffect(() => {
    if (loading || joinLinkHandled || role !== "student") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    setJoinLinkHandled(true);
    if (!code) return;
    params.delete("join");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    joinCourseByCode(code)
      .then(() => setScreen("student-workspace"))
      .catch((e) => console.warn("Join via link failed:", e));
  }, [loading, role, joinLinkHandled, joinCourseByCode]);

  const resetCreateWizardState = useCallback(() => {
    setCoursePublished(false);
    setModulesState([]);
    setConcepts([]);
    setPrerequisiteGraph([]);
    setConceptAvailability({});
    setRagSources([]);
    setRagStatus(null);
    setDashboardData(null);
    setCreateStep("sources");
    setCurrentModuleIndex(0);
  }, []);

  const startNewCourse = useCallback(async (title?: string) => {
    const course = await DataAPI.createCourse(title);
    setCourseId(course.id);
    setCourseTitle(course.title ?? title ?? "Untitled course");
    setInstructorCourses((prev) => [
      { id: course.id, title: course.title ?? title ?? "Untitled course", published: false },
      ...prev.filter((c) => c.id !== course.id),
    ]);
    resetCreateWizardState();
    setScreen("instructor-create");
  }, [resetCreateWizardState]);

  const openCourseEditor = useCallback(() => {
    if (!courseId) return;
    setCreateStep(
      modules.length > 0 ? "build" : ragSources.length > 0 ? "structure" : "sources"
    );
    setCurrentModuleIndex(0);
    setScreen("instructor-create");
  }, [courseId, modules.length, ragSources.length]);

  const openStudentLesson = useCallback((conceptId?: string) => {
    if (!courseId) {
      showToast("Join a course first to start learning.");
      return;
    }
    const target = conceptId ?? concepts[0]?.id;
    if (!target) {
      showToast("This course has no lessons yet.");
      return;
    }
    setActiveConceptId(target);
    setLessonPanel("split");
    setScreen("student-concept");
  }, [courseId, concepts, showToast]);

  const openStudentAssistant = useCallback(() => {
    if (!courseId) {
      showToast("Open a course from My Sets first.");
      setScreen("student-sets");
      return;
    }
    setCoachPanelOpen(true);
  }, [courseId, showToast]);

  const toggleCoachPanel = useCallback(() => {
    setCoachPanelOpen((open) => !open);
  }, []);

  const duplicateModule = useCallback(async (index: number) => {
    if (!courseId) return;
    const source = modules[index];
    if (!source) return;
    const copy: CourseModule = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
      blocks: source.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })),
    };
    const next = [...modules.slice(0, index + 1), copy, ...modules.slice(index + 1)];
    setModulesState(next);
    await DataAPI.saveModules(courseId, {
      modules: next.map((m, i) => ({ id: m.id, name: m.name, sort_order: i, concept_id: m.conceptId })),
      edges: prerequisiteGraph.map((e) => ({ from: e.from, to: e.to })),
    });
    showToast(`Duplicated “${source.name}”.`);
  }, [courseId, modules, prerequisiteGraph, showToast]);

  const removeModule = useCallback(async (index: number) => {
    if (!courseId || modules.length <= 1) {
      showToast("Cannot remove the only module.");
      return;
    }
    const name = modules[index]?.name ?? "Module";
    const next = modules.filter((_, i) => i !== index);
    setModulesState(next);
    setCurrentModuleIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
    await DataAPI.saveModules(courseId, {
      modules: next.map((m, i) => ({ id: m.id, name: m.name, sort_order: i, concept_id: m.conceptId })),
      edges: prerequisiteGraph.map((e) => ({ from: e.from, to: e.to })),
    });
    showToast(`Removed “${name}”.`);
  }, [courseId, modules, prerequisiteGraph, showToast]);

  const draftCourseStructure = useCallback(async (prompt: string) => {
    if (!courseId) throw new Error("No course loaded. Go back to Home and try again.");
    let status = await DataAPI.ragStatus(courseId);
    setRagStatus(status);
    if (status.chunkCount === 0) {
      await waitForSourceIndexing();
      status = await DataAPI.ragStatus(courseId);
      setRagStatus(status);
    }
    if (status.chunkCount === 0) {
      throw new Error(
        status.errorCount > 0
          ? "Source indexing failed — remove failed uploads, re-add them, and wait until status shows Ready."
          : "No indexed sources yet — upload course material and wait until sources show Ready."
      );
    }
    const draft = await AgentAPI.draftCourse(courseId, prompt) as {
      title?: string;
      chapters?: { label: string; title: string; modules: { name: string; prereqs?: string[] }[] }[];
      prerequisiteEdges?: PrerequisiteEdge[];
    };

    const chapters = Array.isArray(draft.chapters) ? draft.chapters : [];
    if (chapters.length === 0) {
      throw new Error("AI returned an empty course structure — try again or add more source material first.");
    }

    if (draft.title?.trim()) setCourseTitle(draft.title.trim());
    const flatModules: CourseModule[] = [];
    for (const ch of chapters) {
      const mods = Array.isArray(ch.modules) ? ch.modules : [];
      for (const m of mods) {
        if (!m?.name?.trim()) continue;
        flatModules.push({
          id: crypto.randomUUID(),
          name: m.name.trim(),
          chapter: ch.title ?? "General",
          chapterLabel: ch.label ?? ch.title ?? "CH 1",
          prereqs: Array.isArray(m.prereqs) ? m.prereqs : [],
          blocks: [],
        });
      }
    }

    if (flatModules.length === 0) {
      throw new Error("AI returned no modules — try again with a clearer prompt or more sources.");
    }

    const edges = Array.isArray(draft.prerequisiteEdges) ? draft.prerequisiteEdges : [];
    setModulesState(flatModules);
    setPrerequisiteGraph(edges);
    await DataAPI.saveModules(courseId, {
      modules: flatModules.map((m, i) => ({ id: m.id, name: m.name, sort_order: i, concept_id: m.conceptId })),
      edges: edges.map((e) => ({ from: e.from, to: e.to })),
    });
    setCreateStep("structure");
  }, [courseId, waitForSourceIndexing]);

  const syncCourse = useCallback(async () => {
    if (!courseId) return;
    const full = await DataAPI.courseFull(courseId);
    mapCourseFull(full);
  }, [courseId, mapCourseFull]);

  const setDefaultModes = useCallback((modes: Record<ContentMode, boolean>) => {
    setInstructor((prev) => ({ ...prev, defaultModes: modes }));
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (!courseId) return;
    const data = await DataAPI.dashboard(courseId);
    setDashboardData(data as DashboardPayload);
  }, [courseId]);

  const value = useMemo<AppContextValue>(
    () => ({
      screen, role, courseId, courseTitle, learner, instructor, ragSources, ragStatus, coursePublished, instructorCourses, studentEnrollments,
      modules, concepts, prerequisiteGraph, conceptAvailability, activeConceptId,
      createStep, currentModuleIndex, loading, dashboardData, loginIntent,
      studentToolsTab, lessonPanel, examDate, toast, pendingBuild, coachPanelOpen, lessonCoachFocus,
      setScreen, setLoginIntent, login, register, logout, updateLearner, saveLearnerOnboarding, saveInstructorOnboarding,
      setLearnerMastery, logModeSwitch, completeReflection, updateInstructor,
      addRAGSource, uploadRAGFile, addRAGUrl, removeRAGSource, refreshSources, refreshRagStatus,
      setModules, addBlockToModule, addBlocksToModule, removeBlockFromModule, reorderModules,
      publishCourse, joinCourseByCode, generateAllModules, draftCourseStructure, setCreateStep, setCurrentModuleIndex,
      setActiveConceptId, setDefaultModes, refreshDashboard, syncCourse, loadCourse, startNewCourse, openCourseEditor, hydrate,
      setStudentToolsTab, setLessonPanel, setExamDate,
      showToast, clearToast, queueBuild, clearPendingBuild, openStudentLesson, openStudentAssistant,
      setCoachPanelOpen, toggleCoachPanel, setLessonCoachFocus,
      duplicateModule, removeModule,
    }),
    [
      screen, role, courseId, courseTitle, learner, instructor, ragSources, ragStatus, coursePublished, instructorCourses, studentEnrollments,
      modules, concepts, prerequisiteGraph, conceptAvailability, activeConceptId,
      createStep, currentModuleIndex, loading, dashboardData, loginIntent,
      studentToolsTab, lessonPanel, examDate, toast, pendingBuild, coachPanelOpen, lessonCoachFocus,
      login, register, logout, updateLearner, saveLearnerOnboarding, saveInstructorOnboarding,
      setLearnerMastery, logModeSwitch, completeReflection, updateInstructor,
      addRAGSource, uploadRAGFile, addRAGUrl, removeRAGSource, refreshSources, refreshRagStatus,
      setModules, addBlockToModule, addBlocksToModule, removeBlockFromModule, reorderModules,
      publishCourse, joinCourseByCode, generateAllModules, draftCourseStructure, setDefaultModes, refreshDashboard, syncCourse, loadCourse, startNewCourse, openCourseEditor, hydrate,
      setStudentToolsTab, setLessonPanel, setExamDate,
      showToast, clearToast, queueBuild, clearPendingBuild, openStudentLesson, openStudentAssistant,
      toggleCoachPanel, duplicateModule, removeModule,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
