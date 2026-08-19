# Publishing the app to Expo Go

Testers open the app in the free **Expo Go** app by scanning a QR. There is no
"publish to Expo Go" button any more — what you actually do is publish the JS
bundle to Expo's CDN with **EAS Update**, and Expo Go loads that update. Nothing
on your machine has to stay running; the backends are the deployed Vercel stack,
baked in from `.env.eas` by the publish scripts.

Verified working on 2026-08-19: the `preview` branch has updates (latest
2026-08-17) publishing at runtime version `exposdk:54.0.0`, which is what Expo Go
loads.

## The one rule that decides everything: SDK version

Expo Go runs exactly **one** SDK version, and it must match the project's.
This app is on **SDK 54** (`expo@~54.0.35`), and SDK 54 is the last Expo Go the
Apple App Store approved — SDK 55, 56 and 57 are all still unapproved, so the
store build is the one we want.

Consequence: **do not upgrade the Expo SDK while Expo Go is the distribution
route.** An SDK 55+ project cannot be opened by a store-installed Expo Go, and
every tester would need a sideloaded APK or your own TestFlight build.

`app.json` must therefore keep:

```json
"runtimeVersion": { "policy": "sdkVersion" }
```

Expo Go only loads updates published under the `sdkVersion` policy (they get the
`exposdk:54.0.0` runtime). If anything switches this to `appVersion` or
`fingerprint`, Expo Go stops seeing the updates.

## One-time setup

Already done for this project (`projectId 01c9a70b-…`, `updates.url`, owner
`life_in_ai_center` are all committed in `app.json`). For a fresh machine:

```sh
npm install -g eas-cli     # 22.x is current; 21.6.0 works but warns
eas login                  # an account in the life_in_ai_center org
cd Applications/bridge-coach-app
npm install
eas whoami                 # should list life_in_ai_center
```

Only on a brand-new project would you run `eas init` and `eas update:configure`
— and then re-check the `runtimeVersion` policy above, because
`update:configure` likes to change it.

## Publishing

```sh
npm run publish:preview      # testers
npm run publish:production    # the production branch
```

That is `dotenv -e .env.eas -- eas update --branch preview --clear-cache`.

- `.env.eas` supplies `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_BRIDGE_LAUNCH_URL`,
  `EXPO_PUBLIC_LEARNING_URL` — the deployed backends.
- `--clear-cache` matters: Metro's transform cache does **not** invalidate on env
  changes, and a stale backend URL has shipped in an update because of it.

The command prints an update link and QR; the same appear on the project's page
at expo.dev under Updates → the `preview` branch.

## What testers do

1. Install **Expo Go** from the App Store / Play Store.
2. **Sign in to Expo Go** with an Expo account that is a member of the
   `life_in_ai_center` organization. Since 2026-05-12 Expo Go refuses to open
   EAS updates for projects you do not own or belong to — this is enforced on all
   Expo Go versions, so an anonymous tester simply cannot load the app.
3. Scan the QR from the update's page (or open the link on the phone).

After every publish, share the **new** update's QR/link rather than reopening
from Expo Go's recents — a QR pins one specific update.

Sign-in note: unlike the web deploy, the native WebView loads bridge pages
top-level, so the Nexus launch cookie is first-party and sign-in works on
iPhones.

## Local sharing without publishing

For quick iteration with someone else in the room (or remote, via ngrok):

```sh
npx expo start --tunnel      # @expo/ngrok is already a devDependency
```

Same Expo Go, same SDK rule, but the bundle comes from your machine, which must
stay awake and running.

## Troubleshooting

- **"Project is incompatible with this version of Expo Go"** — SDK mismatch.
  Check the Expo Go build's SDK against the project's 54. Android can sideload
  the exact version from https://expo.dev/go (SDK 54 → `Expo-Go-54.0.8.apk`) or
  install it through Expo Orbit; iOS has no sideload path, so the tester needs
  the store build (SDK 54) or a TestFlight Expo Go you built with `eas go`.
- **Tester sees "you don't have permission" / nothing loads** — they are signed
  out of Expo Go or their account is not in `life_in_ai_center`. Invite them at
  expo.dev → Organization → Members.
- **"sdkVersion … is not supported" from `eas update`** — Expo's backend has
  dropped that SDK. Publishing on SDK 54 worked on 2026-08-17; if this appears,
  the SDK has to move, and Expo Go distribution moves with it (see the SDK rule).
- **Sign-in breaks with "invalid email or password" right after a publish** —
  `.env.eas` is pointing at a stale backend. It mirrors the bridge-coach-app
  Vercel project's production env.
- **Web deploy untouched** — `.env.eas` is only read by the `publish:*` scripts.
  `expo start` and the Vercel web build keep their own config (tunnels /
  `vercel.json` proxy).

## When Expo Go stops being enough

Expo Go is a developer sandbox, and Expo now steers team distribution away from
it. Students should get a real install:

- **Android**: `eas build --profile preview --platform android` → shareable
  `.apk` link, installable directly, no Expo account needed.
- **iOS**: needs an Apple Developer account ($99/yr) →
  `eas build --profile production --platform ios` then `eas submit` →
  **TestFlight** invite links.
- **Either, with instant JS updates**: a development build (`--profile
  development`, which already sets `developmentClient: true`) plus the same
  `eas update` publishes — this is the only path that survives an SDK upgrade,
  because the build carries its own native runtime instead of borrowing Expo Go's.

The `eas.json` profiles for all three are already in place.
