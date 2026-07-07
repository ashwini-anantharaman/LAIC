import {
  Brain, LayoutDashboard, BookOpen, Trophy, Bot, Settings, LogOut,
} from "lucide-react";
import type { Screen } from "../../types";
import { useApp } from "../../store/AppContext";
import { USER_INITIALS } from "../../constants/ui";
import { figma, student } from "./studentTheme";

type NavId = "dashboard" | "courses" | "mastery" | "tutor";

const NAV: { id: NavId; screen: Screen; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", screen: "student-courses", label: "Dashboard", icon: LayoutDashboard },
  { id: "courses", screen: "student-courses", label: "Courses", icon: BookOpen },
  { id: "mastery", screen: "student-mastery", label: "Mastery", icon: Trophy },
  { id: "tutor", screen: "student-concept", label: "AI Tutor", icon: Bot },
];

function isActive(screen: Screen, nav: NavId): boolean {
  if (nav === "mastery") return screen === "student-mastery";
  if (nav === "tutor") return screen === "student-concept";
  if (nav === "dashboard" || nav === "courses") return screen === "student-courses";
  return false;
}

export function StudentSidebar() {
  const { screen, setScreen, logout, learner } = useApp();
  const initials = USER_INITIALS[learner.name] ?? learner.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside className={`w-[220px] shrink-0 flex flex-col h-full ${student.sidebar} ${student.font}`}>
      <div className="px-4 pt-6 pb-4 flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-[20px] flex items-center justify-center shrink-0"
          style={{ backgroundImage: figma.logoGradient }}
        >
          <Brain className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-black text-[#312c85] tracking-tight">LAIC</span>
        <span className="w-2 h-2 rounded-full bg-[#f6339a] mb-3 shrink-0" />
      </div>

      <nav className="flex-1 px-4 pt-2">
        <p className="text-xs font-bold uppercase tracking-[1.2px] text-[#90a1b9] px-3 mb-2">Learn</p>
        <div className="space-y-1">
          {NAV.map(({ id, screen: target, label, icon: Icon }) => {
            const active = isActive(screen, id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setScreen(target)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[20px] text-sm font-bold transition-colors ${
                  active ? student.navActive : student.navIdle
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {active && (
                  <span className={`w-1.5 h-4 rounded-full ${student.navIndicator}`} />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="px-4 pt-4 pb-6 border-t border-[#f1f5f9] mt-auto space-y-1">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[20px] text-sm font-bold text-[#90a1b9] hover:bg-[#f8fafc] transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          type="button"
          onClick={logout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[20px] text-sm font-bold ${student.logout} hover:bg-[#fff1f2] transition-colors`}
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
        <div className="mt-3 flex items-center gap-2.5 px-3 py-3 rounded-2xl bg-[#eef2ff]">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
            style={{ backgroundImage: figma.avatarGradientStudent }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#312c85] truncate">{learner.name}</p>
            <p className="text-xs font-semibold text-[#7c86ff]">Student</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
