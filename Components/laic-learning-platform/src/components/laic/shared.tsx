import { Check } from "lucide-react";
import type { MasteryLevel } from "../../types";
import { MASTERY, USER_INITIALS } from "../../constants/ui";

const USER_INITIALS_MAP = USER_INITIALS;

function MasteryBadge({ level }: { level: MasteryLevel }) {
  const { color, label } = MASTERY[level];
  const textColor = level === "not-seen" ? "#94a3b8" : color;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: color + "22", color: textColor }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ProgressBar({ value, color = "#615fff" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = USER_INITIALS_MAP[name] ?? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`${size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"} rounded-full bg-[#eef2ff] text-[#432dd7] flex items-center justify-center font-black shrink-0`}>
      {initials}
    </div>
  );
}

function AIFace({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#eef2ff" stroke="#e0e7ff" strokeWidth="1.5" />
      <circle cx="11.5" cy="13" r="2" fill="#615fff" />
      <circle cx="20.5" cy="13" r="2" fill="#615fff" />
      <circle cx="12" cy="12.5" r="0.7" fill="white" />
      <circle cx="21" cy="12.5" r="0.7" fill="white" />
      <path d="M11 20 Q16 24 21 20" stroke="#615fff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="17" r="2.5" fill="#f6339a" opacity="0.5" />
      <circle cx="23" cy="17" r="2.5" fill="#f6339a" opacity="0.5" />
    </svg>
  );
}

function CheckCircle() {
  return <Check className="w-3 h-3" />;
}

export { MasteryBadge, ProgressBar, Avatar, AIFace, CheckCircle, USER_INITIALS_MAP };
