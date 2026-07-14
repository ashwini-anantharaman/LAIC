"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "border-b-2 border-[var(--accent)] px-1 pb-2 text-sm font-medium text-emerald-900"
          : "border-b-2 border-transparent px-1 pb-2 text-sm text-neutral-500 hover:text-neutral-800"
      }
    >
      {label}
    </Link>
  );
}
