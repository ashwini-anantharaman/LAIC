import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillInteractivePayload } from '../../../../../lib/types';
import type { DrillFormatProps } from './shared';

type OrderPayload = Extract<DrillInteractivePayload, { kind: 'order' }>;

function SortableRow({
  id, text, flagged, locked,
}: { id: string; text: string; flagged?: boolean; locked?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    fontSize: 13.5,
    fontWeight: 600,
    border: `1px solid ${flagged ? '#DC2626' : 'rgba(0,0,0,0.12)'}`,
    background: flagged ? 'rgba(220,38,38,0.06)' : '#fff',
    borderRadius: 12,
    padding: '10px 12px',
    cursor: locked ? 'default' : 'grab',
    color: '#0B1220',
    // Reordering a vertical list inside a vertically scrolling page cannot work
    // on touch unless the row opts out of the browser's scroll gesture.
    touchAction: locked ? undefined : 'none',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {text}
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function OrderItem({ item, interactive, disabled, onResult, lockedResult }: DrillFormatProps) {
  const payload = interactive as OrderPayload;
  const locked = disabled || !!lockedResult;
  const initial = useMemo(
    () => shuffle(payload.steps.map((s) => s.id)),
    [payload.steps],
  );
  const [order, setOrder] = useState(initial);
  useEffect(() => { setOrder(initial); }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (locked) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const byId = new Map(payload.steps.map((s) => [s.id, s.text]));
  const wrong = new Set(lockedResult?.wrongParts || []);

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 13, color: '#6B7280' }}>Drag steps into the correct order, then commit.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map((id) => (
              <SortableRow
                key={id}
                id={id}
                text={byId.get(id) || id}
                flagged={wrong.has(id)}
                locked={locked}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!locked && (
        <button
          type="button"
          onClick={() => onResult(evaluateInteractive(item, payload, order))}
          className="px-4 py-2 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
        >
          Commit order
        </button>
      )}
    </div>
  );
}
