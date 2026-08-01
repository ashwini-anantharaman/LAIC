import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";

/** The in-app guide (2026-07-22): how knowledge works, written for fellows,
 *  living where the work happens. Sections carry stable anchors so the
 *  workspace can deep-link ("what's this? →" next to Versions, History…). */

const TOC = [
  ["how-it-fits", "How it fits together"],
  ["play", "Playing a board"],
  ["viewer", "The Master view"],
  ["items", "Knowledge items"],
  ["types", "Types & who wins"],
  ["rules", "Rules"],
  ["json", "The JSON boxes"],
  ["forcing", "Forcing situations"],
  ["settings", "Settings & dials"],
  ["engine", "How the AI decides"],
  ["versions", "Versions & history"],
  ["sources", "Sources & slide decks"],
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
  await requireFeature(context, "page.guide");

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
              you sit South against three house players carrying the strongest knowledge set —
              and the Quickplay card lists your resumable boards and saved plays as dropdowns,
              so picking up any earlier game is one click.
              <b> Customize</b> opens the table builder: pick a knowledge set to play against or
              watch, choose <i>every</i> seat&apos;s player yourself, set the deal seed, start
              from a saved board in the library (or author/import one), or run a{" "}
              <b>constrained drill</b> — for incomplete players, the dealer only accepts a deal
              a full simulation finishes without the engine floor. Table lineups themselves live
              in <b>Library → Tables → &ldquo;New table&rdquo;</b> (Customize takes you there
              too) — build one once, play it many times.
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Boards never self-start</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Opening a board shows <b>▶ start</b> (or <b>▶ resume</b> on a board with history) —
              the AI seats play one decision per beat only after you press it, and <b>❚❚</b>{" "}
              pauses them again. <b>step ▸</b> pauses and advances exactly one decision — the
              tool for walking a trace. It never disappears on your turn; when it can&apos;t act
              it disables and tells you why. <b>play to end</b> finishes the whole board at once.
              <b> undo</b> rewinds the last decision and comes back paused, so the AI can&apos;t
              instantly replay the decision you&apos;re inspecting — and <b>go to beginning</b>{" "}
              rewinds the whole board the same way, returning it paused at the first decision.
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
              <b>show all hands</b> reveals the other seats. <b>save to library</b> asks for a
              name and notes and lets you pick what to keep — the <b>deal</b> (just the cards),
              the <b>board</b> (cards plus conditions), the <b>play</b> (everything that
              happened), or the <b>table</b> (the lineup itself). In the library, a board&apos;s
              action is <b>Play</b>; a saved play&apos;s is <b>Resume</b> — resuming replays the
              recorded auction and cards into a live board you can continue, undo, and rewind
              like any other. <b>edit deal</b> opens the mid-play deal editor —
              the game continues on the edited cards, played cards locked where they fell.
              <b> new deal</b> deals fresh cards to the same table lineup. <b>learner view</b>{" "}
              hides the verification rail for a clean
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
        intro="Three ways to read a knowledge base, with grouping and sorting that mean something. The toolbar is three dropdowns — View, Group by, Sort — and the Master remembers your last choice of all three per knowledge base (a link with explicit choices in it always wins)."
      >
        <div className="space-y-3">
          <div className={card}>
            <h3 className="text-sm font-semibold">View</h3>
            <dl className="mt-1 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">Cards</dt>
              <dd className="text-neutral-600">For reading — each item&apos;s full text on a card, in collapsible groups that remember what you fold away.</dd>
              <dt className="font-medium">List</dt>
              <dd className="text-neutral-600">For working — one dense row per item, quickest way to scan titles and jump into the editor.</dd>
              <dt className="font-medium">Table</dt>
              <dd className="text-neutral-600">For auditing — columns for type, phase, status, rule count, and last update, plus checkboxes for bulk deprecation (nothing is ever deleted — see <a href="#editing" className="text-emerald-700 underline-offset-2 hover:underline">Editing safely</a>).</dd>
            </dl>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Group by</h3>
            <dl className="mt-1 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">Kind</dt>
              <dd className="text-neutral-600">The knowledge type (agreement, convention, exception, …) — the &ldquo;what is this&rdquo; axis, and the one that decides precedence (<a href="#types" className="text-emerald-700 underline-offset-2 hover:underline">Types &amp; who wins</a>). Each kind&apos;s group header names its precedence band right there, so you never have to look it up.</dd>
              <dt className="font-medium">When</dt>
              <dd className="text-neutral-600">Auction position — Opening · Responding · Rebidding · Competing · Mixed · Leads · Declarer · Defense · Teaching prose, derived from each rule&apos;s seat role. Combine with the Phase filter to read the bidding by position, the way a system book is organized.</dd>
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
            <h3 className="text-sm font-semibold">The filter row</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Alongside kind, phase, and status, two newer filters: <b>Applies when</b> narrows
              to items with a rule for a given auction position — it answers &ldquo;which of
              these apply to opening?&rdquo; directly — and <b>Tag</b> narrows to items carrying
              a given tag (see <a href="#items" className="text-emerald-700 underline-offset-2 hover:underline">Knowledge items</a>).
              Every facet applies <b>instantly</b> as you pick it — there&apos;s no Filter button
              to press — and the <b>search</b> box matches rule labels as well as item titles, so
              typing a convention&apos;s name finds items whose <i>rules</i> mention it, not just
              those with it in the title.
            </p>
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
        <p className={`${prose} mb-3`}>
          Opening an item lands on a <b>read-only view</b> — the agreement in plain words, every
          rule as an English sentence, the settings, where it sits in the precedence order, its
          tags, and any internal notes. Nothing can change by accident while you read.
          <b> Edit</b> switches to the typed editor, and <b>&ldquo;← Back to Master&rdquo;</b>{" "}
          returns you to the filtered list you came from, exactly as you left it.
        </p>
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
            <dd className="text-neutral-600">draft → reviewed → approved: <b>a trust badge only</b> — a draft plays exactly like an approved item. Deprecated items stop compiling and leave the default view — reversibly; nothing is deleted.</dd>
            <dt className="font-medium">Rules</dt>
            <dd className="text-neutral-600">The precise version of the agreement — the part that plays (<a href="#rules" className="text-emerald-700 underline-offset-2 hover:underline">Rules</a>).</dd>
            <dt className="font-medium">Settings</dt>
            <dd className="text-neutral-600">Toggles and dials the item offers every player carrying it (<a href="#settings" className="text-emerald-700 underline-offset-2 hover:underline">Settings &amp; dials</a>).</dd>
            <dt className="font-medium">Citations</dt>
            <dd className="text-neutral-600">Which passages of which source this came from — click one to open the source with the passage highlighted. Hand-authored items cite the Claude source, unless you arrived from the Sources tab&apos;s write-up queue, which attaches the real passage for you.</dd>
            <dt className="font-medium">Tags</dt>
            <dd className="text-neutral-600">Free organizing chips (&ldquo;slam bidding&rdquo;, &ldquo;week 3&rdquo;…) — purely for finding things; the Master&apos;s Tag filter reads them. They never affect play.</dd>
            <dt className="font-medium">Internal notes</dt>
            <dd className="text-neutral-600">Notes between fellows — &ldquo;check this range against the 2004 booklet&rdquo;. Never shown to players, never read by the engine.</dd>
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
            <li><b>Band 0 · Exceptions</b> — &ldquo;…but not when&rdquo; rules. Always outrank what they carve out.</li>
            <li><b>Band 1 · Conventions</b> — Stayman, transfers, Gerber… outrank natural bidding.</li>
            <li><b>Band 2 · The system</b> — bidding rules, agreements, techniques, lead &amp; signal agreements.</li>
            <li><b>Band 9 · Fallbacks</b> — &ldquo;when nothing else applies&rdquo;: pass; lowest legal card; a default lead. Tried dead last.</li>
            <li><b>— · Teaching prose</b> — concepts and judgment guidelines carry no rules and never play.</li>
          </ol>
        </div>
        <p className={`${prose} mt-3`}>
          So: <b>what outranks Stayman?</b> Only an exception. Stayman (a convention) outranks
          every natural system rule and every fallback — and an exception item outranks Stayman
          itself. Within a band, each rule&apos;s <b>Priority</b> number breaks ties (lower fires
          first). Pick the type that names what the thing <i>is</i> and the banding mostly takes
          care of itself — reach for priority numbers only when two rules of the same type
          collide. One special citizen sits alongside the bands:{" "}
          <a href="#forcing" className="text-emerald-700 underline-offset-2 hover:underline">forcing situations</a>{" "}
          don&apos;t choose calls at all — they forbid one.
        </p>
        <div className={`${card} mt-3`}>
          <h3 className="text-sm font-semibold">All eleven kinds</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="font-medium">Exception</dt>
            <dd className="text-neutral-600">An override that outranks everything else when its narrow situation comes up — the &ldquo;…but not when&rdquo; carve-out. Example: &ldquo;No Stayman after interference&rdquo;. <i>Band 0: outranks everything; outranked by nothing.</i></dd>
            <dt className="font-medium">Convention</dt>
            <dd className="text-neutral-600">An artificial agreement — a bid that doesn&apos;t mean its suit. Carries an on/off toggle so a partnership can decline it. Example: &ldquo;Stayman&rdquo;. <i>Band 1: outranked by exceptions; outranks system rules and fallbacks.</i></dd>
            <dt className="font-medium">Bidding rule</dt>
            <dd className="text-neutral-600">A natural bidding rule: when the auction and my hand look like this, make this call. Example: &ldquo;1NT opening&rdquo;. <i>Band 2 (system): outranked by exceptions and conventions; outranks fallbacks.</i></dd>
            <dt className="font-medium">Agreement</dt>
            <dd className="text-neutral-600">A partnership understanding about natural bidding — opening ranges, raise structures, what a jump shows. Example: &ldquo;Major-suit raises&rdquo;. <i>Band 2 (system), same standing as bidding rules.</i></dd>
            <dt className="font-medium">Declarer technique</dt>
            <dd className="text-neutral-600">A card-play habit for declarer — drawing trumps, taking a finesse, setting up a long suit. Example: &ldquo;Draw trumps first&rdquo;. <i>Band 2 (system).</i></dd>
            <dt className="font-medium">Defensive technique</dt>
            <dd className="text-neutral-600">A card-play habit on defense — second hand low, returning partner&apos;s suit, holding up an ace. Example: &ldquo;Third hand high&rdquo;. <i>Band 2 (system).</i></dd>
            <dt className="font-medium">Lead agreement</dt>
            <dd className="text-neutral-600">Which card the partnership leads against suit or notrump contracts. Example: &ldquo;Fourth best vs. NT&rdquo;. <i>Band 2 (system).</i></dd>
            <dt className="font-medium">Signal agreement</dt>
            <dd className="text-neutral-600">How defenders&apos; spot cards carry meaning — attitude, count, and the first discard. Every complete player needs one, even an explicit &ldquo;none&rdquo;. Example: &ldquo;Standard signals&rdquo;. <i>Band 2 (system).</i></dd>
            <dt className="font-medium">Fallback rule</dt>
            <dd className="text-neutral-600">The action of last resort — tried only when nothing else applies, so the player always has a call. Example: &ldquo;Auction fallback: pass&rdquo;. <i>Band 9: tried dead last, when nothing else applies.</i></dd>
            <dt className="font-medium">Concept</dt>
            <dd className="text-neutral-600">Teaching prose that explains an idea — it never makes a call at the table. Example: &ldquo;What a reverse shows&rdquo;. <i>No band — teaching prose never plays.</i></dd>
            <dt className="font-medium">Judgment guideline</dt>
            <dd className="text-neutral-600">Teaching guidance for close decisions — advice a player weighs, never a rule that fires. Example: &ldquo;Upgrading a good five-card suit&rdquo;. <i>No band — teaching prose never plays.</i></dd>
          </dl>
        </div>
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
            live in the &ldquo;Extra conditions (JSON)&rdquo; box (<a href="#json" className="text-emerald-700 underline-offset-2 hover:underline">The JSON boxes</a>): longest-suit-among, suit
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
        id="json"
        title="The JSON boxes"
        intro="The typed editor covers the common cases; three JSON boxes cover the rest. Every example here is copy-pasteable."
      >
        <div className="space-y-3">
          <div className={card}>
            <h3 className="text-sm font-semibold">Extra conditions (JSON) — one hand check</h3>
            <p className="mt-1 text-sm text-neutral-600">
              The box on a rule holds <b>one condition</b> — a single check, or checks combined
              with <code className="rounded bg-neutral-100 px-1">all</code> /{" "}
              <code className="rounded bg-neutral-100 px-1">any</code> /{" "}
              <code className="rounded bg-neutral-100 px-1">not</code> (below). The twelve checks:
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9.5rem_1fr]">
              <dt className="font-medium">hcp</dt>
              <dd className="text-neutral-600">High-card points, min and/or max.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"hcp":{"min":15,"max":17}}`}</code></dd>
              <dt className="font-medium">totalPoints</dt>
              <dd className="text-neutral-600">HCP plus length points (one per card past the fourth in 3+ card suits).<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"totalPoints":{"min":13}}`}</code></dd>
              <dt className="font-medium">suitLength</dt>
              <dd className="text-neutral-600">Cards held in a suit — a literal suit (<code className="rounded bg-neutral-100 px-1 text-xs">&quot;S&quot; &quot;H&quot; &quot;D&quot; &quot;C&quot;</code>) or a contextual one: <code className="rounded bg-neutral-100 px-1 text-xs">partner_last_bid_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">partner_first_bid_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">own_longest_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">own_shortest_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">own_first_bid_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">own_last_bid_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">rho_bid_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">lho_bid_suit</code>, <code className="rounded bg-neutral-100 px-1 text-xs">only_unbid_suit</code> (the fourth suit — resolves only when exactly three are bid), or <code className="rounded bg-neutral-100 px-1 text-xs">agreed_suit</code> (the partnership&apos;s agreed trump suit — a suit both named, else the best known 8-card combined fit).<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"suitLength":{"suit":"partner_last_bid_suit","min":3}}`}</code></dd>
              <dt className="font-medium">longestSuitAmong</dt>
              <dd className="text-neutral-600">My longest suit is one of these.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"longestSuitAmong":{"suits":["H","S"]}}`}</code></dd>
              <dt className="font-medium">balanced</dt>
              <dd className="text-neutral-600">Balanced shape (or, with <code className="rounded bg-neutral-100 px-1 text-xs">false</code>, unbalanced).<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"balanced":true}`}</code></dd>
              <dt className="font-medium">suitQuality</dt>
              <dd className="text-neutral-600">Honor strength in a suit: <code className="rounded bg-neutral-100 px-1 text-xs">two_of_top_three</code> or <code className="rounded bg-neutral-100 px-1 text-xs">three_of_top_five</code>.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"suitQuality":{"suit":"own_longest_suit","quality":"two_of_top_three"}}`}</code></dd>
              <dt className="font-medium">hasStopperIn</dt>
              <dd className="text-neutral-600">A stopper in the suit — for NT bids over their overcall.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"hasStopperIn":{"suit":"rho_bid_suit"}}`}</code></dd>
              <dt className="font-medium">aces</dt>
              <dd className="text-neutral-600">Number of aces held — Blackwood and Gerber responses.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"aces":{"min":1,"max":1}}`}</code></dd>
              <dt className="font-medium">kings</dt>
              <dd className="text-neutral-600">Number of kings held — the 5NT king ask.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"kings":{"min":2}}`}</code></dd>
              <dt className="font-medium">keycards</dt>
              <dd className="text-neutral-600">Keycards for a suit — the four aces plus that suit&apos;s king (RKCB).<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"keycards":{"suit":"partner_last_bid_suit","min":2}}`}</code></dd>
              <dt className="font-medium">holds</dt>
              <dd className="text-neutral-600">A specific card, by rank number: 11 = J, 12 = Q, 13 = K, 14 = A — e.g. the trump queen.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"holds":{"suit":"partner_last_bid_suit","rank":12}}`}</code></dd>
              <dt className="font-medium">playingTricks</dt>
              <dd className="text-neutral-600">Estimated playing tricks — the preempt-discipline count (an ace is one; a king one with company, half alone; a queen half with three; plus one per card past the third in a suit).<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"playingTricks":{"min":6}}`}</code></dd>
            </dl>
            <p className="mt-4 text-sm font-semibold">Partnership checks — reasoning about the combined hands</p>
            <p className="mt-1 text-sm text-neutral-600">
              These read what partner&apos;s (and your own) earlier calls <b>showed</b>: the engine
              replays the auction against the rules&apos; <code className="rounded bg-neutral-100 px-1 text-xs">shows</code>/<code className="rounded bg-neutral-100 px-1 text-xs">ask</code> metadata
              (below) and attributes a meaning to each call. When no history is known a floor reads as
              0 and a ceiling as unknown, so a min-check with no evidence fails rather than firing blind.
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10.5rem_1fr]">
              <dt className="font-medium">partnerShownHcp</dt>
              <dd className="text-neutral-600">Partner has PROMISED this HCP range.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"partnerShownHcp":{"min":6}}`}</code></dd>
              <dt className="font-medium">partnerShownLength</dt>
              <dd className="text-neutral-600">Partner has shown this many cards in a suit.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"partnerShownLength":{"suit":"agreed_suit","min":4}}`}</code></dd>
              <dt className="font-medium">combinedHcp</dt>
              <dd className="text-neutral-600">My HCP plus partner&apos;s shown bound — <code className="rounded bg-neutral-100 px-1 text-xs">min</code> uses partner&apos;s floor, <code className="rounded bg-neutral-100 px-1 text-xs">max</code> partner&apos;s ceiling (fails if partner&apos;s ceiling is unknown).<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"combinedHcp":{"min":33}}`}</code></dd>
              <dt className="font-medium">combinedKeycards</dt>
              <dd className="text-neutral-600">My keycards for the agreed suit plus partner&apos;s decoded ask reply.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"combinedKeycards":{"min":4}}`}</code></dd>
              <dt className="font-medium">keycardsMissing</dt>
              <dd className="text-neutral-600">Keycards the partnership is missing (5 − combined) — the sign-off test.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"keycardsMissing":{"min":2}}`}</code></dd>
              <dt className="font-medium">fitEstablished</dt>
              <dd className="text-neutral-600">A trump fit — combined length reaches <code className="rounded bg-neutral-100 px-1 text-xs">minCombined</code> (default 8) in a named suit, <code className="rounded bg-neutral-100 px-1 text-xs">&quot;any&quot;</code> suit, or <code className="rounded bg-neutral-100 px-1 text-xs">&quot;any_major&quot;</code>.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"fitEstablished":{"suit":"any_major"}}`}</code></dd>
              <dt className="font-medium">unshownSupport</dt>
              <dd className="text-neutral-600">Delayed support — I HOLD <code className="rounded bg-neutral-100 px-1 text-xs">min</code>+ cards but have not yet shown that length.<br /><code className="rounded bg-neutral-100 px-1 text-xs">{`{"unshownSupport":{"suit":"partner_first_bid_suit","min":3}}`}</code></dd>
            </dl>
            <p className="mt-4 text-sm font-semibold">A bid&apos;s meaning — shows &amp; ask</p>
            <p className="mt-1 text-sm text-neutral-600">
              Each rule may carry <b>shows</b> (what the bid promises) and <b>ask</b> (a
              Blackwood/RKCB question). <b>shows</b> is optional — leave it blank and the compiler
              derives it from the conditions; give it when a bid shows more than it tests. The
              partnership checks above read this metadata across the whole auction.
            </p>
            <p className="mt-2 text-sm">
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"hcp":{"min":6},"suits":[{"suit":"S","min":4}],"forcing":true}`}</code>{" "}
              (shows), and{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"id":"rkcb","responses":{"5D":{"keycards":[1,4]},"5H":{"keycards":[2]}}}`}</code>{" "}
              (ask — each reply&apos;s meaning as a set of possible values).
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              <b>Combining checks:</b>{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"all":[…]}`}</code> means
              every check must hold,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"any":[…]}`}</code> means
              at least one, and{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"not":…}`}</code> flips
              one. They nest freely:{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"all":[{"hcp":{"min":6}},{"not":{"balanced":true}}]}`}</code>.
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              <b>Numbers vs. dials:</b> anywhere a number goes you can write a plain{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">15</code> — or point at a
              setting dial:{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"$setting":"nt_range","field":"low"}`}</code>.
              That&apos;s the long form of what the typed fields write as{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">$nt_range.low</code> — same
              dial, same behavior (<a href="#settings" className="text-emerald-700 underline-offset-2 hover:underline">Settings &amp; dials</a>).
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Action JSON — calls the pickers don&apos;t offer</h3>
            <p className="mt-1 text-sm text-neutral-600">
              A rule&apos;s action can also be written as JSON. The one you&apos;ll actually
              reach for is <b>first_legal_of</b> — an ordered preference list, &ldquo;bid the
              first of these that&apos;s legal&rdquo;:
            </p>
            <p className="mt-2 text-sm">
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"first_legal_of","calls":[{"level":3,"strain":"N"},{"level":4,"strain":"H"}]}`}</code>
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              The full list: <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"bid","level":1,"strain":"N"}`}</code> (bid
              exactly), <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"pass"}`}</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"double"}`}</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"redouble"}`}</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"raise_partner","toLevel":3}`}</code> (raise
              partner&apos;s last suit),{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"bid_longest","among":["H","S"],"level":2}`}</code> (my
              longest among these; cheapest legal level if omitted), and{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"type":"bid_suit","suit":"rho_bid_suit","level":2}`}</code> (a
              contextual suit — cue-bids, rebids, the fourth suit, or the{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">agreed_suit</code> for &ldquo;bid
              6 of the fit&rdquo;; it simply doesn&apos;t act when the reference can&apos;t be
              resolved). Strains are{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">&quot;C&quot; &quot;D&quot; &quot;H&quot; &quot;S&quot; &quot;N&quot;</code>.
            </p>
          </div>
          <div className={card}>
            <h3 className="text-sm font-semibold">Advanced — the whole payload as JSON</h3>
            <p className="mt-1 text-sm text-neutral-600">
              The item editor&apos;s Advanced panel exposes <b>payloadJson</b> and{" "}
              <b>settingsJson</b> — the raw form of everything the typed editor writes. The
              payload is an envelope named for what the item contributes:{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">{`{"kind":"auction_rules","rules":[…]}`}</code>,
              or the same shape with{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">forcing_rules</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">lead_rules</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">play_rules</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">signals</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">fallback</code>, or{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">none</code> (teaching prose).
              settingsJson is a list of setting declarations, each with{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">key</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">label</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">control</code> (toggle ·
              single_select · multi_select · range_hcp · number),{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">role</code> (enable or
              parameter), <code className="rounded bg-neutral-100 px-1 text-xs">default</code>,
              and optional <code className="rounded bg-neutral-100 px-1 text-xs">options</code>,{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">min</code>/<code className="rounded bg-neutral-100 px-1 text-xs">max</code>,
              and <code className="rounded bg-neutral-100 px-1 text-xs">description</code>.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              When either box is filled it <b>overrides the typed fields</b>; the compiler
              validates either way — a bad save leaves the last good version serving and
              banners the error, exactly as with the typed editor.
            </p>
          </div>
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
            game-forcing rather than one-round — edit or remove that card like any rule.
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
          <li><b>Walk every rule in band-then-priority order</b> — wrong context is skipped; a failed hand check explains itself in the trace (&ldquo;needed 15–17 HCP, held 12&rdquo;) alongside the settings consulted; a legal match becomes a candidate (a pass is suppressed when the guard is up). Every line cites the rule&apos;s label and its item&apos;s title — never a raw internal ID.</li>
          <li><b>Pick a candidate</b> — <i>first match (deterministic)</i> by default; <i>weighted random (variety)</i> picks among ties, seeded per board so replays are identical.</li>
          <li><b>Nothing matched?</b> In a forcing situation the player bids its cheapest long suit, citing the situation. Otherwise the fallback item fires (auction: pass) — honestly labeled &ldquo;no agreement applied.&rdquo;</li>
          <li><b>No fallback either?</b> The <b>engine floor</b> acts, loudly marked — it exists so a game can&apos;t jam and never counts as knowledge. A well-built set produces zero floor events.</li>
        </ol>
        <div className={`${card} mt-4`}>
          <h3 className="text-sm font-semibold">Test a decision</h3>
          <p className="mt-1 text-sm text-neutral-600">
            You don&apos;t have to deal a whole board to check a rule: the KB&apos;s <b>Test</b> tab
            lets you type a hand and an auction and see the exact decision — with its full trace —
            instantly. The <b>Coverage</b> tab plays N random deals and reports which rules never
            fired, so you can spot the knowledge that isn&apos;t pulling its weight.
          </p>
        </div>
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
              Every save lands on the item&apos;s working <b>draft</b> — the item wears a{" "}
              <b>draft edits</b> chip until you freeze it with <b>Save as new version</b> (Versions
              panel), which mints an immutable numbered snapshot — v1, v2… — and marks it{" "}
              <b>main</b>. Committed versions are <i>never</i> modified: &ldquo;Make main&rdquo;
              on an older version restores its content into the draft without touching the
              snapshot. The main version and any version pinned by a published release
              can&apos;t be deleted.
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
        id="sources"
        title="Sources & slide decks"
        intro="Where knowledge comes from — and what happens when the meaning is in the pictures."
      >
        <div className={prose}>
          <p>
            A prose document (a system booklet, an article) is uploaded on a KB&apos;s{" "}
            <b>Sources</b> tab: its text is split into passages, and extraction reads it section
            by section, every item citing the passages it came from. A <b>slide deck</b> can&apos;t
            be read that way — its meaning is in bidding tables, color-coded rows (orange =
            forcing), support-by-strength matrices, card diagrams and deal figures, all of which a
            text layer throws away.
          </p>
          <p>
            So decks go through{" "}
            <Link
              href="/bridge/kb/new-from-document"
              className="text-emerald-700 underline-offset-2 hover:underline"
            >
              New knowledge base from a document
            </Link>{" "}
            instead: the PDF itself is stored and <b>read as pictures</b>, one slide at a time, so
            a table stays a table and what a color <i>means</i> is written down. You then agree an
            editable <b>section map</b> — named page ranges — and extract{" "}
            <b>one section at a time</b>, settling &ldquo;Opening bids&rdquo; before
            &ldquo;Responses&rdquo; is even attempted. Every drafted item cites the slide it came
            from, and its Source panel has a <b>view slide</b> link that opens the real page — so
            you can always check a rule against the picture that produced it.
          </p>
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
            drop in bulk), and <b>new conflicts</b> (contradictions the merge would introduce,
            compared against the base). Finish with <b>Keep</b> — the draft becomes a normal KB —
            or <b>Discard</b>, which deletes it and leaves the original untouched — the one true
            deletion on the platform, and it only ever touches the draft copy. A good
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
          <li><b>Nothing is deleted.</b> A knowledge base is <i>hidden</i> — it and its players and boards disappear from view everywhere, reversibly. A knowledge item is <i>deprecated</i> — it stops compiling and leaves the Master&apos;s default view, and flipping its Status back brings it back whole. A source cited by items can&apos;t be deleted at all — the provenance chain stays intact. The one exception: discarding an augmentation draft really does delete it (<a href="#augment" className="text-emerald-700 underline-offset-2 hover:underline">Augmenting with a source</a>).</li>
        </ul>
        <p className="mt-6 text-xs text-neutral-400">
          This guide matches the live platform (2026-07-22). Questions it doesn&apos;t answer are
          bugs in the guide — flag them.
        </p>
      </Section>
    </div>
  );
}
