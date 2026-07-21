/**
 * Nexus operator → Settings. The platform's OWN branding (accent + logo) —
 * the exact editor orgs and programs use, applied to the operator console.
 */
import { useEffect, useState } from "react";

import {
  getPlatformBranding,
  updatePlatformTheme,
  uploadPlatformLogo,
} from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { PageHeader, Section, Spinner } from "@/nexus/ui/kit";
import { ThemeEditor } from "@/nexus/ui/ThemeEditor";
import { writeBranding } from "@/nexus/branding";

export function OperatorSettings() {
  const [accent, setAccent] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPlatformBranding()
      .then((b) => {
        setAccent(b.accent);
        setLogo(b.logo);
      })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <Spinner />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Nexus's own theme and logo." />
      <Section title="Theme">
        <ThemeEditor
          accent={accent}
          logoUrl={resolveAssetUrl(logo)}
          onSaveAccent={async (hex) => {
            await updatePlatformTheme(hex);
            setAccent(hex);
            writeBranding({ orgId: "platform", accent: hex, logo: resolveAssetUrl(logo) });
          }}
          onUploadLogo={async (file) => {
            const r = await uploadPlatformLogo(file);
            setLogo(r.logo_url);
            writeBranding({ orgId: "platform", accent, logo: resolveAssetUrl(r.logo_url) });
          }}
        />
      </Section>
    </div>
  );
}
