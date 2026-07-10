import "dotenv/config";
import { config } from "../server/lib/config.js";
import { embedQuery } from "../server/lib/voyage.js";
import { supabaseAdmin } from "../server/lib/supabase.js";
import { getCourseRagStats } from "../server/lib/rag.js";

async function main() {
  console.log("voyage key:", Boolean(config.voyageApiKey));
  console.log("supabase:", Boolean(config.supabaseUrl && config.supabaseServiceKey));
  try {
    const emb = await embedQuery("test neuroscience synapses");
    console.log("embedding dim:", emb.length);
  } catch (e) {
    console.error("embed failed:", e instanceof Error ? e.message : e);
    return;
  }
  const { data: courses, error: ce } = await supabaseAdmin
    .from("courses")
    .select("id, title")
    .limit(3);
  if (ce) {
    console.error("courses err:", ce.message);
    return;
  }
  for (const c of courses ?? []) {
    const stats = await getCourseRagStats(c.id);
    console.log("course", c.title?.slice(0, 30), stats);
    const { data: sources } = await supabaseAdmin
      .from("sources")
      .select("id, name, status, detail")
      .eq("course_id", c.id);
    for (const s of sources ?? []) {
      console.log("  source:", s.status, s.name?.slice(0, 40), "-", s.detail?.slice(0, 80));
    }
    if (stats.chunkCount > 0) {
      const { data: match, error: me } = await supabaseAdmin.rpc("match_chunks", {
        query_embedding: await embedQuery("synapses"),
        match_course_id: c.id,
        match_count: 3,
      });
      console.log("  match_chunks:", me?.message ?? `${match?.length ?? 0} results`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
