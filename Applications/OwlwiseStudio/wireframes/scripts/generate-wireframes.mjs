#!/usr/bin/env node
/**
 * Generates low-fidelity HTML wireframes for Owlwise student & instructor workflows.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CSS = `/* Owlwise wireframe styles */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Inter, system-ui, sans-serif; background: #e8eaed; color: #1f2937; }
a { color: #1a73e8; text-decoration: none; }
a:hover { text-decoration: underline; }
.wf { width: 1280px; min-height: 800px; margin: 24px auto; background: #fff; border: 2px solid #9ca3af; display: flex; flex-direction: column; }
.wf-label { background: #1f2937; color: #fff; padding: 8px 16px; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.wf-title { padding: 12px 20px; border-bottom: 1px dashed #d1d5db; }
.wf-title h1 { font-size: 18px; font-weight: 700; }
.wf-title p { font-size: 12px; color: #6b7280; margin-top: 4px; }
.wf-body { flex: 1; display: flex; min-height: 0; }
.sidebar { width: 220px; border-right: 2px solid #d1d5db; background: #f9fafb; padding: 16px 12px; flex-shrink: 0; }
.sidebar .logo { height: 32px; background: #d1d5db; border-radius: 6px; margin-bottom: 16px; }
.nav-item { height: 32px; background: #e5e7eb; border-radius: 8px; margin-bottom: 6px; display: flex; align-items: center; padding: 0 10px; font-size: 11px; color: #4b5563; }
.nav-item.active { background: #93c5fd; color: #1e3a8a; font-weight: 600; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar { height: 48px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
.topbar .crumb { height: 14px; width: 120px; background: #e5e7eb; border-radius: 4px; }
.topbar .actions { margin-left: auto; display: flex; gap: 8px; }
.btn { height: 28px; padding: 0 12px; background: #d1d5db; border-radius: 6px; font-size: 10px; display: flex; align-items: center; color: #374151; border: 1px solid #9ca3af; }
.btn.primary { background: #93c5fd; border-color: #3b82f6; color: #1e3a8a; font-weight: 600; }
.content { flex: 1; padding: 24px; overflow: auto; }
.block { background: #f3f4f6; border: 1px dashed #9ca3af; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.block h2 { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #374151; }
.block p { font-size: 11px; color: #6b7280; line-height: 1.5; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.card { flex: 1; min-width: 180px; height: 100px; background: #e5e7eb; border: 1px dashed #9ca3af; border-radius: 12px; padding: 12px; font-size: 10px; color: #4b5563; }
.split { display: flex; flex: 1; min-height: 500px; }
.panel { flex: 1; border: 1px dashed #9ca3af; display: flex; flex-direction: column; }
.panel.dark { background: #4b5563; color: #e5e7eb; }
.panel-header { padding: 8px 12px; border-bottom: 1px dashed #9ca3af; font-size: 10px; font-weight: 600; }
.centered { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 48px; text-align: center; gap: 16px; }
.hero { width: 80px; height: 80px; background: #d1d5db; border-radius: 50%; }
.big-btn { width: 320px; height: 48px; background: #93c5fd; border: 1px solid #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
.input { height: 40px; width: 100%; max-width: 360px; background: #fff; border: 1px dashed #9ca3af; border-radius: 8px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.chip { height: 36px; background: #e5e7eb; border: 1px dashed #9ca3af; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; }
.tabs { display: flex; gap: 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; padding-bottom: 8px; }
.tab { font-size: 11px; color: #6b7280; padding-bottom: 4px; }
.tab.active { color: #1a73e8; font-weight: 600; border-bottom: 2px solid #1a73e8; }
.chat-bubble { max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 11px; margin-bottom: 8px; }
.chat-user { background: #93c5fd; margin-left: auto; }
.chat-ai { background: #e5e7eb; }
.index-page { max-width: 900px; margin: 40px auto; padding: 24px; }
.index-page h1 { font-size: 28px; margin-bottom: 8px; }
.index-page > p { color: #6b7280; margin-bottom: 24px; }
.index-page ol { line-height: 2; padding-left: 24px; }
.flow-arrow { text-align: center; color: #9ca3af; font-size: 20px; margin: 8px 0; }
`;

function shell(activeNav, title, subtitle, contentHtml, extraTopbar = "") {
  const navItems = [
    ["Home", false],
    ["My Sets", false],
    ["Challenge", false],
    ["Practice Tools", false],
    ["Your Classes", false],
    ["Study Plan", false],
    ["Chat", false],
  ];
  const instructorNav = [
    ["Classrooms", false],
    ["Invite Students", false],
    ["Teacher Tools", false],
    ["Practice Tools", false],
  ];
  const items = activeNav.startsWith("inst-") ? instructorNav : navItems;
  const navHtml = items
    .map(([label, _]) => {
      const active = activeNav === label || activeNav === `inst-${label}`;
      return `<div class="nav-item${active ? " active" : ""}">${label}</div>`;
    })
    .join("\n        ");

  return `<div class="wf">
  <div class="wf-label">Wireframe</div>
  <div class="wf-title"><h1>${title}</h1><p>${subtitle}</p></div>
  <div class="wf-body">
    <aside class="sidebar">
      <div class="logo"></div>
      ${navHtml}
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="crumb"></div><div class="crumb"></div>
        <div class="actions">${extraTopbar}<div class="btn">Upgrade</div><div class="btn">Profile</div></div>
      </div>
      <div class="content">${contentHtml}</div>
    </div>
  </div>
</div>`;
}

function page(title, body, navLink) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Owlwise Wireframe</title>
  <style>${CSS}</style>
</head>
<body>
  <p style="text-align:center;padding:12px;font-size:12px;"><a href="${navLink}">← Back to workflow index</a></p>
  ${body}
</body>
</html>`;
}

const studentScreens = [
  {
    file: "01-landing.html",
    title: "Landing",
    html: `<div class="wf"><div class="wf-label">Wireframe · Auth</div>
      <div class="centered" style="min-height:700px">
        <div class="hero"></div>
        <h1 style="font-size:28px;font-weight:700">Owlwise</h1>
        <p style="font-size:13px;color:#6b7280">Learn at your pace, your way.</p>
        <div class="big-btn">Start Learning</div>
        <div class="big-btn" style="background:#fff">Educator</div>
      </div></div>`,
  },
  {
    file: "02-login.html",
    title: "Login / Register",
    html: `<div class="wf"><div class="wf-label">Wireframe · Auth</div>
      <div class="centered" style="min-height:700px">
        <div class="hero"></div>
        <div class="tabs" style="border:none"><span class="tab active">Sign in</span><span class="tab">Register</span></div>
        <div class="input"></div>
        <div class="input"></div>
        <div class="big-btn">Continue</div>
      </div></div>`,
  },
  {
    file: "03-onboarding-grade.html",
    title: "Student Onboarding — Step 1",
    html: `<div class="wf"><div class="wf-label">Wireframe · Onboarding 1/3</div>
      <div class="content"><h2 style="font-size:22px;margin-bottom:8px">What grade are you in?</h2>
      <p style="font-size:12px;color:#6b7280;margin-bottom:20px">Sets reading level and content depth.</p>
      <div class="grid-4">${["6th","7th","8th","9th","10th","11th","12th","College"].map(g=>`<div class="chip">${g}</div>`).join("")}</div>
      <div class="big-btn" style="margin-top:32px;width:200px">Next</div></div></div>`,
  },
  {
    file: "04-onboarding-visual.html",
    title: "Student Onboarding — Step 2",
    html: `<div class="wf"><div class="wf-label">Wireframe · Onboarding 2/3</div>
      <div class="content"><h2 style="font-size:22px;margin-bottom:20px">How do you like to learn?</h2>
      <div class="row"><div class="card" style="height:120px">Newspaper — article layout</div>
      <div class="card" style="height:120px">Chat — conversational</div></div></div></div>`,
  },
  {
    file: "05-onboarding-style.html",
    title: "Student Onboarding — Step 3",
    html: `<div class="wf"><div class="wf-label">Wireframe · Onboarding 3/3</div>
      <div class="content"><h2 style="font-size:22px;margin-bottom:20px">Default learning mode</h2>
      <div class="block"><p>Interactive · Summary · Narrative · As teacher designed</p></div>
      <div class="big-btn" style="margin-top:24px;width:200px">Finish</div></div></div>`,
  },
  {
    file: "06-home.html",
    title: "Student Home",
    body: shell("Home", "Home", "Dashboard overview", `
      <div class="block"><h2>Welcome back</h2><p>Progress summary, continue learning CTA</p></div>
      <div class="row"><div class="card">Course card</div><div class="card">Course card</div><div class="card">Course card</div></div>`),
  },
  {
    file: "07-my-sets.html",
    title: "My Sets",
    body: shell("My Sets", "My Sets", "Enrolled courses", `
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <div><h2 style="font-size:20px">My Sets</h2><p style="font-size:12px;color:#6b7280">Your enrolled courses</p></div>
        <div class="btn primary">Join course</div>
      </div>
      <div class="row"><div class="card">Brain Bee<br/>Instructor name<br/>Progress bar</div>
      <div class="card">Empty slot</div><div class="card">Empty slot</div></div>
      <div class="block" style="margin-top:16px"><h2>Join course modal</h2><p>Classroom code input OWL-XXXXXX · Paste join link</p></div>`),
  },
  {
    file: "08-workspace.html",
    title: "Student Workspace",
    body: shell("Your Classes", "Classroom Workspace", "Modules & assistant", `
      <div class="block"><h2>Owlwise Assistant</h2><p>Chat with Assistant button — RAG over course materials</p></div>
      <div class="block"><h2>Modules</h2>
        <div class="card" style="height:60px;margin-bottom:8px">Module 1 — Start Learning</div>
        <div class="card" style="height:60px">PDF source · Quiz · Flashcards rows</div></div>`),
  },
  {
    file: "09-lesson-split.html",
    title: "Lesson — Split Screen",
    html: `<div class="wf"><div class="wf-label">Wireframe · Full screen lesson</div>
      <div class="topbar" style="border-bottom:1px solid #e5e7eb"><div class="crumb"></div><div class="btn">Mode icons</div></div>
      <div class="split">
        <div class="panel dark"><div class="panel-header">Reference PDF · zoom · collapse</div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:11px">PDF page viewer</div></div>
        <div class="panel"><div class="panel-header">Unit summary · Interactive / Summary / Narrative</div>
        <div class="content"><div class="block"><p>Lesson content, MCQs, animations, chat input</p></div>
        <div class="big-btn" style="width:160px;margin-top:auto">Next unit</div></div></div>
      </div>
      <div style="padding:8px;text-align:center;font-size:10px;color:#6b7280">Bottom pills: Notes · Transcript · View PDF · Split Screen</div></div>`,
  },
  {
    file: "10-assistant-chat.html",
    title: "Assistant Chat",
    body: shell("Chat", "Owlwise Assistant", "Course-grounded chat", `
      <div class="block"><p>Scope: Course materials / This unit</p></div>
      <div class="chat-bubble chat-user">Explain synaptic transmission</div>
      <div class="chat-bubble chat-ai">Answer with citations from PDF sources…</div>
      <div class="input" style="margin-top:24px"></div>`),
  },
  {
    file: "11-study-plan.html",
    title: "Study Plan",
    body: shell("Study Plan", "Study Plan", "Mastery map", `
      <div class="row"><div class="card" style="height:140px">Unit 1 — Mastered</div>
      <div class="card">Unit 2 — In progress</div><div class="card">Unit 3 — Locked</div></div>`),
  },
  {
    file: "12-challenge.html",
    title: "Challenge",
    body: shell("Challenge", "Challenge", "Countdown & readiness", `
      <div class="block"><h2>Days until challenge</h2><p>Large countdown · Set challenge date</p></div>
      <div class="block"><h2>Readiness</h2><p>Progress bar — mastery across units</p></div>`),
  },
  {
    file: "13-practice-tools.html",
    title: "Practice Tools",
    body: shell("Practice Tools", "Practice Tools", "Quizzes, tests, flashcards", `
      <div class="tabs"><span class="tab active">Quizzes</span><span class="tab">Tests</span><span class="tab">Flashcards</span><span class="tab">Notes</span></div>
      <div class="row"><div class="card">Quiz item</div><div class="card">Quiz item</div></div>`),
  },
  {
    file: "14-settings.html",
    title: "Settings",
    body: shell("Home", "Settings", "Profile & preferences", `
      <div class="block"><h2>Profile</h2><p>Name, email, grade, default mode</p></div>
      <div class="block"><h2>Notifications</h2></div>`),
  },
  {
    file: "15-reflection.html",
    title: "Reflection",
    body: shell("Home", "Reflection", "Post-session reflection", `
      <div class="block"><h2>What did you learn today?</h2><div class="input" style="height:80px;margin-top:8px"></div></div>
      <div class="big-btn" style="width:160px;margin-top:16px">Submit</div>`),
  },
];

const instructorScreens = [
  {
    file: "01-landing.html",
    title: "Landing",
    html: studentScreens[0].html,
  },
  {
    file: "02-login.html",
    title: "Login",
    html: studentScreens[1].html,
  },
  {
    file: "03-onboarding-goals.html",
    title: "Instructor Onboarding — Step 1",
    html: `<div class="wf"><div class="wf-label">Wireframe · Onboarding 1/3</div>
      <div class="content"><h2 style="font-size:22px">Goals & guidelines for this class</h2>
      <div class="input" style="height:120px;margin:16px 0"></div><div class="big-btn" style="width:200px">Next</div></div></div>`,
  },
  {
    file: "04-onboarding-audience.html",
    title: "Instructor Onboarding — Step 2",
    html: `<div class="wf"><div class="wf-label">Wireframe · Onboarding 2/3</div>
      <div class="content"><h2 style="font-size:22px">Who are your students?</h2>
      <p style="font-size:12px;margin:12px 0">Grade levels · Format · Location</p>
      <div class="grid-4"><div class="chip">K-5</div><div class="chip">6-8</div><div class="chip">9-12</div><div class="chip">College</div></div></div></div>`,
  },
  {
    file: "05-onboarding-challenge.html",
    title: "Instructor Onboarding — Step 3",
    html: `<div class="wf"><div class="wf-label">Wireframe · Onboarding 3/3</div>
      <div class="content"><h2 style="font-size:22px">Challenge event setup</h2>
      <div class="block"><p>Challenge name · Date · Certificate option</p></div>
      <div class="big-btn" style="width:200px;margin-top:16px">Finish</div></div></div>`,
  },
  {
    file: "06-classrooms.html",
    title: "Classrooms",
    body: shell("inst-Classrooms", "Classrooms", "All courses", `
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <h2 style="font-size:20px">Your classrooms</h2>
        <div class="btn primary">Create classroom</div>
      </div>
      <div class="row"><div class="card">Brain Bee · 12 students</div><div class="card">New classroom</div></div>
      <div class="btn primary" style="width:100%;margin-top:12px;height:36px">Switch to student view</div>`),
  },
  {
    file: "07-course-modules.html",
    title: "Course Modules",
    body: shell("inst-Classrooms", "Course Modules", "Publish & manage content", `
      <div class="tabs"><span class="tab active">Modules</span><span class="tab">Invite Students</span><span class="tab">Progress</span><span class="tab">Settings</span></div>
      <div style="display:flex;gap:8px;margin-bottom:16px"><div class="btn">View as Student</div><div class="btn primary">Invite students</div></div>
      <div class="block"><h2>Module 1</h2><p>PDF · Quiz · Add Materials · View Study Path</p></div>
      <div class="block"><h2>Module 2</h2></div>`),
  },
  {
    file: "08-invite-students.html",
    title: "Invite Students",
    body: shell("inst-Invite Students", "Invite Students", "Join code & link", `
      <div class="tabs"><span class="tab active">Invite & enroll</span><span class="tab">Challenge info</span><span class="tab">Co-instructors</span></div>
      <div class="block"><h2>Classroom join code</h2><p style="font-size:18px;font-weight:700;letter-spacing:0.2em">OWL-7K3M9P</p>
      <div class="btn" style="display:inline-flex;margin-top:8px">Copy code · Copy link</div></div>
      <div class="block"><h2>Enrolled students</h2><p>Name · Email · Mastery table</p></div>`),
  },
  {
    file: "09-course-builder.html",
    title: "Course Builder",
    html: `<div class="wf"><div class="wf-label">Wireframe · Teacher Tools (full width)</div>
      <div class="wf-title"><h1>Course Builder</h1><p>Upload → Structure → Build → Publish</p></div>
      <div class="content">
        <div class="tabs"><span class="tab">Sources</span><span class="tab active">Build</span><span class="tab">Structure</span><span class="tab">Publish</span></div>
        <div class="split" style="min-height:400px">
          <div class="panel" style="flex:0.35"><div class="panel-header">Modules list</div></div>
          <div class="panel"><div class="panel-header">Block editor — Text, MCQ, Video, Flashcards, Animation</div>
          <div class="block"><p>+ Add block · AI generate from sources</p></div></div>
        </div>
      </div></div>`,
  },
  {
    file: "10-student-preview.html",
    title: "Student Preview",
    body: shell("inst-Classrooms", "Student Preview", "Instructor views as student", `
      <div class="block" style="background:#dbeafe"><p>Preview mode — Exit student preview (top bar)</p></div>
      <div class="block"><h2>Same as Student Workspace</h2><p>Modules, assistant, learning path</p></div>`),
  },
  {
    file: "11-student-progress.html",
    title: "Student Progress",
    body: shell("inst-Practice Tools", "Student Progress", "Teacher dashboard", `
      <div class="row"><div class="card">Active this week</div><div class="card">Avg mastery</div><div class="card">At risk</div></div>
      <div class="block"><h2>Per-student mastery table</h2></div>`),
  },
  {
    file: "12-practice-tools.html",
    title: "Teacher Practice Tools",
    body: shell("inst-Practice Tools", "Practice Tools", "Teacher analytics & tools", `
      <div class="block"><h2>Class overview</h2><p>Engagement, completion, concept gaps</p></div>`),
  },
  {
    file: "13-settings.html",
    title: "Instructor Settings",
    body: shell("inst-Classrooms", "Settings", "Instructor preferences", `
      <div class="block"><h2>AI generation preferences</h2><p>Auto modes, prereq graph, video recommendations</p></div>`),
  },
];

function writeWorkflow(folder, screens, workflowName) {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  const links = screens.map((s, i) => {
    const body = s.body ?? s.html;
    writeFileSync(join(dir, s.file), page(s.title, body, "index.html"));
    return `<li><a href="${s.file}">${String(i + 1).padStart(2, "0")}. ${s.title}</a></li>`;
  });
  const indexHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${workflowName} — Owlwise Wireframes</title>
<style>${CSS}.index-page{max-width:720px}</style></head><body>
<div class="index-page">
<h1>${workflowName}</h1>
<p>Low-fidelity wireframes for the Owlwise ${workflowName.toLowerCase()}. Open each screen in order.</p>
<ol>${links.join("\n")}</ol>
<p style="margin-top:32px;font-size:12px;color:#6b7280">Generated from the LAIC codebase · ${new Date().toLocaleDateString()}</p>
</div></body></html>`;
  writeFileSync(join(dir, "index.html"), indexHtml);
}

mkdirSync(join(root, "student-workflow"), { recursive: true });
mkdirSync(join(root, "instructor-workflow"), { recursive: true });

writeWorkflow("student-workflow", studentScreens, "Student Workflow");
writeWorkflow("instructor-workflow", instructorScreens, "Instructor Workflow");

writeFileSync(
  join(root, "README.md"),
  `# Owlwise Wireframes

Low-fidelity wireframes for the Owlwise learning platform, organized by user role.

## Folders

| Folder | Screens | Description |
|--------|---------|-------------|
| [student-workflow](./student-workflow/) | 15 | Landing → onboarding → learning → practice |
| [instructor-workflow](./instructor-workflow/) | 13 | Landing → onboarding → build → invite → analytics |

## How to view

1. Open \`student-workflow/index.html\` or \`instructor-workflow/index.html\` in any browser.
2. Click through each screen in workflow order.

## Figma

See **Owlwise Wireframes** in your Figma drafts (link added after export).

## Screen map

### Student workflow
Landing → Login → Onboarding (3) → Home → My Sets → Workspace → Lesson (split PDF) → Assistant → Study Plan → Challenge → Practice Tools → Settings → Reflection

### Instructor workflow
Landing → Login → Onboarding (3) → Classrooms → Course Modules → Invite Students → Course Builder → Student Preview → Progress Dashboard → Practice Tools → Settings
`
);

console.log("Wireframes written to", root);
