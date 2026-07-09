import { useCallback, useEffect, useState } from "react";
import { Users, Link2, Hash, Check, Copy, RefreshCw } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DataAPI } from "../lib/api";
import { ow } from "../components/owlwise/instructorUi";

type Tab = "students" | "info" | "teachers";

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  masteredCount: number;
  conceptCount: number;
};

export function InstructorChallengeScreen() {
  const [tab, setTab] = useState<Tab>("students");
  const { courseTitle, courseId, coursePublished } = useApp();

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);

  const joinLink = joinCode ? `${window.location.origin}/?join=${joinCode}` : "";

  const fetchCode = useCallback(async (regenerate = false) => {
    if (!courseId) return;
    setCodeError(null);
    if (regenerate) setRegenerating(true);
    try {
      const { joinCode: code } = await DataAPI.joinCode(courseId, regenerate);
      setJoinCode(code);
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : "Could not load join code");
    } finally {
      setRegenerating(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchCode().catch(() => {});
  }, [fetchCode]);

  useEffect(() => {
    if (!courseId) return;
    DataAPI.courseStudents(courseId)
      .then((res) => setStudents(res.students))
      .catch(() => setStudents([]));
  }, [courseId]);

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? joinCode ?? "" : joinLink;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const tabs: { id: Tab; label: string; color?: string }[] = [
    { id: "students", label: "Invite & enroll", color: "#ff9500" },
    { id: "info", label: "Challenge info", color: "#ff3b30" },
    { id: "teachers", label: "Co-instructors", color: "#007aff" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Invite students</h1>
          <p className="text-sm text-gray-500 mt-1">
            Share a join code or link for <span className="font-semibold text-gray-700">{courseTitle ?? "your classroom"}</span>.
          </p>
        </div>
        <div className="flex gap-0 rounded-2xl overflow-hidden mb-5 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-bold transition-all ${
                tab === t.id ? "text-white" : "bg-white text-gray-600"
              }`}
              style={tab === t.id ? { backgroundColor: t.color } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "students" && (
          <div className={`${ow.card} p-6 space-y-4`}>
            {!coursePublished && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                This course isn&apos;t published yet — students can&apos;t join until you publish it from the course builder.
              </p>
            )}
            {codeError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{codeError}</p>
            )}

            <div className={`${ow.card} p-5 bg-[#fdf8f5]`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Classroom join code</p>
                <button
                  type="button"
                  onClick={() => fetchCode(true)}
                  disabled={regenerating || !courseId}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} /> New code
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center mb-4">
                <span className="text-2xl font-black tracking-[0.2em] text-[#602424] bg-white border border-gray-200 rounded-xl px-4 py-2">
                  {joinCode ?? "……"}
                </span>
                <button
                  type="button"
                  onClick={() => copy("code")}
                  disabled={!joinCode}
                  className={`${ow.btn} flex items-center gap-2 disabled:opacity-50`}
                  style={ow.btnStyle}
                >
                  {copied === "code" ? <Check className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                  {copied === "code" ? "Copied!" : "Copy code"}
                </button>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Student classroom join link</p>
              <div className="flex gap-2">
                <input readOnly value={joinLink || "Publish the course to activate the link"} className={`${ow.input} flex-1`} />
                <button
                  type="button"
                  onClick={() => copy("link")}
                  disabled={!joinLink}
                  className={`${ow.btn} flex items-center gap-2 shrink-0 disabled:opacity-50`}
                  style={ow.btnStyle}
                >
                  {copied === "link" ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                  {copied === "link" ? "Copied!" : "Copy link"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Students sign in, tap &ldquo;Join a course&rdquo;, and enter the code — or just open the link.
              </p>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                <span>Name</span>
                <span>Email</span>
                <span>Enrolled</span>
                <span>Mastery</span>
              </div>
              {students === null ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">Loading students…</div>
              ) : students.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
                  <Users className="w-8 h-8 text-gray-300" />
                  No students enrolled yet — share your join link or code.
                </div>
              ) : (
                students.map((s) => (
                  <div key={s.userId} className="grid grid-cols-4 gap-2 px-4 py-3 border-t border-gray-100 text-sm text-gray-700 items-center">
                    <span className="font-semibold truncate">{s.name}</span>
                    <span className="truncate text-gray-500">{s.email}</span>
                    <span className="text-green-600 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Yes
                    </span>
                    <span className="text-gray-500">
                      {s.conceptCount ? `${s.masteredCount}/${s.conceptCount} units` : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "info" && (
          <div className={`${ow.card} p-6 space-y-4`}>
            <div>
              <label className={ow.label + " mb-1 block"}>Challenge name</label>
              <input defaultValue={courseTitle ?? "Untitled course"} className={ow.input} />
            </div>
            <div>
              <label className={ow.label + " mb-1 block"}>Description</label>
              <textarea className={ow.textarea + " h-24"} placeholder="Describe the challenge event..." />
            </div>
            <div>
              <label className={ow.label + " mb-1 block"}>Challenge date</label>
              <input type="date" className={ow.input} />
            </div>
            <div>
              <label className={ow.label + " mb-1 block"}>Location & other info</label>
              <input placeholder="Remote, in-person, etc." className={ow.input} />
            </div>
          </div>
        )}

        {tab === "teachers" && (
          <div className={`${ow.card} p-6`}>
            <p className="text-sm text-gray-500 font-medium mb-4">
              Share your classroom join link with co-instructors so they can preview the course as a student.
            </p>
            <div className="flex gap-2">
              <input readOnly value={joinLink || "Publish the course to activate the link"} className={`${ow.input} flex-1`} />
              <button type="button" onClick={() => copy("link")} disabled={!joinLink} className={`${ow.btn} shrink-0 disabled:opacity-50`} style={ow.btnStyle}>
                Copy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
