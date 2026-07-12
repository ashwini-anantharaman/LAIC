export function IconInteractive({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <ellipse cx="11" cy="12" rx="8" ry="7" fill="white" fillOpacity={active ? 1 : 0.4} />
      <ellipse cx="8" cy="12.5" rx="2.5" ry="2.5" fill={active ? "#161618" : "#555"} />
      <ellipse cx="14" cy="12.5" rx="2.5" ry="2.5" fill={active ? "#161618" : "#555"} />
      <path
        d="M9 9.5c0-1.1.9-2 2-2s2 .9 2 2"
        stroke={active ? "#161618" : "#555"}
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="8.5" cy="12" r="0.8" fill="white" />
      <circle cx="14.5" cy="12" r="0.8" fill="white" />
    </svg>
  );
}

export function IconSummary({ active, dark = false }: { active: boolean; dark?: boolean }) {
  const c = dark ? "#2c0312" : "white";
  const op = active ? 1 : 0.4;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke={c} strokeOpacity={op} strokeWidth="1.5" fill="none" />
      <line x1="6" y1="6" x2="14" y2="6" stroke={c} strokeOpacity={op} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="9" x2="14" y2="9" stroke={c} strokeOpacity={op} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="12" x2="11" y2="12" stroke={c} strokeOpacity={op} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconNarrative({ active, dark = false }: { active: boolean; dark?: boolean }) {
  const c = dark ? "#2c0312" : "white";
  const op = active ? 1 : 0.4;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke={c} strokeOpacity={op} strokeWidth="1.5" fill="none" />
      <ellipse cx="10" cy="10" rx="3" ry="7.5" stroke={c} strokeOpacity={op} strokeWidth="1" fill="none" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" stroke={c} strokeOpacity={op} strokeWidth="1" />
      <line x1="3.5" y1="7" x2="16.5" y2="7" stroke={c} strokeOpacity={op} strokeWidth="0.8" />
      <line x1="3.5" y1="13" x2="16.5" y2="13" stroke={c} strokeOpacity={op} strokeWidth="0.8" />
    </svg>
  );
}
