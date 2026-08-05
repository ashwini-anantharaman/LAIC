/**
 * Shared two-tab People shell used at every altitude. The heading doubles as
 * the tab switch: "People" (big, the default) with a greyed "Roles & Groups"
 * beside it. People stays uncluttered — just members; all role/group editing
 * lives behind the second tab.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Tab = "people" | "rg" | "catalog";

export function PeoplePage({
  subtitle,
  actions,
  people,
  rolesGroups,
  accessCatalog,
}: {
  subtitle?: string;
  /** Rendered on the People tab, to the right of the heading (invite, view toggle). */
  actions?: ReactNode;
  people: ReactNode;
  rolesGroups: ReactNode;
  /** Optional third tab: this altitude's Access Catalog editor. Hidden if absent. */
  accessCatalog?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("people");
  const TabWord = ({ id, label }: { id: Tab; label: string }) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={
          active
            ? "text-2xl font-semibold tracking-tight text-foreground"
            : "text-lg font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        }
        style={{ alignSelf: "flex-end" }}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-end gap-4">
          <TabWord id="people" label="People" />
          <TabWord id="rg" label="Roles & Groups" />
          {accessCatalog ? <TabWord id="catalog" label="Access Catalog" /> : null}
        </div>
        {tab === "people" && actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tab === "people" && subtitle ? <p className="-mt-3 mb-4 text-sm text-muted-foreground">{subtitle}</p> : null}
      {tab === "people" ? people : tab === "rg" ? rolesGroups : accessCatalog}
    </div>
  );
}

/**
 * A titled section whose body collapses to just the title via a chevron — used
 * for "Program members" / "Platform members" so either can be hidden for easy
 * navigation of long rosters.
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center gap-1.5 text-left"
      >
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {count != null ? <span className="text-xs text-muted-foreground">· {count}</span> : null}
      </button>
      {open ? <div>{children}</div> : null}
    </section>
  );
}
