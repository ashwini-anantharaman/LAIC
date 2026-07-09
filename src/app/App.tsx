import type { Screen } from "../types";
import { useApp } from "../store/AppContext";
import { Shell } from "../components/owlwise/primitives";
import { StudyFetchShell } from "../components/studyfetch/StudyFetchSidebar";
import { LandingScreen } from "../screens/LandingScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { StudentOnboarding } from "../screens/StudentOnboarding";
import { InstructorOnboarding } from "../screens/InstructorOnboarding";
import { StudentHomeContent } from "../screens/StudentHomeScreen";
import { StudentSetsScreen } from "../screens/StudentSetsScreen";
import { StudentAssistantChatScreen } from "../screens/StudentAssistantChatScreen";
import { StudentWorkspaceScreen } from "../screens/StudentWorkspaceScreen";
import { StudentConceptScreen } from "../screens/StudentConceptScreen";
import { StudentMasteryScreen } from "../screens/StudentMasteryScreen";
import { StudentChallengeScreen } from "../screens/StudentChallengeScreen";
import { StudentToolsScreen } from "../screens/StudentToolsScreen";
import { StudentSettingsScreen } from "../screens/StudentSettingsScreen";
import { ReflectionScreen } from "../screens/ReflectionScreen";
import { InstructorClassroomsScreen } from "../screens/InstructorClassroomsScreen";
import { InstructorCourseModulesScreen } from "../screens/InstructorCourseModulesScreen";
import { InstructorStudioScreen } from "../screens/studio/InstructorStudioScreen";
import { InstructorChallengeScreen } from "../screens/InstructorChallengeScreen";
import { InstructorSettingsScreen } from "../screens/InstructorSettingsScreen";
import { TeacherDashboardScreen } from "../screens/TeacherDashboardScreen";
import { PreviewWorkspaceScreen } from "../screens/preview/PreviewWorkspaceScreen";
import { PreviewConceptScreen } from "../screens/preview/PreviewConceptScreen";

const STUDENT_SHELL_SCREENS: Screen[] = [
  "student-courses",
  "student-sets",
  "student-workspace",
  "student-assistant",
  "student-mastery",
  "student-challenge",
  "student-tools",
  "student-settings",
  "student-reflection",
  "student-concept",
];

const INSTRUCTOR_SHELL_SCREENS: Screen[] = [
  "instructor-home",
  "instructor-course",
  "instructor-preview",
  "instructor-dashboard",
  "instructor-challenge",
  "instructor-settings",
];

const FULLSCREEN_INSTRUCTOR_PREVIEW: Screen[] = ["instructor-preview-concept"];
const FULLSCREEN_INSTRUCTOR_STUDIO: Screen[] = ["instructor-create"];

export default function App() {
  const {
    screen,
    setScreen,
    setLoginIntent,
    role,
    loading,
    logout,
    learner,
    instructor,
    concepts,
    courseTitle,
    modules,
    courseId,
    toast,
    showToast,
  } = useApp();

  const userName = role === "student" ? (learner.name || "Student") : (instructor.name || "Instructor");
  const userInitials = userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const chapterLabel = modules[0]?.chapter || "General";

  const handleDocuments = () => {
    if (role === "student") {
      setScreen(courseId ? "student-workspace" : "student-sets");
    } else {
      setScreen(courseId ? "instructor-course" : "instructor-home");
    }
  };

  const handleUpgrade = () => {
    showToast("Premium plans coming soon — your classroom stays free.");
  };

  const handleInstructorViewSwitch = () => {
    if (screen === "instructor-preview" || screen === "instructor-preview-concept") {
      setScreen(courseId ? "instructor-course" : "instructor-home");
      return;
    }
    if (!courseId) {
      showToast("Open a classroom first to preview the student view.");
      setScreen("instructor-home");
      return;
    }
    setScreen("instructor-preview");
  };

  if (loading) {
    return (
      <Shell className="bg-[#f8fafc] flex items-center justify-center">
        <p className="text-sm font-semibold text-gray-500">Loading Owlwise…</p>
      </Shell>
    );
  }

  if (screen === "landing") {
    return <LandingScreen setScreen={setScreen} setLoginIntent={setLoginIntent} />;
  }
  if (screen === "login") return <LoginScreen />;
  if (screen === "student-onboarding") return <StudentOnboarding />;
  if (screen === "instructor-onboarding") return <InstructorOnboarding />;

  if (role === "instructor" && FULLSCREEN_INSTRUCTOR_PREVIEW.includes(screen)) {
    if (screen === "instructor-preview-concept") return <PreviewConceptScreen />;
  }

  if (role === "instructor" && FULLSCREEN_INSTRUCTOR_STUDIO.includes(screen)) {
    if (screen === "instructor-create") return <InstructorStudioScreen />;
  }

  const studentBreadcrumbs = () => {
    if (screen === "student-workspace") {
      return [
        { label: courseTitle, sub: "Classroom", onClick: () => setScreen("student-sets") },
        { label: chapterLabel, sub: "Workspace" },
      ];
    }
    if (screen === "student-concept") {
      return [
        { label: courseTitle, sub: "Classroom", onClick: () => setScreen("student-workspace") },
        { label: "Lesson", sub: "In progress" },
      ];
    }
    return undefined;
  };

  const instructorBreadcrumbs = () => {
    if (
      screen === "instructor-course" ||
      screen === "instructor-preview" ||
      screen === "instructor-preview-concept" ||
      screen === "instructor-challenge"
    ) {
      return [
        { label: courseTitle, sub: "Classroom", onClick: () => setScreen("instructor-home") },
        {
          label: screen === "instructor-challenge" ? "Invite Students" : chapterLabel,
          sub: screen === "instructor-challenge" ? "Join code & link" : "Workspace",
          onClick: screen === "instructor-challenge" ? () => setScreen("instructor-course") : undefined,
        },
      ];
    }
    return undefined;
  };

  const studentContent = (
    <>
      {screen === "student-courses" && <StudentHomeContent />}
      {screen === "student-sets" && <StudentSetsScreen />}
      {screen === "student-workspace" && <StudentWorkspaceScreen />}
      {screen === "student-assistant" && <StudentAssistantChatScreen />}
      {screen === "student-mastery" && <StudentMasteryScreen />}
      {screen === "student-challenge" && <StudentChallengeScreen />}
      {screen === "student-tools" && <StudentToolsScreen />}
      {screen === "student-settings" && <StudentSettingsScreen />}
      {screen === "student-reflection" && <ReflectionScreen />}
      {screen === "student-concept" && <StudentConceptScreen />}
    </>
  );

  const instructorContent = (
    <>
      {screen === "instructor-home" && <InstructorClassroomsScreen />}
      {screen === "instructor-course" && <InstructorCourseModulesScreen />}
      {screen === "instructor-preview" && <PreviewWorkspaceScreen />}
      {screen === "instructor-dashboard" && <TeacherDashboardScreen />}
      {screen === "instructor-challenge" && <InstructorChallengeScreen />}
      {screen === "instructor-settings" && <InstructorSettingsScreen />}
    </>
  );

  if (role === "student" && STUDENT_SHELL_SCREENS.includes(screen)) {
    return (
      <StudyFetchShell
        role="student"
        screen={screen}
        setScreen={setScreen}
        onLogout={() => logout().catch(console.error)}
        userName={userName}
        userInitials={userInitials}
        courseTitle={courseTitle}
        breadcrumbs={studentBreadcrumbs()}
        toast={toast}
        onDocuments={handleDocuments}
        onUpgrade={handleUpgrade}
        fullWidth={screen === "student-concept"}
      >
        {studentContent}
      </StudyFetchShell>
    );
  }

  if (role === "instructor" && INSTRUCTOR_SHELL_SCREENS.includes(screen)) {
    return (
      <StudyFetchShell
        role="instructor"
        screen={screen}
        setScreen={setScreen}
        onLogout={() => logout().catch(console.error)}
        userName={userName}
        userInitials={userInitials}
        courseTitle={courseTitle}
        breadcrumbs={instructorBreadcrumbs()}
        onSwitchView={handleInstructorViewSwitch}
        studentPreviewActive={screen === "instructor-preview" || screen === "instructor-preview-concept"}
        toast={toast}
        onDocuments={handleDocuments}
        onUpgrade={handleUpgrade}
      >
        {instructorContent}
      </StudyFetchShell>
    );
  }

  return null;
}
