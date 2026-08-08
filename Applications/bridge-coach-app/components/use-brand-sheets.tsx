// The Menu drawer — one sheet, two levels.
//
// It used to be three sheets behind three icons in the top app bar (☰, gear,
// avatar). Those icons are gone: the tab bar's Menu slot opens this instead, and
// everything they held is a row inside it. Small drawers, one dresser.
//
// Level 0 is the index (Profile · Settings · Other); level 1 is whichever section
// you picked, with a back arrow in the sheet's own header. The panel never
// closes and reopens between the two, so it reads as one drawer being navigated
// rather than sheets stacking on sheets.

import { ReactElement, useCallback, useState } from "react";

import { BrandSheet } from "./brand-sheet";
import { MenuIndexBody, OtherSheetBody } from "./menu-sheet";
import { ProfileSheetBody } from "./profile-sheet";
import { SettingsSheetBody } from "./settings-sheet";
import { useIsCoach } from "../lib/use-is-coach";

type Section = "profile" | "settings" | "other";

const TITLES: Record<Section, string> = {
  profile: "Profile",
  settings: "Settings",
  other: "Other",
};

export function useBrandSheets(top: number): {
  open: () => void;
  close: () => void;
  sheets: ReactElement;
} {
  const [visible, setVisible] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const coach = useIsCoach();

  const close = useCallback(() => {
    setVisible(false);
    // Reset AFTER the dismissal, so the panel doesn't flash back to the index
    // on its way down.
    setTimeout(() => setSection(null), 220);
  }, []);

  const open = useCallback(() => {
    setSection(null);
    setVisible(true);
  }, []);

  const sheets = (
    <BrandSheet
      visible={visible}
      onClose={close}
      onBack={section ? () => setSection(null) : undefined}
      title={section ? TITLES[section] : "Menu"}
      top={top}
    >
      {section === "profile" ? (
        <ProfileSheetBody onClose={close} />
      ) : section === "settings" ? (
        <SettingsSheetBody />
      ) : section === "other" ? (
        <OtherSheetBody onClose={close} />
      ) : (
        <MenuIndexBody coach={coach} onOpen={setSection} />
      )}
    </BrandSheet>
  );

  return { open, close, sheets };
}
