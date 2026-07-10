import { useEffect, useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Minus, Plus, FileText, PanelLeftClose, ExternalLink } from "lucide-react";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDF_OPTIONS = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

interface ReferencePdfViewerProps {
  fileData: Uint8Array | null;
  fileName?: string;
  targetPage: number;
  onPageCount?: (count: number) => void;
  loading?: boolean;
  error?: string | null;
  onCollapse?: () => void;
}

export function ReferencePdfViewer({
  fileData,
  fileName,
  targetPage,
  onPageCount,
  loading,
  error,
  onCollapse,
}: ReferencePdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);

  const file = useMemo(
    () => (fileData ? { data: fileData.slice(0) } : null),
    [fileData]
  );

  const openUrl = useMemo(() => {
    if (!fileData) return null;
    const blob = new Blob([fileData], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }, [fileData]);

  useEffect(() => {
    return () => {
      if (openUrl) URL.revokeObjectURL(openUrl);
    };
  }, [openUrl]);

  useEffect(() => {
    if (targetPage >= 1) setCurrentPage(targetPage);
  }, [targetPage]);

  useEffect(() => {
    setRenderError(null);
  }, [fileData]);

  const clampedPage = numPages ? Math.min(Math.max(1, currentPage), numPages) : currentPage;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/70 text-sm">
        Loading reference PDF…
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/60 gap-3 p-8 text-center">
        <FileText className="w-10 h-10 opacity-50" />
        <p className="text-sm font-medium">{error ?? "No reference PDF uploaded for this course."}</p>
        <p className="text-xs opacity-70">Your instructor can upload a PDF as the main study reference.</p>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="mt-2 text-xs text-white/80 hover:text-white underline"
          >
            Hide PDF panel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 bg-[#3d4043] border-b border-black/20 shrink-0 gap-2">
        <span className="text-xs text-white/80 truncate min-w-0 flex-1" title={fileName}>
          {fileName ?? "Reference PDF"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-black/25 rounded-lg px-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(1)))}
              className="p-1.5 text-white/80 hover:text-white"
              aria-label="Zoom out"
            >
              <Minus size={14} />
            </button>
            <span className="text-[11px] text-white/70 w-10 text-center">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(1)))}
              className="p-1.5 text-white/80 hover:text-white"
              aria-label="Zoom in"
            >
              <Plus size={14} />
            </button>
          </div>
          {numPages > 0 && (
            <span className="text-[11px] text-white/70 tabular-nums hidden sm:inline">
              {clampedPage} of {numPages}
            </span>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-white/80 hover:text-white"
              aria-label="Open PDF in new tab"
              title="Open in new tab"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="p-1.5 text-white/80 hover:text-white border-l border-white/20 pl-2 ml-0.5"
              aria-label="Collapse PDF panel"
              title="Collapse PDF"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#525659] flex justify-center py-4">
        {renderError ? (
          <div className="text-white/80 text-sm py-12 px-6 text-center max-w-sm space-y-3">
            <p>{renderError}</p>
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
              >
                <ExternalLink size={12} />
                Open PDF in browser
              </a>
            )}
          </div>
        ) : (
          <Document
            file={file}
            options={PDF_OPTIONS}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              onPageCount?.(n);
              setCurrentPage(Math.min(Math.max(1, targetPage), n));
              setRenderError(null);
            }}
            onLoadError={(err) => {
              console.error("[ReferencePdfViewer]", err);
              setRenderError(
                err?.message?.includes("valid PDF")
                  ? "This file is not a valid PDF. Ask your instructor to re-upload the original PDF."
                  : "Could not display this PDF. Try opening it in a new tab or ask your instructor to re-upload."
              );
            }}
            loading={<div className="text-white/60 text-sm py-12">Rendering PDF…</div>}
            error={
              <div className="text-white/70 text-sm py-12 px-6 text-center">
                Could not display this PDF. Try refreshing the page.
              </div>
            }
          >
            <Page
              key={`${clampedPage}-${scale}`}
              pageNumber={clampedPage}
              scale={scale}
              className="shadow-2xl"
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        )}
      </div>
    </div>
  );
}
