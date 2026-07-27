import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillInteractivePayload } from '../../../../../lib/types';
import type { DrillFormatProps } from './shared';
import { chip, dropZone } from './shared';

type CatPayload = Extract<DrillInteractivePayload, { kind: 'categorize' }>;

function DraggableChip({ id, text, disabled }: { id: string; text: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ ...chip, opacity: isDragging ? 0.4 : 1, cursor: disabled ? 'default' : 'grab' }}
      {...listeners}
      {...attributes}
    >
      {text}
    </div>
  );
}

function Bucket({
  id, label, children, highlighted,
}: { id: string; label: string; children: React.ReactNode; highlighted?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        ...dropZone,
        borderColor: highlighted ? '#DC2626' : isOver ? '#0B0F1A' : 'rgba(0,0,0,0.18)',
        background: isOver ? 'rgba(0,0,0,0.04)' : highlighted ? 'rgba(220,38,38,0.04)' : 'rgba(0,0,0,0.02)',
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-2 min-h-[28px]">{children}</div>
    </div>
  );
}

export function CategorizeItem({ item, interactive, disabled, onResult, lockedResult }: DrillFormatProps) {
  const payload = interactive as CatPayload;
  const locked = disabled || !!lockedResult;
  const itemById = useMemo(() => new Map(payload.items.map((i) => [i.id, i.text])), [payload.items]);

  const [tray, setTray] = useState(() => payload.items.map((i) => i.id));
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setTray(payload.items.map((i) => i.id));
    setAssign({});
  }, [payload.items, item.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (locked) return;
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    if (overId === 'tray') {
      setAssign((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTray((t) => (t.includes(id) ? t : [...t, id]));
      return;
    }

    const bucket = payload.buckets.find((b) => b.id === overId);
    if (!bucket) return;

    if (payload.assignments[id] !== bucket.id) {
      setAssign((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTray((t) => (t.includes(id) ? t : [...t, id]));
      return;
    }

    setTray((t) => t.filter((x) => x !== id));
    setAssign((prev) => ({ ...prev, [id]: bucket.id }));
  };

  useEffect(() => {
    if (locked) return;
    const keys = Object.keys(payload.assignments);
    if (keys.length && keys.every((k) => assign[k] === payload.assignments[k])) {
      onResult(evaluateInteractive(item, payload, assign));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assign]);

  const wrong = new Set(lockedResult?.wrongParts || []);

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 13, color: '#6B7280' }}>Drag each item into the correct bucket. Wrong drops snap back.</p>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <Bucket id="tray" label="Items">
          {tray.map((id) => (
            <DraggableChip key={id} id={id} text={itemById.get(id) || id} disabled={locked} />
          ))}
        </Bucket>
        <div className="grid gap-2 sm:grid-cols-2">
          {payload.buckets.map((b) => {
            const inBucket = Object.entries(assign).filter(([, bid]) => bid === b.id).map(([iid]) => iid);
            return (
              <Bucket key={b.id} id={b.id} label={b.label} highlighted={inBucket.some((i) => wrong.has(i))}>
                {inBucket.map((id) => (
                  <DraggableChip key={id} id={id} text={itemById.get(id) || id} disabled={locked} />
                ))}
              </Bucket>
            );
          })}
        </div>
        <DragOverlay>
          {activeId ? (
            <div style={{ ...chip, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
              {itemById.get(activeId) || activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
