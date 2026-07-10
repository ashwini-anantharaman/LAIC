import { coerceStudyText } from "../../lib/study-sections";

/** Derive hook headline + follow-up from lesson text / concept metadata. */
export function deriveHookContent(opts: {
  conceptName: string;
  subtitle?: string;
  heading?: string;
  body?: string[];
}): { headline: string; subtext: string } {
  const firstBody = opts.body?.[0] ? coerceStudyText(opts.body[0]) : "";
  const heading = coerceStudyText(opts.heading ?? "") || opts.conceptName;

  if (firstBody) {
    const sentences = firstBody.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) ?? [firstBody];
    const headline = sentences[0] ?? heading;
    const subtext =
      opts.subtitle?.trim() ||
      (sentences[1] ? `${sentences[1].replace(/\.$/, "")}?` : "Let's find out together.");
    return { headline, subtext: subtext.endsWith("?") ? subtext : `${subtext}?` };
  }

  return {
    headline: heading,
    subtext: opts.subtitle?.trim() || `What do you already know about ${opts.conceptName.toLowerCase()}?`,
  };
}
