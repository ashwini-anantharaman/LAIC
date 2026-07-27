import type { ReactNode } from "react";

/** A device bezel with a notch and a scrollable white screen surface. */
export function PhoneFrame({ size = "sm", children }: { size?: "sm" | "lg"; children: ReactNode }) {
  const dims = size === "lg" ? { width: 340, height: 720 } : { width: 300, height: 620 };
  return (
    <div
      className="relative shrink-0 rounded-[44px] bg-[#0b0f1a] p-3"
      style={{
        ...dims,
        boxShadow: "0 50px 100px -30px rgba(0,0,0,0.75), inset 0 0 0 2px rgba(255,255,255,0.06)",
      }}
    >
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 h-[26px] w-[120px] -translate-x-1/2 rounded-b-[16px] bg-[#0b0f1a]" />
      <div className="h-full w-full overflow-hidden rounded-[33px] bg-[#0E1320]">
        <div className="scr h-full w-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
