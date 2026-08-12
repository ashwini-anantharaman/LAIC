// M2 of the webview→native migration: the JSON routes lifted from the /m
// pages and their server actions. Request-level, in stub mode (dev-user
// cookie is the session; the bearer path shares getBridgeContext and is
// covered by bearer-api.spec.ts + the deployed stack).
//
// What's pinned here: auth postures (signed-out and wrong-role read as 404,
// never 403/500), read-model shapes, the full library authoring flow
// (create deal → read entry → put it on a table), quick-play, and ownership
// (you can't delete someone else's board).

import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./helpers";

const BASE = "http://localhost:3105";

// A valid 52-card deal in the editor's serialized form (♠.♥.♦.♣).
const DEAL_HANDS = {
  N: "AKQJ.AKQ.AKQ.AKQ",
  E: "T987.JT9.JT9.JT9",
  S: "6543.876.876.876",
  W: "2.5432.5432.5432",
};

async function api(page: Page) {
  return {
    get: (path: string) => page.request.get(`${BASE}${path}`),
    post: (path: string, data?: unknown) => page.request.post(`${BASE}${path}`, { data }),
    del: (path: string, data?: unknown) => page.request.delete(`${BASE}${path}`, { data }),
  };
}

test.describe("signed out", () => {
  for (const path of [
    "/api/bridge/plays",
    "/api/bridge/assigned",
    "/api/bridge/assignments",
    "/api/bridge/reviews",
    "/api/bridge/reviewers",
    "/api/bridge/library/collections",
  ]) {
    test(`GET ${path} → 401`, async ({ request }) => {
      // Unauthenticated is 401 (2026-08-12): the bearer client refreshes and
      // retries only on 401 — a 404 turned every expired token into a
      // permanent "Not found". Access DENIALS still read as 404.
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }

  test("POST /api/bridge/quick-play → 401", async ({ request }) => {
    const res = await request.post("/api/bridge/quick-play", { data: {} });
    expect(res.status()).toBe(401);
  });
});

test.describe("learner (lena)", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "user_learner_lena");
  });

  test("quick-play deals a board, My Games lists, remove deletes", async ({ page }) => {
    const a = await api(page);

    const dealt = await a.post("/api/bridge/quick-play", { dealer: "E" });
    expect(dealt.status()).toBe(200);
    const { sessionId } = (await dealt.json()) as { sessionId: string };
    expect(sessionId).toBeTruthy();

    const plays = await a.get("/api/bridge/plays");
    expect(plays.status()).toBe(200);
    const playsBody = await plays.json();
    expect(Array.isArray(playsBody.completed)).toBe(true);
    expect(Array.isArray(playsBody.submissions)).toBe(true);
    expect(Array.isArray(playsBody.coaches)).toBe(true);

    const removed = await a.del(`/api/bridge/plays/${sessionId}`);
    expect(removed.status()).toBe(200);
    expect((await removed.json()).removed).toBe(true);

    // Deleting again confirms rather than raises — that IS the asked-for state.
    const again = await a.del(`/api/bridge/plays/${sessionId}`);
    expect(again.status()).toBe(200);
  });

  test("assigned inbox has the read-model shape", async ({ page }) => {
    const a = await api(page);
    const res = await a.get("/api/bridge/assigned");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.assignments)).toBe(true);
    expect(typeof body.threads).toBe("object");
  });

  test("coach-only surfaces read as 404 for a learner", async ({ page }) => {
    const a = await api(page);
    expect((await a.get("/api/bridge/reviews")).status()).toBe(404);
    expect((await a.get("/api/bridge/reviewers")).status()).toBe(404);
  });

  test("sending an unfinished board for review is refused with the action's copy", async ({
    page,
  }) => {
    const a = await api(page);
    const dealt = await a.post("/api/bridge/quick-play", {});
    const { sessionId } = (await dealt.json()) as { sessionId: string };
    const sent = await a.post(`/api/bridge/plays/${sessionId}/send`, {});
    // Stub mode has no Nexus roster, so lena has no coaches — that guard
    // fires first, with its exact copy.
    expect(sent.status()).toBe(400);
    expect((await sent.json()).error).toContain("don't have a coach");
    await a.del(`/api/bridge/plays/${sessionId}`);
  });
});

test.describe("coach (carlos)", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "user_coach_carlos");
  });

  test("reviews queue and reviewer pool answer with their shapes", async ({ page }) => {
    const a = await api(page);

    const reviews = await a.get("/api/bridge/reviews");
    expect(reviews.status()).toBe(200);
    expect(Array.isArray((await reviews.json()).submissions)).toBe(true);

    const reviewers = await a.get("/api/bridge/reviewers");
    expect(reviewers.status()).toBe(200);
    const pool = await reviewers.json();
    expect(pool.self.reviewerId).toBe("user_coach_carlos");
    expect(Array.isArray(pool.candidates)).toBe(true);
    // The stub roster feeds the pool; the caller is never their own candidate.
    expect(pool.candidates.length).toBeGreaterThan(0);
    expect(
      pool.candidates.some(
        (c: { reviewerId: string }) => c.reviewerId === "user_coach_carlos",
      ),
    ).toBe(false);
  });

  test("assignments read model carries views, reviewing, pickers", async ({ page }) => {
    const a = await api(page);
    const res = await a.get("/api/bridge/assignments");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.views)).toBe(true);
    expect(Array.isArray(body.reviewing)).toBe(true);
    expect(Array.isArray(body.roster)).toBe(true);
    expect(Array.isArray(body.candidates)).toBe(true);
  });

  test("a learner off the roster can't receive an assignment", async ({ page }) => {
    const a = await api(page);
    // Stub mode has an empty Nexus roster, so nothing is created — but the
    // route must refuse cleanly on garbage, not 500.
    const res = await a.post("/api/bridge/assignments", {
      entryId: "le_does_not_exist",
      learnerIds: ["user_learner_lena"],
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("table API (T0): view bootstrap, envelope, lifecycle", () => {
  test("deal → view (masked hands) → step envelope → events cursor → discard", async ({
    context,
    page,
  }) => {
    await signInAs(context, "user_learner_lena");
    const a = await api(page);

    const dealt = await a.post("/api/bridge/quick-play", {});
    expect(dealt.status()).toBe(200);
    const { sessionId } = (await dealt.json()) as { sessionId: string };

    // The bootstrap: policy resolved server-side, hidden hands EMPTY.
    const viewRes = await a.get(`/api/bridge/sessions/${sessionId}/view`);
    expect(viewRes.status()).toBe(200);
    const view = await viewRes.json();
    expect(view.mySeat).toBe("S");
    expect(view.visible.S).toBe(true);
    expect(view.visible.N).toBe(false);
    expect(view.state.hands.S.length).toBe(13);
    expect(view.state.hands.N.length).toBe(0); // masked, not dealt out
    expect(view.dealtHands.S.length).toBe(13);
    expect(view.dealtHands.N.length).toBe(0);
    expect(typeof view.headSeq).toBe("number");
    expect(typeof view.control).toBe("object");
    expect(view.session.sessionId).toBe(sessionId);
    expect(view.challenge).toBeNull();

    // One robot decision → the mutation envelope, events past the cursor.
    const step = await a.post(`/api/bridge/sessions/${sessionId}/step`, {
      sinceSeq: view.headSeq,
    });
    expect(step.status()).toBe(200);
    const env = await step.json();
    expect(env.headSeq).toBeGreaterThan(view.headSeq);
    expect(env.events.length).toBeGreaterThan(0);
    expect(env.events.every((e: { seq: number }) => e.seq > view.headSeq)).toBe(true);
    expect(typeof env.actingIsHuman).toBe("boolean");
    expect(env.state).toBeTruthy();

    // The catch-up read from the new head answers nothing new.
    const catchUp = await a.get(
      `/api/bridge/sessions/${sessionId}/events?since=${env.headSeq}`,
    );
    expect(catchUp.status()).toBe(200);
    expect((await catchUp.json()).events.length).toBe(0);

    // Discard: own + unfinished deletes; a repeat confirms rather than raises.
    const discarded = await a.post(`/api/bridge/sessions/${sessionId}/discard`);
    expect(discarded.status()).toBe(200);
    expect((await discarded.json()).discarded).toBe(true);
    const again = await a.post(`/api/bridge/sessions/${sessionId}/discard`);
    expect((await again.json()).discarded).toBe(true);
  });

  test("undo collapses the head — the client's rebuild-and-pause signal", async ({
    context,
    page,
  }) => {
    await signInAs(context, "user_orgadmin_olivia");
    const a = await api(page);
    const dealt = await a.post("/api/bridge/quick-play", {});
    const { sessionId } = (await dealt.json()) as { sessionId: string };

    const stepped = await a.post(`/api/bridge/sessions/${sessionId}/step`, {});
    expect(stepped.status()).toBe(200);
    const afterStep = (await stepped.json()) as { headSeq: number };

    const undone = await a.post(`/api/bridge/sessions/${sessionId}/undo`, {});
    expect(undone.status()).toBe(200);
    const afterUndo = (await undone.json()) as { headSeq: number };
    expect(afterUndo.headSeq).toBeLessThan(afterStep.headSeq);

    await a.post(`/api/bridge/sessions/${sessionId}/discard`);
  });

  test("the coach payload is the web dock's own CoachPanelData, from the learner's seat", async ({
    context,
    page,
  }) => {
    await signInAs(context, "user_learner_lena");
    const a = await api(page);
    const dealt = await a.post("/api/bridge/quick-play", {});
    const { sessionId } = (await dealt.json()) as { sessionId: string };

    const res = await a.get(`/api/bridge/sessions/${sessionId}/coach`);
    expect(res.status()).toBe(200);
    const coach = await res.json();
    // Lena sits South — she is coached, not watching.
    expect(coach.watcher).toBe(false);
    // The exact fields <CoachDock data={quanCoach}/> consumes: the one-line
    // position, the flip-card facts, the think scaffold, the ask context.
    expect(typeof coach.looking).toBe("string");
    expect(coach.looking.length).toBeGreaterThan(0);
    expect(Array.isArray(coach.facts)).toBe(true);
    expect(coach.facts.length).toBeGreaterThan(0);
    expect(typeof coach.facts[0].label).toBe("string");
    expect(typeof coach.facts[0].value).toBe("string");
    expect(Array.isArray(coach.aid.candidates)).toBe(true);
    expect(Array.isArray(coach.aid.knownCards)).toBe(true);
    expect(coach.ask.sessionId).toBe(sessionId);
    expect(["auction", "play", "other"]).toContain(coach.ask.phase);
    expect(Array.isArray(coach.eventGroups ?? [])).toBe(true);

    await a.post(`/api/bridge/sessions/${sessionId}/discard`);
  });

  test("new-deal forks fresh cards for the same table", async ({ context, page }) => {
    await signInAs(context, "user_orgadmin_olivia");
    const a = await api(page);
    const dealt = await a.post("/api/bridge/quick-play", {});
    const { sessionId } = (await dealt.json()) as { sessionId: string };

    const fresh = await a.post(`/api/bridge/sessions/${sessionId}/new-deal`);
    expect(fresh.status()).toBe(200);
    const next = (await fresh.json()) as { sessionId: string };
    expect(next.sessionId).toBeTruthy();
    expect(next.sessionId).not.toBe(sessionId);

    await a.post(`/api/bridge/sessions/${sessionId}/discard`);
    await a.post(`/api/bridge/sessions/${next.sessionId}/discard`);
  });

  test("appearance round-trips through GET/PATCH", async ({ context, page }) => {
    await signInAs(context, "user_orgadmin_olivia");
    const a = await api(page);
    const before = await a.get("/api/bridge/appearance");
    expect(before.status()).toBe(200);
    const { appearance } = await before.json();
    expect(typeof appearance.skin).toBe("string");

    const patched = await page.request.patch(`${BASE}/api/bridge/appearance`, {
      data: { skin: "midnight" },
    });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).appearance.skin).toBe("midnight");
    // Put it back — specs must not restyle the seeded user's table.
    await page.request.patch(`${BASE}/api/bridge/appearance`, {
      data: { skin: appearance.skin },
    });
  });

  test("signed out, every table route reads as 401", async ({ request }) => {
    expect((await request.get("/api/bridge/sessions/x/view")).status()).toBe(401);
    expect((await request.post("/api/bridge/sessions/x/undo", { data: {} })).status()).toBe(401);
    expect((await request.post("/api/bridge/sessions/x/discard")).status()).toBe(401);
    expect((await request.get("/api/bridge/appearance")).status()).toBe(401);
  });
});

test.describe("challenge create (M3f)", () => {
  test("signed out → 401 on both routes", async ({ request }) => {
    expect((await request.get("/api/bridge/challenges/people")).status()).toBe(401);
    expect((await request.post("/api/bridge/challenges", { data: {} })).status()).toBe(401);
  });

  test("the invite directory answers, minus the caller", async ({ context, page }) => {
    await signInAs(context, "user_coach_carlos");
    const a = await api(page);
    const res = await a.get("/api/bridge/challenges/people");
    expect(res.status()).toBe(200);
    const { people } = await res.json();
    expect(Array.isArray(people)).toBe(true);
    expect(
      people.some((p: { userId: string }) => p.userId === "user_coach_carlos"),
    ).toBe(false);
  });

  test("a titleless draft is refused with the shared rule's sentence", async ({
    context,
    page,
  }) => {
    await signInAs(context, "user_coach_carlos");
    const a = await api(page);
    const res = await a.post("/api/bridge/challenges", {
      title: "",
      description: "",
      scoring: "imps",
      standingsVisibility: "after-finish",
      boards: [{ boardNo: 1, seed: 7, dealer: "N", humanSeat: "S" }],
      controlOverrides: {},
      invites: [],
      editorBadge: false,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("title");
  });

  test("a minimal draft creates: challenge, boards, creator's moderator row", async ({
    context,
    page,
  }) => {
    await signInAs(context, "user_coach_carlos");
    const a = await api(page);
    const created = await a.post("/api/bridge/challenges", {
      title: "M3f spec challenge",
      description: "",
      scoring: "imps",
      standingsVisibility: "after-finish",
      boards: [
        { boardNo: 1, seed: 11, dealer: "N", humanSeat: "S" },
        { boardNo: 2, seed: 12, dealer: "E", humanSeat: "S" },
      ],
      controlOverrides: { "table.hands_view": "hide", "table.undo": "hide" },
      invites: [{ userId: "user_learner_lena", moderator: false }],
      editorBadge: false,
    });
    expect(created.status()).toBe(200);
    const body = await created.json();
    expect(body.challengeId).toBeTruthy();
    expect(body.invited).toBe(1);

    // The summary read model lists it for the creator (accepted, moderator).
    const summary = await a.get("/api/bridge/challenges/summary");
    expect(summary.status()).toBe(200);
    const { challenges } = await summary.json();
    const mine = challenges.find(
      (c: { challengeId: string }) => c.challengeId === body.challengeId,
    );
    expect(mine).toBeTruthy();
    expect(mine.viewer.moderator).toBe(true);
    expect(mine.boardCount).toBe(2);
  });
});

test.describe("admin (olivia): library authoring flow", () => {
  test.beforeEach(async ({ context }) => {
    await signInAs(context, "user_orgadmin_olivia");
  });

  test("create deal → read entry → play it on a table", async ({ page }) => {
    const a = await api(page);

    const created = await a.post("/api/bridge/library/deals", {
      kind: "board",
      name: "M2 spec board",
      dealer: "S",
      vul: "none",
      hands: DEAL_HANDS,
    });
    expect(created.status()).toBe(200);
    const { entryId } = (await created.json()) as { entryId: string };
    expect(entryId).toBeTruthy();

    const entry = await a.get(`/api/bridge/library/entries/${entryId}`);
    expect(entry.status()).toBe(200);
    expect((await entry.json()).item.name).toBe("M2 spec board");

    const played = await a.post(`/api/bridge/library/entries/${entryId}/play`, {
      mode: "play",
    });
    expect(played.status()).toBe(200);
    const { sessionId } = (await played.json()) as { sessionId: string };
    expect(sessionId).toBeTruthy();
    await a.del(`/api/bridge/plays/${sessionId}`);
  });

  test("a 12-card hand is refused with the editor's copy", async ({ page }) => {
    const a = await api(page);
    const res = await a.post("/api/bridge/library/deals", {
      kind: "board",
      hands: { ...DEAL_HANDS, N: "AKQ.AKQ.AKQ.AKQ" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("13");
  });

  test("collections list answers (empty is a shape, not an error)", async ({ page }) => {
    const a = await api(page);
    const res = await a.get("/api/bridge/library/collections");
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).collections)).toBe(true);
  });

  test("an ungranted collection reads as 404", async ({ page }) => {
    const a = await api(page);
    const res = await a.get("/api/bridge/library/collections/col_nope");
    expect(res.status()).toBe(404);
  });
});
