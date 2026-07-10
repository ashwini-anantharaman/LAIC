import { Bell, Search } from "lucide-react";
import { student } from "./studentTheme";

export function StudentTopBar({ title }: { title: string }) {
  return (
    <header className={`h-[69px] shrink-0 flex items-center gap-4 px-6 ${student.topBar}`}>
      <h1 className={`flex-1 min-w-0 ${student.heading} ${student.font}`}>{title}</h1>
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full w-56 ${student.searchBg}`}>
        <Search className="w-4 h-4 text-[#432dd7] shrink-0" />
        <input
          type="search"
          placeholder="Search your course..."
          className="flex-1 bg-transparent text-sm font-semibold text-[#314158] placeholder:text-[#432dd7] focus:outline-none min-w-0"
        />
      </div>
      <button
        type="button"
        className={`relative w-9 h-9 rounded-full ${student.searchBg} flex items-center justify-center text-[#62748e] hover:bg-[#432dd7] transition-colors`}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f6339a] border-2 border-white rounded-full" />
      </button>
    </header>
  );
}
