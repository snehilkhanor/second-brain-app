// All GitHub access + on-device storage for the Second Brain app.
//
// The token and repo config live ONLY in this device's localStorage — never in
// the app code, never in the public repo. GitHub allows direct browser calls
// (CORS), so there is no server in between.

const TOKEN_KEY = "sb_token";
const CONN_KEY = "sb_conn"; // { owner, repo, branch }
const MIRROR_KEY = "sb_graph_mirror"; // disposable local copy of graph.json

// Sensible defaults the user can change in Settings. Not secrets — just the
// address of the brain repo. The token (the only sensitive bit) is entered by
// the user and stored on the device.
export const DEFAULT_CONN = { owner: "snehilkhanor", repo: "second-brain", branch: "main" };

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

// Generic on-device JSON storage (resolved state, capture log, outbox queue).
export function lsGetJSON(key, fallback) {
  try { const r = ls.get(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
export function lsSetJSON(key, val) { ls.set(key, JSON.stringify(val)); }

// --- connection (token + repo address) --------------------------------------

export function loadConn() {
  const token = ls.get(TOKEN_KEY) || "";
  let cfg = { ...DEFAULT_CONN };
  try { const raw = ls.get(CONN_KEY); if (raw) cfg = { ...DEFAULT_CONN, ...JSON.parse(raw) }; } catch {}
  return { token, ...cfg };
}

export function saveConn({ token, owner, repo, branch }) {
  ls.set(TOKEN_KEY, token || "");
  ls.set(CONN_KEY, JSON.stringify({ owner, repo, branch }));
}

// Wipe the token AND the local mirror — the mirror may hold private brain data,
// so disconnecting must not leave it behind on the device.
export function disconnect() {
  ls.del(TOKEN_KEY);
  ls.del(MIRROR_KEY);
}

// --- local mirror (instant load + offline) ----------------------------------

export function loadMirror() {
  try { const raw = ls.get(MIRROR_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveMirror(graph) { ls.set(MIRROR_KEY, JSON.stringify(graph)); }

// --- GitHub read ------------------------------------------------------------

const API = "https://api.github.com";
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

// GitHub returns file content as base64; decode it as UTF-8 (handles emoji etc.)
function b64ToUtf8(b64) {
  const bin = atob((b64 || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
// UTF-8 string -> base64 (for writing files back through the Contents API).
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

// Read graph.json from the private brain repo. Returns { graph, sha }.
export async function fetchGraphJson({ token, owner, repo, branch }) {
  if (!token) throw new Error("No token set");
  const url = `${API}/repos/${owner}/${repo}/contents/graph.json?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (r.status === 401) throw new Error("Bad token (401) — needs Contents access to this repo");
  if (r.status === 404) throw new Error("graph.json not found in the repo yet (404)");
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  const j = await r.json();
  return { graph: JSON.parse(b64ToUtf8(j.content)), sha: j.sha };
}

// --- GitHub write (append-only) ---------------------------------------------

// Read a file's raw text + sha, or null if it doesn't exist yet.
async function getFileRaw({ token, owner, repo, branch }, path) {
  const url = `${API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (r.status === 401) throw new Error("Bad token (401) — needs Contents read/write");
  if (!r.ok) throw new Error(`GitHub read error ${r.status}`);
  const j = await r.json();
  return { text: b64ToUtf8(j.content), sha: j.sha };
}

// PUT a file (this single call IS a commit). Include sha to update, omit to create.
async function putFile({ token, owner, repo, branch }, path, text, sha, message) {
  const url = `${API}/repos/${owner}/${repo}/contents/${path}`;
  const body = { message, content: utf8ToB64(text), branch };
  if (sha) body.sha = sha;
  const r = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { const e = new Error("Bad token (401) — needs Contents write"); e.status = 401; throw e; }
  if (!r.ok) { let m = ""; try { m = (await r.json()).message; } catch {} const e = new Error(`GitHub write error ${r.status}${m ? ": " + m : ""}`); e.status = r.status; throw e; }
  return r.json();
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Normalise lines: each trimmed of trailing whitespace + its own single "\n".
const joinLines = (lines) => lines.map((l) => String(l).replace(/\s+$/, "") + "\n").join("");

// A line's identity for presence checks = its content with trailing whitespace stripped
// (exactly the normalisation joinLines applies when writing), so a previously-written
// line matches byte-for-byte. Build the set of lines already in inbox.md.
const lineKey = (l) => String(l).replace(/\s+$/, "");
const presentSet = (text) => new Set((text || "").split("\n").map(lineKey).filter((l) => l !== ""));

// Append the given lines to inbox.md in ONE commit — IDEMPOTENTLY. Before each PUT we
// re-read inbox.md and drop any line ALREADY present verbatim. This fixes the false-409:
// GitHub can APPLY a write yet still return 409 when a concurrent write slips between our
// read-sha and our PUT. Without a presence check the retry re-reads the (now-updated) file
// and appends the same line again (double-write), and an exhausted retry reports a phantom
// failure even though the line is already saved. With it:
//  - retries never re-append a line that's already there (idempotent),
//  - a landed-but-409 write resolves to a no-op SUCCESS on the next pass,
//  - genuinely-absent lines are the only ones (re-)PUT (re-reading the sha each time).
// If every line is already present it's a no-op success. Retry sha-conflicts with backoff.
async function appendLines(conn, lines, message, maxAttempts) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const cur = await getFileRaw(conn, "inbox.md");
    const text = cur ? cur.text : "";
    const have = presentSet(text);
    const missing = lines.filter((l) => !have.has(lineKey(l)));
    if (!missing.length) return { ok: true, noop: true }; // all already saved → succeeded
    const base = text.replace(/\s+$/, "");
    const next = (base ? base + "\n" : "") + joinLines(missing);
    try {
      return await putFile(conn, "inbox.md", next, cur?.sha, message);
    } catch (e) {
      if (e.status === 409 || e.status === 422) { lastErr = e; await sleep(200 * (attempt + 1)); continue; }
      throw e; // non-conflict (offline/auth/etc.) — bubble up so it stays queued
    }
  }
  // Retries exhausted: the 409 on the final attempt may itself have landed — re-check
  // presence before declaring failure, so a succeeded-but-409 write is never reported failed.
  const cur = await getFileRaw(conn, "inbox.md");
  const have = presentSet(cur ? cur.text : "");
  if (lines.every((l) => have.has(lineKey(l)))) return { ok: true, noop: true };
  throw lastErr || new Error("append failed after retries");
}

// Append one line (string) or many lines (array) to inbox.md. Append-only; never edits
// cards. Batches ALL lines into ONE commit; on persistent 409/422 with many lines, falls
// back to writing each line one-at-a-time. IDEMPOTENT: a line already present verbatim in
// inbox.md is never appended again, so retries (and false-409s) can't double-write.
export async function appendToInbox(conn, lines, message = "app: write") {
  if (!conn.token) throw new Error("Not connected");
  const arr = (Array.isArray(lines) ? lines : [lines]).filter((l) => String(l).trim() !== "");
  if (!arr.length) return;
  try {
    return await appendLines(conn, arr, message, 3);
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && arr.length > 1) {
      for (const l of arr) await appendLines(conn, [l], message, 5); // one-at-a-time, each idempotent
      return;
    }
    throw e;
  }
}

// The "waiting" items in inbox.md, in file order: non-empty lines that are NOT
// markdown headings (don't start with "#"). Empty array if the file doesn't
// exist yet. The count is just this array's length.
export async function fetchInboxItems(conn) {
  if (!conn.token) return [];
  const cur = await getFileRaw(conn, "inbox.md");
  if (!cur) return [];
  return cur.text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

// Write (or replace) a `process-request` marker at the repo root — same PUT/commit
// mechanism as inbox writes. The brain processor honours this on its next run and
// clears it. Content is a short stamp the processor can log/ignore.
export async function requestProcess(conn, content) {
  if (!conn.token) throw new Error("Not connected");
  const cur = await getFileRaw(conn, "process-request");
  return putFile(conn, "process-request", content, cur?.sha, "app: process-request");
}

// --- normalisation ----------------------------------------------------------

// Turn a graph.json object (the brief's section-3 shape, with optional `summary`
// on nodes and optional `id`/`flagged` on decisions) into the shapes the UI and
// the 3D engine consume.
export function normalize(g) {
  const rawNodes = Array.isArray(g?.nodes) ? g.nodes : [];
  const rawLinks = Array.isArray(g?.links) ? g.links : [];
  const rawDecs = Array.isArray(g?.open_decisions) ? g.open_decisions : [];

  const deg = {};
  rawLinks.forEach((l) => { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; });

  const nodes = rawNodes.map((n) => ({
    id: n.id,
    label: n.label || n.id,
    kind: n.type || "rival",
    summary: n.summary || "",
    card: n.card || "",                 // full markdown body (for "View full card")
    connections: n.connections != null ? n.connections : (deg[n.id] || 0),
  }));
  const links = rawLinks.map((l) => [l.source, l.target, l.label || ""]);

  const name = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
  const summary = Object.fromEntries(nodes.map((n) => [n.id, n.summary]));

  // An item's identity is `entity + text` (unless an explicit id is given) so it
  // stays byte-stable across runs and matches the action lines the app appends.
  // Items carry type (decision|task) and status/snooze (no `card`, no `since`).
  const dec = {};
  rawDecs.forEach((d) => {
    const id = d.id || `${d.entity}::${d.text}`;
    dec[id] = {
      node: d.entity,
      text: d.text,
      type: d.type === "task" ? "task" : "decision",
      flagged: !!d.flagged,
      status: d.status || "open",
      snooze_until: d.snooze_until || null,
    };
  });
  const decsByNode = {};
  Object.entries(dec).forEach(([id, v]) => { (decsByNode[v.node] = decsByNode[v.node] || []).push(id); });

  // PARA block (Projects/Areas/Resources/Archive). Pass through as-is; a card's open
  // items are NOT embedded here — they live in open_decisions[] linked by entity == id,
  // so the UI reuses decsByNode[id]. Each entry: { id, label, open, done, body }
  // (resources also carry { count }). Default every section to an array.
  const p = (g && typeof g.para === "object" && g.para) ? g.para : {};
  const para = {
    projects: Array.isArray(p.projects) ? p.projects : [],
    areas: Array.isArray(p.areas) ? p.areas : [],
    resources: Array.isArray(p.resources) ? p.resources : [],
    archive: Array.isArray(p.archive) ? p.archive : [],
  };

  // REVIEW block (read-only nudge). The processor flags items for review and is the ONLY
  // thing that ever clears them; the app just surfaces them. Shape:
  //   review: { pending:int, items:[{id,text,reason,card,date}], last_reviewed:string|null }
  // Defensive: missing block/fields → empty; pending falls back to items.length.
  const rv = (g && typeof g.review === "object" && g.review) ? g.review : {};
  const reviewItems = Array.isArray(rv.items) ? rv.items : [];
  const review = {
    items: reviewItems,
    pending: Number.isFinite(rv.pending) ? rv.pending : reviewItems.length,
    last_reviewed: rv.last_reviewed || null,
  };

  return { nodes, links, name, summary, dec, decsByNode, para, review };
}

// The engine wants graph.json node/link shape with `connections` for sizing.
export function toEngineData(norm) {
  return {
    nodes: norm.nodes.map((n) => ({ id: n.id, label: n.label, type: n.kind, connections: n.connections })),
    links: norm.links.map(([source, target, label]) => ({ source, target, label })),
  };
}
