/**
 * Dragging an image from the Refine sidebar into the block list.
 *
 * A private MIME type rather than text/plain: the drop zones between blocks
 * must be able to tell "an image from the picker" apart from a text selection
 * or a file the browser is dragging, and only light up for the real thing.
 */
export const IMAGE_DRAG_MIME = 'application/x-laic-image';

export interface DraggedImage {
  src: string;
  caption?: string;
}

/** Read a dragged image off the event, or null when it is something else. */
export function readDraggedImage(dt: DataTransfer | null): DraggedImage | null {
  if (!dt) return null;
  const raw = dt.getData(IMAGE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.src ? { src: String(parsed.src), caption: parsed.caption } : null;
  } catch {
    return null;
  }
}
