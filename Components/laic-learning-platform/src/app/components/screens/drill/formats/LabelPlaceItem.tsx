import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillInteractivePayload } from '../../../../../lib/types';
import type { DrillFormatProps } from './shared';
import { chip } from './shared';

type LabelPayload = Extract<DrillInteractivePayload, { kind: 'label_place' }>;

function TermChip({ id, text, disabled }: { id: string; text: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ ...chip, opacity: isDragging ? 0.35 : 1, cursor: disabled ? 'default' : 'grab' }}
      {...listeners}
      {...attributes}
    >
      {text}
    </div>
  );
}

function RegionDrop({
  id, label, style, children, lockedOk,
}: {
  id: string; label?: string; style: React.CSSProperties; children: React.ReactNode; lockedOk?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: `2px solid ${lockedOk ? '#059669' : isOver ? '#0B0F1A' : 'rgba(11,15,26,0.35)'}`,
        background: lockedOk ? 'rgba(5,150,105,0.2)' : isOver ? 'rgba(11,15,26,0.08)' : 'rgba(255,255,255,0.35)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
      }}
      title={label}
    >
      {children}
    </div>
  );
}

function TrayDrop({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'tray' });
  return (
    <div ref={setNodeRef} className="flex flex-wrap gap-2 w-full min-h-[28px]">
      {children}
    </div>
  );
}

export function LabelPlaceItem({ item, interactive, disabled, onResult, lockedResult }: DrillFormatProps) {
  const payload = interactive as LabelPayload;
  const locked = disabled || !!lockedResult;
  const termById = useMemo(() => new Map(payload.terms.map((t) => [t.id, t.text])), [payload.terms]);

  const [tray, setTray] = useState(() => payload.terms.map((t) => t.id));
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setTray(payload.terms.map((t) => t.id));
    setPlaced({});
  }, [payload.terms, item.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const regionOf = (regionId: string) =>
    Object.entries(placed).find(([, rid]) => rid === regionId)?.[0];

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (locked) return;
    const termId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    if (overId === 'tray') {
      setPlaced((p) => {
        const next = { ...p };
        delete next[termId];
        return next;
      });
      setTray((t) => (t.includes(termId) ? t : [...t, termId]));
      return;
    }

    const region = payload.regions.find((r) => r.id === overId);
    if (!region) return;

    if (regionOf(region.id) && regionOf(region.id) !== termId) return;

    if (payload.mapping[termId] !== region.id) {
      setPlaced((p) => {
        const next = { ...p };
        delete next[termId];
        return next;
      });
      setTray((t) => (t.includes(termId) ? t : [...t, termId]));
      return;
    }

    setTray((t) => t.filter((x) => x !== termId));
    setPlaced((p) => ({ ...p, [termId]: region.id }));
  };

  useEffect(() => {
    if (locked) return;
    const keys = Object.keys(payload.mapping);
    if (keys.length && keys.every((k) => placed[k] === payload.mapping[k])) {
      onResult(evaluateInteractive(item, payload, placed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 13, color: '#6B7280' }}>
        Drag each label onto its region. Wrong placements snap back; correct ones lock.
      </p>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="relative w-full rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          <img
            src={payload.imageUrl}
            alt={payload.imageAlt || 'Diagram'}
            className="w-full block"
            draggable={false}
          />
          {payload.regions.map((r) => {
            const termId = regionOf(r.id);
            return (
              <RegionDrop
                key={r.id}
                id={r.id}
                label={r.label}
                lockedOk={!!termId}
                style={{
                  position: 'absolute',
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              >
                {termId ? (
                  <TermChip id={termId} text={termById.get(termId) || termId} disabled={locked} />
                ) : (
                  <span style={{ fontSize: 11, color: '#6B7280' }}>{r.label}</span>
                )}
              </RegionDrop>
            );
          })}
        </div>

        <div
          className="flex flex-wrap gap-2 min-h-[44px] p-2 rounded-xl"
          style={{ border: '1.5px dashed rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.02)' }}
        >
          <TrayDrop>
            {tray.map((id) => (
              <TermChip key={id} id={id} text={termById.get(id) || id} disabled={locked} />
            ))}
            {!tray.length && (
              <span style={{ fontSize: 12, color: '#9AA3AF' }}>All labels placed</span>
            )}
          </TrayDrop>
        </div>

        <DragOverlay>
          {activeId ? (
            <div style={{ ...chip, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
              {termById.get(activeId) || activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
