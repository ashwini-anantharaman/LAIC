import { StudentConceptScreen } from "../StudentConceptScreen";
import { PREVIEW_LESSON_NAV } from "./lessonNavigation";

/** Instructor preview of the student lesson — separate route from student-concept. */
export function PreviewConceptLesson() {
  return <StudentConceptScreen lessonNav={PREVIEW_LESSON_NAV} />;
}
