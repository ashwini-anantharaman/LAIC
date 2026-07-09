/** Shared aesthetic pastel palette for LAIC */
export const pastel = {
  bg: "#faf7ff",
  bgAlt: "#f5f0ff",
  surface: "#ffffff",
  border: "#e8e2f4",
  borderSoft: "#f0ebff",

  text: "#5c5578",
  textMuted: "#9d94b8",
  textHeading: "#6b6294",
  textSoft: "#7c7399",

  lavender: "#c4b5fd",
  lavenderDeep: "#a78bfa",
  lavenderSoft: "#ede9fe",
  lavenderMuted: "#ddd6fe",
  lavenderText: "#6d5b9e",

  rose: "#f0abce",
  roseDeep: "#e879c0",
  roseSoft: "#fce7f3",

  mint: "#6ee7b7",
  mintDeep: "#5eead4",
  mintSoft: "#d1fae5",

  peach: "#fdba74",
  peachSoft: "#ffedd5",

  sky: "#93c5fd",
  skySoft: "#dbeafe",

  butter: "#fde68a",
  butterSoft: "#fef9c3",

  slate: "#cbd5e1",
  slateSoft: "#f1f5f9",

  coral: "#fca5a5",
  coralText: "#e879a9",

  btn: "#ddd6fe",
  btnHover: "#c4b5fd",
  btnText: "#5b4b8a",
} as const;

export const masteryPastel = {
  mastered: { color: "#6ee7b7", soft: "#d1fae5", label: "Mastered" },
  understood: { color: "#fdba74", soft: "#ffedd5", label: "Understood" },
  practiced: { color: "#fde68a", soft: "#fef9c3", label: "Practiced" },
  exposed: { color: "#93c5fd", soft: "#dbeafe", label: "Exposed" },
  "not-seen": { color: "#cbd5e1", soft: "#f1f5f9", label: "Not seen" },
} as const;
