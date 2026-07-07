export interface StudySection {
  concept: string;
  text: string;
  check?: string;
}

export function paragraphsFromStudyText(text: string): string[] {
  const clean = coerceStudyText(text);
  const parts = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : clean ? [clean] : [];
}

export function sanitizeLessonText(s: string): string {
  let out = String(s ?? "");
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\\*/g, "*")
      .replace(/\\_/g, "_")
      .replace(/\\\\/g, "\\");
  }
  out = out.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~])/g, "$1");
  return out.replace(/\r\n/g, "\n").trim();
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

/** Coerce Claude output that may be a JSON array string or actual array into display prose. */
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

export function sectionsFromTextContent(c: Record<string, unknown>, conceptName: string): StudySection[] {
  if (Array.isArray(c.sections)) {
    return (c.sections as StudySection[])
      .map((s) => ({
        concept: coerceStudyText(s.concept),
        text: coerceStudyText(s.text),
      }))
      .filter((s) => s.concept && s.text);
  }

  let body = Array.isArray(c.body)
    ? (c.body as unknown[]).map((p) => coerceStudyText(p))
    : [];
  if (!body.length && c.body != null) {
    body = [coerceStudyText(c.body)];
  }
  if (body.length === 1 && body[0].includes("\n")) {
    const parts = body[0]
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return parts.map((text, i) => ({
        concept: i === 0 ? conceptName : `${conceptName} — ${i + 1}`,
        text,
      }));
    }
  }

  if (body.length > 1) {
    return body.map((text, i) => ({
      concept: i === 0 ? conceptName : `${conceptName} — ${i + 1}`,
      text,
    }));
  }

  return body.map((text, i) => ({
    concept: i === 0 ? conceptName : `${conceptName} — ${i + 1}`,
    text,
  }));
}
