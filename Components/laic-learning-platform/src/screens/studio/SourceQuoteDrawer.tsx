import { useEffect, useState } from "react";
import type { StudySource } from "../../learning/types";
import { DataAPI } from "../../lib/api";
import { ReferencePdfViewer } from "../../components/ReferencePdfViewer";
import "./studio.css";

export function SourceQuoteDrawer({
  open,
  courseId,
  source,
  onClose,
}: {
  open: boolean;
  courseId: string;
  source: StudySource | null;
  onClose: () => void;
}) {
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdfName, setPdfName] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetPage = source?.page && source.page > 0 ? source.page : 1;

  useEffect(() => {
    if (!open || !courseId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    DataAPI.referencePdfBlob(courseId)
      .then(({ data, name }) => {
        if (cancelled) return;
        setPdfData(data);
        setPdfName(name);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  if (!open || !source) return null;

  return (
    <>
      <div className="studio-scrim show" onClick={onClose} aria-hidden />
      <aside className="studio-drawer show" style={{ width: "min(520px, 94vw)" }} aria-label="Source reference">
        <div className="studio-drawer-h">
          <h3>Source</h3>
          <button type="button" className="studio-drawer-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="studio-drawer-b" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 0 }}>
          <div style={{ padding: "16px 18px 0" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", marginBottom: 8 }}>
              {source.cite || "Course materials"}
              {targetPage ? ` · p.${targetPage}` : ""}
            </div>
            {source.quote ? (
              <blockquote
                style={{
                  margin: 0,
                  padding: "14px 16px",
                  borderLeft: "3px solid var(--teal-d)",
                  background: "var(--panel)",
                  borderRadius: "0 12px 12px 0",
                  fontFamily: "var(--disp)",
                  fontSize: 15,
                  lineHeight: 1.5,
                  fontStyle: "italic",
                }}
              >
                {source.quote}
              </blockquote>
            ) : (
              <p style={{ color: "var(--soft)", fontSize: 14, margin: 0 }}>
                Open the reference PDF at page {targetPage}.
              </p>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 360, borderTop: "1px solid var(--line)" }}>
            <ReferencePdfViewer
              fileData={pdfData}
              fileName={pdfName ?? source.cite}
              targetPage={targetPage}
              loading={loading}
              error={error}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
