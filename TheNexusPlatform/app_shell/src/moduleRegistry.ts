/**
 * DEMO-owned module registry. This knowledge — which runtimes exist and where
 * they mount — deliberately lives in the consuming app, not in @laic/app-shell.
 *
 * Each entry is a lazy dynamic import: Vite splits every module into its own
 * chunk, fetched only when the config enables it AND the user navigates in.
 * `enabledModules: { bridge: false }` = bridge code never loads.
 */
import { lazy } from "react";
import type { AppShellConfig, LaunchContext } from "@laic/app-shell";

export interface ModuleEntry {
  key: string;
  routePrefix: string;
  Component: React.LazyExoticComponent<React.ComponentType<{ ctx: LaunchContext; config: AppShellConfig }>>;
}

export const MODULE_REGISTRY: ModuleEntry[] = [
  { key: "learning", routePrefix: "/learn", Component: lazy(() => import("./modules/learning")) },
  { key: "bridge", routePrefix: "/bridge", Component: lazy(() => import("./modules/bridge")) },
  { key: "coaching", routePrefix: "/coach", Component: lazy(() => import("./modules/coaching")) },
];
