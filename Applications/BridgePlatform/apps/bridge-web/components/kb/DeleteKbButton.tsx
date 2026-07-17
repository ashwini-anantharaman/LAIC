"use client";

import { useTransition } from "react";

/** A destructive action needs a confirm step — this is the only client-side
 *  piece of the KB list; the actual delete still runs as a server action. */
export function DeleteKbButton({
  kbId,
  name,
  hasChildren,
  action,
}: Readonly<{
  kbId: string;
  name: string;
  hasChildren: boolean;
  action: (formData: FormData) => void | Promise<void>;
}>) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => action(formData))}
      onSubmit={(e) => {
        if (hasChildren) {
          e.preventDefault();
          window.alert(
            `"${name}" has knowledge bases derived from it — delete or re-branch those first.`,
          );
          return;
        }
        if (
          !window.confirm(
            `Delete "${name}"? This removes its items, packs, players, and published versions. This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="kbId" value={kbId} />
      <input type="hidden" name="confirmName" value={name} />
      <input type="hidden" name="from" value="list" />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-neutral-400 hover:text-[var(--madder)] disabled:opacity-50"
      >
        {pending ? "deleting…" : "delete"}
      </button>
    </form>
  );
}
