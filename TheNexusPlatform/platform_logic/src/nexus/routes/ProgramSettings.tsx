/**
 * Program → Settings: the program's own branding, inheriting the org's until
 * customized. Revert clears the override and falls back to the organization.
 * Admin-level access only (the route is only in the admin nav).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import {
  listPrograms,
  updateProgramName,
  updateProgramTheme,
  uploadProgramFavicon,
  uploadProgramLogo,
} from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { readBranding, writeBranding } from "@/nexus/branding";
import { PageHeader, Section, Spinner } from "@/nexus/ui/kit";
import { ThemeEditor } from "@/nexus/ui/ThemeEditor";

export function ProgramSettings() {
  const { orgId = "", programId = "" } = useParams();
  type Brand = { accent: string | null; logo: string | null; favicon?: string | null };
  const [branding, setBranding] = useState<Brand | null | undefined>(undefined);
  const [programName, setProgramName] = useState<string>("Program");

  useEffect(() => {
    listPrograms(orgId)
      .then((ps) => {
        const p = ps.find((x) => x.id === programId);
        setProgramName(p?.name ?? "Program");
        setBranding(p?.branding ?? null);
      })
      .catch(() => setBranding(null));
  }, [orgId, programId]);

  if (branding === undefined) return <Spinner />;

  // Effective values shown in the editor: the program's own, else the org's.
  const orgB = readBranding(orgId);
  const accent = branding?.accent ?? orgB?.accent ?? null;
  const logo = branding?.logo ? resolveAssetUrl(branding.logo) : orgB?.logo ?? null;
  const favicon = branding?.favicon ? resolveAssetUrl(branding.favicon) : orgB?.favicon ?? null;

  function broadcast(next: Brand | null) {
    setBranding(next);
    // The shell resolves program → org, so writing the program key (or
    // clearing it) repaints the sidebar immediately.
    writeBranding({
      orgId: programId,
      accent: next?.accent ?? orgB?.accent ?? null,
      logo: (next?.logo ? resolveAssetUrl(next.logo) : null) ?? orgB?.logo ?? null,
      favicon: (next?.favicon ? resolveAssetUrl(next.favicon) : null) ?? orgB?.favicon ?? null,
    });
  }

  return (
    <div>
      <PageHeader
        title={`${programName} · Settings`}
        subtitle="This program's own theme and logo. Until customized, it inherits the organization's."
      />
      <Section title="Branding">
        <ThemeEditor
          name={programName}
          nameLabel="Program name"
          onSaveName={async (n) => {
            await updateProgramName(programId, n);
            setProgramName(n);
          }}
          accent={accent}
          logoUrl={logo}
          faviconUrl={favicon}
          onSaveAccent={async (hex) => {
            const r = await updateProgramTheme(programId, { accent: hex });
            broadcast(r.branding ?? { accent: hex, logo: branding?.logo ?? null, favicon: branding?.favicon ?? null });
          }}
          onUploadLogo={async (file) => {
            const r = await uploadProgramLogo(programId, file);
            broadcast({ accent: branding?.accent ?? null, logo: r.logo_url, favicon: branding?.favicon ?? null });
          }}
          onUploadFavicon={async (file) => {
            const r = await uploadProgramFavicon(programId, file);
            broadcast({ accent: branding?.accent ?? null, logo: branding?.logo ?? null, favicon: r.favicon_url });
          }}
          onRevert={async () => {
            await updateProgramTheme(programId, { revert: true });
            broadcast(null);
          }}
          revertLabel="Revert to organization theme"
        />
      </Section>
    </div>
  );
}
