import { LogOut } from "lucide-react";
import type { Screen } from "../../types";
import { useApp } from "../../store/AppContext";
import { laic } from "./ui";

type InstructorTab = "editor" | "preview" | "analytics";

function instructorTab(screen: Screen): InstructorTab {
  if (screen === "instructor-dashboard") return "analytics";
  if (screen === "student-concept") return "preview";
  return "editor";
}

export function TopNav() {
  const {
    role,
    screen,
    setScreen,
    logout,
    publishCourse,
    coursePublished,
    openCourseEditor,
    startNewCourse,
  } = useApp();

  if (role === "student") {
    const tabs: { id: Screen; label: string }[] = [
      { id: "student-courses", label: "Courses" },
      { id: "student-concept", label: "Learn" },
      { id: "student-mastery", label: "Mastery" },
    ];
    return (
      <header className={`h-14 border-b ${laic.border} ${laic.bg} flex items-center px-8 gap-8 shrink-0 z-20`}>
        <button
        type="button"
        onClick={() => role === "instructor" ? setScreen("instructor-home") : setScreen("student-courses")}
        className={`text-xl font-bold text-[#314158] ${laic.font} hover:opacity-80 transition-opacity`}
      >
        LAIC.
      </button>
        <nav className="flex items-center gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setScreen(t.id)}
              className={`pb-1 text-xs font-semibold tracking-[1.44px] uppercase transition-colors ${laic.font} ${
                screen === t.id
                  ? "text-[#314158] border-b-2 border-[#615fff]"
                  : "text-[#62748e] hover:text-[#62748e]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          type="button"
          onClick={logout}
          className="w-8 h-8 flex items-center justify-center rounded-full text-[#62748e] hover:bg-white hover:text-[#314158] transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>
    );
  }

  const tab = instructorTab(screen);
  const tabs: { id: InstructorTab; label: string; action: () => void }[] = [
    {
      id: "editor",
      label: "Editor",
      action: () => {
        if (screen === "instructor-create") openCourseEditor();
        else startNewCourse().catch(console.error);
      },
    },
    {
      id: "preview",
      label: "Preview",
      action: () => openCourseEditor(),
    },
    {
      id: "analytics",
      label: "Analytics",
      action: () => setScreen("instructor-dashboard"),
    },
  ];

  return (
    <header className={`h-14 border-b ${laic.border} ${laic.bg} flex items-center px-8 gap-8 shrink-0 z-20`}>
      <button
        type="button"
        onClick={() => role === "instructor" ? setScreen("instructor-home") : setScreen("student-courses")}
        className={`text-xl font-bold text-[#314158] ${laic.font} hover:opacity-80 transition-opacity`}
      >
        LAIC.
      </button>
      <nav className="flex items-center gap-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={t.action}
            className={`pb-1 text-xs font-semibold tracking-[1.44px] uppercase transition-colors ${laic.font} ${
              tab === t.id
                ? "text-[#314158] border-b-2 border-[#615fff]"
                : "text-[#62748e] hover:text-[#62748e]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {!coursePublished && (
          <button
            type="button"
            onClick={() => publishCourse().catch(console.error)}
            className={`${laic.darkBtn} ${laic.font} text-sm px-5 py-2.5`}
          >
            Publish Course
          </button>
        )}
        <button
          type="button"
          onClick={logout}
          className="w-8 h-8 flex items-center justify-center rounded-full text-[#62748e] hover:bg-white hover:text-[#314158] transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
