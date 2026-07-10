import {
  BookOpen, BarChart2, Settings, LogOut, Search, Bell, Wrench, Trophy,
} from "lucide-react";
import type { Screen, Role } from "../../types";
import { useApp } from "../../store/AppContext";
import { CatMini } from "./NaviMascot";

export const FIGMA_BG = "#F0F2FA";
export const FIGMA_FONT = { fontFamily: "'Nunito', system-ui, sans-serif" } as const;

type NavItem = { icon: typeof BookOpen; label: string; target: Screen };

export function FigmaSidebar({
  role,
  screen,
  setScreen,
  onLogout,
  userName,
  userInitials,
}: {
  role: Role;
  screen: Screen;
  setScreen: (s: Screen) => void;
  onLogout: () => void;
  userName: string;
  userInitials: string;
}) {
  const { openCourseEditor } = useApp();

  const studentNav: NavItem[] = [
    { icon: BookOpen, label: "Lessons", target: "student-concept" },
    { icon: BarChart2, label: "Student Dashboard", target: "student-mastery" },
    { icon: Trophy, label: "Challenge Details", target: "student-challenge" },
    { icon: Wrench, label: "Tools", target: "student-tools" },
  ];
  const instructorNav: NavItem[] = [
    { icon: BookOpen, label: "Lessons", target: "instructor-create" },
    { icon: BarChart2, label: "Dashboard", target: "instructor-dashboard" },
    { icon: Trophy, label: "Challenge Details", target: "instructor-challenge" },
  ];
  const nav = role === "student" ? studentNav : instructorNav;
  const settingsTarget: Screen = role === "student" ? "student-settings" : "instructor-settings";

  const go = (target: Screen) => {
    if (role === "instructor" && target === "instructor-create") {
      openCourseEditor();
    }
    setScreen(target);
  };

  const isActive = (target: Screen) => {
    if (target === "instructor-create" && screen === "instructor-home") return true;
    return screen === target;
  };

  return (
    <aside
      className="w-[220px] h-full bg-white flex flex-col py-6 px-4 border-r border-indigo-50"
      style={FIGMA_FONT}
    >
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <CatMini size={36} />
        <span className="text-xl font-black text-indigo-900">LAIC</span>
        <span className="w-2 h-2 rounded-full bg-pink-500 mb-3" />
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">
          {role === "student" ? "Learn" : "Teach"}
        </p>
        {nav.map((item) => {
          const active = isActive(item.target);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => go(item.target)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                active
                  ? "text-indigo-700 bg-indigo-50"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <item.icon className={`w-4.5 h-4.5 ${active ? "text-indigo-600" : "text-slate-400"}`} />
              {item.label}
              {active && <span className="ml-auto w-1.5 h-4 rounded-full bg-indigo-500" />}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 mt-4 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setScreen(settingsTarget)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all w-full ${
            screen === settingsTarget
              ? "text-indigo-700 bg-indigo-50"
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-400 hover:bg-rose-50 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
        <div className="flex items-center gap-2.5 px-3 py-3 mt-2 bg-indigo-50 rounded-2xl">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
            style={{ background: "linear-gradient(135deg,#6366F1,#EC4899)" }}
          >
            {userInitials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-indigo-900 truncate">{userName}</p>
            <p className="text-xs text-indigo-400 font-semibold">{role === "student" ? "Student" : "Instructor"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function FigmaTopBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 bg-white/95 backdrop-blur-md border-b border-indigo-50 shadow-sm">
      <h1 className="text-lg font-black text-indigo-900 flex-1">{title}</h1>
      <div className="flex items-center gap-2 bg-indigo-50 rounded-full px-4 py-2 w-56">
        <Search className="w-4 h-4 text-indigo-300" />
        <input
          placeholder="Search your course..."
          className="bg-transparent text-sm font-semibold text-indigo-700 placeholder:text-indigo-300 focus:outline-none flex-1"
        />
      </div>
      <button
        type="button"
        className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center relative hover:bg-indigo-100 transition-colors"
      >
        <Bell className="w-4 h-4 text-indigo-500" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-pink-500 border-2 border-white" />
      </button>
    </div>
  );
}
