# Sources Tab — Full Feature Spec (Content Developer)

Everything on the **Sources** screen and its two modals (view a source, add a source),
captured from source. Nothing omitted.

**Screen header**
- Kicker: **{instance name} · Content Developer**
- Title: **Sources**
- Subtitle: "Sources live in collections and per-object pools — never one giant stack. Each source is tagged for generation or embeddings, and you can search and filter within a collection."

The screen is two columns: a **collection list** (left) and the **active collection panel** (right). Empty program state: a card reading "No source collections in {program} yet."

---

## Left column — Collections
- **Collection search** — a "Find a collection…" box that appears **only when there are more than 6 collections**.
- **Collection cards** (scrollable list; click to select — active card is dark-bordered with shadow). Each card shows:
  - An icon: **amber Boxes** for a **pool**, **dark FolderOpen** for a **folder**.
  - Collection **name**.
  - A count line: "**N sources**".
  - A **scope chip** (Private / Team / Program / Organization).
  - **Pools** additionally get an amber ring to distinguish them from folders.
- **＋ New collection** — dashed button at the bottom (fires a toast — creation is stubbed in the prototype).

**Two collection kinds:**
- **Folder** — a general grouping of reusable sources (e.g. "Bidding references").
- **Pool** — a per-object source pool tied to one object (shows "Source pool for the '{object}' object"); this is what the Object Creator's Step-1 "Source pool" dropdown pulls from.

---

## Right column — Active collection panel

**Panel header**
- Icon (amber Boxes for a pool / slate FolderOpen for a folder) + collection **name**.
- If it's a pool: a subline "**Source pool for the '{object name}' object**".
- Right-side actions:
  - **⤴ Share to team** — promotes the collection (toast "Promoted to program-shared library").
  - **＋ Add source** — opens the **Add a source** modal.

**Filter bar** (below the header):
- **Search sources in this collection…** box.
- **Kind** dropdown: **All kinds** + one option per distinct source kind present in the collection.
- **Use** dropdown: **Any use · Generation · Embeddings**.
- A count line: "**N of M sources**" (filtered / total).

**Source rows** (each source in the collection):
- File icon.
- **Title**.
- Meta line: **{kind}**{ · {pages}p}{ · "{note}"} — e.g. "PDF · 22p · 'Pull the formal definition + classic experiments.'"
- A **purpose chip**: **Generation** (violet) or **Embeddings** (sky).
- A **role chip**: **Primary** / **Supporting** / **Reference**.
- **👁 View** button → opens the **Source viewer** modal.
- Empty states: "No sources in this collection yet." / "No sources match your search."

**Footer note** (amber): "Sources are grouped into collections and per-object pools, searchable and filterable within each — so a library of 100+ never becomes one endless stack. Each is tagged **Generation** (authored into content) or **Embeddings** (indexed for retrieval)."

---

## Modal — Source viewer  (opens from "View")
- **Title:** the source title. **Sub:** "{kind} · {pages} pages".
- A **role chip** + its description (Primary "Drives the object" / Supporting "Backs it up" / Reference "Might use").
- **Preview card:**
  - Text sources → "Text is parsed into pages and headings. Select any passage to cite it verbatim in a learning object, with a page reference kept automatically."
  - Media sources (Video / Audio) → "Media source — the transcript is indexed for search and citation. Scrub to a timestamp to pull a quote into an object."
- **✦ Tell the AI how to use this source** — a textarea for a per-source instruction (placeholder "e.g. Use the definition from p.4, but swap in a fresher everyday example."), with the note "Per-source instructions travel with the source into every generation that uses this pool."
- **Footer:** **Close** / **✓ Save instruction** (toast "Instruction saved for this source").

---

## Modal — Add a source  (opens from "Add source")
- **Title:** Add a source. **Sub:** "Bring in material from anywhere — not just files. Every source is used either for generation (authored into content) or embeddings (indexed for retrieval)."
- **"What are you bringing in?"** — a grid of **source kinds** (each = icon + label). Selecting one auto-sets its default purpose:

| Kind | Default purpose |
|---|---|
| PDF document | Generation |
| PowerPoint | Generation |
| Audio file | Embeddings |
| Video file | Embeddings |
| YouTube video | Embeddings |
| Google Doc | Generation |
| Web link | Embeddings |
| Import Quizlet | Generation |
| Paste notes | Generation |
| Handwritten notes | Generation |
| Blank notes | Generation |

- After a kind is picked, a config box appears:
  - **Name or URL** — input (placeholder "{kind} name or link").
  - **How will this source be used?** — two selectable cards:
    - **Generation** — "Authored directly into content by the AI + you".
    - **Embeddings** — "Indexed for retrieval / semantic search (RAG)".
- **Footer:** **Cancel** / **＋ Add source**. On add: the source is appended to the active collection with role *Supporting*, and a toast fires ("{kind} added for {purpose}").

---

## Reference values used on this screen
- **Source purposes:** **Generation** (violet — authored into content by the AI + you) · **Embeddings** (sky — indexed for retrieval / semantic search, i.e. RAG).
- **Source roles (within a pool):** **Primary** (Drives the object) · **Supporting** (Backs it up) · **Reference** (Might use). *Reference sources default to the Embeddings purpose.*
- **Scopes (on collections):** Private (Only me) · Team (My team) · Program (Everyone in this program) · Organization (All programs in the org).
- **Source kinds:** the 11 listed in the Add-a-source table above.

## Traps a design tool tends to miss here
- Sources are **never one flat list** — the whole screen is **collections/pools → filtered sources**, with a collection list, per-collection search, and kind/use filters.
- **Folder vs pool** are visually and functionally distinct (pools are per-object and feed the Object Creator's Step-1 dropdown; they carry an amber Boxes icon + ring).
- Every source carries **two independent tags**: a **purpose** (Generation vs Embeddings) and, inside a pool, a **role** (Primary/Supporting/Reference).
- The **collection search box only appears when there are 7+ collections**.
- **View** opens a real modal with a preview that differs for text vs media, plus a **per-source AI instruction** that "travels with the source into every generation."
- **Add source** is a two-stage modal (pick a kind → name/URL + choose Generation/Embeddings), spanning **11 source kinds** well beyond file upload (YouTube, Quizlet import, pasted/handwritten/blank notes, web links, Google Docs).