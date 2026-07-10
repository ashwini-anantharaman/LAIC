import type { ReactNode } from "react";
import { InstructorSidebar } from "./InstructorSidebar";
import { AppTopBar } from "./AppTopBar";
import { FloatingAIButton } from "./FloatingAIButton";
import { student } from "./studentTheme";

function instructorPageTitle(screen: string): string {
  switch (screen) {
    case "instructor-home": return "Overview";
    case "instructor-create": return "Create";
    case "instructor-dashboard": return "Analytics";
    default: return "LAIC";
  }
}

export function InstructorAppShell({
  children,
  screen,
}: {
  children: ReactNode;
  screen: string;
}) {
  return (
    <div className={`flex h-screen overflow-hidden ${student.bg} ${student.font}`}>
      <InstructorSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppTopBar title={instructorPageTitle(screen)} />
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">{children}</main>
      </div>
      <FloatingAIButton />
    </div>
  );
}
