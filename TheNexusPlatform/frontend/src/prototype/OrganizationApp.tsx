import { useState } from "react";
import { motion } from "motion/react";
import {
  BookOpen, Users, Activity, Plus, ChevronRight, ArrowLeft,
  Lock, Check, Layers, Sparkles, GraduationCap, Trophy, MessageSquare,
} from "lucide-react";
import {
  PROGRAMS, ORG_NAME, APP_TEMPLATES, CONTENT_KIND_META,
  type Program, type AppTemplate, type TemplateBlock,
} from "./data";
import {
  BASE, BORDER, BORDER_STRONG, MUTED, FAINT, FONT_HEAD, FONT_BODY,
  Card, Eyebrow, Badge, PrimaryBtn, GhostBtn, Tabs, ProgressBar, Stat,
  SectionTitle, EmptyHint, slide,
} from "./ui";

// ─── Main Page: programs grid ──────────────────────────────────────────────────

function MainPage({ onOpen }: { onOpen: (p: Program) => void }) {
  return (
    <motion.div {...slide} className="max-w-6xl mx-auto px-6 md:px-12 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <Eyebrow>Organization workspace</Eyebrow>
          <h1 className="mt-2 text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{ORG_NAME}</h1>
          <p className="mt-2 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>Your programs. Each runs on its own learning platform and application.</p>
        </div>
        <PrimaryBtn Icon={Plus}>New Program</PrimaryBtn>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROGRAMS.map((p) => (
          <Card key={p.id} hover onClick={() => onOpen(p)} className="p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: `${p.accent}22`, border: `1px solid ${p.accent}55` }}>
                {p.emoji}
              </div>
              <ChevronRight size={18} color={FAINT} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{p.name}</h3>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: MUTED, fontFamily: FONT_BODY }}>{p.tagline}</p>
            </div>
            <div className="flex gap-2 mt-1 flex-wrap">
              <Badge><BookOpen size={11} /> {p.courses.length} courses</Badge>
              <Badge><Users size={11} /> {p.learners.length} learners</Badge>
              <Badge tone="violet"><GraduationCap size={11} /> {p.coaches.length} coaches</Badge>
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Program detail ─────────────────────────────────────────────────────────────

function LearningPlatformSection({ program }: { program: Program }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex flex-col gap-4">
        <SectionTitle sub="Courses and content authored by the coaches assigned to this program.">Learning Platform</SectionTitle>
        {program.courses.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{c.title}</h4>
                  <Badge tone={c.status === "published" ? "green" : "amber"}>{c.status}</Badge>
                </div>
                <p className="mt-1 text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{c.summary}</p>
                <p className="mt-2 text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>by {c.coach} · {c.objects.length} learning objects · {c.learners} enrolled</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {c.objects.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}>
                  <span>{CONTENT_KIND_META[o.kind].emoji}</span>{o.title}
                  {o.usableInApp && <span title="Usable in Application" style={{ color: "#5fd39a" }}>◆</span>}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <SectionTitle sub="Assigned by the organization.">Coaches</SectionTitle>
        <Card className="p-2">
          {program.coaches.map((co, i) => (
            <div key={co.id} className="flex items-center justify-between px-3 py-3" style={{ borderBottom: i < program.coaches.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white/80" style={{ background: "rgba(255,255,255,0.08)", fontFamily: FONT_HEAD }}>{co.name.split(" ").map((n) => n[0]).join("")}</div>
                <div>
                  <p className="text-sm text-white" style={{ fontFamily: FONT_BODY }}>{co.name}</p>
                  <p className="text-[11px]" style={{ color: FAINT, fontFamily: FONT_BODY }}>{co.role} · {co.courses} courses</p>
                </div>
              </div>
            </div>
          ))}
          <div className="p-2"><GhostBtn Icon={Plus} className="w-full">Assign coach</GhostBtn></div>
        </Card>
      </div>
    </div>
  );
}

function ApplicationOverview({ program }: { program: Program }) {
  const totalLearners = program.learners.length;
  const avg = totalLearners ? Math.round(program.learners.reduce((s, l) => s + l.progress, 0) / totalLearners) : 0;
  const published = program.courses.filter((c) => c.status === "published").length;
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle sub="What the Application does for this program: track students, surface performance, and host the community.">Application · Overview</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Learners" value={totalLearners} sub="tracked in this program" />
        <Stat label="Avg. progress" value={`${avg}%`} sub="across enrolled courses" />
        <Stat label="Published courses" value={published} sub={`${program.courses.length} total`} />
        <Stat label="Community" value="Active" sub="feed & announcements" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-4"><Trophy size={15} color={MUTED} /><Eyebrow>Track students · performance</Eyebrow></div>
          <div className="flex flex-col gap-3">
            {program.learners.map((l) => (
              <div key={l.id} className="flex items-center gap-3">
                <span className="text-sm text-white/80 w-32 truncate" style={{ fontFamily: FONT_BODY }}>{l.name}</span>
                <div className="flex-1"><ProgressBar pct={l.progress} tint={program.accent} /></div>
                <span className="text-xs w-10 text-right" style={{ color: MUTED, fontFamily: FONT_BODY }}>{l.progress}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><MessageSquare size={15} color={MUTED} /><Eyebrow>Social · community</Eyebrow></div>
          <div className="flex flex-col gap-3">
            {["Welcome to the new cohort! 👋", "Reminder: live session Friday", "3 new artifacts published"].map((t, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5 text-xs text-white/70" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, fontFamily: FONT_BODY }}>{t}</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Application Configuration ─────────────────────────────────────────────────

function AppConfig({ program }: { program: Program }) {
  const [selected, setSelected] = useState<AppTemplate | null>(null);
  // artifacts available to bind = content objects flagged usableInApp across published courses
  const artifacts = program.courses
    .filter((c) => c.status === "published")
    .flatMap((c) => c.objects.filter((o) => o.usableInApp).map((o) => ({ ...o, course: c.title })));

  if (!selected) {
    return (
      <div className="flex flex-col gap-6">
        <SectionTitle sub="Turn what this program has created into an application. Start from a template — the organization can configure it within limits the template allows.">
          Application Configuration
        </SectionTitle>
        <div className="rounded-2xl px-5 py-4 flex items-start gap-3" style={{ background: "rgba(150,110,230,0.08)", border: `1px solid rgba(150,110,230,0.25)` }}>
          <Sparkles size={16} className="mt-0.5" color="#b39aec" />
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.7)", fontFamily: FONT_BODY }}>
            Templates define the structure. Some blocks are <span style={{ color: "#b39aec" }}>locked</span> to keep every app consistent; the rest you can toggle and fill with content artifacts produced on this program's learning platform.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {APP_TEMPLATES.map((t) => (
            <Card key={t.id} hover onClick={() => setSelected(t)} className="p-6 flex flex-col gap-4">
              <div className="text-3xl">{t.emoji}</div>
              <div>
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{t.name}</h3>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: MUTED, fontFamily: FONT_BODY }}>{t.tagline}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.blocks.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]" style={{ background: "rgba(255,255,255,0.05)", color: FAINT, fontFamily: FONT_BODY }}>
                    {b.locked && <Lock size={9} />}{b.label}
                  </span>
                ))}
              </div>
              <GhostBtn Icon={Layers} className="w-full mt-1">Use & configure</GhostBtn>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return <TemplateEditor template={selected} program={program} artifacts={artifacts} onBack={() => setSelected(null)} />;
}

function TemplateEditor({
  template, program, artifacts, onBack,
}: {
  template: AppTemplate; program: Program;
  artifacts: { id: string; title: string; course: string }[];
  onBack: () => void;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(template.blocks.map((b) => [b.id, true])),
  );
  const [bound, setBound] = useState<Record<string, string[]>>({});

  function toggleBlock(b: TemplateBlock) {
    if (b.locked) return; // restricted: locked blocks can't be turned off
    setEnabled((prev) => ({ ...prev, [b.id]: !prev[b.id] }));
  }
  function toggleArtifact(blockId: string, artId: string) {
    setBound((prev) => {
      const cur = prev[blockId] ?? [];
      return { ...prev, [blockId]: cur.includes(artId) ? cur.filter((x) => x !== artId) : [...cur, artId] };
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm w-fit focus:outline-none group" style={{ color: MUTED, fontFamily: FONT_BODY }}>
        <ArrowLeft size={15} className="group-hover:text-white transition-colors" /><span className="group-hover:text-white/80 transition-colors">Templates</span>
      </button>
      <div className="flex items-center gap-3">
        <div className="text-3xl">{template.emoji}</div>
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{template.name}</h2>
          <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>Configuring for {program.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <Eyebrow>Blocks — configure within template limits</Eyebrow>
          {template.blocks.map((b) => {
            const on = enabled[b.id];
            return (
              <Card key={b.id} className="p-4" style={{ opacity: on ? 1 : 0.55 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{b.label}</p>
                      {b.locked ? <Badge tone="locked"><Lock size={9} /> Locked</Badge> : <Badge tone="green">Editable</Badge>}
                      {b.bindsContent && <Badge tone="violet">◆ Content</Badge>}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: MUTED, fontFamily: FONT_BODY }}>{b.description}</p>
                  </div>
                  <button
                    onClick={() => toggleBlock(b)}
                    disabled={b.locked}
                    className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none disabled:cursor-not-allowed"
                    style={{ background: on ? program.accent : "rgba(255,255,255,0.12)" }}
                    title={b.locked ? "Locked by template" : "Toggle block"}
                  >
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? "22px" : "2px" }} />
                  </button>
                </div>

                {b.bindsContent && on && (
                  <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: FAINT, fontFamily: FONT_BODY }}>Attach content artifacts from the learning platform</p>
                    <div className="flex flex-wrap gap-1.5">
                      {artifacts.length === 0 && <span className="text-xs" style={{ color: FAINT, fontFamily: FONT_BODY }}>No app-ready artifacts yet.</span>}
                      {artifacts.map((a) => {
                        const picked = (bound[b.id] ?? []).includes(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => toggleArtifact(b.id, a.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-colors focus:outline-none"
                            style={{
                              background: picked ? `${program.accent}22` : "rgba(255,255,255,0.05)",
                              border: `1px solid ${picked ? program.accent : BORDER}`,
                              color: picked ? "#fff" : "rgba(255,255,255,0.6)", fontFamily: FONT_BODY,
                            }}
                          >
                            {picked ? <Check size={11} /> : <Plus size={11} />}{a.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          <div className="flex gap-3 mt-2">
            <PrimaryBtn Icon={Sparkles}>Publish Application</PrimaryBtn>
            <GhostBtn>Save draft</GhostBtn>
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <Eyebrow>Preview</Eyebrow>
          <div className="mt-2 rounded-2xl overflow-hidden sticky top-6" style={{ border: `1px solid ${BORDER_STRONG}`, background: "#0f0f12" }}>
            <div className="h-8 flex items-center gap-1.5 px-3" style={{ background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${BORDER}` }}>
              {["#e6675a", "#e6b25a", "#5fd39a"].map((c) => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />)}
            </div>
            <div className="p-4 flex flex-col gap-3">
              {template.blocks.filter((b) => enabled[b.id]).map((b) => (
                <div key={b.id} className="rounded-xl p-3" style={{ background: b.kind === "hero" ? `${program.accent}22` : "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
                  <p className="text-xs font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{b.kind === "hero" ? `${program.emoji} ${program.name}` : b.label}</p>
                  {(bound[b.id]?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {bound[b.id].map((id) => {
                        const a = artifacts.find((x) => x.id === id);
                        return <span key={id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontFamily: FONT_BODY }}>{a?.title}</span>;
                      })}
                    </div>
                  )}
                  {b.kind === "tracker" && <div className="mt-2 flex flex-col gap-1.5">{[70, 40, 90].map((p, i) => <ProgressBar key={i} pct={p} tint={program.accent} />)}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramDetail({ program, onBack }: { program: Program; onBack: () => void }) {
  const [tab, setTab] = useState("learning");
  return (
    <motion.div {...slide} className="max-w-6xl mx-auto px-6 md:px-12 py-10">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 w-fit focus:outline-none group" style={{ color: MUTED, fontFamily: FONT_BODY }}>
        <ArrowLeft size={15} className="group-hover:text-white transition-colors" /><span className="group-hover:text-white/80 transition-colors">All programs</span>
      </button>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${program.accent}22`, border: `1px solid ${program.accent}55` }}>{program.emoji}</div>
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>{program.name}</h1>
          <p className="mt-1 text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>{program.tagline}</p>
        </div>
      </div>

      <div className="mb-8">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "learning", label: "Learning Platform", Icon: BookOpen },
            { key: "app", label: "Application", Icon: Activity },
            { key: "config", label: "Application Configuration", Icon: Layers },
          ]}
        />
      </div>

      {tab === "learning" && <LearningPlatformSection program={program} />}
      {tab === "app" && <ApplicationOverview program={program} />}
      {tab === "config" && <AppConfig program={program} />}
    </motion.div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function OrganizationApp() {
  const [openProgram, setOpenProgram] = useState<Program | null>(null);
  return (
    <div style={{ background: BASE, minHeight: "100vh" }}>
      {openProgram
        ? <ProgramDetail program={openProgram} onBack={() => setOpenProgram(null)} />
        : <MainPage onOpen={setOpenProgram} />}
    </div>
  );
}
