import { writeFile, mkdir, stat } from "fs/promises";
import path from "path";
import { config, isGenerativeManimConfigured } from "./config.js";

export interface ManimVideoResult {
  videoUrl: string;
  publicPath: string;
  code: string;
  sceneClass: string;
}

const ANIMATIONS_DIR = path.join(process.cwd(), "server/data/animations");

function apiBase(): string {
  return config.generativeManimUrl.replace(/\/$/, "");
}

export async function checkGenerativeManimHealth(): Promise<{
  ok: boolean;
  status?: string;
  detail?: string;
}> {
  if (!isGenerativeManimConfigured()) {
    return { ok: false, detail: "GENERATIVE_MANIM_API_URL not configured" };
  }
  try {
    const res = await fetch(`${apiBase()}/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, detail: `Health check HTTP ${res.status}` };
    const data = (await res.json()) as { status?: string };
    return { ok: data.status === "healthy" || data.status === "degraded", status: data.status };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export function extractManimCode(raw: string): string {
  const fenced = raw.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

export function extractSceneClass(code: string): string {
  const match = code.match(/class\s+(\w+)\s*\(\s*Scene\s*\)/);
  return match?.[1] ?? "GenScene";
}

async function persistVideo(remoteUrl: string, fileId: string): Promise<string> {
  await mkdir(ANIMATIONS_DIR, { recursive: true });
  const filename = `${fileId}.mp4`;
  const localPath = path.join(ANIMATIONS_DIR, filename);

  const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Failed to download Manim video: HTTP ${res.status}`);
  if (!res.body) throw new Error("Empty video response body");

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buf);
  const info = await stat(localPath);
  if (info.size < 1024) throw new Error("Downloaded video file is too small — render may have failed");

  return `/api/media/animations/${filename}`;
}

export async function generateManimVideo(
  prompt: string,
  opts?: { projectName?: string; iteration?: number }
): Promise<ManimVideoResult> {
  if (!isGenerativeManimConfigured()) {
    throw new Error(
      "Generative Manim API is not configured. Set GENERATIVE_MANIM_API_URL (e.g. http://127.0.0.1:8080) and run the API via Docker."
    );
  }

  const body: Record<string, unknown> = {
    prompt,
    engine: config.generativeManimEngine,
    aspect_ratio: config.generativeManimAspectRatio,
    project_name: opts?.projectName ?? "laic",
    iteration: opts?.iteration ?? 1,
  };
  if (config.generativeManimModel) body.model = config.generativeManimModel;

  const res = await fetch(`${apiBase()}/v1/video/generation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000),
  });

  const text = await res.text();
  let data: { video_url?: string; code?: string; error?: string; message?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(`Generative Manim returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `Generative Manim HTTP ${res.status}`);
  }

  const remoteUrl = data.video_url;
  const code = extractManimCode(data.code ?? "");
  if (!remoteUrl) throw new Error("Generative Manim did not return a video_url");
  if (!code) throw new Error("Generative Manim did not return Manim code");

  const fileId = `manim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const publicPath = await persistVideo(remoteUrl, fileId);

  return {
    videoUrl: publicPath,
    publicPath,
    code,
    sceneClass: extractSceneClass(code),
  };
}
