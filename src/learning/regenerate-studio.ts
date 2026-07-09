import type { ContentPolicy, StudioCourseData } from "./types";
import { AgentAPI, DataAPI } from "../lib/api";
import { isSkeletonStudio } from "./load-studio";
import { friendlyGenerationError } from "../../shared/studio/skeleton";

const GENERATE_PROMPT =
  "Build a structured course from the uploaded sources. If the source is a multi-chapter textbook, preserve its chapter structure with one module per chapter.";

function isReady(studio: StudioCourseData | null | undefined): studio is StudioCourseData {
  return Boolean(studio?.pages?.length && !isSkeletonStudio(studio));
}

export async function waitForStudioGeneration(
  courseId: string,
  policy: ContentPolicy,
  onProgress: (message: string) => void
): Promise<StudioCourseData> {
  onProgress("Starting generation…");
  await AgentAPI.generateStudioCourse(courseId, policy, GENERATE_PROMPT);

  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = await AgentAPI.studioGenerateStatus(courseId);
    if (status.progress) onProgress(status.progress);

    if (status.status === "done") {
      const studio =
        status.studio && !isSkeletonStudio(status.studio)
          ? status.studio
          : await DataAPI.getStudio(courseId).catch(() => null);
      if (isReady(studio)) return studio;
      throw new Error(
        friendlyGenerationError(
          "Generation finished but returned placeholder content only — check API credits and sources, then retry."
        )
      );
    }

    if (status.status === "error") {
      throw new Error(friendlyGenerationError(status.error ?? "Generation failed"));
    }

    const saved = await DataAPI.getStudio(courseId).catch(() => null);
    if (isReady(saved)) return saved;

    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Generation is taking longer than expected — try again in a minute.");
}
