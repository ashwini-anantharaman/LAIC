import type { CapabilityCatalogueDocument, ProviderId } from "../types";
import { nexusConsoleCatalogue } from "./nexus-console";
import { orgConsoleCatalogue } from "./org-console";
import { programConsoleCatalogue } from "./program-console";
import learningJson from "./learning.json";
import bridgeJson from "./bridge.json";

/** The shipped catalogue per provider — the seed/reset baseline. The console
 *  catalogues are authored here; learning & bridge are the apps' own documents. */
export const DEFAULT_CATALOGUES: Record<ProviderId, CapabilityCatalogueDocument> = {
  "nexus-console": nexusConsoleCatalogue,
  "org-console": orgConsoleCatalogue,
  "program-console": programConsoleCatalogue,
  learning: learningJson as unknown as CapabilityCatalogueDocument,
  bridge: bridgeJson as unknown as CapabilityCatalogueDocument,
};
