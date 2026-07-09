import { HelpCircle } from "lucide-react";

export function HelpButton() {
  return (
    <button
      type="button"
      aria-label="Help"
      className="fixed bottom-5 right-5 z-50 w-10 h-10 rounded-full bg-[#432dd7] text-[#312c85] flex items-center justify-center shadow-lg shadow-[#432dd7]/20 hover:bg-[#432dd7] transition-colors"
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}

export function LivePreviewToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#432dd7] text-[#312c85] text-xs px-4 py-2.5 rounded-full shadow-lg">
      Live preview loading, interactions may not be saved
    </div>
  );
}

export function PageShell({
  children,
  showHelp = true,
}: {
  children: React.ReactNode;
  showHelp?: boolean;
}) {
  return (
    <>
      {children}
      {showHelp && <HelpButton />}
    </>
  );
}
