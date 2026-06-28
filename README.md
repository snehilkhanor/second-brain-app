# second brain — app

An installable PWA: a rotating 3D "brain" of your projects, people, and open
decisions, with a pinned bottom bar for capturing thoughts on the go.

> **Two repos. Do not mix them up.**
>
> - **This repo** (`second-brain-app`, public) holds **only the app code**.
>   GitHub Pages serves it. **No data files ever live here.**
> - **The brain repo** (`second-brain`, private) holds **all the data** —
>   `inbox.md`, `graph.json`, and every card. The app reads and writes that
>   repo at runtime using a GitHub token you enter on your phone. The token
>   is stored only on the device, never in this code.

## How it fits together

- **Repo = truth.** All cards plus a compiled `graph.json`.
- **Phone = fast, append-only capture.** It only ever *appends* lines to
  `inbox.md`; it never rewrites a card.
- **Claude Code = the processor.** On demand, it turns raw captures into
  structured cards, fixes links, and regenerates `graph.json`.

## Local development

```bash
npm install     # one-time: download dependencies
npm run dev     # start a local dev server, then open the printed URL
npm run build   # produce the static site in dist/
npm run preview # preview the built site locally
```

## Build status

This app is being built in steps (see the build brief, section 9):

1. **Project foundation + design saved as source** ✅ *(this commit)*
2. PWA shell that renders the brain + dashboard (graph engine swapped to the
   [`3d-force-graph`](https://github.com/vasturiano/3d-force-graph) library)
3. Wire GitHub API **read** (token entry + fetch `graph.json`)
4. Wire **append-only writes** + instant local glow/badge feedback
5. Deploy to GitHub Pages + install on phone
6. The "process the inbox" routine (lives in the private brain repo)

## Project layout

```
index.html              # page shell, mounts the React app
vite.config.js          # build config (base path for GitHub Pages)
src/main.jsx            # React entry point
src/App.jsx            # the app UI — the working source (evolves each step)
design/brain_app_v2.jsx # the original design, frozen as a reference
```
