# Coach ↔ Learner Interaction Guide

**Status:** design of record for interaction. Not an implementation plan.
**Owner decisions still open:** §12.
**Supersedes:** the interaction assumptions in `Coach_Integration_Plan_v2.md` §7. The
component boundary in that document still stands unchanged.

---

## 1. What this document is for

The coach now has three sources of judgment (a calculator that knows the truth, a
model that can write, and a rulebook that is switched off but not deleted) and
three places it can appear (the live table, the post-hand review, the learn tab).

That is enough moving parts to get the interaction wrong in ways no individual
component is responsible for. This document fixes **when the coach speaks, what
it is allowed to say, and who it hands the learner to next** — so that those
decisions live in one place instead of being re-decided in each screen.

Everything here is about the seam between the learner, the coach, and the
learning platform. Nothing here is about how a verdict is reached.

---

## 2. The principle

> **The coach is quiet, instant and non-committal while you are playing. It is
> talkative, thorough and fully informed once the hand is over. It never teaches
> you something you have not been taught, and it always knows where to send you
> next.**

Three rules follow from that, and they are the ones to check any future design
against.

**Rule 1 — During the hand, the coach marks. After the hand, it talks.**
Mid-play it is a fast, silent observer that flags what is worth revisiting. The
explaining happens afterwards.

**Rule 2 — The learner's level sets the agenda, not the tone.**
A concept the learner has never met is not mentioned. A concept they are
currently learning is where the coach is loudest. A concept they own is mostly
left alone.

**Rule 3 — Every correction knows which lesson it belongs to.**
A mistake the coach cannot connect to something teachable is worth less than one
it can. The link is the product.

---

## 3. The three parties

```
        ┌──────────────────────────────────────────────┐
        │              LEARNING PLATFORM               │
        │        (learn tab — lessons, drills,          │
        │         tutorials, mastery per concept)       │
        └──────────────────────────────────────────────┘
                  │                        ▲
       what they know,          what happened at the table:
      what they've met,          "this concept came up,
     what they just did          this one was dropped"
                  │                        │
                  ▼                        │
        ┌──────────────────────────────────────────────┐
        │                   COACH                      │
        │   decides whether to speak, at what level,   │
        │        and where to send them next           │
        └──────────────────────────────────────────────┘
                  │                        ▲
          markers, answers,         plays, and questions
        reviews, lesson offers        about any card
                  │                        │
                  ▼                        │
        ┌──────────────────────────────────────────────┐
        │                  LEARNER                     │
        └──────────────────────────────────────────────┘
```

**The coach reads from the platform. It does not write mastery.**

Mastery has exactly one owner — the learn section — because the moment two
systems compute what a learner knows, they diverge and nobody can say which is
right. The coach *reports what it observed*; the platform decides what that is
worth. Practically: the coach emits "this hand exercised second-hand-low, and
the learner did not apply it," and the platform's own model decides whether that
moves a number.

This is already the shape of the code: `LearnerContextSource` is a **read** port
with `profile()` and `currentFocus()`, and there is deliberately no `update()`.

---

## 4. Three states, not two

The coach needs more than a mastery score. It needs to tell these apart:

| State | What it means | How the coach behaves |
|---|---|---|
| **Unmet** | Never taught, never drilled | **Silent on it.** Not a softer note — no note. |
| **Learning** | Taught recently, not yet solid | **Loudest here.** Full explanation, lesson linked, high patience. |
| **Owned** | Demonstrated repeatedly | **Brief.** A lapse, not a gap. One line, no lesson offer. |

**Why unmet must be silent rather than gentle.** A learner who is shown a
technique they have never met does not learn it from a note at a card table —
they learn that the game is more complicated than they can handle. The cost of
staying quiet is one missed teaching moment. The cost of speaking is a learner
who feels behind. Those are not symmetrical.

Where the position genuinely turned on something unmet, the coach may
acknowledge without teaching:

> *This hand had a better line available, but it uses something you haven't
> covered yet. Nothing you did wrong with what you know.*

That closes the loop honestly and does not pretend the hand was fine.

**Why "learning" is where the coach earns its keep.** A learner who finished a
lesson on second-hand-low yesterday and violates it today is the single most
valuable note on the board. Recency plus relevance plus a concrete failure is
exactly the moment teaching lands. The coach should be more willing to interrupt,
more willing to explain at length, and more willing to offer the drill again.

> ⚠️ **Requirement on the learn platform:** a mastery score of zero cannot
> distinguish *unmet* from *taught and failing*, and the coach must behave
> oppositely in those two cases. The platform has to expose "has this been
> presented to the learner" separately from "how well do they do it." A single
> number is not enough. See §12.

---

## 5. The five moments

Interaction at a card table is about timing, not widgets. These are the moments a
learner wants a coach, in the order they occur.

| # | Moment | Where it is served |
|---|---|---|
| 1 | *"I don't know what to do."* | Live table — **pull**, §7 |
| 2 | *"Did I get that right?"* | Live table — **a marker only**, §6 |
| 3 | *"I don't understand / I disagree."* | Post-hand review, §9 |
| 4 | *"What happened in that hand?"* | Post-hand review, §9 |
| 5 | *"I'm curious about **this** card."* | Live table or review — **ask anything**, §8 |

Moments 4 and 5 do not exist yet, and they are the two the model is best at.
Moment 5 matters more than it sounds: at present the coach sets the entire
agenda, and a learner's confusion almost never lands on the card the coach chose
to grade.

---

## 6. During the hand — mark, don't talk

While the learner is playing, **the coach does not write sentences.**

It puts a quiet marker on tricks worth revisiting. A small dot in the trick
history. Not a note, not prose, not a badge with a count.

**Why:**

- **No waiting.** The calculator answers in under half a second. Marking costs no
  model call, so there is no two-to-three-second lag to design around.
- **No nagging.** Measured across six real boards: 34 approvals to 6 corrections,
  and one board that was twenty-five consecutive "that's your system's play." A
  marker that appears rarely means something. A note that appears constantly is
  wallpaper.
- **No interrupting.** A bridge hand is one continuous plan. Criticising trick
  three before the learner has seen how the hand resolves is interrupting someone
  on page forty to argue about the ending.
- **It builds the agenda.** By the end of the hand the coach has quietly
  assembled what to talk about. The review is not generated from nothing — it is
  the markers, explained.

**Two exceptions where the coach breaks the quiet:**

1. **Something serious.** Not "the calculator prefers another card" — that is
   most cards. This means the contract just walked out of the door. Worth an
   interruption; nothing else is.
2. **A concept in the `learning` state.** The learner is mid-way through this
   topic right now. A short line, immediately, is worth more than a paragraph in
   ten minutes. This is the one place level information *raises* the coach's
   volume rather than lowering it.

The learner keeps the override throughout: tap a marker and the coach explains on
the spot, within the mid-hand limits of §7. That is the learner choosing to spend
the interruption, which is a different thing from having it spent for them.

---

## 7. When the learner asks mid-hand

Two affordances, always available: **"What should I play?"** and tapping a marker.

### Answers arrive in two speeds

The calculator has the answer in under half a second; the model needs two to
three. Show them in that order.

```
  ┌────────────────────────────────────┐
  │  Play the 4♣.                      │   ← instant (calculator)
  │  ░░░░░░░░░░░░                      │   ← streams in (model)
  └────────────────────────────────────┘
```

The learner gets the useful part immediately and the teaching part as it is
written. This is better than three seconds of spinner followed by everything at
once, and it makes the interface honestly reflect how the coach works: the fast
certain thing, then the slower thoughtful thing.

### The mid-hand limit

Mid-hand, the coach explains from **what the learner can see** — their hand,
dummy, the cards played, the auction. It never reasons out loud from the hidden
hands, even though the calculator's verdict came from them.

Where no visible reason exists, the coach says so rather than inventing one:

> *This one costs a trick. I can't show you why without showing you everyone's
> cards — we'll come back to it at the end of the hand.*

That is not a failure state. It is a promise, and §9 keeps it.

### No hint ladder

When the learner asks, **answer.** Do not make them tap twice to reach the card.
A withhold-then-reveal ladder was built and removed: the thresholds driving it
were guesses, and a guessed ladder is worse than none. The thinking happens in
the review, not by adding friction to a question.

---

## 8. Ask about any card

**Every card that has been played is tappable, and asking about it is always
allowed.** Not just the flagged ones. Any card — the learner's, partner's,
dummy's, declarer's — including the ones they got right.

> Tap the 9♥ from trick two → *"Why did dummy play the 9 there?"*

This is where the single free-text input lives: **tap a card, then type.** The
position travels with the question automatically.

Scoping the free text to a tapped card is deliberate. It is open enough to feel
like talking to a person and closed enough that it cannot drift into
general conversation, unbounded cost, or a coach that answers questions about
the weather.

An open chat box with no anchor is explicitly rejected — see §11.

---

## 9. The post-hand review

This is the coach's real home, and the reason for everything in §6.

**The moment the hand ends, all four hands are visible.** Every constraint that
made mid-hand explanation hard disappears at once:

- The hidden-card problem is gone. Post-mortems have always shown all four
  hands. The coach can finally say the sentence it wanted to say: *"West had the
  Ace sitting over you — you couldn't see that, but the auction said West had the
  strength."*
- Latency stops mattering. Three seconds is nothing when nobody is waiting to
  play. Long, careful answers become affordable.
- The learner is receptive. Nobody learns while concentrating on something else.
- The hand is a complete story, so the coach can talk about the plan rather than
  a card.

The model's best work happens exactly where it is safest and most welcome. That
alignment is the argument for the whole design.

### What the review contains

In this order:

1. **One line on how it went.** Not a score. *"Contract made. Two tricks turned
   on the club guess at trick four."*
2. **The moments that mattered**, in play order — the markers from §6, now
   explained in full with all four hands shown. **Two or three, not fifteen.** If
   everything is worth reviewing, nothing is.
3. **Any promise made mid-hand** (§7) is kept here, explicitly.
4. **One thing to take away.** Singular. *"Second hand low — a small card led
   means you don't need to spend an honour."*
5. **The lesson offer**, if §10's threshold is met.
6. **The conversation.** Follow-up questions, *"what if I'd ducked instead"*,
   *"show me that trick again."* All of it belongs here. None of it belongs
   mid-play.

### Approvals, collapsed

Everything the learner got right becomes **one line**, not one note each:

> *Nine of your plays matched what your system would do.*

Worth more than nine separate pats on the back, and it does not bury the two
things that matter.

---

## 10. The lesson link

The part that makes this a learning product rather than a critic.

### It runs both directions

**Mistake → lesson.** The coach flags a failure, connects it to a concept, and
offers the lesson or drill that teaches it.

> *You've played second-hand-high three times across your last four boards.
> There's a ten-minute drill on this — want it?*

**Lesson → table.** The learner finishes a lesson; the coach watches for the
first hand where it applies and points at it.

> *This is the finesse you covered yesterday. Trick five is where it comes up.*

The second direction is the one that gets forgotten and the more motivating half.
"Here is the thing you just learned, being useful" closes a loop that "here is
another thing you got wrong" never does.

### How the connection is made

The seam already exists. A `Finding` carries `conceptIds` and `skillIds`. The
lesson catalogue must be queryable by the same identifiers. That is the whole
mechanism:

```
Finding { conceptIds: ["second_hand_low"] }
    → catalogue lookup by conceptId
    → lessons/drills tagged "second_hand_low"
    → offered in the review
```

> ⚠️ **Requirement:** the coach and the learn section must share **one concept
> vocabulary.** If a lesson is tagged `defence.second_hand_low` and a finding
> says `play_low_second`, nothing links and this entire section is decorative.
> Whoever authors the lesson taxonomy owns that vocabulary, and the coach adopts
> it rather than inventing a parallel one.

### When to offer, and how often

**A pattern, not an incident.** One mistake is noise; three across a session is a
signal. Offering a lesson after every error makes the coach a nag and trains the
learner to dismiss it without reading.

**Never mid-hand.** A lesson offer during play is an invitation to leave the
table. It belongs in the review, where the learner is already at a stopping
point.

**At most one per review.** Two offers is a syllabus, and a syllabus at the end
of a hand gets closed.

**Suppress what is already scheduled.** If the learner has this drill queued in
the learn tab, the coach mentions that rather than offering it again.

> ⚠️ **Dependency:** "three times across four boards" requires the coach to
> remember across hands. Note persistence is currently deferred, so **the
> lesson-linking feature cannot ship before it.** This is the one hard ordering
> constraint in this document.

---

## 11. Bidding deserves its own attention

For anyone below expert, **understanding what partner's bid meant is worth more
than any card advice.** That is the part of bridge that feels like a foreign
language, and BEN's read is already available.

The auction is *already* a conversation — it has turns, meanings and
misunderstandings — so the interaction there is more natural than anything in the
card play. Expect the auction review to be the most-used part of the coach, and
design it deliberately rather than receiving it as a side effect of the card
work.

The same rules apply unchanged: quiet during the auction, talkative after it,
silent on conventions the learner has not met.

---

## 12. Deliberately not built

**An open chat box at the live table.** Unbounded scope, unbounded cost, and it
teaches the learner to ask instead of think. Free text stays anchored to a tapped
card (§8).

**A hint ladder.** Built once, removed once. When asked, answer.

**Praise per play.** One collapsed line per hand (§9).

**Anything that makes the learner wait mid-trick.** If it cannot be instant
during play, it belongs in the review.

**Mastery written by the coach.** One writer, and it is not this one (§3).

**Lessons offered mid-hand.** §10.

---

## 13. Open decisions — owner's call

These change the design and cannot be settled from the code.

1. **Does table play move mastery, or only drills?**
   The coach is designed to *report observations* either way, so this can be
   answered late. But somebody has to decide whether playing well counts as
   evidence, or whether the learn tab is the only place mastery is earned. It
   changes how much the learner feels their table time matters.

2. **Can the platform distinguish "never presented" from "presented and failing"?**
   §4 depends on it, and the coach behaves oppositely in the two cases. If only a
   score is available, the coach cannot implement the `unmet` rule and will teach
   above people's heads. **This is the one that needs answering before the level
   integration is designed.**

3. **Who owns the concept vocabulary?**
   §10 needs one shared taxonomy. The lesson author is the natural owner, but the
   lessons do not exist yet, so the coach will need a provisional list that the
   real one later replaces. Worth deciding now whether the coach's provisional
   tags are throwaway or the seed.

4. **Is the review mandatory or skippable?**
   A review the learner always skips is worthless; one they cannot skip is a
   toll booth between hands. Recommendation: skippable, with the takeaway line
   (§9.4) shown inline so skipping still leaves something behind.

5. **How much of the four hands to reveal in the review?**
   All of it is the bridge convention. But a learner who knows the review reveals
   everything may stop trying to work it out during play. Recommendation: reveal
   fully, and accept that cost — it is how the game is taught.

---

## 14. What must exist first

Ordered by dependency, not by value.

| Prerequisite | Blocks |
|---|---|
| Note persistence across hands | §10 entirely — pattern detection, "three times across four boards" |
| A shared concept vocabulary | §10's lookup |
| `LearnerContextSource` implemented against the learn tab | §4 — every level-dependent behaviour |
| An `unmet` / `presented` flag from the platform | §4's silence rule |
| Post-hand review surface | §9, and the promises §7 makes |
| Lesson/drill catalogue, queryable by concept | §10's offer |

Nothing in §6, §7 or §8 depends on the learning platform. **The live-table
interaction can be built and shipped now**, and the level and lesson behaviour
layered on as the learn tab arrives. That is the recommended order: the parts
that stand alone first, so the coach is useful before the curriculum exists.

---

## 15. One paragraph, if you only read one

While the learner plays, the coach is a silent, instant observer that marks
tricks worth revisiting and stays out of the way; the learner can always tap any
card to ask about it, and gets the answer immediately with the reasoning
following a beat behind. When the hand ends, all four hands go face up and the
coach finally talks — a line on how it went, the two or three moments that
mattered, one thing to take away, and where relevant a single lesson from the
learn tab that teaches it. What the coach chooses to raise is governed by what
the learner has actually been taught: silent on the unmet, loudest on what they
are learning right now, brief on what they own. It reads the learner's level from
the learning platform and reports back what it saw at the table, but it never
decides what the learner knows — that belongs to the learn tab, and to exactly
one of them.
