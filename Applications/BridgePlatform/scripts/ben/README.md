# Running BEN — the benchmark AND the table seat

BEN serves two features here, both through the same `BEN_ENDPOINT`:

1. **The bidding benchmark** (KB workspace → Benchmark) — described below.
2. **BEN as a table character** (2026-07-28): any seat's swap menu offers
   "BEN · neural engine" whenever `BEN_ENDPOINT` is set. BEN bids via `/bid`,
   makes the opening lead via `/lead`, and plays every later card via `/play`
   (the engine already routes the dummy's turn to the declarer's controller,
   which matches how BEN's `/play` infers who is on play from the `played`
   sequence). **A BEN seat can never wedge a table**: if BEN is unreachable,
   times out, or answers with an illegal call/card, the seat degrades — Pass
   for bids, the engine's fallback chain for cards — and the decision trace
   says exactly what happened. `BEN_TIMEOUT_MS` (default 20000) bounds each
   request.

   **Production:** the app calls BEN server-side, so `BEN_ENDPOINT` must be
   reachable FROM the deployment (a public HTTPS URL — e.g. the BEN container
   on Fly.io/Railway/a VM), not `127.0.0.1`. Set it in the Vercel project's
   environment; without it the BEN option simply doesn't render, and existing
   BEN seats degrade honestly per the above.

# Running BEN for the Bidding Benchmark

The **Benchmark** tab (KB workspace → Benchmark) compares this platform's bids
against **BEN** — [github.com/lorserker/ben](https://github.com/lorserker/ben),
"Bridge Engine, Neural," a bridge engine built on neural networks + the DDS
double-dummy solver. BEN is **GPL-3.0**: we run it as a **separate service** and
call its REST API over HTTP, which keeps this proprietary app clear of copyleft.
Never bundle or modify BEN inside this repo.

The benchmark only reaches BEN when `BEN_ENDPOINT` is set. With it unset, the
tab renders and shows an honest "BEN_ENDPOINT isn't configured" notice (this is
also how CI/e2e runs — it never talks to BEN).

## 1. Start BEN (Docker, easiest)

```sh
docker run --rm -it \
  -p 8085:8085 \
  ghcr.io/lorserker/ben
```

The container's entrypoint (`start_ben_all.sh`) launches BEN's servers,
including the **REST API** exposing `GET /bid` (around port **8085** per the
image's `README-api.md`; it also opens the WebSocket game server on 4443 and the
web UI on 8080, which the benchmark doesn't use). Confirm the REST port and path
against your image's `README-api.md` — builds vary.

Smoke-test the API once it's up:

```sh
curl "http://127.0.0.1:8085/bid?hand=AK97543.K.T3.AK7&seat=S&dealer=N&vul=&ctx=----&details=true"
```

You should get JSON with `bid`, `candidates[]` (each with `insta_score` and,
with search, `explanation`/`alert`), `who`, and `quality`.

## 2. Point BEN at a SAYC model

BEN ships several system configs in `src/config/*.conf`. **Use `BEN-Sayc.conf`**
so BEN bids SAYC — this collapses most of the "system difference" noise you'd
otherwise hand-classify (BEN-SAYC agrees far more with SAYC oracles than BEN's
default 2/1 model does). Selecting a config means starting BEN's server with
that conf and its matching model, e.g.:

```sh
# inside the BEN checkout / container
python src/gameserver.py --config config/BEN-Sayc.conf
```

The SAYC bidder weights (`BEN-Sayc-8730_*.keras`) are **downloaded separately**
into `models/TF2models/` — they are not vendored in BEN's git. See BEN's
`models/Readme.MD` for the current file names and download pointers, and place
them before starting the server.

## 3. Tune for determinism + speed (recommended)

BEN is **not reproducible by default**: when its search kicks in it samples
hands with an unseeded RNG. For a stable, fast benchmark, prefer **NN-only**
picks by setting a **high `search_threshold`** in the conf (so bids come
straight from the deterministic neural net, ~0.1 s/bid instead of seconds).
Leaving search on makes a single constructive/competitive bid take seconds and
makes re-runs on identical seeds diverge — flag any such run as non-deterministic.

## 4. Set `BEN_ENDPOINT`

Add the REST base URL to `apps/bridge-web/.env.local` (the benchmark strips a
trailing slash and appends `/bid`):

```sh
BEN_ENDPOINT=http://127.0.0.1:8085
```

Restart `next dev` so the server picks it up. `benAvailable()` is now true and
the "Run next batch" button enables.

## 5. Where runs execute + where results land

The benchmark runs **wherever `BEN_ENDPOINT` is reachable** — normally your
local dev machine next to the Docker container. Each "Run next batch" click is
one server invocation that plays ~25 deals (well under the 300 s function limit
at BEN's latency) and persists the cursor + divergences + stats into the run
record before returning.

**Recommended: point local dev at the shared store** so results persist for all
fellows, not just your machine:

```sh
STORE_BACKEND=postgres
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

With the file store (`STORE_BACKEND` unset) runs land only in your local
`.data/kb-store.json`.

> Never commit `.env.local` or print secrets. `BEN_ENDPOINT` is a local URL, not
> a secret, but the Supabase service-role key is — keep it out of logs and PRs.
