import { useState, useEffect, useRef, useCallback } from "react";

const MODEL = "claude-sonnet-4-5";

const C = {
  bg:"#080B10", surface:"#0D1119", surfaceHi:"#121820",
  border:"#182030", borderHi:"#263650",
  accent:"#00D4FF", accentDim:"#071E2B",
  gold:"#F5C842", goldDim:"#2A200A",
  red:"#FF4560", redDim:"#2A0A10",
  green:"#00E396", greenDim:"#062A18",
  purple:"#B794F4", purpleDim:"#1A1030",
  orange:"#F6AD55",
  muted:"#3D5068", text:"#8BA3BC", textHi:"#E2EAF4",
};

const sc = s => s >= 75 ? C.green : s >= 50 ? C.gold : C.red;
const clamp = (v,mn,mx) => Math.min(mx,Math.max(mn,v));
const pct = (v,t=100) => `${Math.round((v/t)*100)}%`;
const fmt = d => new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});

const DIMS = [
  { id:"social",    label:"Social Media",     icon:"◈", color:C.accent,  defaultW:15 },
  { id:"reviews",   label:"Website Reviews",  icon:"◇", color:C.gold,    defaultW:20 },
  { id:"sentiment", label:"Brand Sentiment",  icon:"◉", color:C.purple,  defaultW:20 },
  { id:"annual",    label:"Annual Reports",   icon:"▣", color:C.green,   defaultW:20 },
  { id:"industry",  label:"Industry Reports", icon:"◆", color:C.orange,  defaultW:15 },
  { id:"analyst",   label:"Analyst Reports",  icon:"◐", color:C.red,     defaultW:10 },
];

const SOURCE_FEEDS = [
  { id:"brandwatch", label:"Brandwatch",  type:"social",    icon:"◈", color:C.accent  },
  { id:"trustpilot", label:"Trustpilot",  type:"reviews",   icon:"◇", color:C.gold    },
  { id:"bloomberg",  label:"Bloomberg",   type:"financial", icon:"▣", color:C.green   },
  { id:"factset",    label:"FactSet",     type:"analyst",   icon:"◐", color:C.red     },
  { id:"refinitiv",  label:"Refinitiv",   type:"financial", icon:"▤", color:C.purple  },
  { id:"similarweb", label:"SimilarWeb",  type:"digital",   icon:"◆", color:C.orange  },
];

const FEED_EVENTS = [
  "Negative sentiment spike detected for ASOS (+12% negative mentions)",
  "Review velocity drop for Marks & Spencer (-34% WoW on Trustpilot)",
  "Halfords profit warning filed — revenue guidance cut by 12%",
  "3 new analyst downgrades for Next plc this week",
  "Boots.com traffic down 18% vs 90-day average",
  "Kingfisher EV/EBITDA now 6.2x vs sector average of 9.1x",
  "John Lewis brand mentions up 28% post campaign launch",
  "Currys Trustpilot rating fell 3.8 → 3.1 in 30 days",
  "ASOS mobile app rating dropped to 2.9 in App Store",
  "Tesco Clubcard digital engagement up 34% YoY",
  "Debenhams brand search volume up 15% — acquisition signal?",
  "WH Smith airport segment NPS score at 3-year low",
];

const SYSTEM = `You are a senior investment intelligence analyst specialising in customer strategy value gaps.
Return ONLY a valid JSON object — no markdown, no commentary, no code fences.

Schema:
{
  "company": string,
  "ticker": string (or ""),
  "sector": string,
  "marketCap": string (e.g. "£2.4bn" or "Unknown"),
  "overallScore": integer 0-100,
  "opportunityRating": "HIGH"|"MEDIUM"|"LOW",
  "executiveSummary": string (2-3 sentences),
  "dimensions": {
    "social":    {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT"},
    "reviews":   {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT"},
    "sentiment": {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT"},
    "annual":    {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT"},
    "industry":  {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT"},
    "analyst":   {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT"}
  },
  "valueGaps": [{"area":string,"severity":"HIGH"|"MEDIUM"|"LOW","description":string,"estimatedUplift":string,"timeHorizon":string}],
  "catalysts": [string],
  "risks": [string],
  "investmentThesis": string,
  "peerBenchmarks": [{"company":string,"score":int,"note":string}],
  "alerts": [{"type":"SCORE_SHIFT"|"NEW_GAP"|"CATALYST","message":string}]
}

Score: 0-40=poor/large gap (biggest opportunity), 41-70=moderate, 71-100=strong realisation. Be specific and grounded.
CRITICAL: Your entire response must be a single valid JSON object. No text before or after it. No markdown. No code fences. Start with { and end with }.`;

async function callClaude(system, user, onDone, onError) {
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }]
      })
    });
    const d = await r.json();
    if (!r.ok) {
      onError(`API error ${r.status}: ${d?.error?.message || JSON.stringify(d)}`);
      return;
    }
    const t = d.content?.map(b => b.text || "").join("") || "";
    if (!t) { onError("Empty response from API"); return; }
    // Robustly extract the outermost JSON object
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1) {
      onError("No JSON object found in response. Got: " + t.slice(0, 300));
      return;
    }
    onDone(t.slice(start, end + 1));
  } catch(e) { onError("Network error: " + e.message); }
}

const STORAGE_KEY = "cbvig-v4";
async function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ── primitives ──
const Tag = ({ label, color }) => (
  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:2,
    background:color+"1A", color, border:`1px solid ${color}33`,
    fontFamily:"monospace", letterSpacing:1.2, textTransform:"uppercase", whiteSpace:"nowrap" }}>
    {label}
  </span>
);

const Meter = ({ value, color, height=4, max=100 }) => (
  <div style={{ background:C.border, borderRadius:2, height, overflow:"hidden", flex:1 }}>
    <div style={{ width:`${Math.round((value/max)*100)}%`, height:"100%", borderRadius:2,
      background:`linear-gradient(90deg,${color}55,${color})`,
      transition:"width 1s cubic-bezier(.4,0,.2,1)" }}/>
  </div>
);

const ScoreBadge = ({ score, size=52 }) => (
  <div style={{ width:size, height:size, borderRadius:"50%", display:"flex",
    alignItems:"center", justifyContent:"center", flexShrink:0,
    border:`2px solid ${sc(score)}`, background:sc(score)+"11",
    color:sc(score), fontWeight:700, fontSize:size*0.33, fontFamily:"monospace" }}>
    {score}
  </div>
);

const TrendArrow = ({ trend }) => (
  <span style={{ fontSize:10, color:trend==="UP"?C.green:trend==="DOWN"?C.red:C.muted }}>
    {trend==="UP"?"▲":trend==="DOWN"?"▼":"─"}
  </span>
);

const Pill = ({ label, active, onClick, color=C.accent }) => (
  <button onClick={onClick} style={{
    padding:"5px 14px", borderRadius:20, fontSize:11, cursor:"pointer",
    fontFamily:"DM Mono", letterSpacing:0.8, border:`1px solid ${active?color:C.border}`,
    background:active?color+"22":"transparent", color:active?color:C.muted,
    transition:"all 0.15s" }}>{label}</button>
);

const Divider = ({ title }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
    <span style={{ fontSize:9, fontFamily:"DM Mono", letterSpacing:3, color:C.muted, whiteSpace:"nowrap" }}>
      {title}
    </span>
    <div style={{ flex:1, height:1, background:C.border }}/>
  </div>
);

const Spinner = ({ text="ANALYSING" }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"36px 0" }}>
    <div style={{ width:30, height:30, borderRadius:"50%",
      border:`2px solid ${C.border}`, borderTop:`2px solid ${C.accent}`,
      animation:"spin 0.8s linear infinite" }}/>
    <p style={{ color:C.muted, fontSize:9, fontFamily:"DM Mono", letterSpacing:3 }}>{text}…</p>
  </div>
);

const Empty = ({ icon, text }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
    justifyContent:"center", height:300, gap:14, opacity:0.35 }}>
    <div style={{ fontSize:52, color:C.muted }}>{icon}</div>
    <div style={{ fontFamily:"DM Mono", fontSize:9, letterSpacing:3, color:C.muted }}>{text}</div>
  </div>
);

function Spark({ values, color, width=80, height=28 }) {
  if (!values||values.length<2) return null;
  const mn=Math.min(...values), mx=Math.max(...values), rng=mx-mn||1;
  const pts=values.map((v,i)=>
    `${(i/(values.length-1))*width},${height-(((v-mn)/rng)*height*0.8+height*0.1)}`
  ).join(" ");
  const last=pts.split(" ").at(-1).split(",");
  return (
    <svg width={width} height={height} style={{ overflow:"visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color}/>
    </svg>
  );
}

function RadarChart({ data, weights, size=190 }) {
  const cx=size/2, cy=size/2, r=size*0.37, n=DIMS.length;
  const pts=DIMS.map((_,i)=>{
    const a=(i/n)*2*Math.PI-Math.PI/2;
    const w=(weights[DIMS[i].id]||16)/100;
    const s=(data[DIMS[i].id]?.score||0)/100;
    const eff=clamp(s+(w-0.16)*0.25,0,1);
    return { x:cx+r*eff*Math.cos(a), y:cy+r*eff*Math.sin(a),
             bx:cx+r*Math.cos(a), by:cy+r*Math.sin(a),
             lx:cx+(r+20)*Math.cos(a), ly:cy+(r+20)*Math.sin(a),
             label:DIMS[i].label.split(" ")[0], color:DIMS[i].color };
  });
  return (
    <svg width={size} height={size}>
      {[0.25,0.5,0.75,1].map(f=>(
        <polygon key={f} points={DIMS.map((_,i)=>{
          const a=(i/n)*2*Math.PI-Math.PI/2;
          return `${cx+r*f*Math.cos(a)},${cy+r*f*Math.sin(a)}`;
        }).join(" ")} fill="none" stroke={C.border} strokeWidth={1}/>
      ))}
      {pts.map((p,i)=><line key={i} x1={cx} y1={cy} x2={p.bx} y2={p.by} stroke={C.border} strokeWidth={1}/>)}
      <polygon points={pts.map(p=>`${p.x},${p.y}`).join(" ")}
        fill={C.accent+"1A"} stroke={C.accent} strokeWidth={1.5}/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={p.color}/>
          <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill={C.muted} fontFamily="DM Mono">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════
export default function App() {
  const [analyses,  setAnalyses]  = useState([]);
  const [activeId,  setActiveId]  = useState(null);
  const [query,     setQuery]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [view,      setView]      = useState("analysis");
  const [watchlist, setWatchlist] = useState([]);
  const [weights,   setWeights]   = useState(Object.fromEntries(DIMS.map(d=>[d.id,d.defaultW])));
  const [compareIds,setCompareIds]= useState([]);
  const [alerts,    setAlerts]    = useState([]);
  const [feedLog,   setFeedLog]   = useState([]);
  const [feedActive,setFeedActive]= useState(Object.fromEntries(SOURCE_FEEDS.map(f=>[f.id,true])));
  const feedRef = useRef(null);
  const evIdx = useRef(0);

  useEffect(()=>{
    loadState().then(s=>{
      if(!s) return;
      if(s.analyses)  setAnalyses(s.analyses);
      if(s.watchlist) setWatchlist(s.watchlist);
      if(s.weights)   setWeights(s.weights);
      if(s.alerts)    setAlerts(s.alerts);
      if(s.activeId)  setActiveId(s.activeId);
    });
  },[]);

  useEffect(()=>{ saveState({analyses,watchlist,weights,alerts,activeId}); },
    [analyses,watchlist,weights,alerts,activeId]);

  // feed simulator
  useEffect(()=>{
    feedRef.current = setInterval(()=>{
      const active = SOURCE_FEEDS.filter(f=>feedActive[f.id]);
      if(!active.length) return;
      const src = active[Math.floor(Math.random()*active.length)];
      setFeedLog(prev=>[
        { id:Date.now(), source:src.label, color:src.color,
          msg:FEED_EVENTS[evIdx.current % FEED_EVENTS.length],
          ts:new Date().toLocaleTimeString() },
        ...prev.slice(0,59)
      ]);
      evIdx.current++;
    }, 3800);
    return ()=>clearInterval(feedRef.current);
  },[feedActive]);

  const weightedScore = useCallback((dims)=>{
    const tot=Object.values(weights).reduce((a,b)=>a+b,0)||100;
    return Math.round(DIMS.reduce((acc,d)=>acc+(dims[d.id]?.score||0)*(weights[d.id]/tot),0));
  },[weights]);

  useEffect(()=>{
    setAnalyses(prev=>prev.map(a=>({...a,weightedScore:weightedScore(a.dimensions)})));
  },[weights]);

  const analyse = () => {
    if(!query.trim()||loading) return;
    setLoading(true); setError("");
    const q=query.trim();
    callClaude(SYSTEM,
      `Analyse "${q}" for customer & brand value gap investment opportunity. Dimension weights: ${DIMS.map(d=>`${d.label}:${weights[d.id]}%`).join(", ")}. Return only the JSON.`,
      (text)=>{
        setLoading(false);
        try {
          const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
          const id=Date.now().toString();
          const ws=weightedScore(parsed.dimensions);
          const entry={...parsed,id,analysedAt:Date.now(),weightedScore:ws,scoreHistory:[ws]};
          setAnalyses(prev=>{
            const idx=prev.findIndex(a=>a.company.toLowerCase()===parsed.company.toLowerCase());
            if(idx>=0){
              const old=prev[idx];
              const hist=[...(old.scoreHistory||[old.weightedScore||old.overallScore]),ws].slice(-10);
              const updated={...entry,id:old.id,scoreHistory:hist};
              const next=[...prev]; next[idx]=updated;
              setActiveId(old.id);
              if(Math.abs(ws-(old.weightedScore||old.overallScore))>=5){
                setAlerts(a=>[{id:Date.now(),type:"SCORE_SHIFT",company:parsed.company,
                  message:`Score shifted ${ws>=(old.weightedScore||old.overallScore)?"+":""}${ws-(old.weightedScore||old.overallScore)} pts → ${ws}`,
                  ts:Date.now(),read:false},...a]);
              }
              return next;
            }
            setActiveId(id);
            if(parsed.alerts){
              setAlerts(a=>[...parsed.alerts.map(al=>({...al,id:Date.now()+Math.random(),
                company:parsed.company,ts:Date.now(),read:false})),...a]);
            }
            return [entry,...prev];
          });
          setQuery("");
        } catch(parseErr) { setError("JSON parse failed: " + parseErr.message + ". Raw response: " + text.slice(0,300)); }
      },
      (msg)=>{ setLoading(false); setError(msg); }
    );
  };

  const active = analyses.find(a=>a.id===activeId)||null;
  const unread = alerts.filter(a=>!a.read).length;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text,
      fontFamily:"'DM Sans','Helvetica Neue',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:${C.borderHi};border-radius:2px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadein{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .hov:hover{background:${C.surfaceHi}!important}
        input:focus,textarea:focus{outline:none;border-color:${C.accent}!important}
        input[type=range]{height:4px;border-radius:2px}
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom:`1px solid ${C.border}`, padding:"13px 22px",
        display:"flex", alignItems:"center", gap:14, flexShrink:0, flexWrap:"wrap" }}>
        <div style={{ width:32,height:32,borderRadius:6,flexShrink:0,
          background:`linear-gradient(135deg,${C.accent}22,${C.accentDim})`,
          border:`1px solid ${C.accent}44`,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:15,color:C.accent }}>⬡</div>
        <div>
          <div style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:3 }}>
            CUSTOMER &amp; BRAND INTELLIGENCE PLATFORM
          </div>
          <div style={{ fontWeight:600,fontSize:14,color:C.textHi,letterSpacing:-0.3 }}>
            Value Gap Opportunity Scanner
          </div>
        </div>
        <nav style={{ marginLeft:24, display:"flex", gap:2, flexWrap:"wrap" }}>
          {[
            {id:"analysis",  label:"Analysis"},
            {id:"watchlist", label:`Watchlist${watchlist.length?` (${watchlist.length})`:""}`},
            {id:"compare",   label:"Compare"},
            {id:"weights",   label:"Weighting"},
            {id:"feeds",     label:"Data Feeds"},
          ].map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{
              padding:"5px 13px",borderRadius:4,fontSize:11,border:"none",
              background:view===n.id?C.accent+"22":"transparent",
              color:view===n.id?C.accent:C.muted,
              fontFamily:"DM Mono",letterSpacing:0.5,cursor:"pointer",transition:"all 0.15s" }}>
              {n.label}
            </button>
          ))}
        </nav>
        <button onClick={()=>{ setView("watchlist"); setAlerts(a=>a.map(x=>({...x,read:true}))); }}
          style={{ marginLeft:"auto",padding:"5px 12px",borderRadius:5,fontSize:11,cursor:"pointer",
            border:`1px solid ${unread?C.gold+"55":C.border}`,
            background:unread?C.goldDim:"transparent",
            color:unread?C.gold:C.muted,fontFamily:"DM Mono",letterSpacing:0.5 }}>
          ◐ {unread>0?`${unread} ALERT${unread>1?"S":""}`:""} ALERTS
        </button>
      </header>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", height:"calc(100vh - 60px)" }}>

        {/* SIDEBAR */}
        <aside style={{ width:265, borderRight:`1px solid ${C.border}`,
          display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2.5,marginBottom:7 }}>
              ANALYSE ORGANISATION
            </div>
            <textarea value={query} onChange={e=>setQuery(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();analyse();} }}
              placeholder={"Company name…\n(Enter to run)"}
              style={{ width:"100%",height:58,background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.textHi,fontSize:12,padding:"7px 9px",
                resize:"none",fontFamily:"DM Sans",lineHeight:1.5 }}/>
            <button onClick={analyse} disabled={loading||!query.trim()} style={{
              marginTop:7,width:"100%",padding:"8px 0",
              background:loading||!query.trim()?C.border:C.accent,
              color:loading||!query.trim()?C.muted:"#000",
              border:"none",borderRadius:4,fontWeight:600,fontSize:10,
              fontFamily:"DM Mono",letterSpacing:1.5,cursor:loading||!query.trim()?"default":"pointer",
              transition:"all 0.2s" }}>
              {loading?"ANALYSING…":"RUN ANALYSIS →"}
            </button>
            {error&&<p style={{ color:C.red,fontSize:10,marginTop:5,lineHeight:1.5 }}>{error}</p>}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"6px" }}>
            {analyses.length===0&&!loading&&(
              <p style={{ padding:"14px 8px",color:C.muted,fontSize:11,lineHeight:1.7 }}>
                Enter a company name to begin scanning for customer &amp; brand value gap opportunities.
              </p>
            )}
            {loading&&<Spinner/>}
            {analyses.map(a=>(
              <button key={a.id} className="hov"
                onClick={()=>{ setActiveId(a.id); setView("analysis"); }}
                style={{ width:"100%",textAlign:"left",padding:"9px 11px",
                  background:activeId===a.id?C.surfaceHi:"transparent",
                  border:`1px solid ${activeId===a.id?C.borderHi:"transparent"}`,
                  borderRadius:5,marginBottom:3,cursor:"pointer",transition:"all 0.15s",display:"block" }}>
                <div style={{ display:"flex",alignItems:"center",gap:9,marginBottom:5 }}>
                  <ScoreBadge score={a.weightedScore||a.overallScore} size={36}/>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,fontSize:12,color:C.textHi,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                      {a.company}
                    </div>
                    <div style={{ fontSize:10,color:C.muted }}>{a.sector}</div>
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2 }}>
                    {watchlist.includes(a.id)&&<span style={{ color:C.gold,fontSize:11 }}>★</span>}
                    <Spark values={a.scoreHistory} color={sc(a.weightedScore||a.overallScore)} width={38} height={16}/>
                  </div>
                </div>
                <Tag label={`${a.opportunityRating} OPP`}
                  color={a.opportunityRating==="HIGH"?C.gold:a.opportunityRating==="MEDIUM"?C.accent:C.muted}/>
              </button>
            ))}
          </div>

          {analyses.length>0&&(
            <div style={{ borderTop:`1px solid ${C.border}`,padding:"9px 16px",
              display:"flex",gap:14,justifyContent:"space-around" }}>
              {[["TOTAL",analyses.length],["HIGH",analyses.filter(a=>a.opportunityRating==="HIGH").length],
                ["WATCH",watchlist.length]].map(([l,v])=>(
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"DM Mono",fontSize:13,color:C.textHi,fontWeight:500 }}>{v}</div>
                  <div style={{ fontFamily:"DM Mono",fontSize:8,color:C.muted,letterSpacing:2 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main style={{ flex:1, overflowY:"auto", padding:"22px 26px" }}>
          {view==="analysis"&&(
            <>
              {!active&&!loading&&<Empty icon="⬡" text="SELECT OR ANALYSE AN ORGANISATION"/>}
              {active&&(
                <AnalysisView r={active} weights={weights} weightedScore={weightedScore}
                  watchlist={watchlist} setWatchlist={setWatchlist}
                  compareIds={compareIds} setCompareIds={setCompareIds}/>
              )}
            </>
          )}
          {view==="watchlist"&&(
            <WatchlistView analyses={analyses} watchlist={watchlist} setWatchlist={setWatchlist}
              alerts={alerts} setAlerts={setAlerts} setActiveId={setActiveId} setView={setView}/>
          )}
          {view==="compare"&&(
            <CompareView analyses={analyses} compareIds={compareIds} setCompareIds={setCompareIds}
              weights={weights} weightedScore={weightedScore}/>
          )}
          {view==="weights"&&<WeightsView weights={weights} setWeights={setWeights}/>}
          {view==="feeds"&&<FeedsView feedLog={feedLog} feedActive={feedActive} setFeedActive={setFeedActive}/>}
        </main>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ANALYSIS VIEW
// ════════════════════════════════════════════════════════════════════════
function AnalysisView({ r, weights, weightedScore, watchlist, setWatchlist, compareIds, setCompareIds }) {
  const ws=r.weightedScore||r.overallScore;
  const inWatch=watchlist.includes(r.id);
  const inCompare=compareIds.includes(r.id);

  return (
    <div style={{ animation:"fadein 0.3s ease" }}>
      {/* header */}
      <div style={{ display:"flex",alignItems:"flex-start",gap:14,marginBottom:22 }}>
        <ScoreBadge score={ws}/>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:9,flexWrap:"wrap",marginBottom:5 }}>
            <h1 style={{ fontSize:20,fontWeight:600,color:C.textHi,letterSpacing:-0.3 }}>{r.company}</h1>
            {r.ticker&&<span style={{ fontFamily:"DM Mono",fontSize:10,color:C.muted,
              background:C.surface,border:`1px solid ${C.border}`,padding:"1px 7px",borderRadius:2 }}>
              {r.ticker}</span>}
            <Tag label={r.sector} color={C.muted}/>
            {r.marketCap&&r.marketCap!=="Unknown"&&<Tag label={r.marketCap} color={C.green}/>}
            <Tag label={`${r.opportunityRating} OPPORTUNITY`}
              color={r.opportunityRating==="HIGH"?C.gold:r.opportunityRating==="MEDIUM"?C.accent:C.muted}/>
          </div>
          <p style={{ fontSize:13,lineHeight:1.75,color:C.text,maxWidth:680 }}>{r.executiveSummary}</p>
        </div>
        <div style={{ display:"flex",gap:7,flexShrink:0 }}>
          <button onClick={()=>setWatchlist(w=>inWatch?w.filter(x=>x!==r.id):[...w,r.id])}
            style={{ padding:"5px 12px",borderRadius:4,fontSize:10,fontFamily:"DM Mono",cursor:"pointer",
              border:`1px solid ${inWatch?C.gold:C.border}`,background:inWatch?C.goldDim:"transparent",
              color:inWatch?C.gold:C.muted }}>
            {inWatch?"★ WATCHING":"☆ WATCH"}
          </button>
          <button onClick={()=>setCompareIds(c=>inCompare?c.filter(x=>x!==r.id):[...c.slice(-2),r.id])}
            style={{ padding:"5px 12px",borderRadius:4,fontSize:10,fontFamily:"DM Mono",cursor:"pointer",
              border:`1px solid ${inCompare?C.accent:C.border}`,background:inCompare?C.accentDim:"transparent",
              color:inCompare?C.accent:C.muted }}>
            {inCompare?"◉ COMPARE":"○ COMPARE"}
          </button>
        </div>
      </div>

      {/* dimensions + radar */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 210px",gap:14,marginBottom:18 }}>
        <div>
          <Divider title="DIMENSION SCORES (WEIGHTED)"/>
          <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
            {DIMS.map(dim=>{
              const d=r.dimensions[dim.id]||{};
              return (
                <div key={dim.id} style={{ background:C.surface,border:`1px solid ${C.border}`,
                  borderRadius:6,padding:"10px 13px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:6 }}>
                    <span style={{ color:dim.color,fontSize:13 }}>{dim.icon}</span>
                    <span style={{ fontSize:9,fontFamily:"DM Mono",color:C.muted,letterSpacing:1.5,flex:1 }}>
                      {dim.label.toUpperCase()}
                    </span>
                    <TrendArrow trend={d.trend||"FLAT"}/>
                    <span style={{ fontFamily:"DM Mono",fontSize:9,color:C.muted,marginLeft:4 }}>w:{weights[dim.id]}%</span>
                    <span style={{ fontFamily:"DM Mono",fontSize:12,fontWeight:600,color:sc(d.score||0),marginLeft:7 }}>
                      {d.score||0}
                    </span>
                  </div>
                  <Meter value={d.score||0} color={sc(d.score||0)}/>
                  {d.signal&&<p style={{ marginTop:4,fontSize:9,color:C.muted,fontFamily:"DM Mono" }}>↳ {d.signal}</p>}
                  <p style={{ marginTop:4,fontSize:11,color:C.text,lineHeight:1.6 }}>{d.insight}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
            padding:14,display:"flex",flexDirection:"column",alignItems:"center",gap:8 }}>
            <div style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2 }}>SIGNAL RADAR</div>
            <RadarChart data={r.dimensions} weights={weights} size={178}/>
          </div>
          {(r.scoreHistory||[]).length>1&&(
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12 }}>
              <div style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2,marginBottom:9 }}>
                SCORE HISTORY
              </div>
              <Spark values={r.scoreHistory} color={sc(ws)} width={178} height={38}/>
              <div style={{ display:"flex",justifyContent:"space-between",marginTop:5 }}>
                <span style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted }}>OLDEST</span>
                <span style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted }}>NOW: {ws}</span>
              </div>
            </div>
          )}
          {/* mini stats */}
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12 }}>
            <div style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2,marginBottom:9 }}>
              SCORE BREAKDOWN
            </div>
            {[["Weighted",r.weightedScore||r.overallScore,C.accent],
              ["Raw Overall",r.overallScore,C.muted]].map(([l,v,col])=>(
              <div key={l} style={{ marginBottom:8 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                  <span style={{ fontSize:9,color:C.muted }}>{l}</span>
                  <span style={{ fontSize:10,fontFamily:"DM Mono",color:col }}>{v}</span>
                </div>
                <Meter value={v} color={col}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* value gaps */}
      <Divider title="IDENTIFIED VALUE GAPS"/>
      <div style={{ display:"flex",flexDirection:"column",gap:7,marginBottom:18 }}>
        {(r.valueGaps||[]).map((g,i)=>(
          <div key={i} style={{ background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:6,padding:"11px 15px",display:"flex",gap:12,alignItems:"flex-start" }}>
            <div style={{ width:5,borderRadius:3,flexShrink:0,alignSelf:"stretch",minHeight:30,
              background:g.severity==="HIGH"?C.gold:g.severity==="MEDIUM"?C.accent:C.muted }}/>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap" }}>
                <span style={{ fontWeight:600,fontSize:13,color:C.textHi }}>{g.area}</span>
                <Tag label={`${g.severity} GAP`}
                  color={g.severity==="HIGH"?C.gold:g.severity==="MEDIUM"?C.accent:C.muted}/>
                {g.timeHorizon&&<Tag label={g.timeHorizon} color={C.purple}/>}
                {g.estimatedUplift&&(
                  <span style={{ marginLeft:"auto",fontFamily:"DM Mono",fontSize:10,
                    color:C.green,background:C.greenDim,padding:"2px 9px",
                    borderRadius:3,border:`1px solid ${C.green}33` }}>
                    {g.estimatedUplift}
                  </span>
                )}
              </div>
              <p style={{ fontSize:12,color:C.text,lineHeight:1.65 }}>{g.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* catalysts / risks */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18 }}>
        {[["CATALYSTS",r.catalysts||[],C.green,"↑"],["KEY RISKS",r.risks||[],C.red,"↓"]].map(([title,items,col,arrow])=>(
          <div key={title}>
            <Divider title={title}/>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"11px 14px" }}>
              {items.map((item,i)=>(
                <div key={i} style={{ display:"flex",gap:7,marginBottom:7,fontSize:12,color:C.text,lineHeight:1.6 }}>
                  <span style={{ color:col,flexShrink:0 }}>{arrow}</span>{item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* peers */}
      {(r.peerBenchmarks||[]).length>0&&(
        <>
          <Divider title="PEER BENCHMARKS"/>
          <div style={{ display:"flex",gap:10,marginBottom:18,flexWrap:"wrap" }}>
            {r.peerBenchmarks.map((p,i)=>(
              <div key={i} style={{ background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:6,padding:"10px 13px",minWidth:150 }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                  <ScoreBadge score={p.score} size={30}/>
                  <span style={{ fontWeight:600,fontSize:12,color:C.textHi }}>{p.company}</span>
                </div>
                <p style={{ fontSize:10,color:C.muted,lineHeight:1.5 }}>{p.note}</p>
              </div>
            ))}
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:6,padding:"10px 13px",flex:1,minWidth:180 }}>
              <div style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2,marginBottom:9 }}>
                RELATIVE POSITION
              </div>
              {[{company:r.company,score:ws,subject:true},...(r.peerBenchmarks||[])]
                .sort((a,b)=>b.score-a.score).map((p,i)=>(
                <div key={i} style={{ marginBottom:7 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                    <span style={{ fontSize:9,color:p.subject?C.textHi:C.muted }}>{p.company}</span>
                    <span style={{ fontSize:9,fontFamily:"DM Mono",color:sc(p.score) }}>{p.score}</span>
                  </div>
                  <Meter value={p.score} color={p.subject?C.accent:sc(p.score)} height={3}/>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* thesis */}
      <Divider title="INVESTMENT THESIS"/>
      <div style={{ background:`linear-gradient(135deg,${C.goldDim},${C.accentDim})`,
        border:`1px solid ${C.gold}33`,borderRadius:8,padding:"15px 18px",marginBottom:8 }}>
        <p style={{ fontSize:13,lineHeight:1.8,color:C.textHi }}>{r.investmentThesis}</p>
      </div>
      <p style={{ fontSize:8,color:C.muted,fontFamily:"DM Mono",letterSpacing:1 }}>
        ANALYSED {fmt(r.analysedAt)} · WEIGHTED SCORE {ws} · RAW SCORE {r.overallScore}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// WATCHLIST VIEW
// ════════════════════════════════════════════════════════════════════════
function WatchlistView({ analyses, watchlist, setWatchlist, alerts, setAlerts, setActiveId, setView }) {
  const watched=analyses.filter(a=>watchlist.includes(a.id));
  return (
    <div style={{ animation:"fadein 0.3s ease" }}>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3 }}>Watchlist</h2>
        <p style={{ fontSize:12,color:C.muted }}>{watched.length} companies monitored for opportunity shifts</p>
      </div>

      {alerts.length>0&&(
        <div style={{ marginBottom:22 }}>
          <Divider title="ALERTS"/>
          <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
            {alerts.slice(0,10).map((a,i)=>(
              <div key={i} style={{ background:C.surface,
                border:`1px solid ${a.read?C.border:C.gold+"44"}`,
                borderRadius:5,padding:"9px 13px",display:"flex",gap:10,alignItems:"flex-start" }}>
                <span style={{ fontSize:9,padding:"2px 6px",borderRadius:2,fontFamily:"DM Mono",flexShrink:0,
                  background:a.type==="SCORE_SHIFT"?C.gold+"22":a.type==="CATALYST"?C.green+"22":C.accent+"22",
                  color:a.type==="SCORE_SHIFT"?C.gold:a.type==="CATALYST"?C.green:C.accent,letterSpacing:1 }}>
                  {a.type||"ALERT"}
                </span>
                <div style={{ flex:1 }}>
                  {a.company&&<span style={{ fontSize:11,fontWeight:600,color:C.textHi,marginRight:7 }}>{a.company}</span>}
                  <span style={{ fontSize:11,color:C.text }}>{a.message}</span>
                </div>
                <span style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted,flexShrink:0 }}>{fmt(a.ts)}</span>
                {!a.read&&<div style={{ width:5,height:5,borderRadius:"50%",background:C.gold,flexShrink:0,marginTop:3 }}/>}
              </div>
            ))}
            <button onClick={()=>setAlerts([])}
              style={{ alignSelf:"flex-start",padding:"4px 12px",borderRadius:3,fontSize:10,
                border:`1px solid ${C.border}`,background:"transparent",color:C.muted,
                fontFamily:"DM Mono",cursor:"pointer" }}>
              CLEAR ALL
            </button>
          </div>
        </div>
      )}

      {watched.length===0&&<Empty icon="★" text="NO COMPANIES WATCHED — ADD FROM ANALYSIS VIEW"/>}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:11 }}>
        {watched.map(a=>(
          <div key={a.id} style={{ background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:7,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.15s" }}
            className="hov-border"
            onClick={()=>{ setActiveId(a.id); setView("analysis"); }}>
            <div style={{ display:"flex",alignItems:"center",gap:11,marginBottom:9 }}>
              <ScoreBadge score={a.weightedScore||a.overallScore} size={42}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600,fontSize:13,color:C.textHi }}>{a.company}</div>
                <div style={{ fontSize:10,color:C.muted }}>{a.sector}</div>
              </div>
              <button onClick={e=>{ e.stopPropagation(); setWatchlist(w=>w.filter(x=>x!==a.id)); }}
                style={{ background:"transparent",border:"none",color:C.gold,fontSize:15,padding:3,cursor:"pointer" }}>
                ★
              </button>
            </div>
            <Meter value={a.weightedScore||a.overallScore} color={sc(a.weightedScore||a.overallScore)} height={3}/>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:9 }}>
              <Tag label={`${a.opportunityRating} OPP`}
                color={a.opportunityRating==="HIGH"?C.gold:a.opportunityRating==="MEDIUM"?C.accent:C.muted}/>
              <Spark values={a.scoreHistory} color={sc(a.weightedScore||a.overallScore)} width={58} height={20}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// COMPARE VIEW
// ════════════════════════════════════════════════════════════════════════
function CompareView({ analyses, compareIds, setCompareIds, weights }) {
  const selected=analyses.filter(a=>compareIds.includes(a.id));
  return (
    <div style={{ animation:"fadein 0.3s ease" }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3 }}>Comparables Engine</h2>
        <p style={{ fontSize:12,color:C.muted }}>Select up to 3 companies to compare across all dimensions and gap areas</p>
      </div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:22 }}>
        {analyses.map(a=>(
          <Pill key={a.id} label={a.company} active={compareIds.includes(a.id)}
            color={sc(a.weightedScore||a.overallScore)}
            onClick={()=>setCompareIds(c=>c.includes(a.id)?c.filter(x=>x!==a.id):[...c.slice(-2),a.id])}/>
        ))}
      </div>
      {selected.length<2&&<Empty icon="○" text="SELECT 2–3 COMPANIES TO COMPARE"/>}
      {selected.length>=2&&(
        <>
          <Divider title="OVERALL WEIGHTED SCORE"/>
          <div style={{ display:"grid",gridTemplateColumns:`repeat(${selected.length},1fr)`,gap:11,marginBottom:20 }}>
            {selected.map(a=>(
              <div key={a.id} style={{ background:C.surface,border:`2px solid ${sc(a.weightedScore||a.overallScore)}33`,
                borderRadius:8,padding:14,textAlign:"center" }}>
                <ScoreBadge score={a.weightedScore||a.overallScore} size={52}/>
                <div style={{ marginTop:9,fontWeight:600,fontSize:13,color:C.textHi }}>{a.company}</div>
                <div style={{ fontSize:9,color:C.muted,marginBottom:7 }}>{a.sector}</div>
                <Tag label={`${a.opportunityRating} OPP`}
                  color={a.opportunityRating==="HIGH"?C.gold:a.opportunityRating==="MEDIUM"?C.accent:C.muted}/>
                <div style={{ marginTop:8 }}>
                  <Spark values={a.scoreHistory} color={sc(a.weightedScore||a.overallScore)} width={120} height={30}/>
                </div>
              </div>
            ))}
          </div>

          <Divider title="DIMENSION-BY-DIMENSION"/>
          <div style={{ display:"flex",flexDirection:"column",gap:6,marginBottom:20 }}>
            {DIMS.map(dim=>{
              const scores=selected.map(a=>a.dimensions[dim.id]?.score||0);
              const best=Math.max(...scores);
              return (
                <div key={dim.id} style={{ background:C.surface,border:`1px solid ${C.border}`,
                  borderRadius:6,padding:"11px 14px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:8 }}>
                    <span style={{ color:dim.color,fontSize:12 }}>{dim.icon}</span>
                    <span style={{ fontSize:9,fontFamily:"DM Mono",color:C.muted,letterSpacing:1.5,flex:1 }}>
                      {dim.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize:8,fontFamily:"DM Mono",color:C.muted }}>w:{weights[dim.id]}%</span>
                  </div>
                  <div style={{ display:"grid",gridTemplateColumns:`repeat(${selected.length},1fr)`,gap:8 }}>
                    {selected.map(a=>{
                      const s=a.dimensions[dim.id]?.score||0;
                      return (
                        <div key={a.id}>
                          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                            <span style={{ fontSize:9,color:s===best?C.textHi:C.muted }}>{a.company}</span>
                            <span style={{ fontSize:9,fontFamily:"DM Mono",color:sc(s) }}>{s}</span>
                          </div>
                          <Meter value={s} color={s===best?dim.color:sc(s)} height={3}/>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <Divider title="VALUE GAP COMPARISON"/>
          <div style={{ display:"grid",gridTemplateColumns:`repeat(${selected.length},1fr)`,gap:11 }}>
            {selected.map(a=>(
              <div key={a.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:13 }}>
                <div style={{ fontSize:11,fontWeight:600,color:C.textHi,marginBottom:9 }}>{a.company}</div>
                {(a.valueGaps||[]).slice(0,5).map((g,i)=>(
                  <div key={i} style={{ display:"flex",gap:6,marginBottom:6,alignItems:"flex-start" }}>
                    <div style={{ width:4,height:4,borderRadius:"50%",flexShrink:0,marginTop:4,
                      background:g.severity==="HIGH"?C.gold:g.severity==="MEDIUM"?C.accent:C.muted }}/>
                    <div>
                      <div style={{ fontSize:10,color:C.text,lineHeight:1.4 }}>{g.area}</div>
                      {g.estimatedUplift&&<div style={{ fontSize:9,color:C.green,fontFamily:"DM Mono" }}>{g.estimatedUplift}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// WEIGHTS VIEW
// ════════════════════════════════════════════════════════════════════════
function WeightsView({ weights, setWeights }) {
  const total=Object.values(weights).reduce((a,b)=>a+b,0);
  const presets=[
    { name:"Balanced",      vals:{social:15,reviews:20,sentiment:20,annual:20,industry:15,analyst:10} },
    { name:"Digital-First", vals:{social:25,reviews:25,sentiment:20,annual:10,industry:10,analyst:10} },
    { name:"Fundamentals",  vals:{social:5, reviews:10,sentiment:10,annual:30,industry:20,analyst:25} },
    { name:"Brand-Led",     vals:{social:20,reviews:15,sentiment:30,annual:10,industry:15,analyst:10} },
  ];
  return (
    <div style={{ animation:"fadein 0.3s ease",maxWidth:660 }}>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3 }}>Dimension Weighting</h2>
        <p style={{ fontSize:12,color:C.muted,lineHeight:1.65 }}>
          Tune how much each data source influences the weighted opportunity score.
          Changes apply immediately across all analyses and persist between sessions.
        </p>
      </div>
      <Divider title="PRESETS"/>
      <div style={{ display:"flex",gap:8,marginBottom:22,flexWrap:"wrap" }}>
        {presets.map(p=>(
          <button key={p.name} onClick={()=>setWeights(p.vals)} className="hov"
            style={{ padding:"6px 16px",borderRadius:4,fontSize:11,border:`1px solid ${C.border}`,
              background:"transparent",color:C.text,fontFamily:"DM Mono",letterSpacing:0.5,cursor:"pointer" }}>
            {p.name}
          </button>
        ))}
      </div>
      <Divider title="MANUAL ADJUSTMENT"/>
      <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:20 }}>
        {DIMS.map(dim=>(
          <div key={dim.id} style={{ background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:6,padding:"13px 15px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:9,marginBottom:9 }}>
              <span style={{ color:dim.color,fontSize:14 }}>{dim.icon}</span>
              <span style={{ fontSize:10,fontFamily:"DM Mono",color:C.text,letterSpacing:1,flex:1 }}>
                {dim.label.toUpperCase()}
              </span>
              <span style={{ fontFamily:"DM Mono",fontSize:15,fontWeight:600,color:dim.color,minWidth:38,textAlign:"right" }}>
                {weights[dim.id]}%
              </span>
            </div>
            <input type="range" min={0} max={50} value={weights[dim.id]}
              onChange={e=>setWeights(w=>({...w,[dim.id]:parseInt(e.target.value)}))}
              style={{ width:"100%",accentColor:dim.color,cursor:"pointer" }}/>
          </div>
        ))}
      </div>
      <div style={{ background:total===100?C.greenDim:C.redDim,
        border:`1px solid ${total===100?C.green:C.red}44`,
        borderRadius:6,padding:"11px 15px",display:"flex",alignItems:"center",gap:12 }}>
        <span style={{ fontFamily:"DM Mono",fontSize:20,fontWeight:700,color:total===100?C.green:C.red }}>
          {total}%
        </span>
        <span style={{ fontSize:12,color:total===100?C.green:C.red }}>
          {total===100?"Weights sum to 100% ✓":"Weights must sum to 100%"}
        </span>
        {total!==100&&(
          <button onClick={()=>{
            const keys=Object.keys(weights),diff=100-total;
            setWeights(w=>({...w,[keys[0]]:clamp(w[keys[0]]+diff,0,50)}));
          }} style={{ marginLeft:"auto",padding:"4px 11px",borderRadius:3,
            background:C.accent+"22",border:`1px solid ${C.accent}44`,
            color:C.accent,fontSize:9,fontFamily:"DM Mono",cursor:"pointer" }}>
            AUTO-FIX
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// FEEDS VIEW
// ════════════════════════════════════════════════════════════════════════
function FeedsView({ feedLog, feedActive, setFeedActive }) {
  return (
    <div style={{ animation:"fadein 0.3s ease" }}>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3 }}>Live Data Feeds</h2>
        <p style={{ fontSize:12,color:C.muted,lineHeight:1.65 }}>
          Simulated ingestion from Brandwatch, Trustpilot, Bloomberg, FactSet, Refinitiv and SimilarWeb.
          In production, each source connects via authenticated API keys and webhooks.
        </p>
      </div>
      <Divider title="CONNECTED SOURCES"/>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:24 }}>
        {SOURCE_FEEDS.map(f=>(
          <div key={f.id} style={{ background:C.surface,
            border:`1px solid ${feedActive[f.id]?f.color+"44":C.border}`,
            borderRadius:7,padding:"12px 13px",opacity:feedActive[f.id]?1:0.5,transition:"all 0.2s" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
              <span style={{ color:feedActive[f.id]?f.color:C.muted,fontSize:15 }}>{f.icon}</span>
              <span style={{ fontWeight:600,fontSize:12,color:C.textHi,flex:1 }}>{f.label}</span>
              {feedActive[f.id]&&(
                <div style={{ display:"flex",gap:2,alignItems:"flex-end" }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:3,borderRadius:1,background:f.color,
                      height:4+i*3,animation:`pulse ${0.5+i*0.2}s ease infinite` }}/>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <Tag label={f.type.toUpperCase()} color={f.color}/>
              <button onClick={()=>setFeedActive(a=>({...a,[f.id]:!a[f.id]}))}
                style={{ padding:"3px 9px",borderRadius:3,fontSize:9,cursor:"pointer",
                  border:`1px solid ${feedActive[f.id]?C.red+"44":C.green+"44"}`,
                  background:feedActive[f.id]?C.redDim:C.greenDim,
                  color:feedActive[f.id]?C.red:C.green,fontFamily:"DM Mono" }}>
                {feedActive[f.id]?"PAUSE":"RESUME"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <Divider title={`INGESTION LOG — ${feedLog.length} EVENTS`}/>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
        <div style={{ padding:"7px 13px",borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:6,height:6,borderRadius:"50%",background:C.green,animation:"pulse 1.2s infinite" }}/>
          <span style={{ fontFamily:"DM Mono",fontSize:8,color:C.muted,letterSpacing:2 }}>LIVE STREAM</span>
        </div>
        <div style={{ overflowY:"auto",maxHeight:460 }}>
          {feedLog.length===0&&(
            <p style={{ padding:"18px 14px",color:C.muted,fontSize:11,fontFamily:"DM Mono" }}>
              Waiting for feed events…
            </p>
          )}
          {feedLog.map((ev,i)=>(
            <div key={ev.id} style={{ borderBottom:`1px solid ${C.border}`,
              padding:"7px 13px",display:"flex",gap:9,alignItems:"flex-start",
              background:i===0?ev.color+"07":"transparent",
              animation:i===0?"fadein 0.3s ease":"none" }}>
              <span style={{ fontFamily:"DM Mono",fontSize:8,color:C.muted,flexShrink:0,paddingTop:2 }}>{ev.ts}</span>
              <span style={{ fontSize:9,fontFamily:"DM Mono",padding:"1px 6px",borderRadius:2,
                background:ev.color+"22",color:ev.color,flexShrink:0 }}>{ev.source}</span>
              <span style={{ fontSize:11,color:C.text,lineHeight:1.5 }}>{ev.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const clampFn = (v,mn,mx)=>Math.min(mx,Math.max(mn,v));
