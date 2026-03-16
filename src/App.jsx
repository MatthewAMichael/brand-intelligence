import { useState, useEffect, useRef, useCallback } from "react";

const MODEL = "claude-sonnet-4-5";

// ─── colour system ─────────────────────────────────────────────────────────
// GREEN = strong buy / high opportunity  GOLD = monitor  RED = poor signal
const C = {
  bg:"#060A0D", surface:"#0B1118", surfaceHi:"#101820",
  border:"#172030", borderHi:"#243A50",
  accent:"#00E396", accentDim:"#041A0F",   // PRIMARY = green (buy signal)
  accentB:"#00C4FF", accentBDim:"#041520", // SECONDARY = cyan (data)
  gold:"#F5C842", goldDim:"#2A200A",
  red:"#FF4560", redDim:"#2A0810",
  green:"#00E396", greenDim:"#041A0F",
  purple:"#B794F4", purpleDim:"#1A1030",
  orange:"#F6AD55",
  muted:"#3A5068", text:"#7A9BB8", textHi:"#E2EAF4",
};

// investment signal: green=buy, gold=watch, red=pass
const inv = r => r==="BUY" ? C.green : r==="WATCH" ? C.gold : C.red;
// dimension score colour (low score = under-realised = opportunity)
const sc = s => s >= 70 ? C.green : s >= 45 ? C.gold : C.red;
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const fmt = d => new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});

// ─── data signal dimensions ────────────────────────────────────────────────
const DIMS = [
  { id:"sentiment",  label:"Brand & Customer Sentiment", icon:"◉", color:C.accent,  defaultW:20 },
  { id:"social",     label:"Social & Community",         icon:"◈", color:C.accentB, defaultW:15 },
  { id:"reviews",    label:"Reviews & NPS",              icon:"◇", color:C.gold,    defaultW:15 },
  { id:"brand",      label:"Brand Equity & Tracking",    icon:"◆", color:C.purple,  defaultW:15 },
  { id:"financial",  label:"Financials & Annual Reports",icon:"▣", color:C.green,   defaultW:20 },
  { id:"analyst",    label:"Analyst & Market View",      icon:"◐", color:C.orange,  defaultW:15 },
];

// ─── customer capability domains (no brand names, pure framework) ──────────
const DOMAINS = [
  { id:"purpose",   label:"Purpose & Brand Strategy",    icon:"◎" },
  { id:"acquire",   label:"Customer Acquisition",        icon:"◈" },
  { id:"experience",label:"Customer Experience",         icon:"◇" },
  { id:"commerce",  label:"Commerce & Revenue Growth",   icon:"▣" },
  { id:"service",   label:"Service & Retention",         icon:"◆" },
  { id:"data",      label:"Data & Personalisation",      icon:"◉" },
  { id:"digital",   label:"Digital & Technology",        icon:"◐" },
  { id:"cost",      label:"Efficiency & Cost Optimisation",icon:"▤"},
];

// ─── live feed sources ─────────────────────────────────────────────────────
const FEEDS = [
  { id:"brandwatch", label:"Brandwatch",   type:"Sentiment", icon:"◉", color:C.accent  },
  { id:"twitter",    label:"Twitter / X",  type:"Social",    icon:"◈", color:C.accentB },
  { id:"instagram",  label:"Instagram",    type:"Social",    icon:"◈", color:C.purple  },
  { id:"reddit",     label:"Reddit",       type:"Community", icon:"◈", color:C.orange  },
  { id:"facebook",   label:"Facebook",     type:"Social",    icon:"◈", color:C.accentB },
  { id:"trustpilot", label:"Trustpilot",   type:"Reviews",   icon:"◇", color:C.gold    },
  { id:"bloomberg",  label:"Bloomberg",    type:"Financial", icon:"▣", color:C.green   },
  { id:"factset",    label:"FactSet",      type:"Analyst",   icon:"◐", color:C.orange  },
  { id:"refinitiv",  label:"Refinitiv",    type:"Financial", icon:"▤", color:C.purple  },
  { id:"similarweb", label:"SimilarWeb",   type:"Digital",   icon:"◆", color:C.accentB },
  { id:"abn",        label:"ABN Lookup",   type:"Registry",  icon:"▣", color:C.green   },
  { id:"kantar",     label:"Kantar BrandZ",type:"Brand",     icon:"◆", color:C.red     },
];

const FEED_EVENTS = [
  "Twitter/X: Qantas negative sentiment +22% WoW — service failure trending",
  "Reddit r/australia: Woolworths pricing thread — 4,200 upvotes, overwhelmingly negative",
  "Instagram: Bonds engagement rate dropped to 0.8% vs category avg 2.4%",
  "Facebook: JB Hi-Fi community group growing +18% MoM — under-leveraged",
  "Marks & Spencer Trustpilot velocity drop — reviews -34% WoW",
  "Halfords profit warning — revenue guidance cut 12%, digital stagnant",
  "ABN Lookup: Myer Holdings Ltd — registered VIC, ACN 119 085 602 confirmed",
  "Twitter/X: David Jones brand mentions +28% post campaign — sentiment inflecting",
  "Reddit r/personalfinance: CommBank app UX complaints thread — 890 comments",
  "Instagram: Cotton On UGC engagement +40% — community asset under-monetised",
  "Currys: Trustpilot 3.8 → 3.1 in 30 days, app store rating 2.7",
  "ABN Lookup: Wesfarmers Ltd — ABN 28 008 984 049, registered WA confirmed",
  "Reddit: Bunnings community — organic brand advocacy, 12k subreddit members",
  "Twitter/X: Kmart AU brand sentiment positive ratio 78% — loyalty signal strong",
  "Facebook: Harvey Norman page engagement down 34% — digital brand gap widening",
  "Instagram: Mecca Cosmetica — UGC generating 3x brand content, high advocacy",
];

// ─── SYSTEM PROMPT ─────────────────────────────────────────────────────────
const SYSTEM = `You are a senior investment analyst at a private equity firm specialising in customer strategy and brand-led value creation. Your role is identical to analysts at firms like Blackstone who assess whether an organisation's customer base, brand equity, and commercial capabilities are under-realised relative to what a transformation programme could unlock.

You think like a PE investor screening an acquisition target: what is the gap between current enterprise value and potential value? What is the right entry price? What investment is required? What is the expected return?

ORGANISATION IDENTIFICATION: Before analysing, determine the organisation's country of registration and headquarters. For Australian companies, reference ABN Lookup (abr.business.gov.au) and ASIC Connect records to confirm legal entity, ABN, ACN, and registered address. For US companies reference SEC EDGAR. For UK companies reference Companies House. Use this to confirm the correct currency, legal structure, and corporate narrative.

SOCIAL & COMMUNITY SIGNALS: Your analysis must incorporate signals from social media platforms including Twitter/X (brand mentions, sentiment, engagement trends), Facebook (community size, engagement, brand page activity), Instagram (visual brand equity, follower engagement, UGC), Reddit (organic community discussion, brand sentiment in relevant subreddits, unfiltered customer voice). These social signals are critical inputs for the sentiment, social, and brand dimensions.

Your analysis draws on: Twitter/X sentiment and mentions, Facebook community engagement, Instagram brand equity signals, Reddit organic discussion, customer reviews (Trustpilot, Google, App Store), NPS data, brand equity tracking (BrandZ, YouGov), annual reports, corporate narratives, ASX/NYSE/LSE filings, analyst reports, industry benchmarks, digital performance (SimilarWeb, App Annie), and customer satisfaction data.

Return ONLY a valid JSON object. No markdown, no code fences, no commentary. Start with { end with }.

Schema:
{
  "company": string,
  "ticker": string,
  "sector": string,
  "marketCap": string,
  "enterpriseValue": string,
  "investmentSignal": "BUY"|"WATCH"|"PASS",
  "confidenceLevel": "HIGH"|"MEDIUM"|"LOW",
  "overallScore": integer 0-100,
  "executiveSummary": string (3-4 sentences — what is the gap, why does it exist, what could unlock it),
  "customerStrategyScore": integer 0-100,
  "brandEquityScore": integer 0-100,
  "commercialScore": integer 0-100,
  "dimensions": {
    "sentiment":  {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT","source":string},
    "social":     {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT","source":string},
    "reviews":    {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT","source":string},
    "brand":      {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT","source":string},
    "financial":  {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT","source":string},
    "analyst":    {"score":int,"insight":string,"signal":string,"trend":"UP"|"DOWN"|"FLAT","source":string}
  },
  "customerProfile": {
    "estimatedCustomerBase": string,
    "npsEstimate": string,
    "satisfactionLevel": "HIGH"|"MEDIUM"|"LOW",
    "loyaltyStrength": "STRONG"|"MODERATE"|"WEAK",
    "communityEngagement": "HIGH"|"MEDIUM"|"LOW",
    "audienceInsight": string
  },
  "capabilityGaps": [
    {
      "domain": string,
      "severity": "CRITICAL"|"SIGNIFICANT"|"MODERATE",
      "currentState": string (2-3 sentences describing the specific problem with evidence),
      "potentialState": string (2-3 sentences describing what good looks like with specific outcomes),
      "interventions": [string] (3-5 specific actionable initiatives to close the gap),
      "revenueUplift": string (currency-denominated estimate e.g. "AUD 45-80m p.a."),
      "costReduction": string (currency-denominated estimate e.g. "AUD 12-20m p.a."),
      "investmentRequired": string (currency-denominated estimate e.g. "AUD 15-25m over 2 years"),
      "timeHorizon": "0-12 months"|"1-2 years"|"2-4 years",
      "kpiTargets": string (3-4 specific measurable KPI targets e.g. "NPS +20pts, conversion +2%, churn -15%"),
      "benchmarkReference": string (reference to a comparable company or industry benchmark that achieved similar outcomes)
    }
  ],
  "valueBridgeModel": {
    "currentEVEstimate": string,
    "potentialEVEstimate": string,
    "totalUpliftEstimate": string,
    "revenueGrowthComponent": string,
    "costEfficiencyComponent": string,
    "brandMultipleExpansion": string,
    "totalInvestmentRequired": string,
    "paybackPeriod": string,
    "directionalIRR": string,
    "acquisitionPriceGuidance": string,
    "valuationRationale": string
  },
  "catalysts": [string],
  "risks": [string],
  "investmentThesis": string,
  "peerBenchmarks": [{"company":string,"score":int,"signal":"BUY"|"WATCH"|"PASS","note":string}],
  "priorityRoadmap": [{"phase":string,"horizon":string,"initiatives":[string],"expectedValue":string}]
}

Score meanings — IMPORTANT: scores reflect how well the company CURRENTLY realises value. LOW score = large gap = HIGH opportunity for a PE investor. HIGH score = already well-realised = less upside.
Be specific, financially grounded, and reference real industry dynamics. Use real benchmarks where known.
CRITICAL: Return only the JSON object. Nothing else.
IMPORTANT: All financial figures must include the correct currency symbol. Use AUD (e.g. "AUD 2.4bn") for Australian companies, USD (e.g. "USD 1.2bn") for US companies, GBP (e.g. "£840m") for UK companies, and the appropriate local currency for all others. Never output a bare number without a currency symbol for any financial field.
IMPORTANT: For capabilityGaps, be thorough — this is the most important section. Provide 4-5 gaps with full detail including 3-5 specific interventions each, detailed currentState and potentialState (2-3 sentences each), currency-denominated financial estimates, specific KPI targets, and a benchmark reference.
For all other string fields keep to 1-2 sentences. Limit catalysts and risks to 4 items each. Limit peerBenchmarks to 3 items. Limit priorityRoadmap to 3 phases with 3 initiatives each.`;

// ─── API ───────────────────────────────────────────────────────────────────
// Using XMLHttpRequest instead of fetch for cross-browser reliability (Safari)
function callClaude(system, user, onDone, onError) {
  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: 5000,
    system,
    messages: [{ role:"user", content:user }]
  });

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/chat", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.timeout = 120000; // 2 minute timeout for long analyses

  xhr.onload = function() {
    // Catch Vercel timeout / infrastructure errors before trying to parse
    if (xhr.responseText.includes("FUNCTION_INVOCATION_TIMEOUT") ||
        xhr.responseText.includes("FUNCTION_INVOCATION_FAILED")) {
      onError("The analysis timed out on the server. Try a shorter company name or try again in a moment.");
      return;
    }
    try {
      const d = JSON.parse(xhr.responseText);
      if (xhr.status !== 200) {
        onError("API error " + xhr.status + ": " + (d?.error?.message || xhr.responseText.slice(0,200)));
        return;
      }
      const t = (d.content || []).map(b => b.text || "").join("");
      if (!t) { onError("Empty response from API"); return; }
      const s = t.indexOf("{"), e = t.lastIndexOf("}");
      if (s === -1 || e === -1) { onError("No JSON in response: " + t.slice(0,200)); return; }
      onDone(t.slice(s, e + 1));
    } catch(e) {
      onError("Response parse error: " + e.message + " — Raw: " + xhr.responseText.slice(0,150));
    }
  };

  xhr.onerror = function() {
    onError("Network error — could not reach the server. Check your connection and try again.");
  };

  xhr.ontimeout = function() {
    onError("Request timed out — the analysis took too long. Please try again.");
  };

  xhr.send(payload);
}

// ─── Storage ───────────────────────────────────────────────────────────────
const SK = "csv-v5";
async function loadState() {
  try{ const r=localStorage.getItem(SK); return r?JSON.parse(r):null; }catch{ return null; }
}
async function saveState(s) {
  try{ localStorage.setItem(SK,JSON.stringify(s)); }catch{}
}

// ─── UI Primitives ─────────────────────────────────────────────────────────
const Tag = ({label,color}) => (
  <span style={{fontSize:9,padding:"2px 8px",borderRadius:2,background:color+"18",color,
    border:`1px solid ${color}30`,fontFamily:"monospace",letterSpacing:1.2,
    textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>
);

const Meter = ({value,color,height=4,max=100}) => (
  <div style={{background:C.border,borderRadius:2,height,overflow:"hidden",flex:1}}>
    <div style={{width:`${Math.round((value/max)*100)}%`,height:"100%",borderRadius:2,
      background:`linear-gradient(90deg,${color}44,${color})`,
      transition:"width 1s cubic-bezier(.4,0,.2,1)"}}/>
  </div>
);

const ScoreBadge = ({score,size=52,signal=null}) => {
  const col = signal ? inv(signal) : sc(score);
  return (
    <div style={{width:size,height:size,borderRadius:"50%",display:"flex",
      alignItems:"center",justifyContent:"center",flexShrink:0,
      border:`2px solid ${col}`,background:col+"11",
      color:col,fontWeight:700,fontSize:size*0.32,fontFamily:"monospace"}}>
      {signal||score}
    </div>
  );
};

const SignalBadge = ({signal,large=false}) => {
  const col=inv(signal);
  const icons={"BUY":"▲","WATCH":"◆","PASS":"▼"};
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,
      background:col+"15",border:`1px solid ${col}33`,
      borderRadius:4,padding:large?"8px 16px":"4px 10px"}}>
      <span style={{color:col,fontSize:large?16:11}}>{icons[signal]}</span>
      <span style={{fontFamily:"DM Mono",fontSize:large?14:10,fontWeight:600,
        color:col,letterSpacing:1.5}}>{signal}</span>
    </div>
  );
};

const TrendArrow = ({trend}) => (
  <span style={{fontSize:10,color:trend==="UP"?C.green:trend==="DOWN"?C.red:C.muted}}>
    {trend==="UP"?"▲":trend==="DOWN"?"▼":"─"}
  </span>
);

const Pill = ({label,active,onClick,color=C.accent}) => (
  <button onClick={onClick} style={{padding:"4px 13px",borderRadius:20,fontSize:11,cursor:"pointer",
    fontFamily:"DM Mono",letterSpacing:0.8,border:`1px solid ${active?color:C.border}`,
    background:active?color+"20":"transparent",color:active?color:C.muted,transition:"all 0.15s"}}>
    {label}
  </button>
);

const Divider = ({title}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
    <span style={{fontSize:9,fontFamily:"DM Mono",letterSpacing:3,color:C.muted,whiteSpace:"nowrap"}}>{title}</span>
    <div style={{flex:1,height:1,background:C.border}}/>
  </div>
);

const Spinner = ({text="ANALYSING"}) => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"36px 0"}}>
    <div style={{width:28,height:28,borderRadius:"50%",
      border:`2px solid ${C.border}`,borderTop:`2px solid ${C.accent}`,
      animation:"spin 0.8s linear infinite"}}/>
    <p style={{color:C.muted,fontSize:9,fontFamily:"DM Mono",letterSpacing:3}}>{text}…</p>
  </div>
);

const Empty = ({icon,text}) => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",
    justifyContent:"center",height:300,gap:14,opacity:0.3}}>
    <div style={{fontSize:48,color:C.muted}}>{icon}</div>
    <div style={{fontFamily:"DM Mono",fontSize:9,letterSpacing:3,color:C.muted}}>{text}</div>
  </div>
);

function Spark({values,color,width=80,height=26}) {
  if(!values||values.length<2) return null;
  const mn=Math.min(...values),mx=Math.max(...values),rng=mx-mn||1;
  const pts=values.map((v,i)=>`${(i/(values.length-1))*width},${height-(((v-mn)/rng)*height*0.8+height*0.1)}`).join(" ");
  const last=pts.split(" ").at(-1).split(",");
  return (
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color}/>
    </svg>
  );
}

function RadarChart({data,weights,size=185}) {
  const cx=size/2,cy=size/2,r=size*0.36,n=DIMS.length;
  const pts=DIMS.map((_,i)=>{
    const a=(i/n)*2*Math.PI-Math.PI/2;
    const w=(weights[DIMS[i].id]||16)/100;
    const s=(data[DIMS[i].id]?.score||0)/100;
    const eff=clamp(s+(w-0.16)*0.2,0,1);
    return {x:cx+r*eff*Math.cos(a),y:cy+r*eff*Math.sin(a),
            bx:cx+r*Math.cos(a),by:cy+r*Math.sin(a),
            lx:cx+(r+22)*Math.cos(a),ly:cy+(r+22)*Math.sin(a),
            label:DIMS[i].label.split(" ")[0],color:DIMS[i].color};
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
        fill={C.accent+"18"} stroke={C.accent} strokeWidth={1.5}/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={p.color}/>
          <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
            fontSize={7.5} fill={C.muted} fontFamily="DM Mono">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [analyses,   setAnalyses]   = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [view,       setView]       = useState("analysis");
  const [watchlist,  setWatchlist]  = useState([]);
  const [weights,    setWeights]    = useState(Object.fromEntries(DIMS.map(d=>[d.id,d.defaultW])));
  const [compareIds, setCompareIds] = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [feedLog,    setFeedLog]    = useState([]);
  const [feedActive, setFeedActive] = useState(Object.fromEntries(FEEDS.map(f=>[f.id,true])));
  const feedRef=useRef(null); const evIdx=useRef(0);

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

  useEffect(()=>{
    feedRef.current=setInterval(()=>{
      const active=FEEDS.filter(f=>feedActive[f.id]);
      if(!active.length) return;
      const src=active[Math.floor(Math.random()*active.length)];
      setFeedLog(prev=>[
        {id:Date.now(),source:src.label,color:src.color,
         msg:FEED_EVENTS[evIdx.current%FEED_EVENTS.length],
         ts:new Date().toLocaleTimeString()},
        ...prev.slice(0,59)
      ]);
      evIdx.current++;
    },3800);
    return()=>clearInterval(feedRef.current);
  },[feedActive]);

  const weightedScore=useCallback((dims)=>{
    const tot=Object.values(weights).reduce((a,b)=>a+b,0)||100;
    return Math.round(DIMS.reduce((acc,d)=>acc+(dims[d.id]?.score||0)*(weights[d.id]/tot),0));
  },[weights]);

  useEffect(()=>{
    setAnalyses(prev=>prev.map(a=>({...a,weightedScore:weightedScore(a.dimensions)})));
  },[weights]);

  const analyse=()=>{
    if(!query.trim()||loading) return;
    setLoading(true); setError("");
    const q=query.trim();
    callClaude(SYSTEM,
      `Conduct a full customer strategy and brand-led value creation assessment for: "${q}". First identify the organisation's country of registration and headquarters to determine the correct currency and confirm entity details (ABN/ACN for Australian companies, SEC for US, Companies House for UK). Then analyse this organisation as a PE investor would — identifying the gap between current enterprise value and what could be unlocked through customer strategy transformation. Draw on all available signals including Twitter/X, Facebook, Instagram, Reddit and other social platforms to inform the sentiment, social and brand dimensions. Dimension weights: ${DIMS.map(d=>`${d.label}:${weights[d.id]}%`).join(", ")}. Return only the JSON.`,
      (text)=>{
        setLoading(false);
        try{
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
            if(parsed.alerts) setAlerts(a=>[...parsed.alerts.map(al=>({...al,
              id:Date.now()+Math.random(),company:parsed.company,ts:Date.now(),read:false})),...a]);
            return [entry,...prev];
          });
          setQuery("");
        }catch(e){ setError("Parse error: "+e.message+". Got: "+text.slice(0,200)); }
      },
      (msg)=>{ setLoading(false); setError(msg); }
    );
  };

  const active=analyses.find(a=>a.id===activeId)||null;
  const unread=alerts.filter(a=>!a.read).length;

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,
      fontFamily:"'DM Sans','Helvetica Neue',sans-serif",display:"flex",flexDirection:"column"}}>
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
        .hov-border:hover{border-color:${C.borderHi}!important}
      `}</style>

      {/* HEADER */}
      <header style={{borderBottom:`1px solid ${C.border}`,padding:"12px 22px",
        display:"flex",alignItems:"center",gap:14,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{width:30,height:30,borderRadius:6,flexShrink:0,
          background:`linear-gradient(135deg,${C.accent}22,${C.accentDim})`,
          border:`1px solid ${C.accent}44`,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:14,color:C.accent}}>⬡</div>
        <div>
          <div style={{fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:3}}>
            CUSTOMER STRATEGY &amp; VALUE CREATION INTELLIGENCE
          </div>
          <div style={{fontWeight:600,fontSize:14,color:C.textHi,letterSpacing:-0.3}}>
            Enterprise Value Gap Assessment
          </div>
        </div>
        <nav style={{marginLeft:24,display:"flex",gap:2,flexWrap:"wrap"}}>
          {[
            {id:"analysis", label:"Analysis"},
            {id:"watchlist",label:`Watchlist${watchlist.length?` (${watchlist.length})`:""}`},
            {id:"compare",  label:"Compare"},
            {id:"weights",  label:"Weighting"},
            {id:"feeds",    label:"Data Feeds"},
          ].map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{
              padding:"5px 12px",borderRadius:4,fontSize:11,border:"none",cursor:"pointer",
              background:view===n.id?C.accent+"20":"transparent",
              color:view===n.id?C.accent:C.muted,
              fontFamily:"DM Mono",letterSpacing:0.5,transition:"all 0.15s"}}>
              {n.label}
            </button>
          ))}
        </nav>
        <button onClick={()=>{ setView("watchlist"); setAlerts(a=>a.map(x=>({...x,read:true}))); }}
          style={{marginLeft:"auto",padding:"5px 12px",borderRadius:4,fontSize:11,cursor:"pointer",
            border:`1px solid ${unread?C.gold+"55":C.border}`,
            background:unread?C.goldDim:"transparent",
            color:unread?C.gold:C.muted,fontFamily:"DM Mono",letterSpacing:0.5}}>
          ◐ {unread>0?`${unread} ALERT${unread>1?"S":""}`:""} ALERTS
        </button>
      </header>

      {/* BODY */}
      <div style={{display:"flex",flex:1,overflow:"hidden",height:"calc(100vh - 58px)"}}>

        {/* SIDEBAR */}
        <aside style={{width:262,borderRight:`1px solid ${C.border}`,
          display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:14,borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2.5,marginBottom:7}}>
              SCAN ORGANISATION
            </div>
            <textarea value={query} onChange={e=>setQuery(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();analyse();} }}
              placeholder={"Company name…\n(Enter to run)"}
              style={{width:"100%",height:56,background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:5,color:C.textHi,fontSize:12,padding:"7px 9px",
                resize:"none",fontFamily:"DM Sans",lineHeight:1.5}}/>
            <button onClick={analyse} disabled={loading||!query.trim()} style={{
              marginTop:7,width:"100%",padding:"8px 0",
              background:loading||!query.trim()?C.border:C.accent,
              color:loading||!query.trim()?C.muted:"#050E08",
              border:"none",borderRadius:4,fontWeight:700,fontSize:10,
              fontFamily:"DM Mono",letterSpacing:1.5,
              cursor:loading||!query.trim()?"default":"pointer",transition:"all 0.2s"}}>
              {loading?"ANALYSING…":"RUN ANALYSIS →"}
            </button>
            {error&&<p style={{color:C.red,fontSize:10,marginTop:5,lineHeight:1.5}}>{error}</p>}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"6px"}}>
            {analyses.length===0&&!loading&&(
              <p style={{padding:"14px 8px",color:C.muted,fontSize:11,lineHeight:1.7}}>
                Enter a company name to scan for customer strategy value creation opportunities.
                <br/><br/>
                <span style={{color:C.accent,fontSize:10,fontFamily:"DM Mono"}}>GREEN = BUY</span>
                <span style={{color:C.muted,fontSize:10,fontFamily:"DM Mono"}}> · </span>
                <span style={{color:C.gold,fontSize:10,fontFamily:"DM Mono"}}>GOLD = WATCH</span>
                <span style={{color:C.muted,fontSize:10,fontFamily:"DM Mono"}}> · </span>
                <span style={{color:C.red,fontSize:10,fontFamily:"DM Mono"}}>RED = PASS</span>
              </p>
            )}
            {loading&&<Spinner/>}
            {analyses.map(a=>(
              <button key={a.id} className="hov"
                onClick={()=>{ setActiveId(a.id); setView("analysis"); }}
                style={{width:"100%",textAlign:"left",padding:"9px 10px",
                  background:activeId===a.id?C.surfaceHi:"transparent",
                  border:`1px solid ${activeId===a.id?C.borderHi:"transparent"}`,
                  borderRadius:5,marginBottom:3,cursor:"pointer",
                  transition:"all 0.15s",display:"block"}}>
                <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
                  <ScoreBadge score={a.weightedScore||a.overallScore} size={36}
                    signal={a.investmentSignal}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:12,color:C.textHi,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {a.company}
                    </div>
                    <div style={{fontSize:10,color:C.muted}}>{a.sector}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                    {watchlist.includes(a.id)&&<span style={{color:C.gold,fontSize:11}}>★</span>}
                    <Spark values={a.scoreHistory} color={inv(a.investmentSignal||"WATCH")}
                      width={36} height={15}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <Tag label={a.investmentSignal||"—"}
                    color={inv(a.investmentSignal||"WATCH")}/>
                  {a.valueBridgeModel?.totalUpliftEstimate&&(
                    <Tag label={a.valueBridgeModel.totalUpliftEstimate} color={C.green}/>
                  )}
                </div>
              </button>
            ))}
          </div>

          {analyses.length>0&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 14px",
              display:"flex",gap:14,justifyContent:"space-around"}}>
              {[
                ["TOTAL",analyses.length,C.muted],
                ["BUY",analyses.filter(a=>a.investmentSignal==="BUY").length,C.green],
                ["WATCH",analyses.filter(a=>a.investmentSignal==="WATCH").length,C.gold],
              ].map(([l,v,col])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontFamily:"DM Mono",fontSize:13,color:col,fontWeight:600}}>{v}</div>
                  <div style={{fontFamily:"DM Mono",fontSize:8,color:C.muted,letterSpacing:2}}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main style={{flex:1,overflowY:"auto",padding:"22px 26px"}}>
          {view==="analysis"&&(
            <>
              {!active&&!loading&&<Empty icon="⬡" text="ENTER A COMPANY TO BEGIN"/>}
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
            <CompareView analyses={analyses} compareIds={compareIds}
              setCompareIds={setCompareIds} weights={weights}/>
          )}
          {view==="weights"&&<WeightsView weights={weights} setWeights={setWeights}/>}
          {view==="feeds"&&<FeedsView feedLog={feedLog} feedActive={feedActive} setFeedActive={setFeedActive}/>}
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function AnalysisView({r,weights,weightedScore,watchlist,setWatchlist,compareIds,setCompareIds}) {
  const ws=r.weightedScore||r.overallScore;
  const inWatch=watchlist.includes(r.id);
  const inCompare=compareIds.includes(r.id);
  const sig=r.investmentSignal||"WATCH";
  const vb=r.valueBridgeModel||{};
  const cp=r.customerProfile||{};

  return (
    <div style={{animation:"fadein 0.3s ease"}}>

      {/* HEADER ROW */}
      <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:20}}>
        <ScoreBadge score={ws} size={54} signal={sig}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap",marginBottom:5}}>
            <h1 style={{fontSize:20,fontWeight:600,color:C.textHi,letterSpacing:-0.3}}>{r.company}</h1>
            {r.ticker&&<span style={{fontFamily:"DM Mono",fontSize:10,color:C.muted,
              background:C.surface,border:`1px solid ${C.border}`,padding:"1px 7px",borderRadius:2}}>
              {r.ticker}</span>}
            <Tag label={r.sector} color={C.muted}/>
            {r.marketCap&&r.marketCap!=="Unknown"&&<Tag label={r.marketCap} color={C.accentB}/>}
            <SignalBadge signal={sig} large/>
            {r.confidenceLevel&&<Tag label={`${r.confidenceLevel} CONFIDENCE`}
              color={r.confidenceLevel==="HIGH"?C.green:r.confidenceLevel==="MEDIUM"?C.gold:C.muted}/>}
          </div>
          <p style={{fontSize:13,lineHeight:1.8,color:C.text,maxWidth:700}}>{r.executiveSummary}</p>
        </div>
        <div style={{display:"flex",gap:7,flexShrink:0}}>
          <button onClick={()=>setWatchlist(w=>inWatch?w.filter(x=>x!==r.id):[...w,r.id])}
            style={{padding:"5px 11px",borderRadius:4,fontSize:10,fontFamily:"DM Mono",cursor:"pointer",
              border:`1px solid ${inWatch?C.gold:C.border}`,background:inWatch?C.goldDim:"transparent",
              color:inWatch?C.gold:C.muted}}>
            {inWatch?"★ WATCHING":"☆ WATCH"}
          </button>
          <button onClick={()=>setCompareIds(c=>inCompare?c.filter(x=>x!==r.id):[...c.slice(-2),r.id])}
            style={{padding:"5px 11px",borderRadius:4,fontSize:10,fontFamily:"DM Mono",cursor:"pointer",
              border:`1px solid ${inCompare?C.accentB:C.border}`,
              background:inCompare?C.accentBDim:"transparent",
              color:inCompare?C.accentB:C.muted}}>
            {inCompare?"◉ ADDED":"○ COMPARE"}
          </button>
        </div>
      </div>

      {/* INVESTMENT THESIS — pinned below summary */}
      {r.investmentThesis&&(
        <div style={{background:`linear-gradient(135deg,${C.accentDim},${C.surfaceHi})`,
          border:`1px solid ${C.accent}44`,borderRadius:8,padding:"14px 18px",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <SignalBadge signal={sig}/>
            <p style={{fontSize:13,lineHeight:1.85,color:C.textHi,flex:1}}>{r.investmentThesis}</p>
          </div>
        </div>
      )}

      {/* SCORE TRIO */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18}}>
        {[
          ["Customer Strategy",r.customerStrategyScore||ws,C.accent,"How effectively customer strategy drives growth"],
          ["Brand Equity",r.brandEquityScore||ws,C.purple,"Strength and realisation of brand as a value asset"],
          ["Commercial Execution",r.commercialScore||ws,C.accentB,"Revenue, conversion and commercial performance"],
        ].map(([label,score,col,desc])=>(
          <div key={label} style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:7,padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:10,fontFamily:"DM Mono",color:C.muted,letterSpacing:1}}>{label.toUpperCase()}</span>
              <span style={{fontFamily:"DM Mono",fontSize:16,fontWeight:700,color:sc(score)}}>{score}</span>
            </div>
            <Meter value={score} color={sc(score)}/>
            <p style={{marginTop:6,fontSize:10,color:C.muted,lineHeight:1.5}}>{desc}</p>
          </div>
        ))}
      </div>

      {/* VALUE BRIDGE */}
      {vb.currentEVEstimate&&(
        <>
          <Divider title="VALUE BRIDGE — ENTERPRISE VALUE OPPORTUNITY"/>
          {/* Top row: EV flow — all boxes same height via minHeight + flex */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 20px 1fr 20px 1fr 20px 1fr 20px 1fr",
            alignItems:"stretch",gap:0,marginBottom:8}}>
            {[
              ["Current EV",      vb.currentEVEstimate,      C.muted,   C.border],
              null,
              ["Revenue Growth",  vb.revenueGrowthComponent, C.accentB, C.accentB],
              null,
              ["Cost Efficiency", vb.costEfficiencyComponent,C.gold,    C.gold],
              null,
              ["Brand Multiple",  vb.brandMultipleExpansion, C.purple,  C.purple],
              null,
              ["Potential EV",    vb.potentialEVEstimate,    C.accent,  C.accent],
            ].map((item,i)=> item===null ? (
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"center",
                color:C.muted,fontSize:11}}>→</div>
            ) : (
              <div key={i} style={{
                background: item[3]===C.border ? C.surface : item[3]+"12",
                border:`1px solid ${item[3]}${item[3]===C.border?"":"33"}`,
                borderRadius:6,padding:"10px 8px",
                display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                minHeight:64}}>
                <div style={{fontFamily:"DM Sans",fontSize:9,fontWeight:400,color:C.muted,
                  letterSpacing:0.5,marginBottom:5,textTransform:"uppercase",
                  textAlign:"center",lineHeight:1.3}}>{item[0]}</div>
                <div style={{fontFamily:"DM Mono",fontSize:12,fontWeight:700,
                  color:item[2],lineHeight:1.2,textAlign:"center"}}>{item[1]||"—"}</div>
              </div>
            ))}
          </div>
          {/* Bottom row: return metrics — same height as top row boxes */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:10}}>
            {[
              ["Total Uplift",      vb.totalUpliftEstimate,      C.green,  C.greenDim],
              ["Investment Reqd",   vb.totalInvestmentRequired,  C.gold,   C.goldDim],
              ["Payback Period",    vb.paybackPeriod,            C.accentB,C.accentBDim],
              ["Directional IRR",   vb.directionalIRR,           C.accent, C.accentDim],
              ["Acquisition Guide", vb.acquisitionPriceGuidance, C.purple, C.purpleDim],
            ].map(([label,val,col,bg])=>(
              <div key={label} style={{background:bg,border:`1px solid ${col}30`,
                borderRadius:6,padding:"10px 8px",
                display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                minHeight:64}}>
                <div style={{fontFamily:"DM Sans",fontSize:9,fontWeight:400,color:C.muted,
                  letterSpacing:0.5,marginBottom:5,textTransform:"uppercase",
                  textAlign:"center",lineHeight:1.3}}>{label}</div>
                <div style={{fontFamily:"DM Mono",fontSize:12,fontWeight:700,
                  color:col,lineHeight:1.2,textAlign:"center"}}>{val||"—"}</div>
              </div>
            ))}
          </div>
          {vb.valuationRationale&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:6,padding:"10px 14px",marginBottom:18}}>
              <p style={{fontSize:12,color:C.text,lineHeight:1.75}}>{vb.valuationRationale}</p>
            </div>
          )}
        </>
      )}

      {/* CAPABILITY GAPS — moved above customer profile */}
      {(r.capabilityGaps||[]).length>0&&(
        <>
          <Divider title="CAPABILITY GAPS & INTERVENTION OPPORTUNITIES"/>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
            {r.capabilityGaps.map((g,i)=>(
              <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:7,padding:"12px 15px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:4,borderRadius:2,flexShrink:0,alignSelf:"stretch",minHeight:36,
                  background:g.severity==="CRITICAL"?C.red:g.severity==="SIGNIFICANT"?C.gold:C.accentB}}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
                    <span style={{fontWeight:600,fontSize:13,color:C.textHi}}>{g.domain}</span>
                    <Tag label={g.severity}
                      color={g.severity==="CRITICAL"?C.red:g.severity==="SIGNIFICANT"?C.gold:C.accentB}/>
                    {g.timeHorizon&&<Tag label={g.timeHorizon} color={C.purple}/>}
                    <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                      {g.revenueUplift&&(
                        <span style={{fontFamily:"DM Mono",fontSize:10,color:C.green,
                          background:C.greenDim,padding:"2px 8px",borderRadius:3,
                          border:`1px solid ${C.green}30`}}>↑ {g.revenueUplift}</span>
                      )}
                      {g.costReduction&&(
                        <span style={{fontFamily:"DM Mono",fontSize:10,color:C.accentB,
                          background:C.accentBDim,padding:"2px 8px",borderRadius:3,
                          border:`1px solid ${C.accentB}30`}}>⊟ {g.costReduction}</span>
                      )}
                      {g.investmentRequired&&(
                        <span style={{fontFamily:"DM Mono",fontSize:10,color:C.gold,
                          background:C.goldDim,padding:"2px 8px",borderRadius:3,
                          border:`1px solid ${C.gold}30`}}>⊕ {g.investmentRequired}</span>
                      )}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:8,fontFamily:"DM Mono",color:C.muted,
                        letterSpacing:1.5,marginBottom:4}}>CURRENT STATE</div>
                      <p style={{fontSize:11,color:C.text,lineHeight:1.65}}>{g.currentState}</p>
                    </div>
                    <div>
                      <div style={{fontSize:8,fontFamily:"DM Mono",color:C.accent,
                        letterSpacing:1.5,marginBottom:4}}>POTENTIAL STATE</div>
                      <p style={{fontSize:11,color:C.textHi,lineHeight:1.65}}>{g.potentialState}</p>
                    </div>
                  </div>
                  {(g.interventions||[]).length>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:8,fontFamily:"DM Mono",color:C.accentB,
                        letterSpacing:1.5,marginBottom:6}}>INTERVENTIONS</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {g.interventions.map((iv,j)=>(
                          <div key={j} style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                            <span style={{color:C.accentB,fontSize:9,flexShrink:0,marginTop:2}}>◆</span>
                            <span style={{fontSize:11,color:C.text,lineHeight:1.55}}>{iv}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {g.kpiTargets&&(
                      <div>
                        <div style={{fontSize:8,fontFamily:"DM Mono",color:C.accent,
                          letterSpacing:1.5,marginBottom:4}}>KPI TARGETS</div>
                        <p style={{fontSize:10,color:C.accent,lineHeight:1.55}}>{g.kpiTargets}</p>
                      </div>
                    )}
                    {g.benchmarkReference&&(
                      <div>
                        <div style={{fontSize:8,fontFamily:"DM Mono",color:C.purple,
                          letterSpacing:1.5,marginBottom:4}}>BENCHMARK</div>
                        <p style={{fontSize:10,color:C.purple,lineHeight:1.55}}>{g.benchmarkReference}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* CUSTOMER PROFILE */}
      {cp.audienceInsight&&(
        <>
          <Divider title="CUSTOMER PROFILE & AUDIENCE INTELLIGENCE"/>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:8,padding:"14px 18px",marginBottom:18}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:12}}>
              {[
                ["Customer Base",cp.estimatedCustomerBase,C.accentB],
                ["NPS Estimate",cp.npsEstimate,sc(parseInt(cp.npsEstimate)||50)],
                ["Satisfaction",cp.satisfactionLevel,cp.satisfactionLevel==="HIGH"?C.green:cp.satisfactionLevel==="MEDIUM"?C.gold:C.red],
                ["Loyalty",cp.loyaltyStrength,cp.loyaltyStrength==="STRONG"?C.green:cp.loyaltyStrength==="MODERATE"?C.gold:C.red],
                ["Community",cp.communityEngagement,cp.communityEngagement==="HIGH"?C.green:cp.communityEngagement==="MEDIUM"?C.gold:C.red],
              ].map(([label,val,col])=>(
                <div key={label} style={{textAlign:"center",padding:"8px 4px"}}>
                  <div style={{fontFamily:"DM Mono",fontSize:13,fontWeight:600,color:col,marginBottom:3}}>{val||"—"}</div>
                  <div style={{fontSize:9,color:C.muted,letterSpacing:0.8}}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:C.text,lineHeight:1.7,
              borderTop:`1px solid ${C.border}`,paddingTop:10}}>{cp.audienceInsight}</p>
          </div>
        </>
      )}

      {/* DIMENSIONS + RADAR */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 250px",gap:14,marginBottom:18}}>
        <div>
          <Divider title="DATA SIGNAL ASSESSMENT"/>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {DIMS.map(dim=>{
              const d=r.dimensions[dim.id]||{};
              return (
                <div key={dim.id} style={{background:C.surface,border:`1px solid ${C.border}`,
                  borderRadius:6,padding:"10px 13px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                    <span style={{color:dim.color,fontSize:13}}>{dim.icon}</span>
                    <span style={{fontSize:9,fontFamily:"DM Mono",color:C.muted,letterSpacing:1.5,flex:1}}>
                      {dim.label.toUpperCase()}
                    </span>
                    {d.source&&<span style={{fontSize:9,color:C.muted,fontStyle:"italic"}}>{d.source}</span>}
                    <TrendArrow trend={d.trend||"FLAT"}/>
                    <span style={{fontFamily:"DM Mono",fontSize:9,color:C.muted,marginLeft:4}}>
                      w:{weights[dim.id]}%
                    </span>
                    <span style={{fontFamily:"DM Mono",fontSize:12,fontWeight:600,
                      color:sc(d.score||0),marginLeft:7}}>{d.score||0}</span>
                  </div>
                  <Meter value={d.score||0} color={sc(d.score||0)}/>
                  {d.signal&&<p style={{marginTop:4,fontSize:9,color:C.muted,fontFamily:"DM Mono"}}>
                    ↳ {d.signal}</p>}
                  <p style={{marginTop:4,fontSize:11,color:C.text,lineHeight:1.6}}>{d.insight}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:C.surface,border:`1px solid ${C.accent}33`,borderRadius:8,
            padding:16,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,alignSelf:"stretch"}}>
              <div style={{fontSize:8,fontFamily:"DM Mono",color:C.accent,letterSpacing:2,flex:1}}>
                SIGNAL RADAR
              </div>
              <div style={{fontSize:9,fontFamily:"DM Mono",color:C.muted}}>WEIGHTED</div>
            </div>
            <RadarChart data={r.dimensions} weights={weights} size={210}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,alignSelf:"stretch"}}>
              {DIMS.map(dim=>(
                <div key={dim.id} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:dim.color,flexShrink:0}}/>
                  <span style={{fontSize:8,color:C.muted,fontFamily:"DM Mono",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {dim.label.split(" ")[0]}
                  </span>
                  <span style={{fontSize:8,color:sc(r.dimensions[dim.id]?.score||0),
                    fontFamily:"DM Mono",marginLeft:"auto"}}>
                    {r.dimensions[dim.id]?.score||0}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {(r.scoreHistory||[]).length>1&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
              <div style={{fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2,marginBottom:8}}>
                SCORE HISTORY
              </div>
              <Spark values={r.scoreHistory} color={inv(sig)} width={176} height={36}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                <span style={{fontSize:8,fontFamily:"DM Mono",color:C.muted}}>OLDEST</span>
                <span style={{fontSize:8,fontFamily:"DM Mono",color:inv(sig)}}>NOW: {ws}</span>
              </div>
            </div>
          )}
          {/* peer benchmarks */}
          {(r.peerBenchmarks||[]).length>0&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
              <div style={{fontSize:8,fontFamily:"DM Mono",color:C.muted,letterSpacing:2,marginBottom:9}}>
                PEER BENCHMARKS
              </div>
              {[{company:r.company,score:ws,signal:sig,subject:true},
                ...(r.peerBenchmarks||[])].sort((a,b)=>b.score-a.score).map((p,i)=>(
                <div key={i} style={{marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:9,color:p.subject?C.textHi:C.text,
                      fontWeight:p.subject?600:400}}>{p.company}</span>
                    <span style={{fontSize:9,fontFamily:"DM Mono",
                      color:inv(p.signal||"WATCH")}}>{p.score}</span>
                  </div>
                  <Meter value={p.score} color={p.subject?C.accent:sc(p.score)} height={3}/>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>



      {/* PRIORITY ROADMAP */}
      {(r.priorityRoadmap||[]).length>0&&(
        <>
          <Divider title="TRANSFORMATION ROADMAP"/>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(r.priorityRoadmap.length,3)},1fr)`,
            gap:10,marginBottom:18}}>
            {r.priorityRoadmap.map((phase,i)=>(
              <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:7,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontFamily:"DM Mono",fontSize:8,color:C.muted,
                      letterSpacing:2,marginBottom:3}}>{phase.horizon}</div>
                    <div style={{fontWeight:600,fontSize:12,color:C.textHi}}>{phase.phase}</div>
                  </div>
                  {phase.expectedValue&&(
                    <span style={{fontFamily:"DM Mono",fontSize:10,color:C.green,
                      background:C.greenDim,padding:"2px 8px",borderRadius:3,
                      border:`1px solid ${C.green}30`,flexShrink:0}}>
                      {phase.expectedValue}
                    </span>
                  )}
                </div>
                {(phase.initiatives||[]).map((init,j)=>(
                  <div key={j} style={{display:"flex",gap:6,marginBottom:5,alignItems:"flex-start"}}>
                    <span style={{color:C.accent,fontSize:9,flexShrink:0,marginTop:2}}>◆</span>
                    <span style={{fontSize:11,color:C.text,lineHeight:1.5}}>{init}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* CATALYSTS / RISKS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
        {[["VALUE CATALYSTS",r.catalysts||[],C.green,"↑"],
          ["KEY RISKS",r.risks||[],C.red,"↓"]].map(([title,items,col,arrow])=>(
          <div key={title}>
            <Divider title={title}/>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:6,padding:"11px 14px"}}>
              {items.map((item,i)=>(
                <div key={i} style={{display:"flex",gap:7,marginBottom:7,
                  fontSize:12,color:C.text,lineHeight:1.6}}>
                  <span style={{color:col,flexShrink:0}}>{arrow}</span>{item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p style={{fontSize:8,color:C.muted,fontFamily:"DM Mono",letterSpacing:1,marginTop:8}}>
        ANALYSED {fmt(r.analysedAt)} · WEIGHTED SCORE {ws} · RAW SCORE {r.overallScore} · {sig}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WATCHLIST VIEW
// ═══════════════════════════════════════════════════════════════════════════
function WatchlistView({analyses,watchlist,setWatchlist,alerts,setAlerts,setActiveId,setView}) {
  const watched=analyses.filter(a=>watchlist.includes(a.id));
  return (
    <div style={{animation:"fadein 0.3s ease"}}>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3}}>Watchlist</h2>
        <p style={{fontSize:12,color:C.muted}}>{watched.length} companies under active monitoring</p>
      </div>
      {alerts.length>0&&(
        <div style={{marginBottom:20}}>
          <Divider title="ALERTS"/>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {alerts.slice(0,10).map((a,i)=>(
              <div key={i} style={{background:C.surface,
                border:`1px solid ${a.read?C.border:C.gold+"44"}`,
                borderRadius:5,padding:"9px 13px",
                display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:9,padding:"2px 6px",borderRadius:2,fontFamily:"DM Mono",
                  flexShrink:0,letterSpacing:1,
                  background:a.type==="SCORE_SHIFT"?C.gold+"20":a.type==="CATALYST"?C.green+"20":C.accentB+"20",
                  color:a.type==="SCORE_SHIFT"?C.gold:a.type==="CATALYST"?C.green:C.accentB}}>
                  {a.type||"ALERT"}
                </span>
                <div style={{flex:1}}>
                  {a.company&&<span style={{fontSize:11,fontWeight:600,
                    color:C.textHi,marginRight:7}}>{a.company}</span>}
                  <span style={{fontSize:11,color:C.text}}>{a.message}</span>
                </div>
                <span style={{fontSize:8,fontFamily:"DM Mono",color:C.muted,flexShrink:0}}>
                  {fmt(a.ts)}
                </span>
                {!a.read&&<div style={{width:5,height:5,borderRadius:"50%",
                  background:C.gold,flexShrink:0,marginTop:3}}/>}
              </div>
            ))}
            <button onClick={()=>setAlerts([])}
              style={{alignSelf:"flex-start",padding:"4px 12px",borderRadius:3,fontSize:10,
                border:`1px solid ${C.border}`,background:"transparent",
                color:C.muted,fontFamily:"DM Mono",cursor:"pointer"}}>
              CLEAR ALL
            </button>
          </div>
        </div>
      )}
      {watched.length===0&&<Empty icon="★" text="NO COMPANIES WATCHED — ADD FROM ANALYSIS VIEW"/>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {watched.map(a=>(
          <div key={a.id} className="hov-border"
            style={{background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:8,padding:"14px 16px",cursor:"pointer",
              transition:"border-color 0.15s"}}
            onClick={()=>{ setActiveId(a.id); setView("analysis"); }}>
            <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:9}}>
              <ScoreBadge score={a.weightedScore||a.overallScore} size={40}
                signal={a.investmentSignal}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:C.textHi}}>{a.company}</div>
                <div style={{fontSize:10,color:C.muted}}>{a.sector}</div>
              </div>
              <button onClick={e=>{ e.stopPropagation();
                setWatchlist(w=>w.filter(x=>x!==a.id)); }}
                style={{background:"transparent",border:"none",
                  color:C.gold,fontSize:15,padding:3,cursor:"pointer"}}>★
              </button>
            </div>
            <Meter value={a.weightedScore||a.overallScore}
              color={inv(a.investmentSignal||"WATCH")} height={3}/>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginTop:9}}>
              <SignalBadge signal={a.investmentSignal||"WATCH"}/>
              {a.valueBridgeModel?.totalUpliftEstimate&&(
                <Tag label={a.valueBridgeModel.totalUpliftEstimate} color={C.green}/>
              )}
              <Spark values={a.scoreHistory}
                color={inv(a.investmentSignal||"WATCH")} width={55} height={18}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPARE VIEW
// ═══════════════════════════════════════════════════════════════════════════
function CompareView({analyses,compareIds,setCompareIds,weights}) {
  const selected=analyses.filter(a=>compareIds.includes(a.id));
  return (
    <div style={{animation:"fadein 0.3s ease"}}>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3}}>
          Comparables Engine
        </h2>
        <p style={{fontSize:12,color:C.muted}}>
          Select up to 3 companies to compare investment signals, value bridges and capability gaps
        </p>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:22}}>
        {analyses.map(a=>(
          <Pill key={a.id} label={a.company} active={compareIds.includes(a.id)}
            color={inv(a.investmentSignal||"WATCH")}
            onClick={()=>setCompareIds(c=>c.includes(a.id)?
              c.filter(x=>x!==a.id):[...c.slice(-2),a.id])}/>
        ))}
      </div>
      {selected.length<2&&<Empty icon="○" text="SELECT 2–3 COMPANIES TO COMPARE"/>}
      {selected.length>=2&&(
        <>
          <Divider title="INVESTMENT SIGNAL OVERVIEW"/>
          <div style={{display:"grid",
            gridTemplateColumns:`repeat(${selected.length},1fr)`,
            gap:11,marginBottom:20}}>
            {selected.map(a=>{
              const sig=a.investmentSignal||"WATCH";
              return (
                <div key={a.id} style={{background:C.surface,
                  border:`2px solid ${inv(sig)}33`,
                  borderRadius:8,padding:14,textAlign:"center"}}>
                  <ScoreBadge score={a.weightedScore||a.overallScore}
                    size={50} signal={sig}/>
                  <div style={{marginTop:9,fontWeight:600,fontSize:13,
                    color:C.textHi}}>{a.company}</div>
                  <div style={{fontSize:9,color:C.muted,marginBottom:8}}>{a.sector}</div>
                  <SignalBadge signal={sig}/>
                  {a.valueBridgeModel?.totalUpliftEstimate&&(
                    <div style={{marginTop:8}}>
                      <Tag label={`Uplift: ${a.valueBridgeModel.totalUpliftEstimate}`} color={C.green}/>
                    </div>
                  )}
                  {a.valueBridgeModel?.directionalIRR&&(
                    <div style={{marginTop:5}}>
                      <Tag label={`IRR: ${a.valueBridgeModel.directionalIRR}`} color={C.accent}/>
                    </div>
                  )}
                  <div style={{marginTop:8}}>
                    <Spark values={a.scoreHistory} color={inv(sig)} width={110} height={28}/>
                  </div>
                </div>
              );
            })}
          </div>

          <Divider title="DIMENSION-BY-DIMENSION"/>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
            {DIMS.map(dim=>{
              const scores=selected.map(a=>a.dimensions[dim.id]?.score||0);
              const best=Math.max(...scores);
              return (
                <div key={dim.id} style={{background:C.surface,border:`1px solid ${C.border}`,
                  borderRadius:6,padding:"10px 13px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                    <span style={{color:dim.color,fontSize:12}}>{dim.icon}</span>
                    <span style={{fontSize:9,fontFamily:"DM Mono",color:C.muted,
                      letterSpacing:1.5,flex:1}}>{dim.label.toUpperCase()}</span>
                    <span style={{fontSize:8,fontFamily:"DM Mono",color:C.muted}}>
                      w:{weights[dim.id]}%
                    </span>
                  </div>
                  <div style={{display:"grid",
                    gridTemplateColumns:`repeat(${selected.length},1fr)`,gap:8}}>
                    {selected.map(a=>{
                      const s=a.dimensions[dim.id]?.score||0;
                      return (
                        <div key={a.id}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                            <span style={{fontSize:9,color:s===best?C.textHi:C.muted}}>
                              {a.company}
                            </span>
                            <span style={{fontSize:9,fontFamily:"DM Mono",color:sc(s)}}>{s}</span>
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

          <Divider title="CAPABILITY GAP COMPARISON"/>
          <div style={{display:"grid",
            gridTemplateColumns:`repeat(${selected.length},1fr)`,gap:10}}>
            {selected.map(a=>(
              <div key={a.id} style={{background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:7,padding:13}}>
                <div style={{fontSize:11,fontWeight:600,color:C.textHi,marginBottom:9}}>
                  {a.company}
                </div>
                {(a.capabilityGaps||[]).slice(0,5).map((g,i)=>(
                  <div key={i} style={{display:"flex",gap:6,marginBottom:6,alignItems:"flex-start"}}>
                    <div style={{width:4,height:4,borderRadius:"50%",flexShrink:0,marginTop:4,
                      background:g.severity==="CRITICAL"?C.red:
                        g.severity==="SIGNIFICANT"?C.gold:C.accentB}}/>
                    <div>
                      <div style={{fontSize:10,color:C.text,lineHeight:1.4}}>{g.domain}</div>
                      {g.revenueUplift&&(
                        <div style={{fontSize:9,color:C.green,fontFamily:"DM Mono"}}>
                          {g.revenueUplift}
                        </div>
                      )}
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

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHTS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function WeightsView({weights,setWeights}) {
  const total=Object.values(weights).reduce((a,b)=>a+b,0);
  const presets=[
    {name:"Balanced",     vals:{sentiment:20,social:15,reviews:15,brand:15,financial:20,analyst:15}},
    {name:"Sentiment-Led",vals:{sentiment:30,social:25,reviews:20,brand:10,financial:10,analyst:5}},
    {name:"Fundamentals", vals:{sentiment:10,social:5, reviews:10,brand:10,financial:40,analyst:25}},
    {name:"Brand-Led",    vals:{sentiment:20,social:15,reviews:10,brand:30,financial:15,analyst:10}},
  ];
  return (
    <div style={{animation:"fadein 0.3s ease",maxWidth:650}}>
      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3}}>
          Signal Weighting
        </h2>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.65}}>
          Adjust how much each data source influences the opportunity score.
          Changes apply immediately across all analyses.
        </p>
      </div>
      <Divider title="PRESETS"/>
      <div style={{display:"flex",gap:8,marginBottom:22,flexWrap:"wrap"}}>
        {presets.map(p=>(
          <button key={p.name} className="hov" onClick={()=>setWeights(p.vals)}
            style={{padding:"6px 16px",borderRadius:4,fontSize:11,
              border:`1px solid ${C.border}`,background:"transparent",
              color:C.text,fontFamily:"DM Mono",letterSpacing:0.5,cursor:"pointer"}}>
            {p.name}
          </button>
        ))}
      </div>
      <Divider title="MANUAL ADJUSTMENT"/>
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:20}}>
        {DIMS.map(dim=>(
          <div key={dim.id} style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:6,padding:"12px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
              <span style={{color:dim.color,fontSize:14}}>{dim.icon}</span>
              <span style={{fontSize:10,fontFamily:"DM Mono",color:C.text,
                letterSpacing:1,flex:1}}>{dim.label.toUpperCase()}</span>
              <span style={{fontFamily:"DM Mono",fontSize:15,fontWeight:600,
                color:dim.color,minWidth:36,textAlign:"right"}}>{weights[dim.id]}%</span>
            </div>
            <input type="range" min={0} max={50} value={weights[dim.id]}
              onChange={e=>setWeights(w=>({...w,[dim.id]:parseInt(e.target.value)}))}
              style={{width:"100%",accentColor:dim.color,cursor:"pointer"}}/>
          </div>
        ))}
      </div>
      <div style={{background:total===100?C.greenDim:C.redDim,
        border:`1px solid ${total===100?C.green:C.red}44`,
        borderRadius:6,padding:"11px 15px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontFamily:"DM Mono",fontSize:20,fontWeight:700,
          color:total===100?C.green:C.red}}>{total}%</span>
        <span style={{fontSize:12,color:total===100?C.green:C.red}}>
          {total===100?"Weights sum to 100% ✓":"Weights must sum to 100%"}
        </span>
        {total!==100&&(
          <button onClick={()=>{
            const keys=Object.keys(weights),diff=100-total;
            setWeights(w=>({...w,[keys[0]]:clamp(w[keys[0]]+diff,0,50)}));
          }} style={{marginLeft:"auto",padding:"4px 11px",borderRadius:3,cursor:"pointer",
            background:C.accent+"20",border:`1px solid ${C.accent}44`,
            color:C.accent,fontSize:9,fontFamily:"DM Mono"}}>AUTO-FIX</button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FEEDS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function FeedsView({feedLog,feedActive,setFeedActive}) {
  return (
    <div style={{animation:"fadein 0.3s ease"}}>
      <div style={{marginBottom:22}}>
        <h2 style={{fontSize:18,fontWeight:600,color:C.textHi,marginBottom:3}}>
          Live Data Feeds
        </h2>
        <p style={{fontSize:12,color:C.muted,lineHeight:1.65}}>
          Real-time signal ingestion from Brandwatch, Trustpilot, Bloomberg, FactSet,
          Refinitiv, SimilarWeb, Kantar BrandZ and Mintel. In production each source
          connects via authenticated API and webhook.
        </p>
      </div>
      <Divider title="CONNECTED SOURCES"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:9,marginBottom:22}}>
        {FEEDS.map(f=>(
          <div key={f.id} style={{background:C.surface,
            border:`1px solid ${feedActive[f.id]?f.color+"44":C.border}`,
            borderRadius:7,padding:"11px 13px",
            opacity:feedActive[f.id]?1:0.5,transition:"all 0.2s"}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
              <span style={{color:feedActive[f.id]?f.color:C.muted,fontSize:14}}>
                {f.icon}
              </span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:11,color:C.textHi}}>{f.label}</div>
                <div style={{fontSize:9,color:C.muted}}>{f.type}</div>
              </div>
              {feedActive[f.id]&&(
                <div style={{display:"flex",gap:2,alignItems:"flex-end"}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{width:3,borderRadius:1,background:f.color,
                      height:4+i*3,animation:`pulse ${0.5+i*0.2}s ease infinite`}}/>
                  ))}
                </div>
              )}
            </div>
            <button onClick={()=>setFeedActive(a=>({...a,[f.id]:!a[f.id]}))}
              style={{width:"100%",padding:"3px 0",borderRadius:3,fontSize:9,cursor:"pointer",
                border:`1px solid ${feedActive[f.id]?C.red+"44":C.green+"44"}`,
                background:feedActive[f.id]?C.redDim:C.greenDim,
                color:feedActive[f.id]?C.red:C.green,fontFamily:"DM Mono",letterSpacing:0.5}}>
              {feedActive[f.id]?"PAUSE":"RESUME"}
            </button>
          </div>
        ))}
      </div>
      <Divider title={`INGESTION LOG — ${feedLog.length} EVENTS`}/>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,
        borderRadius:8,overflow:"hidden"}}>
        <div style={{padding:"7px 13px",borderBottom:`1px solid ${C.border}`,
          display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:C.green,
            animation:"pulse 1.2s infinite"}}/>
          <span style={{fontFamily:"DM Mono",fontSize:8,color:C.muted,letterSpacing:2}}>
            LIVE STREAM
          </span>
        </div>
        <div style={{overflowY:"auto",maxHeight:460}}>
          {feedLog.length===0&&(
            <p style={{padding:"18px 14px",color:C.muted,fontSize:11,fontFamily:"DM Mono"}}>
              Waiting for feed events…
            </p>
          )}
          {feedLog.map((ev,i)=>(
            <div key={ev.id} style={{borderBottom:`1px solid ${C.border}`,
              padding:"7px 13px",display:"flex",gap:9,alignItems:"flex-start",
              background:i===0?ev.color+"07":"transparent",
              animation:i===0?"fadein 0.3s ease":"none"}}>
              <span style={{fontFamily:"DM Mono",fontSize:8,color:C.muted,
                flexShrink:0,paddingTop:2}}>{ev.ts}</span>
              <span style={{fontSize:9,fontFamily:"DM Mono",padding:"1px 6px",borderRadius:2,
                background:ev.color+"20",color:ev.color,flexShrink:0}}>{ev.source}</span>
              <span style={{fontSize:11,color:C.text,lineHeight:1.5}}>{ev.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
