import { useState, type ReactNode } from "react";
import {
  Home, BookOpen, Calendar, LayoutGrid, GraduationCap, ListChecks, MessageCircle,
  School, Wrench, PanelLeftClose, PanelLeftOpen, UserPlus,
  Settings, LogOut, Users,
} from "lucide-react";
import type { Screen } from "../../types";
import { sf } from "../../constants/studyFetchTheme";
import { OwlAnim } from "../owlwise/primitives";
import { StudyFetchTopBar } from "./StudyFetchTopBar";
import { StudentCoachPanel } from "./StudentCoachPanel";
import { useApp } from "../../store/AppContext";

type StudentNavId = "home" | "my-sets" | "calendar" | "practice-tools" | "your-classes" | "study-plan" | "chat";

type NavItem = {
  icon: typeof Home;
  label: string;
  navId: StudentNavId | string;
  screen?: Screen;
};

const STUDENT_PRIMARY: NavItem[] = [
  { icon: Home, label: "Home", navId: "home", screen: "student-courses" },
  { icon: BookOpen, label: "My Sets", navId: "my-sets", screen: "student-sets" },
  { icon: Calendar, label: "Challenge", navId: "calendar", screen: "student-challenge" },
  { icon: LayoutGrid, label: "Practice Tools", navId: "practice-tools", screen: "student-tools" },
  { icon: GraduationCap, label: "Your Classes", navId: "your-classes", screen: "student-workspace" },
];

const STUDENT_TOOLS: NavItem[] = [
  { icon: ListChecks, label: "Study Plan", navId: "study-plan", screen: "student-mastery" },
  { icon: MessageCircle, label: "Coach", navId: "chat", screen: "student-assistant" },
];

const INSTRUCTOR_NAV: NavItem[] = [
  { icon: School, label: "Classrooms", navId: "classrooms", screen: "instructor-home" },
  { icon: UserPlus, label: "Invite Students", navId: "invite-students", screen: "instructor-challenge" },
  { icon: Wrench, label: "Teacher Tools", navId: "teacher-tools", screen: "instructor-create" },
  { icon: LayoutGrid, label: "Practice Tools", navId: "practice-tools", screen: "instructor-dashboard" },
];

function activeStudentNav(screen: Screen): StudentNavId | null {
  const map: Partial<Record<Screen, StudentNavId>> = {
    "student-courses": "home",
    "student-sets": "my-sets",
    "student-workspace": "your-classes",
    "student-concept": "your-classes",
    "student-challenge": "calendar",
    "student-tools": "practice-tools",
    "student-assistant": "chat",
    "student-mastery": "study-plan",
  };
  return map[screen] ?? null;
}

function activeInstructorNav(screen: Screen): string | null {
  if (
    screen === "instructor-home" ||
    screen === "instructor-course" ||
    screen === "instructor-preview" ||
    screen === "instructor-preview-concept"
  ) {
    return "classrooms";
  }
  if (screen === "instructor-challenge") return "invite-students";
  if (screen === "instructor-create") return "teacher-tools";
  if (screen === "instructor-dashboard") return "practice-tools";
  return null;
}

export function StudyFetchSidebar({
  role,
  screen,
  setScreen,
  onLogout,
  userName,
  courseTitle,
  onSwitchView,
  studentPreviewActive,
}: {
  role: "student" | "instructor";
  screen: Screen;
  setScreen: (s: Screen) => void;
  onLogout: () => void;
  userName: string;
  courseTitle?: string;
  onSwitchView?: () => void;
  studentPreviewActive?: boolean;
}) {
  const { setStudentToolsTab, showToast, openCourseEditor, courseId, coachPanelOpen, toggleCoachPanel, setCoachPanelOpen } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const activeNavId = role === "student" ? activeStudentNav(screen) : activeInstructorNav(screen);

  const go = (item: NavItem) => {
    if (item.navId === "your-classes") {
      if (!courseId) {
        showToast("Open a course from My Sets first.");
        setScreen("student-sets");
        return;
      }
      setScreen("student-workspace");
      return;
    }
    if (item.navId === "chat") {
      if (!courseId) {
        showToast("Open a course from My Sets first.");
        setScreen("student-sets");
        return;
      }
      toggleCoachPanel();
      return;
    }
    if (item.screen === "student-workspace" && role === "student" && !courseId) {
      showToast("Join a course first.");
      setScreen("student-sets");
      return;
    }
    if (role === "instructor" && item.screen === "instructor-create") {
      openCourseEditor();
      return;
    }
    if (role === "instructor" && item.screen === "instructor-challenge") {
      if (!courseId) {
        showToast("Open a classroom first to invite students.");
        setScreen("instructor-home");
        return;
      }
      setScreen("instructor-challenge");
      return;
    }
    if (item.screen === "student-tools") setStudentToolsTab("quizzes");
    if (item.screen) setScreen(item.screen);
  };

  const navBtn = (item: NavItem) => {
    const active = item.navId === "chat" ? coachPanelOpen : activeNavId === item.navId;
    return (
      <button
        key={item.navId}
        type="button"
        onClick={() => go(item)}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors ${
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
        } ${active ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
        style={active ? { backgroundColor: sf.blue } : undefined}
      >
        <item.icon size={18} className={`shrink-0 ${active ? "text-white" : "text-gray-400"}`} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  const primary = role === "student" ? STUDENT_PRIMARY : INSTRUCTOR_NAV;

  return (
    <aside
      className="shrink-0 flex flex-col bg-white border-r h-full transition-all overflow-hidden relative z-20"
      style={{ width: collapsed ? 72 : sf.sidebarWidth, minWidth: collapsed ? 72 : sf.sidebarWidth, borderColor: sf.border }}
    >
      <div className={`pt-5 pb-3 flex items-center gap-2 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <OwlAnim className="w-8 h-8 object-contain shrink-0" />
        {!collapsed ? (
          <>
            <span className="text-base font-black text-gray-900 tracking-tight truncate">OWLWISE</span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="absolute top-5 right-1 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}
      </div>

      {!collapsed && role === "instructor" && onSwitchView && (
        <div className="px-3 mb-3">
          <button
            type="button"
            onClick={onSwitchView}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border min-w-0"
            style={{
              backgroundColor: studentPreviewActive ? sf.blue : sf.blueLight,
              borderColor: studentPreviewActive ? sf.blue : "#BFDBFE",
              color: studentPreviewActive ? "#fff" : sf.blue,
            }}
          >
            <Users size={16} className="shrink-0" />
            <span className="truncate">
              {studentPreviewActive ? "Exit student preview" : "Switch to student view"}
            </span>
          </button>
        </div>
      )}

      {collapsed && role === "instructor" && onSwitchView && (
        <div className="px-2 mb-2">
          <button
            type="button"
            onClick={onSwitchView}
            title={studentPreviewActive ? "Exit student preview" : "Student preview"}
            className="w-full flex items-center justify-center p-2.5 rounded-xl border"
            style={{
              backgroundColor: studentPreviewActive ? sf.blue : sf.blueLight,
              borderColor: studentPreviewActive ? sf.blue : "#BFDBFE",
              color: studentPreviewActive ? "#fff" : sf.blue,
            }}
          >
            <Users size={16} />
          </button>
        </div>
      )}

      <nav className={`flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden ${collapsed ? "px-2" : "px-3"}`}>
        {primary.map((item) => navBtn(item))}
        {role === "student" && !collapsed && (
          <>
            <div className="my-3 border-t" style={{ borderColor: sf.border }} />
            {STUDENT_TOOLS.map((item) => navBtn(item))}
          </>
        )}
        {role === "student" && collapsed && (
          <>
            <div className="my-2 border-t" style={{ borderColor: sf.border }} />
            {STUDENT_TOOLS.map((item) => navBtn(item))}
          </>
        )}
      </nav>

      {role === "student" && !collapsed && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => { setStudentToolsTab("notes"); setScreen("student-tools"); }}
            className="w-full text-left px-2 py-1 rounded-lg hover:bg-gray-50"
          >
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Your Notes</p>
            <p className="text-xs text-gray-400">
              {courseTitle ? `View notes for ${courseTitle}` : "Select a course to view notes."}
            </p>
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="px-3 pb-4 pt-2 border-t space-y-1 shrink-0" style={{ borderColor: sf.border }}>
          <button
            type="button"
            onClick={() => setScreen(role === "student" ? "student-settings" : "instructor-settings")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
          >
            <Settings size={16} className="shrink-0" />
            Settings
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
          >
            <LogOut size={16} className="shrink-0" />
            Logout
          </button>
          <p className="text-xs text-gray-400 px-3 truncate">{userName}</p>
        </div>
      )}

      {collapsed && (
        <div className="px-2 pb-4 pt-2 border-t space-y-1 shrink-0" style={{ borderColor: sf.border }}>
          <button
            type="button"
            title="Settings"
            onClick={() => setScreen(role === "student" ? "student-settings" : "instructor-settings")}
            className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 hover:bg-gray-50"
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            title="Logout"
            onClick={onLogout}
            className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 hover:bg-gray-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}

export function StudyFetchShell({
  role,
  screen,
  setScreen,
  onLogout,
  userName,
  userInitials,
  courseTitle,
  breadcrumbs,
  onSwitchView,
  onDocuments,
  onUpgrade,
  children,
  rightRail,
  fullWidth = false,
  toast,
  studentPreviewActive,
}: {
  role: "student" | "instructor";
  screen: Screen;
  setScreen: (s: Screen) => void;
  onLogout: () => void;
  userName: string;
  userInitials: string;
  courseTitle?: string;
  breadcrumbs?: { label: string; sub?: string; onClick?: () => void }[];
  onSwitchView?: () => void;
  onDocuments?: () => void;
  onUpgrade?: () => void;
  children: ReactNode;
  rightRail?: ReactNode;
  fullWidth?: boolean;
  toast?: string | null;
  studentPreviewActive?: boolean;
}) {
  return (
    <div className="h-screen flex overflow-hidden relative" style={{ backgroundColor: sf.bg, fontFamily: sf.font }}>
      <StudyFetchSidebar
        role={role}
        screen={screen}
        setScreen={setScreen}
        onLogout={onLogout}
        userName={userName}
        courseTitle={courseTitle}
        onSwitchView={onSwitchView}
        studentPreviewActive={studentPreviewActive}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-0">
        <StudyFetchTopBar
          breadcrumbs={breadcrumbs}
          userInitials={userInitials}
          onDocuments={onDocuments}
          onUpgrade={onUpgrade}
          onSwitchView={onSwitchView}
          studentPreviewActive={studentPreviewActive}
        />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <main className={`flex-1 min-h-0 flex flex-col ${fullWidth ? "overflow-hidden" : "overflow-y-auto p-6"}`}>{children}</main>
          {role === "student" && <StudentCoachPanel />}
          {rightRail && (
            <aside className="w-[300px] shrink-0 border-l overflow-y-auto p-4 space-y-4" style={{ borderColor: sf.border, backgroundColor: sf.bg }}>
              {rightRail}
            </aside>
          )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
