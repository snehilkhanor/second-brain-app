# Spec: build the "process the inbox" routine (run in the private brain repo)

This is the Step-6 spec for the companion app. Open a **new Claude Code session
on the private `snehilkhanor/second-brain` repo** and paste the block below.

It defines the **`graph.json` data contract** the deployed PWA depends on, the
`inbox.md` formats the phone writes, and the processing routine to build.

---

## PASTE THIS INTO A SESSION ON THE PRIVATE BRAIN REPO

You are working in my PRIVATE second-brain repo (`snehilkhanor/second-brain`).
A companion PWA (already built and deployed) READS `graph.json` from this repo
and APPENDS capture lines to `inbox.md`. Your job is to build the routine that
turns captures into structured cards and (re)generates `graph.json`.

### 1. First, learn this repo
Read what already exists and match its conventions — do not invent new ones if
the repo already has them:
- `build_views.py`, `DASHBOARD.md`, `GRAPH.md`
- several cards under `para/**` and `entities/**` (note their frontmatter keys,
  slug scheme, and section headings)

### 2. The data contract — `graph.json` (HARD REQUIREMENT)
Write `graph.json` at the repo ROOT, on the branch the app reads (currently
`main`). The app fetches `GET /contents/graph.json?ref=main`. Exact shape:

```json
{
  "nodes": [
    {"id":"mad-labs","label":"Mad Labs","type":"hub","summary":"one-line summary","connections":7,"open_decisions":0}
  ],
  "links": [
    {"source":"thirdman","target":"mad-labs","label":"venture-of"}
  ],
  "open_decisions": [
    {"card":"thirdman","text":"pricing: mass vs premium","since":"2026-06-20","flagged":false}
  ]
}
```

Field rules:
- `nodes[].id` — stable slug = card filename without `.md` (or an existing
  `slug`/`id` frontmatter field). Links reference these ids.
- `nodes[].label` — display name (frontmatter `title`, else humanized filename).
- `nodes[].type` — EXACTLY one of `hub | venture | person | org | rival`
  (drives node color). Map anything else to the closest of these.
- `nodes[].summary` — concise one-liner (frontmatter `summary:` if present, else
  the first meaningful body line). Shown in the app's entity panel.
- `nodes[].connections` — integer count of links touching the node (drives size).
- `nodes[].open_decisions` — integer (optional/cosmetic).
- `links[]` — from each card's `relates_to` frontmatter:
  `{source: thisCardId, target: slugInBrackets, label: relationshipLabel}`.
  De-duplicate mirrored links.
- `open_decisions[]` — ONE entry per bullet under a card's `## Open threads`.
  `card` = node id; `text` = the decision text VERBATIM; `since`/`flagged`
  optional. IMPORTANT: the app identifies a decision by `card + text`, so the
  `text` must match the card's bullet exactly and stay stable across runs.

### 3. The inbox formats the app writes (what you parse)
`inbox.md` is append-only — the phone only adds lines at the bottom. Two kinds:
1. Raw thought — any plain line, e.g. `talked to Amit re pricing, lean premium`.
2. Resolved decision — exactly:
   `resolved: [[card-id]] | "decision text" -> outcome text | YYYY-MM-DD`
   (the real arrow character is `→`; `"decision text"` matches an existing
   `## Open threads` bullet on that card).

### 4. The routine ("process the inbox")
1. Read `inbox.md`.
2. For each RAW thought: reason over the WHOLE repo and create/update the
   correct card — file it under the right PARA/entity card, add typed-edge
   links in `relates_to`, and put any new decision under `## Open threads`.
   Link correctly to cards that already exist.
3. For each `resolved:` line: on the named card, move that exact bullet from
   `## Open threads` to `## Decisions made`, stamped
   `YYYY-MM-DD — <text> → <outcome>`.
4. Regenerate `graph.json` (extend `build_views.py` or add `build_graph.py`)
   AND refresh `DASHBOARD.md` / `GRAPH.md`.
5. Clear (or archive) the processed lines from `inbox.md`.
6. Commit and push to `main`.

### 5. Constraints
- Cards are the source of truth; `graph.json` is compiled output — never
  hand-edit it.
- Two writers only: the phone appends to `inbox.md`; you rewrite cards +
  `graph.json`. Don't reorder/rewrite `inbox.md` except to clear processed lines.
- Make the graph generator deterministic and re-runnable.

### 6. Deliverables
1. The graph generator emitting `graph.json` in the exact shape above.
2. A `PROCESS_INBOX.md` playbook documenting steps 1–6 so next time I can just
   say "process the inbox."
3. Run it once now, commit `graph.json` to `main`, and confirm it validates
   against the contract.

### 7. Quick win first
If `graph.json` doesn't exist yet, generate it from the CURRENT cards and commit
it to `main` immediately — that makes my phone app light up with the real brain
right away. Then implement the full inbox processing.
