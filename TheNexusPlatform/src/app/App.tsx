import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Check, GraduationCap, BookOpen } from "lucide-react";

import {
  OwlAnim, Shell, StatusBar, ObShell, Slide, Field,
  BRAND, type Screen, type Nav, SCREEN_ORDER,
} from "./shared";
import { Unit } from "./Unit";
import {
  TeacherLogin, TeacherOb1, TeacherOb2, TeacherOb3,
  TeacherUpload, TeacherBuilder, TeacherApp,
} from "./Teacher";
import {
  api, MODE_META,
  type Course, type CourseUnit, type CreatedCourse, type Mode, type TeacherMeta,
} from "../services";
import { exchangeLaunchToken } from "../services/platform";

// ── Splash with role selection ──────────────────────────────────────────────
function Splash({ nav }: { nav: Nav }) {
  return (
    <Shell className="bg-[#fdf8f5]">
      <div className="flex flex-col items-center justify-center min-h-screen px-8">
        <div className="flex flex-col items-center gap-6 mb-14">
          <OwlAnim className="w-48 h-48 object-contain" />
          <div className="text-center">
            <h1 className="text-[30px] font-bold text-[#2c0312] tracking-tight leading-tight">{BRAND}</h1>
            <p className="text-[15px] text-gray-500 mt-2">Learn at your pace, your way.</p>
          </div>
        </div>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => nav("login")}
            className="w-full py-4 rounded-2xl bg-[#602424] text-white text-[16px] font-semibold tracking-tight active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <BookOpen size={18} /> I'm a student
          </button>
          <button
            onClick={() => nav("t-login")}
            className="w-full py-4 rounded-2xl border border-gray-200 bg-white text-[#602424] text-[16px] font-semibold tracking-tight active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <GraduationCap size={18} /> I'm an educator
          </button>
        </div>
        <p className="text-[12px] text-gray-400 mt-6 text-center leading-relaxed">
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </Shell>
  );
}

// ── Student login ───────────────────────────────────────────────────────────
function Login({ nav }: { nav: Nav }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await api.auth.signUp(email, pass, "student");
      } else {
        await api.auth.signIn(email, pass, "student");
      }
      nav("ob1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-6 pt-4">
        <button onClick={() => nav("splash")} className="w-8 h-8 flex items-center justify-center -ml-1 mb-6">
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="flex flex-col items-start gap-1 mb-8">
          <OwlAnim className="w-20 h-20 object-contain mb-3" />
          <h2 className="text-[28px] font-bold text-[#2c0312] tracking-tight leading-tight">Welcome back</h2>
          <p className="text-[14px] text-gray-500">Sign in to continue learning</p>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
          <Field label="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" />
          <button onClick={handleAuth} disabled={loading || !email || !pass} className="w-full py-4 rounded-2xl bg-[#602424] text-white text-[16px] font-semibold mt-2 active:scale-[0.98] transition-transform disabled:opacity-50">
            {loading ? "Please wait…" : isSignUp ? "Create account" : "Continue"}
          </button>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <p className="text-center text-[14px] text-gray-500">
            {isSignUp ? "Already have an account?" : "New here?"}{" "}
            <span className="text-[#602424] font-medium cursor-pointer" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? "Sign in" : "Create account"}
            </span>
          </p>
        </div>
      </div>
    </Shell>
  );
}

// ── Onboarding 1: grade ─────────────────────────────────────────────────────
function Ob1({ nav, onGrade }: { nav: Nav; onGrade: (g: string) => void }) {
  const [grade, setGrade] = useState("");
  const grades = ["6th", "7th", "8th", "9th", "10th", "11th", "12th", "College"];
  return (
    <ObShell step={0} total={2} onBack={() => nav("login")} onNext={() => nav("ob3")} nextDisabled={!grade}>
      <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">What grade are you in?</h2>
      <p className="text-[14px] text-gray-500 mb-8">We use this to set the right reading level and content depth.</p>
      <div className="grid grid-cols-4 gap-2.5">
        {grades.map((g) => (
          <button key={g} onClick={() => { setGrade(g); onGrade(g); }}
            className={`py-3.5 rounded-xl text-[14px] font-medium border transition-all active:scale-95 ${grade === g ? "bg-[#602424] text-white border-[#602424]" : "bg-white text-gray-700 border-gray-200"}`}>
            {g}
          </button>
        ))}
      </div>
    </ObShell>
  );
}

// ── Onboarding 2: learning mode (sets default mode) ─────────────────────────
function Ob3({ nav, onPick }: { nav: Nav; onPick: (m: Mode) => void }) {
  const [sel, setSel] = useState("");
  const options = [
    ...MODE_META,
    { id: "instructor", label: "As your teacher designed it", desc: "Exactly how your instructor put it together" },
  ];
  return (
    <ObShell
      step={1} total={2} onBack={() => nav("ob1")}
      onNext={() => { if (sel && sel !== "instructor") onPick(sel as Mode); nav("courses"); }}
      nextLabel="Start learning" nextDisabled={!sel}
    >
      <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight mb-1">How do you learn best?</h2>
      <p className="text-[14px] text-gray-500 mb-8">You can always switch formats mid-lesson.</p>
      <div className="flex flex-col gap-2.5">
        {options.map((o) => (
          <button key={o.id} onClick={() => setSel(o.id)}
            className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${sel === o.id ? "border-[#602424] bg-white" : "border-gray-200 bg-white"}`}>
            <div className="flex-1">
              <p className="font-semibold text-[15px] text-gray-900">{o.label}</p>
              <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{o.desc}</p>
            </div>
            <Radio on={sel === o.id} />
          </button>
        ))}
      </div>
    </ObShell>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${on ? "bg-[#602424] border-[#602424]" : "border-gray-300"}`}>
      {on && <Check size={11} className="text-white" strokeWidth={3} />}
    </div>
  );
}

type UnitPick = { courseId: string; unitId: string; topic: string; moduleLabel: string };

// ── Courses home ────────────────────────────────────────────────────────────
function Courses({
  nav, onPickUnit,
}: {
  nav: Nav;
  onPickUnit: (pick: UnitPick) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joiningBusy, setJoiningBusy] = useState(false);

  const load = () => { api.courses.listCourses().then(setCourses); };
  useEffect(() => { load(); }, []);

  const handleJoin = async () => {
    if (!code.trim()) return;
    setJoiningBusy(true);
    setJoinError("");
    try {
      await api.courses.joinCourse(code.trim());
      setJoining(false);
      setCode("");
      load();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setJoiningBusy(false);
    }
  };

  const openUnit = (c: Course, u: CourseUnit) => {
    onPickUnit({
      courseId: c.id,
      unitId: u.id,
      topic: u.concept,
      moduleLabel: u.moduleLabel,
    });
    nav("unit");
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="px-6 pt-2 pb-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[13px] text-gray-500 font-medium">Good morning,</p>
            <h2 className="text-[26px] font-bold text-[#2c0312] tracking-tight leading-tight">My courses</h2>
          </div>
          <OwlAnim className="w-16 h-16 object-contain" />
        </div>

        <button onClick={() => setJoining(true)}
          className="w-full mb-5 py-3.5 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 text-[14px] font-medium flex items-center justify-center gap-2 hover:border-[#602424] hover:text-[#602424] transition-all active:scale-[0.98]">
          <span className="text-[20px] leading-none font-light">+</span> Join a course
        </button>

        {courses.length === 0 && (
          <p className="text-center text-[14px] text-gray-400 py-8">Join a course with your classroom code to get started.</p>
        )}

        <div className="flex flex-col gap-3">
          {courses.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#602424] uppercase tracking-widest">{c.subject}</p>
                  <p className="text-[16px] font-semibold text-gray-900 mt-0.5 leading-snug">{c.unitTitle}</p>
                  <p className="text-[12px] text-gray-400 mt-1">{c.teacher} · {c.units} units</p>
                </div>
              </div>
              {(c.unitList ?? []).map((u) => (
                <button key={u.id} onClick={() => openUnit(c, u)}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#f5ede8] text-left flex items-center justify-between active:scale-[0.98] transition-transform">
                  <span className="text-[14px] font-medium text-[#602424]">{u.moduleLabel}: {u.concept}</span>
                  <ChevronRight size={16} className="text-[#602424]" />
                </button>
              ))}
              {(!c.unitList || c.unitList.length === 0) && (
                <button onClick={() => { onPickUnit({ courseId: c.id, unitId: c.id, topic: c.unitTitle, moduleLabel: "Module 1" }); nav("unit"); }}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#f5ede8] text-left flex items-center justify-between">
                  <span className="text-[14px] font-medium text-[#602424]">Open course</span>
                  <ChevronRight size={16} className="text-[#602424]" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {joining && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-end z-50" onClick={() => setJoining(false)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.28, ease: [0.32, 0, 0.18, 1] }}
              onClick={(e) => e.stopPropagation()} className="w-full bg-[#fdf8f5] rounded-t-3xl p-6 pb-10">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
              <h3 className="text-[20px] font-bold text-[#2c0312] mb-5">Join a course</h3>
              <div className="flex flex-col gap-3">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Classroom code (e.g. HCGFGW)"
                  className="w-full py-4 px-4 rounded-2xl border-2 border-gray-200 bg-white text-[18px] font-bold text-center tracking-widest text-gray-800 outline-none focus:border-[#602424] transition-all" />
                <p className="text-[12px] text-gray-500 text-center">Use the 6-character code from your teacher&apos;s app — not an org signup code.</p>
                {joinError && <p className="text-[13px] text-red-600 text-center">{joinError}</p>}
                <button onClick={handleJoin} disabled={joiningBusy || !code.trim()}
                  className="w-full py-4 rounded-2xl bg-[#602424] text-white text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-50">
                  {joiningBusy ? "Joining…" : "Join"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [prevScreen, setPrevScreen] = useState<Screen>("splash");
  const [defaultMode, setDefaultMode] = useState<Mode>("conversational");
  const [grade, setGrade] = useState("");
  const [unitPick, setUnitPick] = useState<UnitPick>({
    courseId: "", unitId: "", topic: "", moduleLabel: "Module 1",
  });

  const [teacherMeta, setTeacherMeta] = useState<TeacherMeta>({
    goals: "", grade: "", subject: "", teacherName: "", orgId: "",
  });
  const [uploads, setUploads] = useState<{ uploadId: string; filename: string }[]>([]);
  const [createdCourse, setCreatedCourse] = useState<CreatedCourse | null>(null);

  const nav: Nav = (s) => {
    setPrevScreen(screen);
    setScreen(s);
  };

  // Nexus launch handoff: arriving with ?lt=<one-time launch token> means the
  // user is already signed in on the platform — exchange it for a session and
  // skip the login screens entirely.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const launchToken = params.get("lt");
    if (!launchToken) return;
    window.history.replaceState({}, "", window.location.pathname);
    exchangeLaunchToken(launchToken)
      .then((user) => {
        const isEducator = user.role === "teacher" || user.role === "org_admin" || user.role === "platform_admin";
        if (isEducator) {
          setTeacherMeta((m) => ({ ...m, teacherName: user.display_name || user.email.split("@")[0] }));
          setScreen("t-ob1");
        } else {
          setScreen("ob1");
        }
      })
      .catch(() => {
        // Expired/used launch token — fall through to the normal splash flow.
        setScreen("splash");
      });
  }, []);

  const dir = SCREEN_ORDER.indexOf(screen) >= SCREEN_ORDER.indexOf(prevScreen) ? 1 : -1;

  const views: Record<Screen, React.ReactNode> = {
    splash: <Splash nav={nav} />,
    login: <Login nav={nav} />,
    ob1: <Ob1 nav={nav} onGrade={setGrade} />,
    ob3: <Ob3 nav={nav} onPick={setDefaultMode} />,
    courses: <Courses nav={nav} onPickUnit={setUnitPick} />,
    unit: (
      <Unit
        nav={nav}
        defaultMode={defaultMode}
        topic={unitPick.topic}
        grade={grade}
        courseId={unitPick.courseId || undefined}
        unitId={unitPick.unitId || undefined}
        moduleLabel={unitPick.moduleLabel}
      />
    ),
    "t-login": <TeacherLogin nav={nav} onName={(n) => setTeacherMeta((m) => ({ ...m, teacherName: n }))} />,
    "t-ob1": <TeacherOb1 nav={nav} goals={teacherMeta.goals} onGoals={(g) => setTeacherMeta((m) => ({ ...m, goals: g }))} />,
    "t-ob2": (
      <TeacherOb2
        nav={nav}
        grade={teacherMeta.grade}
        subject={teacherMeta.subject}
        orgId={teacherMeta.orgId ?? ""}
        onGrade={(g) => setTeacherMeta((m) => ({ ...m, grade: g }))}
        onSubject={(s) => setTeacherMeta((m) => ({ ...m, subject: s }))}
        onOrgId={(id) => setTeacherMeta((m) => ({ ...m, orgId: id }))}
      />
    ),
    "t-ob3": <TeacherOb3 nav={nav} />,
    "t-upload": (
      <TeacherUpload
        nav={nav}
        uploads={uploads}
        onAddUpload={(u) => setUploads((prev) => [...prev, u])}
      />
    ),
    "t-builder": (
      <TeacherBuilder
        nav={nav}
        teacherMeta={teacherMeta}
        uploadIds={uploads.map((u) => u.uploadId)}
        onCreated={setCreatedCourse}
      />
    ),
    "t-app": <TeacherApp nav={nav} joinCode={createdCourse?.joinCode} ingestJobId={createdCourse?.ingestJobId} />,
  };

  return (
    <div className="size-full" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AnimatePresence mode="wait" custom={dir}>
        <Slide key={screen} dir={dir}>
          {views[screen]}
        </Slide>
      </AnimatePresence>
    </div>
  );
}
