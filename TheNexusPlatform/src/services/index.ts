import type {
  AttemptResponse,
  Course,
  CreatedCourse,
  ItemMastery,
  Mode,
  ModuleStructure,
  Role,
  StudentRecord,
  TeacherBlock,
  TeacherMeta,
  UnitContent,
  UploadResult,
  IngestJobStatus,
  User,
} from "./types";
import { MOCK_COURSES, MOCK_STUDENTS, MOCK_UNIT } from "./mock";
import { httpContent, httpCourses, httpLearning, httpTeacher } from "./http";
import {
  clearAuthSession,
  getStoredUser,
  platformSignIn,
  platformSignUp,
} from "./platform";

export * from "./types";
export { MODE_META, MODE_PROMPTS } from "./prompts";

const delay = <T>(value: T, ms = 450): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

export interface AuthService {
  signIn(email: string, password: string, role: Role): Promise<User>;
  signUp(email: string, password: string, role: Role): Promise<User>;
}

export interface CourseService {
  listCourses(): Promise<Course[]>;
  joinCourse(code: string): Promise<Course>;
  getCourse?(id: string): Promise<Course>;
}

export interface ContentService {
  getUnit(
    unitId: string,
    topic?: string,
    grade?: string,
    courseId?: string,
    moduleLabel?: string,
  ): Promise<UnitContent>;
  getModule?(unitId: string): Promise<ModuleStructure>;
  askAssistant(
    unitId: string,
    mode: Mode,
    question: string,
    topic?: string,
    courseId?: string,
  ): Promise<string>;
}

export interface LearningService {
  getMastery(unitId: string, studentId?: string): Promise<ItemMastery[]>;
  recordAttempt(
    unitId: string,
    itemId: string,
    itemType: "flashcard" | "mcq",
    correct: boolean,
    studentId?: string,
  ): Promise<AttemptResponse>;
}

export interface TeacherService {
  listStudents(): Promise<StudentRecord[]>;
  generateCourse(): Promise<{ ok: true }>;
  uploadFile?(file: File): Promise<UploadResult>;
  previewStructure?(uploadIds: string[]): Promise<{ chapters: { label: string; title: string }[] }>;
  createCourse?(
    meta: TeacherMeta,
    uploadIds: string[],
    units: { moduleLabel: string; concept: string }[],
    teacherBlocks?: TeacherBlock[],
  ): Promise<CreatedCourse>;
  waitForIngestJob?(
    jobId: string,
    onProgress?: (status: IngestJobStatus) => void,
    options?: { untilChapters?: number },
  ): Promise<void>;
  pollIngestJob?(
    jobId: string,
    onProgress?: (status: IngestJobStatus) => void,
  ): Promise<IngestJobStatus>;
}

const mockAuth: AuthService = {
  signIn: (email, _password, role) =>
    delay({ id: "u1", email, role, name: email.split("@")[0] || "there" }),
  signUp: (email, _password, role) =>
    delay({ id: "u1", email, role, name: email.split("@")[0] || "there" }),
};

const httpAuth: AuthService = {
  signIn: async (email, password, role) => {
    const user = await platformSignIn(email, password);
    return {
      id: user.id,
      email: user.email,
      role: role,
      name: user.display_name || email.split("@")[0] || "there",
    };
  },
  signUp: async (email, password, role) => {
    const signupType = role === "teacher" ? "teacher" : "student";
    const user = await platformSignUp(email, password, signupType);
    return {
      id: user.id,
      email: user.email,
      role: role,
      name: user.display_name || email.split("@")[0] || "there",
    };
  },
};

const mockCourses: CourseService = {
  listCourses: () => delay(MOCK_COURSES),
  joinCourse: () => delay(MOCK_COURSES[0]),
};

const mockContent: ContentService = {
  getUnit: () => delay(MOCK_UNIT),
  getModule: () => Promise.reject(new Error("No module structure in mock mode")),
  askAssistant: (_unitId, mode) => delay(MOCK_UNIT.assistantReply[mode], 650),
};

const mockLearning: LearningService = {
  getMastery: () => delay([]),
  recordAttempt: (_unitId, itemId, _itemType, correct) =>
    delay({
      mastery: { itemId, alpha: correct ? 2 : 1, beta: correct ? 1 : 2, wrongCount: correct ? 0 : 1, lastResult: correct ? "correct" : "incorrect" },
      shouldResurface: !correct,
    }),
};

const mockTeacher: TeacherService = {
  listStudents: () => delay(MOCK_STUDENTS),
  generateCourse: () => delay({ ok: true } as const, 1200),
};

import { useBackendApi } from "./apiBase";

const useBackend = useBackendApi();

const teacher: TeacherService = useBackend
  ? { ...mockTeacher, ...httpTeacher }
  : mockTeacher;

export const api = {
  auth: useBackend ? httpAuth : mockAuth,
  courses: useBackend ? httpCourses : mockCourses,
  content: useBackend ? httpContent : mockContent,
  learning: useBackend ? httpLearning : mockLearning,
  teacher,
};

export { clearAuthSession, getStoredUser, listMyOrgs, validateJoinCode, registerWithJoinCode } from "./platform";
