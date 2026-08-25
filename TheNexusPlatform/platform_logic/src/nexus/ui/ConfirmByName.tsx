/**
 * A delete that asks you to type the thing's name.
 *
 * Used wherever removal cannot be undone. A confirm button alone is one click
 * away from a mis-click, and by the time the dialog is read the mouse is already
 * moving — typing the name is the only cheap guard that makes the act
 * deliberate rather than merely confirmed.
 *
 * It also states what goes WITH it. "Delete this program?" is answerable;
 * "delete this program, its 3 clubs and its 41 pieces of content?" is the
 * question actually being asked, and only the caller knows the second half.
 */
import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

export function ConfirmByName({
  name,
  what,
  consequences,
  busy,
  onCancel,
  onConfirm,
}: {
  /** The exact name the person must type. */
  name: string;
  /** "program", "organization", "club" — what it is, in a word. */
  what: string;
  /** What else disappears. Say it plainly; the caller is the only one who knows. */
  consequences?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [name]);
  const ok = typed.trim() === name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-2xl">
        <p className="flex items-center gap-2 text-base font-semibold">
          <TriangleAlert className="size-4 text-destructive" />
          Delete this {what}?
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span>
          {consequences ? ` — ${consequences}` : ""}. This cannot be undone.
        </p>
        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Type <span className="font-semibold text-foreground">{name}</span> to confirm
        </label>
        <Input
          className="mt-1.5"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={onConfirm}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Delete {what}
          </Button>
        </div>
      </div>
    </div>
  );
}
