/**
 * Program → Settings: the program's own branding, inheriting the org's until
 * customized. Revert clears the override and falls back to the organization.
 * Admin-level access only (the route is only in the admin nav).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import {
  listPrograms,
  updateProgramTheme,
  uploadProgramLogo,
} from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { readBranding, writeBranding } from "@/nexus/branding";
import { PageHeader, Section, Spinner } from "@/nexus/ui/kit";
import { ThemeEditor } from "@/nexus/ui/ThemeEditor";

export function ProgramSettings() {
  const { orgId = "", programId = "" } = useParams();
  const [branding, setBranding] = useState<{ accent: string | null; logo: string | null } | null | undefined>(undefined);
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

  function broadcast(next: { accent: string | null; logo: string | null } | null) {
    setBranding(next);
    // The shell resolves program → org, so writing the program key (or
    // clearing it) repaints the sidebar immediately.
    writeBranding({
      orgId: programId,
      accent: next?.accent ?? orgB?.accent ?? null,
      logo: (next?.logo ? resolveAssetUrl(next.logo) : null) ?? orgB?.logo ?? null,
    });
  }

  return (
    <div>
      <PageHeader
        title={`${programName} · Settings`}
        subtitle="This program's own theme and logo. Until customized, it inherits the organization's."
      />
      <Section title="Theme">
        <ThemeEditor
          accent={accent}
          logoUrl={logo}
          onSaveAccent={async (hex) => {
            const r = await updateProgramTheme(programId, { accent: hex });
            broadcast(r.branding ?? { accent: hex, logo: branding?.logo ?? null });
          }}
          onUploadLogo={async (file) => {
            const r = await uploadProgramLogo(programId, file);
            broadcast({ accent: branding?.accent ?? null, logo: r.logo_url });
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
