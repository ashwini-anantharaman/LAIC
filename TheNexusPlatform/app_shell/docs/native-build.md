# Native build & store packaging

How a Studio-published app becomes a real mobile app. This is the honest end of
the pipeline: the browser can freeze an app into a **build package**, and this
doc is how that package turns into installable iOS/Android builds.

> **What's real today (B2):** installable per-app PWA, the build package, the
> Capacitor config generator, and these CI templates.
> **What's gated (B3):** signed native binaries + store delivery. Those require
> paid developer accounts, signing credentials, and macOS build hardware, and
> **cannot be produced from this Windows repo** — they run on a Mac or cloud CI.

---

## Tiers

| Tier | Output | Needs | Where it runs |
|---|---|---|---|
| **PWA** (done) | Installable, offline web app with its own icon/name/theme | nothing | any browser |
| **Package** (done) | `appshell-build.<slug>.json` → Capacitor-ready folder | nothing | Studio + `pnpm package` |
| **Android build** | `.apk` / `.aab` | JDK + Android SDK, a keystore | Linux/Win/Mac or CI |
| **iOS build** | `.ipa` | **macOS + Xcode**, Apple Developer acct, signing | Mac or **cloud macOS CI** |
| **Store delivery** | TestFlight / Play internal → public | the above + **human store review** | App Store Connect / Play Console |

---

## Prerequisites you must provide (no code removes these)

- **Apple Developer Program** — $99/yr. Gives a Team ID, App Store Connect, and
  the ability to create signing certificates + provisioning profiles.
- **Google Play Console** — $25 one-time. Gives a Play account + a service
  account JSON for automated uploads.
- **Signing material:** iOS distribution certificate + provisioning profile (or
  let `fastlane match` / EAS / Codemagic manage them); an Android upload
  keystore.
- **A macOS build environment for iOS** — your own Mac, or cloud CI that rents
  macOS (Codemagic, Ionic Appflow, GitHub Actions macOS runners).

None of these can be created or held by the Studio; they're accounts and
secrets you own.

---

## The flow

```
Studio ──Publish──▶ appshell-build.<slug>.json
                        │  pnpm package appshell-build.<slug>.json
                        ▼
                    build/<slug>/  (manifest, capacitor.config.json,
                        │           config.json, published-config.js, resources/)
                        ▼
   pnpm build (web) ─▶ dist/ ─▶ copied into build/<slug>/www/
                        │        + published-config.js referenced in index.html
                        ▼
   npx cap add ios android && npx cap sync   (iOS steps need macOS)
                        ▼
   CI builds + signs  ─▶  .aab / .ipa  ─▶  Play internal / TestFlight
                        ▼
              (manual) promote to production + store review
```

`published-config.js` sets `window.__PUBLISHED_CONFIG__`; the runtime boots
straight into that app (see `resolvePlayerTarget` in `src/share.ts`), so the
packaged binary is the specific app, offline.

### Local dry run (no accounts needed)

```sh
# 1. In the Studio, open Publish → "Download build package" for an app.
# 2. Expand it:
pnpm package ~/Downloads/appshell-build.brain-bee.json
# → build/brain-bee/ with manifest, capacitor.config.json, published-config.js, resources/
```

### Wiring Capacitor (native-ready)

```sh
pnpm add @capacitor/ios @capacitor/android      # platform packages
pnpm build                                       # web → dist/
cp build/<slug>/capacitor.config.json .          # activate this variant
npx cap add android                              # creates android/ (any OS)
npx cap add ios                                  # creates ios/ (build needs macOS)
npx cap sync
```

Android can be assembled anywhere with the SDK:
```sh
cd android && ./gradlew assembleRelease   # or bundleRelease for .aab (needs keystore to sign)
```
iOS must be built on macOS (`xcodebuild` / Xcode) — hence cloud CI below.

---

## CI options (pick when you have accounts)

Two templates are included, **inert until you add secrets**:

### Recommended for a Windows shop: **Codemagic** (`codemagic.yaml`)
Cloud macOS + Android machines, managed signing, direct TestFlight/Play submit.
No Mac required on your end. Add these in the Codemagic UI / env groups:
- `APP_STORE_CONNECT_*` (App Store Connect API key), iOS signing (via Codemagic
  managed signing or `CM_CERTIFICATE` / `CM_PROVISIONING_PROFILE`).
- `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` (Play), Android keystore vars.

### Alternative: **GitHub Actions** (`.github/workflows/mobile.yml`)
Ubuntu job for Android, macOS runner for iOS, `fastlane` for signing/upload.
Add repo secrets:
- iOS: `APP_STORE_CONNECT_KEY_ID`, `..._ISSUER_ID`, `..._KEY`, `MATCH_PASSWORD`
  (or cert/profile base64), `KEYCHAIN_PASSWORD`.
- Android: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `PLAY_SERVICE_ACCOUNT_JSON`.

Both assume `fastlane` lanes (`fastlane/Fastfile`) you add once accounts exist —
`fastlane match` (iOS certs), `fastlane pilot` (TestFlight), `fastlane supply`
(Play). Left out here on purpose: they need real credentials to be meaningful.

---

## Reality checklist before "it's in the store"

- [ ] Apple Developer + Google Play accounts active
- [ ] Bundle ID / package name registered (matches the build manifest)
- [ ] Signing certs / keystore created and stored as CI secrets
- [ ] App Store Connect + Play listings created (name, icon, screenshots, privacy)
- [ ] First build uploaded to TestFlight / Play internal and tested on device
- [ ] Store review submitted and **approved** (human, days) → public

The Studio + this pipeline automate everything up to "uploaded to testers."
The listing content and review approval are inherently manual.
