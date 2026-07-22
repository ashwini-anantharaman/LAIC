import type { AppShellConfig, ContentConnection } from "../../types";
import { PLATFORM_META, contentOf } from "../../data/constants";
import { GroupTitle, Label, Row, TextInput } from "../../ui/fields";

/**
 * The content section: which platforms this app connects to. Each enabled
 * connection shows as a launch card on the Home screen; in the published app
 * it will open that platform's learner view through the Nexus launch handoff.
 */
export function ContentTab({
  config,
  update,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
}) {
  const content = contentOf(config);
  const setContent = (patch: Partial<typeof content>) => update({ content: { ...content, ...patch } });
  const patchConnection = (i: number, patch: Partial<ContentConnection>) =>
    setContent({ connections: content.connections.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  return (
    <>
      <GroupTitle>Content section</GroupTitle>
      <div>
        <Label>Section title</Label>
        <TextInput value={content.sectionTitle} onChange={(v) => setContent({ sectionTitle: v })} placeholder="Your content" />
      </div>

      <GroupTitle>Connected platforms</GroupTitle>
      <div className="space-y-2">
        {content.connections.map((conn, i) => {
          const meta = PLATFORM_META[conn.platform];
          return (
            <Row key={conn.platform}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg text-xs"
                    style={{ backgroundColor: `${config.accentColor}22`, color: config.accentColor }}
                  >
                    {meta.glyph}
                  </span>
                  <span className="truncate text-xs font-semibold" style={{ color: "rgba(224,224,240,0.72)" }}>
                    {meta.name}
                  </span>
                </div>
                <button
                  onClick={() => patchConnection(i, { enabled: !conn.enabled })}
                  className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors"
                  style={
                    conn.enabled
                      ? { backgroundColor: `${config.accentColor}25`, color: config.accentColor, border: "1px solid transparent" }
                      : { backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.30)", border: "1px dashed rgba(255,255,255,0.14)" }
                  }
                >
                  {conn.enabled ? "Connected ✓" : "Connect"}
                </button>
              </div>
              {conn.enabled && (
                <>
                  <div>
                    <Label>Card label</Label>
                    <TextInput value={conn.label} onChange={(v) => patchConnection(i, { label: v })} placeholder={meta.name} />
                  </div>
                  <div>
                    <Label>Card description</Label>
                    <TextInput value={conn.description} onChange={(v) => patchConnection(i, { description: v })} placeholder="What the learner finds here" />
                  </div>
                </>
              )}
            </Row>
          );
        })}
      </div>

      <p className="mt-3 text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
        Enabled platforms appear as launch cards on the Home screen. In the published app each card opens the
        platform's learner view through a Nexus launch handoff (single-use token → platform session); this
        prototype previews the handoff with a mock screen — tap a card in the preview to see it.
      </p>
    </>
  );
}
