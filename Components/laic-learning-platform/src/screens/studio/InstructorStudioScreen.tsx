import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioCourseData } from "../../learning/types";
import { emptyStudio, isSkeletonStudio, modulesToStudioPages } from "../../learning/load-studio";
import { linkVocabInStudio } from "../../learning/studio-vocab";
import { friendlyGenerationError } from "../../../shared/studio/skeleton";
import { waitForStudioGeneration } from "../../learning/regenerate-studio";
import { saveStudioAndSyncModules } from "../../learning/adapters";
import { AgentAPI, DataAPI } from "../../lib/api";
import { useApp } from "../../store/AppContext";
import type { CourseModule } from "../../types";
import { StudioEditor } from "./StudioEditor";
import { StudioOnboarding } from "./StudioOnboarding";
import "./studio.css";

type Phase = "onboarding" | "editor";

export function InstructorStudioScreen() {
  const {
    courseId,
    courseTitle,
    modules,
    setModules,
    setScreen,
    publishCourse,
    showToast,
    syncCourse,
    currentModuleIndex,
    createStep,
    ragSources,
  } = useApp();

  const [phase, setPhase] = useState<Phase>("onboarding");
  const [studio, setStudio] = useState<StudioCourseData>(emptyStudio());
  const [loading, setLoading] = useState(true);
  const [resumeGenerate, setResumeGenerate] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [genMessage, setGenMessage] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [studioDirty, setStudioDirty] = useState(false);
  const skipReloadRef = useRef(false);

  const handleStudioChange = (next: StudioCourseData) => {
    setStudioDirty(true);
    setStudio(next);
  };

  const load = useCallback(async () => {
    if (!courseId) return;
    if (skipReloadRef.current) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setResumeGenerate(false);
    try {
      const saved = await DataAPI.getStudio(courseId);
      if (saved?.pages?.length && !isSkeletonStudio(saved)) {
        setStudio(linkVocabInStudio(saved));
        setStudioDirty(false);
        setPhase("editor");
        return;
      }

      const status = await AgentAPI.studioGenerateStatus(courseId).catch(() => null);
      if (status?.status === "done" && status.studio?.pages?.length && !isSkeletonStudio(status.studio)) {
        setStudio(linkVocabInStudio(status.studio));
        setStudioDirty(false);
        setPhase("editor");
        return;
      }
      if (status?.status === "running") {
        setPhase("onboarding");
        setResumeGenerate(true);
        return;
      }

      const full = await DataAPI.courseFull(courseId);
      const courseModules = (full.modules ?? []) as CourseModule[];
      if (courseModules.length > 0) {
        setStudio({
          ...emptyStudio(saved?.policy ?? "generate"),
          pages: modulesToStudioPages(courseModules),
        });
        setStudioDirty(false);
        setPhase("editor");
        return;
      }

      setStudio(emptyStudio(saved?.policy ?? "generate"));
      setPhase("onboarding");
    } catch {
      if (modules.length > 0) {
        setStudio({ ...emptyStudio(), pages: modulesToStudioPages(modules) });
        setPhase("editor");
      } else {
        setStudio(emptyStudio());
        setPhase("onboarding");
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, createStep, modules, ragSources.length]);

  useEffect(() => {
    skipReloadRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    if (!courseId || phase !== "editor" || !studio.pages.length || !studioDirty) return;
    const t = setTimeout(() => {
      DataAPI.saveStudio(courseId, studio).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [courseId, phase, studio, studioDirty]);

  const handleGenerated = (data: StudioCourseData) => {
    if (!data?.pages?.length) {
      showToast("Generation finished but returned no pages — try again.");
      return;
    }
    skipReloadRef.current = true;
    setLoading(false);
    setStudio(linkVocabInStudio(data));
    setStudioDirty(false);
    setAutoGenerate(false);
    setPhase("editor");
    void syncCourse();
  };

  const handleRegenerate = async () => {
    if (!courseId) return;
    setRegenerating(true);
    setGenError(null);
    setGenMessage("Starting generation…");
    try {
      const data = await waitForStudioGeneration(courseId, studio.policy, setGenMessage);
      setRegenerating(false);
      handleGenerated(data);
    } catch (e) {
      const msg = friendlyGenerationError(e instanceof Error ? e.message : "Generation failed");
      setGenError(msg);
      setGenMessage("");
      showToast(msg);
    }
  };

  const handlePublish = async () => {
    if (!courseId) return;
    try {
      const nextModules = await saveStudioAndSyncModules(
        courseId,
        studio,
        modules,
        (id) => DataAPI.deleteBlock(id),
        async (moduleId, block, sortOrder) => {
          const created = (await DataAPI.addBlock(moduleId, {
            type: block.type,
            label: block.label,
            title: block.title,
            content: block.content ?? {},
            sort_order: sortOrder,
            masterySignal: block.masterySignal,
          })) as { id: string };
          return { ...block, id: created.id } as import("../../types").ContentBlock;
        }
      );
      setModules(nextModules);
      await publishCourse();
      showToast("Course published to students.");
      setScreen("instructor-course");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Publish failed");
    }
  };

  if (!courseId) {
    return (
      <div className="studio-root studio-screen-center">
        <p>Open or create a classroom first.</p>
        <button type="button" className="studio-btn primary" onClick={() => setScreen("instructor-home")}>
          Classrooms
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="studio-root studio-screen-center">
        <p style={{ color: "var(--soft)" }}>Loading studio…</p>
      </div>
    );
  }

  if (phase === "onboarding") {
    return (
      <StudioOnboarding
        policy={studio.policy}
        onPolicyChange={(policy) => setStudio((s) => ({ ...s, policy }))}
        onComplete={(data) => handleGenerated(data)}
        onBack={() => setScreen("instructor-course")}
        initialStep={resumeGenerate || autoGenerate ? 3 : createStep === "structure" ? 2 : 1}
        resumeGenerate={resumeGenerate}
        autoStartGenerate={autoGenerate}
      />
    );
  }

  return (
    <>
      <StudioEditor
        studio={studio}
        courseId={courseId}
        courseTitle={courseTitle}
        initialPageIndex={currentModuleIndex}
        needsGeneration={isSkeletonStudio(studio) && !regenerating}
        onStudioChange={handleStudioChange}
        onPublish={() => void handlePublish()}
        onRegenerateFromSources={() => void handleRegenerate()}
        onRestart={() => {
          setStudioDirty(false);
          setAutoGenerate(false);
          setPhase("onboarding");
        }}
        onExit={() => setScreen("instructor-course")}
      />

      {(regenerating || genError) && (
        <div className="studio-root studio-gen-overlay">
          <div className="studio-onb-card" style={{ maxWidth: 480, textAlign: "center" }}>
            {genError ? (
              <>
                <div className="studio-onb-kick" style={{ color: "var(--warn, #f59e0b)" }}>
                  Generation failed
                </div>
                <h1>Could not build course</h1>
                <p className="studio-onb-sub" style={{ color: "var(--text)" }}>
                  {genError}
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
                  <button
                    type="button"
                    className="studio-btn"
                    onClick={() => {
                      setGenError(null);
                      setRegenerating(false);
                    }}
                  >
                    Dismiss
                  </button>
                  <button type="button" className="studio-btn primary" onClick={() => void handleRegenerate()}>
                    Retry
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="studio-onb-kick">Generating</div>
                <h1>Building your course</h1>
                <p className="studio-onb-sub">{genMessage || "Reading sources and drafting blocks…"}</p>
                <p className="studio-onb-sub" style={{ marginTop: 12, fontSize: 13 }}>
                  This can take a few minutes. Please keep this tab open.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
