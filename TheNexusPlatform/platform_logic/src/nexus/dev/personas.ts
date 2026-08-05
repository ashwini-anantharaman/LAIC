/**
 * Dev-only seed accounts for one-tap sign-in on the operator gate. Everything
 * here is gated behind `import.meta.env.DEV` at the call sites — never
 * rendered or bundled meaningfully in production.
 *
 * Real org members/admins/invitees are NOT listed here — they're fetched live
 * from the backend (`getDevPersonas` / `/api/platform/dev/personas`) so the
 * org portal and the topbar "Test as…" switcher always reflect who actually
 * exists (including anyone you just invited). See OrgPortal.tsx and
 * AppShell.tsx's DevPersonaSwitcher.
 */
export interface DevPersona {
  key: string;
  label: string;
  sublabel: string;
  email: string;
  password: string;
  /** Short glyph for the avatar chip. */
  glyph: string;
  /** Operator persona has no org; org personas name the portal slug they belong to. */
  orgSlug?: string;
}

// DEV builds always get quick-logins; a hosted demo opts in with
// VITE_DEV_LOGINS=1 (the backend's dev endpoints stay on while Supabase is
// unconfigured, so both halves agree).
export const DEV_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_LOGINS === "1";

export const DEV_PERSONAS: DevPersona[] = [
  {
    key: "operator",
    label: "Nexus Operator",
    sublabel: "Platform admin · all organizations",
    email: "devteam@mindbrainai.nexus",
    password: "L1FE1n@I123",
    glyph: "N",
  },
  {
    key: "org-admin",
    label: "Ashvin Kumar",
    sublabel: "Org admin · Life in AI Center",
    email: "ashvin@laic.org",
    password: "demo-password-123",
    glyph: "AK",
    orgSlug: "life-in-ai-center",
  },
];

/** Operator-only personas (no org) — shown on the bare Nexus gate. */
export const OPERATOR_PERSONAS = DEV_PERSONAS.filter((p) => !p.orgSlug);

/** Distinct org slugs seeded for local dev (for portal discovery links on the gate). */
export function demoOrgSlugs(): string[] {
  return [...new Set(DEV_PERSONAS.map((p) => p.orgSlug).filter((s): s is string => !!s))];
}
