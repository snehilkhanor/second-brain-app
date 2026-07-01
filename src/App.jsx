import React, { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import ForceGraph3D from "3d-force-graph";
import { Brain, X, ArrowRight, Check, AlertTriangle, Plus, Zap, Sparkles, RotateCcw, ChevronDown, ChevronUp, Clock, GitBranch, Link2, Cloud, CloudOff, RefreshCw, Repeat, FileText, Inbox, Play, Hash, Upload, Eye } from "lucide-react";
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
// Designed colours per entity kind, grouped into families that read AS families (varied
// by treatment/brightness, not clashing hues). Unknown kinds (future processor-added) are
// NOT listed here — they get an auto fallback colour and still appear (see kindColors()).
const KIND_STYLE = {
  hub:        { hex:"#F5B344" },              // gold
  venture:    { hex:"#8B7CFF" },              // businesses — solid violet (live)
  incubation: { hex:"#6B5FC2", ring:true },   // businesses — dimmer/outlined violet (proto-venture)
  project:    { hex:"#5BA3F5" },              // work — bright blue
  area:       { hex:"#4773B8" },              // work — mid blue
  resource:   { hex:"#3C5878" },              // work — quiet blue (quietest)
  person:     { hex:"#5BD6A8" },              // green
  org:        { hex:"#6B7494" },              // grey
  rival:      { hex:"#6B7494" },              // grey
};
// Fallback colours handed to kinds with no designed colour yet, so they're visible
// immediately (just not hand-styled). Hand-picked to be distinct from the families above.
const FALLBACK_PALETTE = ["#E08AD6","#56C7C0","#E0A24A","#C77FE0","#D98A6A","#7FB37F","#A0A0C8"];
const KIND_ORDER = ["hub","venture","incubation","project","area","resource","person","org","rival"];
const FALLBACK_HEX = "#6B7494";
const hexInt = (hex) => parseInt(hex.slice(1), 16);

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
    // Demo PARA block. Project/Area ids reuse entity ids that already own demo
    // decisions (thirdman, trulymadly, madlabs) so their card panels show real,
    // resolvable open items; "finance" has none → shows the "clear" state.
    para: {
      projects: [
        { id:"thirdman", label:"ThirdMan launch", open:2, done:5, body:"# ThirdMan launch\n\nGet the AI+human EA to the first paying CXOs.\n\n## Notes\n- pricing fork still open\n- pick the AI primitives reliable enough today" },
        { id:"trulymadly", label:"TrulyMadly 40+ premium", open:3, done:8, body:"# TrulyMadly 40+ premium\n\nShip the 40+ premium tier.\n\n- unified packaging: Select / Select Plus / VIP\n- naming test pending on real 40+ users" },
      ],
      areas: [
        { id:"madlabs", label:"Mad Labs studio", open:1, done:4, body:"# Mad Labs studio\n\nThe lab is the product — keep the pipeline healthy.\n\n- incubate vs build vs partner\n- fundraising path" },
        { id:"finance", label:"Personal finance", open:0, done:3, body:"# Personal finance\n\nHousehold money ops — nothing open right now." },
      ],
      resources: [
        { id:"ai-prompts", label:"AI prompt library", count:14, body:"# AI prompt library\n\n- cold-open hooks\n- pricing teardown\n- interview loop" },
        { id:"rival-notes", label:"Competitor notes", count:9, body:"# Competitor notes\n\n- faff — flat fee, weak context\n- crew — Swiggy concierge\n- hulp — Delhi NCR PA pod" },
      ],
      archive: [
        { id:"unshaadi-launch", label:"Unshaadi launch", open:0, done:12, body:"# Unshaadi launch\n\nShipped and wound down. Archived for reference." },
      ],
    },
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
  const [focus,setFocus]=useState(null);          // long-press: highlight node+neighbours, no panel
  const [resolved,setResolved]=useState(()=>lsGetJSON("sb_res",{}));
  const [captures,setCaptures]=useState(()=>lsGetJSON("sb_cap",[]));
  const [outbox,setOutbox]=useState(()=>lsGetJSON("sb_outbox",[]));   // writes not yet pushed
  const [syncing,setSyncing]=useState(false);                        // a flush is in flight
  const [draft,setDraft]=useState("");
  const [showCapture,setShowCapture]=useState(false);            // expanded capture sheet
  const [target,setTarget]=useState(null);                       // file-into: null | {id,label} | {newType,name}
  const [pickerOpen,setPickerOpen]=useState(false);              // target picker open in capture sheet
  const [targetQuery,setTargetQuery]=useState("");               // card search query
  const [recentTargets,setRecentTargets]=useState(()=>{ const v=lsGetJSON("sb_recent_targets",[]); return Array.isArray(v)?v:[]; }); // recently filed-into card ids
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
  const [showProcess,setShowProcess]=useState(false);            // brain sheet (Inbox / Outbox tabs)
  const [brainTab,setBrainTab]=useState("inbox");                // which tab in the brain sheet: inbox | outbox
  const [dashView,setDashView]=useState("items");                // dashboard tab: items | para
  const [paraCard,setParaCard]=useState(null);                   // open PARA card panel (entry object)
  const [paraBodyOpen,setParaBodyOpen]=useState(false);          // "view full card" toggle in the PARA panel

  const norm=useMemo(()=>normalize(graph),[graph]);

  // Map of each kind PRESENT in the graph → its colour: designed colour when we have one,
  // else an auto fallback colour. Data-driven, so a brand-new kind in graph.json is styled
  // and shown without any app change. legendKinds orders them for display.
  const kindColors=useMemo(()=>{
    const present=[...new Set(norm.nodes.map(n=>n.kind))];
    const m={};
    present.filter(k=>KIND_STYLE[k]).forEach(k=>{ m[k]=KIND_STYLE[k]; });
    present.filter(k=>!KIND_STYLE[k]).sort().forEach((k,i)=>{ m[k]={hex:FALLBACK_PALETTE[i%FALLBACK_PALETTE.length], fallback:true}; });
    return m;
  },[norm.nodes]);
  const legendKinds=useMemo(()=>Object.keys(kindColors).sort((a,b)=>{
    const ia=KIND_ORDER.indexOf(a), ib=KIND_ORDER.indexOf(b);
    if(ia<0&&ib<0) return a.localeCompare(b);
    if(ia<0) return 1; if(ib<0) return -1; return ia-ib;
  }),[kindColors]);

  const selRef=useRef(null), modeRef=useRef("glow"), resRef=useRef({}), resizeRef=useRef(null);
  const focusRef=useRef(null), pressStart=useRef(0), pressing=useRef(false);
  const lastProcessedRef=useRef(lsGetJSON("sb_lp",null)); // last-seen stats.lines_processed (for the reward toast)
  const capRef=useRef(null); // capture-sheet textarea (for focus management)
  const kindColorRef=useRef({}); // kind -> THREE colour int, kept current for makeNode
  const dashDefaulted=useRef(false), dashTouched=useRef(false); // dashboard-tab default-once + manual-override flags
  const normRef=useRef(norm), refsRef=useRef({}), graphObjRef=useRef(null), activeRef=useRef(null);
  const outboxRef=useRef(outbox), flushing=useRef(false), openCountRef=useRef({}), flushTimer=useRef(null);
  useEffect(()=>{ setCardOpen(false); if(selected) setParaCard(null); },[selected]); // collapse "full card"; close PARA panel when a node is selected
  useEffect(()=>{ setParaBodyOpen(false); },[paraCard]); // collapse the PARA "full card" when switching cards
  useEffect(()=>{ if(showCapture && !pickerOpen) capRef.current?.focus(); },[showCapture,pickerOpen]); // focus the textarea (not while the picker search is up)
  // Header PARA toggle: jump to the PARA view (collapsing the brain so the dashboard is
  // visible); when already showing PARA, toggle back to Items. Marks the tab manually
  // chosen so the open==0 default rule won't override it for the session.
  const togglePara=()=>{
    dashTouched.current=true;
    const showingPara = !brainOpen && dashView==="para";
    setBrainOpen(false);
    setDashView(showingPara ? "items" : "para");
  };

  const persist=(k,v)=>lsSetJSON(k,v);                         // on-device storage
  // Update the ref synchronously so flushOutbox(), called right after, sees the
  // fresh queue (the [outbox] effect below only runs after the next render).
  const setOutboxP=(arr)=>{ outboxRef.current=arr; setOutbox(arr); lsSetJSON("sb_outbox",arr); };
  useEffect(()=>{outboxRef.current=outbox;},[outbox]);
  useEffect(()=>{selRef.current=selected;},[selected]);
  useEffect(()=>{focusRef.current=focus;},[focus]);
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
          // Reflect the just-synced lines in the inbox count — captures AND actions —
          // deduped verbatim (matches inbox.md's idempotent append, so no over/double count).
          setInboxItems(prev=>{ const have=new Set(prev.map(l=>String(l).replace(/\s+$/,""))); const add=kept.map(it=>it.line).filter(l=>!have.has(String(l).replace(/\s+$/,""))); if(!add.length) return prev; const v=[...prev,...add]; lsSetJSON("sb_inbox",v); return v; });
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
  // Retry ONE failed item: clear its failed flag and re-flush (single-flight). The flush
  // re-reads the sha before the PUT and drops the item on a confirmed 2xx.
  const retryItem=(id)=>{ setOutboxP(outboxRef.current.map(it=> it.id===id ? {...it,failed:false,err:undefined} : it)); flushOutbox(); };
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
  // DEFAULT TAB (once, on load): nothing open → land on PARA; otherwise Items. A manual
  // tab tap sets dashTouched and this never fires again for the session.
  useEffect(()=>{
    if(dashTouched.current || dashDefaulted.current) return;
    dashDefaulted.current=true;
    setDashView(openCountTotal===0 ? "para" : "items");
  },[openCountTotal]); // eslint-disable-line
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

  // --- capture targeting ("File into…") -------------------------------------
  // Targets = existing cards (graph nodes + PARA entries, both {id,label}) or a NEW card
  // the processor will create. Default target null = untargeted raw dump (unchanged).
  const allTargets=useMemo(()=>{
    const seen=new Set(), out=[];
    const push=(id,label)=>{ if(!id||seen.has(id))return; seen.add(id); out.push({id,label:label||id}); };
    norm.nodes.forEach(n=>push(n.id,n.label));
    ["projects","areas","resources","archive"].forEach(k=>(norm.para[k]||[]).forEach(e=>push(e.id,e.label)));
    return out;
  },[norm]);
  // Before typing: recently filed-into cards (still present) + active Projects, max 5.
  const smartTargets=useMemo(()=>{
    const seen=new Set(), out=[];
    const add=(t)=>{ if(t&&!seen.has(t.id)){ seen.add(t.id); out.push(t); } };
    recentTargets.forEach(id=>add(allTargets.find(t=>t.id===id)));
    (norm.para.projects||[]).forEach(e=>add({id:e.id,label:e.label}));
    return out.slice(0,5);
  },[recentTargets,allTargets,norm]); // eslint-disable-line
  const tq=targetQuery.trim().toLowerCase();
  const targetResults = tq ? allTargets.filter(t=>(t.label+" "+t.id).toLowerCase().includes(tq)).slice(0,12) : smartTargets;
  const targetLabel=(t)=> !t ? "Inbox (no card)" : t.newType ? `new ${t.newType==="card"?"card (processor decides)":t.newType}: ${t.name}` : `[[${t.id}]] ${t.label}`;
  const composeLine=(text,t)=> !t ? text : t.newType ? `[[+${t.newType}: ${t.name}]] ${text}` : `[[${t.id}]] ${text}`;
  const tRow={display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,width:"100%",textAlign:"left",fontFamily:"inherit",background:"transparent",border:"none",borderBottom:"1px solid #1B2440",padding:"9px 4px",fontSize:13,cursor:"pointer"};
  const openCapture=()=>{ setPickerOpen(false); setShowCapture(true); };
  const closeCapture=()=>{ setShowCapture(false); setPickerOpen(false); setTarget(null); setTargetQuery(""); };
  const chooseTarget=(t)=>{ setTarget(t); setPickerOpen(false); setTargetQuery(""); };
  // "+ Add" on a card → open the capture box pre-targeted to THAT card (sends [[slug]] text
  // via the existing inbox path). Close the card panel so only the capture sheet shows.
  const addThoughtTo=(card)=>{ setSelected(null); setParaCard(null); setTarget({id:card.id,label:card.label}); setPickerOpen(false); setShowCapture(true); };

  // Capture a thought. Composes the line from the optional target, appends via the SAME
  // outbox→inbox.md path (sync unchanged), clears the textarea but KEEPS the target and
  // sheet open so many notes can be filed into one card without reselecting.
  const capture=()=>{
    const text=draft.trim(); if(!text) return;
    const line=composeLine(text,target);
    const next=[{t:line,ts:Date.now()},...captures];
    setCaptures(next);persist("sb_cap",next);setDraft("");
    if(target&&target.id){ const r=[target.id,...recentTargets.filter(x=>x!==target.id)].slice(0,8); setRecentTargets(r); lsSetJSON("sb_recent_targets",r); }
    if(!conn.token){ showToast(`Captured${target?` → ${targetLabel(target)}`:""} (demo — connect to save)`); return; }
    enqueue({id:"c_"+Date.now(), kind:"thought", ts:Date.now(), message:"app: capture", line});
    // The inbox count bumps when the line actually syncs (in flushOutbox), so captures
    // AND actions (snooze/resolve/convert/wake) all reflect once written — see flushOutbox.
    showToast(navigator.onLine?(target?`Filed → ${targetLabel(target)}`:"Captured to inbox"):"Saved — will sync when online");
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
    const anchor=focus||selected;   // long-press focus OR a tapped (panel-open) node
    if(anchor){ act=new Set([anchor]); norm.links.forEach(([s,t])=>{ if(s===anchor)act.add(t); if(t===anchor)act.add(s); }); }
    activeRef.current=act;
    const G=graphObjRef.current; if(G){ G.linkColor(linkColorFor).linkWidth(linkWidthFor); }
  },[selected,focus,norm]); // eslint-disable-line

  // --- 3D engine: created once; data synced separately when it changes -------
  useEffect(()=>{
    const mount=mountRef.current; if(!mount) return;

    // One node's visual — ported verbatim from the design: glowing core sized by
    // connections, type-coloured halo, amber alert halo, label sprite, count badge.
    function makeNode(node){
      const col=kindColorRef.current[node.type] ?? hexInt(FALLBACK_HEX);
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
      // Tap = open the node's panel. Long-press (hold ~450ms in place) = "focus":
      // highlight the node + its links and dim everything else, WITHOUT opening the panel.
      .onNodeClick(n=>{
        const held = (Date.now()-pressStart.current) >= 450;
        if(held){ setFocus(n.id); setSelected(null); }   // focus only — no panel
        else { setSelected(n.id); }                       // tap opens the panel; focus (if any) stays until empty-space tap
      })
      .onBackgroundClick(()=>{ setSelected(null); setFocus(null); });
    graphObjRef.current=Graph;

    // Track press timing on the canvas so onNodeClick can tell a tap from a hold.
    let userMoved=false;   // becomes true on first interaction; stops auto-framing from then on
    const onDown=()=>{ pressStart.current=Date.now(); pressing.current=true; userMoved=true; };
    const onUp=()=>{ pressing.current=false; };
    mount.addEventListener("pointerdown",onDown);
    mount.addEventListener("pointerup",onUp);
    mount.addEventListener("pointercancel",onUp);

    // Keep the cloud tight, like the design's hand-tuned springs.
    Graph.d3Force("charge").strength(-160);
    Graph.d3Force("link").distance(46);

    // The design's two coloured point lights for rim glow.
    const scene=Graph.scene();
    const l1=new THREE.PointLight(0x8B7CFF,0.8); l1.position.set(120,120,120); scene.add(l1);
    const l2=new THREE.PointLight(0xF5B344,0.5); l2.position.set(-120,-80,80); scene.add(l2);
    Graph.cameraPosition({z:300});   // initial pre-settle distance (was 210)

    // Auto-frame the whole cloud once the layout settles, so a grown brain fits on
    // load. We compute the camera distance DETERMINISTICALLY from the node bounding
    // sphere (each node's spread PLUS its own sphere+halo radius) and the camera's
    // field of view, then set the camera ONCE. Computing from the graph (not from the
    // current camera) means repeat calls are idempotent — no compounding, no shrink
    // cascade. Runs once; skipped after the user first touches the graph.
    // REVERT: delete this block + the frameTimer line below + restore z:210 above.
    let framed=false;
    const MARGIN=1.2;    // breathing room beyond a tight fit — raise to zoom out, lower to zoom in
    const frameBrain=()=>{
      if(userMoved || framed) return;
      const ns=(Graph.graphData().nodes)||[];
      if(ns.length<2 || ns.some(n=>typeof n.x!=="number")) return;   // wait for real positions
      let cx=0,cy=0,cz=0; ns.forEach(n=>{cx+=n.x;cy+=n.y;cz+=n.z;}); cx/=ns.length; cy/=ns.length; cz/=ns.length;
      let R=1; ns.forEach(n=>{ const rr=(refsRef.current[n.id]?.r||6)*2.1;   // include the halo (2.1x core)
        R=Math.max(R, Math.hypot(n.x-cx,n.y-cy,n.z-cz)+rr); });
      const cam=Graph.camera();
      const vfov=(cam.fov||50)*Math.PI/180;
      const hfov=2*Math.atan(Math.tan(vfov/2)*(cam.aspect||1));
      const fov=Math.min(vfov,hfov);            // fit the LIMITING dimension (portrait -> width)
      const dist=(R*MARGIN)/Math.tan(fov/2);
      framed=true;
      Graph.cameraPosition({x:cx, y:cy, z:cz+dist}, {x:cx,y:cy,z:cz}, 700);
    };
    Graph.onEngineStop(frameBrain);
    // Fallback in case onEngineStop's timing differs with live data (idempotent + guarded).
    const frameTimers=[setTimeout(frameBrain,2500)];

    // Obsidian-style auto-spin until the user grabs the graph or selects a node.
    const controls=Graph.controls();
    controls.autoRotate=true; controls.autoRotateSpeed=0.6;

    // Per-frame decoration: glow pulse, badge counts, selection enlarge — driven
    // by the live (resolve-aware) open-decision count, exactly as in the design.
    let raf, clock=0;
    function decorate(){
      raf=requestAnimationFrame(decorate); clock+=0.05;
      const md=modeRef.current, sel=focusRef.current||selRef.current, n0=normRef.current;
      // Keep auto-spin during focus (highlight-only); only pause it when a panel is open or mid-press.
      controls.autoRotate = !selRef.current && !pressing.current;
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

    return ()=>{ cancelAnimationFrame(raf); ro.disconnect(); frameTimers.forEach(clearTimeout);
      mount.removeEventListener("pointerdown",onDown); mount.removeEventListener("pointerup",onUp); mount.removeEventListener("pointercancel",onUp);
      Graph._destructor(); graphObjRef.current=null; };
  },[]);

  // Push the current (demo or live) graph into the engine whenever it changes.
  useEffect(()=>{
    normRef.current=norm;
    const Graph=graphObjRef.current; if(!Graph) return;
    kindColorRef.current=Object.fromEntries(Object.entries(kindColors).map(([k,v])=>[k,hexInt(v.hex)])); // colours (incl. fallbacks) for makeNode
    refsRef.current={};                         // drop stale node objects; makeNode repopulates
    Graph.graphData(toEngineData(norm));
  },[norm,kindColors]);

  const node=selected?norm.nodes.find(n=>n.id===selected):null;
  const neighbors=selected?norm.links.filter(l=>l[0]===selected||l[1]===selected).map(l=>{const o=l[0]===selected?l[1]:l[0];return{id:o,rel:l[2],label:norm.name[o]};}):[];
  const nodeDecs=selected?(norm.decsByNode[selected]||[]).filter(id=>!isSnoozedFuture(id)).map(id=>({id,...norm.dec[id]})):[];
  // PARA card panel: its open items are the open_decisions linked by entity == card.id
  // (same link the 3D nodes use), so we reuse decsByNode and the existing resolve flow.
  const paraDecs=paraCard?(norm.decsByNode[paraCard.id]||[]).filter(id=>!isSnoozedFuture(id)).map(id=>({id,...norm.dec[id]})):[];
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

  // Sync glance (BRAIN strip): syncing… / N failed / N pending. Tap opens the brain
  // sheet's Outbox tab (the queue's home — per-item retry, retry-all, sync now live there).
  const failedCount=outbox.filter(it=>it.failed).length;
  const pendingCount=outbox.length-failedCount;
  const firstErr=(outbox.find(it=>it.failed)||{}).err;
  const syncUI = syncing ? {txt:"syncing…", color:"#F5B344"}
    : failedCount>0 ? {txt:`${failedCount} failed${firstErr?` (${firstErr})`:""}`, color:"#F87171"}
    : pendingCount>0 ? {txt:`${pendingCount} pending`, color:"#F5B344"}
    : null;
  const openOutbox=()=>{ setBrainTab("outbox"); setShowProcess(true); };

  // Review nudge (read-only): the processor flags items; the app only surfaces them.
  const reviewItems=norm.review.items;
  const reviewCount=norm.review.pending;

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
  .capbar{flex-shrink:0;display:flex;gap:8px;padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));background:#0E1424;border-top:1px solid #232C46}
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
        <div onClick={()=>{setBrainTab("inbox");setShowProcess(true);}} className="tap" style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} title={`${inboxCount} in inbox`}>
          <span style={{position:"relative",display:"flex"}}>
            <Brain size={20} color="#8B7CFF"/>
            {inboxCount>0&&<span className="mono" style={{position:"absolute",top:-7,right:-9,background:"#F5B344",color:"#0E1424",fontSize:9,fontWeight:700,minWidth:15,height:15,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",border:"2px solid #0A0F1C",lineHeight:1}}>{inboxCount}</span>}
          </span>
          <span className="disp" style={{fontWeight:700,fontSize:17}}>second brain</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="conn" onClick={openSettings} style={{color:statusUI.color}}>
            <span style={{position:"relative",display:"flex"}}>
              {statusUI.icon}
              {reviewCount>0&&<span className="mono" style={{position:"absolute",top:-9,right:-10,background:"#F5B344",color:"#0E1424",fontSize:9,fontWeight:700,minWidth:15,height:15,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",border:"2px solid #0A0F1C",lineHeight:1}}>{reviewCount}</span>}
            </span>
            <span>{statusUI.label}</span>
          </button>
          <button className="conn" onClick={doRefresh} title="Refresh" aria-label="Refresh" style={{color:"#8A94B0",padding:"6px 9px"}}><RefreshCw size={16} className={status.state==="loading"?"spin":""}/></button>
          <button className="conn" onClick={togglePara} title="PARA" aria-label="PARA" style={(!brainOpen&&dashView==="para")?{background:"#8B7CFF",borderColor:"#8B7CFF",color:"#0E1424"}:{color:"#8A94B0"}}>PARA</button>
        </div>
      </div>

      <div className="phead" onClick={()=>setBrainOpen(o=>!o)}>
        <span className="mono" style={{fontSize:11,color:"#8A94B0"}}>BRAIN · {norm.nodes.length} nodes · <span style={{color:"#F5B344"}}>{openCountTotal} open</span>{syncUI&&<span onClick={(e)=>{e.stopPropagation(); openOutbox();}} className="tap" style={{color:syncUI.color,fontWeight:600}}> · {syncUI.txt}</span>}</span>
        <span className="tap mono" style={{display:"flex",alignItems:"center",gap:5,color:"#8A94B0",fontSize:11}}>
          {brainOpen?"collapse":"expand"} {brainOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
        </span>
      </div>

      <div className={"brain"+(brainOpen?"":" hidden")}>
        <div className="legend">
          <div className="row"><GitBranch size={13}/> {norm.nodes.length}</div>
          <div className="row"><Link2 size={13}/> {norm.links.length}</div>
          <div className="key" style={{flexWrap:"wrap",maxWidth:172,rowGap:5}}>
            {legendKinds.map(k=>{ const c=kindColors[k]; return (
              <span key={k}><span className="dot" style={c.ring?{background:"transparent",border:`1.5px solid ${c.hex}`}:{background:c.hex}}/>{k}</span>
            ); })}
          </div>
        </div>
        <div className="seg" style={{position:"absolute",top:12,right:14,zIndex:3}}>
          <button className={mode==="glow"?"on":""} onClick={()=>setMode("glow")} title="Glow" aria-label="Glow" style={{display:"flex",alignItems:"center"}}><Sparkles size={15}/></button>
          <button className={mode==="badge"?"on":""} onClick={()=>setMode("badge")} title="Badge" aria-label="Badge" style={{display:"flex",alignItems:"center"}}><Hash size={15}/></button>
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

        {dashView==="items"&&(
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
        )}

        {dashView==="para"&&<ParaView para={norm.para} onOpen={(e)=>{setSelected(null);setParaCard(e);}}/>}

        <div className="mono" style={{fontSize:10,color:"#4F587A",textAlign:"center",marginTop:6}}>single source of truth: the brain repo · {conn.token?`${conn.owner}/${conn.repo}`:"not connected"}</div>
      </div>

      <div className="capbar">
        <button onClick={openCapture} className="tap" style={{flex:1,textAlign:"left",fontFamily:"inherit",background:"#161E33",border:"1px solid #2A3556",borderRadius:12,color:"#6E7794",padding:"12px 14px",fontSize:14,cursor:"pointer"}}>Drop a thought…</button>
        <button onClick={openCapture} className="tap" style={{background:"#8B7CFF",color:"#0E1424",border:"none",borderRadius:12,padding:"0 16px",fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:4}}><Plus size={17}/> Add</button>
      </div>

      {showCapture&&(
        <div className="sheet" style={{zIndex:16,animationDuration:".16s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span className="disp" style={{fontSize:18,fontWeight:700}}>Capture</span>
            <button onClick={closeCapture} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>

          <div className="lbl" style={{margin:"0 0 5px"}}>File into</div>
          <button onClick={()=>setPickerOpen(o=>!o)} className="tap" style={{width:"100%",fontFamily:"inherit",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:"#0E1424",border:"1px solid #2A3556",borderRadius:10,padding:"10px 12px",fontSize:13,color:target?"#E8ECF7":"#8A94B0",cursor:"pointer"}}>
            <span style={{wordBreak:"break-word"}}>{!target?"Inbox (no card)":target.newType?targetLabel(target):`→ filing to ${target.label}`}</span>
            <ChevronDown size={15} style={{flexShrink:0,transform:pickerOpen?"rotate(180deg)":"none",transition:"transform .2s"}}/>
          </button>

          {pickerOpen&&(
            <div style={{marginTop:8,background:"#0E1424",border:"1px solid #232C46",borderRadius:12,padding:10}}>
              <input value={targetQuery} onChange={e=>setTargetQuery(e.target.value)} autoFocus placeholder="Search cards…" className="fld" style={{marginBottom:8}}/>
              <div style={{maxHeight:210,overflowY:"auto"}}>
                <button onClick={()=>chooseTarget(null)} className="tap" style={tRow}><span style={{color:"#8A94B0"}}>Inbox (no card)</span></button>
                {targetResults.map(t=>(
                  <button key={t.id} onClick={()=>chooseTarget({id:t.id,label:t.label})} className="tap" style={tRow}>
                    <span style={{color:"#E8ECF7",wordBreak:"break-word"}}>{t.label}</span>
                    <span className="mono" style={{fontSize:10,color:"#6B7494",flexShrink:0}}>{t.id}</span>
                  </button>
                ))}
                {!tq&&targetResults.length===0&&<div className="mono" style={{fontSize:11,color:"#5C678C",padding:"6px 4px"}}>No recent targets yet — type to search.</div>}
                <div style={{borderTop:"1px solid #232C46",marginTop:8,paddingTop:8}}>
                  {tq
                    ? <><div className="mono" style={{fontSize:10.5,color:"#8A94B0",marginBottom:6}}>+ New card “{targetQuery.trim()}” as:</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {[["venture","Venture"],["incubation","Incubation"],["project","Project"],["area","Area"],["card","Let processor decide"]].map(([v,lbl])=>(
                            <button key={v} onClick={()=>chooseTarget({newType:v,name:targetQuery.trim()})} className="tap mono" style={{background:"#161E33",border:"1px solid #2A3556",borderRadius:8,color:"#E8ECF7",fontSize:10.5,padding:"5px 9px"}}>{lbl}</button>
                          ))}
                        </div></>
                    : <div className="mono" style={{fontSize:10.5,color:"#5C678C"}}>Type a name above to create a new card.</div>}
                </div>
              </div>
            </div>
          )}

          <textarea ref={capRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{ if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){ e.preventDefault(); capture(); } }} rows={6} placeholder={target?`Note for ${target.newType?target.name:target.label}…`:"Drop a thought — as long as you like…"} style={{width:"100%",marginTop:12,background:"#0E1424",border:"1px solid #232C46",borderRadius:12,color:"#E8ECF7",padding:"12px 14px",fontSize:14,lineHeight:1.5,outline:"none",resize:"none",fontFamily:"'Inter',sans-serif"}}/>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:10}}>
            <span className="mono" style={{fontSize:10,color:"#6B7494"}}>{target?"entries stay here · ⌘/Ctrl+↵":"⌘/Ctrl+↵ to add"}</span>
            <button onClick={capture} disabled={!draft.trim()} className="tap" style={{background:draft.trim()?"#8B7CFF":"#2A3556",color:draft.trim()?"#0E1424":"#6B7494",border:"none",borderRadius:11,padding:"10px 18px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:5,cursor:draft.trim()?"pointer":"default"}}><Plus size={16}/> Add</button>
          </div>
        </div>
      )}

      {node&&(
        <div className="sheet">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}><span style={{width:12,height:12,borderRadius:"50%",background:(kindColors[node.kind]?.hex||"#6B7494"),boxShadow:`0 0 10px ${(kindColors[node.kind]?.hex||"#6B7494")}`}}/><span className="disp" style={{fontSize:20,fontWeight:700}}>{node.label}</span><span className="chip" style={{background:((kindColors[node.kind]?.hex||"#6B7494"))+"22",color:(kindColors[node.kind]?.hex||"#6B7494")}}>{node.kind}</span></div>
            <button onClick={()=>{setSelected(null);setOpenDec(null);}} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>
          <div style={{fontSize:13.5,lineHeight:1.5,color:"#C3CAE0",marginBottom:16}}>{norm.summary[node.id]||<span style={{color:"#6B7494"}}>No summary yet — it'll appear after the next processing run.</span>}</div>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              {node.card
                ? <button onClick={()=>setCardOpen(o=>!o)} className="tap mono" style={{display:"flex",alignItems:"center",gap:5,background:"transparent",border:"none",color:"#8B7CFF",fontSize:11,padding:0}}><FileText size={13}/> {cardOpen?"Hide full card":"View full card"} <ChevronDown size={13} style={{transform:cardOpen?"rotate(180deg)":"none",transition:"transform .2s"}}/></button>
                : <span/>}
              <button onClick={()=>addThoughtTo({id:node.id,label:node.label})} className="tap mono" style={{display:"flex",alignItems:"center",gap:3,background:"#0E1424",border:"1px solid #8B7CFF",color:"#8B7CFF",borderRadius:99,padding:"5px 11px",fontSize:11,fontWeight:700,flexShrink:0}}><Plus size={13}/> Add</button>
            </div>
            {node.card&&cardOpen&&<div className="exp" style={{background:"#0E1424",border:"1px solid #232C46",borderRadius:12,padding:"12px 14px",marginTop:10,maxHeight:280,overflowY:"auto",fontSize:13,lineHeight:1.5,color:"#C3CAE0"}} dangerouslySetInnerHTML={{__html:mdToHtml(node.card)}}/>}
          </div>
          <div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:8}}>CONNECTIONS ({neighbors.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:nodeDecs.length?18:4}}>
            {neighbors.map(nb=>(<button key={nb.id} onClick={()=>{setSelected(nb.id);setOpenDec(null);}} className="tap" style={{background:"#0E1424",border:"1px solid #2A3556",borderRadius:10,padding:"7px 11px",color:"#E8ECF7",fontSize:12.5,display:"flex",alignItems:"center",gap:6}}>{nb.label} <span className="mono" style={{fontSize:9,color:"#6B7494"}}>{nb.rel}</span> <ArrowRight size={12} color="#6B7494"/></button>))}
          </div>
          {nodeDecs.length>0&&(<><div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:4}}>OPEN ITEMS</div>{nodeDecs.map(d=><DecRow key={d.id} d={d} compact resolved={resolved} openDec={openDec} setOpenDec={setOpenDec} outcome={outcome} setOutcome={setOutcome} onResolve={resolve} onReopen={reopen} onConvert={convert} onSnooze={snooze} onWakeNow={wakeNow} snoozeUntilDate={null} itemType={effType(d.id)} nameMap={norm.name}/>)}</>)}
        </div>
      )}

      {paraCard&&(
        <div className="sheet">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
              <span className="disp" style={{fontSize:20,fontWeight:700}}>{paraCard.label}</span>
              <span className="chip" style={{background:"#8B7CFF22",color:"#8B7CFF"}}>{paraCard._kind||"Card"}</span>
              {paraCard._resources
                ? <span className="mono" style={{fontSize:10,color:"#8A94B0"}}>{paraCard.count||0} ideas</span>
                : <span className="chip" style={(paraCard.open||0)>0?{background:"#F5B34422",color:"#F5B344"}:{background:"#5BD6A822",color:"#5BD6A8"}}>{(paraCard.open||0)>0?`${paraCard.open} open`:"clear"}</span>}
            </div>
            <button onClick={()=>setParaCard(null)} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>
          <div style={{fontSize:13.5,lineHeight:1.5,color:"#C3CAE0",marginBottom:16}}>{bodySummary(paraCard.body)||<span style={{color:"#6B7494"}}>No summary yet.</span>}</div>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              {paraCard.body
                ? <button onClick={()=>setParaBodyOpen(o=>!o)} className="tap mono" style={{display:"flex",alignItems:"center",gap:5,background:"transparent",border:"none",color:"#8B7CFF",fontSize:11,padding:0}}><FileText size={13}/> {paraBodyOpen?"Hide full card":"View full card"} <ChevronDown size={13} style={{transform:paraBodyOpen?"rotate(180deg)":"none",transition:"transform .2s"}}/></button>
                : <span/>}
              <button onClick={()=>addThoughtTo({id:paraCard.id,label:paraCard.label})} className="tap mono" style={{display:"flex",alignItems:"center",gap:3,background:"#0E1424",border:"1px solid #8B7CFF",color:"#8B7CFF",borderRadius:99,padding:"5px 11px",fontSize:11,fontWeight:700,flexShrink:0}}><Plus size={13}/> Add</button>
            </div>
            {paraCard.body&&paraBodyOpen&&<div className="exp" style={{background:"#0E1424",border:"1px solid #232C46",borderRadius:12,padding:"12px 14px",marginTop:10,maxHeight:280,overflowY:"auto",fontSize:13,lineHeight:1.5,color:"#C3CAE0"}} dangerouslySetInnerHTML={{__html:mdToHtml(paraCard.body)}}/>}
          </div>
          {paraDecs.length>0
            ? (<><div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:4}}>OPEN ITEMS</div>{paraDecs.map(d=><DecRow key={d.id} d={d} compact resolved={resolved} openDec={openDec} setOpenDec={setOpenDec} outcome={outcome} setOutcome={setOutcome} onResolve={resolve} onReopen={reopen} onConvert={convert} onSnooze={snooze} onWakeNow={wakeNow} snoozeUntilDate={null} itemType={effType(d.id)} nameMap={norm.name}/>)}</>)
            : <div className="mono" style={{fontSize:11,color:"#6B7494"}}>No open items on this card.</div>}
        </div>
      )}

      {showProcess&&(
        <div className="sheet" style={{zIndex:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",borderBottom:"1px solid #1B2440",marginBottom:14}}>
            <div className="tabs" style={{gap:"16px"}}>
              <button className={"stab tap"+(brainTab==="inbox"?" on":"")} onClick={()=>setBrainTab("inbox")}><Inbox size={13}/> Inbox<span className="n">({inboxCount})</span></button>
              <button className={"stab tap"+(brainTab==="outbox"?" on":"")} onClick={()=>setBrainTab("outbox")}><Upload size={13}/> Outbox<span className="n" style={failedCount>0?{color:"#F87171"}:undefined}>({outbox.length})</span></button>
              <button className={"stab tap"+(brainTab==="review"?" on":"")} onClick={()=>setBrainTab("review")}><Eye size={13}/> Review<span className="n" style={reviewCount>0?{color:"#F5B344"}:undefined}>({reviewCount})</span></button>
            </div>
            <button onClick={()=>setShowProcess(false)} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0",marginBottom:6}}><X size={20}/></button>
          </div>

          {brainTab==="inbox"&&(<>
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
          </>)}

          {brainTab==="outbox"&&(<>
            <div style={{fontSize:12.5,lineHeight:1.5,color:"#8A94B0",marginBottom:12}}>
              Writes queued for inbox.md. They sync automatically (one at a time); failed ones can be retried.
              {(pendingCount>0||failedCount>0)&&<><br/>
                {pendingCount>0&&<span style={{color:"#F5B344",fontWeight:600}}>{pendingCount} pending</span>}
                {pendingCount>0&&failedCount>0&&<span> · </span>}
                {failedCount>0&&<span style={{color:"#F87171",fontWeight:600}}>{failedCount} failed</span>}
              </>}
            </div>
            {(failedCount>0||(pendingCount>0&&!syncing))&&(
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {failedCount>0&&<button onClick={retryFailed} className="tap" style={{flex:1,background:"#8B7CFF",color:"#0E1424",border:"none",borderRadius:10,padding:"9px 12px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><RotateCcw size={14}/> Retry all failed ({failedCount})</button>}
                {pendingCount>0&&!syncing&&<button onClick={()=>flushOutbox()} className="tap" style={{flex:1,background:"#0E1424",color:"#F5B344",border:"1px solid #2A3556",borderRadius:10,padding:"9px 12px",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Upload size={14}/> Sync now</button>}
              </div>
            )}
            {outbox.length===0
              ? <div className="mono" style={{fontSize:11.5,color:"#5C678C",padding:"6px 0"}}>Nothing queued — all synced.</div>
              : <div style={{maxHeight:320,overflowY:"auto"}}>
                  {outbox.map(it=>(
                    <div key={it.id} style={{borderTop:"1px solid #232C46",padding:"10px 0"}}>
                      <div className="mono" style={{fontSize:11.5,color:"#C3CAE0",lineHeight:1.5,wordBreak:"break-word",whiteSpace:"pre-wrap"}}>{it.line}</div>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6}}>
                        {it.failed
                          ? <span className="chip" style={{background:"#F8717122",color:"#F87171"}}>failed{it.err?` · ${it.err}`:""}</span>
                          : <span className="chip" style={{background:"#F5B34422",color:"#F5B344"}}>{syncing?"syncing…":"pending"}</span>}
                        {it.failed&&<button onClick={()=>retryItem(it.id)} className="tap mono" style={{display:"flex",alignItems:"center",gap:4,background:"#0E1424",border:"1px solid #2A3556",borderRadius:8,color:"#AEB7D4",fontSize:10.5,padding:"4px 9px"}}><RotateCcw size={11}/> retry</button>}
                      </div>
                    </div>
                  ))}
                </div>}
          </>)}

          {brainTab==="review"&&(<>
            <div style={{fontSize:12.5,lineHeight:1.5,color:"#8A94B0",marginBottom:12}}>
              Items the processor flagged for a look. Read-only here — <span style={{color:"#C3CAE0"}}>review these in the processor</span> to clear them.
              {norm.review.last_reviewed&&<><br/><span className="mono" style={{fontSize:10.5,color:"#6B7494"}}>last reviewed {norm.review.last_reviewed}</span></>}
            </div>
            {reviewItems.length===0
              ? <div className="mono" style={{fontSize:11.5,color:"#5C678C",padding:"6px 0"}}>Nothing to review.</div>
              : <div style={{maxHeight:320,overflowY:"auto"}}>
                  {reviewItems.map((it,i)=>(
                    <div key={it.id||i} style={{borderTop:"1px solid #232C46",padding:"10px 0"}}>
                      <div style={{fontSize:13,lineHeight:1.45,color:"#E8ECF7",wordBreak:"break-word"}}>{it.text}</div>
                      {it.reason&&<div className="mono" style={{fontSize:10.5,color:"#F5B344",marginTop:4,lineHeight:1.4}}>{it.reason}</div>}
                      {(it.card||it.date)&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:5,flexWrap:"wrap"}}>
                        {it.card&&<span className="chip" style={{background:"#8B7CFF22",color:"#8B7CFF"}}>{it.card}</span>}
                        {it.date&&<span className="mono" style={{fontSize:10,color:"#6B7494"}}>{it.date}</span>}
                      </div>}
                    </div>
                  ))}
                </div>}
          </>)}
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

// First non-empty, non-heading line of a card body → a one-line summary for the panel.
function bodySummary(body){
  for(const raw of (body||"").split("\n")){
    const l=raw.trim();
    if(!l || /^#{1,6}\s/.test(l)) continue;
    return l.replace(/^[-*]\s+/,"").slice(0,200);
  }
  return "";
}

// PARA dashboard view. Four sections in fixed order; Projects most prominent, Areas next,
// Resources quieter, Archive hidden when empty. Rows reuse the card styling; tapping a row
// opens the card panel (onOpen). Open/done counts come from the para entry ints; a card's
// open items themselves live in open_decisions (handled by the panel).
function ParaView({para,onOpen}){
  const sections=[
    {key:"projects",title:"Projects",kind:"Project",accent:"#F5B344",labelColor:"#E8ECF7",op:1},
    {key:"areas",title:"Areas",kind:"Area",accent:"#8B7CFF",labelColor:"#E8ECF7",op:1},
    {key:"resources",title:"Resources",kind:"Resource",accent:"#6B7494",labelColor:"#C3CAE0",op:0.95,resources:true},
    {key:"archive",title:"Archive",kind:"Archive",accent:"#4F587A",labelColor:"#AEB7D4",op:0.66,hideEmpty:true},
  ];
  return (
    <div>
      {sections.map(s=>{
        const list=Array.isArray(para?.[s.key])?para[s.key]:[];
        if(s.hideEmpty && list.length===0) return null;
        return (
          <div key={s.key} style={{marginBottom:16}}>
            <div className="mono" style={{fontSize:10,letterSpacing:".08em",color:s.accent,marginBottom:8,textTransform:"uppercase"}}>{s.title}{list.length?` · ${list.length}`:""}</div>
            {list.length===0
              ? <div className="mono" style={{fontSize:11,color:"#5C678C"}}>none yet</div>
              : list.map(e=><ParaRow key={e.id} e={e} labelColor={s.labelColor} op={s.op} resources={!!s.resources} onOpen={()=>onOpen({...e,_kind:s.kind,_resources:!!s.resources})}/>)}
          </div>
        );
      })}
    </div>
  );
}

function ParaRow({e,labelColor,op,resources,onOpen}){
  const open=e.open||0, done=e.done||0, total=open+done;
  return (
    <button onClick={onOpen} className="card tap" style={{display:"block",width:"100%",textAlign:"left",fontFamily:"inherit",padding:"11px 13px",marginBottom:9,opacity:op}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <span style={{fontSize:13.5,fontWeight:600,color:labelColor}}>{e.label}</span>
        {resources
          ? <span className="mono" style={{fontSize:10,color:"#8A94B0",flexShrink:0}}>{e.count||0} ideas</span>
          : <span className="chip" style={open>0?{background:"#F5B34422",color:"#F5B344",flexShrink:0}:{background:"#5BD6A822",color:"#5BD6A8",flexShrink:0}}>{open>0?`${open} open`:"clear"}</span>}
      </div>
      {!resources && total>0 && (<div style={{marginTop:8}}>
        <div style={{height:4,background:"#0E1424",borderRadius:99,overflow:"hidden"}}><div style={{width:`${Math.round(done/total*100)}%`,height:"100%",background:"#5BD6A8",borderRadius:99}}/></div>
        <div className="mono" style={{fontSize:9.5,color:"#6B7494",marginTop:4}}>{open} open · {done} done</div>
      </div>)}
    </button>
  );
}

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
