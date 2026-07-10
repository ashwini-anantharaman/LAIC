import type { StudioCourseData } from "../../learning/types";
import "./studio.css";

export type StudioPublishModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseTitle: string;
  course: StudioCourseData;
  publishing?: boolean;
  onPublish?: () => void;
};

export function StudioPublishModal({
  open,
  onOpenChange,
  courseTitle,
  course,
  publishing = false,
  onPublish,
}: StudioPublishModalProps) {
  if (!open) return null;

  const blockCount = course.pages.reduce((total, page) => total + page.blocks.length, 0);

  return (
    <div className="studio-pub on" role="dialog" aria-modal="true">
      <div className="studio-pubcard">
        <div style={{ fontSize: 40 }}>🎉</div>
        <h2>Ready to publish</h2>
        <p style={{ color: "var(--soft)", fontSize: 14 }}>
          {courseTitle} · {course.pages.length} pages · {blockCount} blocks · policy {course.policy}
        </p>
        <div className="studio-publist">
          {course.pages.map((page, index) => (
            <div key={page.id} className="r">
              <span>
                {index + 1}. {page.title}
              </span>
              <span className="c">{page.blocks.length} blocks</span>
            </div>
          ))}
        </div>
        {onPublish ? (
          <button type="button" className="studio-btn primary" style={{ width: "100%" }} disabled={publishing} onClick={onPublish}>
            {publishing ? "Publishing…" : "Publish to students"}
          </button>
        ) : null}
        <button type="button" className="studio-modal-x" onClick={() => onOpenChange(false)}>
          Keep editing
        </button>
      </div>
    </div>
  );
}
