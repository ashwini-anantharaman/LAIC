/**
 * App Shell editor (Phase 4, prototype §D14). An App Shell is ONLY
 * configuration — one shared runtime renders any shell's config. Edit the
 * initial screens here (identity, branding, welcome copy, sign-up fields,
 * onboarding, navigation) with a live phone preview; Save persists the working
 * config, Publish snapshots it as an immutable version.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, KeyRound, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import {
  getAppConfig,
  publishAppVersion,
  rotateAppKey,
  saveAppConfig,
  type ShellConfig,
  type ShellSignupField,
} from "@/services/api";
import { Pill, Spinner } from "@/nexus/ui/kit";

const TABS = [
  ["setup", "Setup"],
  ["branding", "Branding"],
  ["start", "Start screen"],
  ["signup", "Sign-up"],
  ["onboarding", "Onboarding"],
  ["navigation", "Navigation"],
] as const;
type TabKey = (typeof TABS)[number][0];

const FIELD_TYPES = ["text", "email", "number", "tel", "select", "date"];

/** Which preview screen each tab drives (mirrors the prototype). */
const TAB_SCREEN: Record<TabKey, "welcome" | "signup" | "onboarding" | "home"> = {
  setup: "welcome",
  branding: "welcome",
  start: "welcome",
  signup: "signup",
  onboarding: "onboarding",
  navigation: "home",
};

function defaults(config: ShellConfig): Required<ShellConfig> {
  return {
    identity: { displayName: "New App", shortName: "App", ...config.identity },
    branding: {
      primaryColor: "#4f46e5",
      accentColor: "#7c3aed",
      backgroundColor: "#f6f6fb",
      textColor: "#17171c",
      logoText: "A",
      ...config.branding,
    },
    copy: {
      welcomeTitle: "Welcome",
      welcomeSubtitle: "Your new application.",
      footerText: "",
      ...config.copy,
    },
    auth: { methods: ["email"], allowSelfSignup: true, requireInviteCode: false, ...config.auth },
    signupFields: config.signupFields ?? [
      { key: "name", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
    ],
    onboarding: config.onboarding ?? [],
    navigation: config.navigation ?? [
      { key: "home", label: "Home" },
      { key: "profile", label: "Profile" },
    ],
  };
}

export function ShellEditor() {
  const { orgId = "", programId = "", appId = "" } = useParams();
  const [config, setConfig] = useState<Required<ShellConfig> | null>(null);
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("setup");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppConfig(appId)
      .then((r) => {
        setConfig(defaults(r.config));
        setLatestVersion(r.latest_version);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load config"));
  }, [appId]);

  const screen = TAB_SCREEN[tab];

  function patch(updater: (c: Required<ShellConfig>) => Required<ShellConfig>) {
    setConfig((c) => (c ? updater(c) : c));
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    if (!config) return false;
    setBusy(true);
    try {
      await saveAppConfig(appId, config);
      setDirty(false);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!(await save())) return;
    setBusy(true);
    try {
      const v = await publishAppVersion(appId);
      setLatestVersion(v.version);
      toast.success(`Published v${v.version} — config snapshot is immutable`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    try {
      const r = await rotateAppKey(appId);
      await navigator.clipboard?.writeText(r.api_key);
      toast.success("New hook key copied to clipboard — the old key is revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rotate key");
    }
  }

  if (!config) return <Spinner />;
  const c = config;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={`/o/${orgId}/p/${programId}/shells`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> App Shells
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.identity.displayName}</h1>
          <div className="mt-1 flex items-center gap-2">
            {latestVersion ? <Pill tone="positive">v{latestVersion} published</Pill> : <Pill tone="warn">never published</Pill>}
            {dirty ? <Pill tone="warn">unsaved changes</Pill> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={rotate}>
            <KeyRound className="size-4" /> Rotate hook key
          </Button>
          <Button variant="ghost" onClick={save} disabled={busy || !dirty}>
            Save
          </Button>
          <Button onClick={publish} disabled={busy}>
            <Send className="size-4" /> Publish version
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
        <div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              {TABS.map(([k, label]) => (
                <TabsTrigger key={k} value={k}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="mt-5 space-y-4">
            {tab === "setup" ? (
              <>
                <Field label="Display name">
                  <Input
                    value={c.identity.displayName}
                    onChange={(e) => patch((p) => ({ ...p, identity: { ...p.identity, displayName: e.target.value } }))}
                  />
                </Field>
                <Field label="Short name">
                  <Input
                    value={c.identity.shortName}
                    onChange={(e) => patch((p) => ({ ...p, identity: { ...p.identity, shortName: e.target.value } }))}
                  />
                </Field>
              </>
            ) : null}

            {tab === "branding" ? (
              <div className="grid grid-cols-2 gap-4">
                <ColorField label="Primary" value={c.branding.primaryColor!} onChange={(v) => patch((p) => ({ ...p, branding: { ...p.branding, primaryColor: v } }))} />
                <ColorField label="Accent" value={c.branding.accentColor!} onChange={(v) => patch((p) => ({ ...p, branding: { ...p.branding, accentColor: v } }))} />
                <ColorField label="Background" value={c.branding.backgroundColor!} onChange={(v) => patch((p) => ({ ...p, branding: { ...p.branding, backgroundColor: v } }))} />
                <ColorField label="Text" value={c.branding.textColor!} onChange={(v) => patch((p) => ({ ...p, branding: { ...p.branding, textColor: v } }))} />
                <Field label="Logo glyph">
                  <Input
                    maxLength={2}
                    value={c.branding.logoText}
                    onChange={(e) => patch((p) => ({ ...p, branding: { ...p.branding, logoText: e.target.value } }))}
                    className="w-20"
                  />
                </Field>
              </div>
            ) : null}

            {tab === "start" ? (
              <>
                <Field label="Welcome title">
                  <Input
                    value={c.copy.welcomeTitle}
                    onChange={(e) => patch((p) => ({ ...p, copy: { ...p.copy, welcomeTitle: e.target.value } }))}
                  />
                </Field>
                <Field label="Welcome subtitle">
                  <Input
                    value={c.copy.welcomeSubtitle}
                    onChange={(e) => patch((p) => ({ ...p, copy: { ...p.copy, welcomeSubtitle: e.target.value } }))}
                  />
                </Field>
                <Field label="Footer text">
                  <Input
                    value={c.copy.footerText}
                    onChange={(e) => patch((p) => ({ ...p, copy: { ...p.copy, footerText: e.target.value } }))}
                  />
                </Field>
              </>
            ) : null}

            {tab === "signup" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  These fields are the app's sign-up screen — the runtime renders them and posts the values
                  back to Nexus as a registration.
                </p>
                <div className="space-y-2">
                  {c.signupFields.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={f.label}
                        onChange={(e) =>
                          patch((p) => ({
                            ...p,
                            signupFields: p.signupFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          }))
                        }
                        className="flex-1"
                      />
                      <Select
                        value={f.type}
                        onValueChange={(v) =>
                          patch((p) => ({
                            ...p,
                            signupFields: p.signupFields.map((x, j) => (j === i ? { ...x, type: v } : x)),
                          }))
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Switch
                          checked={f.required}
                          onCheckedChange={(v) =>
                            patch((p) => ({
                              ...p,
                              signupFields: p.signupFields.map((x, j) => (j === i ? { ...x, required: v } : x)),
                            }))
                          }
                        />
                        required
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch((p) => ({ ...p, signupFields: p.signupFields.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patch((p) => ({
                      ...p,
                      signupFields: [...p.signupFields, { key: `f${Date.now()}`, label: "New field", type: "text", required: false }],
                    }))
                  }
                >
                  <Plus className="size-3.5" /> Add field
                </Button>
              </>
            ) : null}

            {tab === "onboarding" ? (
              <>
                <p className="text-sm text-muted-foreground">Asked after sign-up (interests, experience…).</p>
                <div className="space-y-2">
                  {c.onboarding.map((q, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={q.label}
                        onChange={(e) =>
                          patch((p) => ({
                            ...p,
                            onboarding: p.onboarding.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          }))
                        }
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch((p) => ({ ...p, onboarding: p.onboarding.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patch((p) => ({ ...p, onboarding: [...p.onboarding, { key: `q${Date.now()}`, label: "New question", type: "text" }] }))
                  }
                >
                  <Plus className="size-3.5" /> Add question
                </Button>
              </>
            ) : null}

            {tab === "navigation" ? (
              <>
                <p className="text-sm text-muted-foreground">The app's bottom tabs.</p>
                <div className="space-y-2">
                  {c.navigation.map((n, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={n.label}
                        onChange={(e) =>
                          patch((p) => ({
                            ...p,
                            navigation: p.navigation.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          }))
                        }
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch((p) => ({ ...p, navigation: p.navigation.filter((_, j) => j !== i) }))}
                        disabled={c.navigation.length <= 1}
                      >
                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch((p) => ({ ...p, navigation: [...p.navigation, { key: `t${Date.now()}`, label: "New tab" }] }))}
                >
                  <Plus className="size-3.5" /> Add tab
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <PhonePreview config={c} screen={screen} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 rounded-md border border-border bg-transparent p-0.5"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-24 font-mono text-xs" />
      </div>
    </div>
  );
}

/** Live phone-frame preview rendered purely from the config (prototype's renderRuntime). */
function PhonePreview({ config: c, screen }: { config: Required<ShellConfig>; screen: string }) {
  const b = c.branding;
  const body = useMemo(() => {
    if (screen === "welcome") {
      return (
        <div className="flex h-full flex-col">
          <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
            <div
              className="grid size-14 place-items-center rounded-2xl text-xl font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${b.primaryColor}, ${b.accentColor})` }}
            >
              {b.logoText}
            </div>
            <div className="mt-4 text-lg font-semibold" style={{ color: b.textColor }}>
              {c.copy.welcomeTitle}
            </div>
            <div className="mt-1 text-xs opacity-70" style={{ color: b.textColor }}>
              {c.copy.welcomeSubtitle}
            </div>
            <button
              className="mt-6 w-full rounded-xl py-2.5 text-sm font-medium text-white"
              style={{ background: b.primaryColor }}
            >
              Get started
            </button>
            <div className="mt-3 text-[10px] uppercase tracking-wide opacity-50" style={{ color: b.textColor }}>
              sign in with {c.auth.methods?.join(" · ")}
            </div>
          </div>
          {c.copy.footerText ? (
            <div className="pb-4 text-center text-[10px] opacity-50" style={{ color: b.textColor }}>
              {c.copy.footerText}
            </div>
          ) : null}
        </div>
      );
    }
    if (screen === "signup") {
      return (
        <div className="px-5 pt-6">
          <div className="text-base font-semibold" style={{ color: b.textColor }}>
            Create your account
          </div>
          <div className="mt-4 space-y-3">
            {c.signupFields.map((f: ShellSignupField, i: number) => (
              <div key={i}>
                <div className="text-[11px] font-medium" style={{ color: b.textColor }}>
                  {f.label}
                  {f.required ? <span style={{ color: b.primaryColor }}> *</span> : null}
                </div>
                <div
                  className="mt-1 rounded-lg border px-3 py-2 text-[11px] opacity-60"
                  style={{ borderColor: `${b.textColor}22`, color: b.textColor }}
                >
                  {f.type === "email" ? "you@email.com" : f.type === "number" ? "0" : "Type here…"}
                </div>
              </div>
            ))}
            <button className="w-full rounded-xl py-2.5 text-sm font-medium text-white" style={{ background: b.primaryColor }}>
              Create account
            </button>
            <div className="text-center text-[9px] opacity-40" style={{ color: b.textColor }}>
              posts to Nexus · /api/hook/registrations
            </div>
          </div>
        </div>
      );
    }
    if (screen === "onboarding") {
      return (
        <div className="px-5 pt-6">
          <div className="text-base font-semibold" style={{ color: b.textColor }}>
            A few quick questions
          </div>
          <div className="mt-4 space-y-3">
            {c.onboarding.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-6 text-center text-[11px] opacity-50" style={{ borderColor: `${b.textColor}33`, color: b.textColor }}>
                No onboarding questions yet.
              </div>
            ) : (
              c.onboarding.map((q, i) => (
                <div key={i}>
                  <div className="text-[11px] font-medium" style={{ color: b.textColor }}>
                    {q.label}
                  </div>
                  <div className="mt-1 rounded-lg border px-3 py-2 text-[11px] opacity-60" style={{ borderColor: `${b.textColor}22`, color: b.textColor }}>
                    Type here…
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }
    // home
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 px-5 pt-6">
          <div className="text-base font-semibold" style={{ color: b.textColor }}>
            {c.navigation[0]?.label ?? "Home"}
          </div>
          <div
            className="mt-4 rounded-lg border border-dashed px-3 py-8 text-center text-[11px] opacity-50"
            style={{ borderColor: `${b.textColor}33`, color: b.textColor }}
          >
            Content composed from the Learning Platform
            <br />
            (arrives with the LP seam)
          </div>
        </div>
        <div className="flex border-t px-2 py-2" style={{ borderColor: `${b.textColor}15` }}>
          {c.navigation.map((n, i) => (
            <div
              key={i}
              className="flex-1 text-center text-[10px] font-medium"
              style={{ color: i === 0 ? b.primaryColor : `${b.textColor}88` }}
            >
              {n.label}
            </div>
          ))}
        </div>
      </div>
    );
  }, [c, b, screen]);

  return (
    <div className="sticky top-6">
      <div className="mx-auto w-[240px] rounded-[28px] border-4 border-foreground/80 bg-foreground/80 shadow-xl">
        <div className="overflow-hidden rounded-[24px]" style={{ background: b.backgroundColor, height: 480 }}>
          <div className="flex items-center justify-between px-4 pt-2 text-[9px] font-medium opacity-60" style={{ color: b.textColor }}>
            <span>9:41</span>
            <span>{c.identity.shortName}</span>
          </div>
          {body}
        </div>
      </div>
      <div className="mt-2 text-center text-xs text-muted-foreground">live preview · {screen}</div>
    </div>
  );
}
