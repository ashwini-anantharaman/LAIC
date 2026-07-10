import { YoutubeTranscript } from "youtube-transcript";
import { config } from "./config.js";

/** Parse a YouTube watch, youtu.be, shorts, embed, or live URL into an 11-char video id. */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id?.length === 11 ? id : null;
    }
    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      if (u.pathname === "/watch" || u.pathname.startsWith("/watch/")) {
        const v = u.searchParams.get("v");
        return v?.length === 11 ? v : null;
      }
      const parts = u.pathname.split("/").filter(Boolean);
      for (const key of ["shorts", "embed", "live", "v"] as const) {
        const i = parts.indexOf(key);
        if (i >= 0 && parts[i + 1]?.length === 11) return parts[i + 1];
      }
    }
  } catch {
    /* not a valid URL — fall through to regex */
  }

  const m = trimmed.match(
    /(?:[?&]v=|\/(?:shorts|embed|live|v)\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m?.[1] ?? null;
}

export interface TranscriptSegment {
  text: string;
  timeStart: number;
  timeEnd: number;
}

function toSegments(
  raw: { text: string; offset: number; duration: number }[]
): TranscriptSegment[] {
  return raw
    .map((t) => ({
      text: t.text.trim(),
      timeStart: Math.floor(t.offset / 1000),
      timeEnd: Math.ceil((t.offset + (t.duration || 0)) / 1000),
    }))
    .filter((s) => s.text.length > 0);
}

async function fetchViaTranscriptApi(videoUrl: string): Promise<string> {
  const key = config.transcriptApiKey;
  if (!key) throw new Error("Transcript API key not configured");

  const endpoint = new URL("https://transcriptapi.com/api/v2/youtube/transcript");
  endpoint.searchParams.set("video_url", videoUrl);
  endpoint.searchParams.set("format", "text");

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(120_000),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Transcript API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  let text = body.trim();
  try {
    const json = JSON.parse(body) as { transcript?: string; text?: string; content?: string };
    text = (json.transcript ?? json.text ?? json.content ?? body).trim();
  } catch {
    /* plain text response */
  }

  if (text.length < 20) {
    throw new Error("Transcript API returned empty transcript");
  }
  return text;
}

/** Fetch YouTube captions as timestamped segments for RAG indexing. */
export async function fetchYouTubeTranscriptSegments(input: string): Promise<TranscriptSegment[]> {
  const videoId = extractYouTubeId(input);
  if (!videoId) {
    throw new Error(
      "Invalid YouTube URL. Use a watch link (youtube.com/watch?v=…), youtu.be/…, or youtube.com/shorts/…"
    );
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const langAttempts: (string | undefined)[] = [undefined, "en", "en-US", "en-GB"];
  let lastError: unknown;

  for (const lang of langAttempts) {
    try {
      const raw = await YoutubeTranscript.fetchTranscript(
        videoId,
        lang ? { lang } : undefined
      );
      const segments = toSegments(raw);
      if (segments.length) return segments;
    } catch (e) {
      lastError = e;
      console.warn(`[youtube] Transcript attempt (${lang ?? "auto"}) failed for ${videoId}:`, e);
    }
  }

  if (config.transcriptApiKey) {
    try {
      console.info(`[youtube] Falling back to Transcript API for ${videoId}`);
      const text = await fetchViaTranscriptApi(watchUrl);
      // Fallback API returns plain text without timestamps
      return [{ text, timeStart: 0, timeEnd: 0 }];
    } catch (e) {
      lastError = e;
    }
  }

  const msg =
    lastError instanceof Error
      ? lastError.message.replace(/^\[YoutubeTranscript\] 🚨\s*/, "")
      : "Could not fetch captions";

  throw new Error(
    `${msg}. The video may have captions disabled, or YouTube blocked the request. ` +
      (config.transcriptApiKey
        ? "Transcript API fallback also failed."
        : "Set TRANSCRIPT_API_KEY for a paid fallback (transcriptapi.com).")
  );
}

export function isYouTubeUrl(url: string): boolean {
  return Boolean(extractYouTubeId(url));
}
