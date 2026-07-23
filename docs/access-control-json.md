# Access Control JSON

The learning platform defines **which sidebar items and capabilities are eligible for access control**. Programs (Bridge, Brain Bee, MindAI, …) define the **actual roles** and which of those items each role gets.

### Hierarchy

```
Domain  →  Module  →  Capability (optional parentCapability) | Sidebar surface
```

Example: **Authoring & sources** → **Learning objects** → `create_objects` → children `edit_objects`, `delete_objects`.

### JSON Schema

Formal draft-07 schema for the catalogue export:

- File: [`docs/access-catalogue.schema.json`](./access-catalogue.schema.json)
- In-app: Administrator → **Access Catalogue** → **JSON Schema** tab

| Layer | Owns | Does not own |
|---|---|---|
| **Platform** | Capability catalogue + sidebar surface map + sample role packs | Program-specific role lists |
| **Program instance** | Roles, grants, people ↔ role assignments | Inventing new capability ids |

---

## 1. Platform catalogue — sidebar surfaces

Every sidebar nav item is a controllable **surface**. Programs grant or deny visibility/navigation to these surfaces via roles.

```json
{
  "schemaVersion": "1.0",
  "layer": "platform",
  "surfaces": {
    "kind": "sidebar",
    "items": [
      {
        "id": "cd-home",
        "label": "Home",
        "group": "authoring",
        "screen": "cd-home",
        "requiredCapabilities": []
      },
      {
        "id": "cd-create",
        "label": "Create",
        "group": "authoring",
        "screen": "cd-create",
        "requiredCapabilities": ["create_objects", "create_courses"]
      },
      {
        "id": "cd-templates",
        "label": "Template Library",
        "group": "authoring",
        "screen": "cd-templates",
        "requiredCapabilities": ["create_objects", "edit_objects"]
      },
      {
        "id": "cd-sources",
        "label": "Sources",
        "group": "authoring",
        "screen": "cd-sources",
        "requiredCapabilities": ["manage_sources", "markup_extract"]
      },
      {
        "id": "cd-library",
        "label": "Object Library",
        "group": "authoring",
        "screen": "cd-library",
        "requiredCapabilities": ["repo_read"]
      },
      {
        "id": "cd-submissions",
        "label": "My Submissions",
        "group": "authoring",
        "screen": "cd-submissions",
        "requiredCapabilities": ["submit_review"]
      },
      {
        "id": "cd-versions",
        "label": "Versions & Publishing",
        "group": "authoring",
        "screen": "cd-versions",
        "requiredCapabilities": ["manage_versions", "publish"]
      },
      {
        "id": "cd-analytics",
        "label": "Author Analytics",
        "group": "authoring",
        "screen": "cd-analytics",
        "requiredCapabilities": ["repo_read"]
      },
      {
        "id": "or-reviews",
        "label": "Object Reviews",
        "group": "review",
        "screen": "or-reviews",
        "requiredCapabilities": ["review_objects"]
      },
      {
        "id": "cr-reviews",
        "label": "Course Reviews",
        "group": "review",
        "screen": "cr-reviews",
        "requiredCapabilities": ["review_courses"]
      },
      {
        "id": "admin-overview",
        "label": "Program Overview",
        "group": "administration",
        "screen": "admin-overview",
        "requiredCapabilities": ["manage_people"]
      },
      {
        "id": "admin-people",
        "label": "People & Roles",
        "group": "administration",
        "screen": "admin-people",
        "requiredCapabilities": ["manage_people"]
      },
      {
        "id": "admin-access",
        "label": "Access Catalogue",
        "group": "administration",
        "screen": "admin-access",
        "requiredCapabilities": ["manage_people"]
      },
      {
        "id": "admin-courses",
        "label": "Courses & Assignments",
        "group": "administration",
        "screen": "admin-courses",
        "requiredCapabilities": ["assign_courses", "publish"]
      },
      {
        "id": "admin-publishing",
        "label": "Publishing & Governance",
        "group": "administration",
        "screen": "admin-publishing",
        "requiredCapabilities": ["publish", "scope_program", "scope_org"]
      },
      {
        "id": "coach",
        "label": "Coach",
        "group": "teaching",
        "screen": "coach",
        "requiredCapabilities": ["assign_courses", "cohort_settings"]
      },
      {
        "id": "student-dashboard",
        "label": "Today",
        "group": "learner",
        "screen": "student-dashboard",
        "requiredCapabilities": ["preview_learner"]
      },
      {
        "id": "student-courses",
        "label": "My Courses",
        "group": "learner",
        "screen": "student-courses",
        "requiredCapabilities": ["preview_learner"]
      }
    ]
  }
}
```

**Rule:** A sidebar item is shown if the user’s role grants **at least one** of its `requiredCapabilities` (empty array = always available when the user has any session in that product area). Programs may also grant surfaces directly by `id` if they prefer a flatter model.

---

## 2. Platform catalogue — capabilities (People & Roles)

These are the stable keys programs grant on roles. They match the permission catalogue on the **People & Roles** tab.

```json
{
  "schemaVersion": "1.0",
  "layer": "platform",
  "capabilities": [
    {
      "id": "create_objects",
      "label": "Create learning objects",
      "group": "Authoring & sources",
      "resourceScope": { "kind": "learning_object", "typesOptional": true }
    },
    {
      "id": "edit_objects",
      "label": "Edit & regenerate objects",
      "group": "Authoring & sources",
      "resourceScope": { "kind": "learning_object", "typesOptional": true }
    },
    {
      "id": "delete_objects",
      "label": "Delete objects",
      "group": "Authoring & sources",
      "resourceScope": { "kind": "learning_object", "typesOptional": true }
    },
    {
      "id": "markup_extract",
      "label": "Mark up sources & extract content",
      "group": "Authoring & sources"
    },
    {
      "id": "manage_sources",
      "label": "Create & manage source pools",
      "group": "Authoring & sources"
    },
    {
      "id": "use_tools",
      "label": "Use tools & utilities",
      "group": "Authoring & sources"
    },
    {
      "id": "create_courses",
      "label": "Create & build courses",
      "group": "Courses"
    },
    {
      "id": "edit_courses",
      "label": "Edit courses",
      "group": "Courses"
    },
    {
      "id": "reuse_library",
      "label": "Reuse library objects in courses",
      "group": "Courses"
    },
    {
      "id": "submit_review",
      "label": "Submit work for review",
      "group": "Courses"
    },
    {
      "id": "comment",
      "label": "Comment on blocks (leave feedback)",
      "group": "Review & feedback"
    },
    {
      "id": "review_objects",
      "label": "Approve / request changes — objects",
      "group": "Review & feedback"
    },
    {
      "id": "review_courses",
      "label": "Approve / request changes — courses",
      "group": "Review & feedback"
    },
    {
      "id": "resolve_comments",
      "label": "Resolve feedback threads",
      "group": "Review & feedback"
    },
    {
      "id": "publish",
      "label": "Publish & set audience",
      "group": "Publishing & governance"
    },
    {
      "id": "manage_versions",
      "label": "Manage versions",
      "group": "Publishing & governance"
    },
    {
      "id": "scope_program",
      "label": "Promote content to program scope",
      "group": "Publishing & governance"
    },
    {
      "id": "scope_org",
      "label": "Promote content to organization scope",
      "group": "Publishing & governance"
    },
    {
      "id": "assign_courses",
      "label": "Assign courses to learners",
      "group": "Teaching"
    },
    {
      "id": "cohort_settings",
      "label": "Set cohort interaction settings",
      "group": "Teaching"
    },
    {
      "id": "preview_learner",
      "label": "Use the learner experience",
      "group": "Teaching"
    },
    {
      "id": "repo_read",
      "label": "Browse the object repository",
      "group": "Repository & administration"
    },
    {
      "id": "repo_write",
      "label": "Organize repository folders",
      "group": "Repository & administration"
    },
    {
      "id": "manage_people",
      "label": "Manage people & roles",
      "group": "Repository & administration"
    }
  ],
  "objectTypes": [
    "lesson",
    "tutorial",
    "quiz",
    "flashcard_set",
    "concept_card",
    "summary",
    "reflection",
    "scenario",
    "assignment",
    "drill",
    "video_script"
  ]
}
```

`resourceScope.typesOptional: true` means a role may optionally restrict the capability to a subset of `objectTypes` (e.g. Drill Developer → `["drill"]` only).

---

## 3. Platform sample role pack (recommended)

Shipped presets — programs may copy, customize, or ignore. Same set as **Recommended by LAIC** on People & Roles.

```json
{
  "schemaVersion": "1.0",
  "layer": "platform",
  "kind": "sample_role_pack",
  "roles": [
    {
      "id": "content-developer",
      "name": "Content Developer",
      "blurb": "Creates, edits, and submits learning objects and courses.",
      "capabilities": [
        "create_objects",
        "edit_objects",
        "delete_objects",
        "markup_extract",
        "manage_sources",
        "use_tools",
        "create_courses",
        "edit_courses",
        "reuse_library",
        "submit_review",
        "comment",
        "repo_read",
        "preview_learner"
      ],
      "sidebarSurfaces": [
        "cd-home",
        "cd-create",
        "cd-templates",
        "cd-sources",
        "cd-library",
        "cd-submissions",
        "cd-versions",
        "cd-analytics"
      ]
    },
    {
      "id": "object-reviewer",
      "name": "Object Reviewer",
      "blurb": "Reviews and approves individual learning objects.",
      "capabilities": ["review_objects", "comment", "resolve_comments", "repo_read"],
      "sidebarSurfaces": ["or-reviews"]
    },
    {
      "id": "course-reviewer",
      "name": "Course Reviewer",
      "blurb": "Reviews and approves assembled courses before admin sign-off.",
      "capabilities": ["review_courses", "comment", "resolve_comments", "repo_read"],
      "sidebarSurfaces": ["cr-reviews"]
    },
    {
      "id": "administrator",
      "name": "Administrator",
      "blurb": "Manages publishing, audience, people, and governance.",
      "capabilities": [
        "publish",
        "manage_versions",
        "scope_program",
        "scope_org",
        "manage_people",
        "review_objects",
        "review_courses",
        "resolve_comments",
        "repo_read",
        "repo_write"
      ],
      "sidebarSurfaces": [
        "admin-overview",
        "admin-people",
        "admin-access",
        "admin-courses",
        "admin-publishing"
      ]
    },
    {
      "id": "coach",
      "name": "Coach",
      "blurb": "Assigns courses to students, monitors progress, sends feedback.",
      "capabilities": ["assign_courses", "cohort_settings", "preview_learner", "comment"],
      "sidebarSurfaces": ["coach"]
    },
    {
      "id": "student",
      "name": "Student",
      "blurb": "Goes through assigned courses in the learner experience.",
      "capabilities": ["preview_learner"],
      "sidebarSurfaces": ["student-dashboard", "student-courses"]
    }
  ]
}
```

---

## 4. Program policy (instance-owned)

Each program instance defines **its** roles and grants against the platform catalogue. Example: Bridge with a custom Drill Developer.

```json
{
  "schemaVersion": "1.0",
  "layer": "program",
  "programId": "bridge",
  "programName": "Bridge",
  "roles": [
    {
      "id": "content-developer",
      "name": "Content Developer",
      "source": "platform_sample",
      "capabilities": [
        "create_objects",
        "edit_objects",
        "delete_objects",
        "markup_extract",
        "manage_sources",
        "use_tools",
        "create_courses",
        "edit_courses",
        "reuse_library",
        "submit_review",
        "comment",
        "repo_read",
        "preview_learner"
      ],
      "restrictedObjectTypes": null,
      "sidebarSurfaces": [
        "cd-home",
        "cd-create",
        "cd-templates",
        "cd-sources",
        "cd-library",
        "cd-submissions",
        "cd-versions",
        "cd-analytics"
      ]
    },
    {
      "id": "drill-dev",
      "name": "Drill Developer",
      "source": "custom",
      "desc": "Create drills only — read everything else.",
      "capabilities": [
        "create_objects",
        "edit_objects",
        "markup_extract",
        "use_tools",
        "repo_read"
      ],
      "restrictedObjectTypes": ["drill"],
      "sidebarSurfaces": [
        "cd-home",
        "cd-create",
        "cd-templates",
        "cd-sources",
        "cd-library"
      ]
    },
    {
      "id": "tester",
      "name": "Tester",
      "source": "custom",
      "desc": "Play and comment, read-only otherwise.",
      "capabilities": ["preview_learner", "comment", "repo_read"],
      "restrictedObjectTypes": [],
      "sidebarSurfaces": ["cd-library", "student-dashboard", "student-courses"]
    },
    {
      "id": "administrator",
      "name": "Administrator",
      "source": "platform_sample",
      "capabilities": [
        "publish",
        "manage_versions",
        "scope_program",
        "scope_org",
        "manage_people",
        "review_objects",
        "review_courses",
        "resolve_comments",
        "repo_read",
        "repo_write"
      ],
      "restrictedObjectTypes": null,
      "sidebarSurfaces": [
        "admin-overview",
        "admin-people",
        "admin-access",
        "admin-courses",
        "admin-publishing"
      ]
    },
    {
      "id": "student",
      "name": "Student",
      "source": "platform_sample",
      "capabilities": ["preview_learner"],
      "restrictedObjectTypes": null,
      "sidebarSurfaces": ["student-dashboard", "student-courses"]
    }
  ],
  "assignments": [
    { "personId": "u-bridge-cd-1", "roleIds": ["content-developer"] },
    { "personId": "u-bridge-drill-1", "roleIds": ["drill-dev"] },
    { "personId": "u-bridge-admin-1", "roleIds": ["administrator"] },
    { "personId": "u-bridge-student-1", "roleIds": ["student"] }
  ]
}
```

---

## 5. How layers consume this

1. **Platform** ships §1 (sidebar surfaces) + §2 (capabilities) + optional §3 (sample roles).
2. **Program** authors §4 in People & Roles (or an upstream IAM layer) using only ids from §1 and §2.
3. **Runtime**
   - Sidebar: show items listed in the user’s role `sidebarSurfaces` (or derive from granted capabilities × surface `requiredCapabilities`).
   - Actions / APIs: check `capabilities` (+ `restrictedObjectTypes` when editing content).

Programs never invent new capability or sidebar ids; they only grant what the platform catalogue exposes.
