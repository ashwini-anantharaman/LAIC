import type {
  AssistantContext,
  AssistantContextBlock,
  AssistantQuickActionId,
  CreatorPipelineDraft,
  EditAction,
  ObjectSelection,
  ObjectStatus,
  ObjectType,
} from './types';

/** Working part shape used by tutorial ObjEditor. */
export type TutorialEditorPart = {
  id: string;
  type: string;
  label?: string;
  body?: string;
  heading?: string;
  subheads?: string[];
  concept?: string;
  plain?: string;
  misc?: string;
  prompt?: string;
  options?: string[];
  correct?: number;
  exp?: string;
  url?: string;
  caption?: string;
  videoId?: string;
  startText?: string;
  endText?: string;
  [key: string]: unknown;
};

export interface AssistantHostSnapshot {
  objectId: string;
  objectType: ObjectType;
  title: string;
  status: ObjectStatus;
  scope?: string;
  objective?: string;
  fv?: Record<string, any>;
  parts: TutorialEditorPart[];
  pipelineDraft?: CreatorPipelineDraft | null;
  selection: ObjectSelection;
}

function partToContent(p: TutorialEditorPart): Record<string, unknown> {
  if (p.type === 'concept-card') {
    return { term: p.concept || '', definition: p.plain || '', example: p.misc || '' };
  }
  if (p.type === 'question') {
    return {
      question: p.prompt || '',
      options: p.options || [],
      correct: p.correct ?? 0,
      explanation: p.exp || '',
      hints: Array.isArray(p.hints) ? p.hints : undefined,
    };
  }
  if (p.type === 'image') return { url: p.url || '', caption: p.caption || '' };
  if (p.type === 'video') {
    return { url: p.url || '', videoId: p.videoId || '', caption: p.caption || '' };
  }
  return {
    text: p.body || '',
    heading: p.heading,
    subheads: p.subheads,
  };
}

function partToBlockType(type: string): string {
  if (type === 'video') return 'video-embed';
  if (type === 'question') return 'quiz';
  return type;
}

export function buildAssistantContext(snap: AssistantHostSnapshot): AssistantContext {
  const d = snap.pipelineDraft;
  const fv = snap.fv || d?.fv || {};
  const highlights = d?.highlights || [];
  const extracts = d?.extracts || [];
  const kb = d?.knowledgeBase;
  const media = d?.media || [];

  const blocks: AssistantContextBlock[] = (snap.parts || []).map((p, index) => ({
    id: p.id,
    index,
    type: partToBlockType(p.type),
    label: p.label || p.heading || p.concept || undefined,
    content: partToContent(p),
  }));

  const hasDoc = !!(d?.doc || d?.promptText || d?.pasteText);
  return {
    objectId: snap.objectId,
    objectType: snap.objectType,
    title: snap.title,
    status: snap.status,
    scope: snap.scope || d?.scope,
    metadata: {
      objective: snap.objective || fv.obj,
      audience: fv.aud,
      level: fv.lvl,
      voice: fv.voi,
      topic: fv.topic,
      teachingApproach: fv.how || fv.prog,
      templateId: fv.templateId || d?.templateId,
      extras: {
        secs: fv.secs,
        dpth: fv.dpth,
        end: fv.end,
        chks: fv.chks,
        prog: fv.prog,
        aiExtra: fv.aiExtra === true,
      },
    },
    provenance: {
      srcMode: d?.srcMode,
      sourceCount: (hasDoc || d?.srcMode === 'manual') ? 1 : (Array.isArray(d?.sel) ? d!.sel!.length : 0),
      highlightCount: Array.isArray(highlights) ? highlights.length : 0,
      extractCount: Array.isArray(extracts) ? extracts.length : (kb?.units?.length || 0),
      highlights,
      extracts,
      knowledgeBase: kb,
      mediaSummary: (media as any[]).map((m) => ({
        id: String(m.id),
        kind: String(m.kind || 'image'),
        caption: m.caption,
      })),
    },
    blocks,
    selection: snap.selection || { kind: 'none' },
  };
}

export const QUICK_ACTION_PROMPTS: Record<AssistantQuickActionId, string> = {
  improve_block: 'Improve the selected block: clearer, better structured, still grounded in this object’s sources.',
  make_simpler: 'Rewrite the selected block in simpler language for the configured audience and level.',
  shorten: 'Shorten the selected block without losing the key teaching point.',
  add_example: 'Add a concrete example to the selected block (or propose a new example block right after it), grounded in the sources.',
  write_check: 'Propose a knowledge-check question that tests what the selected block just taught, placed immediately after it.',
  fix_grounding: 'Audit grounding for the selection (or whole object if none). Flag unsupported claims and propose ground-fix edits.',
  coverage_check: 'Check coverage against the learning objective, audience, and level. Report gaps, drift, and duplicates. Propose fixes only if clearly needed.',
  summarize: 'Summarize the selected block, or the whole object if nothing is selected. Cite block ids.',
};

export function resolveQuickActionMessage(
  id: AssistantQuickActionId,
  selection: ObjectSelection,
): string {
  const base = QUICK_ACTION_PROMPTS[id];
  if (selection.kind === 'block') return `${base}\n\n(Selected block id: ${selection.blockId})`;
  if (selection.kind === 'block_range') {
    return `${base}\n\n(Selected range in block ${selection.blockId}: "${selection.selectedText}")`;
  }
  if (selection.kind === 'multi_block') {
    return `${base}\n\n(Selected blocks: ${selection.blockIds.join(', ')})`;
  }
  return `${base}\n\n(No block selected — treat as whole-object scope; ask to clarify if an edit would be ambiguous.)`;
}

function cloneParts(parts: TutorialEditorPart[]): TutorialEditorPart[] {
  return parts.map((p) => ({ ...p, options: p.options ? [...p.options] : undefined, subheads: p.subheads ? [...p.subheads] : undefined }));
}

function contentToPart(
  blockType: string,
  content: Record<string, unknown>,
  id: string,
  label?: string,
): TutorialEditorPart {
  const t = blockType === 'video-embed' ? 'video' : blockType === 'quiz' ? 'question' : blockType;
  if (t === 'concept-card') {
    return {
      id,
      type: 'concept-card',
      label: label || String(content.term || 'Concept'),
      concept: String(content.term || content.concept || ''),
      plain: String(content.definition || content.plain || ''),
      misc: String(content.example || content.misc || ''),
    };
  }
  if (t === 'question') {
    const opts = Array.isArray(content.options) ? content.options.map(String) : ['', '', '', ''];
    while (opts.length < 4) opts.push('');
    return {
      id,
      type: 'question',
      label: label || 'Question',
      prompt: String(content.question || content.prompt || ''),
      options: opts.slice(0, 4),
      correct: typeof content.correct === 'number' ? content.correct : 0,
      exp: String(content.explanation || content.exp || ''),
    };
  }
  if (t === 'image') {
    return {
      id, type: 'image', label: label || 'Image',
      url: String(content.url || ''), caption: String(content.caption || ''),
    };
  }
  if (t === 'video') {
    return {
      id, type: 'video', label: label || 'YouTube video',
      url: String(content.url || ''), videoId: String(content.videoId || ''),
      caption: String(content.caption || ''),
    };
  }
  return {
    id,
    type: 'rich-text',
    label: label || String(content.heading || 'Section'),
    body: String(content.text || content.body || ''),
    heading: content.heading != null ? String(content.heading) : undefined,
    subheads: Array.isArray(content.subheads) ? content.subheads.map(String) : undefined,
  };
}

export interface ApplyResult {
  parts: TutorialEditorPart[];
  meta?: { title?: string; objective?: string; fv?: Record<string, unknown> };
}

/** Apply one or more edit actions to tutorial editor parts. Pure. */
export function applyEditActionsToParts(
  parts: TutorialEditorPart[],
  actions: EditAction[],
  meta?: { title?: string; objective?: string; fv?: Record<string, unknown> },
): ApplyResult {
  let next = cloneParts(parts);
  let nextMeta = { ...meta };

  const applyOne = (action: EditAction) => {
    switch (action.type) {
      case 'batch':
        for (const a of action.actions) applyOne(a);
        break;
      case 'update_block': {
        next = next.map((p) => (p.id === action.blockId ? { ...p, ...action.patch } : p));
        break;
      }
      case 'update_block_range': {
        const field = action.field || 'body';
        next = next.map((p) => {
          if (p.id !== action.blockId) return p;
          const cur = String((p as any)[field] ?? p.body ?? '');
          const start = Math.max(0, Math.min(action.start, cur.length));
          const end = Math.max(start, Math.min(action.end, cur.length));
          const replaced = cur.slice(0, start) + action.replacement + cur.slice(end);
          return { ...p, [field]: replaced };
        });
        break;
      }
      case 'add_block': {
        const id = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const part = contentToPart(action.blockType, action.content || {}, id, action.label);
        const idx = Math.max(0, Math.min(action.atIndex, next.length));
        next = [...next.slice(0, idx), part, ...next.slice(idx)];
        break;
      }
      case 'delete_block':
        next = next.filter((p) => p.id !== action.blockId);
        break;
      case 'reorder_blocks': {
        const byId = new Map(next.map((p) => [p.id, p]));
        const ordered = action.order.map((id) => byId.get(id)).filter(Boolean) as TutorialEditorPart[];
        const rest = next.filter((p) => !action.order.includes(p.id));
        next = [...ordered, ...rest];
        break;
      }
      case 'split_block': {
        const i = next.findIndex((p) => p.id === action.blockId);
        if (i < 0) break;
        const p = next[i];
        const text = String(p.body || '');
        const at = Math.max(0, Math.min(action.atOffset, text.length));
        const a = { ...p, body: text.slice(0, at) };
        const b: TutorialEditorPart = {
          ...p,
          id: `asst-split-${Date.now()}`,
          body: text.slice(at),
          heading: undefined,
          label: p.label ? `${p.label} (cont.)` : 'Continued',
        };
        next = [...next.slice(0, i), a, b, ...next.slice(i + 1)];
        break;
      }
      case 'merge_blocks': {
        const [idA, idB] = action.blockIds;
        const ia = next.findIndex((p) => p.id === idA);
        const ib = next.findIndex((p) => p.id === idB);
        if (ia < 0 || ib < 0) break;
        const a = next[ia];
        const b = next[ib];
        const merged: TutorialEditorPart = {
          ...a,
          body: [a.body, b.body].filter(Boolean).join('\n\n'),
          label: a.label || b.label,
        };
        const without = next.filter((p) => p.id !== idA && p.id !== idB);
        const insertAt = Math.min(ia, ib);
        next = [...without.slice(0, insertAt), merged, ...without.slice(insertAt)];
        break;
      }
      case 'convert_block': {
        next = next.map((p) => {
          if (p.id !== action.blockId) return p;
          return contentToPart(action.toType, action.content || {}, p.id, p.label);
        });
        break;
      }
      case 'update_metadata': {
        nextMeta = {
          title: action.patch.title ?? nextMeta?.title,
          objective: action.patch.objective ?? nextMeta?.objective,
          fv: action.patch.fv
            ? { ...(nextMeta?.fv || {}), ...action.patch.fv }
            : nextMeta?.fv,
        };
        if (action.patch.audience || action.patch.level || action.patch.voice) {
          nextMeta.fv = {
            ...(nextMeta.fv || {}),
            ...(action.patch.audience ? { aud: action.patch.audience } : {}),
            ...(action.patch.level ? { lvl: action.patch.level } : {}),
            ...(action.patch.voice ? { voi: action.patch.voice } : {}),
          };
        }
        break;
      }
      default:
        break;
    }
  };

  for (const a of actions) applyOne(a);
  return { parts: next, meta: nextMeta };
}

/** Best-effort inverse for undo (tutorial parts). */
export function invertEditActions(
  beforeParts: TutorialEditorPart[],
  afterParts: TutorialEditorPart[],
  actions: EditAction[],
  beforeMeta?: { title?: string; objective?: string },
  afterMeta?: { title?: string; objective?: string },
): EditAction[] {
  // Snapshot restore is the reliable inverse for undo.
  void actions;
  void afterParts;
  void afterMeta;
  return [
    {
      type: 'batch',
      reason: 'undo-snapshot',
      actions: [
        {
          type: 'reorder_blocks',
          order: beforeParts.map((p) => p.id),
        },
        // Full restore via delete unknowns + update/add — simpler: single custom restore handled by host
      ],
    },
  ];
}

/** Host stores full before snapshot for undo instead of fragile inverses. */
export interface PartSnapshot {
  parts: TutorialEditorPart[];
  title: string;
  objective: string;
}

export function snapshotParts(parts: TutorialEditorPart[], title: string, objective: string): PartSnapshot {
  return { parts: cloneParts(parts), title, objective };
}

export function flattenActions(actions: EditAction[]): EditAction[] {
  const out: EditAction[] = [];
  for (const a of actions) {
    if (a.type === 'batch') out.push(...flattenActions(a.actions));
    else out.push(a);
  }
  return out;
}

export function blockIdsFromActions(actions: EditAction[]): string[] {
  const ids = new Set<string>();
  for (const a of flattenActions(actions)) {
    if ('blockId' in a && typeof (a as any).blockId === 'string') ids.add((a as any).blockId);
    if (a.type === 'merge_blocks') a.blockIds.forEach((id) => ids.add(id));
    if (a.type === 'reorder_blocks') a.order.forEach((id) => ids.add(id));
  }
  return [...ids];
}
