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
    connections: n.connections != null ? n.connections : (deg[n.id] || 0),
  }));
  const links = rawLinks.map((l) => [l.source, l.target, l.label || ""]);

  const name = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
  const summary = Object.fromEntries(nodes.map((n) => [n.id, n.summary]));

  // A decision's identity is (card + text) unless an explicit id is given, so
  // that resolving it stays stable across reloads and matches the resolved:
  // line the phone will append in Step 4.
  const dec = {};
  rawDecs.forEach((d) => {
    const id = d.id || `${d.card}::${d.text}`;
    dec[id] = { node: d.card, text: d.text, flagged: !!d.flagged, since: d.since || "" };
  });
  const decsByNode = {};
  Object.entries(dec).forEach(([id, v]) => { (decsByNode[v.node] = decsByNode[v.node] || []).push(id); });

  return { nodes, links, name, summary, dec, decsByNode };
}

// The engine wants graph.json node/link shape with `connections` for sizing.
export function toEngineData(norm) {
  return {
    nodes: norm.nodes.map((n) => ({ id: n.id, label: n.label, type: n.kind, connections: n.connections })),
    links: norm.links.map(([source, target, label]) => ({ source, target, label })),
  };
}
