"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native <details> menu that also closes on an outside click or Escape —
 * the behavior people expect from a dropdown (bare <details> only toggles
 * when you click its own summary again). Children stay exactly as written:
 * pass the <summary> and the floating menu <div> just like a raw <details>.
 */
export function Dropdown({
  className,
  children,
}: Readonly<{ className?: string; children: ReactNode }>) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (ref.current?.open) ref.current.open = false;
    };
    const onPointerDown = (e: MouseEvent) => {
      // A click landing outside this menu (including inside another Dropdown)
      // dismisses it; clicks within — the summary or a menu item — don't.
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
