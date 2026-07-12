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
          ? "block rounded-md border-l-2 border-[var(--gold)] bg-white/10 px-3 py-2 text-sm font-medium text-white"
          : "block rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-emerald-100/70 hover:bg-white/5 hover:text-white"
      }
    >
      {label}
    </Link>
  );
}
