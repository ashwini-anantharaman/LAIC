/** Tutorial V2 embed generation (fork). */
/**
 * Client-side orchestration helpers: map section units + embed meta onto
 * existing per-type generators WITHOUT modifying those generators.
 */
import {
  generateConceptCard,
  generateFlashcards,
  generateStructuredObject,
  type ConceptCardGenEvent,
  type FlashcardGenEvent,
  type GeneratedCard,
  type GeneratedConceptCard,
  type StructuredGenEvent,
  type TutorialExtract,
} from '../api';
import { resolveConceptCategories } from '../conceptCard';
import { makeGeneratedEmbedPart, type LibraryEmbedPart } from '../libraryEmbed';
import type { ListedEmbed } from './tutorialDefinition';
import type { Block, ContentUnit, ObjectType } from '../types';

const MAX_EMBED_EXTRACTS = 12;
const MAX_EXTRACT_CHARS = 1200;

export function unitsToExtracts(units: ContentUnit[]): TutorialExtract[] {
  return (units || [])
    .filter((u) => String(u.text || '').trim())
    .slice(0, MAX_EMBED_EXTRACTS)
    .map((u) => {
      const raw = String(u.text || '').trim();
      const text = raw.length > MAX_EXTRACT_CHARS
        ? `${raw.slice(0, MAX_EXTRACT_CHARS)}…`
        : raw;
      return {
        kind: u.kind,
        text,
        from: u.from,
        authorNote: u.authorNote,
      };
    });
}

function authorPrompt(embed: ListedEmbed): string | undefined {
  const bits = [
    embed.authoringNote ? `Authoring note: ${embed.authoringNote}` : '',
    embed.override?.instructions ? `Instructions: ${embed.override.instructions}` : '',
    embed.effectiveMeta?.instructions ? `Template instructions: ${embed.effectiveMeta.instructions}` : '',
  ].filter(Boolean);
  return bits.length ? bits.join('\n') : undefined;
}

function intentFor(embed: ListedEmbed): string {
  return String(
    embed.override?.objective
    || embed.effectiveMeta?.objective
    || embed.effectiveMeta?.conceptFocus
    || embed.sectionIntent
    || embed.sectionTitle
    || '',
  ).trim();
}

function titleFor(embed: ListedEmbed): string {
  return String(embed.effectiveMeta?.title || `${embed.sectionTitle} · ${embed.item.objectType}`).trim();
}

function placeholderPart(embed: ListedEmbed, reason: string): any {
  return {
    id: `embed-ph-${embed.key}`,
    type: 'rich-text',
    label: `Embedded ${embed.item.objectType}`,
    body: `${embed.item.objectType} — ${reason}`,
  };
}

function scenarioPlaceholder(embed: ListedEmbed): any {
  return {
    id: `embed-ph-${embed.key}`,
    type: 'rich-text',
    label: 'Scenario',
    body: 'Scenario — not yet supported for generation. Reserve this slot; a dedicated scenario generator will fill it in a later pass.',
  };
}

async function collectStructuredOnce(
  kind: 'assignment' | 'reflection',
  title: string,
  config: Record<string, unknown>,
  extracts: TutorialExtract[],
  prompt: string | undefined,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let content: Record<string, unknown> | null = null;
  for await (const ev of generateStructuredObject(kind, {
    title,
    config,
    extracts,
    prompt,
  }, signal) as AsyncGenerator<StructuredGenEvent<Record<string, unknown>>>) {
    if (ev.type === 'result') content = ev.content;
    else if (ev.type === 'error') throw new Error(ev.message);
    else if (ev.type === 'done') break;
  }
  if (!content) throw new Error(`No ${kind} was generated.`);
  return content;
}

/** One retry with a tighter extract pack — shared generator input shape unchanged. */
async function collectStructured(
  kind: 'assignment' | 'reflection',
  title: string,
  config: Record<string, unknown>,
  extracts: TutorialExtract[],
  prompt: string | undefined,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  try {
    return await collectStructuredOnce(kind, title, config, extracts, prompt, signal);
  } catch (first) {
    if (signal?.aborted) throw first;
    const tighter = extracts.slice(0, 6).map((e) => ({
      ...e,
      text: String(e.text || '').slice(0, 600),
    }));
    return collectStructuredOnce(kind, title, config, tighter, prompt, signal);
  }
}

/**
 * Call the existing per-type generator for one generate-new embed.
 * Returns a library-embed part (generated: true) or a rich-text placeholder on failure/deferral.
 */
export async function generateEmbedPart(opts: {
  embed: ListedEmbed;
  sectionUnits: ContentUnit[];
  signal?: AbortSignal;
}): Promise<{ part: LibraryEmbedPart | any; warning?: string }> {
  const { embed, sectionUnits, signal } = opts;
  const otype = embed.item.objectType;

  if (otype === 'scenario') {
    return { part: scenarioPlaceholder(embed), warning: 'Scenario embeds are deferred (no generator yet).' };
  }
  if (otype === 'quiz' || otype === 'reused-from-library') {
    // Quiz generate is filled by the tutorial SSE (section-quiz); should not reach here.
    return { part: placeholderPart(embed, 'handled inline with the tutorial'), warning: undefined };
  }

  const extracts = unitsToExtracts(sectionUnits);
  if (!extracts.length) {
    return {
      part: placeholderPart(embed, 'no source units in this section — mark up and assign units in Extract'),
      warning: `${otype} for “${embed.sectionTitle}” skipped: no section units.`,
    };
  }

  const meta = embed.effectiveMeta || {};
  const prompt = authorPrompt(embed);
  const title = titleFor(embed);
  const intent = intentFor(embed);

  try {
    if (otype === 'assignment') {
      const content = await collectStructured('assignment', title, {
        obj: intent || title,
        aud: 'High school',
        lvl: 'Intermediate',
        tt: meta.tt ?? 'Short essay',
        del: meta.del ?? 'Written text',
        el: meta.el ?? '~300 words',
        cite: meta.cite !== false,
        req: 3,
        rubric: 3,
      }, extracts, prompt, signal);
      const blocks: Block[] = [{
        id: `blk-asg-${embed.key}`,
        type: 'assignment',
        content,
      }];
      return {
        part: makeGeneratedEmbedPart({
          id: `embed-gen-${embed.key}`,
          objectType: 'assignment',
          title: String((content as any).objective || title),
          snapshotBlocks: blocks,
          authoringNote: embed.authoringNote,
          required: embed.item.required,
        }),
      };
    }

    if (otype === 'reflection') {
      const content = await collectStructured('reflection', title, {
        goal: 'Apply to real life',
        aud: 'High school',
        voi: meta.voi ?? 'Encouraging',
        style: 'Open-ended',
        who: 'Private to learner',
        np: 2,
        starters: false,
      }, extracts, [
        intent ? `Reflection focus: ${intent}` : '',
        prompt || '',
      ].filter(Boolean).join('\n') || undefined, signal);
      const blocks: Block[] = [{
        id: `blk-ref-${embed.key}`,
        type: 'reflection',
        content,
      }];
      return {
        part: makeGeneratedEmbedPart({
          id: `embed-gen-${embed.key}`,
          objectType: 'reflection',
          title: String((content as any).goal || title),
          snapshotBlocks: blocks,
          authoringNote: embed.authoringNote,
          required: embed.item.required,
        }),
      };
    }

    if (otype === 'flashcard-set') {
      let cc = Array.isArray(meta.cc) && meta.cc.length
        ? meta.cc
        : ['Key terms → definitions'];
      // Strip Image→label when we have no images (generator requires uploads for that style).
      cc = cc.filter((s) => !/image\s*[→\-]\s*label/i.test(String(s)));
      if (!cc.length) cc = ['Key terms → definitions'];
      const nc = typeof meta.cardCount === 'number'
        ? meta.cardCount
        : (typeof meta.cardCount === 'string' && Number(meta.cardCount)
          ? Number(meta.cardCount)
          : 12);
      const collected: GeneratedCard[] = [];
      for await (const ev of generateFlashcards({
        title,
        config: {
          mem: intent || title,
          aud: 'High school',
          lvl: 'Basic',
          cc,
          pull: Array.isArray(meta.pull) && meta.pull.length
            ? meta.pull
            : ['Glossary / key terms in source'],
          dir: meta.dir ?? 'Front→back',
          hooks: meta.hooks ?? false,
          nc,
        },
        extracts,
        prompt,
      }, signal) as AsyncGenerator<FlashcardGenEvent>) {
        if (ev.type === 'card') collected.push(ev.card);
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!collected.length) throw new Error('No cards were generated.');
      const blocks: Block[] = [{
        id: `blk-fc-${embed.key}`,
        type: 'flashcard-set',
        content: {
          cards: collected.map((c) => ({
            front: c.front,
            back: c.back,
            ...(c.hook ? { hook: c.hook } : {}),
            ...(c.hint ? { hint: c.hint } : {}),
          })),
          direction: 'front-to-back',
        },
      }];
      return {
        part: makeGeneratedEmbedPart({
          id: `embed-gen-${embed.key}`,
          objectType: 'flashcard-set' as ObjectType,
          title,
          snapshotBlocks: blocks,
          authoringNote: embed.authoringNote,
          required: embed.item.required,
        }),
      };
    }

    if (otype === 'concept-card') {
      const concept = intent || title;
      if (!concept) throw new Error('Concept card needs an intent/objective.');
      const markupUnits = sectionUnits.map((u) => ({
        text: u.text,
        from: u.from,
        kind: u.kind,
        authorNote: u.authorNote,
      }));
      let card: GeneratedConceptCard | null = null;
      for await (const ev of generateConceptCard({
        title,
        config: {
          concept,
          aud: 'High school',
          lvl: 'Basic',
          voi: meta.voi ?? 'Plain & friendly',
          len: meta.len ?? 'Standard',
          categories: resolveConceptCategories(undefined),
        },
        extracts,
        markupUnits,
        prompt,
      }, signal) as AsyncGenerator<ConceptCardGenEvent>) {
        if (ev.type === 'card') card = ev.card;
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!card?.term || !(card.oneSentenceMeaning || card.definition || card.coreIdea)) {
        throw new Error('No concept card was generated.');
      }
      const blocks: Block[] = [{
        id: `blk-cc-${embed.key}`,
        type: 'concept-card',
        content: card,
      }];
      return {
        part: makeGeneratedEmbedPart({
          id: `embed-gen-${embed.key}`,
          objectType: 'concept-card',
          title: card.term || title,
          snapshotBlocks: blocks,
          authoringNote: embed.authoringNote,
          required: embed.item.required,
        }),
      };
    }

    return {
      part: placeholderPart(embed, `unsupported embed type “${otype}”`),
      warning: `Unsupported embed type: ${otype}`,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    return {
      part: placeholderPart(embed, `generation failed: ${msg}`),
      warning: `${otype} for “${embed.sectionTitle}” failed: ${msg}`,
    };
  }
}
