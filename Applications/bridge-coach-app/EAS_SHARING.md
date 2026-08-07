# Sharing the app via Expo (no tunnels)

Publish the app's JS bundle to Expo's CDN with **EAS Update**; testers open it
in the free **Expo Go** app by scanning a QR. Nothing on your machine has to
stay running — the bundle is hosted by Expo, and the backends are the deployed
Vercel stack (baked in from `.env.eas` by the publish scripts).

## One-time setup (needs your Expo account — ~5 minutes)

```sh
npm install -g eas-cli
eas login                 # create a free account at expo.dev if you don't have one
cd Applications/bridge-coach-app
eas init                  # creates the EAS project, writes extra.eas.projectId into app.json
eas update:configure      # writes updates.url into app.json
```

Two things to verify afterwards:

- `app.json` must keep `"runtimeVersion": { "policy": "sdkVersion" }` (already
  set). **Expo Go can only load updates published with the `sdkVersion`
  policy** — if `eas update:configure` switched it to `appVersion`, change it
  back.
- Commit the `app.json` changes `eas` made (projectId + updates.url).

## Publishing (every time you want testers on the latest)

```sh
npm run publish:preview
```

That runs `eas update --branch preview --clear-cache` with the deployed
backend URLs from `.env.eas` baked in. (`--clear-cache` matters: Metro's
transform cache does NOT invalidate on env changes, and once shipped a stale
backend URL into an update.) The command prints an update link/QR — also on
the project's page at expo.dev.

## What testers do

1. Install **Expo Go** (App Store / Play Store).
2. Sign in to Expo Go with an account that has access to the project
   (member of the `life_in_ai_center` org) — updates are private.
3. Scan the QR from the update page (or open the link on the phone).

Note: the QR pins that specific update — after each publish, share/scan the
NEW update's QR rather than reopening from Expo Go's recents.

Sign-in note: unlike the web deploy, the native WebView loads bridge pages
top-level, so the Nexus launch cookie is first-party and sign-in works on
iPhones.

## Gotchas

- **SDK drift**: Expo Go supports only the current Expo SDK. If publishing
  warns the runtime is unsupported, upgrade the app
  (`npx expo install expo@latest --fix`) and republish.
- **URLs change**: `.env.eas` mirrors the bridge-coach-app Vercel project's
  production env. If sign-in breaks with "invalid email or password" on a
  fresh publish, check those URLs first — pointing at a stale backend
  produces exactly that symptom.
- **Web deploy untouched**: `.env.eas` is only read by the `publish:*`
  scripts. Local dev (`expo start`) and the Vercel web build keep their own
  config (tunnels / vercel.json proxy respectively).

## Later: real users (not teammates)

Expo Go is a developer tool; students should get a real install:

- **Android**: `eas build --profile preview --platform android` → shareable
  `.apk` link, installable directly — no Expo account needed.
- **iOS**: needs an Apple Developer account ($99/yr) →
  `eas build --profile production --platform ios` then `eas submit` →
  **TestFlight** invite links.

The `eas.json` profiles for both are already in place.
