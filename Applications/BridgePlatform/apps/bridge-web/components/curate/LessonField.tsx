"use client";

// THE LESSON, AS A FORM FIELD — the picker plus the hidden inputs that carry
// its answer into a plain FormData.
//
// Three screens need exactly this and none of them should own a copy: the two
// deal screens where a board is built, and the post-publish editor where a
// coach fixes what the board turned out to teach (owner ask 2026-08-19). The
// picker itself is controlled, so somebody has to hold the choice — this is
// that somebody, seeded from whatever the board already names.
//
// The value reaches the server as repeated `kTag` / `kItem` inputs, read back
// through the registry's own parsers (parseKTags / parseKItemIds), so a stale
// name in a form can never enter a payload as a tag or card nothing recognizes.

import { LessonFields, LessonPicker, useLessonChoice } from "./LessonPicker";
import type { KItemId, KTag } from "@/lib/coach/kItems";

export function LessonField({
  tags = [],
  items = [],
  skin = "web",
  fold = true,
}: Readonly<{
  /** What the board names today — empty on a board being built. */
  tags?: readonly KTag[];
  items?: readonly KItemId[];
  skin?: "web" | "app" | "rail";
  fold?: boolean;
}>) {
  const lesson = useLessonChoice(tags, items);
  return (
    <>
      <LessonFields tags={lesson.tags} items={lesson.items} />
      <LessonPicker
        tags={lesson.tags}
        items={lesson.items}
        onToggleTag={lesson.onToggleTag}
        onToggleItem={lesson.onToggleItem}
        onClear={lesson.onClear}
        skin={skin}
        fold={fold}
      />
    </>
  );
}
