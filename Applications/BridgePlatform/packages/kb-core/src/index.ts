export type {
  KbDerivationRef,
  KbMeta,
  KbMetaBackend,
  KbPrincipal,
  KbScope,
  ScopeLevel,
} from "./types";

export {
  canPerformKb,
  defaultKbPolicy,
  KB_CAPABILITIES,
  KbAccessError,
  kbCatalogueFragment,
} from "./access";
export type { KbAccessPolicy, KbAccessRule, KbOperation } from "./access";
