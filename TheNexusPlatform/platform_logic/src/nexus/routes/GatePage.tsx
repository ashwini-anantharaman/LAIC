/**
 * Public gate page at /@/<org-slug>/<gate-slug>. A program's own sign-up/
 * sign-in entrance — the org-portal pattern pushed down to the program. Renders
 * pre-auth from the gate's public config; on entry it stores the returned
 * session and hands off to the app.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useParams } from "react-router";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { getPublicGate, gateSignin, gateSignup, setToken, type PublicGate } from "@/services/api";
import { useDocumentTitle } from "@/nexus/useDocumentTitle";
import { resolveAssetUrl } from "@/services/apiBase";

export function GatePage() {
  const { slug: orgSlug, gateSlug } = useParams();
  const [gate, setGate] = useState<PublicGate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useDocumentTitle(gate?.org.name ?? null);

  useEffect(() => {
    if (!orgSlug || !gateSlug) return;
    getPublicGate(orgSlug, gateSlug)
      .then((g) => {
        setGate(g);
        // Students sign IN through the app, not the gate — a participant gate is
        // sign-up only. Members can sign in here (the gate is their door).
        setMode(g.audience === "participant" ? "signup" : g.allow_signin ? "signin" : "signup");
        // Preselect when the gate offers exactly one role (no choice to make).
        if (g.roles?.length === 1) setRoleId(g.roles[0].id);
      })
      .catch(() => setNotFound(true));
  }, [orgSlug, gateSlug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!gate) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        // A member gate can offer several roles — the signer must pick one.
        if (gate.roles && gate.roles.length > 1 && !roleId) {
          setError("Please choose a role to sign up as.");
          setBusy(false);
          return;
        }
        const r = await gateSignup(gate.id, {
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          role_id: roleId || undefined,
        });
        if (r.pending) {
          setDone("Thanks — your request was submitted and is awaiting approval. You'll be able to sign in once it's approved.");
          return;
        }
        if (gate.audience === "member") {
          // Staff: the gate IS their door — sign them into the console, which
          // routes to the section their role belongs to.
          setToken(r.access_token);
          window.location.href = "/";
        } else {
          // Students: their door is the APP, not this page. Signing up here just
          // creates the account; they sign in inside the application. Confirm and
          // stop — do NOT drop them in the console (they have no place there).
          setDone("Your account is ready! Go back to the app and sign in with this email and password.");
        }
      } else {
        // Sign-in is only offered on member gates (see `both` below); students
        // sign in through the app.
        const r = await gateSignin(gate.id, { email: email.trim(), password });
        setToken(r.access_token);
        window.location.href = "/";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-foreground">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Gate not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">This entrance doesn't exist or was removed.</p>
        </div>
      </div>
    );
  }
  if (!gate) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

  const accent = gate.org.theme_accent_color || undefined;
  const logoUrl = resolveAssetUrl(gate.org.theme_logo_url);
  const glyph = (gate.org.name ?? "•").slice(0, 1).toUpperCase();
  // Only member gates offer the sign-in/sign-up toggle; participant gates are
  // sign-up only (students sign in through the app).
  const both = gate.audience === "member" && gate.allow_signin && gate.allow_signup;

  return (
    <div
      className="min-h-screen grid place-items-center text-foreground px-4"
      style={accent ? ({ ["--primary"]: accent } as CSSProperties) : undefined}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-9 rounded-lg object-cover" />
          ) : (
            <div className="grid size-9 place-items-center rounded-lg text-white text-base font-semibold" style={{ background: accent ?? "var(--primary)" }}>
              {glyph}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold truncate">{gate.org.name}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">{gate.program_name}</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">{gate.title || (mode === "signup" ? "Create your account" : "Sign in")}</h1>
        {gate.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{gate.subtitle}</p> : null}

        {done ? (
          <p className="mt-6 rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">{done}</p>
        ) : (
          <>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signup" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="g-name">Name</Label>
                  <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>
              ) : null}
              {mode === "signup" && gate.roles && gate.roles.length > 1 ? (
                <div className="space-y-1.5">
                  <Label>Sign up as</Label>
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {gate.roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="g-email">Email</Label>
                <Input id="g-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-pw">Password</Label>
                <Input id="g-pw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "…" : mode === "signup" ? "Sign up" : "Sign in"}
              </Button>
            </form>
            {both ? (
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
