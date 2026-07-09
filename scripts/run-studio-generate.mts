import "dotenv/config";
import { getCourseRagStats } from "../server/lib/rag.js";
import { supabaseAdmin } from "../server/lib/supabase.js";
import { startStudioGenerateJob, getStudioGenerateJob } from "../server/agents/studioGenerator.js";
import { isSkeletonStudio } from "../shared/studio/skeleton.js";

const courseId = process.argv[2];

async function listCourses() {
  const { data: courses } = await supabaseAdmin
    .from("courses")
    .select("id, title, studio_json")
    .order("created_at", { ascending: false })
    .limit(10);

  for (const c of courses ?? []) {
    const stats = await getCourseRagStats(c.id);
    const skeleton = c.studio_json ? isSkeletonStudio(c.studio_json) : null;
    console.log(`${c.id} | ${c.title} | skeleton=${skeleton} | chunks=${stats.chunkCount} ready=${stats.readyCount}`);
  }
}

async function waitForJob(id: string) {
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = getStudioGenerateJob(id);
    if (!job) {
      console.log("No active job");
      return;
    }
    if (job.progress) console.log(job.progress);
    if (job.status === "done") {
      console.log("Done — pages:", job.studio?.pages?.length ?? 0);
      if (job.studio && isSkeletonStudio(job.studio)) {
        console.error("Still skeleton content");
        process.exit(1);
      }
      return;
    }
    if (job.status === "error") {
      console.error("Error:", job.error);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.error("Timed out");
  process.exit(1);
}

async function main() {
  if (!courseId) {
    await listCourses();
    console.log("\nUsage: npx tsx scripts/run-studio-generate.mts <courseId>");
    return;
  }

  const stats = await getCourseRagStats(courseId);
  console.log("RAG:", stats);
  if (stats.readyCount < 1) {
    console.error("No indexed sources — upload PDFs first.");
    process.exit(1);
  }

  console.log("Starting generation for", courseId);
  startStudioGenerateJob(courseId, "generate", "Build a structured Brain Bee course from the uploaded sources.");
  await waitForJob(courseId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
