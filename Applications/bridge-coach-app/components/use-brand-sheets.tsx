// The three sheets the top app bar opens — Menu, Profile, Settings — and the
// state that decides which one is up.
//
// Shared so Home (which positions its chrome over the artwork) and BrandChrome
// (used by ordinary screens) can't drift apart in behaviour. Only one sheet is
// open at a time, so tapping ☰ while Profile is up swaps rather than stacks.

import { ReactElement, useCallback, useState } from "react";

import { BrandSheet } from "./brand-sheet";
import { MenuSheetBody } from "./menu-sheet";
import { ProfileSheetBody } from "./profile-sheet";
import { SettingsSheetBody } from "./settings-sheet";

export type BrandSheetName = "menu" | "profile" | "settings";

export function useBrandSheets(top: number): {
  open: (name: BrandSheetName) => void;
  close: () => void;
  sheets: ReactElement;
} {
  const [sheet, setSheet] = useState<BrandSheetName | null>(null);
  const close = useCallback(() => setSheet(null), []);
  const open = useCallback((name: BrandSheetName) => setSheet(name), []);

  const sheets = (
    <>
      <BrandSheet visible={sheet === "menu"} onClose={close} title="Menu" top={top}>
        <MenuSheetBody onClose={close} />
      </BrandSheet>
      <BrandSheet visible={sheet === "profile"} onClose={close} title="Profile" top={top}>
        <ProfileSheetBody onClose={close} />
      </BrandSheet>
      <BrandSheet visible={sheet === "settings"} onClose={close} title="Settings" top={top}>
        <SettingsSheetBody />
      </BrandSheet>
    </>
  );

  return { open, close, sheets };
}
