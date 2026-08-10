import type { CapabilityCatalogueDocument, ProviderId } from "../types";
import { nexusConsoleCatalogue } from "./nexus-console";
import { orgConsoleCatalogue } from "./org-console";
import { programConsoleCatalogue } from "./program-console";
import learningJson from "./learning.json";
import bridgeJson from "./bridge.json";
import libraryJson from "./library.json";
import clubAppJson from "./club-app.json";

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
  // The mobile app's own inventory — the club and coaching surfaces a custom
  // role configures. Seeded like any other provider, so the console's editor and
  // role builder pick it up with no special casing.
  "club-app": clubAppJson as unknown as CapabilityCatalogueDocument,
};
