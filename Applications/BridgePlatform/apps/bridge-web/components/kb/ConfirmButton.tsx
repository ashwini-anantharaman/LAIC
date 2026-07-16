"use client";

import { useTransition } from "react";

/** A submit button that runs a server action after a native confirm. Used for
 *  the small destructive actions (deleting a version) that still deserve a
 *  guard but don't warrant a whole dialog. */
export function ConfirmButton({
  action,
  hidden,
  confirm,
  label,
  className,
  title,
}: Readonly<{
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string | number>;
  confirm: string;
  label: string;
  className?: string;
  title?: string;
}>) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => startTransition(() => action(formData))}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <button type="submit" disabled={pending} className={className} title={title}>
        {pending ? "…" : label}
      </button>
    </form>
  );
}
