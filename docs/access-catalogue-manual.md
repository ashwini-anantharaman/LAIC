# Access Catalogue Manual

Learning Platform guide for the LAIC cross-platform access-control framework.

Full framework: [`LAIC_Cross_Platform_Access_Control_Manual_v1.md`](./LAIC_Cross_Platform_Access_Control_Manual_v1.md)

---

## Purpose

The Access Catalogue tab edits a **`capability_catalogue`** document for the Learning Platform:

- File: `docs/learning-platform-access-catalogue.v1.json`
- Schema: `docs/laic-access-control.schema.json`

It defines **what can be controlled**. Program administrators define **who gets access** in an `access_policy` document (see `bridge-program-access-policy.example.json`).

Grant-only in v1 — no deny rules.

---

## Hierarchy (LAIC)

```text
Organization
  └── Program
        ├── Platform instance(s)   ← each refs a catalogue + enabledCapabilityIds
        ├── Teams
        ├── Roles (grants per platformInstanceId)
        └── Gates (participant signup, invitations, …)
```

Inside the Learning catalogue:

```text
groups[]
  ├── capabilityIds[]     ← atomic enforcement keys
  └── uiSurfaceIds[]       ← optional nav / screen / component mappings
resourceTypes[]           ← constraint targets for grants
sampleRoleTemplates[]     ← optional starters (not live policy)
```

---

## Document fields

| Field | Meaning |
|---|---|
| `documentType` | Always `capability_catalogue` |
| `id` | `learning-platform-access` |
| `provider` | `{ kind: "platform", id: "learning-platform" }` |
| `capabilities` | Atomic ids such as `learning.object.create` |
| `uiSurfaces` | Optional UI mappings (`requiredAnyCapabilities`) |
| `groups` | UI organization (`order`, capability + surface ids) |
| `resourceTypes` | Types/filters for constrained grants |
| `sampleRoleTemplates` | Suggested roles with `grants[].capabilityIds` |

Capabilities are the security boundary. Hiding a sidebar item is not security — backends must check the same capability.

---

## Editing in the app

Administrator → **Access Catalogue**

| Tab | Edits |
|---|---|
| Groups | Hierarchy tree of groups → capabilities & UI surfaces |
| Capabilities | Atomic keys, resource types, constraint flag |
| UI surfaces | navigation / screen / component / action |
| Resource types | Constraint field definitions |
| Sample roles | Template grants |
| Export JSON | Live catalogue document |
| JSON Schema | Full LAIC schema (catalogue + access_policy) |

Edits update Export JSON immediately. **Save catalogue** persists locally. **Reset v1 defaults** reloads `learning-platform-access-catalogue.v1.json`.

---

## Related files

- `learning-platform-access-catalogue.v1.json` — this platform’s catalogue
- `bridge-platform-access-catalogue.v1.json` — Bridge Platform catalogue (separate)
- `bridge-program-access-policy.example.json` — example program policy spanning both instances
- `laic-access-control.schema.json` — shared schema

---

## Rules

1. Do not invent capability ids outside published catalogues.
2. Programs grant catalogue ids on roles / direct grants.
3. A role may grant capabilities from multiple platform instances.
4. Resource constraints use `includeIds` and simple `filters` only.
5. Deprecate rather than reuse capability ids when catalogues evolve.
