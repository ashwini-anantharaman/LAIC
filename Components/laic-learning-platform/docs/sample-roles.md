# Sample Roles

Sample role templates shipped on the Learning Platform **capability catalogue**. They are starters only — live Bridge / Brain Bee roles are defined in program **`access_policy`** documents.

Source: `docs/learning-platform-access-catalogue.v1.json` → `sampleRoleTemplates`

---

## Learning Platform templates

### Learning Content Developer
**id:** `learning-content-developer`

Creates and prepares learning objects and compositions.

**Grant** (`platformInstanceId`: `placeholder-learning-instance`):

- `learning.object.read`
- `learning.object.create`
- `learning.object.edit`
- `learning.source.manage`
- `learning.source.extract`
- `learning.composition.create`
- `learning.composition.edit`
- `learning.review.submit`
- `learning.review.comment`

---

### Learning Reviewer
**id:** `learning-reviewer`

Reviews objects and compositions.

**Grant:**

- `learning.object.read`
- `learning.review.comment`
- `learning.review.object`
- `learning.review.composition`
- `learning.review.resolve`

---

### Learner
**id:** `learner`

Uses assigned learning experiences.

**Grant:**

- `learning.runtime.use`

---

## Bridge Program example (access_policy)

Live roles are **not** catalogue templates. Example from `bridge-program-access-policy.example.json`:

| Role id | Purpose |
|---|---|
| `bridge-program-admin` | Administers Bridge + Learning instances + access.* system caps |
| `bridge-expert` | Bridge knowledge / CP validation + `learning.object.read`, `learning.review.comment` |
| `bridge-learning-developer` | Creates Bridge learning content on `bridge-learning` |
| `bridge-app-operator` | Participant onboarding + sessions |
| `bridge-app-participant` | Default gate role for app signup |

A single program role may include multiple `grants` blocks — one per `platformInstanceId` (e.g. `bridge-core` and `bridge-learning`).

---

## Editing

1. Administrator → **Access Catalogue** → **Sample roles**
2. Edit template grants
3. Save catalogue / export JSON

For assignments and teams, use program policy (People & Roles / Nexus), not the catalogue.
