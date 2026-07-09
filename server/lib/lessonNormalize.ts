import type { AnimationConfig } from "../agents/animation.js";

export interface LessonBlueprint {
  moduleSummary: string;
  learningObjectives: string[];
  text: {
    heading: string;
    keyPoints: string[];
    sourceHighlight: string;
    modeEmoji: string;
  };
  animation: {
    description: string;
    visualFocus: string;
  };
  assessment: {
    mcqFocus: string;
    misconceptionToProbe: string;
    mcqTopics: string[];
    flashcardThemes: string[];
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asStringArray(v: unknown, fallback: string[]): string[] {
  if (Array.isArray(v)) {
    const items = v.map((x) => coerceStudyText(x)).filter(Boolean);
    return items.length ? items : fallback;
  }
  if (typeof v === "string" && v.trim()) {
    const coerced = coerceStudyText(v);
    const parts = coerced.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    if (coerced) return [coerced];
    return [v.trim()];
  }
  return fallback;
}

function kebabToCamel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalizeSvgAttrs(attrs: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "string" || typeof v === "number") {
      out[kebabToCamel(k)] = v;
    }
  }
  return out;
}

function coerceAnimationElement(
  item: Record<string, unknown>,
  i: number
): AnimationConfig["elements"][0] | null {
  const allowedTags = new Set(["circle", "rect", "line", "path", "text"]);
  const tag = asString(item.tag, "") || asString(item.type, "circle");
  if (!allowedTags.has(tag)) return null;

  let attrs = asRecord(item.attrs);
  if (!Object.keys(attrs).length) {
    const skip = new Set(["id", "tag", "type", "label", "attrs", "children"]);
    attrs = {};
    for (const [k, v] of Object.entries(item)) {
      if (!skip.has(k) && (typeof v === "string" || typeof v === "number")) {
        attrs[k] = v;
      }
    }
  }

  return {
    id: asString(item.id, `el-${i + 1}`).replace(/^#/, ""),
    tag: tag as AnimationConfig["elements"][0]["tag"],
    attrs: normalizeSvgAttrs(attrs),
    ...(item.label ? { label: asString(item.label, "") } : {}),
  };
}

function synthesizeTimeline(elements: AnimationConfig["elements"]): AnimationConfig["timeline"] {
  return elements.slice(0, 8).map((el, i) => ({
    target: `#${el.id}`,
    duration: 0.9,
    delay: i * 0.15,
    props: { opacity: 0.35 },
    ease: "power2.inOut",
  }));
}

export function isFallbackAnimation(config: AnimationConfig): boolean {
  return (
    config.elements.length === 3 &&
    config.elements[0]?.id === "n1" &&
    config.elements[1]?.id === "n2" &&
    config.elements[2]?.id === "link"
  );
}

export function normalizeBlueprint(raw: unknown, moduleName: string): LessonBlueprint {
  const r = asRecord(raw);
  const text = asRecord(r.text);
  const animation = asRecord(r.animation);
  const assessment = asRecord(r.assessment);

  const animationDescription =
    asString(animation.description, "") ||
    asString(r.animationDescription, "") ||
    asString(r.animationBrief, "") ||
    `Step-by-step visualization of ${moduleName}: show the main parts and how they interact.`;

  return {
    moduleSummary: asString(r.moduleSummary, `Students learn the essentials of ${moduleName}.`),
    learningObjectives: asStringArray(r.learningObjectives, [
      `Define ${moduleName}`,
      `Explain why ${moduleName} matters`,
      `Apply ${moduleName} to a real example`,
    ]),
    text: {
      heading: asString(text.heading, `Understanding ${moduleName}`),
      keyPoints: asStringArray(text.keyPoints, [
        `What ${moduleName} is`,
        `Why it matters`,
        `How it connects to prior ideas`,
      ]),
      sourceHighlight: asString(text.sourceHighlight, moduleName),
      modeEmoji: asString(text.modeEmoji, "💡"),
    },
    animation: {
      description: animationDescription,
      visualFocus: asString(animation.visualFocus, `Core diagram for ${moduleName}`),
    },
    assessment: {
      mcqFocus: asString(assessment.mcqFocus, `Main idea of ${moduleName}`),
      misconceptionToProbe: asString(
        assessment.misconceptionToProbe,
        `A common misunderstanding about ${moduleName}`
      ),
      mcqTopics: asStringArray(assessment.mcqTopics, [
        `Definition of ${moduleName}`,
        `Application of ${moduleName}`,
        `Common misconception about ${moduleName}`,
      ]),
      flashcardThemes: asStringArray(assessment.flashcardThemes, [
        moduleName,
        "Key term",
        "Definition",
        "Example",
        "Application",
      ]),
    },
  };
}

export interface StudySection {
  concept: string;
  text: string;
  check?: string;
}

export function sanitizeLessonText(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\*/g, "*")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function coerceStudyText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((x) => coerceStudyText(x))
      .filter(Boolean)
      .join("\n\n");
  }
  if (typeof value !== "string") {
    return sanitizeLessonText(String(value ?? ""));
  }
  return stripJsonArrayArtifacts(value);
}

function stripJsonArrayArtifacts(s: string): string {
  let t = s.trim();
  if (!t.startsWith("[")) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return sanitizeLessonText(t.slice(1, -1));
    }
    return sanitizeLessonText(t);
  }

  if (t.endsWith("]")) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => sanitizeLessonText(String(x)))
          .filter(Boolean)
          .join("\n\n");
      }
    } catch {
      /* try manual extraction below */
    }
  }

  const inner = t.replace(/^\[\s*/, "").replace(/\s*\]$/, "");
  const quoted = [...inner.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) =>
    sanitizeLessonText(m[1].replace(/\\"/g, '"'))
  );
  if (quoted.length) {
    return quoted.filter(Boolean).join("\n\n");
  }

  let single = inner.replace(/^["']/, "").replace(/["']$/, "");
  single = single.replace(/["']\s*\]?\s*$/, "");
  return sanitizeLessonText(single);
}

export function isPlaceholderMcqOption(opt: string): boolean {
  return /^option\s*[a-d]$/i.test(opt.trim());
}

export function isPlaceholderMcq(options: string[]): boolean {
  if (options.length < 4) return true;
  return options.filter((o) => isPlaceholderMcqOption(o)).length >= 3;
}

export function extractBodyFromRaw(raw: unknown): string[] {
  const r = asRecord(raw);
  const candidates = [r.body, r.paragraphs, r.content, r.text];
  for (const c of candidates) {
    const arr = asStringArray(c, []);
    if (arr.length) return arr;
  }
  return [];
}

export function normalizeStudySections(
  raw: unknown,
  moduleName: string,
  blueprint: LessonBlueprint
): StudySection[] {
  const r = asRecord(raw);
  const list = Array.isArray(r.sections) ? r.sections : [];
  const sections = list
    .map((item) => {
      const o = asRecord(item);
      const concept = coerceStudyText(o.concept);
      const text = coerceStudyText(o.text);
      if (!concept || !text) return null;
      return { concept, text };
    })
    .filter((s): s is StudySection => s !== null);

  if (sections.length) return sections;

  const body = extractBodyFromRaw(raw);
  const points = blueprint.text.keyPoints.length ? blueprint.text.keyPoints : [moduleName];
  return points.slice(0, 8).map((point, i) => {
    const para = sanitizeLessonText(body[i] ?? body[0] ?? `${point} is an important idea in ${moduleName}.`);
    return { concept: point, text: para };
  });
}

export function normalizeTextBlock(
  raw: unknown,
  blueprint: LessonBlueprint,
  moduleName: string
) {
  const r = asRecord(raw);
  const body = extractBodyFromRaw(raw);
  const blueprintBody = blueprint.text.keyPoints.map((point, i) => {
    const prefix = i === 0 ? `${moduleName} — ` : "";
    return `${prefix}${point}`;
  });
  const fallbackBody = blueprintBody.length >= 2
    ? blueprintBody.map(sanitizeLessonText)
    : [
        `${moduleName} is a core idea in this module.`,
        `Here's what matters: ${blueprint.text.keyPoints.join(" ")}`,
        `Remember the key term **${blueprint.text.sourceHighlight}** when you review.`,
      ].map(sanitizeLessonText);
  const sections = normalizeStudySections(raw, moduleName, blueprint);
  const bodyFromSections = sections.map((s) => s.text);
  return {
    heading: sanitizeLessonText(asString(r.heading, blueprint.text.heading)),
    body: body.length ? body.map(sanitizeLessonText) : bodyFromSections.length ? bodyFromSections : fallbackBody,
    sections,
    sourceExcerpt: sanitizeLessonText(
      asString(
        r.sourceExcerpt,
        `"${blueprint.text.sourceHighlight}" — excerpt from course materials on ${moduleName}.`
      )
    ),
    citation: asString(r.citation, "Course materials"),
    sourceHighlight: asString(r.sourceHighlight, blueprint.text.sourceHighlight),
    modeEmoji: asString(r.modeEmoji, blueprint.text.modeEmoji),
  };
}

export function normalizeMcqBlock(raw: unknown, moduleName: string) {
  const r = asRecord(raw);
  const rawOptions = asStringArray(r.options, []).map(sanitizeLessonText).filter(Boolean);
  let options = rawOptions.slice(0, 4);
  if (isPlaceholderMcq(options)) {
    options = [];
  }
  while (options.length < 4) {
    options.push("");
  }

  let correct = typeof r.correct === "number" ? r.correct : 0;
  if (correct < 0 || correct >= options.length) correct = 0;

  let hints: { level: string; text: string }[] = [];
  if (Array.isArray(r.hints)) {
    hints = r.hints.map((h, i) => {
      const item = asRecord(h);
      return {
        level: asString(item.level, ["Nudge", "Concept", "Direction", "Explanation"][i] ?? "Hint"),
        text: sanitizeLessonText(asString(item.text, "Think about the definition.")),
      };
    });
  } else if (r.hints && typeof r.hints === "object") {
    hints = Object.entries(r.hints as Record<string, string>).map(([level, text]) => ({
      level,
      text: sanitizeLessonText(String(text)),
    }));
  }
  while (hints.length < 4) {
    hints.push({
      level: ["Nudge", "Concept", "Direction", "Explanation"][hints.length] ?? "Hint",
      text: "Re-read the lesson text and look for the key term in your sources.",
    });
  }

  return {
    question: sanitizeLessonText(asString(r.question, `Which statement best describes ${moduleName}?`)),
    options,
    correct,
    hints: hints.slice(0, 4),
    explanation: sanitizeLessonText(asString(r.explanation, "")),
  };
}

export function isValidMcqBlock(mcq: ReturnType<typeof normalizeMcqBlock>): boolean {
  return Boolean(
    mcq.question &&
      mcq.options.length === 4 &&
      mcq.options.every((o) => o.trim().length > 0) &&
      !isPlaceholderMcq(mcq.options)
  );
}

export function normalizeMcqBlocks(raw: unknown, moduleName: string) {
  const r = asRecord(raw);
  const list = Array.isArray(r.questions)
    ? r.questions
    : Array.isArray(r.mcqs)
      ? r.mcqs
      : Array.isArray(raw)
        ? raw
        : [raw];
  return list.map((item) => normalizeMcqBlock(item, moduleName));
}

export function normalizeFlashcardBlock(raw: unknown, blueprint: LessonBlueprint, moduleName: string) {
  const r = asRecord(raw);
  const title = asString(r.title, `${moduleName} flashcards`);
  let cards: { front: string; back: string }[] = [];

  if (Array.isArray(r.cards)) {
    cards = r.cards
      .map((c) => {
        const card = asRecord(c);
        return {
          front: asString(card.front, ""),
          back: asString(card.back, ""),
        };
      })
      .filter((c) => c.front && c.back);
  }

  if (!cards.length) {
    cards = blueprint.assessment.flashcardThemes.slice(0, 6).map((theme: string) => ({
      front: theme,
      back: `Key point about ${theme} in ${moduleName}.`,
    }));
  }

  return { title, cards };
}

export function fallbackAnimation(conceptName: string): AnimationConfig {
  return {
    viewBox: "0 0 520 220",
    description: `Concept: ${conceptName}`,
    elements: [
      {
        id: "n1",
        tag: "circle",
        attrs: { cx: 130, cy: 100, r: 30, fill: "#ede9fe", stroke: "#a78bfa", strokeWidth: 2 },
      },
      {
        id: "n2",
        tag: "circle",
        attrs: { cx: 390, cy: 100, r: 30, fill: "#ede9fe", stroke: "#a78bfa", strokeWidth: 2 },
      },
      {
        id: "link",
        tag: "line",
        attrs: { x1: 160, y1: 100, x2: 360, y2: 100, stroke: "#a78bfa", strokeWidth: 3 },
      },
    ],
    timeline: [
      { target: "#link", duration: 1.2, delay: 0, props: { opacity: 0.35 }, ease: "power2.inOut" },
      { target: "#n1", duration: 0.9, delay: 0.15, props: { scale: 1.12 }, ease: "power2.inOut" },
      { target: "#n2", duration: 0.9, delay: 0.35, props: { scale: 1.12 }, ease: "power2.inOut" },
    ],
  };
}

export function normalizeAnimationConfig(raw: unknown, conceptName: string): AnimationConfig {
  const r = asRecord(raw);

  const elements = (Array.isArray(r.elements) ? r.elements : [])
    .map((el, i) => coerceAnimationElement(asRecord(el), i))
    .filter((el): el is AnimationConfig["elements"][0] => el !== null)
    .slice(0, 6);

  const timeline: AnimationConfig["timeline"] = [];
  for (const step of Array.isArray(r.timeline) ? r.timeline : []) {
    const item = asRecord(step);
    const target = asString(item.target, "");
    if (!target) continue;
    const props = normalizeSvgAttrs(asRecord(item.props));
    timeline.push({
      target: target.startsWith("#") ? target : `#${target}`,
      duration: typeof item.duration === "number" ? item.duration : 1,
      delay: typeof item.delay === "number" ? item.delay : 0,
      props,
      ease: asString(item.ease, "power2.inOut"),
    });
    if (timeline.length >= 8) break;
  }

  const resolvedTimeline = timeline.length ? timeline : elements.length ? synthesizeTimeline(elements) : [];

  if (!elements.length || !resolvedTimeline.length) {
    return fallbackAnimation(conceptName);
  }

  return {
    viewBox: asString(r.viewBox, "0 0 520 220"),
    description: asString(r.description, `Animation: ${conceptName}`),
    elements,
    timeline: resolvedTimeline,
  };
}

export interface DraftCourseChapter {
  label: string;
  title: string;
  modules: { name: string; prereqs: string[] }[];
}

export interface DraftCourseStructure {
  title: string;
  chapters: DraftCourseChapter[];
  prerequisiteEdges: { from: string; to: string }[];
  message: string;
}

export function normalizeDraftCourse(raw: unknown): DraftCourseStructure {
  const r = asRecord(raw);
  const chaptersRaw = Array.isArray(r.chapters) ? r.chapters : [];
  const chapters: DraftCourseChapter[] = [];

  for (let ci = 0; ci < chaptersRaw.length; ci++) {
    const c = asRecord(chaptersRaw[ci]);
    const modulesRaw = Array.isArray(c.modules) ? c.modules : [];
    const modules: DraftCourseChapter["modules"] = [];

    for (let mi = 0; mi < modulesRaw.length; mi++) {
      const mod = asRecord(modulesRaw[mi]);
      const name = asString(mod.name, "");
      if (!name) continue;
      modules.push({
        name,
        prereqs: asStringArray(mod.prereqs, []),
      });
    }

    if (modules.length === 0) continue;
    chapters.push({
      label: asString(c.label, `CH ${ci + 1}`),
      title: asString(c.title, `Chapter ${ci + 1}`),
      modules,
    });
  }

  if (chapters.length === 0) {
    chapters.push({
      label: "CH 1",
      title: "General",
      modules: [{ name: "Introduction", prereqs: [] }],
    });
  }

  const edgesRaw = Array.isArray(r.prerequisiteEdges) ? r.prerequisiteEdges : [];
  const prerequisiteEdges = edgesRaw
    .map((e) => {
      const edge = asRecord(e);
      return {
        from: asString(edge.from, ""),
        to: asString(edge.to, ""),
      };
    })
    .filter((e) => e.from && e.to);

  return {
    title: asString(r.title, "Untitled course"),
    chapters,
    prerequisiteEdges,
    message: asString(r.message, ""),
  };
}
