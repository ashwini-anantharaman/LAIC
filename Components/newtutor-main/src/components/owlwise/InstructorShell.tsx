import type { ReactNode } from "react";
import { BookOpen, BarChart2, Trophy, Settings, LogOut } from "lucide-react";
import type { Screen } from "../../types";
import { OwlAnim } from "./primitives";
import { owlwise } from "../../constants/owlwiseTheme";

const NAV: { screen: Screen; label: string; icon: typeof BookOpen }[] = [
  { screen: "instructor-create", label: "Lessons", icon: BookOpen },
  { screen: "instructor-dashboard", label: "Dashboard", icon: BarChart2 },
  { screen: "instructor-challenge", label: "Challenge Details", icon: Trophy },
  { screen: "instructor-settings", label: "Settings", icon: Settings },
];

export function InstructorShell({
  screen,
  setScreen,
  onLogout,
  userName,
  userInitials,
  title,
  children,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  onLogout: () => void;
  userName: string;
  userInitials: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: owlwise.bg }}
    >
      <aside
        className="w-[220px] shrink-0 flex flex-col text-white"
        style={{ backgroundColor: "#7c2020" }}
      >
        <div className="px-5 pt-6 pb-4 flex items-center gap-2">
          <OwlAnim className="w-9 h-9 object-contain" />
          <span className="text-lg font-bold tracking-tight">Owlwise</span>
        </div>

        <p className="px-5 text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Teach</p>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ screen: target, label, icon: Icon }) => {
            const active = screen === target || (screen === "instructor-home" && target === "instructor-create");
            return (
              <button
                key={target}
                type="button"
                onClick={() => setScreen(target)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 pb-4 space-y-1">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
          <div className="mx-2 mt-2 p-3 rounded-xl bg-white/10 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: owlwise.burgundy }}
            >
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{userName}</p>
              <p className="text-[11px] text-white/50">Instructor</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="sticky top-0 z-20 px-8 py-4 border-b flex items-center justify-between"
          style={{ backgroundColor: owlwise.bg, borderColor: "#e8ddd6" }}
        >
          <h1 className="text-lg font-bold" style={{ color: owlwise.heading }}>
            {title}
          </h1>
        </header>
        <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
      </div>
    </div>
  );
}
