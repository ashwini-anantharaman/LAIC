/**
 * Nexus operator → Settings. The platform's OWN branding (accent + logo) —
 * the exact editor orgs and programs use, applied to the operator console.
 */
import { useEffect, useState } from "react";

import {
  getPlatformBranding,
  updatePlatformName,
  updatePlatformTheme,
  uploadPlatformFavicon,
  uploadPlatformLogo,
} from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { PageHeader, Section, Spinner } from "@/nexus/ui/kit";
import { ThemeEditor } from "@/nexus/ui/ThemeEditor";
import { writeBranding } from "@/nexus/branding";

export function OperatorSettings() {
  const [accent, setAccent] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [favicon, setFavicon] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPlatformBranding()
      .then((b) => {
        setAccent(b.accent);
        setLogo(b.logo);
        setFavicon(b.favicon ?? null);
        setTitle(b.title ?? null);
      })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <Spinner />;

  const push = (a: string | null, l: string | null, t: string | null, f: string | null) =>
    writeBranding({ orgId: "platform", accent: a, logo: resolveAssetUrl(l), favicon: resolveAssetUrl(f), title: t });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Nexus's own name, theme, and logo." />
      <Section title="Branding">
        <ThemeEditor
          name={title}
          nameLabel="Platform name"
          namePlaceholder="Nexus"
          onSaveName={async (n) => {
            await updatePlatformName(n);
            setTitle(n);
            push(accent, logo, n, favicon);
          }}
          accent={accent}
          logoUrl={resolveAssetUrl(logo)}
          faviconUrl={resolveAssetUrl(favicon)}
          onSaveAccent={async (hex) => {
            await updatePlatformTheme(hex);
            setAccent(hex);
            push(hex, logo, title, favicon);
          }}
          onUploadLogo={async (file) => {
            const r = await uploadPlatformLogo(file);
            setLogo(r.logo_url);
            push(accent, r.logo_url, title, favicon);
          }}
          onUploadFavicon={async (file) => {
            const r = await uploadPlatformFavicon(file);
            setFavicon(r.favicon_url);
            push(accent, logo, title, r.favicon_url);
          }}
        />
      </Section>
    </div>
  );
}
