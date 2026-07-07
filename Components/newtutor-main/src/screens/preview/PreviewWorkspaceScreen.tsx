import { PreviewModeBanner } from "./PreviewModeBanner";
import { PreviewWorkspaceContent } from "./PreviewWorkspaceContent";

/** Instructor-only workspace preview — separate from StudentWorkspaceScreen. */
export function PreviewWorkspaceScreen() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PreviewModeBanner />
      <PreviewWorkspaceContent />
    </div>
  );
}
