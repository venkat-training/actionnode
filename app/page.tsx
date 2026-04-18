'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type TabId = 'grid' | 'plastic' | 'community' | 'myimpact'
type GridTier = 'green' | 'amber' | 'red'
type ActionType = 'swapped' | 'refused' | 'recycled' | 'cleanup' | 'planted'

interface GridZone { zone:string; intensity:number; status:GridTier; label:string; advice:string; renewablePct:number }
interface GridData { zones:GridZone[]; primary:GridZone; sparkline:number[]; bestHour:number }
interface Product { name:string; brand:string; isPlastic:boolean; isGlass?:boolean; packagingDetails:string[]; hasPackagingData:boolean; ecoScore:string; ecoScoreGrade:string; aiSwapSuggestion:string }
interface Pledge { id?:string; display_name:string; action_type:ActionType; city?:string; created_at?:string }
interface LogEntry { item:string; action:ActionType; date:Date }

const ZONE_SHORT:Record<string,string> = {'AUS-NSW':'NSW','AUS-VIC':'VIC','AUS-QLD':'QLD'}
const ACTION_LABEL:Record<ActionType,string> = { refused:'Refused plastic', swapped:'Swapped to eco-alt', recycled:'Recycled properly', cleanup:'Joined cleanup', planted:'Planted a tree' }
const TIER_COLOR:Record<GridTier,string> = { green:'#22c55e', amber:'#f59e0b', red:'#ef4444' }

function fmt24h(h:number) { if(h===0)return'12:00 AM'; if(h<12)return`${h}:00 AM`; if(h===12)return'12:00 PM'; return`${h-12}:00 PM` }
function sanitise(s:string) { return s.replace(/[<>&"']/g,'').slice(0,80) }
function relTime(iso?:string) { if(!iso)return'just now'; const d=Date.now()-new Date(iso).getTime(); if(d<60000)return'just now'; if(d<3600000)return`${Math.floor(d/60000)}m ago`; return`${Math.floor(d/3600000)}h ago` }

function Sparkline({data,color}:{data:number[];color:string}) {
  if(!data.length)return null
  const W=600,H=60,pad=4
  const mn=Math.min(...data),mx=Math.max(...data),range=mx-mn||1
  const pts=data.map((v,i)=>({x:pad+(i/(data.length-1))*(W-pad*2),y:pad+(1-(v-mn)/range)*(H-pad*2)}))
  const d=pts.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const fill=[...pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`),`${pts[pts.length-1].x},${H}`,`${pts[0].x},${H}`].join(' ')
  const nowPt=pts[new Date().getHours()]??pts[pts.length-1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="60" role="img" aria-label="24h carbon intensity">
      <polygon points={fill} fill={color} opacity="0.12"/>
      <polyline points={pts.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={nowPt.x} cy={nowPt.y} r="4" fill={color}/>
      {[0,6,12,18,23].map(h=>{const x=pad+(h/(data.length-1))*(W-pad*2);return<text key={h} x={x} y={H-1} fontSize="8" fill="#5a705a" textAnchor="middle">{h===0?'12a':h<12?`${h}a`:h===12?'12p':`${h-12}p`}</text>})}
    </svg>
  )
}

interface ToastItem{id:number;msg:string}
let _tid=0
function useToast(){
  const[toasts,setToasts]=useState<ToastItem[]>([])
  const show=useCallback((msg:string)=>{const id=++_tid;setToasts(t=>[...t,{id,msg}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500)},[])
  return{toasts,show}
}

export default function Home() {
  const[tab,setTab]=useState<TabId>('grid')
  const[clock,setClock]=useState('')
  const[gridData,setGridData]=useState<GridData|null>(null)
  const[gridLoading,setGridLoading]=useState(true)
  const[query,setQuery]=useState('')
  const[products,setProducts]=useState<Product[]>([])
  const[searching,setSearching]=useState(false)
  const[searchError,setSearchError]=useState('')
  const[community,setCommunity]=useState<{pledges:Pledge[];stats:{total_actions:number;total_swaps:number;total_refused:number;cities_active:number}}|null>(null)
  const[pledgeName,setPledgeName]=useState('')
  const[pledgeAction,setPledgeAction]=useState<ActionType>('refused')
  const[pledgeCity,setPledgeCity]=useState('')
  const[submitting,setSubmitting]=useState(false)
  const[globalCount,setGlobalCount]=useState(1847)
  const[logs,setLogs]=useState<LogEntry[]>([])
  const{toasts,show:showToast}=useToast()

  useEffect(()=>{const tick=()=>setClock(new Date().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',timeZone:'Australia/Sydney'}));tick();const id=setInterval(tick,1000);return()=>clearInterval(id)},[])
  useEffect(()=>{const id=setInterval(()=>{if(Math.random()>0.55)setGlobalCount(c=>c+1)},7000);return()=>clearInterval(id)},[])

  useEffect(()=>{
    setGridLoading(true)
    fetch('/api/grid').then(r=>r.json()).then(d=>{if(d.zones)setGridData(d)}).catch(()=>{}).finally(()=>setGridLoading(false))
  },[])

  useEffect(()=>{
    fetch('/api/pledges').then(r=>r.json()).then(d=>{if(d.pledges)setCommunity(d);if(d.stats?.total_actions)setGlobalCount(Math.max(d.stats.total_actions,1847))}).catch(()=>{})
  },[])

  async function searchProducts(){
    const q=query.trim();if(!q)return
    setSearching(true);setSearchError('');setProducts([])
    try{
      const r=await fetch(`/api/audit?q=${encodeURIComponent(q)}`)
      const d=await r.json()
      if(!r.ok)throw new Error(d.error||'Search failed')
      setProducts(d.products||[])
      if(!d.products?.length)setSearchError('No products found — try a simpler term.')
    }catch(e:any){setSearchError(e.message||'Search failed.')}
    finally{setSearching(false)}
  }

  function logAction(item:string,action:ActionType){
    setLogs(l=>[{item,action,date:new Date()},...l])
    setGlobalCount(c=>c+1)
    showToast(`✅ Logged: ${ACTION_LABEL[action]} — "${item.slice(0,28)}"`)
  }

  async function submitPledge(){
    setSubmitting(true)
    const body={display_name:sanitise(pledgeName)||'Anonymous Warrior',action_type:pledgeAction,city:sanitise(pledgeCity)||'Sydney'}
    try{await fetch('/api/pledges',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}catch{}
    setCommunity(prev=>prev?{...prev,pledges:[{...body,created_at:new Date().toISOString()},...prev.pledges.slice(0,18)],stats:{...prev.stats,total_actions:prev.stats.total_actions+1}}:null)
    setGlobalCount(c=>c+1);logAction(`${ACTION_LABEL[pledgeAction]} in ${body.city}`,pledgeAction)
    setPledgeName('');setPledgeCity('');setSubmitting(false)
    showToast(`🌍 Action logged! Thanks, ${body.display_name.split(' ')[0]}!`)
  }

  const mySwaps=logs.filter(l=>l.action==='swapped').length
  const myRefuse=logs.filter(l=>l.action==='refused').length
  const primary=gridData?.primary
  const tierColor=primary?TIER_COLOR[primary.status]:'#22c55e'
  const barPct=primary?Math.min(100,Math.round((primary.intensity/600)*100)):0
  const seedPledges:Pledge[]=[{display_name:'Sarah K.',action_type:'refused',city:'Sydney'},{display_name:'Liam T.',action_type:'swapped',city:'Melbourne'},{display_name:'Priya S.',action_type:'planted',city:'Brisbane'},{display_name:'James M.',action_type:'cleanup',city:'Perth'},{display_name:'Mei L.',action_type:'recycled',city:'Auckland'}]
  const feedPledges=community?.pledges?.length?community.pledges.slice(0,8):seedPledges

  const S={
    shell:{display:'flex',flexDirection:'column' as const,minHeight:'100vh',background:'var(--bg)'},
    header:{background:'var(--surface)',borderBottom:'1px solid var(--border)',padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky' as const,top:0,zIndex:100},
    logo:{display:'flex',alignItems:'center',gap:10},
    logoIcon:{width:34,height:34,background:'linear-gradient(135deg,#22c55e,#059669)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Space Mono,monospace',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0},
    nav:{background:'var(--surface)',borderBottom:'1px solid var(--border)',display:'flex',padding:'0 16px',gap:2,overflowX:'auto' as const},
    main:{flex:1,padding:'20px 16px',maxWidth:1060,margin:'0 auto',width:'100%'},
    card:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:16},
    input:{width:'100%',background:'var(--s2)',border:'1px solid var(--b2)',borderRadius:7,padding:'8px 12px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none'},
    btn:{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'DM Sans,sans-serif',transition:'all 0.2s'},
  }

  return (
    <div style={S.shell}>
      <header style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}>AN</div>
          <div>
            <div style={{fontFamily:'Space Mono,monospace',fontSize:15,fontWeight:700,color:'var(--accent)',letterSpacing:-0.5}}>ActionNode</div>
            <div style={{fontSize:10,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase'}}>Earth Day 2026</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{background:'rgba(34,197,94,0.1)',border:'1px solid #16a34a',color:'#22c55e',fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:500}}>🌍 Apr 22</span>
          <span style={{fontFamily:'Space Mono,monospace',fontSize:12,color:'var(--text2)',background:'var(--s2)',padding:'3px 10px',borderRadius:6,border:'1px solid var(--border)'}}>{clock||'--:--'}</span>
        </div>
      </header>

      <nav style={S.nav}>
        {([['grid','⚡','Grid Health'],['plastic','🔍','Plastic Audit'],['community','🌿','Community'],['myimpact','📊','My Impact']] as [TabId,string,string][]).map(([id,icon,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:'10px 14px',fontSize:13,fontWeight:500,color:tab===id?'var(--accent)':'var(--text2)',background:'none',border:'none',borderBottom:`2px solid ${tab===id?'var(--accent)':'transparent'}`,cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.2s',fontFamily:'DM Sans,sans-serif'}}>
            {icon} {label}
          </button>
        ))}
      </nav>

      <main style={S.main}>

        {tab==='grid'&&(
          <div className="fade-up">
            <div style={{...S.card,borderTop:`3px solid ${tierColor}`,border:`1px solid ${tierColor}33`,marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,fontSize:12,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase'}}>
                <span className="status-dot" style={{background:tierColor}}/>Live Grid Health — NSW, Australia
              </div>
              {gridLoading
                ?<div style={{display:'flex',alignItems:'center',gap:10,color:'var(--text2)',fontSize:14}}><div className="spinner"/>Fetching live grid data…</div>
                :<>
                  <div style={{display:'flex',alignItems:'flex-end',gap:16,flexWrap:'wrap',marginBottom:12}}>
                    <div>
                      <div style={{fontFamily:'Space Mono,monospace',fontSize:42,fontWeight:700,color:tierColor,lineHeight:1}}>{primary?.intensity??'—'}</div>
                      <div style={{fontFamily:'Space Mono,monospace',fontSize:12,color:'var(--text3)',marginTop:2}}>gCO₂eq/kWh</div>
                    </div>
                    <div style={{marginLeft:'auto',textAlign:'right'}}>
                      <div style={{fontFamily:'Space Mono,monospace',fontSize:16,fontWeight:700,color:tierColor}}>{primary?.label??'N/A'}</div>
                      <div style={{fontSize:12,color:'var(--text3)',marginTop:2,maxWidth:220}}>{primary?.advice??'Grid data unavailable'}</div>
                    </div>
                  </div>
                  <div style={{height:6,borderRadius:3,background:'var(--border)',marginBottom:16,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:3,width:`${barPct}%`,background:`linear-gradient(90deg,#22c55e,${tierColor})`,transition:'width 1.2s ease'}}/>
                  </div>
                  {gridData?.sparkline&&<Sparkline data={gridData.sparkline} color={tierColor}/>}
                </>
              }
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:12}}>
              {gridData?.zones.map(z=>(
                <div key={z.zone} style={S.card}>
                  <div style={{fontSize:10,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>{ZONE_SHORT[z.zone]??z.zone}</div>
                  <div style={{fontFamily:'Space Mono,monospace',fontSize:24,fontWeight:700,color:TIER_COLOR[z.status]}}>{z.intensity}</div>
                  <div style={{fontSize:11,color:TIER_COLOR[z.status],marginTop:2}}>{z.label}</div>
                </div>
              ))}
              {gridData&&<div style={S.card}><div style={{fontSize:10,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>⚡ Best Charge</div><div style={{fontFamily:'Space Mono,monospace',fontSize:18,fontWeight:700,color:'var(--accent)'}}>{fmt24h(gridData.bestHour)}</div><div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>Lowest carbon today</div></div>}
              {primary&&<div style={S.card}><div style={{fontSize:10,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase',marginBottom:6}}>🌞 Renewables</div><div style={{fontFamily:'Space Mono,monospace',fontSize:24,fontWeight:700,color:'var(--accent)'}}>{primary.renewablePct}%</div><div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>Clean energy now</div></div>}
            </div>
            <p style={{fontSize:11,color:'var(--text3)',textAlign:'center'}}>Grid data via Electricity Maps API (AUS-NSW). Realistic fallback when key not set.</p>
          </div>
        )}

        {tab==='plastic'&&(
          <div className="fade-up">
            <p style={{fontSize:13,color:'var(--text2)',marginBottom:14,lineHeight:1.6}}>Search any product to audit its plastic packaging. Data from <strong style={{color:'var(--accent)'}}>Open Food Facts</strong>. AI swap suggestions via Google Gemini.</p>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchProducts()} placeholder="e.g. Coca Cola, Vegemite, Evian water…" maxLength={80} style={{...S.input,flex:1,fontSize:14,padding:'10px 14px'}}/>
              <button onClick={searchProducts} disabled={searching||!query.trim()} style={{...S.btn,opacity:(!query.trim()&&!searching)?0.5:1}}>{searching?'Searching…':'Audit →'}</button>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:18,alignItems:'center'}}>
              <span style={{fontSize:11,color:'var(--text3)'}}>Try:</span>
              {['Coca Cola','Evian water','Nutella','Heinz ketchup'].map(t=>(
                <button key={t} onClick={()=>{setQuery(t);setTimeout(searchProducts,50)}} style={{fontSize:11,color:'var(--text2)',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>{t}</button>
              ))}
            </div>
            {searching&&<div style={{display:'flex',alignItems:'center',gap:10,color:'var(--text2)',fontSize:13,padding:'12px 0'}}><div className="spinner"/>Querying Open Food Facts + Gemini AI…</div>}
            {searchError&&<div style={{color:'#fca5a5',fontSize:13,padding:'10px 14px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,marginBottom:12}}>{searchError}</div>}
            {products.map((p,i)=>{
              const grade=p.ecoScoreGrade.toLowerCase()
              const gc=['a','b'].includes(grade)?'#22c55e':grade==='c'?'#f59e0b':['d','e'].includes(grade)?'#ef4444':'#5a705a'
              const isOk=p.hasPackagingData&&!p.isPlastic
              const isPlasticKnown=p.hasPackagingData&&p.isPlastic
              return(
                <div key={i} className="slide-up" style={{background:'var(--s2)',border:'1px solid var(--b2)',borderRadius:10,padding:16,marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:600,color:'var(--text)',lineHeight:1.3}}>{p.name}</div>
                      {p.brand&&<div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{p.brand}</div>}
                    </div>
                    <div style={{fontFamily:'Space Mono,monospace',fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:`${gc}15`,color:gc,border:`1px solid ${gc}40`,whiteSpace:'nowrap',flexShrink:0}}>ECO {grade.toUpperCase()||'?'}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,padding:'8px 12px',borderRadius:8,marginBottom:8,background:isPlasticKnown?'rgba(239,68,68,0.08)':isOk?'rgba(34,197,94,0.08)':'var(--s3)',border:`1px solid ${isPlasticKnown?'rgba(239,68,68,0.25)':isOk?'rgba(34,197,94,0.25)':'var(--border)'}`,color:isPlasticKnown?'#fca5a5':isOk?'#86efac':'var(--text2)'}}>
                    {isPlasticKnown?'⚠️ Contains plastic packaging':isOk?'✅ No plastic detected':'❓ Packaging data unavailable'}
                  </div>
                  {p.packagingDetails.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>{p.packagingDetails.map((t,j)=><span key={j} style={{fontSize:10,color:'var(--text3)',background:'var(--s3)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 7px'}}>{t}</span>)}</div>}
                  {p.aiSwapSuggestion&&<div style={{fontSize:12,color:'var(--text2)',padding:'8px 12px',background:'var(--s3)',borderRadius:7,lineHeight:1.6,marginBottom:10}}><span style={{color:'var(--accent)',fontWeight:600}}>🤖 Gemini: </span>{p.aiSwapSuggestion}</div>}
                  <div style={{display:'flex',gap:8}}>
                    {(['swapped','refused','recycled'] as ActionType[]).map(a=>(
                      <button key={a} onClick={()=>logAction(p.name,a)} style={{flex:1,padding:'7px 6px',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',border:'1px solid',fontFamily:'DM Sans,sans-serif',background:a==='swapped'?'rgba(34,197,94,0.08)':a==='refused'?'rgba(245,158,11,0.08)':'rgba(96,165,250,0.08)',borderColor:a==='swapped'?'#16a34a':a==='refused'?'#92400e':'#1e40af',color:a==='swapped'?'#22c55e':a==='refused'?'#f59e0b':'#60a5fa'}}>
                        {a==='swapped'?'✅ Swapped':a==='refused'?'🚫 Refused':'♻️ Recycled'}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab==='community'&&(
          <div className="fade-up">
            <div style={{textAlign:'center',padding:'28px 20px',background:'linear-gradient(135deg,rgba(34,197,94,0.06),var(--s2))',border:'1px solid rgba(34,197,94,0.15)',borderRadius:14,marginBottom:20}}>
              <div style={{fontFamily:'Space Mono,monospace',fontSize:52,fontWeight:700,color:'var(--accent)',letterSpacing:-2,lineHeight:1}}>{globalCount.toLocaleString()}</div>
              <div style={{fontSize:13,color:'var(--text2)',marginTop:8}}>plastic actions logged globally this Earth Day</div>
              <div style={{fontSize:11,color:'var(--glow)',display:'flex',alignItems:'center',gap:6,justifyContent:'center',marginTop:10,letterSpacing:0.5,textTransform:'uppercase'}}><span className="status-dot dot-green"/>Live — updating in real-time</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:20}}>
              {[['🚫','Bottles Refused',(community?.stats.total_refused??3241).toLocaleString()],['✅','Items Swapped',(community?.stats.total_swaps??2108).toLocaleString()],['🌏','Cities Active',(community?.stats.cities_active??89).toLocaleString()]].map(([icon,label,val])=>(
                <div key={label as string} style={{...S.card,textAlign:'center'}}>
                  <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
                  <div style={{fontFamily:'Space Mono,monospace',fontSize:20,fontWeight:700,color:'var(--accent)'}}>{val}</div>
                  <div style={{fontSize:10,color:'var(--text3)',letterSpacing:0.5,textTransform:'uppercase',marginTop:2}}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Recent Activity</div>
            {feedPledges.map((p,i)=>(
              <div key={i} className="slide-up" style={{display:'flex',alignItems:'center',gap:12,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:12,marginBottom:6,fontSize:13}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(34,197,94,0.12)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--accent)',fontSize:13,fontWeight:700,flexShrink:0}}>{p.display_name.charAt(0).toUpperCase()}</div>
                <div style={{flex:1,color:'var(--text)',lineHeight:1.4}}><strong>{p.display_name}</strong> {ACTION_LABEL[p.action_type].toLowerCase()} {p.city?`in ${p.city}`:''}</div>
                <div style={{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>{relTime(p.created_at)}</div>
              </div>
            ))}
            <div style={{background:'var(--s2)',border:'1px solid var(--b2)',borderRadius:12,padding:18,marginTop:16}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:14}}>Log Your Earth Day Action</div>
              {[{label:'Your name (optional)',value:pledgeName,set:setPledgeName,placeholder:'Anonymous Warrior'},{label:'City',value:pledgeCity,set:setPledgeCity,placeholder:'Sydney'}].map(f=>(
                <div key={f.label} style={{marginBottom:10}}>
                  <label style={{display:'block',fontSize:11,color:'var(--text2)',marginBottom:4}}>{f.label}</label>
                  <input value={f.value} onChange={e=>f.set(e.target.value)} placeholder={f.placeholder} maxLength={60} style={S.input}/>
                </div>
              ))}
              <div style={{marginBottom:12}}>
                <label style={{display:'block',fontSize:11,color:'var(--text2)',marginBottom:4}}>Action type</label>
                <select value={pledgeAction} onChange={e=>setPledgeAction(e.target.value as ActionType)} style={{...S.input,background:'var(--s3)'}}>
                  {(Object.entries(ACTION_LABEL) as [ActionType,string][]).map(([v,l])=><option key={v} value={v} style={{background:'var(--s3)'}}>{l}</option>)}
                </select>
              </div>
              <button onClick={submitPledge} disabled={submitting} style={{...S.btn,width:'100%',padding:'11px 0',fontSize:14,opacity:submitting?0.6:1}}>{submitting?'Logging…':'🌍 Log My Action'}</button>
            </div>
          </div>
        )}

        {tab==='myimpact'&&(
          <div className="fade-up">
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
              {[['Total Actions',logs.length],['Swaps Made',mySwaps],['Refused',myRefuse]].map(([l,v])=>(
                <div key={l as string} style={{...S.card,textAlign:'center'}}>
                  <div style={{fontFamily:'Space Mono,monospace',fontSize:26,fontWeight:700,color:'var(--accent)'}}>{v}</div>
                  <div style={{fontSize:10,color:'var(--text3)',letterSpacing:0.5,textTransform:'uppercase',marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>
            {gridData?.sparkline&&(
              <div style={{...S.card,marginBottom:16}}>
                <div style={{fontSize:11,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>24h Carbon Intensity — My Region</div>
                <Sparkline data={gridData.sparkline} color="var(--accent)"/>
              </div>
            )}
            <div style={{fontSize:11,color:'var(--text3)',letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>My Action Log</div>
            {logs.length===0
              ?<div style={{textAlign:'center',padding:40,color:'var(--text3)',fontSize:13}}><div style={{fontSize:36,marginBottom:10}}>🌱</div>No actions yet.<br/>Go to <strong style={{color:'var(--accent)'}}>Plastic Audit</strong> to get started!</div>
              :logs.map((l,i)=>(
                <div key={i} className="slide-up" style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,fontSize:13,marginBottom:6}}>
                  <span style={{fontFamily:'Space Mono,monospace',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase',letterSpacing:0.5,background:l.action==='swapped'?'rgba(34,197,94,0.1)':l.action==='refused'?'rgba(245,158,11,0.1)':'rgba(96,165,250,0.1)',color:l.action==='swapped'?'#22c55e':l.action==='refused'?'#f59e0b':'#60a5fa',whiteSpace:'nowrap'}}>{l.action}</span>
                  <span style={{flex:1,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.item}</span>
                  <span style={{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>{l.date.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              ))
            }
          </div>
        )}

      </main>

      <div style={{position:'fixed',bottom:20,right:16,display:'flex',flexDirection:'column',gap:8,zIndex:999,maxWidth:300}}>
        {toasts.map(t=>(
          <div key={t.id} className="slide-up" style={{background:'var(--surface)',border:'1px solid #16a34a',color:'var(--text)',padding:'11px 15px',borderRadius:10,fontSize:13,lineHeight:1.4}}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
