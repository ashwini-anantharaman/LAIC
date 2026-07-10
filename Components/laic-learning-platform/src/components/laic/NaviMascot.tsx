export function CatMini({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-label="Navi">
      <circle cx="100" cy="100" r="97" fill="#111827" />
      <g style={{ animation: "catBob 2.8s ease-in-out infinite", transformOrigin: "100px 140px" }}>
        <polygon points="42,82 52,38 80,68" fill="#9B72CF" />
        <polygon points="50,76 57,46 74,67" fill="#C084FC" />
        <polygon points="158,82 148,38 120,68" fill="#9B72CF" />
        <polygon points="150,76 143,46 126,67" fill="#C084FC" />
        <ellipse cx="100" cy="116" rx="68" ry="63" fill="#9B72CF" />
        <circle cx="78" cy="106" r="19" fill="white" />
        <circle cx="80" cy="107" r="10" fill="#1a1a1a" />
        <circle cx="84" cy="102" r="4" fill="white" />
        <circle cx="118" cy="108" r="22" fill="white" stroke="#555" strokeWidth="5" />
        <circle cx="121" cy="109" r="11" fill="#1a1a1a" />
        <circle cx="115" cy="103" r="4" fill="white" opacity="0.9" />
        <rect x="133" y="124" width="9" height="22" rx="4.5" fill="#555" transform="rotate(35,133,124)" />
        <path d="M96 128 Q100 133 104 128 Q100 135 96 128Z" fill="#6B3FA0" />
        <path d="M92 137 Q100 144 108 137" stroke="#6B3FA0" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="62" cy="128" rx="9" ry="6" fill="#EC4899" opacity="0.3" />
        <ellipse cx="138" cy="128" rx="9" ry="6" fill="#EC4899" opacity="0.3" />
      </g>
    </svg>
  );
}
