import Head from "next/head";
import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";
import { AGENT_DEFS, buildContext, PROMPTS } from "../lib/agents";
import { PROVIDERS, callAI, validateKey, parseJSON } from "../lib/ai-provider";
import { DEMO_CODE, DEMO_RESULTS } from "../lib/demo-data";
import { downloadText, copyToClipboard, detectLanguageExt, generateMarkdownReport } from "../lib/exports";
import { applyPatches, generateDiffSummary } from "../lib/patch-engine";

// ── State ──
const init = {
  mode: "demo", // demo | live
  phase: "setup",
  provider: "claude",
  apiKey: "", apiKeyValid: null, apiKeyTesting: false,
  codeInput: "", codeSource: "paste", fileName: "", projectName: "", language: "auto",
  config: {
    agents: { architect:true, refactor:true, tester:true, documenter:true, security:true, optimizer:true, migrator:true, reviewer:true },
    depth: "thorough", focus: "balanced", targetFramework: "", customInstructions: "",
  },
  agents: [], logs: [], issues: [], metrics: null, results: {},
  agentProgress: {}, currentAgent: null, error: null,
  totalTokensUsed: 0, startTime: null, endTime: null,
};

function reducer(s, a) {
  switch(a.type) {
    case "SET": return { ...s, [a.k]: a.v };
    case "CONF": return { ...s, config: { ...s.config, [a.k]: a.v } };
    case "TOGGLE_AGENT": return { ...s, config: { ...s.config, agents: { ...s.config.agents, [a.id]: !s.config.agents[a.id] } } };
    case "LOG": return { ...s, logs: [...s.logs.slice(-300), a.log] };
    case "AGENTS": return { ...s, agents: a.v };
    case "UPD_AGENT": return { ...s, agents: s.agents.map(x => x.id===a.id ? { ...x, ...a.u } : x) };
    case "PROG": return { ...s, agentProgress: { ...s.agentProgress, [a.id]: a.v } };
    case "ISSUES": return { ...s, issues: [...s.issues, ...a.v] };
    case "RESULT": return { ...s, results: { ...s.results, [a.id]: a.v } };
    case "TOKENS": return { ...s, totalTokensUsed: s.totalTokensUsed + a.n };
    case "RESET": return { ...s, agents:[], logs:[], issues:[], metrics:null, results:{}, agentProgress:{}, currentAgent:null, error:null, totalTokensUsed:0, startTime:null, endTime:null };
    default: return s;
  }
}

// ── Tiny Components ──
const Spin = ({ sz=14, c }) => <div style={{ width:sz, height:sz, border:`2px solid #1C1C32`, borderTop:`2px solid ${c||"#3B82F6"}`, borderRadius:"50%", animation:"spin .8s linear infinite", flexShrink:0 }} />;
const Badge = ({ children, c }) => <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:6, fontSize:10, background:(c||"#3B82F6")+"18", color:c||"#3B82F6", fontFamily:"var(--font-mono)", fontWeight:600, letterSpacing:.5 }}>{children}</span>;
const SL = ({ children, c }) => <div style={{ fontSize:10, color:c||"#6B6B8D", textTransform:"uppercase", letterSpacing:2, fontFamily:"var(--font-mono)", fontWeight:600, marginBottom:10 }}>{children}</div>;
const Cd = ({ children, style, accent }) => <div style={{ background:"#0C0C16", border:`1px solid ${accent?accent+"30":"#1C1C32"}`, borderRadius:12, padding:20, animation:"fadeUp .4s ease", ...style }}>{children}</div>;
const Btn = ({ children, onClick, v="primary", disabled, sm, style:es }) => {
  const vs = { primary:{background:"#3B82F6",color:"#fff"}, danger:{background:"#EF4444",color:"#fff"}, ghost:{background:"transparent",color:"#6B6B8D",border:"1px solid #1C1C32"}, success:{background:"#10B981",color:"#fff"} };
  const st = vs[v]||vs.primary;
  return <button onClick={onClick} disabled={disabled} style={{ ...st, border:st.border||"none", borderRadius:8, padding:sm?"6px 14px":"10px 22px", fontSize:sm?11:12, fontWeight:600, fontFamily:"var(--font-mono)", transition:"all .2s", letterSpacing:.3, display:"inline-flex", alignItems:"center", gap:8, ...es }}>{children}</button>;
};

function Ring({ value, max, label, color, size=58 }) {
  const pct = Math.min((value||0)/(max||1),1), r=(size-8)/2, c=2*Math.PI*r;
  return <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, minWidth:68 }}>
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1C1C32" strokeWidth={3}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3} strokeDasharray={c} strokeDashoffset={c*(1-pct)} strokeLinecap="round" style={{ transition:"stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ color, fontSize:12, fontWeight:700, fontFamily:"var(--font-mono)" }}>{value??"?"}</span>
      </div>
    </div>
    <span style={{ fontSize:8, color:"#6B6B8D", textTransform:"uppercase", letterSpacing:1, fontFamily:"var(--font-mono)", textAlign:"center" }}>{label}</span>
  </div>;
}

function CodeBlock({ code, lang="python", maxH=450, filename }) {
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => {
    if(!code) return "";
    let s = code.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    s = s.replace(/(#.*?)(\n|$)/g,'<span style="color:#546E7A;font-style:italic">$1</span>$2');
    s = s.replace(/\b(class|def|import|from|return|if|elif|else|for|in|try|except|with|as|not|and|or|True|False|None|self|raise|while|break|continue|pass|yield|lambda|async|await|finally|assert)\b/g,'<span style="color:#C792EA">$1</span>');
    s = s.replace(/\b(str|int|float|list|dict|tuple|set|bool|Any|Optional|Union|List|Dict|Protocol)\b/g,'<span style="color:#FFCB6B">$1</span>');
    s = s.replace(/(["'])((?:(?!\1).)*?)\1/g,'<span style="color:#C3E88D">$1$2$1</span>');
    s = s.replace(/\b(\d+\.?\d*)\b/g,'<span style="color:#F78C6C">$1</span>');
    s = s.replace(/(TODO|FIXME|WARNING|HACK|BUG|SECURITY|DEPRECATED|BREAKING):/g,'<span style="color:#FF5370;font-weight:700">$1:</span>');
    s = s.replace(/\b(print|len|range|isinstance|super|open|json|os|sys|time|hashlib|random|datetime|requests|logging|Enum|dataclass|ABC|abstractmethod|uuid|Decimal|field)\b/g,'<span style="color:#82AAFF">$1</span>');
    s = s.replace(/(@\w+)/g,'<span style="color:#F78C6C">$1</span>');
    return s;
  }, [code]);
  const handleCopy = async () => { await copyToClipboard(code); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const handleDownload = () => { if(filename) downloadText(filename, code); };
  return <div style={{ background:"#080812", borderRadius:10, overflow:"hidden", border:"1px solid #1C1C32" }}>
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#0C0C16", borderBottom:"1px solid #1C1C32" }}>
      {[["#FF5F57"],["#FEBC2E"],["#28C840"]].map(([c],i) => <div key={i} style={{ width:9, height:9, borderRadius:"50%", background:c }}/>)}
      <span style={{ marginLeft:10, fontSize:10, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>{lang}</span>
      <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
        <button onClick={handleCopy} style={{ background:copied?"#10B98120":"#10101E", border:`1px solid ${copied?"#10B98140":"#1C1C32"}`, borderRadius:6, padding:"3px 10px", fontSize:9, color:copied?"#10B981":"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>{copied?"Copied":"Copy"}</button>
        {filename && <button onClick={handleDownload} style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:6, padding:"3px 10px", fontSize:9, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>Download</button>}
      </div>
    </div>
    <pre style={{ margin:0, padding:16, fontSize:11.5, lineHeight:1.75, color:"#A6ACCD", overflowX:"auto", overflowY:"auto", maxHeight:maxH, fontFamily:"var(--font-mono)" }} dangerouslySetInnerHTML={{ __html:html }}/>
  </div>;
}

// ════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════
export default function Home() {
  const [S, D] = useReducer(reducer, init);
  const abortRef = useRef(false);
  const logRef = useRef(null);

  const set = (k,v) => D({type:"SET",k,v});
  const conf = (k,v) => D({type:"CONF",k,v});

  useEffect(() => { if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [S.logs]);

  const addLog = useCallback((agent,message,type="info") => {
    const n=new Date();
    D({type:"LOG",log:{time:`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`,agent,message,type}});
  },[]);

  // ── API Key ──
  const testKey = useCallback(async () => {
    if(!S.apiKey||S.apiKey.length<10){set("apiKeyValid",false);return;}
    set("apiKeyTesting",true);
    const ok = await validateKey(S.provider, S.apiKey);
    set("apiKeyValid",ok);
    set("apiKeyTesting",false);
  },[S.apiKey,S.provider]);

  // ── File Upload ──
  const handleFile = useCallback(e => {
    const f=e.target.files?.[0]; if(!f) return;
    set("fileName",f.name);
    const ext=f.name.split(".").pop()?.toLowerCase();
    const m={py:"python",js:"javascript",ts:"typescript",jsx:"javascript",tsx:"typescript",java:"java",go:"go",rs:"rust",rb:"ruby",cpp:"cpp",c:"c",cs:"csharp",php:"php"};
    if(m[ext]) set("language",m[ext]);
    const r=new FileReader(); r.onload=ev=>set("codeInput",ev.target.result); r.readAsText(f);
  },[]);

  // ── Progress Animator ──
  const animProg = useCallback((id,ms) => new Promise(res => {
    let p=0;
    const go=()=>{ if(abortRef.current){res();return;} p+=Math.random()*8+2; if(p>=95)p=95;
      D({type:"PROG",id,value:Math.round(p)}); if(p<95)setTimeout(go,ms/14); else res(); };
    go();
  }),[]);

  // ══════════════════════════
  //  DEMO MODE RUNNER
  // ══════════════════════════
  const runDemo = useCallback(async () => {
    abortRef.current = false;
    D({type:"RESET"}); set("phase","running"); set("startTime",Date.now());
    const enabled = AGENT_DEFS.filter(a=>S.config.agents[a.id]);
    D({type:"AGENTS",v:enabled.map(a=>({...a,status:"queued"}))});

    addLog("system","NEXUS REFACTOR v3 -- DEMO MODE -- Simulating swarm with pre-computed results");

    const demoOrder = ["architect","security","optimizer","refactor","tester","migrator","documenter","reviewer"];
    for (const id of demoOrder) {
      if(abortRef.current) break;
      if(!S.config.agents[id]) continue;
      D({type:"UPD_AGENT",id,u:{status:"running"}}); set("currentAgent",id);
      addLog(id,"Analyzing...");
      await animProg(id,2500);
      await new Promise(r=>setTimeout(r,400));
      D({type:"PROG",id,value:100});
      const data = DEMO_RESULTS[id];
      if(data) {
        D({type:"RESULT",id,v:data});
        if(id==="architect"&&data.metrics) set("metrics",data.metrics);
        if(id==="architect"&&data.architecture_issues) D({type:"ISSUES",v:data.architecture_issues.map(i=>({...i,agent:"architect"}))});
        if(id==="security"&&data.vulnerabilities) D({type:"ISSUES",v:data.vulnerabilities.map(v=>({...v,agent:"security"}))});
        if(id==="optimizer"&&data.bottlenecks) D({type:"ISSUES",v:data.bottlenecks.map(b=>({...b,agent:"optimizer"}))});
      }
      D({type:"UPD_AGENT",id,u:{status:"done"}}); addLog(id,"Complete.","success");
    }
    set("endTime",Date.now()); set("phase","complete");
    addLog("system","Demo swarm complete. Switch to LIVE mode for real AI analysis.","success");
  },[S.config.agents,addLog,animProg]);

  // ══════════════════════════
  //  LIVE MODE RUNNER
  // ══════════════════════════
  const runLive = useCallback(async () => {
    abortRef.current = false;
    D({type:"RESET"}); set("phase","running"); set("startTime",Date.now()); set("error",null);
    const enabled = AGENT_DEFS.filter(a=>S.config.agents[a.id]);
    D({type:"AGENTS",v:enabled.map(a=>({...a,status:"queued"}))});
    const code = S.codeInput.slice(0,6000);
    const ctx = buildContext({...S.config,projectName:S.projectName,language:S.language});

    const runAgent = async (id,sys,usr,mt=2048) => {
      if(abortRef.current) return null;
      D({type:"UPD_AGENT",id,u:{status:"running"}}); set("currentAgent",id); addLog(id,"Starting...");
      const pp = animProg(id,8000);
      try {
        const {text,tokens} = await callAI({provider:S.provider,apiKey:S.apiKey,systemPrompt:sys,userPrompt:usr,maxTokens:mt});
        D({type:"PROG",id,value:100}); D({type:"TOKENS",n:tokens});
        const parsed = parseJSON(text);
        D({type:"RESULT",id,v:parsed||{raw:text,_parseError:true}});
        D({type:"UPD_AGENT",id,u:{status:"done"}}); addLog(id,"Complete.","success");
        await pp; return parsed;
      } catch(err) {
        D({type:"PROG",id,value:0}); D({type:"UPD_AGENT",id,u:{status:"error"}});
        addLog(id,`Error: ${err.message}`,"error"); return null;
      }
    };

    try {
      addLog("system",`LIVE MODE | Provider: ${S.provider} | Agents: ${enabled.length}`);

      // Phase 1
      let arch=null;
      if(S.config.agents.architect) {
        const p=PROMPTS.architect(ctx);
        arch=await runAgent("architect",p.system,p.user(code),p.maxTokens);
        if(arch?.metrics) set("metrics",arch.metrics);
        if(arch?.architecture_issues) D({type:"ISSUES",v:arch.architecture_issues.map(i=>({...i,agent:"architect"}))});
      }
      if(abortRef.current){set("phase","complete");set("endTime",Date.now());return;}

      // Phase 2 parallel
      const p2=[];
      if(S.config.agents.security){const p=PROMPTS.security(ctx);p2.push(runAgent("security",p.system,p.user(code),p.maxTokens).then(d=>{if(d?.vulnerabilities)D({type:"ISSUES",v:d.vulnerabilities.map(v=>({...v,agent:"security"}))});return d;}));}
      if(S.config.agents.optimizer){const p=PROMPTS.optimizer(ctx);p2.push(runAgent("optimizer",p.system,p.user(code),p.maxTokens).then(d=>{if(d?.bottlenecks)D({type:"ISSUES",v:d.bottlenecks.map(b=>({...b,agent:"optimizer"}))});return d;}));}
      if(p2.length) await Promise.all(p2);
      if(abortRef.current){set("phase","complete");set("endTime",Date.now());return;}

      // Phase 3: Refactor — generates actionable fix blocks (NOT auto-applied)
      let ref=null;
      if(S.config.agents.refactor){
        const iss=S.issues.slice(0,12).map(i=>`[${i.severity}] Line ${i.line||"?"}: ${i.title} -- ${i.description}${i.fix_suggestion?(" Fix: "+i.fix_suggestion):i.fix?(" Fix: "+i.fix):""}`).join("\n");
        addLog("refactor","Generating fix instructions...");
        const pp=PROMPTS.refactor_fixes(ctx);
        ref=await runAgent("refactor",pp.system,pp.user(code,iss),pp.maxTokens);
        if(ref && !ref._parseError){
          addLog("refactor",`Generated ${ref.fixes?.length||0} fix blocks + ${ref.new_code?.length||0} new modules.`,"success");
          D({type:"RESULT",id:"refactor",v:ref});
        } else if(ref?._parseError) {
          addLog("refactor","Response was not valid JSON. Stored raw output.","warning");
        }
      }
      if(abortRef.current){set("phase","complete");set("endTime",Date.now());return;}

      // Phase 4: Tests + Migrator (parallel)
      const p4=[];
      if(S.config.agents.tester){
        p4.push((async()=>{
          const pm=PROMPTS.tester_meta(ctx);
          const meta=await runAgent("tester",pm.system,pm.user(code,ref?.summary||"N/A"),pm.maxTokens);
          if(!meta||abortRef.current) return;
          addLog("tester","Generating test file...");
          try {
            const pt=PROMPTS.tester(ctx);
            const {text:rawTests,tokens}=await callAI({provider:S.provider,apiKey:S.apiKey,systemPrompt:pt.system,userPrompt:pt.user(code,ref?.summary||"N/A"),maxTokens:pt.maxTokens});
            D({type:"TOKENS",n:tokens});
            const cleanTests = rawTests.replace(/^```[\w]*\n?/,"").replace(/\n?```$/,"").trim();
            meta.test_code = cleanTests;
            D({type:"RESULT",id:"tester",v:meta});
            addLog("tester",`Test file: ${cleanTests.split("\n").length} lines.`,"success");
          } catch(err) { addLog("tester",`Error: ${err.message}`,"error"); }
        })());
      }
      if(S.config.agents.migrator){const p=PROMPTS.migrator(ctx);p4.push(runAgent("migrator",p.system,p.user(code),p.maxTokens));}
      if(p4.length) await Promise.all(p4);
      if(abortRef.current){set("phase","complete");set("endTime",Date.now());return;}

      // Phase 5 parallel
      const p5=[];
      if(S.config.agents.documenter){const p=PROMPTS.documenter(ctx);p5.push(runAgent("documenter",p.system,p.user(code.slice(0,2500),ref?.summary||"N/A",ref?.patterns_applied||[]),p.maxTokens));}
      if(S.config.agents.reviewer){const p=PROMPTS.reviewer(ctx);p5.push(runAgent("reviewer",p.system,p.user(code.slice(0,1500),S.issues.length,ref?.patterns_applied||[],S.results.tester?.test_count||"N/A"),p.maxTokens));}
      if(p5.length) await Promise.all(p5);

      set("endTime",Date.now()); set("phase","complete");
      addLog("system","Swarm complete.","success");
    } catch(err) {
      set("error",err.message); set("phase","complete"); set("endTime",Date.now());
      addLog("system",`Fatal: ${err.message}`,"error");
    }
  },[S.codeInput,S.config,S.apiKey,S.provider,S.projectName,S.language,S.issues,S.results,addLog,animProg]);

  const runSwarm = S.mode==="demo" ? runDemo : runLive;

  const canRun = S.mode==="demo"
    ? Object.values(S.config.agents).some(Boolean)
    : S.apiKeyValid===true && S.codeInput.trim().length>=50 && Object.values(S.config.agents).some(Boolean);
  const enabledN = Object.values(S.config.agents).filter(Boolean).length;
  const elapsed = S.startTime ? (((S.endTime||Date.now())-S.startTime)/1000).toFixed(S.endTime?1:0) : null;

  const prov = PROVIDERS[S.provider];

  return <>
    <Head><title>NEXUS REFACTOR — Multi-Agent Code Intelligence</title></Head>
    <div style={{ minHeight:"100vh" }}>

      {/* HEADER */}
      <header style={{ padding:"12px 20px", borderBottom:"1px solid #1C1C32", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0C0C16", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#3B82F6,#10B981)", fontSize:14, fontWeight:800, color:"#fff", fontFamily:"var(--font-mono)" }}>N</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#F0F0F8" }}>NEXUS REFACTOR</div>
            <div style={{ fontSize:9, color:"#3E3E5C", letterSpacing:1.5, fontFamily:"var(--font-mono)", textTransform:"uppercase" }}>Multi-Agent Code Intelligence</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* MODE SWITCH */}
          <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid #1C1C32" }}>
            {[["demo","Demo"],["live","Live"]].map(([m,l])=>(
              <button key={m} onClick={()=>{set("mode",m);if(S.phase!=="running"){set("phase","setup");D({type:"RESET"});}}} style={{
                padding:"7px 18px", fontSize:11, fontWeight:700, fontFamily:"var(--font-mono)", border:"none", letterSpacing:.5,
                background:S.mode===m?(m==="demo"?"#7C3AED":"#10B981"):"transparent",
                color:S.mode===m?"#fff":(m==="demo"?"#7C3AED":"#10B981"),
                transition:"all .2s",
              }}>{l}</button>
            ))}
          </div>
          {S.phase==="running" && <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:7, background:"#3B82F615", border:"1px solid #3B82F630" }}><Spin sz={11}/><span style={{ fontSize:10, color:"#3B82F6", fontFamily:"var(--font-mono)" }}>{S.currentAgent?.toUpperCase()||"INIT"}</span></div>}
          {elapsed && <span style={{ fontSize:10, color:"#6B6B8D", fontFamily:"var(--font-mono)" }}>{elapsed}s</span>}
          {S.totalTokensUsed>0 && <span style={{ fontSize:10, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>{S.totalTokensUsed.toLocaleString()} tok</span>}
        </div>
      </header>

      {/* SETUP */}
      {S.phase==="setup" && (
        <div style={{ maxWidth:820, margin:"0 auto", padding:"28px 20px" }}>

          {/* Demo banner */}
          {S.mode==="demo" && (
            <Cd accent="#7C3AED" style={{ marginBottom:18, textAlign:"center", padding:24 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#7C3AED", marginBottom:6 }}>DEMO MODE</div>
              <p style={{ fontSize:12, color:"#6B6B8D", lineHeight:1.6, maxWidth:500, margin:"0 auto" }}>
                Runs with pre-computed results from a legacy e-commerce codebase analysis. No API key needed. Switch to <strong style={{ color:"#10B981" }}>Live</strong> mode to analyze your own code with real AI.
              </p>
            </Cd>
          )}

          {/* Live: API Key */}
          {S.mode==="live" && (
            <Cd style={{ marginBottom:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <SL color={S.apiKeyValid?'#10B981':'#3B82F6'}>1. API Connection</SL>
                {S.apiKeyValid===true && <Badge c="#10B981">Connected</Badge>}
                {S.apiKeyValid===false && <Badge c="#EF4444">Invalid</Badge>}
              </div>
              {/* Provider selector */}
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {Object.values(PROVIDERS).map(p=>(
                  <button key={p.id} onClick={()=>{set("provider",p.id);set("apiKeyValid",null);}} style={{
                    padding:"8px 18px", borderRadius:8, fontSize:11, fontFamily:"var(--font-mono)", fontWeight:600,
                    background:S.provider===p.id?"#3B82F620":"transparent",
                    border:`1px solid ${S.provider===p.id?"#3B82F650":"#1C1C32"}`,
                    color:S.provider===p.id?"#3B82F6":"#6B6B8D",
                  }}>{p.name}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500 }}>{prov.name} API Key</label>
                  <input type="password" value={S.apiKey} onChange={e=>{set("apiKey",e.target.value);set("apiKeyValid",null);}} placeholder={prov.placeholder}
                    style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:8, padding:"10px 14px", color:"#D4D4E8", fontSize:13, fontFamily:"var(--font-mono)", width:"100%" }}/>
                </div>
                <Btn onClick={testKey} disabled={S.apiKeyTesting||!S.apiKey} sm v={S.apiKeyValid?"success":"primary"}>
                  {S.apiKeyTesting?<><Spin sz={11}/> Testing</>:S.apiKeyValid?"Valid":"Validate"}
                </Btn>
              </div>
              <p style={{ fontSize:10, color:"#3E3E5C", marginTop:8 }}>Key is sent via server-side proxy (/api/{S.provider}). Never exposed to the client.</p>
            </Cd>
          )}

          {/* Live: Code Input */}
          {S.mode==="live" && (
            <Cd style={{ marginBottom:18, opacity:S.apiKeyValid?1:.35, pointerEvents:S.apiKeyValid?"auto":"none", transition:"opacity .3s" }}>
              <SL>2. Code Input</SL>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {[["paste","Paste Code"],["file","Upload File"]].map(([v,l])=>(
                  <button key={v} onClick={()=>set("codeSource",v)} style={{
                    padding:"7px 16px", borderRadius:7, fontSize:11, fontFamily:"var(--font-mono)", fontWeight:600,
                    background:S.codeSource===v?"#3B82F620":"transparent",
                    border:`1px solid ${S.codeSource===v?"#3B82F650":"#1C1C32"}`,
                    color:S.codeSource===v?"#3B82F6":"#6B6B8D",
                  }}>{l}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:12, marginBottom:12 }}>
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500 }}>Project Name (optional)</label>
                  <input value={S.projectName} onChange={e=>set("projectName",e.target.value)} placeholder="e.g., order-service" style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:8, padding:"10px 14px", color:"#D4D4E8", fontSize:13, width:"100%" }}/>
                </div>
                <div style={{ width:170, display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500 }}>Language</label>
                  <select value={S.language} onChange={e=>set("language",e.target.value)} style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:8, padding:"10px 14px", color:"#D4D4E8", fontSize:13, width:"100%" }}>
                    <option value="auto">Auto-detect</option>
                    {["python","javascript","typescript","java","go","rust","ruby","cpp","csharp","php"].map(l=><option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              {S.codeSource==="paste" ? (
                <textarea value={S.codeInput} onChange={e=>set("codeInput",e.target.value)} placeholder="Paste your code here (min 50 chars)..." spellCheck={false}
                  style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:8, padding:14, color:"#D4D4E8", fontSize:12, fontFamily:"var(--font-mono)", minHeight:220, resize:"vertical", lineHeight:1.7, width:"100%" }}/>
              ) : (
                <label style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:36, border:`2px dashed ${S.fileName?"#10B98150":"#1C1C32"}`, borderRadius:12, cursor:"pointer", background:S.fileName?"#10B98106":"transparent" }}>
                  <input type="file" accept=".py,.js,.ts,.jsx,.tsx,.java,.go,.rs,.rb,.cpp,.c,.cs,.php,.swift,.kt,.txt" onChange={handleFile} style={{ display:"none" }}/>
                  {S.fileName?<><span style={{ fontSize:13, color:"#10B981", fontWeight:600, fontFamily:"var(--font-mono)" }}>{S.fileName}</span><span style={{ fontSize:11, color:"#6B6B8D", marginTop:4 }}>{S.codeInput.length.toLocaleString()} chars</span></>:<><span style={{ fontSize:13, color:"#6B6B8D" }}>Click to upload a source file</span><span style={{ fontSize:10, color:"#3E3E5C", marginTop:4 }}>.py .js .ts .java .go .rs .rb .cpp .php</span></>}
                </label>
              )}
            </Cd>
          )}

          {/* Config (both modes) */}
          <Cd style={{ marginBottom:18, opacity:(S.mode==="demo"||(S.apiKeyValid&&S.codeInput.length>=50))?1:.35, pointerEvents:(S.mode==="demo"||(S.apiKeyValid&&S.codeInput.length>=50))?"auto":"none" }}>
            <SL>{S.mode==="demo"?"Configuration":"3. Configuration"}</SL>
            <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500, marginBottom:10, display:"block" }}>Agents ({enabledN}/8)</label>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:7, marginBottom:18 }}>
              {AGENT_DEFS.map(a=>{
                const on=S.config.agents[a.id];
                return <button key={a.id} onClick={()=>D({type:"TOGGLE_AGENT",id:a.id})} style={{
                  display:"flex", alignItems:"center", gap:9, padding:"9px 12px",
                  background:on?a.color+"10":"#10101E", border:`1px solid ${on?a.color+"40":"#1C1C32"}`,
                  borderRadius:9, textAlign:"left",
                }}>
                  <div style={{ width:26, height:26, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", background:on?a.color:"#1C1C32", color:on?"#fff":"#3E3E5C", fontSize:11, fontWeight:700, fontFamily:"var(--font-mono)" }}>{a.icon}</div>
                  <div><div style={{ fontSize:11, fontWeight:600, color:on?"#D4D4E8":"#6B6B8D", fontFamily:"var(--font-mono)" }}>{a.name}</div><div style={{ fontSize:8, color:"#3E3E5C", lineHeight:1.2, marginTop:1 }}>{a.role.slice(0,50)}...</div></div>
                </button>;
              })}
            </div>
            <div style={{ display:"flex", gap:14, marginBottom:14, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:180 }}>
                <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500, display:"block", marginBottom:6 }}>Depth</label>
                <div style={{ display:"flex", gap:5 }}>
                  {[["quick","Quick"],["thorough","Thorough"],["exhaustive","Exhaustive"]].map(([v,l])=>(
                    <button key={v} onClick={()=>conf("depth",v)} style={{ flex:1, padding:"7px 10px", borderRadius:7, fontSize:10, fontFamily:"var(--font-mono)", fontWeight:600, background:S.config.depth===v?"#3B82F620":"transparent", border:`1px solid ${S.config.depth===v?"#3B82F650":"#1C1C32"}`, color:S.config.depth===v?"#3B82F6":"#6B6B8D" }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex:1, minWidth:180 }}>
                <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500, display:"block", marginBottom:6 }}>Focus</label>
                <div style={{ display:"flex", gap:5 }}>
                  {[["balanced","Balanced"],["security","Security"],["performance","Perf"],["maintainability","Maintain"]].map(([v,l])=>(
                    <button key={v} onClick={()=>conf("focus",v)} style={{ flex:1, padding:"7px 10px", borderRadius:7, fontSize:10, fontFamily:"var(--font-mono)", fontWeight:600, background:S.config.focus===v?"#3B82F620":"transparent", border:`1px solid ${S.config.focus===v?"#3B82F650":"#1C1C32"}`, color:S.config.focus===v?"#3B82F6":"#6B6B8D" }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            {S.mode==="live" && <>
              <div style={{ display:"flex", gap:12, marginBottom:14 }}>
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                  <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500 }}>Target Framework (optional)</label>
                  <input value={S.config.targetFramework} onChange={e=>conf("targetFramework",e.target.value)} placeholder="e.g., FastAPI, Spring Boot" style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:8, padding:"10px 14px", color:"#D4D4E8", fontSize:13, width:"100%" }}/>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label style={{ fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:500 }}>Custom Instructions (optional)</label>
                <textarea value={S.config.customInstructions} onChange={e=>conf("customInstructions",e.target.value)} placeholder="e.g., Focus on payment module, use async patterns..."
                  style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:8, padding:12, color:"#D4D4E8", fontSize:12, minHeight:70, resize:"vertical", lineHeight:1.6, width:"100%" }}/>
              </div>
            </>}
          </Cd>

          <div style={{ display:"flex", justifyContent:"center", padding:"8px 0 36px" }}>
            <Btn onClick={runSwarm} disabled={!canRun} style={{ padding:"13px 44px", fontSize:13, letterSpacing:1.5, borderRadius:11 }}>
              {S.mode==="demo" ? `RUN DEMO (${enabledN} agents)` : `DEPLOY ${enabledN} AGENTS`}
            </Btn>
          </div>
        </div>
      )}

      {/* RUNNING / COMPLETE */}
      {(S.phase==="running"||S.phase==="complete") && (
        <div style={{ display:"flex", height:"calc(100vh - 49px)" }}>
          {/* Sidebar */}
          <div style={{ width:280, borderRight:"1px solid #1C1C32", display:"flex", flexDirection:"column", flexShrink:0, background:"#0C0C16" }}>
            <div style={{ padding:14, flexShrink:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <SL>Agents ({S.agents.filter(a=>a.status==="done").length}/{S.agents.length})</SL>
                {S.phase==="running"?<Btn onClick={()=>{abortRef.current=true;set("phase","complete");set("endTime",Date.now());addLog("system","Aborted.","error");}} v="danger" sm>Abort</Btn>:<Btn onClick={()=>{set("phase","setup");D({type:"RESET"});}} v="ghost" sm>New</Btn>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {S.agents.map(a=>{
                  const prog=S.agentProgress[a.id]||0, active=a.status==="running";
                  return <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:active?a.color+"0C":"transparent", border:`1px solid ${active?a.color+"35":"#1C1C32"}`, borderRadius:8, position:"relative", overflow:"hidden", transition:"all .3s" }}>
                    {active && <div style={{ position:"absolute", bottom:0, left:0, height:2, width:`${prog}%`, background:a.color, transition:"width .4s" }}/>}
                    <div style={{ width:24, height:24, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", background:a.status==="done"?a.color:active?a.color+"25":"#10101E", color:a.status==="done"?"#fff":active?a.color:"#3E3E5C", fontSize:10, fontWeight:700, fontFamily:"var(--font-mono)" }}>
                      {active?<Spin sz={10} c={a.color}/>:a.icon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:10, fontWeight:600, color:active?"#D4D4E8":"#6B6B8D", fontFamily:"var(--font-mono)" }}>{a.name}</div>
                      <div style={{ fontSize:8, color:"#3E3E5C" }}>{a.status==="done"?"Complete":active?`${prog}%`:a.status==="error"?"Failed":"Queued"}</div>
                    </div>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:a.status==="done"?"#10B981":active?a.color:a.status==="error"?"#EF4444":"#1C1C32", animation:active?"pulse2 1.5s infinite":"none" }}/>
                  </div>;
                })}
              </div>
            </div>
            <div style={{ flex:1, borderTop:"1px solid #1C1C32", display:"flex", flexDirection:"column", minHeight:0 }}>
              <div style={{ padding:"8px 14px 4px" }}><SL>Log</SL></div>
              <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"0 10px 10px", fontSize:10, lineHeight:1.8, fontFamily:"var(--font-mono)" }}>
                {S.logs.map((l,i)=><div key={i} style={{ display:"flex", gap:5 }}>
                  <span style={{ color:"#3E3E5C", minWidth:48, flexShrink:0 }}>{l.time}</span>
                  <span style={{ color:AGENT_DEFS.find(a=>a.id===l.agent)?.color||"#6B6B8D", fontWeight:600, minWidth:56, flexShrink:0 }}>[{(l.agent||"SYS").toUpperCase().slice(0,8)}]</span>
                  <span style={{ color:l.type==="error"?"#EF4444":l.type==="success"?"#10B981":l.type==="warning"?"#F59E0B":"#6B6B8D" }}>{l.message}</span>
                </div>)}
              </div>
            </div>
          </div>

          {/* Results Area */}
          <ResultsPanel S={S}/>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"6px 20px", background:"#06060C", borderTop:"1px solid #1C1C32", display:"flex", justifyContent:"space-between", fontSize:9, color:"#3E3E5C", fontFamily:"var(--font-mono)", zIndex:50 }}>
        <span>NEXUS REFACTOR v3.0 | Oke Iyanuoluwa Enoch | MSc Robotics & Automation, University of Salford</span>
        <span>{S.mode==="demo"?"Demo Mode":"Live Mode"} | {enabledN} agents</span>
      </div>
    </div>
  </>;
}

// ════════════════════════════
//  RESULTS PANEL (with exports)
// ════════════════════════════
function ResultsPanel({ S }) {
  const [tab,setTab] = useState("overview");
  const langExt = detectLanguageExt(S.language === "auto" ? "python" : S.language);
  const projName = S.projectName || "refactored";

  const tabs = useMemo(()=>{
    const t=[{id:"overview",l:"Overview"}];
    if(S.issues.length) t.push({id:"issues",l:`Issues (${S.issues.length})`});
    if(S.results.refactor) t.push({id:"refactored",l:`Fixes (${S.results.refactor?.fixes?.length||0})`});
    if(S.results.refactor?.fixes?.length) t.push({id:"diff",l:"All Edits"});
    if(S.results.tester) t.push({id:"tests",l:"Tests"});
    if(S.results.documenter) t.push({id:"docs",l:"Docs"});
    if(S.results.migrator) t.push({id:"migrate",l:"Migration"});
    if(S.results.reviewer) t.push({id:"review",l:"Review"});
    return t;
  },[S.issues.length,S.results,S.codeInput]);

  const rev=S.results.reviewer, ref=S.results.refactor, sec=S.results.security, opt=S.results.optimizer;
  const elapsed=S.startTime&&S.endTime?((S.endTime-S.startTime)/1000).toFixed(1):null;
  const hasAnyResult = Object.keys(S.results).length > 0;

  // Export handlers
  const exportReport = () => {
    const md = generateMarkdownReport(S);
    downloadText(`${projName}-report.md`, md);
  };
  const exportRefactored = () => {
    if(ref?.refactored_code) downloadText(`${projName}-refactored.${langExt}`, ref.refactored_code);
  };
  const exportTests = () => {
    if(S.results.tester?.test_code) downloadText(`test_${projName}.${langExt}`, S.results.tester.test_code);
  };
  const exportDocs = () => {
    if(S.results.documenter?.readme) downloadText(`${projName}-README.md`, S.results.documenter.readme);
  };
  const exportAll = () => {
    // Download each artifact individually (no zip library needed)
    if(ref?.refactored_code) downloadText(`${projName}-refactored.${langExt}`, ref.refactored_code);
    setTimeout(() => {
      if(S.results.tester?.test_code) downloadText(`test_${projName}.${langExt}`, S.results.tester.test_code);
    }, 300);
    setTimeout(() => {
      const md = generateMarkdownReport(S);
      downloadText(`${projName}-report.md`, md);
    }, 600);
    setTimeout(() => {
      if(S.results.documenter?.readme) downloadText(`${projName}-README.md`, S.results.documenter.readme);
    }, 900);
  };
  const exportJSON = () => {
    const data = { metrics: S.metrics, issues: S.issues, results: S.results, config: S.config, timestamp: new Date().toISOString() };
    downloadText(`${projName}-data.json`, JSON.stringify(data, null, 2));
  };

  return <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, marginBottom:24 }}>
    {/* Tab bar + Export toolbar */}
    <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid #1C1C32", background:"#0C0C16", flexShrink:0 }}>
      <div style={{ display:"flex", overflowX:"auto", flex:1 }}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"10px 16px", border:"none", borderBottom:tab===t.id?"2px solid #3B82F6":"2px solid transparent", background:"transparent", color:tab===t.id?"#3B82F6":"#3E3E5C", fontSize:10, fontWeight:600, fontFamily:"var(--font-mono)", whiteSpace:"nowrap" }}>{t.l}</button>)}
      </div>
      {/* Export buttons */}
      {hasAnyResult && S.phase==="complete" && <div style={{ display:"flex", gap:5, padding:"0 12px", flexShrink:0 }}>
        <button onClick={exportAll} title="Download all artifacts" style={{ background:"#10B98118", border:"1px solid #10B98130", borderRadius:6, padding:"5px 12px", fontSize:9, color:"#10B981", fontFamily:"var(--font-mono)", fontWeight:700, letterSpacing:.5 }}>Export All</button>
        <button onClick={exportReport} title="Download markdown report" style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:6, padding:"5px 10px", fontSize:9, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>Report</button>
        <button onClick={exportJSON} title="Download raw JSON data" style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:6, padding:"5px 10px", fontSize:9, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>JSON</button>
      </div>}
    </div>
    {S.metrics && <div style={{ padding:"12px 20px", borderBottom:"1px solid #1C1C32", display:"flex", gap:16, justifyContent:"center", flexWrap:"wrap" }}>
      <Ring value={S.metrics.cyclomatic_complexity} max={100} label="Complex." color="#EF4444"/>
      <Ring value={S.metrics.maintainability_index} max={100} label="Maintain." color={S.metrics.maintainability_index>50?"#10B981":S.metrics.maintainability_index>20?"#F59E0B":"#EF4444"}/>
      <Ring value={S.metrics.lines_of_code} max={500} label="LOC" color="#7C3AED"/>
      <Ring value={S.metrics.code_duplication_pct} max={100} label="Dupl%" color="#E8650A"/>
      <Ring value={S.metrics.coupling_score} max={100} label="Coupling" color="#DB2777"/>
      <Ring value={S.metrics.tech_debt_hours} max={100} label="Debt h" color="#F59E0B"/>
      <Ring value={S.metrics.test_coverage} max={100} label="Tests%" color={S.metrics.test_coverage>60?"#10B981":"#EF4444"}/>
    </div>}
    <div style={{ flex:1, overflowY:"auto", padding:20 }}>
      {/* OVERVIEW */}
      {tab==="overview" && <div style={{ display:"flex", flexDirection:"column", gap:16, animation:"fadeUp .4s" }}>
        {!S.agents.length && <div style={{ textAlign:"center", padding:60, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>Initializing...</div>}
        {rev && <Cd accent="#3B82F6"><div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:16, textAlign:"center" }}>
          <div><div style={{ fontSize:36, fontWeight:800 }}>{rev.grade||"?"}</div><div style={{ fontSize:9, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>GRADE</div></div>
          <div><div style={{ fontSize:36, fontWeight:800, color:rev.approved?"#10B981":"#EF4444" }}>{rev.approved?"YES":"NO"}</div><div style={{ fontSize:9, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>APPROVED</div></div>
          <div><div style={{ fontSize:36, fontWeight:800, color:"#3B82F6" }}>{rev.confidence}%</div><div style={{ fontSize:9, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>CONFIDENCE</div></div>
          <div><div style={{ fontSize:36, fontWeight:800, color:"#F59E0B" }}>{S.issues.length}</div><div style={{ fontSize:9, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>ISSUES</div></div>
        </div></Cd>}
        {ref?.before_after && <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:14, alignItems:"center" }}>
          <Cd accent="#EF4444" style={{ textAlign:"center" }}><SL color="#EF4444">Before</SL><div style={{ fontSize:26, fontWeight:800, color:"#EF4444" }}>{ref.before_after.complexity_before}</div><div style={{ fontSize:9, color:"#3E3E5C" }}>Complexity</div><div style={{ fontSize:16, fontWeight:700, color:"#EF4444", marginTop:6 }}>{ref.before_after.maintainability_before}/100</div><div style={{ fontSize:9, color:"#3E3E5C" }}>Maintainability</div></Cd>
          <div style={{ fontSize:20, color:"#10B981" }}>{"\u2192"}</div>
          <Cd accent="#10B981" style={{ textAlign:"center" }}><SL color="#10B981">After</SL><div style={{ fontSize:26, fontWeight:800, color:"#10B981" }}>{ref.before_after.complexity_after}</div><div style={{ fontSize:9, color:"#3E3E5C" }}>Complexity</div><div style={{ fontSize:16, fontWeight:700, color:"#10B981", marginTop:6 }}>{ref.before_after.maintainability_after}/100</div><div style={{ fontSize:9, color:"#3E3E5C" }}>Maintainability</div></Cd>
        </div>}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {sec && <Cd accent="#EF4444"><SL color="#EF4444">Security Risk</SL><div style={{ fontSize:26, fontWeight:800, color:sec.risk_score>70?"#EF4444":"#F59E0B" }}>{sec.risk_score}/100</div><p style={{ fontSize:11, color:"#6B6B8D", marginTop:8, lineHeight:1.6 }}>{typeof sec.summary==="string"?sec.summary:""}</p></Cd>}
          {opt && <Cd accent="#2563EB"><SL color="#2563EB">Performance</SL><div style={{ fontSize:26, fontWeight:800, color:opt.performance_score>50?"#10B981":"#EF4444" }}>{opt.performance_score}/100</div><p style={{ fontSize:11, color:"#6B6B8D", marginTop:8, lineHeight:1.6 }}>{typeof opt.summary==="string"?opt.summary:""}</p></Cd>}
        </div>
        {elapsed && <Cd><div style={{ display:"flex", gap:20, justifyContent:"center", flexWrap:"wrap" }}>
          <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:700 }}>{elapsed}s</div><div style={{ fontSize:8, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>DURATION</div></div>
          <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:700 }}>{S.totalTokensUsed.toLocaleString()}</div><div style={{ fontSize:8, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>TOKENS</div></div>
          <div style={{ textAlign:"center" }}><div style={{ fontSize:16, fontWeight:700 }}>{S.agents.filter(a=>a.status==="done").length}/{S.agents.length}</div><div style={{ fontSize:8, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>AGENTS</div></div>
        </div></Cd>}
        {/* Quick export bar on overview */}
        {S.phase==="complete" && hasAnyResult && <Cd style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center", alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#6B6B8D", fontFamily:"var(--font-mono)" }}>Download:</span>
          {ref?.refactored_code && <Btn onClick={exportRefactored} sm v="success">Refactored Code (.{langExt})</Btn>}
          {S.results.tester?.test_code && <Btn onClick={exportTests} sm v="primary">Test Suite (.{langExt})</Btn>}
          {S.results.documenter?.readme && <Btn onClick={exportDocs} sm v="ghost">README.md</Btn>}
          <Btn onClick={exportReport} sm v="ghost">Full Report (.md)</Btn>
          <Btn onClick={exportJSON} sm v="ghost">Raw Data (.json)</Btn>
        </Cd>}
      </div>}
      {/* ISSUES */}
      {tab==="issues" && (()=>{const so={critical:0,high:1,medium:2,low:3};const sorted=[...S.issues].sort((a,b)=>(so[a.severity]??9)-(so[b.severity]??9));const sc={critical:"#EF4444",high:"#E8650A",medium:"#F59E0B",low:"#10B981"};return <div style={{ display:"flex", flexDirection:"column", gap:8, animation:"fadeUp .3s" }}><div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>{["critical","high","medium","low"].map(sv=>{const n=S.issues.filter(i=>i.severity===sv).length;return n?<Badge key={sv} c={sc[sv]}>{sv.toUpperCase()}: {n}</Badge>:null;})}</div>{sorted.map((iss,i)=><Cd key={i} accent={sc[iss.severity]} style={{ padding:14, borderLeft:`3px solid ${sc[iss.severity]}` }}><div style={{ display:"flex", justifyContent:"space-between", gap:10 }}><div style={{ flex:1 }}><div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}><span style={{ fontSize:12, fontWeight:600, fontFamily:"var(--font-mono)" }}>{iss.title}</span><Badge c={sc[iss.severity]}>{iss.severity}</Badge></div><p style={{ fontSize:11, color:"#6B6B8D", lineHeight:1.6, margin:0 }}>{iss.description}</p>{iss.cwe&&<Badge c="#7C3AED">{iss.cwe}</Badge>}{(iss.fix_suggestion||iss.fix)&&<p style={{ fontSize:11, color:"#10B981", marginTop:6 }}>Fix: {iss.fix_suggestion||iss.fix}</p>}</div><div style={{ textAlign:"right", flexShrink:0 }}>{iss.line&&<div style={{ fontSize:10, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>L{iss.line}</div>}{iss.agent&&<div style={{ fontSize:9, color:"#3E3E5C" }}>{iss.agent}</div>}</div></div></Cd>)}</div>;})()}
      {/* FIX INSTRUCTIONS — Claude Code style edit blocks */}
      {tab==="refactored"&&ref&&<div style={{ display:"flex", flexDirection:"column", gap:16, animation:"fadeUp .3s" }}>
        <Cd style={{ padding:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>
                {ref.fixes?.length||0} Fixes + {ref.new_code?.length||0} New Modules
              </div>
              <div style={{ fontSize:11, color:"#6B6B8D", lineHeight:1.5 }}>{ref.summary||""}</div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{ref.patterns_applied&&ref.patterns_applied.map((p,i)=><Badge key={i} c="#7C3AED">{p}</Badge>)}</div>
          </div>
          {ref.before_after && <div style={{ display:"flex", gap:16, marginTop:12, flexWrap:"wrap" }}>
            <div><span style={{ fontSize:10, color:"#EF4444", fontFamily:"var(--font-mono)" }}>Complexity: {ref.before_after.complexity_before}</span><span style={{ color:"#3E3E5C", margin:"0 6px" }}>{"\u2192"}</span><span style={{ fontSize:10, color:"#10B981", fontFamily:"var(--font-mono)" }}>{ref.before_after.complexity_after}</span></div>
            <div><span style={{ fontSize:10, color:"#EF4444", fontFamily:"var(--font-mono)" }}>Maintainability: {ref.before_after.maintainability_before}</span><span style={{ color:"#3E3E5C", margin:"0 6px" }}>{"\u2192"}</span><span style={{ fontSize:10, color:"#10B981", fontFamily:"var(--font-mono)" }}>{ref.before_after.maintainability_after}</span></div>
          </div>}
        </Cd>

        {/* Each fix as a before/after block */}
        {ref.fixes&&ref.fixes.map((fix,i)=><FixBlock key={i} fix={fix} index={i}/>)}

        {/* New code to add */}
        {ref.new_code&&ref.new_code.length>0&&<>
          <SL color="#3B82F6">New Code to Add</SL>
          {ref.new_code.map((mod,i)=><NewCodeBlock key={i} mod={mod} index={i} langExt={langExt}/>)}
        </>}
      </div>}

      {/* DIFF VIEW is now replaced by the fix blocks above — remove separate diff tab */}
      {tab==="diff"&&ref&&<div style={{ animation:"fadeUp .3s" }}>
        <SL>All Fix Blocks</SL>
        <p style={{ fontSize:12, color:"#6B6B8D", marginBottom:16, lineHeight:1.6 }}>
          Each block below shows the original code (red) and the fix (green). Find the original lines in your file, replace them with the fix. Apply in order from top to bottom.
        </p>
        {ref.fixes&&ref.fixes.map((fix,i)=><FixBlock key={i} fix={fix} index={i}/>)}
        {ref.new_code&&ref.new_code.map((mod,i)=><NewCodeBlock key={i} mod={mod} index={i} langExt={langExt}/>)}
      </div>}
      {/* TESTS */}
      {tab==="tests"&&S.results.tester&&(()=>{const d=S.results.tester;return <div style={{ display:"flex", flexDirection:"column", gap:14, animation:"fadeUp .3s" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>{d.categories&&Object.entries(d.categories).map(([c,n])=><Cd key={c} style={{ padding:12, textAlign:"center", minWidth:80 }}><div style={{ fontSize:20, fontWeight:800, color:"#7C3AED" }}>{n}</div><div style={{ fontSize:8, color:"#3E3E5C", fontFamily:"var(--font-mono)", textTransform:"uppercase" }}>{c}</div></Cd>)}<Cd style={{ padding:12, textAlign:"center", minWidth:80 }} accent="#10B981"><div style={{ fontSize:20, fontWeight:800, color:"#10B981" }}>{d.coverage_estimate||0}%</div><div style={{ fontSize:8, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>COVERAGE</div></Cd></div>
          <Btn onClick={exportTests} sm v="primary">Download Tests</Btn>
        </div>
        {d.frameworks_used&&<div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{d.frameworks_used.map((f,i)=><Badge key={i}>{f}</Badge>)}</div>}
        <CodeBlock code={d.test_code} maxH={700} filename={`test_${projName}.${langExt}`}/>
      </div>;})()}
      {/* DOCS */}
      {tab==="docs"&&S.results.documenter&&(()=>{const d=S.results.documenter;return <div style={{ display:"flex", flexDirection:"column", gap:18, animation:"fadeUp .3s" }}>
        {d.readme&&<div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <SL color="#D97706">README.md</SL>
            <Btn onClick={exportDocs} sm v="ghost">Download README</Btn>
          </div>
          <Cd><pre style={{ fontSize:12, lineHeight:1.8, color:"#6B6B8D", fontFamily:"var(--font-mono)", whiteSpace:"pre-wrap", margin:0 }}>{d.readme}</pre></Cd>
        </div>}
        {d.architecture_mermaid&&<div><SL color="#E8650A">Architecture (Mermaid)</SL><CodeBlock code={d.architecture_mermaid} lang="mermaid" maxH={280} filename={`${projName}-architecture.mermaid`}/></div>}
        {d.api_docs&&<div><SL color="#10B981">API Docs</SL><Cd><pre style={{ fontSize:12, lineHeight:1.8, color:"#6B6B8D", fontFamily:"var(--font-mono)", whiteSpace:"pre-wrap", margin:0 }}>{d.api_docs}</pre></Cd></div>}
        {d.changelog?.length>0&&<div><SL color="#7C3AED">Changelog</SL>{d.changelog.map((c,i)=><div key={i} style={{ padding:"5px 12px", borderLeft:"2px solid #7C3AED30", marginBottom:3, fontSize:11, color:"#6B6B8D", fontFamily:"var(--font-mono)" }}><span style={{ color:"#7C3AED", marginRight:6 }}>{i+1}.</span>{c}</div>)}</div>}
      </div>;})()}
      {/* MIGRATION */}
      {tab==="migrate"&&S.results.migrator&&(()=>{const d=S.results.migrator;return <div style={{ display:"flex", flexDirection:"column", gap:14, animation:"fadeUp .3s" }}>{d.modernization_score!==undefined&&<Cd accent="#DB2777" style={{ textAlign:"center" }}><div style={{ fontSize:32, fontWeight:800, color:d.modernization_score>50?"#10B981":"#F59E0B" }}>{d.modernization_score}/100</div><div style={{ fontSize:9, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>MODERNIZATION</div></Cd>}{d.migrations?.map((m,i)=><Cd key={i} accent="#DB2777" style={{ borderLeft:"3px solid #DB277780" }}><div style={{ display:"flex", justifyContent:"space-between" }}><div><div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>{m.title}</div><div style={{ fontSize:11, color:"#6B6B8D" }}>{m.from} {"\u2192"} {m.to}</div></div><div>{m.effort_hours&&<Badge c="#F59E0B">{m.effort_hours}h</Badge>}</div></div>{m.steps?.length>0&&<div style={{ marginTop:8 }}>{m.steps.map((s,j)=><div key={j} style={{ fontSize:11, color:"#6B6B8D", padding:"2px 0", fontFamily:"var(--font-mono)" }}><span style={{ color:"#DB2777", marginRight:6 }}>{j+1}.</span>{s}</div>)}</div>}</Cd>)}{d.framework_recommendations?.length>0&&<Cd><SL>Recommended</SL><div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>{d.framework_recommendations.map((f,i)=><div key={i} style={{ padding:"8px 14px", borderRadius:8, background:"#10101E", border:"1px solid #1C1C32" }}><div style={{ fontSize:12, fontWeight:600, color:"#3B82F6", fontFamily:"var(--font-mono)" }}>{f.name}</div><div style={{ fontSize:10, color:"#3E3E5C", marginTop:2 }}>{f.reason}</div></div>)}</div></Cd>}</div>;})()}
      {/* REVIEW */}
      {tab==="review"&&rev&&<div style={{ display:"flex", flexDirection:"column", gap:14, animation:"fadeUp .3s" }}>
        <Cd accent="#3B82F6" style={{ textAlign:"center" }}><div style={{ fontSize:52, fontWeight:900, letterSpacing:-2 }}>{rev.grade}</div><div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:10 }}><span style={{ color:rev.approved?"#10B981":"#EF4444", fontWeight:700, fontSize:13 }}>{rev.approved?"APPROVED":"NOT APPROVED"}</span><span style={{ color:"#3B82F6", fontWeight:700, fontSize:13 }}>{rev.confidence}% confidence</span></div></Cd>
        {rev.categories&&<Cd><SL>Scores</SL><div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>{Object.entries(rev.categories).map(([c,info])=><div key={c} style={{ padding:10, background:"#10101E", borderRadius:8, border:"1px solid #1C1C32" }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontSize:10, fontWeight:600, fontFamily:"var(--font-mono)", textTransform:"capitalize" }}>{c.replace("_"," ")}</span><span style={{ fontSize:13, fontWeight:800, color:info.score>=7?"#10B981":info.score>=5?"#F59E0B":"#EF4444", fontFamily:"var(--font-mono)" }}>{info.score}/10</span></div><div style={{ width:"100%", height:3, background:"#1C1C32", borderRadius:2, overflow:"hidden" }}><div style={{ width:`${info.score*10}%`, height:"100%", borderRadius:2, background:info.score>=7?"#10B981":info.score>=5?"#F59E0B":"#EF4444", transition:"width 1s" }}/></div><p style={{ fontSize:9, color:"#3E3E5C", marginTop:5, lineHeight:1.5 }}>{info.notes}</p></div>)}</div></Cd>}
        {rev.recommendations?.length>0&&<Cd><SL>Recommendations</SL>{rev.recommendations.map((r,i)=><div key={i} style={{ fontSize:12, color:"#6B6B8D", padding:"4px 0", fontFamily:"var(--font-mono)", borderLeft:"2px solid #3B82F630", paddingLeft:12, marginBottom:3 }}>{r}</div>)}</Cd>}
        {rev.final_assessment&&<Cd accent="#10B981"><SL color="#10B981">Final Assessment</SL><p style={{ fontSize:13, lineHeight:1.8, margin:0 }}>{rev.final_assessment}</p></Cd>}
      </div>}
    </div>
  </div>;
}

// ════════════════════════════════════
//  FIX BLOCK — Claude Code style
// ════════════════════════════════════
function FixBlock({ fix, index }) {
  const [copiedOrig, setCopiedOrig] = useState(false);
  const [copiedFix, setCopiedFix] = useState(false);
  const sevC = { critical:"#EF4444", high:"#E8650A", medium:"#F59E0B", low:"#10B981" };
  const color = sevC[fix.severity] || "#6B6B8D";

  const doCopyFix = async () => {
    await copyToClipboard(fix.fixed_code||"");
    setCopiedFix(true); setTimeout(()=>setCopiedFix(false),2000);
  };

  return (
    <div style={{ background:"#0C0C16", border:`1px solid ${color}25`, borderRadius:12, overflow:"hidden", animation:"fadeUp 0.3s" }}>
      {/* Header */}
      <div style={{ padding:"12px 16px", borderBottom:`1px solid ${color}15`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ background:color+"20", color, padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, fontFamily:"var(--font-mono)" }}>Fix #{fix.id||index+1}</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#D4D4E8" }}>{fix.title}</span>
          {fix.lines && <span style={{ fontSize:10, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>Lines {fix.lines}</span>}
        </div>
        <span style={{ background:color+"18", color, padding:"2px 8px", borderRadius:6, fontSize:9, fontWeight:700, fontFamily:"var(--font-mono)", textTransform:"uppercase" }}>{fix.severity}</span>
      </div>

      {/* Issue */}
      <div style={{ padding:"10px 16px", borderBottom:"1px solid #1C1C32", fontSize:11, color:"#6B6B8D", lineHeight:1.6 }}>
        <strong style={{ color:"#D4D4E8" }}>Issue:</strong> {fix.issue}
      </div>

      {/* Before / After */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
        <div style={{ borderRight:"1px solid #1C1C32" }}>
          <div style={{ padding:"8px 16px", background:"#EF444408", borderBottom:"1px solid #EF444415", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:10, color:"#EF4444", fontWeight:700, fontFamily:"var(--font-mono)", letterSpacing:1 }}>FIND THIS</span>
            <button onClick={async()=>{await copyToClipboard(fix.original_code||"");setCopiedOrig(true);setTimeout(()=>setCopiedOrig(false),2000);}} style={{ background:copiedOrig?"#10B98120":"#10101E", border:`1px solid ${copiedOrig?"#10B98140":"#1C1C32"}`, borderRadius:5, padding:"2px 8px", fontSize:9, color:copiedOrig?"#10B981":"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>{copiedOrig?"Copied":"Copy"}</button>
          </div>
          <pre style={{ margin:0, padding:"12px 16px", fontSize:11, lineHeight:1.7, color:"#EF9A9A", background:"#EF444406", fontFamily:"var(--font-mono)", overflowX:"auto", whiteSpace:"pre-wrap", minHeight:50 }}>{fix.original_code||""}</pre>
        </div>
        <div>
          <div style={{ padding:"8px 16px", background:"#10B98108", borderBottom:"1px solid #10B98115", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:10, color:"#10B981", fontWeight:700, fontFamily:"var(--font-mono)", letterSpacing:1 }}>REPLACE WITH</span>
            <button onClick={doCopyFix} style={{ background:copiedFix?"#10B98120":"#10101E", border:`1px solid ${copiedFix?"#10B98140":"#1C1C32"}`, borderRadius:5, padding:"2px 8px", fontSize:9, color:copiedFix?"#10B981":"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>{copiedFix?"Copied":"Copy Fix"}</button>
          </div>
          <pre style={{ margin:0, padding:"12px 16px", fontSize:11, lineHeight:1.7, color:"#A5D6A7", background:"#10B98106", fontFamily:"var(--font-mono)", overflowX:"auto", whiteSpace:"pre-wrap", minHeight:50 }}>{fix.fixed_code||""}</pre>
        </div>
      </div>

      {fix.explanation && <div style={{ padding:"10px 16px", borderTop:"1px solid #1C1C32", fontSize:11, color:"#6B6B8D", lineHeight:1.6 }}>
        <strong style={{ color:"#3B82F6" }}>Why:</strong> {fix.explanation}
      </div>}
    </div>
  );
}

function NewCodeBlock({ mod, index, langExt }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background:"#0C0C16", border:"1px solid #3B82F625", borderRadius:12, overflow:"hidden", animation:"fadeUp 0.3s" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid #3B82F615", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ background:"#3B82F620", color:"#3B82F6", padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, fontFamily:"var(--font-mono)" }}>NEW</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#D4D4E8" }}>{mod.title}</span>
        </div>
        {mod.where && <span style={{ fontSize:10, color:"#3E3E5C", fontFamily:"var(--font-mono)" }}>{mod.where}</span>}
      </div>
      {mod.explanation && <div style={{ padding:"10px 16px", borderBottom:"1px solid #1C1C32", fontSize:11, color:"#6B6B8D", lineHeight:1.6 }}>{mod.explanation}</div>}
      <div style={{ position:"relative" }}>
        <div style={{ position:"absolute", top:8, right:12, zIndex:2, display:"flex", gap:6 }}>
          <button onClick={async()=>{await copyToClipboard(mod.code||"");setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{ background:copied?"#10B98120":"#10101E", border:`1px solid ${copied?"#10B98140":"#1C1C32"}`, borderRadius:5, padding:"3px 10px", fontSize:9, color:copied?"#10B981":"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>{copied?"Copied":"Copy Code"}</button>
          <button onClick={()=>downloadText(`${(mod.title||"module").replace(/\s+/g,"_").toLowerCase()}.${langExt||"py"}`,mod.code||"")} style={{ background:"#10101E", border:"1px solid #1C1C32", borderRadius:5, padding:"3px 10px", fontSize:9, color:"#6B6B8D", fontFamily:"var(--font-mono)", fontWeight:600 }}>Download</button>
        </div>
        <pre style={{ margin:0, padding:"12px 16px", paddingTop:36, fontSize:11, lineHeight:1.7, color:"#A5D6A7", background:"#10B98106", fontFamily:"var(--font-mono)", overflowX:"auto", whiteSpace:"pre-wrap", maxHeight:500, overflowY:"auto" }}>{mod.code||""}</pre>
      </div>
    </div>
  );
}
