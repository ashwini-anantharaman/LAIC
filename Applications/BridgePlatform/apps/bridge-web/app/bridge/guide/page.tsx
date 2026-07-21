import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";

/** The in-app guide (2026-07-21): how knowledge works, written for fellows,
 *  living where the work happens. Sections carry stable anchors so the
 *  workspace can deep-link ("what's this? →" next to Versions, History…). */

const TOC = [
  ["how-it-fits", "How it fits together"],
  ["play", "Playing a board"],
  ["viewer", "The Master view"],
  ["items", "Knowledge items"],
  ["types", "Types & who wins"],
  ["rules", "Rules"],
  ["forcing", "Forcing situations"],
  ["settings", "Settings & dials"],
  ["engine", "How the AI decides"],
  ["versions", "Versions & history"],
  ["augment", "Augmenting with a source"],
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
          <li>③ <b>Knowledge sets</b> group items (&ldquo;Floor&rdquo;, &ldquo;Full SAYC&rdquo;); a set may optionally include another set.</li>
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
        id="play"
        title="Playing a board"
        intro="Play offers two doors, and a board never moves until you tell it to."
      >
        <div className="space-y-3">
          <div className={card}>
            <h3 className="text-sm font-semibold">Quickplay vs. Customize</h3>
            <p className="mt-1 text-sm text-neutral-600">
              <b>Quickplay</b> resumes your unfinished board, or deals a fresh one immediately —
              you sit South against three house players carrying the strongest knowledge set.
              <b> Customize</b> opens the table builder: pick a knowledge set to play against or
              watch, choose <i>every</i> seat&apos;s player yourself, set the deal seed, start
              from a saved board in the library (or author/import one), or run a{" "}
              <b>constrained drill</b> — for incomplete players, the dealer only accepts a deal
              a full simulation finishes without the engine floor.
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Boards never self-start</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Opening a board shows <b>▶ start</b> (or <b>▶ resume</b> on a board with history) —
              the AI seats play one decision per beat only after you press it, and <b>❚❚</b>{" "}
              pauses them again. <b>step ▸</b> pauses and advances exactly one decision —
              the tool for walking a trace. <b>play to end</b> finishes the whole board at once.
              <b> undo</b> rewinds the last decision and comes back paused, so the AI can&apos;t
              instantly replay the decision you&apos;re inspecting.
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Bidding and playing as a human</h3>
            <p className="mt-1 text-sm text-neutral-600">
              When it&apos;s your call, the bid pad works in two taps: pick a <b>level</b> (1–7 —
              levels with no legal bid are greyed), then the five strains (♣ ♦ ♥ ♠ NT) light up —
              tap one to bid. <b>Pass / Dbl / Rdbl</b> are always one tap. In the play, tap a
              raised card in your hand (you also play dummy&apos;s cards when you&apos;re
              declarer).
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Everything else on the table bar</h3>
            <p className="mt-1 text-sm text-neutral-600">
              <b>show all hands</b> reveals the other seats. <b>save to library</b> keeps the
              board (or the deal) for later. <b>edit deal</b> opens the mid-play deal editor —
              the game continues on the edited cards, played cards locked where they fell.
              <b> new board</b> deals again with the same lineup; <b>choose a table</b> returns
              to the builder. <b>learner view</b> hides the verification rail for a clean
              student-facing felt. The <b>Decisions</b> rail is the heart of it: every entry
              opens into the full trace — which rules were considered, why each was rejected,
              what the settings said — with <b>Flag</b> and <b>fix at the table</b> on each one.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="viewer"
        title="The Master view"
        intro="Three ways to read a knowledge base, with grouping and sorting that mean something."
      >
        <div className="space-y-3">
          <div className={card}>
            <h3 className="text-sm font-semibold">Views</h3>
            <dl className="mt-1 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">Cards</dt>
              <dd className="text-neutral-600">For reading — each item&apos;s full text on a card, in collapsible groups that remember what you fold away.</dd>
              <dt className="font-medium">List</dt>
              <dd className="text-neutral-600">For working — one dense row per item, quickest way to scan titles and jump into the editor.</dd>
              <dt className="font-medium">Table</dt>
              <dd className="text-neutral-600">For auditing — columns for type, phase, status, rule count, and last update, plus checkboxes for bulk delete.</dd>
            </dl>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Group by</h3>
            <dl className="mt-1 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">Kind</dt>
              <dd className="text-neutral-600">The knowledge type (agreement, convention, exception, …) — the &ldquo;what is this&rdquo; axis, and the one that decides precedence (<a href="#types" className="text-emerald-700 underline-offset-2 hover:underline">Types &amp; who wins</a>).</dd>
              <dt className="font-medium">Phase</dt>
              <dd className="text-neutral-600">Where in a board it applies: auction · opening lead · declarer play · defense · scoring. Group by phase to review &ldquo;everything about defense&rdquo; in one place.</dd>
              <dt className="font-medium">Status</dt>
              <dd className="text-neutral-600">The trust badge (draft / reviewed / approved / deprecated). Group by status to work through the review backlog — the curated SAYC items all start as drafts awaiting an expert.</dd>
              <dt className="font-medium">None</dt>
              <dd className="text-neutral-600">One flat run, for when you&apos;re sorting instead.</dd>
            </dl>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Sort by</h3>
            <dl className="mt-1 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">Title</dt>
              <dd className="text-neutral-600">Alphabetical — for finding a specific agreement by name.</dd>
              <dt className="font-medium">Updated</dt>
              <dd className="text-neutral-600">Most recently edited first — for picking up where the last session left off, or seeing what a colleague just changed.</dd>
              <dt className="font-medium">Rules</dt>
              <dd className="text-neutral-600">Most executable rules first — the load-bearing items at the top, teaching prose at the bottom.</dd>
            </dl>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">The content chip</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Every item card carries a chip saying what it contributes when a player carries it:
              <b> &ldquo;N rules&rdquo;</b> (executable auction/play/lead rules),
              <b> &ldquo;N forcing situations&rdquo;</b> (<a href="#forcing" className="text-emerald-700 underline-offset-2 hover:underline">below</a>),
              <b> &ldquo;signal policy&rdquo;</b>, <b>&ldquo;fallback&rdquo;</b>, or
              <b> &ldquo;teaching prose&rdquo;</b> — judgment the machine can&apos;t execute yet,
              kept as first-class knowledge so it stays citable and reviewable. Items whose
              conventions are toggleable also show <b>&ldquo;on/off by default&rdquo;</b>.
            </p>
          </div>
        </div>
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
          One special citizen sits alongside the bands:{" "}
          <a href="#forcing" className="text-emerald-700 underline-offset-2 hover:underline">forcing situations</a>{" "}
          don&apos;t choose calls at all — they forbid one.
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
            whether the auction is contested, the partnership round, and what specific calls were
            made: &ldquo;Our opening was…&rdquo;, &ldquo;Partner&apos;s last call was…&rdquo;,
            &ldquo;RHO&apos;s last call was…&rdquo;. Under <i>More auction context</i>: my and
            LHO&apos;s last calls, each seat&apos;s <i>first</i> call (multi-round rebid
            sequences), <b>vulnerability</b> relative to you (equal / favorable / unfavorable —
            preempt discipline), how many <b>distinct suits the opponents have bid</b> (Michaels
            is a cue only while they&apos;ve shown one suit), and whether{" "}
            <b>partner cue-bid their suit</b>. Anything left at its default doesn&apos;t
            constrain.
          </p>
          <p>
            <b>AND MY HAND</b> — HCP min/max (a number, or a dial like{" "}
            <code className="rounded bg-neutral-100 px-1">$nt_range.low</code>), total points,
            shape, and up to two suit holdings (&ldquo;4+ ♥ <i>and</i> 4+ ♠&rdquo; is one rule
            with two holdings). The suit can be contextual: partner&apos;s last or first bid
            suit, my longest/shortest/first/last suit, RHO&apos;s or LHO&apos;s suit, or{" "}
            <b>the fourth (only unbid) suit</b> — the fourth-suit-forcing reference. Rarer checks
            live in the &ldquo;Extra conditions (JSON)&rdquo; box: longest-suit-among, suit
            quality, stoppers, ace/king/keycard counts (Blackwood &amp; friends), a specific card
            (the trump queen), and <b>playing tricks</b> — the preempt-discipline count (an ace
            is one trick; a king one with company, half alone; a queen half with three; plus one
            per card past the third in an honor-headed suit).
          </p>
          <p>
            <b>THEN</b> — the call: bid exactly, pass, double, redouble, raise partner&apos;s
            suit, bid-my-longest-among, or <b>bid a contextual suit</b> (cue-bid RHO&apos;s suit,
            rebid my first suit, bid the fourth suit) at a given level or the cheapest legal one.
            If the call is illegal in the live auction the rule simply doesn&apos;t fire and the
            next candidate is tried.
          </p>
        </div>
      </Section>

      <Section
        id="forcing"
        title="Forcing situations"
        intro="Some auctions forbid passing. That knowledge is an item too — editable like any other."
      >
        <div className={prose}>
          <p>
            A <b>forcing-situations item</b> is a catalog of auction contexts where pass is not
            an available call — a two-over-one response, a new suit over a weak two (RONF),
            partner&apos;s Blackwood 4NT, and so on. Each situation is one editable card:
            <b> when</b> the auction looks like this, <b>then pass is not available</b>. There is
            no hand check and no action — the situation is about the auction, not your cards.
          </p>
          <p>
            At the table the effect is a guard: in a matching context the player{" "}
            <b>suppresses any rule that would pass</b> (the trace shows &ldquo;pass suppressed —
            …&rdquo; on each one), and if no rule produces a bid at all, it{" "}
            <b>bids its cheapest long suit</b> rather than drop the auction — citing the forcing
            situation as the reason. That keeps the golden rule intact: even the &ldquo;I had to
            say <i>something</i>&rdquo; bid traces to a specific piece of editable knowledge.
          </p>
          <p>
            The curated SAYC ships one such item (&ldquo;Forcing situations&rdquo;, 17 cards,
            toggleable). If your partnership plays a line differently — say, two-over-one as
            game-forcing rather than one-round — edit or delete that card like any rule.
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
          <li><b>Read the auction</b> — role, contested, everyone&apos;s last and first calls, round, vulnerability, the opponents&apos; suits.</li>
          <li><b>Check the forcing guard</b> — if a <a href="#forcing" className="text-emerald-700 underline-offset-2 hover:underline">forcing situation</a> matches, pass is off the menu for this turn.</li>
          <li><b>Walk every rule in band-then-priority order</b> — wrong context is skipped; failed hand checks are recorded in the trace with the settings consulted; a legal match becomes a candidate (a pass is suppressed when the guard is up).</li>
          <li><b>Pick a candidate</b> — <i>first match (deterministic)</i> by default; <i>weighted random (variety)</i> picks among ties, seeded per board so replays are identical.</li>
          <li><b>Nothing matched?</b> In a forcing situation the player bids its cheapest long suit, citing the situation. Otherwise the fallback item fires (auction: pass) — honestly labeled &ldquo;no agreement applied.&rdquo;</li>
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
              game on the edited cards, with played cards locked where they fell. The exception
              is deliberate: <b>fix at the table</b> re-pins the <i>same</i> board to the
              recompiled knowledge, so an undo → fix → step continues under the corrected rules.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="augment"
        title="Augmenting with a source"
        intro="Add a document to an existing knowledge base without risking it — everything lands on a draft copy first."
      >
        <div className={prose}>
          <p>
            On a KB&apos;s <b>Sources</b> tab, <b>&ldquo;⇄ Augment into a new draft…&rdquo;</b>{" "}
            takes an uploaded document and reads it <i>against the knowledge that already
            exists</i>:
            something an item already covers is skipped; something an item partly covers becomes
            a proposed <b>modification</b> of that item; something new becomes a <b>new item</b>.
            None of it touches your KB — it all lands on an isolated <b>draft copy</b>.
          </p>
          <p>
            The draft&apos;s <b>review board</b> shows three panels: <b>modified items</b> (with
            before/after against a pre-augmentation snapshot), <b>new items</b> (skim, edit, or
            delete in bulk), and <b>new conflicts</b> (contradictions the merge would introduce,
            compared against the base). Finish with <b>Keep</b> — the draft becomes a normal KB —
            or <b>Discard</b>, which deletes it and leaves the original untouched. A good
            augmentation of a complete KB should propose almost nothing; that&apos;s the
            completeness test working.
          </p>
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
          <li><b>Every save recompiles the KB immediately</b> — new boards use it at once; boards in progress keep what they started with (unless you <b>fix at the table</b>, which re-pins on purpose).</li>
          <li><b>You cannot break the table.</b> A save that doesn&apos;t compile leaves the last good version serving and banners the exact error. Fix and save again.</li>
          <li><b>Everything is versioned</b> — see <a href="#versions" className="text-emerald-700 underline-offset-2 hover:underline">Versions &amp; history</a>.</li>
          <li><b>Hand-authoring starts on the Sources tab</b>: sections the automatic reader couldn&apos;t structure queue under &ldquo;Sections that need a person&rdquo; — &ldquo;Write this up&rdquo; opens the editor with the passage alongside and the citation attached, and the card checks itself off once an item cites that passage.</li>
          <li><b>Flag anything at the table.</b> Every decision has a Flag button that files a suggestion into the KB&apos;s queue — with the exact deal, auction, and decision attached, so the reviewer sees precisely what you saw.</li>
          <li><b>Fix it without leaving the board.</b> Undo the bad decision (the table pauses), open <b>fix at the table</b> from its trace, edit the item in the overlay, save — the board re-pins to the corrected knowledge and <b>step ▸</b> replays the decision under the new rules.</li>
          <li><b>Hide, don&apos;t delete.</b> Archiving a knowledge base hides it — and its players and boards — everywhere, reversibly.</li>
        </ul>
        <p className="mt-6 text-xs text-neutral-400">
          This guide matches the live platform (2026-07-21). Questions it doesn&apos;t answer are
          bugs in the guide — flag them.
        </p>
      </Section>
    </div>
  );
}
