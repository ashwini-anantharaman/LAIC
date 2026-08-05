import type { CapabilityCatalogueDocument, ProviderId } from "../types";
import { nexusConsoleCatalogue } from "./nexus-console";
import { orgConsoleCatalogue } from "./org-console";
import { programConsoleCatalogue } from "./program-console";
import learningJson from "./learning.json";
import bridgeJson from "./bridge.json";
import libraryJson from "./library.json";

/** The shipped catalogue per provider — the seed/reset baseline. The console
 *  catalogues are authored here; learning & bridge are the apps' own documents. */
export const DEFAULT_CATALOGUES: Record<ProviderId, CapabilityCatalogueDocument> = {
  "nexus-console": nexusConsoleCatalogue,
  "org-console": orgConsoleCatalogue,
  "program-console": programConsoleCatalogue,
  learning: learningJson as unknown as CapabilityCatalogueDocument,
  bridge: bridgeJson as unknown as CapabilityCatalogueDocument,
  // The library COMPONENT's own document (@laic/library-core semantics):
  // hosts embed its group (bridge does) or bind it via cross-catalogue grants.
  library: libraryJson as unknown as CapabilityCatalogueDocument,
};
