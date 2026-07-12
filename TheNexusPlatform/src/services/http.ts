import type {
  AttemptResponse,
  Course,
  CreatedCourse,
  IngestJobStatus,
  ItemMastery,
  Mode,
  ModuleStructure,
  TeacherBlock,
  TeacherMeta,
  UnitContent,
  UploadResult,
} from "./types";
import type { ContentService, CourseService, LearningService, TeacherService } from "./index";
import { getApiBaseUrl } from "./apiBase";
import { authHeaders, getStoredUser, registerWithJoinCode, validateJoinCode } from "./platform";

const BASE = getApiBaseUrl();

function parseApiError(path: string, status: number, detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { detail?: string };
    if (typeof parsed.detail === "string") {
      if (parsed.detail === "Invalid classroom code") {
        return "That classroom code was not found. Double-check the code from your teacher and make sure the app is connected to the same server.";
      }
      return parsed.detail;
    }
  } catch {
    // keep raw detail
  }
  return `Request failed (${status})`;
}

async function post<T>(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(), ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(parseApiError(path, res.status, detail));
  }
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(parseApiError(path, res.status, detail));
  }
  return (await res.json()) as T;
}

const JOINED_COURSE_KEY = "joinedCourseId";

export const httpContent: ContentService = {
  getUnit: (unitId, topic, grade, courseId, moduleLabel) =>
    post<UnitContent>("/api/content/generate", {
      unitId,
      topic: topic ?? unitId,
      grade,
      courseId,
      moduleLabel,
    }),

  getModule: (unitId) => get<ModuleStructure>(`/api/content/module/${encodeURIComponent(unitId)}`),

  askAssistant: (unitId, mode, question, topic, courseId) =>
    post<{ reply: string }>("/api/content/assistant", {
      unitId,
      topic: topic ?? "",
      mode,
      question,
      courseId,
    }).then((r) => r.reply),
};

export const httpLearning: LearningService = {
  getMastery: (unitId, studentId) => {
    const q = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
    return get<ItemMastery[]>(`/api/learning/mastery/${encodeURIComponent(unitId)}${q}`);
  },

  recordAttempt: (unitId, itemId, itemType, correct, studentId) =>
    post<AttemptResponse>("/api/learning/attempt", {
      unitId,
      itemId,
      itemType,
      correct,
      studentId: studentId ?? "local-student",
    }),
};

export const httpCourses: CourseService = {
  listCourses: async () => {
    const joinedId = localStorage.getItem(JOINED_COURSE_KEY);
    if (!joinedId) return [];
    const course = await get<Course>(`/api/courses/${joinedId}`);
    return [course];
  },

  joinCourse: async (code: string) => {
    const trimmed = code.trim().toUpperCase();

    // Classroom codes (6-char codes from the teacher app) take priority.
    try {
      const course = await get<Course>(`/api/courses/join/${encodeURIComponent(trimmed)}`);
      localStorage.setItem(JOINED_COURSE_KEY, course.id);
      const user = getStoredUser();
      await post(`/api/courses/${course.id}/enroll`, {
        displayName: user?.display_name || user?.email?.split("@")[0] || "Student",
        profileId: user?.id,
        joinCode: trimmed,
      });
      return course;
    } catch (courseErr) {
      // Fall back to platform org/stage join codes.
      try {
        const platformCode = await validateJoinCode(trimmed);
        if (platformCode.kind === "student") {
          const user = getStoredUser();
          if (!user) {
            throw new Error("Sign in first, then enter your challenge code on My courses.");
          }
          await registerWithJoinCode(trimmed, user.display_name || user.email.split("@")[0]);
          localStorage.setItem("liac_org_id", platformCode.org_id);
          localStorage.setItem("liac_stage_id", platformCode.stage_node_id);
          return {
            id: platformCode.org_id,
            subject: platformCode.org_name,
            unitTitle: platformCode.stage_name,
            teacher: "",
            units: 0,
            progress: 0,
          } as Course;
        }
        throw new Error("That code is for educators, not students. Use the classroom code from your teacher.");
      } catch {
        throw courseErr instanceof Error ? courseErr : new Error("Invalid classroom code");
      }
    }
  },

  getCourse: (id: string) => get<Course>(`/api/courses/${id}`),
};

export const httpTeacher: Pick<TeacherService, "uploadFile" | "previewStructure" | "createCourse" | "waitForIngestJob" | "pollIngestJob"> = {
  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status}) ${detail}`);
    }
    return (await res.json()) as UploadResult;
  },

  previewStructure: (uploadIds: string[]) =>
    post<{ chapters: { label: string; title: string }[] }>("/api/courses/preview-structure", { uploadIds }),

  createCourse: (meta, uploadIds, units, teacherBlocks: TeacherBlock[] = []) =>
    post<CreatedCourse>("/api/courses", {
      subject: meta.subject,
      unitTitle: units[0]?.concept ?? meta.subject,
      grade: meta.grade,
      goals: meta.goals,
      teacherName: meta.teacherName,
      orgId: meta.orgId,
      teacherProfileId: getStoredUser()?.id,
      uploadIds,
      units,
      teacherBlocks,
    }),

  waitForIngestJob: async (jobId, onProgress, options?: { untilChapters?: number }) => {
    while (true) {
      const status = await get<IngestJobStatus>(`/api/courses/ingest-jobs/${encodeURIComponent(jobId)}`);
      onProgress?.(status);
      if (status.status === "complete") return;
      if (status.status === "failed") {
        throw new Error(status.error || "Course generation failed");
      }
      if (options?.untilChapters && status.current >= options.untilChapters) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },

  pollIngestJob: async (jobId, onProgress) => {
    while (true) {
      const status = await get<IngestJobStatus>(`/api/courses/ingest-jobs/${encodeURIComponent(jobId)}`);
      onProgress?.(status);
      if (status.status === "complete" || status.status === "failed") return status;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  },
};
