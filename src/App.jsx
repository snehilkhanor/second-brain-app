import React, { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import ForceGraph3D from "3d-force-graph";
import { Brain, X, ArrowRight, Check, AlertTriangle, Plus, Zap, Sparkles, RotateCcw, ChevronDown, ChevronUp, Clock, GitBranch, Link2, Cloud, CloudOff, RefreshCw, Repeat, FileText, Inbox, Play, Hash } from "lucide-react";
import { loadConn, saveConn, disconnect as repoDisconnect, loadMirror, saveMirror, fetchGraphJson, appendToInbox, fetchInboxItems, requestProcess, normalize, toEngineData, lsGetJSON, lsSetJSON, DEFAULT_CONN } from "./repo.js";

// --- sample data (the design's demo brain) ----------------------------------
// Shown out of the box and whenever no token is connected. Once the user
// connects, the real graph.json from the private brain repo replaces it.
const NODES = [
  { id:"madlabs", label:"Mad Labs", kind:"hub" },
  { id:"trulymadly", label:"TrulyMadly", kind:"venture" },
  { id:"trumitr", label:"TruMitr", kind:"venture" },
  { id:"trymaira", label:"TryMaira", kind:"venture" },
  { id:"thirdman", label:"ThirdMan", kind:"venture" },
  { id:"snehil", label:"Snehil", kind:"person" },
  { id:"rushi", label:"Rushi", kind:"person" },
  { id:"sachin", label:"Sachin", kind:"person" },
  { id:"amit", label:"Amit", kind:"person" },
  { id:"unshaadi", label:"Unshaadi", kind:"org" },
  { id:"faff", label:"faff", kind:"rival" },
  { id:"crew", label:"Crew", kind:"rival" },
  { id:"hulp", label:"Hulp", kind:"rival" },
];
const LINKS = [
  ["madlabs","trulymadly","live line"],["madlabs","trumitr","live line"],["madlabs","trymaira","pipeline"],
  ["madlabs","thirdman","pipeline"],["madlabs","snehil","co-founder"],["madlabs","sachin","advisor"],
  ["madlabs","amit","co-founder"],["snehil","trulymadly","CEO"],["snehil","rushi","spouse"],
  ["snehil","unshaadi","advisor"],["rushi","unshaadi","founder"],["trumitr","trymaira","hosts AI Mitr"],
  ["thirdman","trumitr","built on gig net"],["thirdman","faff","competitor"],["thirdman","crew","competitor"],
  ["thirdman","hulp","competitor"],["trulymadly","trumitr","shares infra"],
];
const SUMMARY = {
  madlabs:"App studio — 'the lab is the real product.' 5-6 lines in 5 yrs to Rs1000Cr at 20% EBITDA.",
  trulymadly:"Serious dating app, 26+. FY26 Rs60Cr (5x YoY). Trust Score, 42% rejected.",
  trumitr:"Gig coaching, ~Rs9/min, ~200 workers, ~70% GM, ~600k mins/mo.",
  trymaira:"AI social universe (locked name). App in progress. Hosts the AI Mitr characters.",
  thirdman:"AI + human EA on the gig network. The persistent context layer is the moat.",
  snehil:"Founder & CEO of TrulyMadly; co-founder of Mad Labs.",
  rushi:"Wife; founder of Unshaadi.", sachin:"Advisor co-founder; active in Mad Labs ideation.",
  amit:"Co-founder; scores Mad Labs ideas.", unshaadi:"Rushi's company; appears in the spend pipeline.",
  faff:"Rs1,999/mo flat. No business work. Weak context, no agent layer.",
  crew:"Swiggy's concierge. Affluent, travel + lifestyle. Deep pockets.",
  hulp:"Delhi NCR family PA. Pod of 3, billed on coordination hours.",
};
const DEC = {
  d1:{node:"trulymadly", flagged:true, type:"decision", text:"Pull the 40+ gender ratio on TM MAU before committing to premium 40+."},
  d2:{node:"trulymadly", type:"task", text:"Test Twamev vs Tum Mile on ~40 real 40+ users."},
  d7:{node:"trulymadly", type:"decision", text:"Unified packaging: Select / Select Plus / VIP."},
  d3:{node:"thirdman", type:"decision", text:"Pricing fork: mass-prosumer vs premium CXO."},
  d4:{node:"thirdman", type:"decision", text:"Which AI primitives are reliable enough for a CXO today?"},
  d5:{node:"madlabs", type:"decision", text:"Incubate vs build vs partner for new lines."},
  d6:{node:"madlabs", type:"decision", text:"Fundraising path for TM / Mad Labs ($4-5M)."},
  d8:{node:"trumitr", type:"task", text:"Re-run the AI Mitr A/B after revenue-drop cause is understood."},
  d9:{node:"snehil", type:"decision", text:"Build a Founder's Office + Chief of Staff role."},
  d10:{node:"snehil", type:"task", text:"House purchase vs spend ceiling."},
};
const COL = { hub:0xF5B344, venture:0x8B7CFF, person:0x5BD6A8, org:0x5BD6A8, rival:0x6B7494 };
const HEX = { hub:"#F5B344", venture:"#8B7CFF", person:"#5BD6A8", org:"#5BD6A8", rival:"#6B7494" };

// The sample brain compiled into the brief's graph.json shape (same shape the
// real repo serves), so demo and live data flow through identical code paths.
const SAMPLE_GRAPH = (() => {
  const deg = {};
  LINKS.forEach(([s,t])=>{ deg[s]=(deg[s]||0)+1; deg[t]=(deg[t]||0)+1; });
  const openByNode = {};
  const itemsByNode = {};
  Object.values(DEC).forEach(d=>{ openByNode[d.node]=(openByNode[d.node]||0)+1; (itemsByNode[d.node]=itemsByNode[d.node]||[]).push(d); });
  // Synthesize a small demo card from each node's summary + open threads, so
  // "View full card" demonstrates in the no-token demo too.
  const demoCard = (n) => {
    const items = itemsByNode[n.id] || [];
    const decs = items.filter(d=>(d.type||"decision")==="decision").map(d=>"- "+d.text);
    const tasks = items.filter(d=>d.type==="task").map(d=>"- "+d.text);
    const sections = [];
    if(decs.length) sections.push("### Decisions\n"+decs.join("\n"));
    if(tasks.length) sections.push("### Tasks\n"+tasks.join("\n"));
    const open = sections.length ? "\n\n## Open threads\n\n"+sections.join("\n\n") : "";
    return `# ${n.label}\n\n${SUMMARY[n.id]||""}${open}`;
  };
  return {
    nodes: NODES.map(n=>({ id:n.id, label:n.label, type:n.kind, summary:SUMMARY[n.id]||"", connections:deg[n.id]||0, open_decisions:openByNode[n.id]||0, card:demoCard(n) })),
    links: LINKS.map(([source,target,label])=>({ source, target, label })),
    open_decisions: Object.entries(DEC).map(([id,d])=>({ id, entity:d.node, text:d.text, type:d.type||"decision", flagged:!!d.flagged, status:"open", snooze_until:null })),
  };
})();

function textSprite(text, color, bold) {
  const c=document.createElement("canvas"); const x=c.getContext("2d"); const f=26;
  x.font=`${bold?700:600} ${f}px monospace`; c.width=x.measureText(text).width+16; c.height=f+12;
  x.font=`${bold?700:600} ${f}px monospace`; x.fillStyle=color; x.textBaseline="middle"; x.fillText(text,8,c.height/2);
  const t=new THREE.CanvasTexture(c); t.minFilter=THREE.LinearFilter;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));
  s.scale.set(c.width/9,c.height/9,1); return s;
}
function badgeSprite(n){
  const c=document.createElement("canvas"); c.width=c.height=64; const x=c.getContext("2d");
  x.beginPath(); x.arc(32,32,28,0,7); x.fillStyle="#F5B344"; x.fill();
  x.fillStyle="#0E1424"; x.font="700 38px monospace"; x.textAlign="center"; x.textBaseline="middle"; x.fillText(String(n),32,34);
  const t=new THREE.CanvasTexture(c);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));
  s.scale.set(9,9,1); s.userData={count:n}; return s;
}

// Collapse redundant queued actions on the same item before writing:
//  - resolve/snooze are terminal — the LAST one supersedes every earlier action
//    on that item (earlier converts/snoozes are dropped).
//  - converts with no terminal cancel in pairs — keep one only if the count is
//    odd (the last convert carries the net final type); an even count writes
//    nothing. (e.g. convert→task then convert→decision == no convert line.)
// Captures and any untargeted items are always kept, in order. Returns the items
// to actually write (in original order); the rest are no-ops to drop.
function collapseOutbox(queue){
  const keep=new Array(queue.length).fill(false);
  const groups=new Map();
  queue.forEach((it,i)=>{
    if(!it.target){ keep[i]=true; return; }
    if(!groups.has(it.target)) groups.set(it.target,[]);
    groups.get(it.target).push(i);
  });
  for(const idxs of groups.values()){
    let lastTerminal=-1;
    idxs.forEach((qi,k)=>{ const knd=queue[qi].kind; if(knd==="resolved"||knd==="snooze") lastTerminal=k; });
    if(lastTerminal>=0) keep[idxs[lastTerminal]]=true;        // terminal supersedes earlier actions
    else if(idxs.length%2===1) keep[idxs[idxs.length-1]]=true; // odd # of converts → net one; even → none
  }
  return queue.filter((_,i)=>keep[i]);
}

export default function App() {
  const mountRef=useRef(null);
  const [mode,setMode]=useState("glow");          // glow | badge
  const [brainOpen,setBrainOpen]=useState(true);
  const [selected,setSelected]=useState(null);
  const [resolved,setResolved]=useState(()=>lsGetJSON("sb_res",{}));
  const [captures,setCaptures]=useState(()=>lsGetJSON("sb_cap",[]));
  const [outbox,setOutbox]=useState(()=>lsGetJSON("sb_outbox",[]));   // writes not yet pushed
  const [syncing,setSyncing]=useState(false);                        // a flush is in flight
  const [draft,setDraft]=useState("");
  const [openDec,setOpenDec]=useState(null);
  const [outcome,setOutcome]=useState("");
  const [toast,setToast]=useState(null);

  // --- repo connection + graph data ----------------------------------------
  const [conn,setConn]=useState(loadConn);                       // { token, owner, repo, branch }
  const [graph,setGraph]=useState(()=> loadMirror() || SAMPLE_GRAPH);
  const [status,setStatus]=useState(()=> loadConn().token ? {state:"idle"} : {state:"demo"});
  const [showSettings,setShowSettings]=useState(false);
  const [form,setForm]=useState(null);                           // settings-sheet draft
  const [itemFilter,setItemFilter]=useState("all");              // all | decision | task (TYPE)
  const [statusFilter,setStatusFilter]=useState("open");         // open | snoozed | resolved (STATUS — separate axis)
  const [types,setTypes]=useState(()=>lsGetJSON("sb_types",{}));   // local convert overrides: id -> type
  const [snoozes,setSnoozes]=useState(()=>lsGetJSON("sb_snooze",{})); // local snoozes: id -> until ISO
  const [cardOpen,setCardOpen]=useState(false);                  // "view full card" toggle
  const [inboxItems,setInboxItems]=useState(()=>{ const v=lsGetJSON("sb_inbox",[]); return Array.isArray(v)?v:[]; }); // raw waiting lines from inbox.md
  const [showProcess,setShowProcess]=useState(false);            // inbox/process sheet

  const norm=useMemo(()=>normalize(graph),[graph]);

  const selRef=useRef(null), modeRef=useRef("glow"), resRef=useRef({}), resizeRef=useRef(null);
  const lastProcessedRef=useRef(lsGetJSON("sb_lp",null)); // last-seen stats.lines_processed (for the reward toast)
  const normRef=useRef(norm), refsRef=useRef({}), graphObjRef=useRef(null), activeRef=useRef(null);
  const outboxRef=useRef(outbox), flushing=useRef(false), openCountRef=useRef({}), flushTimer=useRef(null);
  useEffect(()=>{ setCardOpen(false); },[selected]);   // collapse "full card" when switching nodes

  const persist=(k,v)=>lsSetJSON(k,v);                         // on-device storage
  // Update the ref synchronously so flushOutbox(), called right after, sees the
  // fresh queue (the [outbox] effect below only runs after the next render).
  const setOutboxP=(arr)=>{ outboxRef.current=arr; setOutbox(arr); lsSetJSON("sb_outbox",arr); };
  useEffect(()=>{outboxRef.current=outbox;},[outbox]);
  useEffect(()=>{selRef.current=selected;},[selected]);
  useEffect(()=>{modeRef.current=mode;},[mode]);
  useEffect(()=>{resRef.current=resolved;},[resolved]);
  useEffect(()=>{ const t=setTimeout(()=>resizeRef.current&&resizeRef.current(),70); return ()=>clearTimeout(t); },[brainOpen]);

  // Read the brain repo: pull fresh graph.json, render it, refresh the mirror.
  async function refresh(c=conn){
    if(!c.token){ setStatus({state:"demo"}); return; }
    setStatus({state:"loading"});
    try{
      const { graph:g } = await fetchGraphJson(c);
      setGraph(g); saveMirror(g);
      reconcileProcessing(g);
      setStatus({state:"ok", at:Date.now()});
    }catch(e){
      setStatus({state:"error", msg:e.message||String(e)});
    }
  }
  // PROCESSING REWARD: stats.lines_processed is cumulative inbox lines the processor
  // has cleared. On each fresh graph.json, if it grew since we last saw it, toast the
  // delta and the momentum it earned. First sighting just sets the baseline (no toast,
  // so reconnecting/old data never fires a spurious reward).
  function reconcileProcessing(g){
    const lp = (g && g.stats && Number(g.stats.lines_processed)) || 0;
    const prev = lastProcessedRef.current;
    if(prev==null){ lastProcessedRef.current=lp; lsSetJSON("sb_lp",lp); return; }
    if(lp>prev){
      const delta=lp-prev;
      showToast(`Processed ${delta} item${delta===1?"":"s"} · +${delta*4} momentum`);
      lastProcessedRef.current=lp; lsSetJSON("sb_lp",lp);
    }
  }
  // Pull the live inbox.md waiting-count and mirror it for instant/offline load.
  // Demo / disconnected → 0. Errors are swallowed (keep the last mirrored value).
  async function refreshInbox(c=conn){
    if(!c.token){ setInboxItems([]); lsSetJSON("sb_inbox",[]); return; }
    try{ const items=await fetchInboxItems(c); setInboxItems(items); lsSetJSON("sb_inbox",items); }catch{}
  }
  // On launch: if connected, refresh graph + inbox count in the background
  // (the mirrors already show instantly).
  useEffect(()=>{ if(conn.token){ refresh(conn); refreshInbox(conn); } },[]); // eslint-disable-line

  // Manual refresh button (replaces pull-to-refresh, which yanks the OS shade in a
  // standalone PWA). Full reload: picks up a newly deployed app version, and data
  // re-pulls on launch (graph.json + inbox). Outbox/queue/state persist in
  // localStorage, so a reload is safe and loses nothing unsynced.
  function doRefresh(){ window.location.reload(); }

  // Outbox flush. Single-flight: only ONE flush runs at a time; actions that fire
  // mid-flush just enqueue and the running loop picks them up. Each pass:
  //  - collapses redundant same-item actions to their NET result,
  //  - drops the no-op items immediately,
  //  - writes the remaining distinct lines in ONE batched commit,
  //  - on a confirmed 2xx removes them; on terminal failure (retries exhausted)
  //    marks them "failed" so we stop retrying silently — the user can tap retry.
  // Items never silently vanish: written only on 2xx, otherwise queued or failed.
  async function flushOutbox(c=conn){
    if(flushing.current || !c.token || !navigator.onLine) return;
    flushing.current=true; setSyncing(true);
    try{
      while(true){
        const q=outboxRef.current;
        const pending=q.filter(it=>!it.failed);            // skip items already marked failed
        if(!pending.length) break;
        const kept=collapseOutbox(pending);                // net actions to actually write
        const keptIds=new Set(kept.map(it=>it.id));
        const dropIds=new Set(pending.filter(it=>!keptIds.has(it.id)).map(it=>it.id)); // cancelled/superseded no-ops
        if(dropIds.size) setOutboxP(outboxRef.current.filter(it=>!dropIds.has(it.id)));
        if(!kept.length) continue;
        try{
          await appendToInbox(c, kept.map(it=>it.line), `app: sync (${kept.length})`);   // ONE batched commit
          setOutboxP(outboxRef.current.filter(it=>!keptIds.has(it.id)));                  // confirmed 2xx → remove
        }catch(e){
          const tag=e.status?`HTTP ${e.status}`:String(e.message||e);
          setOutboxP(outboxRef.current.map(it=> keptIds.has(it.id) ? {...it,failed:true,err:tag} : it)); // surface stall
          break;
        }
      }
    } finally { flushing.current=false; setSyncing(false); }
  }
  // Clear failed flags and try again (used by the "tap to retry" affordance).
  const retryFailed=()=>{ setOutboxP(outboxRef.current.map(it=> it.failed ? {...it,failed:false,err:undefined} : it)); flushOutbox(); };
  // Flush on launch and whenever the device comes back online.
  useEffect(()=>{
    const onOnline=()=>flushOutbox();
    window.addEventListener("online",onOnline);
    flushOutbox();
    return ()=>window.removeEventListener("online",onOnline);
  },[conn.token]); // eslint-disable-line

  function openSettings(){ setForm({ token:conn.token, owner:conn.owner, repo:conn.repo, branch:conn.branch }); setShowSettings(true); }
  function saveSettings(){
    const c={ token:(form.token||"").trim(), owner:(form.owner||"").trim()||DEFAULT_CONN.owner, repo:(form.repo||"").trim()||DEFAULT_CONN.repo, branch:(form.branch||"").trim()||DEFAULT_CONN.branch };
    saveConn(c); setConn(c); setShowSettings(false); refresh(c); refreshInbox(c);
  }
  function doDisconnect(){
    repoDisconnect();
    const c={ ...conn, token:"" }; setConn(c);
    setGraph(SAMPLE_GRAPH); setStatus({state:"demo"}); setShowSettings(false);
    setInboxItems([]); lsSetJSON("sb_inbox",[]);
  }

  const today=()=>new Date().toISOString().slice(0,10);
  const todayStr=today();

  // Local overlays. convert -> type override; snooze -> hidden until a date.
  // A snoozed item whose date is today-or-past is treated as OPEN again (contract).
  const effType=(id)=> types[id] || norm.dec[id]?.type || "decision";
  const snoozeUntil=(id)=> snoozes[id] || norm.dec[id]?.snooze_until || null;
  const isSnoozedFuture=(id)=>{ const u=snoozeUntil(id); return !!u && u > todayStr; };
  const isActiveOpen=(id)=> !resolved[id] && !isSnoozedFuture(id);
  // STATUS bucket (mutually exclusive): resolved wins over snoozed wins over open.
  // An item snoozed only until today-or-past is NOT snoozed → it's open again.
  const statusOf=(id)=> resolved[id] ? "resolved" : isSnoozedFuture(id) ? "snoozed" : "open";

  const resolvedCount=Object.keys(resolved).length, captureCount=captures.length;
  const openCountTotal=Object.keys(norm.dec).filter(isActiveOpen).length;
  // Inbox preview: real waiting lines from inbox.md when connected; in demo there's
  // no remote inbox, so show the local captured thoughts (newest last, file order).
  const inboxList = conn.token ? inboxItems : captures.map(c=>c.t).slice().reverse();
  const inboxCount = inboxList.length;

  // Per-node count of active-open items (drives glow/badge); snooze-aware.
  const openCountByNode=useMemo(()=>{
    const m={};
    Object.keys(norm.dec).forEach(id=>{ if(isActiveOpen(id)){ const n=norm.dec[id].node; m[n]=(m[n]||0)+1; } });
    return m;
  },[norm,resolved,snoozes,todayStr]); // eslint-disable-line
  useEffect(()=>{ openCountRef.current=openCountByNode; },[openCountByNode]);

  // Momentum: entity*2 + connection*3 + decision_resolved*30 + task_done*50 + capture*8 + lines_processed*4
  let decResolved=0, taskDone=0;
  Object.keys(resolved).forEach(id=>{ effType(id)==="task" ? taskDone++ : decResolved++; });
  const linesProcessed=(graph && graph.stats && Number(graph.stats.lines_processed)) || 0;
  const momentum=norm.nodes.length*2+norm.links.length*3+decResolved*30+taskDone*50+captureCount*8+linesProcessed*4;
  const level=Math.floor(momentum/60)+1, intoLevel=momentum%60, pct=Math.round(intoLevel/60*100);

  const showToast=(msg,undo)=>{setToast({msg,undo}); setTimeout(()=>setToast(null),4000);};
  // Coalesce same-item actions SYNCHRONOUSLY in the queue, so a burst collapses to
  // its net regardless of flush timing (the queue never holds redundant same-item
  // actions — fixing the case where human-paced taps each flushed alone):
  //  - a new convert cancels a pending convert on the same item (pair → net none);
  //    a pending terminal supersedes it, so the convert is dropped.
  //  - a new snooze/resolve (terminal) removes any pending action for that item,
  //    then is added — terminal supersedes earlier converts/snoozes.
  //  - captures (no target) are always appended.
  // Then a trailing debounce (reset on each action) keeps a quick-succession burst
  // queued together before the single batched write. Sync now / retry flush immediately.
  const enqueue=(item)=>{
    let q=[...outboxRef.current];
    if(item.target){
      if(item.kind==="convert"){
        const hasTerminal=q.some(x=>x.target===item.target && (x.kind==="resolved"||x.kind==="snooze"));
        const ci=q.findIndex(x=>x.target===item.target && x.kind==="convert");
        if(hasTerminal){ /* terminal already pending → drop this convert */ }
        else if(ci>=0){ q.splice(ci,1); }        // two converts cancel → net no convert line
        else { q.push(item); }
      } else {                                    // resolved / snooze (terminal)
        q=q.filter(x=>x.target!==item.target);    // supersede any pending action on this item
        q.push(item);
      }
    } else {
      q.push(item);                               // capture
    }
    setOutboxP(q);
    if(flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current=setTimeout(()=>{ flushTimer.current=null; flushOutbox(); }, 1200);
  };

  // Resolve a decision: instant local glow/badge drop, then append a structured
  // resolved: line to inbox.md. The real card rewrite happens later in processing.
  const resolve=(id)=>{
    const d=norm.dec[id]; const oc=outcome.trim();
    const next={...resolved,[id]:{ts:Date.now(),outcome:oc}};
    setResolved(next);persist("sb_res",next);setOpenDec(null);setOutcome("");
    const item={id:"r_"+id, target:id, kind:"resolved", ts:Date.now(), message:"app: resolve decision",
      line:`resolved: [[${d?.node}]] | "${d?.text}" → ${oc||"resolved"} | ${today()}`};
    if(conn.token) enqueue(item);
    showToast(conn.token?"Resolved + 30":"Resolved + 30 (demo)",()=>{
      const r={...next};delete r[id];setResolved(r);persist("sb_res",r);
      setOutboxP(outboxRef.current.filter(x=>x.id!==item.id));   // pull the line back if not yet sent
      setToast(null);});
  };
  const reopen=(id)=>{const r={...resolved};delete r[id];setResolved(r);persist("sb_res",r);};

  // Capture a thought: optimistic local add, then append the raw line to inbox.md.
  const capture=()=>{
    const t=draft.trim();if(!t)return;
    const next=[{t,ts:Date.now()},...captures];
    setCaptures(next);persist("sb_cap",next);setDraft("");
    if(!conn.token){ showToast("Captured (demo — connect to save)"); return; }
    enqueue({id:"c_"+Date.now(), kind:"thought", ts:Date.now(), message:"app: capture", line:t});
    setInboxItems(prev=>{ const v=[...prev,t]; lsSetJSON("sb_inbox",v); return v; });   // optimistic append (a refetch would lag the write)
    showToast(navigator.onLine?"Captured to inbox":"Saved — will sync when online");
  };

  // Convert an item decision<->task: optimistic local override + append a convert line.
  const convert=(id)=>{
    const d=norm.dec[id]; if(!d) return;
    const nextType=effType(id)==="task"?"decision":"task";
    const nt={...types,[id]:nextType}; setTypes(nt); persist("sb_types",nt);
    if(conn.token) enqueue({id:"v_"+id+"_"+Date.now(), target:id, kind:"convert", ts:Date.now(), message:"app: convert",
      line:`convert: [[${d.node}]] | "${d.text}" → ${nextType} | ${today()}`});
    showToast(`Now a ${nextType}${conn.token?"":" (demo)"}`);
  };

  // Snooze an item until a date: optimistic local hide + append a snooze line.
  const snooze=(id,until)=>{
    const d=norm.dec[id]; if(!d||!until) return;
    const ns={...snoozes,[id]:until}; setSnoozes(ns); persist("sb_snooze",ns); setOpenDec(null);
    if(conn.token) enqueue({id:"s_"+id+"_"+Date.now(), target:id, kind:"snooze", ts:Date.now(), message:"app: snooze",
      line:`snooze: [[${d.node}]] | "${d.text}" → until ${until} | ${today()}`});
    showToast(`Snoozed to ${until}${conn.token?"":" (demo)"}`);
  };

  // Wake a snoozed item now: optimistic local un-snooze (mark snooze=today, which
  // reads as past → open again, overriding any server snooze_until) + append a
  // wake line. The processor turns this into status:open on the next run.
  const wakeNow=(id)=>{
    const d=norm.dec[id]; if(!d) return;
    const ns={...snoozes,[id]:today()}; setSnoozes(ns); persist("sb_snooze",ns); setOpenDec(null);
    if(conn.token) enqueue({id:"w_"+id+"_"+Date.now(), target:id, kind:"wake", ts:Date.now(), message:"app: wake",
      line:`wake: [[${d.node}]] | "${d.text}" → open | ${today()}`});
    showToast(`Woke now${conn.token?"":" (demo)"}`);
  };

  // Link styling helpers — read the live "active" set (selected node + neighbours).
  const endpointId=(e)=> (typeof e==="object"&&e)?e.id:e;
  const linkIsActive=(l)=>{ const a=activeRef.current; return a && a.has(endpointId(l.source)) && a.has(endpointId(l.target)); };
  const linkColorFor=(l)=>{ const a=activeRef.current; if(!a) return "#8B7CFF"; return linkIsActive(l)?"#C9BFFF":"#39406A"; };
  const linkWidthFor=(l)=>{ const a=activeRef.current; if(!a) return 0.5; return linkIsActive(l)?1.6:0.25; };

  // Recompute the active set on selection/data change and refresh link styling
  // (re-applying the accessors makes 3d-force-graph re-evaluate every link).
  useEffect(()=>{
    let act=null;
    if(selected){ act=new Set([selected]); norm.links.forEach(([s,t])=>{ if(s===selected)act.add(t); if(t===selected)act.add(s); }); }
    activeRef.current=act;
    const G=graphObjRef.current; if(G){ G.linkColor(linkColorFor).linkWidth(linkWidthFor); }
  },[selected,norm]); // eslint-disable-line

  // --- 3D engine: created once; data synced separately when it changes -------
  useEffect(()=>{
    const mount=mountRef.current; if(!mount) return;

    // One node's visual — ported verbatim from the design: glowing core sized by
    // connections, type-coloured halo, amber alert halo, label sprite, count badge.
    function makeNode(node){
      const col=COL[node.type] ?? COL.rival;
      const r=4+(node.connections||1)*1.8; const ng=new THREE.Group();
      const core=new THREE.Mesh(new THREE.SphereGeometry(r,20,20),
        new THREE.MeshPhongMaterial({color:col,emissive:col,emissiveIntensity:0.5,shininess:60,transparent:true,opacity:1}));
      core.userData={id:node.id,r}; ng.add(core);
      const typeHalo=new THREE.Mesh(new THREE.SphereGeometry(r*1.7,16,16),
        new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.1,blending:THREE.AdditiveBlending,depthWrite:false})); ng.add(typeHalo);
      const alertHalo=new THREE.Mesh(new THREE.SphereGeometry(r*2.1,16,16),
        new THREE.MeshBasicMaterial({color:0xF5B344,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false})); ng.add(alertHalo);
      const label=textSprite(node.label,"#AEB7D4",false); label.position.set(0,r+7,0); ng.add(label);
      const badge=badgeSprite(0); badge.position.set(r*1.1,r*1.1,0); badge.visible=false; ng.add(badge);
      refsRef.current[node.id]={ng,core,typeHalo,alertHalo,badge,r};
      return ng;
    }

    // The 3d-force-graph engine: it owns physics, camera, orbit drag and pinch-zoom.
    const Graph=ForceGraph3D({controlType:"orbit"})(mount)
      .backgroundColor("rgba(0,0,0,0)")     // transparent so the CSS radial gradient shows through
      .showNavInfo(false)
      .nodeThreeObject(makeNode)
      .nodeLabel(()=>"")                     // labels are sprites; suppress the hover tooltip
      // Obsidian-style links: visible by default; on selection, the selected
      // node's links brighten and thicken while the rest recede.
      .linkColor(linkColorFor)
      .linkWidth(linkWidthFor)
      .linkOpacity(0.6)
      .enableNodeDrag(false)   // match the design: drag rotates the cloud, tap selects a node
      .onNodeClick(n=>setSelected(n.id))
      .onBackgroundClick(()=>setSelected(null));
    graphObjRef.current=Graph;

    // Keep the cloud tight, like the design's hand-tuned springs.
    Graph.d3Force("charge").strength(-160);
    Graph.d3Force("link").distance(46);

    // The design's two coloured point lights for rim glow.
    const scene=Graph.scene();
    const l1=new THREE.PointLight(0x8B7CFF,0.8); l1.position.set(120,120,120); scene.add(l1);
    const l2=new THREE.PointLight(0xF5B344,0.5); l2.position.set(-120,-80,80); scene.add(l2);
    Graph.cameraPosition({z:210});

    // Obsidian-style auto-spin until the user grabs the graph or selects a node.
    const controls=Graph.controls();
    controls.autoRotate=true; controls.autoRotateSpeed=0.6;

    // Per-frame decoration: glow pulse, badge counts, selection enlarge — driven
    // by the live (resolve-aware) open-decision count, exactly as in the design.
    let raf, clock=0;
    function decorate(){
      raf=requestAnimationFrame(decorate); clock+=0.05;
      const md=modeRef.current, sel=selRef.current, n0=normRef.current;
      controls.autoRotate = !sel;
      const act=activeRef.current;   // null = nothing selected; otherwise selected + neighbours
      n0.nodes.forEach(n=>{
        const R=refsRef.current[n.id]; if(!R) return;
        const open=openCountRef.current[n.id]||0;   // active-open count (resolve- and snooze-aware)
        const isSel=sel===n.id; const ts=isSel?1.5:1;
        const dim = act && !act.has(n.id);   // a node is dimmed when it's outside the selection's neighbourhood
        R.core.scale.lerp(new THREE.Vector3(ts,ts,ts),0.2);
        // Fade dimmed nodes' bodies and labels; connected nodes stay full-strength.
        R.core.material.opacity += ((dim?0.18:1) - R.core.material.opacity)*0.2;
        R.ng.children.forEach(ch=>{ if(ch.isSprite && ch!==R.badge) ch.material.opacity += ((dim?0.12:1) - ch.material.opacity)*0.2; });
        const lit = dim?0.18:1;
        if(md==="glow"){ R.badge.visible=false; R.typeHalo.material.opacity=0.1*lit;
          const pulse=0.12+0.10*Math.sin(clock*1.4);
          R.alertHalo.material.opacity = (open>0 ? pulse : 0)*lit;
          R.core.material.emissiveIntensity = (isSel?1.0:(open>0?0.85:0.5))*(dim?0.3:1);
        } else { R.alertHalo.material.opacity=0; R.typeHalo.material.opacity=0; R.core.material.emissiveIntensity=(isSel?0.9:0.32)*(dim?0.3:1);
          if(open>0&&!dim){ if(R.badge.userData.count!==open){ R.ng.remove(R.badge); const b=badgeSprite(open);
              b.position.set(R.r*1.1,R.r*1.1,0); R.ng.add(b); R.badge=b; } R.badge.visible=true; }
          else R.badge.visible=false;
        }
      });
    }
    decorate();

    function rs(){const W=mount.clientWidth,H=mount.clientHeight; if(W===0||H===0) return; Graph.width(W).height(H);}
    rs(); resizeRef.current=rs;
    const ro=new ResizeObserver(()=>rs()); ro.observe(mount);

    return ()=>{ cancelAnimationFrame(raf); ro.disconnect(); Graph._destructor(); graphObjRef.current=null; };
  },[]);

  // Push the current (demo or live) graph into the engine whenever it changes.
  useEffect(()=>{
    normRef.current=norm;
    const Graph=graphObjRef.current; if(!Graph) return;
    refsRef.current={};                         // drop stale node objects; makeNode repopulates
    Graph.graphData(toEngineData(norm));
  },[norm]);

  const node=selected?norm.nodes.find(n=>n.id===selected):null;
  const neighbors=selected?norm.links.filter(l=>l[0]===selected||l[1]===selected).map(l=>{const o=l[0]===selected?l[1]:l[0];return{id:o,rel:l[2],label:norm.name[o]};}):[];
  const nodeDecs=selected?(norm.decsByNode[selected]||[]).filter(id=>!isSnoozedFuture(id)).map(id=>({id,...norm.dec[id]})):[];
  // The list shows ONE status bucket at a time (Open / Snoozed / Resolved), then
  // the TYPE filter narrows that bucket. Flagged items float to the top.
  const allDecs=Object.entries(norm.dec).map(([id,v])=>({id,...v}))
    .filter(d=> statusOf(d.id)===statusFilter)
    .filter(d=> itemFilter==="all" || effType(d.id)===itemFilter)
    .sort((a,b)=> (b.flagged?1:0)-(a.flagged?1:0));
  // TYPE-filter counts reflect the CURRENT status view, so the numbers match the
  // list (e.g. status=Snoozed → counts are of snoozed items only).
  const fCount={all:0,decision:0,task:0};
  Object.keys(norm.dec).forEach(id=>{ if(statusOf(id)!==statusFilter) return; fCount.all++; fCount[effType(id)]++; });
  // Status-tab counts: cross-filtered by the active TYPE filter, so the two
  // controls stay mutually consistent (each shows totals for the other's slice).
  const sCount={open:0,snoozed:0,resolved:0};
  Object.keys(norm.dec).forEach(id=>{ if(itemFilter!=="all" && effType(id)!==itemFilter) return; sCount[statusOf(id)]++; });

  // PROCESS-SAFETY GUARD: only safe to request a processing pass once everything is
  // synced (else the processor won't see still-queued actions and items can briefly
  // reappear as open until they sync and you reprocess). The "Process now" button is
  // gated on `canProcess`; while false the sheet says "Finish syncing first — N pending"
  // and the amber "N pending sync" indicator stays in the BRAIN strip.
  const canProcess = outbox.length===0 && !syncing;

  // Request a processing pass: drop a `process-request` marker the brain processor
  // honours on its next SessionStart. Demo (no token) → explainer toast, no write.
  async function processNow(){
    if(!conn.token){ showToast("Connect your brain to process — it runs in your processor."); setShowProcess(false); return; }
    if(!canProcess){ showToast(`Finish syncing first — ${outbox.length} pending`); return; }
    try{
      await requestProcess(conn, `${new Date().toISOString()}\nsource: app\n`);
      setShowProcess(false);
      showToast("Process requested — open your brain processor and it'll run, then clear this.");
    }catch(e){ showToast(`Couldn't request — ${e.message||e}`); }
  }

  // Sync indicator (BRAIN strip): syncing… / N failed — tap to retry / N pending sync.
  const failedCount=outbox.filter(it=>it.failed).length;
  const pendingCount=outbox.length-failedCount;
  const firstErr=(outbox.find(it=>it.failed)||{}).err;
  const syncUI = syncing ? {txt:"syncing…", color:"#F5B344", onTap:null}
    : failedCount>0 ? {txt:`${failedCount} failed${firstErr?` (${firstErr})`:""} — tap to retry`, color:"#F87171", onTap:retryFailed}
    : pendingCount>0 ? {txt:`${pendingCount} pending sync · sync now`, color:"#F5B344", onTap:()=>flushOutbox()}
    : null;

  // connection status pill (header button)
  const st=status.state;
  const statusUI = st==="ok"   ? {icon:<Cloud size={16}/>, color:"#5BD6A8", label:"synced"}
                 : st==="loading"?{icon:<RefreshCw size={16} className="spin"/>, color:"#8B7CFF", label:"syncing"}
                 : st==="error"  ?{icon:<AlertTriangle size={16}/>, color:"#F5B344", label:"error"}
                 :                {icon:<CloudOff size={16}/>, color:"#6B7494", label:"demo"};

  const css=`
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0}
  .wrap{position:fixed;inset:0;display:flex;flex-direction:column;background:#0A0F1C;font-family:'Inter',sans-serif;color:#E8ECF7}
  .disp{font-family:'Space Grotesk',sans-serif}.mono{font-family:'JetBrains Mono',monospace}
  .hd{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px;flex-shrink:0}
  .phead{display:flex;justify-content:space-between;align-items:center;padding:4px 16px 10px;cursor:pointer;flex-shrink:0;border-bottom:1px solid #1B2440}
  .brain{position:relative;flex:1;min-height:0;background:radial-gradient(circle at 50% 42%,#141C30,#0A0F1C 72%)}
  .brain.hidden{display:none}
  .legend{position:absolute;top:12px;left:14px;z-index:3;display:flex;flex-direction:column;gap:7px;pointer-events:none}
  .legend .row{display:flex;align-items:center;gap:6px;font-size:12px;color:#8A94B0}
  .key{display:flex;gap:10px;margin-top:4px}
  .key span{display:flex;align-items:center;gap:4px;font-size:9px;color:#6B7494}
  .dot{width:7px;height:7px;border-radius:50%}
  .seg{display:flex;background:#0E1424;border:1px solid #2A3556;border-radius:99px;padding:3px}
  .seg button{background:transparent;border:none;color:#8A94B0;font-size:11px;padding:5px 12px;border-radius:99px;font-weight:600;cursor:pointer}
  .seg button.on{background:#8B7CFF;color:#0E1424}
  .tabs{display:flex;gap:22px}
  .stab{background:transparent;border:none;margin-bottom:-1px;padding:2px 0 7px;font-size:11.5px;font-weight:600;cursor:pointer;color:#5C678C;border-bottom:2px solid transparent;display:flex;align-items:center;gap:5px}
  .stab.on{color:#E8ECF7;border-bottom-color:#8B7CFF}
  .stab .n{font-family:'JetBrains Mono',monospace;font-size:10px;color:#46506F}
  .stab.on .n{color:#8B7CFF}
  .conn{display:flex;align-items:center;gap:5px;background:#0E1424;border:1px solid #2A3556;border-radius:99px;padding:6px 11px;cursor:pointer;font-size:11px;font-weight:600}
  .dash{flex:1;overflow-y:auto;padding:14px 16px 20px}
  .dash.hidden{display:none}
  .capbar{flex-shrink:0;display:flex;gap:8;padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));background:#0E1424;border-top:1px solid #232C46}
  .card{background:#161E33;border:1px solid #232C46;border-radius:16px;margin-bottom:13px}
  .tap{transition:all .15s;cursor:pointer}.tap:active{transform:scale(.97)}
  .sheet{position:absolute;left:0;right:0;bottom:0;background:#141B30;border-top:1px solid #2A3556;border-radius:20px 20px 0 0;padding:18px 18px 26px;box-shadow:0 -10px 40px rgba(0,0,0,.55);animation:up .26s cubic-bezier(.2,.8,.2,1);max-height:82%;overflow-y:auto;z-index:8}
  @keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}
  .fld{width:100%;background:#0E1424;border:1px solid #232C46;border-radius:10px;color:#E8ECF7;padding:11px 12px;font-size:13px;outline:none;font-family:'JetBrains Mono',monospace}
  .lbl{font-size:10px;color:#8A94B0;letter-spacing:.08em;margin:12px 0 5px;text-transform:uppercase}
  .chip{font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700}
  .exp{animation:fade .2s}@keyframes fade{from{opacity:0}to{opacity:1}}
  .toast{animation:rise .25s}@keyframes rise{from{transform:translate(-50%,12px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
  input,textarea{font-family:'Inter'}
  `;

  return (
    <div className="wrap">
      <style>{css}</style>
      <div className="hd">
        <div onClick={()=>setShowProcess(true)} className="tap" style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} title={`${inboxCount} in inbox`}>
          <span style={{position:"relative",display:"flex"}}>
            <Brain size={20} color="#8B7CFF"/>
            {inboxCount>0&&<span className="mono" style={{position:"absolute",top:-7,right:-9,background:"#F5B344",color:"#0E1424",fontSize:9,fontWeight:700,minWidth:15,height:15,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",border:"2px solid #0A0F1C",lineHeight:1}}>{inboxCount}</span>}
          </span>
          <span className="disp" style={{fontWeight:700,fontSize:17}}>second brain</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="conn" onClick={openSettings} style={{color:statusUI.color}}>{statusUI.icon}<span>{statusUI.label}</span></button>
          <button className="conn" onClick={doRefresh} title="Refresh" aria-label="Refresh" style={{color:"#8A94B0",padding:"6px 9px"}}><RefreshCw size={16} className={status.state==="loading"?"spin":""}/></button>
          <div className="seg">
            <button className={mode==="glow"?"on":""} onClick={()=>setMode("glow")} title="Glow" aria-label="Glow" style={{display:"flex",alignItems:"center"}}><Sparkles size={15}/></button>
            <button className={mode==="badge"?"on":""} onClick={()=>setMode("badge")} title="Badge" aria-label="Badge" style={{display:"flex",alignItems:"center"}}><Hash size={15}/></button>
          </div>
        </div>
      </div>

      <div className="phead" onClick={()=>setBrainOpen(o=>!o)}>
        <span className="mono" style={{fontSize:11,color:"#8A94B0"}}>BRAIN · {norm.nodes.length} nodes · <span style={{color:"#F5B344"}}>{openCountTotal} open</span>{syncUI&&<span onClick={(e)=>{e.stopPropagation(); syncUI.onTap&&syncUI.onTap();}} className="tap" style={{color:syncUI.color,fontWeight:600}}> · {syncUI.txt}</span>}</span>
        <span className="tap mono" style={{display:"flex",alignItems:"center",gap:5,color:"#8A94B0",fontSize:11}}>
          {brainOpen?"collapse":"expand"} {brainOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
        </span>
      </div>

      <div className={"brain"+(brainOpen?"":" hidden")}>
        <div className="legend">
          <div className="row"><GitBranch size={13}/> {norm.nodes.length}</div>
          <div className="row"><Link2 size={13}/> {norm.links.length}</div>
          <div className="key">
            <span><span className="dot" style={{background:"#F5B344"}}/>hub</span>
            <span><span className="dot" style={{background:"#8B7CFF"}}/>venture</span>
          </div>
          <div className="key">
            <span><span className="dot" style={{background:"#5BD6A8"}}/>people</span>
            <span><span className="dot" style={{background:"#6B7494"}}/>rivals</span>
          </div>
        </div>
        <div ref={mountRef} style={{position:"absolute",inset:0}}/>
        {!selected&&<div className="mono" style={{position:"absolute",bottom:10,left:0,right:0,textAlign:"center",fontSize:10,color:"#5C678C",pointerEvents:"none"}}>drag · pinch · tap a node · {mode==="glow"?"amber glow = open decisions":"badge = # open decisions"}</div>}
      </div>

      <div className={"dash"+(brainOpen?" hidden":"")}>
        <div className="card" style={{padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em"}}>MOMENTUM</div>
              <div className="disp mono" style={{fontSize:40,fontWeight:700,color:"#F5B344",lineHeight:1,marginTop:3}}>{momentum}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="disp" style={{fontSize:13,fontWeight:600}}>Level {level}</div>
              <div className="mono" style={{fontSize:10,color:"#8A94B0",marginTop:2}}>{60-intoLevel} to next</div>
            </div>
          </div>
          <div style={{height:6,background:"#0E1424",borderRadius:99,marginTop:12,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,#F5B344,#8B7CFF)",borderRadius:99,transition:"width .4s"}}/></div>
          <div style={{display:"flex",gap:12,rowGap:10,marginTop:14,flexWrap:"wrap"}}>
            <Stat icon={<Sparkles size={13}/>} v={resolvedCount} l="resolved" c="#5BD6A8"/>
            <Stat icon={<Zap size={13}/>} v={captureCount} l="captured" c="#F5B344"/>
            <Stat icon={<AlertTriangle size={13}/>} v={openCountTotal} l="open" c="#8B7CFF"/>
            <Stat icon={<Inbox size={13}/>} v={linesProcessed} l="processed" c="#79C0FF"/>
          </div>
        </div>

        <div className="card" style={{padding:16}}>
          <div style={{marginBottom:10}}><span className="disp" style={{fontWeight:600,fontSize:14}}>Items</span></div>
          <div className="tabs" style={{marginBottom:12,borderBottom:"1px solid #1B2440"}}>
            {[["open","Open"],["snoozed","Snoozed"],["resolved","Resolved"]].map(([k,lbl])=>(
              <button key={k} className={"stab tap"+(statusFilter===k?" on":"")} onClick={()=>{setStatusFilter(k);setOpenDec(null);}}>{lbl}<span className="n">({sCount[k]})</span></button>
            ))}
          </div>
          <div className="seg" style={{marginBottom:8,width:"fit-content"}}>
            <button className={itemFilter==="all"?"on":""} onClick={()=>setItemFilter("all")}>All {fCount.all}</button>
            <button className={itemFilter==="decision"?"on":""} onClick={()=>setItemFilter("decision")}>Decisions {fCount.decision}</button>
            <button className={itemFilter==="task"?"on":""} onClick={()=>setItemFilter("task")}>Tasks {fCount.task}</button>
          </div>
          <div className="mono" style={{fontSize:10,color:"#6B7494",marginBottom:6}}>{statusFilter==="open"?"tap to act · or tap a node above":statusFilter==="snoozed"?"sleeping until their wake date":"already handled"}</div>
          {allDecs.length===0&&<div className="mono" style={{fontSize:11,color:"#5C678C",padding:"8px 0"}}>nothing {statusFilter==="open"?"open":statusFilter} here</div>}
          {allDecs.map(d=><DecRow key={d.id} d={d} compact resolved={resolved} openDec={openDec} setOpenDec={setOpenDec} outcome={outcome} setOutcome={setOutcome} onResolve={resolve} onReopen={reopen} onConvert={convert} onSnooze={snooze} onWakeNow={wakeNow} snoozeUntilDate={isSnoozedFuture(d.id)?snoozeUntil(d.id):null} itemType={effType(d.id)} nameMap={norm.name}/>)}
        </div>
        <div className="mono" style={{fontSize:10,color:"#4F587A",textAlign:"center",marginTop:6}}>single source of truth: the brain repo · {conn.token?`${conn.owner}/${conn.repo}`:"not connected"}</div>
      </div>

      <div className="capbar">
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&capture()} placeholder="Drop a thought..." style={{flex:1,background:"#161E33",border:"1px solid #2A3556",borderRadius:12,color:"#E8ECF7",padding:"12px 14px",fontSize:14,outline:"none"}}/>
        <button onClick={capture} className="tap" style={{background:"#8B7CFF",color:"#0E1424",border:"none",borderRadius:12,padding:"0 16px",fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:4}}><Plus size={17}/> Add</button>
      </div>

      {node&&(
        <div className="sheet">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}><span style={{width:12,height:12,borderRadius:"50%",background:HEX[node.kind]??"#6B7494",boxShadow:`0 0 10px ${HEX[node.kind]??"#6B7494"}`}}/><span className="disp" style={{fontSize:20,fontWeight:700}}>{node.label}</span><span className="chip" style={{background:(HEX[node.kind]??"#6B7494")+"22",color:HEX[node.kind]??"#6B7494"}}>{node.kind}</span></div>
            <button onClick={()=>{setSelected(null);setOpenDec(null);}} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>
          <div style={{fontSize:13.5,lineHeight:1.5,color:"#C3CAE0",marginBottom:16}}>{norm.summary[node.id]||<span style={{color:"#6B7494"}}>No summary yet — it'll appear after the next processing run.</span>}</div>
          {node.card&&(<div style={{marginBottom:16}}>
            <button onClick={()=>setCardOpen(o=>!o)} className="tap mono" style={{display:"flex",alignItems:"center",gap:5,background:"transparent",border:"none",color:"#8B7CFF",fontSize:11,padding:0}}><FileText size={13}/> {cardOpen?"Hide full card":"View full card"} <ChevronDown size={13} style={{transform:cardOpen?"rotate(180deg)":"none",transition:"transform .2s"}}/></button>
            {cardOpen&&<div className="exp" style={{background:"#0E1424",border:"1px solid #232C46",borderRadius:12,padding:"12px 14px",marginTop:10,maxHeight:280,overflowY:"auto",fontSize:13,lineHeight:1.5,color:"#C3CAE0"}} dangerouslySetInnerHTML={{__html:mdToHtml(node.card)}}/>}
          </div>)}
          <div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:8}}>CONNECTIONS ({neighbors.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:nodeDecs.length?18:4}}>
            {neighbors.map(nb=>(<button key={nb.id} onClick={()=>{setSelected(nb.id);setOpenDec(null);}} className="tap" style={{background:"#0E1424",border:"1px solid #2A3556",borderRadius:10,padding:"7px 11px",color:"#E8ECF7",fontSize:12.5,display:"flex",alignItems:"center",gap:6}}>{nb.label} <span className="mono" style={{fontSize:9,color:"#6B7494"}}>{nb.rel}</span> <ArrowRight size={12} color="#6B7494"/></button>))}
          </div>
          {nodeDecs.length>0&&(<><div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:4}}>OPEN ITEMS</div>{nodeDecs.map(d=><DecRow key={d.id} d={d} compact resolved={resolved} openDec={openDec} setOpenDec={setOpenDec} outcome={outcome} setOutcome={setOutcome} onResolve={resolve} onReopen={reopen} onConvert={convert} onSnooze={snooze} onWakeNow={wakeNow} snoozeUntilDate={null} itemType={effType(d.id)} nameMap={norm.name}/>)}</>)}
        </div>
      )}

      {showProcess&&(
        <div className="sheet" style={{zIndex:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span className="disp" style={{fontSize:18,fontWeight:700,display:"flex",alignItems:"center",gap:8}}><Inbox size={18} color="#F5B344"/> Inbox</span>
            <button onClick={()=>setShowProcess(false)} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>
          <div style={{fontSize:13.5,lineHeight:1.5,color:"#C3CAE0",marginBottom:8}}>
            <b style={{color:"#F5B344"}}>{inboxCount}</b> raw item{inboxCount===1?"":"s"} waiting{conn.token?"":" (demo · your captures)"}.
          </div>
          {inboxCount>0
            ? <div style={{maxHeight:230,overflowY:"auto",background:"#F5F5F0",borderRadius:12,marginBottom:14}}>
                {inboxList.map((line,i)=>(
                  <div key={i} style={{display:"flex",gap:10,fontSize:11.5,lineHeight:1.5,padding:"7px 12px",borderBottom:i<inboxCount-1?"1px solid #E4E4DA":"none"}}>
                    <span className="mono" style={{color:"#A8A894",minWidth:18,textAlign:"right",flexShrink:0,userSelect:"none"}}>{i+1}</span>
                    <span className="mono" style={{color:"#2A2E22",wordBreak:"break-word",whiteSpace:"pre-wrap"}}>{line}</span>
                  </div>
                ))}
              </div>
            : <div className="mono" style={{fontSize:11.5,color:"#5C678C",padding:"6px 0 14px"}}>Nothing waiting right now.</div>}
          <div style={{fontSize:12.5,lineHeight:1.5,color:"#8A94B0",marginBottom:16}}>
            {conn.token
              ? "Processing reads inbox.md, folds these into your cards, and clears the inbox. It runs in your brain processor — this just asks it to."
              : "Connect your brain to capture and process. In demo mode nothing is written."}
          </div>
          {inboxCount>0&&<div className="mono" style={{fontSize:11,color:"#F5B344",textAlign:"center",marginBottom:8}}>~+{inboxCount*4} momentum when you process</div>}
          <button onClick={processNow} disabled={!!conn.token&&!canProcess} className="tap" style={{width:"100%",background:(!!conn.token&&!canProcess)?"#2A3556":"#8B7CFF",color:(!!conn.token&&!canProcess)?"#6B7494":"#0E1424",border:"none",borderRadius:11,padding:"12px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:(!!conn.token&&!canProcess)?"default":"pointer"}}><Play size={15}/> Process now</button>
          {!!conn.token&&!canProcess&&<div className="mono" style={{fontSize:10.5,color:"#F5B344",textAlign:"center",marginTop:10}}>Finish syncing first — {outbox.length} pending</div>}
        </div>
      )}

      {showSettings&&form&&(
        <div className="sheet" style={{zIndex:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span className="disp" style={{fontSize:18,fontWeight:700}}>Connect your brain</span>
            <button onClick={()=>setShowSettings(false)} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>
          <div style={{fontSize:12.5,lineHeight:1.5,color:"#8A94B0",marginBottom:6}}>
            Paste a GitHub <b style={{color:"#C3CAE0"}}>fine-grained token</b> scoped to your private brain repo with <b style={{color:"#C3CAE0"}}>Contents: Read and write</b>. It is stored only on this device and never leaves it except to call GitHub.
          </div>
          <div className="lbl">GitHub token</div>
          <input className="fld" type="password" autoComplete="off" autoCorrect="off" spellCheck={false} value={form.token} onChange={e=>setForm(f=>({...f,token:e.target.value}))} placeholder="github_pat_…"/>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><div className="lbl">Owner</div><input className="fld" value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))} placeholder={DEFAULT_CONN.owner}/></div>
            <div style={{flex:1}}><div className="lbl">Repo</div><input className="fld" value={form.repo} onChange={e=>setForm(f=>({...f,repo:e.target.value}))} placeholder={DEFAULT_CONN.repo}/></div>
          </div>
          <div className="lbl">Branch</div>
          <input className="fld" value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))} placeholder={DEFAULT_CONN.branch}/>

          {status.state==="error"&&<div style={{marginTop:12,fontSize:12,color:"#F5B344",display:"flex",gap:6,alignItems:"flex-start"}}><AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/><span>{status.msg}</span></div>}
          {status.state==="ok"&&<div style={{marginTop:12,fontSize:12,color:"#5BD6A8",display:"flex",gap:6,alignItems:"center"}}><Check size={14}/> Synced from {conn.owner}/{conn.repo}.</div>}

          <div style={{display:"flex",gap:9,marginTop:16}}>
            <button onClick={saveSettings} className="tap" style={{flex:1,background:"#8B7CFF",color:"#0E1424",border:"none",borderRadius:11,padding:"12px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{status.state==="loading"?<><RefreshCw size={15} className="spin"/> Connecting…</>:<><Cloud size={15}/> Save & connect</>}</button>
            {conn.token&&<button onClick={doDisconnect} className="tap" style={{background:"transparent",color:"#8A94B0",border:"1px solid #2A3556",borderRadius:11,padding:"12px 14px",fontWeight:600,fontSize:13}}>Disconnect</button>}
          </div>
          <div className="mono" style={{fontSize:9.5,color:"#4F587A",textAlign:"center",marginTop:12}}>token lives in this device's storage · revoke anytime in GitHub settings</div>
        </div>
      )}

      {toast&&(<div className="toast mono" style={{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"center",gap:12,background:"#1B2440",border:"1px solid #2E3960",color:"#E8ECF7",padding:"10px 16px",borderRadius:99,fontSize:12.5,fontWeight:600,zIndex:20,boxShadow:"0 6px 24px rgba(0,0,0,.5)"}}><span>{toast.msg}</span>{toast.undo&&<button onClick={toast.undo} className="tap" style={{background:"transparent",color:"#F5B344",border:"none",fontWeight:700,fontSize:12.5,display:"flex",alignItems:"center",gap:4}}><RotateCcw size={13}/> Undo</button>}</div>)}
    </div>
  );
}
function Stat({icon,v,l,c}){return(<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{color:c}}>{icon}</span><span className="mono" style={{fontSize:15,fontWeight:700}}>{v}</span><span className="mono" style={{fontSize:10,color:"#8A94B0"}}>{l}</span></div>);}

// Module-scope (stable identity) so typing in the outcome box doesn't remount
// the textarea and drop focus / dismiss the keyboard.
function DecRow({d, compact, resolved, openDec, setOpenDec, outcome, setOutcome, onResolve, onReopen, onConvert, onSnooze, onWakeNow, snoozeUntilDate, itemType, nameMap}) {
  const isRes=!!resolved[d.id], isOpen=openDec===d.id;
  const [snz,setSnz]=useState(false);
  const isTask=itemType==="task";
  const typeColor=isTask?"#5BD6A8":"#8B7CFF";
  const addDays=(n)=>{ const dt=new Date(); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); };
  const pick=(iso)=>{ setSnz(false); onSnooze(d.id, iso); };
  // "2026-06-30" -> "Jun 30" (anchored to local midnight to avoid TZ drift).
  const fmtDate=(iso)=>{ try { return new Date(iso+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}); } catch { return iso; } };
  const isSnoozed=!!snoozeUntilDate && !isRes;
  return (
    <div style={{borderTop:compact?"1px solid #232C46":"none",borderBottom:!compact?"1px solid #232C46":"none",padding:"10px 0",opacity:isRes?0.55:1}}>
      <div onClick={()=>{if(!isRes){setOpenDec(isOpen?null:d.id);setOutcome("");}}} className="tap" style={{display:"flex",gap:9,alignItems:"flex-start"}}>
        <div style={{flexShrink:0,width:20,height:20,borderRadius:6,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",background:isRes?"#5BD6A8":"transparent",border:isRes?"none":"1.5px solid #3A4366"}}>{isRes&&<Check size={13} color="#0E1424" strokeWidth={3}/>}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,lineHeight:1.42,color:isRes?"#8A94B0":"#E8ECF7",textDecoration:isRes?"line-through":"none"}}>
            {d.flagged&&!isRes&&<AlertTriangle size={12} color="#F5B344" style={{verticalAlign:"-2px",marginRight:4}}/>}{d.text}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
            <span className="chip" style={{background:typeColor+"22",color:typeColor,fontSize:9}}>{itemType}</span>
            <span className="mono" style={{fontSize:10,color:"#6B7494"}}>{nameMap[d.node]}{isRes&&resolved[d.id].outcome?` · ${resolved[d.id].outcome}`:""}</span>
          </div>
        </div>
        {!isRes&&<ChevronDown size={15} color="#6B7494" style={{flexShrink:0,marginTop:2,transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s"}}/>}
      </div>

      {isSnoozed&&(<div style={{display:"flex",alignItems:"center",gap:10,marginLeft:29,marginTop:6}}>
        <span className="mono" style={{fontSize:10.5,color:"#F5B344",display:"flex",alignItems:"center",gap:4}}><Clock size={11}/> snoozed until {fmtDate(snoozeUntilDate)}</span>
        <button onClick={(e)=>{e.stopPropagation();onWakeNow(d.id);}} className="tap mono" style={{display:"flex",alignItems:"center",gap:4,background:"#0E1424",border:"1px solid #2A3556",borderRadius:8,color:"#5BD6A8",fontSize:10.5,padding:"4px 9px"}}><RotateCcw size={11}/> wake now</button>
      </div>)}

      {isOpen&&!isRes&&(<div style={{display:"flex",alignItems:"center",gap:8,marginLeft:29,marginTop:9,flexWrap:"wrap"}}>
        <button onClick={(e)=>{e.stopPropagation();onConvert(d.id);}} className="tap mono" style={{display:"flex",alignItems:"center",gap:4,background:"#0E1424",border:"1px solid #2A3556",borderRadius:8,color:"#AEB7D4",fontSize:10.5,padding:"5px 9px"}}><Repeat size={11}/> to {isTask?"decision":"task"}</button>
        <button onClick={(e)=>{e.stopPropagation();setSnz(s=>!s);}} className="tap mono" style={{display:"flex",alignItems:"center",gap:4,background:"#0E1424",border:"1px solid #2A3556",borderRadius:8,color:"#AEB7D4",fontSize:10.5,padding:"5px 9px"}}><Clock size={11}/> snooze <ChevronDown size={11} style={{transform:snz?"rotate(180deg)":"none",transition:"transform .2s"}}/></button>
        {snz&&(<div className="exp" style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4,width:"100%"}}>
          {[["1 day",1],["3 days",3],["1 week",7],["2 weeks",14]].map(([lbl,n])=>(
            <button key={n} onClick={(e)=>{e.stopPropagation();pick(addDays(n));}} className="tap mono" style={{background:"#161E33",border:"1px solid #2A3556",borderRadius:8,color:"#E8ECF7",fontSize:10.5,padding:"5px 9px"}}>{lbl}</button>
          ))}
          <input type="date" onClick={(e)=>e.stopPropagation()} onChange={(e)=>e.target.value&&pick(e.target.value)} className="mono" style={{background:"#161E33",border:"1px solid #2A3556",borderRadius:8,color:"#E8ECF7",fontSize:10.5,padding:"4px 8px"}}/>
        </div>)}
      </div>)}

      {isOpen&&!isRes&&(<div className="exp" style={{marginTop:9,marginLeft:29}}>
        <textarea value={outcome} onChange={e=>setOutcome(e.target.value)} rows={2} placeholder={isTask?"What got done?":"What did you decide?"} style={{width:"100%",background:"#0E1424",border:"1px solid #232C46",borderRadius:9,color:"#E8ECF7",padding:"8px 10px",fontSize:12.5,outline:"none",resize:"none"}}/>
        <button onClick={()=>onResolve(d.id)} className="tap" style={{marginTop:7,background:"#5BD6A8",color:"#0E1424",border:"none",borderRadius:8,padding:"7px 13px",fontWeight:600,fontSize:12.5,display:"flex",alignItems:"center",gap:5}}><Check size={13}/> {isTask?"Mark done":"Resolve"}</button>
      </div>)}
      {isRes&&<button onClick={()=>onReopen(d.id)} className="tap mono" style={{marginLeft:29,marginTop:4,background:"transparent",border:"none",color:"#6B7494",fontSize:10,display:"flex",alignItems:"center",gap:4,padding:0}}><RotateCcw size={10}/> reopen</button>}
    </div>
  );
}

// Minimal, dependency-free markdown -> HTML for the "View full card" panel.
// Escapes HTML first, then applies a small subset (headings, bold, code, lists,
// [[wikilinks]], http links). Used only on the user's own card content.
function mdToHtml(md){
  const esc=(s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline=(t)=> esc(t)
    .replace(/\[\[([^\]]+)\]\]/g,'<span style="color:#8B7CFF">$1</span>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code style="background:#0E1424;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,txt,url)=> /^https?:\/\//.test(url)?`<a href="${url}" target="_blank" rel="noreferrer" style="color:#8B7CFF">${txt}</a>`:txt);
  const lines=(md||"").split("\n"); let html=""; let inList=false;
  const closeList=()=>{ if(inList){ html+="</ul>"; inList=false; } };
  for(const raw of lines){
    const line=raw.replace(/\s+$/,"");
    if(/^###\s+/.test(line)){ closeList(); html+=`<div style="font-weight:700;font-size:12px;color:#AEB7D4;margin:9px 0 2px">${inline(line.replace(/^###\s+/,""))}</div>`; }
    else if(/^##\s+/.test(line)){ closeList(); html+=`<div style="font-weight:700;font-size:13px;color:#C3CAE0;margin:11px 0 3px">${inline(line.replace(/^##\s+/,""))}</div>`; }
    else if(/^#\s+/.test(line)){ closeList(); html+=`<div style="font-weight:700;font-size:15px;color:#E8ECF7;margin:6px 0 5px">${inline(line.replace(/^#\s+/,""))}</div>`; }
    else if(/^\s*[-*]\s+/.test(line)){ if(!inList){ html+='<ul style="margin:3px 0 3px 16px;padding:0">'; inList=true; } html+=`<li style="margin:3px 0">${inline(line.replace(/^\s*[-*]\s+/,""))}</li>`; }
    else if(line.trim()===""){ closeList(); html+='<div style="height:7px"></div>'; }
    else { closeList(); html+=`<div style="margin:3px 0">${inline(line)}</div>`; }
  }
  closeList();
  return html;
}
