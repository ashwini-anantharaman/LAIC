"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "block rounded-md border-l-2 border-[var(--accent)] bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
          : "block rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      }
    >
      {label}
    </Link>
  );
}
