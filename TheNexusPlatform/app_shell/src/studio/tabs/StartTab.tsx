import type { AppShellConfig, Role } from "../../types";
import { AddButton, GroupTitle, IconBtn, Label, Row, TextInput } from "../../ui/fields";

export function StartTab({
  config,
  update,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
}) {
  const setRoles = (roles: Role[]) => update({ roles });
  const patchRole = (i: number, patch: Partial<Role>) =>
    setRoles(config.roles.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <>
      <GroupTitle>Welcome copy</GroupTitle>
      <div className="space-y-2.5">
        <div>
          <Label>Heading</Label>
          <TextInput value={config.welcomeTitle} onChange={(v) => update({ welcomeTitle: v })} placeholder="What kind of user are you?" />
        </div>
        <div>
          <Label>Subtext</Label>
          <TextInput value={config.welcomeSubtitle} onChange={(v) => update({ welcomeSubtitle: v })} placeholder="Choose a role to get started." />
        </div>
      </div>

      <GroupTitle>Role buttons</GroupTitle>
      <div className="space-y-2">
        {config.roles.map((r, i) => (
          <Row key={i}>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TextInput value={r.label} onChange={(v) => patchRole(i, { label: v })} placeholder="Role name" />
              </div>
              <IconBtn title="Remove role" onClick={() => setRoles(config.roles.filter((_, idx) => idx !== i))}>
                🗑
              </IconBtn>
            </div>
            <TextInput value={r.description} onChange={(v) => patchRole(i, { description: v })} placeholder="One-line description (optional)" />
          </Row>
        ))}
        <AddButton onClick={() => setRoles([...config.roles, { label: "New role", description: "" }])}>Add role</AddButton>
      </div>
    </>
  );
}
