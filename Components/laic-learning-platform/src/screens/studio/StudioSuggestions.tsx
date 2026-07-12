import { useCallback, useEffect, useState } from "react";

import type { ContentPolicy, StudioBlock, StudioPage } from "../../learning/types";
import { AgentAPI } from "../../lib/api";
import { youtubeThumbnailUrl } from "../../lib/youtube";
import { BLOCK_LABELS } from "./studioTheme";
import "./studio.css";

export type SuggestionVideo = {
  title: string;
  why: string;
  source: string;
  duration?: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
};

export type SuggestionImage = {
  title: string;
  why: string;
  source: string;
  imageUrl?: string;
};

type Props = {
  open: boolean;
  editMode: boolean;
  courseId: string;
  policy: ContentPolicy;
  page: StudioPage;
  pageIndex: number;
  block: StudioBlock | null;
  onClose: () => void;
  onInsertVideo: (video: SuggestionVideo) => void;
  onInsertImage: (image: SuggestionImage) => void;
  onCreateAnimation: (image: SuggestionImage) => void;
};

function pageSummary(page: StudioPage): string {
  const bits: string[] = [];
  for (const b of page.blocks) {
    if (b.type === "hook") bits.push(b.q);
    if (b.type === "study") bits.push(b.title, b.html.replace(/<[^>]+>/g, " ").slice(0, 200));
  }
  return bits.join(" · ").slice(0, 500);
}

function videoThumbnail(video: SuggestionVideo): string | null {
  return video.thumbnailUrl ?? (video.youtubeUrl ? youtubeThumbnailUrl(video.youtubeUrl) : null);
}

function VideoSuggestionThumb({ video }: { video: SuggestionVideo }) {
  const thumb = videoThumbnail(video);
  const inner = (
    <>
      {thumb ? (
        <>
          <img src={thumb} alt="" loading="lazy" />
          <div className="studio-play-overlay" aria-hidden>
            ▶
          </div>
        </>
      ) : (
        <div className="studio-play">▶</div>
      )}
      {video.duration ? <span className="studio-dur">{video.duration}</span> : null}
    </>
  );

  if (video.youtubeUrl) {
    return (
      <a
        className="studio-sthumb vid studio-thumb-btn"
        href={video.youtubeUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Preview ${video.title} on YouTube`}
      >
        {inner}
      </a>
    );
  }

  return <div className="studio-sthumb vid">{inner}</div>;
}

function ImageSuggestionPreview({ image }: { image: SuggestionImage }) {
  const [expanded, setExpanded] = useState(false);

  if (!image.imageUrl) {
    return (
      <div className="studio-sthumb img studio-sthumb-empty">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M21 16l-5-5-4 4-2-2-4 4" />
        </svg>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="studio-sthumb img studio-thumb-btn"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse image preview" : "Expand image preview"}
      >
        <img src={image.imageUrl} alt={image.title} loading="lazy" />
      </button>
      {expanded ? (
        <div className="studio-img-preview-expanded">
          <img src={image.imageUrl} alt={image.title} />
        </div>
      ) : null}
    </>
  );
}

export function StudioSuggestions({
  open,
  editMode,
  courseId,
  policy,
  page,
  pageIndex,
  block,
  onClose,
  onInsertVideo,
  onInsertImage,
  onCreateAnimation,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<SuggestionVideo[]>([]);
  const [images, setImages] = useState<SuggestionImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await AgentAPI.studioSuggestions({
        courseId,
        policy,
        pageTitle: page.title,
        pageSummary: pageSummary(page),
      });
      setVideos(result.videos ?? []);
      setImages(result.images ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load suggestions");
    } finally {
      setLoading(false);
    }
  }, [courseId, policy, page]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, pageIndex]);

  if (!open) return null;

  const blockLabel = block ? BLOCK_LABELS[block.type] : "page";
  const canInsert = editMode;

  return (
    <aside className="studio-suggest show" aria-label="AI suggestions">
      <div className="studio-sug-h">
        <div>
          <div className="studio-sug-kick">✦ AI suggestions</div>
          <div className="studio-sug-for">
            for “{page.title}” · {blockLabel}
          </div>
        </div>
        <button type="button" className="studio-sug-close" onClick={onClose} aria-label="Close suggestions">
          ›
        </button>
      </div>

      <div className="studio-sug-scroll">
        {loading ? <p className="studio-sug-note">Finding videos and images…</p> : null}
        {error ? <p className="studio-sug-note" style={{ color: "#ffb6c6" }}>{error}</p> : null}

        <div className="studio-sug-group">
          <svg className="studio-gi" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.7">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Video embeds
        </div>
        {videos.length === 0 && !loading ? <p className="studio-sug-note">No video ideas for this page.</p> : null}
        {videos.map((video, i) => (
          <div key={`${video.title}-${i}`} className="studio-sugcard">
            <VideoSuggestionThumb video={video} />
            <h5>{video.title}</h5>
            <p className="studio-swhy">{video.why}</p>
            <div className="studio-ssrc">{video.source}</div>
            {video.youtubeUrl ? (
              <a className="studio-ssrc" href={video.youtubeUrl} target="_blank" rel="noreferrer">
                {video.youtubeUrl}
              </a>
            ) : null}
            <button
              type="button"
              className="studio-sins"
              disabled={!canInsert}
              onClick={() => onInsertVideo(video)}
            >
              {canInsert ? "Insert into this page" : "Edit mode to insert"}
            </button>
          </div>
        ))}

        <div className="studio-sug-group" style={{ marginTop: 14 }}>
          <svg className="studio-gi" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="1.7">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 16l-5-5 4 4" />
          </svg>
          Image embeds
        </div>
        {images.length === 0 && !loading ? <p className="studio-sug-note">No image ideas for this page.</p> : null}
        {images.map((image, i) => (
          <div key={`${image.title}-${i}`} className="studio-sugcard">
            <ImageSuggestionPreview image={image} />
            <h5>{image.title}</h5>
            <p className="studio-swhy">{image.why}</p>
            <div className="studio-ssrc">{image.source}</div>
            <button
              type="button"
              className="studio-sins"
              disabled={!canInsert}
              onClick={() => onInsertImage(image)}
            >
              {canInsert ? "Insert as image block" : "Edit mode to insert"}
            </button>
            <button
              type="button"
              className="studio-sins alt"
              disabled={!canInsert}
              onClick={() => onCreateAnimation(image)}
            >
              ✦ Create as interactive animation
            </button>
          </div>
        ))}

        <p className="studio-sug-note">
          Tailored to the page you&apos;re viewing. Video inserts add an embed to a lesson; an image can become an
          interactive animation.
        </p>

        <button type="button" className="studio-sins alt" style={{ marginTop: 8 }} onClick={() => void load()} disabled={loading}>
          ↻ Refresh suggestions
        </button>
      </div>
    </aside>
  );
}
