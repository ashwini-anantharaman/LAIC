import type { MasteryLevel } from "../../types";
import { figma, figmaMastery } from "../../constants/figmaTheme";

/** Figma v2 student shell — exact tokens from node 9-6029 */
export const student = {
  bg: "bg-[#f0f2fa]",
  sidebar: "bg-white border-r border-[#eef2ff]",
  font: "font-['Nunito',sans-serif]",
  heading: "text-[#312c85] font-black text-lg",
  navActive: "bg-[#eef2ff] text-[#432dd7]",
  navIdle: "text-[#62748e] hover:bg-[#f8fafc]",
  navIndicator: "bg-[#615fff]",
  topBar: "bg-white/95 border-b border-[#eef2ff] shadow-sm",
  searchBg: "bg-[#eef2ff]",
  card: "bg-white rounded-2xl shadow-sm",
  cardHeader: "bg-[#eef2ff] border-b border-[#e0e7ff]",
  cardHeaderText: "text-[#432dd7] font-black text-sm",
  rowBorder: "border-b border-[#f8fafc]",
  text: "text-[#314158]",
  textMuted: "text-[#62748e]",
  accent: "text-[#432dd7]",
  logout: "text-[#ff637e]",
  btn: "bg-[#432dd7] text-white hover:bg-[#3730a3]",
} as const;

export const MASTERY_STAT_COLOR: Record<MasteryLevel, string> = {
  mastered: figmaMastery.mastered.color,
  understood: figmaMastery.understood.color,
  practiced: figmaMastery.practiced.color,
  exposed: figmaMastery.exposed.color,
  "not-seen": figmaMastery["not-seen"].color,
};

export const MASTERY_BADGE_BG: Record<MasteryLevel, string> = {
  mastered: figmaMastery.mastered.soft,
  understood: figmaMastery.understood.soft,
  practiced: figmaMastery.practiced.soft,
  exposed: figmaMastery.exposed.soft,
  "not-seen": figmaMastery["not-seen"].soft,
};

export function masteryProgress(level: MasteryLevel): number {
  switch (level) {
    case "mastered": return 100;
    case "understood": return 75;
    case "practiced": return 50;
    case "exposed": return 25;
    default: return 5;
  }
}

export function studentPageTitle(
  screen: string,
  opts: { courseTitle?: string; conceptName?: string }
): string {
  switch (screen) {
    case "student-mastery": return "My Mastery";
    case "student-courses": return "Dashboard";
    case "student-concept": return opts.conceptName ?? "AI Tutor";
    case "student-reflection": return "Reflection";
    default: return opts.courseTitle ?? "LAIC";
  }
}

export { figma };
