import { config } from "./config.js";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function voyageErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const raw = j.detail ?? j.message ?? body;
    if (typeof raw === "string") {
      if (/not yet added.*billing|payment method|rate limit|reduced rate limits/i.test(raw)) {
        return `${raw} — add billing at voyageai.com or wait and retry indexing.`;
      }
      return raw;
    }
    if (Array.isArray(raw)) {
      return raw
        .map((d) =>
          typeof d === "object" && d && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)
        )
        .join("; ");
    }
    if (typeof raw === "object" && raw) return JSON.stringify(raw);
    return String(raw);
  } catch {
    return body.slice(0, 400);
  }
}
function isRateLimitError(status: number, body: string): boolean {
  return (
    status === 429 ||
    /rate limit/i.test(body) ||
    /reduced rate limits/i.test(body)
  );
}

async function voyageRequest(
  body: Record<string, unknown>,
  label: string,
  maxAttempts = 4
): Promise<{ data: { embedding: number[] }[] }> {
  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.voyageApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as { data: { embedding: number[] }[] };

    lastErr = await res.text();
    if (isRateLimitError(res.status, lastErr) && attempt < maxAttempts - 1) {
      const waitMs = 22_000 * (attempt + 1);
      console.warn(`[voyage] ${label} rate-limited — retry ${attempt + 1}/${maxAttempts - 1} in ${waitMs / 1000}s`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Voyage ${label} failed: ${voyageErrorMessage(lastErr)}`);
  }
  throw new Error(`Voyage ${label} failed: ${voyageErrorMessage(lastErr)}`);
}

export async function embedTexts(texts: string[], batchSize = 16): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const data = await voyageRequest(
      { input: batch, model: config.voyageModel, input_type: "document" },
      `embed batch ${Math.floor(i / batchSize) + 1}`
    );
    out.push(...data.data.map((d) => d.embedding));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const data = await voyageRequest(
    { input: [text], model: config.voyageModel, input_type: "query" },
    "query embed"
  );
  return data.data[0].embedding;
}
