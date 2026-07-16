import type { AppShellConfig, HomeConfig, HomeTile, NavItem } from "../../types";
import { AddButton, GroupTitle, IconBtn, Label, Row, TextInput, Toggle } from "../../ui/fields";

export function HomeTab({
  config,
  update,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
}) {
  const h = config.homeConfig;
  const setHome = (patch: Partial<HomeConfig>) => update({ homeConfig: { ...h, ...patch } });

  const move = <T,>(arr: T[], i: number, dir: number): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const setTiles = (tiles: HomeTile[]) => setHome({ tiles });
  const patchTile = (i: number, patch: Partial<HomeTile>) => setTiles(h.tiles.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const setNav = (navItems: NavItem[]) => setHome({ navItems });

  return (
    <>
      <GroupTitle>Header</GroupTitle>
      <div className="space-y-2.5">
        <div>
          <Label>Greeting</Label>
          <TextInput value={h.greeting} onChange={(v) => setHome({ greeting: v })} placeholder="Hello, {name}!" />
          <p className="mt-1 text-[9px]" style={{ color: "rgba(255,255,255,0.22)" }}>
            Tokens: <code className="font-mono">{"{name}"}</code> · <code className="font-mono">{"{role}"}</code>
          </p>
        </div>
        <div>
          <Label>Subtitle</Label>
          <TextInput value={h.subtitle} onChange={(v) => setHome({ subtitle: v })} placeholder="Ready to continue?" />
        </div>
      </div>

      <GroupTitle>Quick-action tiles</GroupTitle>
      <div className="space-y-2">
        {h.tiles.map((t, i) => (
          <Row key={i}>
            <div className="flex items-center gap-2">
              <div className="flex flex-shrink-0 flex-col gap-0.5">
                <IconBtn title="Move up" onClick={() => setTiles(move(h.tiles, i, -1))}>↑</IconBtn>
                <IconBtn title="Move down" onClick={() => setTiles(move(h.tiles, i, 1))}>↓</IconBtn>
              </div>
              <div className="min-w-0 flex-1">
                <TextInput value={t.label} onChange={(v) => patchTile(i, { label: v })} placeholder="Tile label" />
              </div>
              <IconBtn title="Remove tile" onClick={() => setTiles(h.tiles.filter((_, idx) => idx !== i))}>🗑</IconBtn>
            </div>
            <TextInput value={t.description} onChange={(v) => patchTile(i, { description: v })} placeholder="Short description" />
            <TextInput value={t.route} onChange={(v) => patchTile(i, { route: v })} placeholder="/route" mono />
          </Row>
        ))}
        <AddButton onClick={() => setTiles([...h.tiles, { label: "New Tile", description: "", route: "/" }])}>Add tile</AddButton>
      </div>

      <GroupTitle>Activity feed</GroupTitle>
      <div className="space-y-2.5">
        <Toggle checked={h.showFeed} onChange={(v) => setHome({ showFeed: v })} label="Show activity feed" />
        {h.showFeed && (
          <div>
            <Label>Feed label</Label>
            <TextInput value={h.feedLabel} onChange={(v) => setHome({ feedLabel: v })} placeholder="Recent Activity" />
          </div>
        )}
      </div>

      <GroupTitle>Bottom navigation</GroupTitle>
      <div className="space-y-2">
        {h.navItems.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-shrink-0 flex-col gap-0.5">
              <IconBtn title="Move up" onClick={() => setNav(move(h.navItems, i, -1))}>↑</IconBtn>
              <IconBtn title="Move down" onClick={() => setNav(move(h.navItems, i, 1))}>↓</IconBtn>
            </div>
            <div className="flex-1">
              <TextInput value={item.label} onChange={(v) => setNav(h.navItems.map((n, idx) => (idx === i ? { label: v } : n)))} placeholder="Tab label" />
            </div>
            <button
              onClick={() => setHome({ activeNavIndex: i })}
              className="flex-shrink-0 rounded-lg px-2 py-1 text-[9px] font-semibold transition-colors"
              style={
                h.activeNavIndex === i
                  ? { backgroundColor: `${config.accentColor}25`, color: config.accentColor }
                  : { backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.22)" }
              }
            >
              {h.activeNavIndex === i ? "Active" : "Set"}
            </button>
            <IconBtn
              title="Remove tab"
              onClick={() => {
                const navItems = h.navItems.filter((_, idx) => idx !== i);
                const activeNavIndex = h.activeNavIndex >= navItems.length ? Math.max(0, navItems.length - 1) : h.activeNavIndex;
                setHome({ navItems, activeNavIndex });
              }}
            >
              🗑
            </IconBtn>
          </div>
        ))}
        <AddButton onClick={() => setNav([...h.navItems, { label: "Tab" }])}>Add tab</AddButton>
      </div>
    </>
  );
}
