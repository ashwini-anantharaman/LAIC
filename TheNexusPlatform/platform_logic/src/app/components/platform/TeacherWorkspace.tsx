/**
 * Instructor (teacher/coach) workspace — the scoped counterpart to the org
 * admin's PlatformWorkspace.
 *
 * A teacher belongs to a program inside an organization but is NOT an org admin:
 * they must never see the org-wide program grid, other programs, or org
 * supervision. They see only the program(s) their instructor membership grants,
 * and their job here is to create and manage that program's courses. The backend
 * enforces this too (isOfferingAdmin allows an instructor only within their own
 * program_id).
 */
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, Dices, ChevronRight, ArrowLeft } from "lucide-react";
import type { MembershipSummary } from "../../../types/platform";
import type { Offering, Program, ProgramCategory } from "../../../types/platform";
import { BORDER, MUTED, FONT_HEAD, FONT_BODY } from "../../theme";
import { ProgramDetail } from "./PlatformWorkspace";
import { OfferingDetail } from "./OfferingDetail";

/** Build a minimal Program from an instructor membership summary. */
function programFromMembership(m: MembershipSummary): Program {
  return {
    id: m.program_id as string,
    org_id: m.org_id,
    name: m.program_name || "Your program",
    category: (m.program_category as ProgramCategory) || "edu",
    description: undefined,
  };
}

type Nav = { level: "program"; program: Program } | { level: "offering"; program: Program; offering: Offering };

export function TeacherWorkspace({
  memberships, displayName, accent,
}: {
  memberships: MembershipSummary[]; displayName: string; accent: string;
}) {
  // Instructor memberships that are actually tied to a program.
  const programs = memberships
    .filter((m) => m.role === "instructor" && m.program_id)
    .map(programFromMembership);
  // De-dupe by program id (a teacher could have multiple stage-scoped rows).
  const uniquePrograms = Array.from(new Map(programs.map((p) => [p.id, p])).values());

  const [nav, setNav] = useState<Nav | null>(
    uniquePrograms.length === 1 ? { level: "program", program: uniquePrograms[0] } : null,
  );

  const orgName = memberships[0]?.org_name || "Organization";
  const roleWord = uniquePrograms[0]?.category === "game" ? "Coach" : "Teacher";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: MUTED, fontFamily: FONT_BODY }}>{orgName} · {roleWord}</p>
        <h2 className="mt-1 text-2xl font-bold text-white tracking-tight" style={{ fontFamily: FONT_HEAD }}>
          {nav ? nav.program.name : "Your programs"}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: FONT_BODY }}>
          Create and manage the courses for your program.
        </p>
      </div>

      {/* Breadcrumb / back — only within the teacher's own program scope */}
      {nav && (
        <div className="flex items-center gap-2 flex-wrap" style={{ fontFamily: FONT_BODY }}>
          {uniquePrograms.length > 1 && (
            <>
              <button className="text-sm transition-colors focus:outline-none hover:text-white" style={{ color: MUTED }} onClick={() => setNav(null)}>Your programs</button>
              <ChevronRight size={14} style={{ color: MUTED }} />
            </>
          )}
          <button
            className="text-sm transition-colors focus:outline-none"
            style={{ color: nav.level === "program" ? "white" : MUTED }}
            onClick={() => setNav({ level: "program", program: nav.program })}
          >
            {nav.program.name}
          </button>
          {nav.level === "offering" && (
            <>
              <ChevronRight size={14} style={{ color: MUTED }} />
              <span className="text-sm text-white">{nav.offering.name}</span>
            </>
          )}
        </div>
      )}

      {nav && (
        <button
          type="button"
          onClick={() =>
            nav.level === "offering"
              ? setNav({ level: "program", program: nav.program })
              : uniquePrograms.length > 1
                ? setNav(null)
                : undefined
          }
          className="flex items-center gap-1.5 text-xs transition-colors focus:outline-none hover:text-white -mt-2 disabled:opacity-0"
          style={{ color: MUTED, fontFamily: FONT_BODY }}
          disabled={nav.level === "program" && uniquePrograms.length <= 1}
        >
          <ArrowLeft size={14} /> Back
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={nav ? nav.level + nav.program.id + (nav.level === "offering" ? nav.offering.id : "") : "picker"}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
        >
          {!nav ? (
            uniquePrograms.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.03)", border: `1px dashed ${BORDER}` }}>
                <p className="text-sm" style={{ color: MUTED, fontFamily: FONT_BODY }}>
                  You're not assigned to a program yet. Ask your organization admin for a program join code.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {uniquePrograms.map((p) => {
                  const Icon = p.category === "game" ? Dices : GraduationCap;
                  return (
                    <button
                      key={p.id} type="button" onClick={() => setNav({ level: "program", program: p })}
                      className="text-left rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/6 focus:outline-none"
                      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}
                    >
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent, color: "#111" }}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-white" style={{ fontFamily: FONT_HEAD }}>{p.name}</p>
                        <p className="text-[11px]" style={{ color: MUTED, fontFamily: FONT_BODY }}>{p.category === "game" ? "Coaching program" : "Learning program"}</p>
                      </div>
                      <ChevronRight size={16} style={{ color: MUTED, marginLeft: "auto" }} />
                    </button>
                  );
                })}
              </div>
            )
          ) : nav.level === "program" ? (
            <ProgramDetail
              program={nav.program} accent={accent}
              onOpenOffering={(o) => setNav({ level: "offering", program: nav.program, offering: o })}
            />
          ) : (
            <OfferingDetail
              program={nav.program} offering={nav.offering} accent={accent}
              onDeleted={() => setNav({ level: "program", program: nav.program })}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
