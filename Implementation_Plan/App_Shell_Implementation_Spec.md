# LAIC App Shell Implementation Spec

Version: 1.0  
Status: Build specification  
Audience: Development workstreams  
Scope: Brain Bee App, MindAI Bee App, Bridge Coach App

---

## 1. Purpose

This document defines how the LAIC app shell should be implemented so the team can deploy three distinct apps while reusing one configurable app runtime.

The three target apps are:

```text
Brain Bee Course App
MindAI Bee App
Bridge Coach App
```

The app shell is the common application frame. It controls:

```text
app name
app slug
store app identity
theme
logo/icon/splash
welcome message
start screen buttons
role names
login/signup methods
onboarding questions
initial route
enabled modules
feature flags
entitlement gates
navigation frame
```

The app shell does not own learning content, bridge gameplay, or coaching logic. It loads those capabilities from the Learning, Bridge, and Coaching platforms after Nexus gives it the correct app context.

---

## 2. Implementation Goal

The implementation team should be able to do this:

```text
Create AppShellConfig in Nexus Admin
↓
Preview the app start screen and routes
↓
Publish config version
↓
Generate app build manifest
↓
Build Brain Bee, MindAI Bee, or Bridge Coach variant
↓
Deploy as web/PWA and later app-store build
```

No developer should need to hardcode a new login screen or start screen just because one app says `Student / Teacher` and another says `Player / Coach / Club`.

---

## 3. App Shell vs App Template

Use these terms consistently.

### 3.1 App Shell

The running application frame used by end users.

Examples:

```text
Brain Bee Course App shell
MindAI Bee App shell
Bridge Coach App shell
```

### 3.2 App Template

The reusable code template used to create app shells.

Examples:

```text
mobile learning app template
bridge app template
general program app template
```

### 3.3 App Shell Config

The data record that makes one app shell behave differently from another.

Example:

```text
same app runtime + Brain Bee config = Brain Bee app
same app runtime + MindAI Bee config = MindAI Bee app
same app runtime + Bridge Coach config = Bridge Coach app
```

---

## 4. Recommended Delivery Strategy

### 4.1 Web First, Store-App Ready

Build the student/player app runtime as a responsive web app first, then package it as store apps.

Recommended first implementation:

```text
mobile-first responsive web runtime
+ PWA support
+ Capacitor wrapper for app-store builds
```

Reason:

```text
Learning screens, quiz screens, app shell screens, and many bridge screens can be shared between browser and mobile app.
The team can move faster than building separate native screens immediately.
```

### 4.2 Expo Alternative

Expo/React Native is also acceptable if the team decides that native mobile screens are more important than sharing web runtime code. If using Expo, each target app should be an app variant generated from shared packages and variant-specific config.

Recommended decision for current build:

```text
Use responsive web + Capacitor for initial app-store wrappers.
Keep Expo as a future option if native interaction needs become important.
```

### 4.3 Admin Interfaces Stay Web

The following should not be built as app-store mobile screens initially:

```text
Nexus Admin
Learning Studio
Coach Configuration Studio
Bridge knowledge review admin
```

They should remain desktop/tablet web interfaces.

---

## 5. AppShellConfig Contract

The app shell must be driven by a versioned config object.

### 5.1 Type Definition

```ts
type AppShellConfig = {
  appId: string;
  slug: string;
  status: "draft" | "preview" | "published" | "retired";
  version: string;

  identity: {
    displayName: string;
    shortName: string;
    appStoreName?: string;
    bundleId?: string;      // iOS
    packageName?: string;   // Android
    webDomain?: string;
  };

  programContext: {
    nexusOrgId: string;
    programId: string;
    offeringId?: string;
    defaultDomainId: "brainbee" | "mindaib" | "bridge" | string;
  };

  branding: {
    logoAssetId?: string;
    iconAssetId?: string;
    splashAssetId?: string;
    primaryColor: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
  };

  copy: {
    welcomeTitle: string;
    welcomeSubtitle?: string;
    loginTitle?: string;
    signupTitle?: string;
    footerText?: string;
  };

  auth: {
    allowedMethods: Array<"email" | "phone" | "otp" | "google" | "apple">;
    requireInviteCode?: boolean;
    allowSelfSignup: boolean;
    allowAdminEnrollment: boolean;
    phoneSignupEnabled?: boolean;
  };

  roleButtons: Array<{
    key: string;
    label: string;
    description?: string;
    roleRequested: string;
    entryFlow: "signin" | "signup" | "apply" | "invite_only";
    defaultRouteAfterLogin: string;
    visible: boolean;
    sortOrder: number;
  }>;

  onboarding: {
    questions: Array<OnboardingQuestion>;
    requiredForRoles?: string[];
  };

  navigation: {
    homeRoute: string;
    tabs: Array<AppNavItem>;
    hiddenRoutes?: string[];
  };

  enabledModules: {
    learning: boolean;
    bridge: boolean;
    coaching: boolean;
    community?: boolean;
    payments?: boolean;
  };

  featureFlags: Record<string, boolean>;

  entitlements: {
    requiredEntitlementKeys: string[];
    coachUpsellEnabled?: boolean;
    upgradeRoute?: string;
  };

  build: {
    appVariant: "brainbee" | "mindaib" | "bridgecoach" | string;
    runtimeTemplate: "learning-app" | "bridge-app" | "general-app";
    environment: "dev" | "staging" | "production";
    configFrozenAtBuild: boolean;
  };
};

type OnboardingQuestion = {
  key: string;
  label: string;
  type: "text" | "single_select" | "multi_select" | "boolean" | "date" | "phone" | "email";
  options?: Array<{ label: string; value: string }>;
  required: boolean;
  visibleForRoles?: string[];
};

type AppNavItem = {
  key: string;
  label: string;
  route: string;
  icon?: string;
  requiredModule?: "learning" | "bridge" | "coaching";
  requiredEntitlement?: string;
  visibleForRoles?: string[];
};
```

---

## 6. Nexus Admin Configuration Screens

The Nexus Admin should expose a practical app shell editor.

### 6.1 App Setup Tab

Fields:

```text
app name
short name
slug
program
offering
default domain
runtime template
status
```

### 6.2 Branding Tab

Fields:

```text
logo
app icon
splash image
primary color
secondary color
accent color
background color
font choice if supported
```

### 6.3 Start Screen Tab

Fields:

```text
welcome title
welcome subtitle
role buttons
button labels
button descriptions
button order
button visibility
button target role
button entry flow
```

Example role buttons:

```text
Brain Bee: Student, Teacher/Admin
MindAI Bee: Student, Chapter Lead, Program Admin
Bridge Coach: Player, Coach, Club/Organization
```

### 6.4 Signup/Login Tab

Fields:

```text
email enabled
phone enabled
OTP enabled
Google enabled
Apple enabled
self-signup enabled
invite-only enabled
admin enrollment enabled
required invite code
```

### 6.5 Onboarding Tab

Fields:

```text
role-specific questions
chapter / region questions
school / club questions
bridge experience questions
coach affiliation questions
```

### 6.6 Navigation and Feature Flags Tab

Fields:

```text
home route
bottom tabs
side menu items
enabled modules
coach button enabled
bridge runtime enabled
course runtime enabled
progress page enabled
community disabled/enabled
```

### 6.7 Build Metadata Tab

Fields:

```text
iOS bundle ID
Android package name
store app name
privacy/contact email
support URL
marketing site URL
config version used in build
build environment
```

---

## 7. App Build Manifest

The app build process should not read the full mutable admin config directly. It should read a frozen build manifest generated from the published config.

```ts
type AppBuildManifest = {
  appId: string;
  slug: string;
  configVersion: string;
  generatedAt: string;
  displayName: string;
  bundleId: string;
  packageName: string;
  runtimeTemplate: string;
  environment: string;
  iconPath: string;
  splashPath: string;
  webBaseUrl: string;
  apiBaseUrl: string;
  appConfigUrl: string;
  deepLinkScheme: string;
  associatedDomains?: string[];
};
```

The build manifest should be committed or stored with the build artifact so the team knows exactly what configuration was used for each release.

---

## 8. Build Process

### 8.1 Configuration-to-Build Flow

```text
Nexus Admin publishes AppShellConfig
↓
Config validation runs
↓
Build manifest is generated
↓
App assets are resolved
↓
Environment variables are generated
↓
Native wrapper config is generated
↓
App variant is built
↓
Internal test build is produced
↓
QA validates app identity, start screen, login, routing, and content
↓
Store submission package is prepared
```

### 8.2 Build Commands

Recommended tool scripts:

```json
{
  "scripts": {
    "config:validate": "tsx tools/validate-app-config.ts",
    "config:export": "tsx tools/export-app-config.ts",
    "app:build:brainbee": "tsx tools/build-app-variant.ts brainbee",
    "app:build:mindaib": "tsx tools/build-app-variant.ts mindaib",
    "app:build:bridgecoach": "tsx tools/build-app-variant.ts bridgecoach",
    "app:preview:brainbee": "APP_VARIANT=brainbee npm run dev:app",
    "app:preview:mindaib": "APP_VARIANT=mindaib npm run dev:app",
    "app:preview:bridgecoach": "APP_VARIANT=bridgecoach npm run dev:app"
  }
}
```

---

## 9. Recommended Repository Structure

```text
laic-platform/
  apps/
    admin-web/
    app-runtime-web/
    mobile-shell/
      ios/
      android/
      capacitor.config.ts
  packages/
    app-shell-core/
      types.ts
      config-validator.ts
      launch-context.ts
    app-shell-ui/
      WelcomeScreen.tsx
      RoleButtonGrid.tsx
      LoginShell.tsx
      OnboardingRenderer.tsx
      AppNavShell.tsx
      EntitlementGate.tsx
    learning-runtime/
      CourseHome.tsx
      LessonPlayer.tsx
      QuizPlayer.tsx
      ProgressPage.tsx
    bridge-runtime/
      BridgeHome.tsx
      BridgeTable.tsx
      PlayerConfigEntry.tsx
    coaching-ui/
      CoachButton.tsx
      CoachPanel.tsx
      HintLadder.tsx
    ui-system/
    api-client/
  app-configs/
    brainbee.dev.json
    brainbee.prod.json
    mindaib.dev.json
    mindaib.prod.json
    bridgecoach.dev.json
    bridgecoach.prod.json
  tools/
    export-app-config.ts
    validate-app-config.ts
    generate-native-config.ts
    build-app-variant.ts
```

---

## 10. Per-App Configuration Examples

### 10.1 Brain Bee Course App

```json
{
  "slug": "brainbee",
  "identity": {
    "displayName": "Brain Bee Study",
    "shortName": "Brain Bee",
    "bundleId": "org.lifeinai.brainbee",
    "packageName": "org.lifeinai.brainbee"
  },
  "programContext": {
    "programId": "program_brainbee",
    "defaultDomainId": "brainbee"
  },
  "copy": {
    "welcomeTitle": "Welcome to Brain Bee Study",
    "welcomeSubtitle": "Learn neuroscience chapters with guided study, quizzes, and review."
  },
  "roleButtons": [
    {
      "key": "student",
      "label": "Student",
      "roleRequested": "student",
      "entryFlow": "signup",
      "defaultRouteAfterLogin": "/learn/course-home",
      "visible": true,
      "sortOrder": 1
    },
    {
      "key": "teacher",
      "label": "Teacher/Admin",
      "roleRequested": "course_admin",
      "entryFlow": "signin",
      "defaultRouteAfterLogin": "/admin/course",
      "visible": true,
      "sortOrder": 2
    }
  ],
  "enabledModules": {
    "learning": true,
    "bridge": false,
    "coaching": true
  },
  "featureFlags": {
    "aiStudyPanel": true,
    "coachButton": false,
    "chapterRegionRegistration": false
  }
}
```

### 10.2 MindAI Bee App

```json
{
  "slug": "mindaib",
  "identity": {
    "displayName": "MindAI Bee",
    "shortName": "MindAI Bee",
    "bundleId": "org.lifeinai.mindaib",
    "packageName": "org.lifeinai.mindaib"
  },
  "programContext": {
    "programId": "program_mindaib",
    "defaultDomainId": "mindaib"
  },
  "copy": {
    "welcomeTitle": "Welcome to MindAI Bee",
    "welcomeSubtitle": "Study mind, brain, decision making, and AI through concept tutorials and challenge practice."
  },
  "roleButtons": [
    {
      "key": "student",
      "label": "Student",
      "roleRequested": "participant",
      "entryFlow": "signup",
      "defaultRouteAfterLogin": "/challenge/home",
      "visible": true,
      "sortOrder": 1
    },
    {
      "key": "chapter_lead",
      "label": "Chapter Lead",
      "roleRequested": "chapter_lead",
      "entryFlow": "signin",
      "defaultRouteAfterLogin": "/chapter/dashboard",
      "visible": true,
      "sortOrder": 2
    }
  ],
  "onboarding": {
    "questions": [
      {
        "key": "chapter",
        "label": "Chapter",
        "type": "text",
        "required": false,
        "visibleForRoles": ["participant"]
      },
      {
        "key": "region",
        "label": "Region",
        "type": "single_select",
        "required": false,
        "options": []
      }
    ]
  },
  "enabledModules": {
    "learning": true,
    "bridge": false,
    "coaching": true
  },
  "featureFlags": {
    "aiStudyPanel": true,
    "scenarioQuestions": true,
    "reflectionPrompts": true,
    "chapterRegionRegistration": true
  }
}
```

### 10.3 Bridge Coach App

```json
{
  "slug": "bridgecoach",
  "identity": {
    "displayName": "Bridge Coach",
    "shortName": "Bridge Coach",
    "bundleId": "org.lifeinai.bridgecoach",
    "packageName": "org.lifeinai.bridgecoach"
  },
  "programContext": {
    "programId": "program_bridge",
    "defaultDomainId": "bridge"
  },
  "copy": {
    "welcomeTitle": "Welcome to Bridge Coach",
    "welcomeSubtitle": "Practice bridge with configurable players, tutorials, analysis, and coaching."
  },
  "roleButtons": [
    {
      "key": "player",
      "label": "Player",
      "roleRequested": "learner",
      "entryFlow": "signup",
      "defaultRouteAfterLogin": "/bridge/home",
      "visible": true,
      "sortOrder": 1
    },
    {
      "key": "coach",
      "label": "Coach",
      "roleRequested": "coach",
      "entryFlow": "apply",
      "defaultRouteAfterLogin": "/coach/dashboard",
      "visible": true,
      "sortOrder": 2
    },
    {
      "key": "club",
      "label": "Club / Organization",
      "roleRequested": "program_org_admin",
      "entryFlow": "apply",
      "defaultRouteAfterLogin": "/org/dashboard",
      "visible": true,
      "sortOrder": 3
    }
  ],
  "enabledModules": {
    "learning": true,
    "bridge": true,
    "coaching": true
  },
  "featureFlags": {
    "bridgeTable": true,
    "aiPlayerProfiles": true,
    "coachButton": true,
    "pbnImport": true,
    "linImport": true,
    "coachUpsell": true
  }
}
```

---

## 11. App Runtime Screen Composition

### 11.1 Startup Screen

Implementation:

```text
Load AppShellConfig
Apply theme
Show logo/icon
Render welcome title/subtitle
Render role buttons from config
Route selected role into configured auth/signup flow
```

### 11.2 Login / Signup

Implementation:

```text
Read allowed auth methods
Show email / phone / OTP / Google / Apple according to config
Capture selected role
Capture invite code if required
Create or retrieve Nexus user
Create registration or membership request as needed
Return launch context
```

### 11.3 Onboarding

Implementation:

```text
Render onboarding questions from config
Apply role visibility rules
Store answers under registration/onboarding record
Attach answers to app-specific context only where needed
```

### 11.4 Home Routing

Implementation:

```text
Use role button default route if selected
Otherwise use AppShellConfig.navigation.homeRoute
Resolve module route:
  /learn/* -> Learning Runtime
  /bridge/* -> Bridge Runtime
  /coach/* -> Coaching UI / Coach Dashboard
  /admin/* -> web admin only unless mobile admin is explicitly enabled
```

---

## 12. Native Build Variant Requirements

Each store app must have its own permanent identity.

| App | iOS Bundle ID | Android Package Name | Suggested Runtime Template |
|---|---|---|---|
| Brain Bee Course App | `org.lifeinai.brainbee` | `org.lifeinai.brainbee` | learning-app |
| MindAI Bee App | `org.lifeinai.mindaib` | `org.lifeinai.mindaib` | learning-app |
| Bridge Coach App | `org.lifeinai.bridgecoach` | `org.lifeinai.bridgecoach` | bridge-app |

Each app also needs:

```text
unique display name
unique icon
unique splash screen
unique deep link scheme
app-specific redirect URI for auth
app-specific store metadata
app-specific privacy/support URL
app-specific production API environment
```

---

## 13. Capacitor Build Process

Recommended initial wrapper process:

```text
Build responsive web runtime for selected app variant
↓
Generate Capacitor config for selected app
↓
Sync built web assets into native project
↓
Build iOS/Android binary
↓
Submit to internal testing
```

Example commands:

```bash
APP_VARIANT=brainbee npm run build:app-runtime
APP_VARIANT=brainbee npm run cap:sync
APP_VARIANT=brainbee npm run cap:build:ios
APP_VARIANT=brainbee npm run cap:build:android
```

The same process repeats for MindAI Bee and Bridge Coach.

Important rule:

```text
Do not manually edit generated native config for each app unless necessary.
Use generated config files so the process is repeatable.
```

---

## 14. Store Submission Readiness Checklist

For each app:

```text
[ ] app name finalized
[ ] bundle ID/package name finalized
[ ] icon created
[ ] splash screen created
[ ] privacy policy URL available
[ ] support email available
[ ] app category selected
[ ] screenshots created
[ ] age/content rating reviewed
[ ] auth flow tested
[ ] account deletion/support flow planned
[ ] app-store review credentials prepared if required
[ ] internal testing build created
[ ] production API environment selected
```

---

## 15. QA Checklist

### 15.1 Config QA

```text
App loads correct config version.
App name matches expected app.
Theme colors are applied.
Role buttons match config.
Hidden buttons are hidden.
Default route works.
Feature flags work.
```

### 15.2 Auth QA

```text
Email signup works where enabled.
Phone signup works where enabled.
Invite-only flow works where enabled.
Role selection is preserved through signup.
Launch context includes correct appId, programId, role, and entitlements.
```

### 15.3 Runtime QA

```text
Brain Bee opens course home.
MindAI Bee opens challenge learning home.
Bridge Coach opens bridge home.
Coach button appears only where configured.
Entitlement gate shows correct locked/unlocked state.
Progress events carry the correct app/domain context.
```

### 15.4 Native QA

```text
Installed app name is correct.
Installed icon is correct.
Splash screen is correct.
Deep link opens correct app.
Auth redirect returns to correct app.
Production build does not point to dev API.
```

---

## 16. App Shell APIs

### 16.1 Get Public App Config

```http
GET /api/apps/{slug}/public-config
```

Returns fields needed before login:

```ts
type PublicAppConfigResponse = {
  appId: string;
  slug: string;
  displayName: string;
  branding: BrandingConfig;
  copy: AppCopyConfig;
  auth: PublicAuthConfig;
  roleButtons: RoleButtonConfig[];
  onboardingPreview?: OnboardingQuestion[];
};
```

### 16.2 Get Launch Context

```http
GET /api/apps/{slug}/launch-context
```

Requires authenticated user.

```ts
type LaunchContext = {
  userId: string;
  appId: string;
  programId: string;
  organizationId?: string;
  programOrganizationId?: string;
  memberships: MembershipContext[];
  selectedRole?: string;
  permissions: string[];
  entitlements: string[];
  defaultRoute: string;
  enabledModules: Record<string, boolean>;
};
```

### 16.3 Submit Onboarding

```http
POST /api/apps/{slug}/onboarding
```

```ts
type SubmitOnboardingRequest = {
  selectedRole: string;
  answers: Record<string, unknown>;
  inviteCode?: string;
};
```

---

## 17. Acceptance Criteria

### 17.1 Configuration

```text
Admin can create three separate app shell configs.
Admin can preview all three start screens.
Admin can publish a versioned app config.
```

### 17.2 Runtime

```text
One app runtime renders all three apps from config.
Role buttons differ by app without code change.
Theme differs by app without code change.
Auth methods differ by app without code change.
```

### 17.3 Build

```text
Build process can create three distinct app variants.
Each app has separate bundle ID and package name.
Each app can be installed separately on the same device.
```

### 17.4 Product

```text
Brain Bee student lands on Brain Bee course.
MindAI Bee student lands on MindAI Bee challenge learning.
Bridge player lands on Bridge home/table area.
Coach button behavior is driven by configuration and entitlement.
```

---

## 18. Immediate Work Items

1. Implement `AppShellConfig` type and validator.
2. Seed three app configs.
3. Build start screen renderer.
4. Build role button renderer.
5. Build auth wrapper that preserves selected role and app slug.
6. Build launch context endpoint.
7. Build route resolver.
8. Connect Brain Bee to Learning course home.
9. Connect MindAI Bee to Learning challenge home.
10. Connect Bridge Coach to Bridge home.
11. Generate three native build manifests.
12. Produce internal test builds.

---

## 19. Final Implementation Rule

```text
The app shell must make three apps feel distinct without making three codebases.
```

The team should build reusable hooks and configuration contracts first, then create app-specific screens only where the underlying product genuinely differs.
