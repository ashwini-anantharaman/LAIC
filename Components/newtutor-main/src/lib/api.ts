import { getAccessToken } from "./supabase";
import type { DashboardPayload } from "../types/dashboard";

/** In production set VITE_API_URL to your Render backend (no trailing slash). */
const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const BASE = `${API_ROOT}/api`;

import { formatSourceDetail } from "./format";

function parseApiError(body: unknown, statusText: string): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (o.error !== undefined) return formatSourceDetail(o.error) || statusText;
    if (typeof o.message === "string") return o.message;
  }
  return statusText;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(parseApiError(err, res.statusText));
  }
  return res.json() as Promise<T>;
}

export async function apiUpload(path: string, formData: FormData) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function parsePdfResponse(res: Response): Promise<{ data: Uint8Array; name: string }> {
  return res.arrayBuffer().then((buf) => {
    const header = new TextDecoder().decode(buf.slice(0, 5));
    if (!header.startsWith("%PDF")) {
      throw new Error(
        "The stored file is not a valid PDF. Ask your instructor to re-upload the original PDF."
      );
    }
    const name = res.headers.get("X-Source-Name") ?? "Reference PDF";
    return { data: new Uint8Array(buf), name };
  });
}

async function fetchAuthedPdf(path: string): Promise<{ data: Uint8Array; name: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(parseApiError(err, res.statusText));
  }
  return parsePdfResponse(res);
}

export const DataAPI = {
  register: (body: { email: string; password: string; role: string; displayName?: string }) =>
    api<{ ok: boolean }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  me: () => api<Record<string, unknown>>("/me"),
  createCourse: (title?: string) =>
    api<{ id: string; title: string; published: boolean }>("/course", {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    }),
  courseFull: (courseId: string) => api<Record<string, unknown>>(`/course/${courseId}/full`),
  learnerOnboarding: (body: unknown) => api("/learner/onboarding", { method: "POST", body: JSON.stringify(body) }),
  instructorOnboarding: (body: unknown) => api("/instructor/onboarding", { method: "POST", body: JSON.stringify(body) }),
  publishCourse: (courseId: string, body: unknown) =>
    api(`/course/${courseId}/publish`, { method: "POST", body: JSON.stringify(body) }),
  saveModules: (courseId: string, body: unknown) =>
    api(`/course/${courseId}/modules`, { method: "POST", body: JSON.stringify(body) }),
  addBlock: (moduleId: string, body: unknown) =>
    api(`/modules/${moduleId}/blocks`, { method: "POST", body: JSON.stringify(body) }),
  deleteBlock: (blockId: string) => api(`/blocks/${blockId}`, { method: "DELETE" }),
  dashboard: (courseId: string) => api<DashboardPayload>(`/dashboard/${courseId}`),
  sources: (courseId: string) => api<unknown[]>(`/rag/course/${courseId}/sources`),
  ragStatus: (courseId: string) =>
    api<{ chunkCount: number; sourceCount: number; readyCount: number; indexingCount: number; errorCount: number }>(
      `/rag/course/${courseId}/status`
    ),
  uploadSource: (courseId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiUpload(`/rag/course/${courseId}/sources/upload`, fd);
  },
  registerSource: (courseId: string, name: string, type: string) =>
    api(`/rag/course/${courseId}/sources/register`, { method: "POST", body: JSON.stringify({ name, type }) }),
  sourceUrl: (courseId: string, url: string, type: string) =>
    api(`/rag/course/${courseId}/sources/url`, { method: "POST", body: JSON.stringify({ url, type }) }),
  deleteSource: (sourceId: string) => api(`/rag/sources/${sourceId}`, { method: "DELETE" }),
  sourceFileUrl: (sourceId: string) =>
    api<{ url: string; name: string; type: string }>(`/rag/sources/${sourceId}/file-url`),
  sourceFilePdf: (sourceId: string) => fetchAuthedPdf(`/rag/sources/${sourceId}/stream`),
  sourceFileBlob: (sourceId: string) => fetchAuthedPdf(`/rag/sources/${sourceId}/stream`),
  referencePdf: (courseId: string) =>
    api<{ sourceId: string; url: string; name: string }>(`/rag/course/${courseId}/reference-pdf`),
  referencePdfBlob: (courseId: string) => fetchAuthedPdf(`/rag/course/${courseId}/reference-pdf/stream`),
  joinCourse: (code: string) =>
    api<{ courseId: string; title: string; subject: string | null; instructorName: string }>(
      "/join",
      { method: "POST", body: JSON.stringify({ code }) }
    ),
  joinCode: (courseId: string, regenerate = false) =>
    api<{ joinCode: string }>(`/course/${courseId}/join-code`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    }),
  courseStudents: (courseId: string) =>
    api<{ students: { userId: string; name: string; email: string; masteredCount: number; conceptCount: number }[] }>(
      `/course/${courseId}/students`
    ),
};

export const AgentAPI = {
  queryRAG: (courseId: string, query: string) =>
    api<{ answer: string; citations: string; ragChunks: number }>("/agents/rag/query", {
      method: "POST",
      body: JSON.stringify({ courseId, query }),
    }),
  draftCourse: (courseId: string, prompt: string) =>
    api("/agents/course/draft", { method: "POST", body: JSON.stringify({ courseId, prompt }) }),
  conceptContent: (courseId: string, conceptName: string, mode: string, subtitle?: string) =>
    api("/agents/concept/content", {
      method: "POST",
      body: JSON.stringify({ courseId, conceptName, mode, subtitle }),
    }),
  formatStudyContent: (rawContent: string) =>
    api<{ blocks: { title: string; text: string }[] }>("/agents/study/format", {
      method: "POST",
      body: JSON.stringify({ rawContent }),
    }),
  generateMCQ: (courseId: string, conceptName: string) =>
    api<{ question: string; options: string[]; correct: number; hints: { level: string; text: string }[] }>(
      "/agents/quiz/generate",
      { method: "POST", body: JSON.stringify({ courseId, conceptName }) }
    ),
  generateAdaptiveMCQ: (body: {
    courseId: string;
    conceptName: string;
    conceptId: string;
    masteryLevel: string;
    previousQuestions: string[];
  }) =>
    api<{
      done: boolean;
      reason?: string;
      mcq?: { id: string; question: string; options: string[]; correct: number; hints: unknown };
      mastery?: string;
      bktScore?: number;
    }>("/agents/quiz/adaptive/generate", { method: "POST", body: JSON.stringify(body) }),
  generateTest: (courseId: string, conceptName: string) =>
    api<{ title: string; passPct: number; questions: { id: string; question: string; options: string[]; correct: number }[] }>(
      "/agents/test/generate",
      { method: "POST", body: JSON.stringify({ courseId, conceptName }) }
    ),
  generateFlashcards: (courseId: string, conceptName: string) =>
    api<{ title: string; cards: { front: string; back: string }[] }>(
      "/agents/flashcards/generate",
      { method: "POST", body: JSON.stringify({ courseId, conceptName }) }
    ),
  generateReflectionPrompt: (courseId: string, conceptName: string) =>
    api<{ prompt: string; followUpQuestions: string[] }>(
      "/agents/reflection/prompt",
      { method: "POST", body: JSON.stringify({ courseId, conceptName }) }
    ),
  generateModuleLesson: (
    courseId: string,
    moduleName: string,
    opts?: { chapter?: string; subtitle?: string; prereqs?: string[] }
  ) =>
    api<{
      blueprint: { moduleSummary: string; learningObjectives: string[] };
      blocks: { type: string; label: string; title: string; content: Record<string, unknown> }[];
      meta?: { ragChunks: number; ragCitations?: string[]; warnings: string[] };
    }>("/agents/module/generate-lesson", {
      method: "POST",
      body: JSON.stringify({ courseId, moduleName, ...opts }),
    }),
  evaluateQuiz: (body: unknown) => api("/agents/quiz/evaluate", { method: "POST", body: JSON.stringify(body) }),
  evaluateReflection: (body: unknown) =>
    api("/agents/reflection/evaluate", { method: "POST", body: JSON.stringify(body) }),
  plannerNext: (body: unknown) => api("/agents/planner/next", { method: "POST", body: JSON.stringify(body) }),
  assistantChat: (body: unknown) => api("/agents/assistant/chat", { method: "POST", body: JSON.stringify(body) }),
  assistantGreeting: (conceptName: string, mode: string) =>
    api<{ content: string }>(`/agents/assistant/greeting?conceptName=${encodeURIComponent(conceptName)}&mode=${mode}`),
  generateAnimation: (body: unknown) =>
    api("/agents/animation/generate", { method: "POST", body: JSON.stringify(body) }),
  generateManimAnimation: (body: unknown) =>
    api("/agents/animation/generate-manim", { method: "POST", body: JSON.stringify(body) }),
  generateScene3D: (body: unknown) =>
    api("/agents/animation/generate-3d", { method: "POST", body: JSON.stringify(body) }),
  modeSwitch: (body: unknown) => api("/agents/mode-switch", { method: "POST", body: JSON.stringify(body) }),
};
