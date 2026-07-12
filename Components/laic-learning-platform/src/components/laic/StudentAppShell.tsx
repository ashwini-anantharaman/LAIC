import type { ReactNode } from "react";
import { useApp } from "../../store/AppContext";
import { StudentSidebar } from "./StudentSidebar";
import { AppTopBar } from "./AppTopBar";
import { FloatingAIButton } from "./FloatingAIButton";
import { student, studentPageTitle } from "./studentTheme";

export function StudentAppShell({
  children,
  hideTopBar = false,
}: {
  children: ReactNode;
  hideTopBar?: boolean;
}) {
  const { screen, courseTitle, concepts, activeConceptId } = useApp();
  const conceptName = concepts.find((c) => c.id === activeConceptId)?.name;
  const title = studentPageTitle(screen, { courseTitle, conceptName });

  return (
    <div className={`flex h-screen overflow-hidden ${student.bg} ${student.font}`}>
      <StudentSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!hideTopBar && <AppTopBar title={title} />}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">{children}</main>
      </div>
      <FloatingAIButton />
    </div>
  );
}
