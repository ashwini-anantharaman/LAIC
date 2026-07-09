/**
 * Run after applying supabase/migrations/001_initial.sql
 * Creates demo users, Brain Bee course, and enrolls Alex Kim.
 *
 * Usage: node scripts/seed-brain-bee.mjs
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env (loaded via dotenv)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STUDENT = { email: "alex@school.edu", password: "demo-password-123", name: "Alex Kim", role: "student" };
const INSTRUCTOR = { email: "ash@school.edu", password: "demo-password-123", name: "Dr. Ashwini", role: "instructor" };

async function ensureUser({ email, password, name, role }) {
  const { data: existing } = await sb.auth.admin.listUsers();
  let user = existing?.users?.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  await sb.from("profiles").upsert({ id: user.id, email, display_name: name, role });
  if (role === "student") {
    await sb.from("learner_models").upsert({ user_id: user.id, default_mode: "conversational", streak: 5 });
  } else {
    await sb.from("instructor_profiles").upsert({ user_id: user.id, onboarding_complete: true });
  }
  return user.id;
}

async function main() {
  const instructorId = await ensureUser(INSTRUCTOR);
  const studentId = await ensureUser(STUDENT);

  const { data: course } = await sb.from("courses").upsert({
    instructor_id: instructorId,
    title: "Brain Bee",
    subject: "Neuroscience",
    published: true,
  }).select().single();

  const courseId = course.id;

  const chapters = [
    { course_id: courseId, title: "Ch 1: Neurons", label: "CH 1: NEURONS", sort_order: 0 },
    { course_id: courseId, title: "Ch 2: Synapses", label: "CH 2: SYNAPSES", sort_order: 1 },
    { course_id: courseId, title: "Ch 3: Brain Regions", label: "CH 3: BRAIN REGIONS", sort_order: 2 },
  ];
  await sb.from("chapters").delete().eq("course_id", courseId);
  const { data: chRows } = await sb.from("chapters").insert(chapters).select();

  const concepts = [
    { id: "neuron", course_id: courseId, chapter_id: chRows[0].id, name: "Neuron", subtitle: "Building block of the nervous system", letter: "N", sort_order: 0 },
    { id: "synapses", course_id: courseId, chapter_id: chRows[0].id, name: "Synapses", subtitle: "How neurons communicate across the synaptic cleft", letter: "S", sort_order: 1 },
    { id: "brain-regions", course_id: courseId, chapter_id: chRows[1].id, name: "Brain Regions", subtitle: "Major structures of the brain", letter: "B", sort_order: 2 },
    { id: "action-potential", course_id: courseId, chapter_id: chRows[1].id, name: "Action Potential", subtitle: "Electrical signaling in neurons", letter: "A", sort_order: 3 },
    { id: "neurotransmitters", course_id: courseId, chapter_id: chRows[2].id, name: "Neurotransmitters", subtitle: "Chemical messengers", letter: "N", sort_order: 4 },
    { id: "plasticity", course_id: courseId, chapter_id: chRows[2].id, name: "Neural Plasticity", subtitle: "How the brain changes", letter: "N", sort_order: 5 },
  ];
  await sb.from("concepts").upsert(concepts);

  const moduleNames = [
    "What is a Neuron?", "Neuron Structure", "What is a Synapse?",
    "Chemical Transmission", "Types of Synapses", "Brain Lobes Overview",
  ];
  const { data: mods } = await sb.from("modules").insert(
    moduleNames.map((name, i) => ({
      course_id: courseId,
      chapter_id: chRows[Math.floor(i / 2)]?.id ?? chRows[0].id,
      name,
      sort_order: i,
      concept_id: concepts[Math.min(i, concepts.length - 1)].id,
    }))
  ).select();

  await sb.from("prerequisite_edges").insert([
    { course_id: courseId, from_name: "What is a Neuron?", to_name: "Neuron Structure" },
    { course_id: courseId, from_name: "Neuron Structure", to_name: "What is a Synapse?" },
    { course_id: courseId, from_name: "What is a Synapse?", to_name: "Chemical Transmission" },
    { course_id: courseId, from_name: "Chemical Transmission", to_name: "Types of Synapses" },
  ]);

  const synapseMod = mods.find((m) => m.name === "What is a Synapse?");
  if (synapseMod) {
    await sb.from("content_blocks").insert({
      module_id: synapseMod.id,
      type: "MCQ",
      label: "MCQ question",
      title: "Which part receives signals?",
      sort_order: 0,
      content: {
        id: "neuron-dendrite",
        question: "Which part of a neuron receives incoming signals from other neurons?",
        options: ["Axon terminal", "Dendrite", "Myelin sheath", "Cell body"],
        correct: 1,
        hints: [
          { level: "Nudge", text: "Think about the word root — 'dendron' means tree in Greek." },
          { level: "Concept", text: "These structures branch outward, maximising surface area to collect signals from neighbouring neurons." },
          { level: "Direction", text: "They sit on the input side of the neuron — opposite the side that sends signals out." },
          { level: "Explanation", text: "Dendrites are the receiving branches of a neuron." },
        ],
      },
    });
  }

  for (const c of concepts) {
    await sb.from("concept_mode_availability").upsert({
      course_id: courseId,
      concept_id: c.id,
      modes: c.id === "plasticity" ? [] : c.id === "brain-regions" || c.id === "neurotransmitters" ? ["textbook"] : c.id === "neuron" ? ["conversational", "textbook"] : ["real-world", "conversational", "textbook"],
      has_interactive: ["neuron", "synapses"].includes(c.id),
    });
  }

  const masterySeed = {
    neuron: "mastered",
    synapses: "understood",
    "brain-regions": "practiced",
    "action-potential": "exposed",
    neurotransmitters: "not-seen",
    plasticity: "not-seen",
  };
  for (const [concept_id, level] of Object.entries(masterySeed)) {
    await sb.from("mastery_states").upsert({ user_id: studentId, course_id: courseId, concept_id, level });
  }

  await sb.from("enrollments").upsert({ user_id: studentId, course_id: courseId });

  console.log("Seeded Brain Bee course:", courseId);
  console.log("Student:", STUDENT.email, "/ Instructor:", INSTRUCTOR.email);
  console.log("Password for both: demo-password-123");
}

main().catch((e) => { console.error(e); process.exit(1); });
