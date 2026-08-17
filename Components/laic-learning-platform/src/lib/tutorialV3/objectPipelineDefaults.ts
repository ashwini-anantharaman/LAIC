/**
 * Default Define knobs for Tutorial V3 nested generate pipelines.
 * Seeds from the shared DEFINE_CFG (same as standalone ObjectCreator).
 */
import { seedDefineValues } from '../defineFieldConfig';
import type { EmbeddedGenerateMeta } from '../types';

export function defaultDefineConfig(
  objectType: string,
  seed?: EmbeddedGenerateMeta,
  fallbackIntent?: string,
): Record<string, any> {
  const s = seed || {};
  const intent = String(s.objective || s.conceptFocus || fallbackIntent || '').trim();

  const fromMeta: Record<string, any> = {
    instructions: s.instructions || '',
  };
  if (objectType === 'flashcard-set') {
    fromMeta.mem = intent || String(s.title || '');
    fromMeta.aud = 'High school';
    fromMeta.lvl = 'Basic';
    if (Array.isArray(s.cc) && s.cc.length) fromMeta.cc = s.cc;
    if (Array.isArray(s.pull) && s.pull.length) fromMeta.pull = s.pull;
    if (s.dir) fromMeta.dir = s.dir;
    if (s.hooks != null) fromMeta.hooks = s.hooks;
    if (s.cardCount != null) fromMeta.nc = Number(s.cardCount) || 12;
  } else if (objectType === 'concept-card') {
    fromMeta.concept = intent || String(s.title || '');
    if (s.voi) fromMeta.voi = s.voi;
    if (s.len) fromMeta.len = s.len;
    fromMeta.aud = 'High school';
    fromMeta.lvl = 'Basic';
  } else if (objectType === 'quiz') {
    fromMeta.verify = intent || String(s.title || '');
    fromMeta.concepts = intent;
    fromMeta.aud = 'High school';
    fromMeta.lvl = 'Basic';
    if (Array.isArray(s.qtypes) && s.qtypes.length) fromMeta.qtypes = s.qtypes;
    if (s.questionCount != null) fromMeta.nq = Number(s.questionCount) || 8;
    if (s.passOn != null) fromMeta.passOn = s.passOn !== false;
    if (s.passMark) fromMeta.pass = s.passMark;
    if (s.show) fromMeta.show = s.show;
    if (s.adaptive) fromMeta.adaptive = s.adaptive === 'Fixed' ? 'No' : s.adaptive;
  } else if (objectType === 'assignment') {
    fromMeta.obj = intent || String(s.title || '');
    fromMeta.aud = 'High school';
    fromMeta.lvl = 'Intermediate';
    if (s.tt) fromMeta.tt = s.tt;
    if (s.del) fromMeta.del = s.del;
    if (s.el) fromMeta.el = s.el;
    if (s.cite != null) fromMeta.cite = s.cite !== false;
  } else if (objectType === 'reflection') {
    if (s.voi) fromMeta.voi = s.voi;
  } else {
    fromMeta.objective = intent;
  }

  return seedDefineValues(objectType, fromMeta);
}

export function objectTypeNoun(objectType: string): string {
  const map: Record<string, string> = {
    'flashcard-set': 'flashcard set',
    'concept-card': 'concept card',
    quiz: 'quiz',
    assignment: 'assignment',
    reflection: 'reflection',
    summary: 'summary',
    drill: 'drill',
  };
  return map[objectType] || objectType;
}
