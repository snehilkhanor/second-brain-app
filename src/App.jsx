import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import ForceGraph3D from "3d-force-graph";
import { Brain, X, ArrowRight, Check, AlertTriangle, Plus, Zap, Sparkles, RotateCcw, ChevronDown, ChevronUp, Clock, GitBranch, Link2 } from "lucide-react";

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
  d1:{node:"trulymadly", flagged:true, text:"Pull the 40+ gender ratio on TM MAU before committing to premium 40+."},
  d2:{node:"trulymadly", text:"Test Twamev vs Tum Mile on ~40 real 40+ users."},
  d7:{node:"trulymadly", text:"Unified packaging: Select / Select Plus / VIP."},
  d3:{node:"thirdman", text:"Pricing fork: mass-prosumer vs premium CXO."},
  d4:{node:"thirdman", text:"Which AI primitives are reliable enough for a CXO today?"},
  d5:{node:"madlabs", text:"Incubate vs build vs partner for new lines."},
  d6:{node:"madlabs", text:"Fundraising path for TM / Mad Labs ($4-5M)."},
  d8:{node:"trumitr", text:"Re-run the AI Mitr A/B after revenue-drop cause is understood."},
  d9:{node:"snehil", text:"Build a Founder's Office + Chief of Staff role."},
  d10:{node:"snehil", text:"House purchase vs spend ceiling."},
};
const COL = { hub:0xF5B344, venture:0x8B7CFF, person:0x5BD6A8, org:0x5BD6A8, rival:0x6B7494 };
const HEX = { hub:"#F5B344", venture:"#8B7CFF", person:"#5BD6A8", org:"#5BD6A8", rival:"#6B7494" };
const NAME = Object.fromEntries(NODES.map(n=>[n.id,n.label]));
const decsByNode = {}; Object.entries(DEC).forEach(([id,v])=>{ (decsByNode[v.node]=decsByNode[v.node]||[]).push(id); });

// The graph engine is fed data in the brief's section-3 `graph.json` shape:
//   { nodes:[{id,label,type,connections,open_decisions}], links:[{source,target,label}], open_decisions:[...] }
// For now this is compiled from the design's sample data above. In Step 3 the
// exact same shape will instead be fetched from the private brain repo, so the
// engine code below won't need to change.
function buildGraphJson() {
  const deg = {};
  LINKS.forEach(([s,t])=>{ deg[s]=(deg[s]||0)+1; deg[t]=(deg[t]||0)+1; });
  const openByNode = {};
  Object.values(DEC).forEach(d=>{ openByNode[d.node]=(openByNode[d.node]||0)+1; });
  return {
    nodes: NODES.map(n=>({ id:n.id, label:n.label, type:n.kind, connections:deg[n.id]||0, open_decisions:openByNode[n.id]||0 })),
    links: LINKS.map(([source,target,label])=>({ source, target, label })),
    open_decisions: Object.entries(DEC).map(([id,d])=>({ id, card:d.node, text:d.text })),
  };
}

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

export default function App() {
  const mountRef=useRef(null);
  const [mode,setMode]=useState("glow");          // glow | badge
  const [brainOpen,setBrainOpen]=useState(true);
  const [selected,setSelected]=useState(null);
  const [resolved,setResolved]=useState({});
  const [captures,setCaptures]=useState([]);
  const [draft,setDraft]=useState("");
  const [openDec,setOpenDec]=useState(null);
  const [outcome,setOutcome]=useState("");
  const [toast,setToast]=useState(null);
  const selRef=useRef(null), modeRef=useRef("glow"), resRef=useRef({}), resizeRef=useRef(null);

  useEffect(()=>{(async()=>{
    try{const r=await window.storage.get("res_app"); if(r&&r.value) setResolved(JSON.parse(r.value));}catch(e){}
    try{const c=await window.storage.get("cap_app"); if(c&&c.value) setCaptures(JSON.parse(c.value));}catch(e){}
  })();},[]);
  const persist=async(k,v)=>{try{await window.storage.set(k,JSON.stringify(v));}catch(e){}};
  useEffect(()=>{selRef.current=selected;},[selected]);
  useEffect(()=>{modeRef.current=mode;},[mode]);
  useEffect(()=>{resRef.current=resolved;},[resolved]);
  useEffect(()=>{ const t=setTimeout(()=>resizeRef.current&&resizeRef.current(),70); return ()=>clearTimeout(t); },[brainOpen]);

  const resolvedCount=Object.keys(resolved).length, captureCount=captures.length;
  const openCountTotal=Object.keys(DEC).length-resolvedCount;
  const momentum=NODES.length*2+LINKS.length*3+resolvedCount*30+captureCount*4;
  const level=Math.floor(momentum/60)+1, intoLevel=momentum%60, pct=Math.round(intoLevel/60*100);

  const showToast=(msg,undo)=>{setToast({msg,undo}); setTimeout(()=>setToast(null),4000);};
  const resolve=(id)=>{const next={...resolved,[id]:{ts:Date.now(),outcome:outcome.trim()}};
    setResolved(next);persist("res_app",next);setOpenDec(null);setOutcome("");
    showToast("Resolved + 30",()=>{const r={...next};delete r[id];setResolved(r);persist("res_app",r);setToast(null);});};
  const reopen=(id)=>{const r={...resolved};delete r[id];setResolved(r);persist("res_app",r);};
  const capture=()=>{const t=draft.trim();if(!t)return;const next=[{t,ts:Date.now()},...captures];
    setCaptures(next);persist("cap_app",next);setDraft("");showToast("Captured to inbox");};

  useEffect(()=>{
    const mount=mountRef.current; if(!mount) return;

    // Data in the brief's graph.json shape (compiled from sample data for now;
    // Step 3 swaps the source to the private brain repo, same shape).
    const data=buildGraphJson();
    const refs={};   // id -> { ng, core, typeHalo, alertHalo, badge, r }

    // One node's visual — ported verbatim from the design: glowing core sized by
    // connections, type-coloured halo, amber alert halo, label sprite, count badge.
    function makeNode(node){
      const col=COL[node.type] ?? COL.rival;
      const r=4+(node.connections||1)*1.8; const ng=new THREE.Group();
      const core=new THREE.Mesh(new THREE.SphereGeometry(r,20,20),
        new THREE.MeshPhongMaterial({color:col,emissive:col,emissiveIntensity:0.5,shininess:60}));
      core.userData={id:node.id,r}; ng.add(core);
      const typeHalo=new THREE.Mesh(new THREE.SphereGeometry(r*1.7,16,16),
        new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.1,blending:THREE.AdditiveBlending,depthWrite:false})); ng.add(typeHalo);
      const alertHalo=new THREE.Mesh(new THREE.SphereGeometry(r*2.1,16,16),
        new THREE.MeshBasicMaterial({color:0xF5B344,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false})); ng.add(alertHalo);
      const label=textSprite(node.label,"#AEB7D4",false); label.position.set(0,r+7,0); ng.add(label);
      const badge=badgeSprite(0); badge.position.set(r*1.1,r*1.1,0); badge.visible=false; ng.add(badge);
      refs[node.id]={ng,core,typeHalo,alertHalo,badge,r};
      return ng;
    }

    // The 3d-force-graph engine: it owns physics, camera, drag and pinch-zoom.
    const Graph=ForceGraph3D({controlType:"orbit"})(mount)
      .graphData(data)
      .backgroundColor("rgba(0,0,0,0)")     // transparent so the CSS radial gradient shows through
      .showNavInfo(false)
      .nodeThreeObject(makeNode)
      .nodeLabel(()=>"")                     // labels are sprites; suppress the hover tooltip
      .linkColor(()=>"#8B7CFF")
      .linkOpacity(0.22)
      .linkWidth(0)
      .enableNodeDrag(false)   // match the design: drag rotates the cloud, tap selects a node
      .onNodeClick(n=>setSelected(n.id))
      .onBackgroundClick(()=>setSelected(null));

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
      const res=resRef.current, md=modeRef.current, sel=selRef.current;
      controls.autoRotate = !sel;
      data.nodes.forEach(n=>{
        const R=refs[n.id]; if(!R) return;
        const open=(decsByNode[n.id]||[]).filter(d=>!res[d]).length;
        const isSel=sel===n.id; const ts=isSel?1.5:1;
        R.core.scale.lerp(new THREE.Vector3(ts,ts,ts),0.2);
        if(md==="glow"){ R.badge.visible=false; R.typeHalo.material.opacity=0.1;
          const pulse=0.12+0.10*Math.sin(clock*1.4);
          R.alertHalo.material.opacity = open>0 ? pulse : 0;
          R.core.material.emissiveIntensity = isSel?1.0:(open>0?0.85:0.5);
        } else { R.alertHalo.material.opacity=0; R.typeHalo.material.opacity=0; R.core.material.emissiveIntensity=isSel?0.9:0.32;
          if(open>0){ if(R.badge.userData.count!==open){ R.ng.remove(R.badge); const b=badgeSprite(open);
              b.position.set(R.r*1.1,R.r*1.1,0); R.ng.add(b); R.badge=b; } R.badge.visible=true; }
          else R.badge.visible=false;
        }
      });
    }
    decorate();

    function rs(){const W=mount.clientWidth,H=mount.clientHeight; if(W===0||H===0) return; Graph.width(W).height(H);}
    rs(); resizeRef.current=rs;
    const ro=new ResizeObserver(()=>rs()); ro.observe(mount);

    return ()=>{ cancelAnimationFrame(raf); ro.disconnect(); Graph._destructor(); };
  },[]);

  const node=selected?NODES.find(n=>n.id===selected):null;
  const neighbors=selected?LINKS.filter(l=>l[0]===selected||l[1]===selected).map(l=>{const o=l[0]===selected?l[1]:l[0];return{id:o,rel:l[2],label:NAME[o]};}):[];
  const nodeDecs=selected?(decsByNode[selected]||[]).map(id=>({id,...DEC[id]})):[];
  const allDecs=Object.entries(DEC).map(([id,v])=>({id,...v})).sort((a,b)=>((resolved[a.id]?2:0)-(b.flagged?0.5:0))-((resolved[b.id]?2:0)-(a.flagged?0.5:0)));

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
  .dash{flex:1;overflow-y:auto;padding:14px 16px 20px}
  .dash.hidden{display:none}
  .capbar{flex-shrink:0;display:flex;gap:8;padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));background:#0E1424;border-top:1px solid #232C46}
  .card{background:#161E33;border:1px solid #232C46;border-radius:16px;margin-bottom:13px}
  .tap{transition:all .15s;cursor:pointer}.tap:active{transform:scale(.97)}
  .sheet{position:absolute;left:0;right:0;bottom:0;background:#141B30;border-top:1px solid #2A3556;border-radius:20px 20px 0 0;padding:18px 18px 26px;box-shadow:0 -10px 40px rgba(0,0,0,.55);animation:up .26s cubic-bezier(.2,.8,.2,1);max-height:78%;overflow-y:auto;z-index:8}
  @keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
  .chip{font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700}
  .exp{animation:fade .2s}@keyframes fade{from{opacity:0}to{opacity:1}}
  .toast{animation:rise .25s}@keyframes rise{from{transform:translate(-50%,12px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
  input,textarea{font-family:'Inter'}
  `;

  const DecRow=({d,compact})=>{
    const isRes=!!resolved[d.id], isOpen=openDec===d.id;
    return (
      <div style={{borderTop:compact?"1px solid #232C46":"none",borderBottom:!compact?"1px solid #232C46":"none",padding:"10px 0",opacity:isRes?0.55:1}}>
        <div onClick={()=>{if(!isRes){setOpenDec(isOpen?null:d.id);setOutcome("");}}} className="tap" style={{display:"flex",gap:9,alignItems:"flex-start"}}>
          <div style={{flexShrink:0,width:20,height:20,borderRadius:6,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",background:isRes?"#5BD6A8":"transparent",border:isRes?"none":"1.5px solid #3A4366"}}>{isRes&&<Check size={13} color="#0E1424" strokeWidth={3}/>}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,lineHeight:1.42,color:isRes?"#8A94B0":"#E8ECF7",textDecoration:isRes?"line-through":"none"}}>
              {d.flagged&&!isRes&&<AlertTriangle size={12} color="#F5B344" style={{verticalAlign:"-2px",marginRight:4}}/>}{d.text}
            </div>
            <div className="mono" style={{fontSize:10,color:"#6B7494",marginTop:3}}>{NAME[d.node]}{isRes&&resolved[d.id].outcome?` · ${resolved[d.id].outcome}`:""}</div>
          </div>
          {!isRes&&<ChevronDown size={15} color="#6B7494" style={{flexShrink:0,marginTop:2,transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s"}}/>}
        </div>
        {isOpen&&!isRes&&(<div className="exp" style={{marginTop:9,marginLeft:29}}>
          <textarea value={outcome} onChange={e=>setOutcome(e.target.value)} rows={2} placeholder="What did you decide?" style={{width:"100%",background:"#0E1424",border:"1px solid #232C46",borderRadius:9,color:"#E8ECF7",padding:"8px 10px",fontSize:12.5,outline:"none",resize:"none"}}/>
          <button onClick={()=>resolve(d.id)} className="tap" style={{marginTop:7,background:"#5BD6A8",color:"#0E1424",border:"none",borderRadius:8,padding:"7px 13px",fontWeight:600,fontSize:12.5,display:"flex",alignItems:"center",gap:5}}><Check size={13}/> Resolve</button>
        </div>)}
        {isRes&&<button onClick={()=>reopen(d.id)} className="tap mono" style={{marginLeft:29,marginTop:4,background:"transparent",border:"none",color:"#6B7494",fontSize:10,display:"flex",alignItems:"center",gap:4,padding:0}}><RotateCcw size={10}/> reopen</button>}
      </div>
    );
  };

  return (
    <div className="wrap">
      <style>{css}</style>
      <div className="hd">
        <div style={{display:"flex",alignItems:"center",gap:8}}><Brain size={20} color="#8B7CFF"/><span className="disp" style={{fontWeight:700,fontSize:17}}>second brain</span></div>
        <div className="seg">
          <button className={mode==="glow"?"on":""} onClick={()=>setMode("glow")}>Glow</button>
          <button className={mode==="badge"?"on":""} onClick={()=>setMode("badge")}>Badge</button>
        </div>
      </div>

      <div className="phead" onClick={()=>setBrainOpen(o=>!o)}>
        <span className="mono" style={{fontSize:11,color:"#8A94B0"}}>BRAIN · {NODES.length} nodes · <span style={{color:"#F5B344"}}>{openCountTotal} open</span></span>
        <span className="tap mono" style={{display:"flex",alignItems:"center",gap:5,color:"#8A94B0",fontSize:11}}>
          {brainOpen?"collapse":"expand"} {brainOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
        </span>
      </div>

      <div className={"brain"+(brainOpen?"":" hidden")}>
        <div className="legend">
          <div className="row"><GitBranch size={13}/> {NODES.length}</div>
          <div className="row"><Link2 size={13}/> {LINKS.length}</div>
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
          <div style={{display:"flex",gap:14,marginTop:14}}>
            <Stat icon={<Sparkles size={13}/>} v={resolvedCount} l="resolved" c="#5BD6A8"/>
            <Stat icon={<Zap size={13}/>} v={captureCount} l="captured" c="#F5B344"/>
            <Stat icon={<AlertTriangle size={13}/>} v={openCountTotal} l="open" c="#8B7CFF"/>
          </div>
        </div>

        <div className="card" style={{padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}><span className="disp" style={{fontWeight:600,fontSize:14}}>All decisions</span><span className="mono" style={{fontSize:11,color:"#5BD6A8"}}>{resolvedCount} resolved</span></div>
          <div className="mono" style={{fontSize:10,color:"#6B7494",marginBottom:6}}>tap to act · or tap a node above</div>
          {allDecs.map(d=><DecRow key={d.id} d={d} compact/>)}
        </div>
        <div className="mono" style={{fontSize:10,color:"#4F587A",textAlign:"center",marginTop:6}}>single source of truth: the app db · plain-text backups</div>
      </div>

      <div className="capbar">
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&capture()} placeholder="Drop a thought..." style={{flex:1,background:"#161E33",border:"1px solid #2A3556",borderRadius:12,color:"#E8ECF7",padding:"12px 14px",fontSize:14,outline:"none"}}/>
        <button onClick={capture} className="tap" style={{background:"#8B7CFF",color:"#0E1424",border:"none",borderRadius:12,padding:"0 16px",fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:4}}><Plus size={17}/> Add</button>
      </div>

      {node&&(
        <div className="sheet">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}><span style={{width:12,height:12,borderRadius:"50%",background:HEX[node.kind],boxShadow:`0 0 10px ${HEX[node.kind]}`}}/><span className="disp" style={{fontSize:20,fontWeight:700}}>{node.label}</span><span className="chip" style={{background:HEX[node.kind]+"22",color:HEX[node.kind]}}>{node.kind}</span></div>
            <button onClick={()=>{setSelected(null);setOpenDec(null);}} className="tap" style={{background:"transparent",border:"none",color:"#8A94B0"}}><X size={20}/></button>
          </div>
          <div style={{fontSize:13.5,lineHeight:1.5,color:"#C3CAE0",marginBottom:16}}>{SUMMARY[node.id]}</div>
          <div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:8}}>CONNECTIONS ({neighbors.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:nodeDecs.length?18:4}}>
            {neighbors.map(nb=>(<button key={nb.id} onClick={()=>{setSelected(nb.id);setOpenDec(null);}} className="tap" style={{background:"#0E1424",border:"1px solid #2A3556",borderRadius:10,padding:"7px 11px",color:"#E8ECF7",fontSize:12.5,display:"flex",alignItems:"center",gap:6}}>{nb.label} <span className="mono" style={{fontSize:9,color:"#6B7494"}}>{nb.rel}</span> <ArrowRight size={12} color="#6B7494"/></button>))}
          </div>
          {nodeDecs.length>0&&(<><div className="mono" style={{fontSize:10,color:"#8A94B0",letterSpacing:".08em",marginBottom:4}}>OPEN DECISIONS</div>{nodeDecs.map(d=><DecRow key={d.id} d={d} compact/>)}</>)}
        </div>
      )}

      {toast&&(<div className="toast mono" style={{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"center",gap:12,background:"#1B2440",border:"1px solid #2E3960",color:"#E8ECF7",padding:"10px 16px",borderRadius:99,fontSize:12.5,fontWeight:600,zIndex:20,boxShadow:"0 6px 24px rgba(0,0,0,.5)"}}><span>{toast.msg}</span>{toast.undo&&<button onClick={toast.undo} className="tap" style={{background:"transparent",color:"#F5B344",border:"none",fontWeight:700,fontSize:12.5,display:"flex",alignItems:"center",gap:4}}><RotateCcw size={13}/> Undo</button>}</div>)}
    </div>
  );
}
function Stat({icon,v,l,c}){return(<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{color:c}}>{icon}</span><span className="mono" style={{fontSize:15,fontWeight:700}}>{v}</span><span className="mono" style={{fontSize:10,color:"#8A94B0"}}>{l}</span></div>);}
