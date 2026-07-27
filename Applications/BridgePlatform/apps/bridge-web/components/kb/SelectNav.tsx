"use client";

// A labeled <select> whose options are navigations: choosing one pushes its
// pre-built href. Keeps the Master viewer's view/group/sort URL-driven while
// staying compact enough for a single toolbar row.

import { useRouter } from "next/navigation";

export function SelectNav({
  label,
  value,
  options,
}: Readonly<{
  label: string;
  value: string;
  options: { value: string; label: string; href: string; title?: string }[];
}>) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-neutral-400">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const option = options.find((o) => o.value === e.target.value);
          if (option) router.push(option.href);
        }}
        className="rounded border border-neutral-300 bg-[var(--card,#fff)] px-2 py-1 text-xs text-neutral-700"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} title={o.title}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
