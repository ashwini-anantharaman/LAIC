import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";

/** The in-app guide (2026-07-20): how knowledge works, written for fellows,
 *  living where the work happens. Sections carry stable anchors so the
 *  workspace can deep-link ("what's this? →" next to Versions, History…). */

const TOC = [
  ["how-it-fits", "How it fits together"],
  ["items", "Knowledge items"],
  ["types", "Types & who wins"],
  ["rules", "Rules"],
  ["settings", "Settings & dials"],
  ["engine", "How the AI decides"],
  ["versions", "Versions & history"],
  ["completeness", "Complete players"],
  ["editing", "Editing safely"],
] as const;

const h2 = "font-serif text-2xl font-medium";
const lede = "mt-1 mb-4 max-w-2xl text-sm text-neutral-500";
const prose = "max-w-2xl space-y-3 text-[15px] leading-relaxed text-neutral-700";
const card = "rounded-lg border border-neutral-200 bg-[var(--card)] p-5";

function Section({
  id,
  title,
  intro,
  children,
}: Readonly<{ id: string; title: string; intro?: string; children: React.ReactNode }>) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className={h2}>{title}</h2>
      {intro && <p className={lede}>{intro}</p>}
      {children}
    </section>
  );
}

export default async function GuidePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  return (
    <div className="mx-auto max-w-3xl space-y-12 pb-16">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Bridge</p>
        <h1 className="mt-1 text-3xl font-medium">Guide</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          How knowledge works on this platform — every bid and card an AI player makes traces
          to one rule inside one knowledge item, and everything you change is versioned. Written
          for bridge people; no programming background assumed.
        </p>
        <nav className="mt-4 flex flex-wrap gap-1.5">
          {TOC.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-500 hover:text-neutral-900"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="how-it-fits"
        title="How it fits together"
        intro="Five stops between a sentence in the SAYC booklet and a card hitting the felt."
      >
        <ol className="max-w-2xl space-y-2 text-[15px] text-neutral-700">
          <li>① A <b>knowledge base</b> holds one system (SAYC, 2/1, …).</li>
          <li>② Its <b>Master</b> tab holds every <b>knowledge item</b> — one per agreement, convention, or technique.</li>
          <li>③ <b>Knowledge sets</b> group items ("Floor", "Full booklet"); a set may optionally include another set.</li>
          <li>④ A <b>player</b> carries one or more sets plus setting choices — that is <i>all</i> it knows.</li>
          <li>⑤ At the <b>table</b>, every decision traces to the rule, the item, and the cited source passage. Click any decision to see the chain.</li>
        </ol>
        <p className={`${prose} mt-3`}>
          <b>The golden rule:</b> the AI never &ldquo;just knows bridge.&rdquo; If no item covers a
          situation it says so honestly (see <a href="#engine" className="text-emerald-700 underline-offset-2 hover:underline">How the AI decides</a>);
          when it does something wrong, a specific item — or a specific gap — is responsible.
        </p>
      </Section>

      <Section
        id="items"
        title="Knowledge items"
        intro="What each field on an item page means. Names match the editor."
      >
        <div className={card}>
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="font-medium">Title</dt>
            <dd className="text-neutral-600">Short, findable name — &ldquo;1NT opening&rdquo;.</dd>
            <dt className="font-medium">What a player reads</dt>
            <dd className="text-neutral-600">The agreement in plain words. Humans only — the engine ignores it. Its job is to let a person check the rules below match the intent.</dd>
            <dt className="font-medium">Type</dt>
            <dd className="text-neutral-600">What kind of knowledge this is — and which rules outrank which (<a href="#types" className="text-emerald-700 underline-offset-2 hover:underline">next section</a>). The editor shows only the rule section your type uses.</dd>
            <dt className="font-medium">Phase</dt>
            <dd className="text-neutral-600">auction · opening lead · declarer play · defense · scoring (scoring items are teaching prose; the engine always scores by Law 77).</dd>
            <dt className="font-medium">Status</dt>
            <dd className="text-neutral-600">draft → reviewed → approved: <b>a trust badge only</b> — a draft plays exactly like an approved item. Deprecated items stop compiling.</dd>
            <dt className="font-medium">Rules</dt>
            <dd className="text-neutral-600">The precise version of the agreement — the part that plays (<a href="#rules" className="text-emerald-700 underline-offset-2 hover:underline">Rules</a>).</dd>
            <dt className="font-medium">Settings</dt>
            <dd className="text-neutral-600">Toggles and dials the item offers every player carrying it (<a href="#settings" className="text-emerald-700 underline-offset-2 hover:underline">Settings &amp; dials</a>).</dd>
            <dt className="font-medium">Citations</dt>
            <dd className="text-neutral-600">Which passages of which source this came from — click one to open the source with the passage highlighted. Hand-authored items cite the Claude source, unless you arrived from the Sources tab&apos;s write-up queue, which attaches the real passage for you.</dd>
            <dt className="font-medium">Level tags</dt>
            <dd className="text-neutral-600">Advisory labels from extraction. Knowledge <i>sets</i> are what actually decide who knows what.</dd>
          </dl>
        </div>
      </Section>

      <Section
        id="types"
        title="Types & who wins"
        intro="When several rules match the same situation, type decides the pecking order — in bands."
      >
        <div className={card}>
          <ol className="space-y-2 text-sm text-neutral-700">
            <li><b>1 · Exceptions</b> — &ldquo;…but not when&rdquo; rules. Always outrank what they carve out.</li>
            <li><b>2 · Conventions</b> — Stayman, transfers, Gerber… outrank natural bidding.</li>
            <li><b>3 · The system</b> — bidding rules, agreements, techniques, lead &amp; signal agreements.</li>
            <li><b>4 · Fallbacks</b> — &ldquo;when nothing else applies&rdquo;: pass; lowest legal card; a default lead. Tried dead last.</li>
            <li><b>— · Teaching prose</b> — concepts and judgment guidelines carry no rules and never play.</li>
          </ol>
        </div>
        <p className={`${prose} mt-3`}>
          Within a band, each rule&apos;s <b>Priority</b> number breaks ties (lower fires first).
          Pick the type that names what the thing <i>is</i> and the banding mostly takes care of
          itself — reach for priority numbers only when two rules of the same type collide.
        </p>
      </Section>

      <Section
        id="rules"
        title="Rules"
        intro="Each rule is one sentence, and the editor is built around it."
      >
        <div className={prose}>
          <p>
            <b>When</b> the auction looks like this, <b>and</b> my hand looks like that,
            <b> then</b> make this call. Every rule card has exactly those three bands, plus a
            header (Label, stable Key, Priority) — and a <b>live plain-English sentence</b> that
            updates as you type. If the sentence reads wrong, the rule is wrong.
          </p>
          <p>
            <b>WHEN</b> — your role (opening / opener / responder / overcaller / advancer),
            whether the auction is contested, and what specific calls were made: &ldquo;Our
            opening was…&rdquo;, &ldquo;Partner&apos;s last call was…&rdquo; (set it to a 1-level
            NT bid and the sentence reads &ldquo;partner&apos;s last call was 1NT&rdquo; — the
            Stayman context), &ldquo;RHO&apos;s last call was…&rdquo;. Anything left at its
            default doesn&apos;t constrain.
          </p>
          <p>
            <b>AND MY HAND</b> — HCP min/max (a number, or a dial like{" "}
            <code className="rounded bg-neutral-100 px-1">$nt_range.low</code>), total points,
            shape, and up to two suit holdings (&ldquo;4+ ♥ <i>and</i> 4+ ♠&rdquo; is one rule
            with two holdings — the second field appears once the first is used). The suit can be
            contextual: partner&apos;s last bid suit, my longest suit, RHO&apos;s suit. Three rare
            checks live only in the &ldquo;Extra conditions (JSON)&rdquo; box: longest-suit-among,
            suit quality, and stoppers.
          </p>
          <p>
            <b>THEN</b> — the call: bid exactly, pass, double, redouble, raise partner&apos;s
            suit, or bid-my-longest-among. If the call is illegal in the live auction the rule
            simply doesn&apos;t fire and the next candidate is tried.
          </p>
        </div>
      </Section>

      <Section
        id="settings"
        title="Settings & dials"
        intro="Settings let one item serve many partnerships. They live inside the item that uses them."
      >
        <div className={prose}>
          <p>
            <b>Enable</b> settings are gates: switched off, every rule in the item goes silent
            for that player (<code className="rounded bg-neutral-100 px-1">stayman_on</code>).
            <b> Parameter</b> settings are dials the rules read via{" "}
            <code className="rounded bg-neutral-100 px-1">$setting</code> references — the 1NT
            item&apos;s range is <code className="rounded bg-neutral-100 px-1">$nt_range.low</code>–
            <code className="rounded bg-neutral-100 px-1">$nt_range.high</code>, so a coach who
            prefers 14–16 turns the dial on their player and the item never changes.
          </p>
          <p>
            Remember the split: <b>sets decide membership, settings tune within it.</b> Removing
            a set removes knowledge; a setting only configures knowledge the player already
            carries.
          </p>
        </div>
      </Section>

      <Section
        id="engine"
        title="How the AI decides"
        intro="Every turn, exactly this happens — and the table's Decisions rail shows you all of it."
      >
        <ol className="max-w-2xl list-inside list-decimal space-y-2 text-[15px] text-neutral-700">
          <li><b>Collect the player&apos;s knowledge</b> — every item in its sets (Includes chains count); rules behind switched-off enable gates are dropped.</li>
          <li><b>Read the auction</b> — role, contested, partner&apos;s and RHO&apos;s last calls, round.</li>
          <li><b>Walk every rule in band-then-priority order</b> — wrong context is skipped; failed hand checks are recorded in the trace with the settings consulted; a legal match becomes a candidate.</li>
          <li><b>Pick a candidate</b> — <i>first match (deterministic)</i> by default; <i>weighted random (variety)</i> picks among ties, seeded per board so replays are identical.</li>
          <li><b>Nothing matched?</b> The fallback item fires (auction: pass) — honestly labeled &ldquo;no agreement applied.&rdquo;</li>
          <li><b>No fallback either?</b> The <b>engine floor</b> acts, loudly marked — it exists so a game can&apos;t jam and never counts as knowledge. A well-built set produces zero floor events.</li>
        </ol>
      </Section>

      <Section
        id="versions"
        title="Versions & history"
        intro="Nothing you do is destructive. Four layers of history, each visible in the workspace."
      >
        <div className="space-y-3">
          <div className={card}>
            <h3 className="text-sm font-semibold">Knowledge items — commit &amp; restore</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Every save bumps the item&apos;s revision. <b>Commit version</b> (on the item page)
              freezes an immutable numbered snapshot — v1, v2… — and marks it <b>main</b>.
              &ldquo;Make main&rdquo; on an older version restores its content <i>without</i>{" "}
              minting a new one; your next edit does. The item reads <i>uncommitted edits</i>{" "}
              whenever the head has drifted past main. The main version and any version pinned by
              a published release can&apos;t be deleted.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Don&apos;t want to touch the original at all? <b>&ldquo;Save as a new knowledge
              item&rdquo;</b>{" "}branches a copy with a &ldquo;forked from&rdquo; link back. (Editing
              an item that&apos;s shared with another KB forks your own copy automatically — one
              KB never rewrites another&apos;s.)
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Knowledge sets — automatic history</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Every save of a set lands a numbered snapshot automatically (identical re-saves
              don&apos;t) — see the <b>History</b> panel on the set page. <b>Restore</b> brings an
              older state back <i>as the newest version</i>; nothing is overwritten, and if a
              restored version referenced items or an Includes that no longer exist, they&apos;re
              dropped and the banner tells you. Deleting a set is refused while any player, set,
              or sandbox still uses it.
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">KB releases — the published line</h3>
            <p className="mt-1 text-sm text-neutral-600">
              <b>Publish a version</b>{" "}(Versions tab) commits every item with uncommitted edits
              and freezes the whole KB as release v1, v2… — a broken KB can&apos;t be released.
              <b> Make active</b> points consumers at an older release (rollback) or forward
              again, without re-publishing. Releases pin exact item versions and the compiled
              artifact, so they never drift.
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Boards — forks, never rewrites</h3>
            <p className="mt-1 text-sm text-neutral-600">
              A board in progress is pinned to the knowledge that dealt it — your edits affect
              the <i>next</i> board. Swapping a seat or editing the deal mid-play <b>forks</b>{" "}
              the board (the original keeps its history); the mid-play deal editor continues the
              game on the edited cards, with played cards locked where they fell.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="completeness"
        title="Complete players"
        intro="A player is complete when its knowledge covers all 17 capability categories."
      >
        <p className={prose}>
          Nine auction categories (opening policy, pass policy, responses to suit and NT
          openings, both rebids, competitive fallback, doubles, preempts), the opening-lead
          policy, three declarer categories, and four defense categories. The three fallback
          items cover most of them on their own — &ldquo;always pass, lowest card&rdquo; is
          minimally complete. The one exception is <b>signals</b>: absence is not a policy, so a
          signal agreement (even an explicit &ldquo;none&rdquo;) is always required. Incomplete
          players still play — but only in constrained drills, where the dealer guarantees deals
          they can finish without the engine floor. A set&apos;s own checklist appears once you
          tick <b>&ldquo;Intended to be complete&rdquo;</b> on the set page.
        </p>
      </Section>

      <Section
        id="editing"
        title="Editing safely"
        intro="The platform is built so you can edit fearlessly."
      >
        <ul className="max-w-2xl list-inside list-disc space-y-2 text-[15px] text-neutral-700">
          <li><b>Every save recompiles the KB immediately</b> — new boards use it at once; boards in progress keep what they started with.</li>
          <li><b>You cannot break the table.</b> A save that doesn&apos;t compile leaves the last good version serving and banners the exact error. Fix and save again.</li>
          <li><b>Everything is versioned</b> — see <a href="#versions" className="text-emerald-700 underline-offset-2 hover:underline">Versions &amp; history</a>.</li>
          <li><b>Hand-authoring starts on the Sources tab</b>: sections the automatic reader couldn&apos;t structure queue under &ldquo;Sections that need a person&rdquo; — &ldquo;Write this up&rdquo; opens the editor with the passage alongside and the citation attached, and the card checks itself off once an item cites that passage.</li>
          <li><b>Flag anything at the table.</b> Every decision has a Flag button that files a suggestion into the KB&apos;s queue, linked to the exact board and decision.</li>
        </ul>
        <p className="mt-6 text-xs text-neutral-400">
          This guide matches the live platform (2026-07-20). Questions it doesn&apos;t answer are
          bugs in the guide — flag them.
        </p>
      </Section>
    </div>
  );
}
