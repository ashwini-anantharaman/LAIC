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
    /* fall through */
  }

  const m = trimmed.match(
    /(?:[?&]v=|\/(?:shorts|embed|live|v)\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m?.[1] ?? null;
}

/** Standard YouTube thumbnail for an id or watch URL (no API key). */
export function youtubeThumbnailUrl(input: string, quality: "default" | "hq" | "mq" | "sd" | "maxres" = "hq"): string | null {
  const id = extractYouTubeId(input);
  if (!id) return null;
  const file = quality === "default" ? "default" : `${quality}default`;
  return `https://img.youtube.com/vi/${id}/${file}.jpg`;
}

export function youtubeEmbedSrc(
  url: string,
  startSeconds?: number,
  endSeconds?: number
): string | null {
  const id = extractYouTubeId(url);
  if (!id) return null;
  const p = new URLSearchParams();
  if (startSeconds) p.set("start", String(startSeconds));
  if (endSeconds) p.set("end", String(endSeconds));
  const qs = p.toString();
  return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ""}`;
}
