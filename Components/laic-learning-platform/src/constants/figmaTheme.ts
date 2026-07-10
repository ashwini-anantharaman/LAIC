/** Exact design tokens from Figma (Ly10cD7OoMrWTngAnN2nYO) */
export const figma = {
  bg: "#f0f2fa",
  surface: "#ffffff",
  border: "#eef2ff",
  borderStrong: "#e0e7ff",

  text: "#314158",
  textMuted: "#62748e",
  textLabel: "#90a1b9",
  heading: "#312c85",

  indigo: "#432dd7",
  indigoBright: "#615fff",
  indigoSoft: "#eef2ff",
  indigoText: "#7c86ff",

  pink: "#f6339a",
  pinkSoft: "#ff637e",

  searchPlaceholder: "#a3b3ff",

  btnPrimary: "#432dd7",
  btnPrimaryHover: "#3730a3",

  avatarGradient: "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(139, 92, 246) 100%)",
  avatarGradientStudent: "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(236, 72, 153) 100%)",
  logoGradient: "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(139, 92, 246) 100%)",
} as const;

export const figmaMastery = {
  mastered: { color: "#10b981", soft: "#ecfdf5", label: "Mastered" },
  understood: { color: "#f97316", soft: "#fff7ed", label: "Understood" },
  practiced: { color: "#f59e0b", soft: "#fffbeb", label: "Practiced" },
  exposed: { color: "#3b82f6", soft: "#eff6ff", label: "Exposed" },
  "not-seen": { color: "#94a3b8", soft: "#f1f5f9", label: "Not seen" },
} as const;
