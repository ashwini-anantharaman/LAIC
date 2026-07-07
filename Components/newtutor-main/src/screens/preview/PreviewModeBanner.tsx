import { Glasses } from "lucide-react";
import { sf } from "../../constants/studyFetchTheme";
import { useApp } from "../../store/AppContext";

export function PreviewModeBanner() {
  const { coursePublished } = useApp();

  return (
    <div
      className="rounded-2xl px-5 py-3 flex items-center gap-3 text-sm mb-6"
      style={{ backgroundColor: sf.blueBanner, color: sf.blue }}
    >
      <Glasses size={18} className="shrink-0" />
      <div>
        <p className="font-semibold">Student preview</p>
        <p className="text-xs opacity-90">
          {coursePublished
            ? "This is what enrolled students see after you publish."
            : "Draft preview — publish the course before students can access it."}
        </p>
      </div>
    </div>
  );
}
