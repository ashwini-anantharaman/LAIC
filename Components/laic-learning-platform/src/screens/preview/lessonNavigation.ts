import type { Screen } from "../../types";

/** Navigation targets for the student lesson flow. */
export type LessonNavigation = {
  workspaceScreen: Screen;
  conceptScreen: Screen;
};

export const STUDENT_LESSON_NAV: LessonNavigation = {
  workspaceScreen: "student-workspace",
  conceptScreen: "student-concept",
};

/** Duplicate routes for instructor student preview — fork independently from student screens. */
export const PREVIEW_LESSON_NAV: LessonNavigation = {
  workspaceScreen: "instructor-preview",
  conceptScreen: "instructor-preview-concept",
};
