/**
 * Assignment Define → blueprint helpers (summary + content/blueprint bridge).
 * Server-side generate/validate lives in server/index.mjs (same contract).
 */

import type {
  AssignmentBlueprint,
  AssignmentContent,
  AssignmentDeliverableKind,
  AssignmentRequirement,
  AssignmentTaskType,
  RubricCriterion,
} from './types';

export interface AssignmentDefineConfig {
  obj?: string;
  aud?: string;
  lvl?: string;
  tt?: string;
  del?: string;
  el?: string;
  cite?: boolean;
  req?: number;
  rubric?: number;
  title?: string;
}

export function clampAssignmentCount(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(2, Math.min(6, Math.round(v)));
}

/** Live “What will be generated” line for the Assignment Define tab. */
export function assignmentDefineSummary(
  fv: AssignmentDefineConfig,
  opts: { srcCount?: number; extCount?: number; title?: string } = {},
): string {
  const tt = String(fv.tt || 'Short essay');
  const aud = String(fv.aud || 'High school');
  const el = String(fv.el || '~300 words');
  const del = String(fv.del || 'Written text');
  const nReq = clampAssignmentCount(fv.req, 3);
  const nRub = clampAssignmentCount(fv.rubric, 3);
  const cite = fv.cite !== false;
  const k = typeof opts.extCount === 'number' && opts.extCount > 0
    ? opts.extCount
    : (typeof opts.srcCount === 'number' ? opts.srcCount : 0);
  const grounded = k > 0
    ? `grounded in ${k} source unit${k !== 1 ? 's' : ''}`
    : 'grounded in your Define settings and author prompt';
  const citeBit = cite ? ', with source citations required in the task and rubric' : '';
  return (
    `A ${tt.toLowerCase()} for ${aud}, ${el}, ${del.toLowerCase()}, `
    + `with ${nReq} requirements and a ${nRub}-criterion rubric mapped to your objective, `
    + `${grounded}${citeBit}. Everything editable after generating.`
  );
}

export function contentToBlueprint(content: AssignmentContent): AssignmentBlueprint {
  if (content.blueprint?.task?.prompt && content.blueprint.requirements?.length) {
    return content.blueprint;
  }
  const requirements: AssignmentRequirement[] = (content.requirements || []).map((text, i) => ({
    id: `req-${i + 1}`,
    text,
  }));
  return {
    objective: content.objective || 'Demonstrate understanding',
    audience: content.audience || 'High school',
    level: content.level || 'Intermediate',
    task: {
      type: (content.taskType || 'Short essay') as AssignmentTaskType,
      prompt: content.prompt || '',
    },
    deliverable: {
      kind: (content.deliverable || 'Written text') as AssignmentDeliverableKind,
      instructions: content.deliverableInstructions
        || `Submit as ${content.deliverable || 'Written text'}${content.expectedLength ? ` (${content.expectedLength})` : ''}.`,
      expectedLength: content.expectedLength,
      requireCitations: content.requireCitations !== false,
    },
    requirements,
    rubric: content.rubric || [],
  };
}

export function blueprintToContent(bp: AssignmentBlueprint): AssignmentContent {
  return {
    objective: bp.objective,
    taskType: String(bp.task.type),
    deliverable: String(bp.deliverable.kind),
    expectedLength: bp.deliverable.expectedLength,
    requireCitations: bp.deliverable.requireCitations,
    prompt: bp.task.prompt,
    deliverableInstructions: bp.deliverable.instructions,
    requirements: (bp.requirements || []).map((r) => r.text),
    rubric: bp.rubric || [],
    audience: bp.audience,
    level: bp.level,
    blueprint: bp,
  };
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

/**
 * Open a print-ready handout. Use the browser dialog’s “Save as PDF”
 * (or Print) — no extra PDF library required.
 */
export function printAssignmentAsPdf(content: AssignmentContent, title?: string): void {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) {
    window.alert('Allow pop-ups to convert this assignment to PDF.');
    return;
  }

  const docTitle = (title || content.objective || 'Assignment').trim() || 'Assignment';
  const meta = [
    content.taskType,
    content.deliverable,
    content.expectedLength,
    content.audience,
    content.level,
    content.requireCitations ? 'Citations required' : '',
  ].filter(Boolean).join(' · ');

  const deliverableInstructions = content.deliverableInstructions
    || content.blueprint?.deliverable?.instructions
    || '';

  const requirements = (content.requirements || [])
    .map((r, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(r)}</li>`)
    .join('');

  const rubric = (content.rubric || content.blueprint?.rubric || []).map((r) => {
    const levels = (r.levelDescriptors && r.levelDescriptors.length
      ? r.levelDescriptors.map((l) => `<li><strong>${escapeHtml(l.label)}:</strong> ${escapeHtml(l.description)}</li>`).join('')
      : (r.levels || []).map((l) => `<li>${escapeHtml(l)}</li>`).join(''));
    return `
      <div class="criterion">
        <h3>${escapeHtml(r.criterion)}</h3>
        ${r.description ? `<p class="muted">${escapeHtml(r.description)}</p>` : ''}
        ${levels ? `<ul class="levels">${levels}</ul>` : ''}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { margin: 0.75in; }
    * { box-sizing: border-box; }
    body {
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      color: #0B1220;
      line-height: 1.55;
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 20px 48px;
      font-size: 14px;
    }
    .eyebrow {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #EA580C;
      margin: 0 0 6px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 6px;
      line-height: 1.25;
    }
    .meta {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #6B7280;
      margin: 0 0 22px;
    }
    h2 {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #6B7280;
      margin: 22px 0 8px;
    }
    .block {
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 14px 16px;
      background: #fff;
    }
    .block p { margin: 0; white-space: pre-wrap; }
    ol, ul { margin: 0; padding-left: 1.25em; }
    li { margin: 0.35em 0; }
    .criterion {
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 0 0 10px;
      page-break-inside: avoid;
    }
    .criterion h3 {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      margin: 0 0 4px;
    }
    .muted { color: #6B7280; font-size: 13px; margin: 0 0 6px; }
    .levels { margin: 6px 0 0; font-size: 13px; }
    .footer {
      font-family: system-ui, -apple-system, sans-serif;
      margin-top: 28px;
      font-size: 11px;
      color: #9AA3AF;
      border-top: 1px solid #E5E7EB;
      padding-top: 10px;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="eyebrow">Assignment</p>
  <h1>${escapeHtml(docTitle)}</h1>
  ${content.objective && content.objective !== docTitle
    ? `<p class="meta"><strong>Objective:</strong> ${escapeHtml(content.objective)}</p>`
    : ''}
  ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ''}

  <h2>Task</h2>
  <div class="block"><p>${nl2br(content.prompt || '')}</p></div>

  ${deliverableInstructions ? `
  <h2>What to submit</h2>
  <div class="block"><p>${nl2br(deliverableInstructions)}</p></div>` : ''}

  ${requirements ? `
  <h2>Requirements</h2>
  <ol>${requirements}</ol>` : ''}

  ${rubric ? `
  <h2>Rubric</h2>
  ${rubric}` : ''}

  <p class="footer">LAIC Content Studio · Print or choose “Save as PDF” in the print dialog.</p>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 120);
    });
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export interface AssignmentValidationIssue {
  code: string;
  message: string;
}

/** Client-side mirror of server validation (editor / tests). */
export function validateAssignmentBlueprint(
  bp: AssignmentBlueprint,
  config: AssignmentDefineConfig,
): AssignmentValidationIssue[] {
  const issues: AssignmentValidationIssue[] = [];
  const nReq = clampAssignmentCount(config.req, 3);
  const nRub = clampAssignmentCount(config.rubric, 3);
  const cite = config.cite !== false;
  const prompt = (bp.task?.prompt || '').trim();
  const delInstr = (bp.deliverable?.instructions || '').trim();
  const reqs = bp.requirements || [];
  const rubric = bp.rubric || [];

  if (!prompt || prompt.length < 40) {
    issues.push({ code: 'task_thin', message: 'Task prompt is missing or too thin.' });
  }
  if (/^(summarize|list|copy|restate)\b/i.test(prompt) && !/\b(apply|argue|analyze|evaluate|critique|solve|design|compare|justify)\b/i.test(prompt)) {
    issues.push({ code: 'task_restate', message: 'Task appears to ask for restating rather than applying the source.' });
  }
  if (reqs.length !== nReq) {
    issues.push({ code: 'req_count', message: `Expected ${nReq} requirements, got ${reqs.length}.` });
  }
  if (rubric.length !== nRub) {
    issues.push({ code: 'rubric_count', message: `Expected ${nRub} rubric criteria, got ${rubric.length}.` });
  }
  const reqIds = new Set(reqs.map((r) => r.id));
  const measured = new Set<string>();
  rubric.forEach((r: RubricCriterion, i) => {
    const mapped = (r.mapsToRequirementIds || []).filter((id) => reqIds.has(id));
    if (!mapped.length && !(r.description || '').trim()) {
      issues.push({ code: 'orphan_criterion', message: `Rubric criterion ${i + 1} is not mapped to a requirement.` });
    }
    mapped.forEach((id) => measured.add(id));
    const hasLevels = (r.levelDescriptors && r.levelDescriptors.length >= 2)
      || (r.levels && r.levels.length >= 2)
      || !!(r.description || '').trim();
    if (!hasLevels) {
      issues.push({ code: 'levels_missing', message: `Rubric criterion “${r.criterion || i + 1}” lacks performance levels.` });
    }
  });
  reqs.forEach((r) => {
    if (!measured.has(r.id) && rubric.length) {
      // Soft: allow if some criterion description mentions part of the requirement text
      const hit = rubric.some((c) => (c.description || '').toLowerCase().includes((r.text || '').slice(0, 24).toLowerCase()));
      if (!hit) {
        issues.push({ code: 'unmeasured_req', message: `Requirement ${r.id} is not measured by any rubric criterion.` });
      }
    }
  });
  if (cite) {
    const citeInTask = /cit(e|ation)|source|reference/i.test(prompt + ' ' + delInstr);
    if (!citeInTask) {
      issues.push({ code: 'cite_task', message: 'Citations are required but the task/deliverable does not require them.' });
    }
    const citeInRubric = rubric.some((r) => /cit(e|ation)|source|ground/i.test(`${r.criterion} ${r.description || ''}`));
    if (!citeInRubric) {
      issues.push({ code: 'cite_rubric', message: 'Citations are required but no rubric criterion measures source use.' });
    }
  }
  const el = String(config.el || bp.deliverable?.expectedLength || '');
  if (el && !new RegExp(el.replace(/[~]/g, '').trim().slice(0, 3)).test(prompt + ' ' + delInstr + ' ' + (bp.deliverable?.expectedLength || ''))) {
    // length often appears as "~300 words" — check for digit sequence
    const digits = (el.match(/\d+/) || [])[0];
    if (digits && !(prompt + delInstr + (bp.deliverable?.expectedLength || '')).includes(digits)) {
      issues.push({ code: 'length', message: `Expected length ${el} is not reflected in the task or deliverable.` });
    }
  }
  if (!delInstr || delInstr.length < 20) {
    issues.push({ code: 'deliverable_thin', message: 'Deliverable instructions are missing or too thin.' });
  }
  return issues;
}
