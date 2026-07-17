# App Shell Studio

A design tool for configuring and **live-previewing** LAIC apps — matching the
App Shell Studio section of the Nexus platform prototype.

Edit an app's config on the **left** (Identity · Start · Auth · Onboarding ·
Home); watch the **phone preview** on the right re-render as you type. Switch
between the preset apps, start a new app from a template, walk the app
end-to-end in full-screen **Preview**, and open the **Publish** dialog.

> One runtime + one config = one app. The Studio edits that config
> (`AppShellConfig` in `src/types.ts`) and previews the resulting app. Three
> presets ship: **Brain Bee**, **MindAI Bee**, **Bridge Coach**.

## Run it

```sh
pnpm install
pnpm dev        # http://localhost:5175
pnpm typecheck  # strict, no errors
pnpm build      # production build
```

## What you can do

- **App switcher** (top of the left panel) — jump between Brain Bee / MindAI Bee
  / Bridge Coach (and any you create); duplicate with the ⧉ button.
- **Identity** — name, tagline, logo (upload or initials), app type, accent +
  text-on-accent colors. The whole preview re-skins live.
- **Start** — welcome copy and the role buttons shown on the start screen.
- **Auth** — registration path (public / invite-code / admin-added / bulk),
  approval requirement, and which sign-in methods appear.
- **Onboarding** — build questions (single-choice, multi-select, text, yes/no,
  date, phone, email), mark required, toggle skippable.
- **Home** — greeting/subtitle (with `{name}` / `{role}` tokens), quick-action
  tiles (reorderable), activity feed, and the bottom nav.
- **New app** — pick a template (Learning / Bridge / Activity) that pre-fills a
  fresh config.
- **Preview** — full-screen phone; tap role → sign in → onboarding → home, or
  jump with the stepper.
- **Publish** — real shareable links + a downloadable native build package (see below).

## Publishing & packaging

**Publish** produces real artifacts — no stubs:

- **Shareable link (any device)** — the whole config is encoded into the URL
  (`#config=…`), so it runs on any phone with zero infra.
- **Short link (this browser)** — `?app=<id>`, backed by a localStorage
  registry (swap for a Nexus `POST/GET /configs` later).
- **Installable PWA** — opening a link and "Add to Home Screen" installs it as
  the *specific app* (its own icon/name/theme, generated from the config) and it
  runs offline (service worker). This is a genuine installable app, no accounts.
- **Download build package** — a frozen `appshell-build.<slug>.json` (manifest +
  icons + config) that the native pipeline consumes.

Turn a package into a native app:

```sh
pnpm package appshell-build.brain-bee.json   # → build/<slug>/ (Capacitor-ready)
# then: pnpm build → copy dist into www → npx cap add ios android → CI signs & ships
```

Full path, prerequisites (Apple/Google accounts, signing, macOS/cloud CI), and
the Codemagic + GitHub Actions templates are in **`docs/native-build.md`**.

> Reality: the PWA + package are fully real here. **Signed store builds need
> paid developer accounts + macOS/cloud CI** and are gated on those — no code
> removes Apple/Google's signing and human review steps.

## Structure

```
src/
  main.tsx                      routes Studio vs Player (published app)
  index.css                     Tailwind v4 + dark-studio tokens
  types.ts                      AppShellConfig + Template + editor/preview unions
  share.ts                      publish links, config↔URL, registry, player resolver
  pwa.ts                        per-app icon + dynamic installable manifest
  packaging.ts                  build manifest + downloadable native build package
  player/Player.tsx             the published app, standalone + full-screen
  data/
    constants.ts                tab lists, field types, registration paths, helpers
    templates.ts                Learning / Bridge / Activity starting templates
    presets.ts                  Brain Bee / MindAI Bee / Bridge Coach apps
  ui/fields.tsx                 dark form primitives (Label, TextInput, Select, Toggle, Row…)
  studio/
    Studio.tsx                  top-level: header, modes (studio/newapp/preview), publish
    Editor.tsx                  left panel: app switcher + tab bar + active tab
    StudioPreview.tsx           right panel: phone + stepper
    NewAppPicker.tsx            template picker
    PreviewMode.tsx             full-screen walkthrough
    PublishModal.tsx            publish dialog
    tabs/                       IdentityTab · StartTab · AuthTab · OnboardingTab · HomeTab
  preview/
    PhoneFrame.tsx              device bezel + notch
    AppPreview.tsx              controlled screen router (start/signin/onboarding/home)
    screens/                    StartScreen · SignInScreen · OnboardingScreen · HomeScreen
scripts/package-app.mjs         expand a build package → Capacitor-ready folder
capacitor.config.ts             base Capacitor config (per-app override generated)
docs/native-build.md            full native/store pipeline + prerequisites
codemagic.yaml                  cloud-CI native build template (inert until secrets)
.github/workflows/mobile.yml    GitHub Actions native build template (inert)
```

## Notes

- Styling is Tailwind v4 (`@tailwindcss/vite`), fonts **Outfit** + **DM Mono**,
  matching the prototype's dark aesthetic.
- Config lives in React state only — reload resets to the three presets.
  Persisting configs (and a real publish) is where a Nexus-backed API slots in.
- The preview screens are a self-contained runtime; the same screens power both
  the side preview and full-screen Preview via the controlled `AppPreview`.
