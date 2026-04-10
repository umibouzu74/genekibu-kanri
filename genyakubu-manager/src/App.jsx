import { useState, useMemo, useEffect, useCallback } from "react";
import {
  DAYS, WEEKDAYS, DAY_COLOR as DC, DAY_BG as DB,
  gradeColor as GC, sortSlots as sortS, fmtDate, timeToMin,
  INIT_SLOTS, INIT_HOLIDAYS,
} from "./data";


// ─── Styles ──────────────────────────────────────────────────────────
const S = {
  btn: (active) => ({
    padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
    background:active?"#1a1a2e":"#e4e4e8",color:active?"#fff":"#444",transition:"all .15s",
  }),
  input: {
    padding:"6px 10px",borderRadius:6,border:"1px solid #ccc",fontSize:12,outline:"none",
    width:"100%",boxSizing:"border-box",fontFamily:"inherit",
  },
  modal: {
    position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.45)",
    display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,
  },
  card: {
    background:"#fff",borderRadius:12,padding:24,width:420,maxWidth:"90vw",
    maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)",
  },
};

// ─── Components ──────────────────────────────────────────────────────
function SlotCard({slot,compact,onEdit,onDel}) {
  const gc=GC(slot.grade);
  return (
    <div style={{
      background:"#fff",border:"1px solid #e0e0e0",borderLeft:`4px solid ${DC[slot.day]}`,
      borderRadius:8,padding:compact?"6px 10px":"10px 14px",fontSize:compact?11:13,
      lineHeight:1.5,position:"relative",transition:"box-shadow .15s",
    }}
    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.1)"}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
        <span style={{background:gc.b,color:gc.f,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>{slot.grade}</span>
        <span style={{fontWeight:700,color:"#1a1a2e"}}>{slot.subj}</span>
        {slot.note&&<span style={{color:"#e67a00",fontSize:10}}>({slot.note})</span>}
      </div>
      <div style={{color:"#888",fontSize:10,marginTop:2}}>
        {slot.room} ｜ {slot.time}{slot.cls&&slot.cls!=="-"?` ｜ ${slot.cls}`:""}
      </div>
      {onEdit && (
        <div style={{position:"absolute",top:4,right:4,display:"flex",gap:2}}>
          <button onClick={()=>onEdit(slot)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:2}}>✏️</button>
          <button onClick={()=>onDel(slot.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:2}}>🗑</button>
        </div>
      )}
    </div>
  );
}

function Modal({title,onClose,children}) {
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",h);
    return ()=>document.removeEventListener("keydown",h);
  },[onClose]);
  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.card} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:800}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SlotForm({slot,onSave,onCancel}) {
  const [f,setF]=useState(slot||{day:"月",time:"19:00-20:20",grade:"",cls:"",room:"",subj:"",teacher:"",note:""});
  const [errors,setErrors]=useState({});
  const up=(k,v)=>{setF(p=>({...p,[k]:v}));setErrors(p=>({...p,[k]:undefined}));};
  const required=["time","grade","subj","teacher"];
  const fields=[
    {k:"day",l:"曜日",type:"select",opts:DAYS},
    {k:"time",l:"時間帯",ph:"19:00-20:20",req:true},
    {k:"grade",l:"学年",ph:"中1, 高3 等",req:true},
    {k:"cls",l:"クラス",ph:"S, AB 等"},
    {k:"room",l:"教室",ph:"601, 亀21 等"},
    {k:"subj",l:"科目",ph:"英語, 高松一 数学 等",req:true},
    {k:"teacher",l:"担当講師",ph:"講師名",req:true},
    {k:"note",l:"備考",ph:"隔週, 合同 等"},
  ];
  const handleSave=()=>{
    const errs={};
    required.forEach(k=>{if(!f[k]?.trim())errs[k]="必須項目です"});
    if(Object.keys(errs).length){setErrors(errs);return;}
    onSave(f);
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {fields.map(({k,l,ph,type,opts,req})=>(
        <div key={k}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <label style={{width:70,fontSize:12,fontWeight:700,textAlign:"right",flexShrink:0}}>
              {l}{req&&<span style={{color:"#c44"}}>*</span>}
            </label>
            {type==="select"?(
              <select value={f[k]} onChange={e=>up(k,e.target.value)} style={{...S.input,width:"auto",minWidth:80}}>
                {opts.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            ):(
              <input value={f[k]||""} onChange={e=>up(k,e.target.value)} placeholder={ph}
                style={{...S.input,borderColor:errors[k]?"#c44":"#ccc"}}/>
            )}
          </div>
          {errors[k]&&<div style={{marginLeft:78,fontSize:10,color:"#c44",marginTop:2}}>{errors[k]}</div>}
        </div>
      ))}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <button onClick={onCancel} style={S.btn(false)}>キャンセル</button>
        <button onClick={handleSave} style={S.btn(true)}>保存</button>
      </div>
    </div>
  );
}

function HolidayManager({holidays,onAdd,onDel}) {
  const [d,setD]=useState("");const [l,setL]=useState("");
  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        <input type="date" value={d} onChange={e=>setD(e.target.value)} style={{...S.input,width:"auto"}}/>
        <input value={l} onChange={e=>setL(e.target.value)} placeholder="名称（任意）" style={{...S.input,width:140}}/>
        <button onClick={()=>{if(d){onAdd({date:d,label:l||"休講"});setD("");setL("");}}} style={S.btn(true)}>追加</button>
      </div>
      <div style={{maxHeight:300,overflow:"auto"}}>
        {[...holidays].sort((a,b)=>a.date.localeCompare(b.date)).map((h,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #eee",fontSize:12}}>
            <span><strong>{h.date}</strong>　{h.label}</span>
            <button onClick={()=>onDel(h.date)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DayBlock({date,dow,label,sl,isH}) {
  return (
    <div style={{flex:1,minWidth:280}}>
      <div style={{
        background:isH?"#f0f0f0":(DC[dow]||"#666"),color:isH?"#999":"#fff",
        padding:"10px 16px",borderRadius:"10px 10px 0 0",fontWeight:800,fontSize:14,
        display:"flex",justifyContent:"space-between",alignItems:"center",
      }}>
        <span>{date}（{dow}）</span>
        {isH&&<span style={{fontSize:11,background:"#ddd",padding:"2px 8px",borderRadius:4}}>🚫 {label}</span>}
      </div>
      <div style={{
        background:"#fff",borderRadius:"0 0 10px 10px",border:"1px solid #e0e0e0",borderTop:"none",
        padding:12,minHeight:100,
      }}>
        {isH?(
          <div style={{textAlign:"center",color:"#bbb",padding:30}}>休講日</div>
        ):sl.length===0?(
          <div style={{textAlign:"center",color:"#bbb",padding:30}}>授業なし</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {sl.map((s,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
                background:DB[s.day],borderRadius:6,fontSize:12,
                borderLeft:`3px solid ${DC[s.day]}`,
              }}>
                <span style={{fontWeight:800,minWidth:85,color:DC[s.day]}}>{s.time}</span>
                <span style={{
                  background:GC(s.grade).b,color:GC(s.grade).f,borderRadius:4,
                  padding:"1px 6px",fontSize:10,fontWeight:700,
                }}>{s.grade}</span>
                <span style={{fontWeight:600}}>{s.subj}</span>
                <span style={{color:"#888",fontSize:11}}>/{s.room}</span>
                <span style={{marginLeft:"auto",fontWeight:800,color:"#1a1a2e"}}>{s.teacher}</span>
              </div>
            ))}
          </div>
        )}
        {!isH&&sl.length>0&&(
          <div style={{marginTop:8,fontSize:11,color:"#888",textAlign:"right"}}>
            計 {sl.length} コマ ｜ 講師 {[...new Set(sl.map(s=>s.teacher))].length} 名
          </div>
        )}
      </div>
    </div>
  );
}

function Dashboard({slots,holidays}) {
  const now=new Date();
  const todayStr=fmtDate(now);
  const todayDow=WEEKDAYS[now.getDay()];
  const tmr=new Date(now);tmr.setDate(tmr.getDate()+1);
  const tmrStr=fmtDate(tmr);
  const tmrDow=WEEKDAYS[tmr.getDay()];

  const isHoliday=d=>holidays.some(h=>h.date===d);
  const getLabel=d=>holidays.find(h=>h.date===d)?.label;

  const todaySlots=isHoliday(todayStr)?[]:sortS(slots.filter(s=>s.day===todayDow));
  const tmrSlots=isHoliday(tmrStr)?[]:sortS(slots.filter(s=>s.day===tmrDow));

  return (
    <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
      <DayBlock date={todayStr} dow={todayDow} label={getLabel(todayStr)} sl={todaySlots} isH={isHoliday(todayStr)}/>
      <DayBlock date={tmrStr} dow={tmrDow} label={getLabel(tmrStr)} sl={tmrSlots} isH={isHoliday(tmrStr)}/>
    </div>
  );
}

function WeekView({teacher,slots,onEdit,onDel}) {
  const ts=useMemo(()=>sortS(slots.filter(s=>s.teacher===teacher||s.note?.includes(teacher))),[teacher,slots]);
  const byDay=useMemo(()=>{const m={};DAYS.forEach(d=>{m[d]=[]});ts.forEach(s=>m[s.day]?.push(s));return m;},[ts]);
  return (
    <div style={{overflowX:"auto",marginTop:12}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,minWidth:600}}>
        {DAYS.map(d=>(
          <div key={d}>
            <div style={{background:DC[d],color:"#fff",textAlign:"center",padding:"7px 0",borderRadius:"8px 8px 0 0",fontWeight:800,fontSize:14,letterSpacing:2}}>{d}</div>
            <div style={{background:DB[d],borderRadius:"0 0 8px 8px",padding:6,minHeight:80,display:"flex",flexDirection:"column",gap:5}}>
              {byDay[d].length===0?<div style={{color:"#ccc",textAlign:"center",padding:16,fontSize:11}}>—</div>:
                byDay[d].map((s,i)=><SlotCard key={i} slot={s} compact onEdit={onEdit} onDel={onDel}/>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({teacher,slots,holidays,year,month,onEdit,onDel}) {
  const ts=useMemo(()=>slots.filter(s=>s.teacher===teacher||s.note?.includes(teacher)),[teacher,slots]);
  const dayMap=useMemo(()=>{const m={};DAYS.forEach(d=>{m[d]=ts.filter(s=>s.day===d)});return m;},[ts]);
  const holSet=useMemo(()=>new Set(holidays.map(h=>h.date)),[holidays]);
  const holMap=useMemo(()=>{const m={};holidays.forEach(h=>{m[h.date]=h.label});return m;},[holidays]);

  const first=new Date(year,month-1,1);
  const dim=new Date(year,month,0).getDate();
  const sd=first.getDay();
  const cells=[];
  for(let i=0;i<sd;i++)cells.push(null);
  for(let d=1;d<=dim;d++)cells.push(d);
  while(cells.length%7)cells.push(null);

  const today=new Date();const todayD=today.getDate();const todayM=today.getMonth()+1;const todayY=today.getFullYear();

  return (
    <div style={{marginTop:12}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,background:"#ccc",borderRadius:8,overflow:"hidden"}}>
        {WEEKDAYS.map(w=>(
          <div key={w} style={{background:w==="日"?"#f5e0e0":w==="土"?"#e0e0f5":"#eee",textAlign:"center",padding:"6px 0",fontWeight:800,fontSize:12,color:w==="日"?"#c44":w==="土"?"#44c":"#333"}}>{w}</div>
        ))}
        {cells.map((d,i)=>{
          if(!d) return <div key={i} style={{background:"#fafafa",minHeight:90}}/>;
          const ds=`${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const dow=new Date(year,month-1,d).getDay();
          const dn=WEEKDAYS[dow];
          const isH=holSet.has(ds);
          const isT=todayY===year&&todayM===month&&todayD===d;
          const sl=isH?[]:dayMap[dn]||[];
          return (
            <div key={i} style={{
              background:isH?"#f8f0f0":isT?"#fffbe6":dow===0?"#fdf5f5":dow===6?"#f5f5fd":"#fff",
              minHeight:90,padding:4,border:isT?"2px solid #e6a800":"none",position:"relative",
            }}>
              <div style={{fontSize:12,fontWeight:isT?800:600,color:dow===0?"#c44":dow===6?"#44c":"#333",display:"flex",justifyContent:"space-between"}}>
                <span>{d}</span>
                {isH&&<span style={{fontSize:9,color:"#c44",fontWeight:400}}>{holMap[ds]}</span>}
              </div>
              {isH?<div style={{fontSize:10,color:"#caa",textAlign:"center",marginTop:8}}>休</div>:
                sl.map((s,j)=>(
                  <div key={j} style={{fontSize:11,lineHeight:1.4,padding:"2px 3px",margin:"1px 0",borderRadius:3,background:DB[s.day],borderLeft:`2px solid ${DC[s.day]}`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:onEdit?"pointer":"default"}}
                    onClick={()=>onEdit&&onEdit(s)}
                    title={`${s.time} ${s.grade} ${s.subj} ${s.room||""}\nクリックで編集`}>
                    <b>{s.time.split("-")[0]}</b> {s.subj}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AllView({slots,onSelectTeacher}) {
  const teachers=useMemo(()=>{
    const tSet=new Set(slots.map(s=>s.teacher));
    return [...tSet].map(t=>{
      const sl=slots.filter(s=>s.teacher===t);
      const byDay={};DAYS.forEach(d=>{byDay[d]=sl.filter(s=>s.day===d).length});
      return {name:t,byDay,total:sl.length};
    }).sort((a,b)=>b.total-a.total);
  },[slots]);
  return (
    <div style={{marginTop:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>
          <th style={{textAlign:"left",padding:"8px 10px",background:"#1a1a2e",color:"#fff",borderRadius:"8px 0 0 0"}}>講師名</th>
          {DAYS.map(d=><th key={d} style={{padding:"8px 10px",background:DC[d],color:"#fff",textAlign:"center",minWidth:36}}>{d}</th>)}
          <th style={{padding:"8px 10px",background:"#1a1a2e",color:"#fff",textAlign:"center",borderRadius:"0 8px 0 0"}}>計</th>
        </tr></thead>
        <tbody>{teachers.map((t,i)=>(
          <tr key={t.name} style={{background:i%2?"#f8f9fa":"#fff"}}>
            <td onClick={()=>onSelectTeacher&&onSelectTeacher(t.name)} style={{padding:"5px 10px",fontWeight:700,borderBottom:"1px solid #eee",cursor:onSelectTeacher?"pointer":"default",color:onSelectTeacher?"#2e6a9e":"inherit"}}
              onMouseEnter={e=>{if(onSelectTeacher)e.currentTarget.style.textDecoration="underline"}}
              onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{t.name}</td>
            {DAYS.map(d=><td key={d} style={{textAlign:"center",padding:"5px 6px",borderBottom:"1px solid #eee",background:t.byDay[d]?DB[d]:"transparent",fontWeight:t.byDay[d]>3?800:400,color:t.byDay[d]>3?DC[d]:"#888"}}>{t.byDay[d]||""}</td>)}
            <td style={{textAlign:"center",padding:"5px 6px",fontWeight:800,borderBottom:"1px solid #eee",color:t.total>10?"#c44":"#1a1a2e"}}>{t.total}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function MasterView({slots,onEdit,onDel,onNew,biweeklyBase,onSetBiweeklyBase}) {
  const [filterDay,setFilterDay]=useState("");
  const [filterGrade,setFilterGrade]=useState("");
  const [filterTeacher,setFilterTeacher]=useState("");
  const [filterSubj,setFilterSubj]=useState("");
  const [sortCol,setSortCol]=useState("day");
  const [sortAsc,setSortAsc]=useState(true);
  const [tab,setTab]=useState("list");

  const grades=useMemo(()=>[...new Set(slots.map(s=>s.grade))].sort(),[slots]);

  const filtered=useMemo(()=>{
    let r=[...slots];
    if(filterDay) r=r.filter(s=>s.day===filterDay);
    if(filterGrade) r=r.filter(s=>s.grade===filterGrade);
    if(filterTeacher) r=r.filter(s=>s.teacher.includes(filterTeacher));
    if(filterSubj) r=r.filter(s=>s.subj.includes(filterSubj));
    const di=Object.fromEntries(DAYS.map((d,i)=>[d,i]));
    r.sort((a,b)=>{
      let c=0;
      if(sortCol==="day") c=(di[a.day]??99)-(di[b.day]??99);
      else if(sortCol==="time") c=timeToMin(a.time.split("-")[0])-timeToMin(b.time.split("-")[0]);
      else if(sortCol==="grade") c=a.grade.localeCompare(b.grade);
      else if(sortCol==="cls") c=(a.cls||"").localeCompare(b.cls||"");
      else if(sortCol==="room") c=(a.room||"").localeCompare(b.room||"");
      else if(sortCol==="subj") c=a.subj.localeCompare(b.subj);
      else if(sortCol==="teacher") c=a.teacher.localeCompare(b.teacher);
      else c=a.id-b.id;
      if(c===0&&sortCol!=="day") c=(di[a.day]??99)-(di[b.day]??99);
      if(c===0&&sortCol!=="time") c=timeToMin(a.time.split("-")[0])-timeToMin(b.time.split("-")[0]);
      if(c===0) c=a.id-b.id;
      return sortAsc?c:-c;
    });
    return r;
  },[slots,filterDay,filterGrade,filterTeacher,filterSubj,sortCol,sortAsc]);

  const biweeklyGroups=useMemo(()=>{
    const alt=slots.filter(s=>s.note?.includes("隔週"));
    const g={};
    alt.forEach(s=>{
      const k=`${s.day}_${s.time}`;
      if(!g[k]) g[k]={day:s.day,time:s.time,slots:[]};
      g[k].slots.push(s);
    });
    const di=Object.fromEntries(DAYS.map((d,i)=>[d,i]));
    return Object.values(g).sort((a,b)=>{
      const dd=(di[a.day]??99)-(di[b.day]??99);
      return dd||timeToMin(a.time.split("-")[0])-timeToMin(b.time.split("-")[0]);
    });
  },[slots]);

  const currentWeekType=useMemo(()=>{
    if(!biweeklyBase) return null;
    const base=new Date(biweeklyBase+"T12:00:00");
    const now=new Date();now.setHours(12,0,0,0);
    const diffDays=Math.round((now-base)/(1000*60*60*24));
    const weeks=Math.floor(diffDays/7);
    return Math.abs(weeks)%2===0?"A":"B";
  },[biweeklyBase]);

  const handleSort=(col)=>{
    if(sortCol===col) setSortAsc(!sortAsc);
    else {setSortCol(col);setSortAsc(true);}
  };
  const sortTh=(col,label,first,last)=>(
    <th key={col} onClick={()=>handleSort(col)} style={{
      padding:"8px 6px",background:"#1a1a2e",color:"#fff",cursor:"pointer",
      userSelect:"none",fontSize:11,whiteSpace:"nowrap",
      borderRadius:first?"8px 0 0 0":last?"0 8px 0 0":"0",
    }}>{label}{sortCol===col?(sortAsc?" ▲":" ▼"):""}</th>
  );

  if(tab==="biweekly") return (
    <div style={{marginTop:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <button onClick={()=>setTab("list")} style={S.btn(false)}>コマ一覧</button>
        <button onClick={()=>setTab("biweekly")} style={S.btn(true)}>隔週管理</button>
      </div>
      <div style={{background:"#fff",borderRadius:8,padding:14,marginBottom:16,border:"1px solid #e0e0e0"}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>隔週の基準設定</div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <label style={{fontSize:12}}>A週の基準日:</label>
          <input type="date" value={biweeklyBase||""} onChange={e=>onSetBiweeklyBase(e.target.value)} style={{...S.input,width:"auto"}}/>
          {currentWeekType&&<span style={{
            background:currentWeekType==="A"?"#2e6a9e":"#c05030",color:"#fff",
            padding:"4px 12px",borderRadius:6,fontWeight:800,fontSize:13,
          }}>今週は {currentWeekType}週</span>}
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:6}}>基準日を含む週をA週とし、以降交互にA週・B週が繰り返されます</div>
      </div>
      {biweeklyGroups.length===0?(
        <div style={{textAlign:"center",color:"#888",padding:40}}>隔週コマがありません</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {biweeklyGroups.map(g=>(
            <div key={g.day+g.time} style={{background:"#fff",borderRadius:8,border:`2px solid ${DC[g.day]}`,overflow:"hidden"}}>
              <div style={{background:DC[g.day],color:"#fff",padding:"8px 14px",fontWeight:800,fontSize:13,display:"flex",justifyContent:"space-between"}}>
                <span>{g.day}曜 {g.time}</span>
                <span style={{fontSize:11,opacity:.8}}>{g.slots.length}コマ</span>
              </div>
              <div style={{padding:10}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"2px solid #eee"}}>
                    <th style={{textAlign:"left",padding:"4px 6px"}}>学年</th>
                    <th style={{textAlign:"left",padding:"4px 6px"}}>クラス</th>
                    <th style={{textAlign:"left",padding:"4px 6px"}}>科目</th>
                    <th style={{textAlign:"left",padding:"4px 6px"}}>担当</th>
                    <th style={{textAlign:"left",padding:"4px 6px"}}>備考</th>
                    <th style={{textAlign:"center",padding:"4px 6px",width:40}}>編集</th>
                  </tr></thead>
                  <tbody>{g.slots.map(s=>(
                    <tr key={s.id} style={{borderBottom:"1px solid #f0f0f0"}}>
                      <td style={{padding:"6px"}}><span style={{background:GC(s.grade).b,color:GC(s.grade).f,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>{s.grade}</span></td>
                      <td style={{padding:"6px"}}>{s.cls}</td>
                      <td style={{padding:"6px",fontWeight:600}}>{s.subj}</td>
                      <td style={{padding:"6px",fontWeight:700}}>{s.teacher}</td>
                      <td style={{padding:"6px",color:"#e67a00",fontSize:11}}>{s.note}</td>
                      <td style={{padding:"6px",textAlign:"center"}}><button onClick={()=>onEdit(s)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12}}>✏️</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{marginTop:16,fontSize:11,color:"#888"}}>※ 備考欄に「隔週」を含むコマが自動的に表示されます</div>
    </div>
  );

  return (
    <div style={{marginTop:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <button onClick={()=>setTab("list")} style={S.btn(true)}>コマ一覧</button>
        <button onClick={()=>setTab("biweekly")} style={S.btn(false)}>隔週管理</button>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",background:"#fff",padding:12,borderRadius:8,border:"1px solid #e0e0e0",alignItems:"flex-end"}}>
        <div>
          <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>曜日</label>
          <select value={filterDay} onChange={e=>setFilterDay(e.target.value)} style={{...S.input,width:"auto",minWidth:60}}>
            <option value="">すべて</option>
            {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>学年</label>
          <select value={filterGrade} onChange={e=>setFilterGrade(e.target.value)} style={{...S.input,width:"auto",minWidth:80}}>
            <option value="">すべて</option>
            {grades.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>講師</label>
          <input value={filterTeacher} onChange={e=>setFilterTeacher(e.target.value)} placeholder="講師名" style={{...S.input,width:100}}/>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>科目</label>
          <input value={filterSubj} onChange={e=>setFilterSubj(e.target.value)} placeholder="科目名" style={{...S.input,width:100}}/>
        </div>
        <button onClick={()=>{setFilterDay("");setFilterGrade("");setFilterTeacher("");setFilterSubj("");}} style={{...S.btn(false),fontSize:11}}>クリア</button>
        <div style={{marginLeft:"auto"}}>
          <button onClick={onNew} style={{...S.btn(false),background:"#e8f5e8",color:"#2a7a2a"}}>＋ 新規追加</button>
        </div>
      </div>
      <div style={{fontSize:12,color:"#888",marginBottom:6}}>{filtered.length} / {slots.length} 件表示</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,background:"#fff"}}>
          <thead><tr>
            {sortTh("day","曜日",true)}
            {sortTh("time","時間帯")}
            {sortTh("grade","学年")}
            {sortTh("cls","クラス")}
            {sortTh("room","教室")}
            {sortTh("subj","科目")}
            {sortTh("teacher","担当")}
            <th style={{padding:"8px 6px",background:"#1a1a2e",color:"#fff",fontSize:11}}>備考</th>
            <th style={{padding:"8px 6px",background:"#1a1a2e",color:"#fff",fontSize:11,borderRadius:"0 8px 0 0"}}>操作</th>
          </tr></thead>
          <tbody>{filtered.map((s,i)=>(
            <tr key={s.id} style={{background:i%2?"#f8f9fa":"#fff",borderBottom:"1px solid #eee"}}
              onMouseEnter={e=>e.currentTarget.style.background="#f0f5ff"}
              onMouseLeave={e=>e.currentTarget.style.background=i%2?"#f8f9fa":"#fff"}>
              <td style={{padding:"6px 8px",fontWeight:700,color:DC[s.day],background:DB[s.day]}}>{s.day}</td>
              <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>{s.time}</td>
              <td style={{padding:"6px 8px"}}><span style={{background:GC(s.grade).b,color:GC(s.grade).f,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>{s.grade}</span></td>
              <td style={{padding:"6px 8px"}}>{s.cls}</td>
              <td style={{padding:"6px 8px"}}>{s.room}</td>
              <td style={{padding:"6px 8px",fontWeight:600}}>{s.subj}</td>
              <td style={{padding:"6px 8px",fontWeight:700}}>{s.teacher}</td>
              <td style={{padding:"6px 8px",color:"#e67a00",fontSize:11,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={s.note}>{s.note}</td>
              <td style={{padding:"6px 4px",whiteSpace:"nowrap",textAlign:"center"}}>
                <button onClick={()=>onEdit(s)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:2}}>✏️</button>
                <button onClick={()=>onDel(s.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:2}}>🗑</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────
export default function App() {
  const [slots,setSlots]=useState(INIT_SLOTS);
  const [holidays,setHolidays]=useState(INIT_HOLIDAYS);
  const [selected,setSelected]=useState(null);
  const [view,setView]=useState("dash"); // dash|week|month|all|master|holidays
  const [monthOff,setMonthOff]=useState(0);
  const [search,setSearch]=useState("");
  const [editSlot,setEditSlot]=useState(null); // null | slot | "new"
  const [showHolMgr,setShowHolMgr]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [showDataMgr,setShowDataMgr]=useState(false);
  const [biweeklyBase,setBiweeklyBase]=useState("");

  // Storage - localStorage
  useEffect(()=>{
    try {
      const s=localStorage.getItem("genyakubu-slots");
      if(s) setSlots(JSON.parse(s));
    } catch{}
    try {
      const h=localStorage.getItem("genyakubu-holidays");
      if(h) setHolidays(JSON.parse(h));
    } catch{}
    try {
      const bw=localStorage.getItem("genyakubu-biweekly-base");
      if(bw) setBiweeklyBase(bw);
    } catch{}
  },[]);

  const saveSlots=useCallback((s)=>{
    setSlots(s);
    try{localStorage.setItem("genyakubu-slots",JSON.stringify(s))}catch{}
  },[]);
  const saveHolidays=useCallback((h)=>{
    setHolidays(h);
    try{localStorage.setItem("genyakubu-holidays",JSON.stringify(h))}catch{}
  },[]);
  const saveBiweeklyBase=useCallback((v)=>{
    setBiweeklyBase(v);
    try{localStorage.setItem("genyakubu-biweekly-base",v)}catch{}
  },[]);

  const handleExport=()=>{
    const data=JSON.stringify({slots,holidays,biweeklyBase},null,2);
    const blob=new Blob([data],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`genyakubu-backup-${fmtDate(new Date())}.json`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  const handleImport=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(!confirm(`「${file.name}」を読み込みます。\n現在のデータは上書きされます。よろしいですか？`))
      {e.target.value="";return;}
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const d=JSON.parse(ev.target.result);
        if(d.slots&&Array.isArray(d.slots)){saveSlots(d.slots);}
        if(d.holidays&&Array.isArray(d.holidays)){saveHolidays(d.holidays);}
        if(d.biweeklyBase){saveBiweeklyBase(d.biweeklyBase);}
        setShowDataMgr(false);
      }catch{alert("JSONファイルの読み込みに失敗しました。");}
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const handleReset=()=>{
    if(!confirm("データを初期状態に戻しますか？\n現在のデータは失われます。"))return;
    localStorage.removeItem("genyakubu-slots");
    localStorage.removeItem("genyakubu-holidays");
    localStorage.removeItem("genyakubu-biweekly-base");
    setSlots(INIT_SLOTS);setHolidays(INIT_HOLIDAYS);setBiweeklyBase("");
    setSelected(null);setView("dash");setShowDataMgr(false);
  };

  const selectTeacher=(t)=>{setSelected(t);setView("week");setSidebarOpen(false);};

  const now=new Date();
  const vd=new Date(now.getFullYear(),now.getMonth()+monthOff,1);
  const vy=vd.getFullYear(),vm=vd.getMonth()+1;

  const teachers=useMemo(()=>{
    const ts=[...new Set(slots.map(s=>s.teacher))].filter(Boolean).sort();
    return search?ts.filter(t=>t.includes(search)):ts;
  },[slots,search]);

  const nextId=()=>Math.max(0,...slots.map(s=>s.id))+1;

  const handleSaveSlot=(f)=>{
    if(editSlot==="new"){
      saveSlots([...slots,{...f,id:nextId()}]);
    } else {
      saveSlots(slots.map(s=>s.id===editSlot.id?{...f,id:s.id}:s));
    }
    setEditSlot(null);
  };
  const handleDelSlot=(id)=>{
    if(confirm("このコマを削除しますか？")) saveSlots(slots.filter(s=>s.id!==id));
  };

  const handlePrint=()=>{
    const el=document.getElementById("main-content");
    if(!el)return;
    const w=window.open("","_blank");
    if(!w){alert("ポップアップがブロックされました。\nブラウザの設定でポップアップを許可してください。");return;}
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${selected||"現役部"} 授業予定</title><style>body{font-family:"Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;padding:16px;font-size:11px}@media print{body{padding:0}}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),300);
  };

  const selSlotCount = selected ? slots.filter(s=>s.teacher===selected).length : 0;

  return (
    <div style={{fontFamily:'"Hiragino Kaku Gothic Pro","Yu Gothic","Noto Sans JP",sans-serif',display:"flex",height:"100vh",background:"#f0f1f3",color:"#1a1a2e"}}>
      {/* Mobile overlay */}
      {sidebarOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:998}} onClick={()=>setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <div className="sidebar" style={{
        width:210,background:"#1a1a2e",color:"#fff",display:"flex",flexDirection:"column",flexShrink:0,
        position:"fixed",top:0,left:sidebarOpen?0:-220,bottom:0,zIndex:999,transition:"left .25s ease",
      }}>
        <div style={{padding:"16px 14px 10px",borderBottom:"1px solid #2a2a4e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:1}}>現役部</div>
            <div style={{fontSize:10,color:"#8888aa",marginTop:1}}>授業管理システム</div>
          </div>
          <button className="sidebar-close" onClick={()=>setSidebarOpen(false)}
            style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:18,padding:4}}>✕</button>
        </div>
        <div style={{padding:"6px 8px"}}>
          <input type="text" placeholder="講師名で検索…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid #3a3a5e",background:"#2a2a4e",color:"#fff",fontSize:11,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{borderBottom:"1px solid #2a2a4e"}}>
          {[{k:null,v:"dash",icon:"📋",label:"ダッシュボード"},{k:null,v:"all",icon:"📊",label:"全講師一覧"}].map(({k,v,icon,label})=>(
            <button key={v} onClick={()=>{setSelected(k);setView(v);setSidebarOpen(false)}} style={{
              display:"block",width:"100%",padding:"7px 14px",border:"none",
              background:!selected&&view===v?"#3a3a6e":"transparent",color:"#fff",
              textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:700,
            }}>{icon} {label}</button>
          ))}
          <button onClick={()=>{setSelected(null);setShowHolMgr(true);setSidebarOpen(false)}} style={{
            display:"block",width:"100%",padding:"7px 14px",border:"none",
            background:"transparent",color:"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,
          }}>📅 祝日・休講日管理</button>
          <button onClick={()=>{setSelected(null);setView("master");setSidebarOpen(false)}} style={{
            display:"block",width:"100%",padding:"7px 14px",border:"none",
            background:!selected&&view==="master"?"#3a3a6e":"transparent",color:!selected&&view==="master"?"#fff":"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:view==="master"?700:400,
          }}>⚙ コースマスター管理</button>
          <button onClick={()=>{setShowDataMgr(true);setSidebarOpen(false)}} style={{
            display:"block",width:"100%",padding:"7px 14px",border:"none",
            background:"transparent",color:"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,
          }}>💾 データ管理</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"2px 0"}}>
          {teachers.map(t=>{
            const cnt=slots.filter(s=>s.teacher===t).length;
            return (
              <button key={t} onClick={()=>selectTeacher(t)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"6px 14px",border:"none",background:selected===t?"#3a3a6e":"transparent",color:selected===t?"#fff":"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,transition:"background .15s"}}
                onMouseEnter={e=>{if(selected!==t)e.currentTarget.style.background="#2a2a4e"}}
                onMouseLeave={e=>{if(selected!==t)e.currentTarget.style.background="transparent"}}>
                <span>{t}</span>
                <span style={{fontSize:9,background:cnt>10?"#c44":"#4a4a7e",borderRadius:10,padding:"1px 6px",fontWeight:700}}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop sidebar spacer */}
      <div className="sidebar-spacer" style={{width:210,flexShrink:0}}/>

      {/* Main */}
      <div style={{flex:1,overflow:"auto",padding:"16px 24px",minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button className="hamburger" onClick={()=>setSidebarOpen(true)}
              style={{background:"#1a1a2e",border:"none",color:"#fff",cursor:"pointer",fontSize:18,padding:"4px 8px",borderRadius:6,lineHeight:1}}>☰</button>
            <h1 style={{margin:0,fontSize:20,fontWeight:800}}>
              {view==="dash"?"ダッシュボード":view==="all"?"全講師コマ数一覧":view==="master"?"コースマスター管理":selected||""}
            </h1>
          </div>
          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
            {selected&&<>
              <button onClick={()=>setView("week")} style={S.btn(view==="week")}>週間</button>
              <button onClick={()=>setView("month")} style={S.btn(view==="month")}>月間</button>
            </>}
            {selected&&<button onClick={()=>setEditSlot("new")} style={{...S.btn(false),background:"#e8f5e8",color:"#2a7a2a"}}>＋ コマ追加</button>}
            <button onClick={handlePrint} style={{...S.btn(false),border:"1px solid #ccc"}}>🖨 印刷</button>
          </div>
        </div>

        {selected&&view==="month"&&(
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <button onClick={()=>setMonthOff(o=>o-1)} style={{...S.btn(false),padding:"4px 10px",fontSize:14}}>◀</button>
            <span style={{fontSize:15,fontWeight:700}}>{vy}年{vm}月</span>
            <button onClick={()=>setMonthOff(o=>o+1)} style={{...S.btn(false),padding:"4px 10px",fontSize:14}}>▶</button>
            <button onClick={()=>setMonthOff(0)} style={{...S.btn(false),fontSize:11}}>今月</button>
          </div>
        )}

        {selected&&(
          <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            {DAYS.map(d=>{
              const cnt=slots.filter(s=>s.teacher===selected&&s.day===d).length;
              return (
                <div key={d} style={{background:cnt?DB[d]:"#f5f5f5",border:`2px solid ${cnt?DC[d]:"#ddd"}`,borderRadius:8,padding:"4px 12px",textAlign:"center",minWidth:42}}>
                  <div style={{fontSize:11,fontWeight:800,color:DC[d]}}>{d}</div>
                  <div style={{fontSize:18,fontWeight:800,color:cnt?"#1a1a2e":"#ccc"}}>{cnt}</div>
                </div>
              );
            })}
            <div style={{background:"#1a1a2e",borderRadius:8,padding:"4px 12px",textAlign:"center",minWidth:42,color:"#fff"}}>
              <div style={{fontSize:11,fontWeight:800}}>週計</div>
              <div style={{fontSize:18,fontWeight:800}}>{selSlotCount}</div>
            </div>
          </div>
        )}

        <div id="main-content">
          {view==="dash"&&!selected&&<Dashboard slots={slots} holidays={holidays}/>}
          {view==="all"&&!selected&&<AllView slots={slots} onSelectTeacher={selectTeacher}/>}
          {view==="master"&&!selected&&<MasterView slots={slots} onEdit={setEditSlot} onDel={handleDelSlot} onNew={()=>setEditSlot("new")} biweeklyBase={biweeklyBase} onSetBiweeklyBase={saveBiweeklyBase}/>}
          {selected&&view==="week"&&<WeekView teacher={selected} slots={slots} onEdit={setEditSlot} onDel={handleDelSlot}/>}
          {selected&&view==="month"&&<MonthView teacher={selected} slots={slots} holidays={holidays} year={vy} month={vm} onEdit={setEditSlot} onDel={handleDelSlot}/>}
        </div>
      </div>

      {/* Edit Modal */}
      {editSlot&&(
        <Modal title={editSlot==="new"?"コマを追加":"コマを編集"} onClose={()=>setEditSlot(null)}>
          <SlotForm slot={editSlot==="new"?null:editSlot} onSave={handleSaveSlot} onCancel={()=>setEditSlot(null)}/>
        </Modal>
      )}

      {/* Holiday Manager Modal */}
      {showHolMgr&&(
        <Modal title="祝日・休講日の管理" onClose={()=>setShowHolMgr(false)}>
          <HolidayManager holidays={holidays}
            onAdd={h=>saveHolidays([...holidays.filter(x=>x.date!==h.date),h])}
            onDel={d=>saveHolidays(holidays.filter(h=>h.date!==d))}/>
        </Modal>
      )}

      {/* Data Manager Modal */}
      {showDataMgr&&(
        <Modal title="データ管理" onClose={()=>setShowDataMgr(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#f8f9fa",borderRadius:8,padding:14}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>エクスポート（バックアップ）</div>
              <div style={{fontSize:11,color:"#666",marginBottom:8}}>現在のコマ数: {slots.length} ／ 休講日: {holidays.length}</div>
              <button onClick={handleExport} style={S.btn(true)}>JSONファイルをダウンロード</button>
            </div>
            <div style={{background:"#f8f9fa",borderRadius:8,padding:14}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>インポート（復元）</div>
              <div style={{fontSize:11,color:"#666",marginBottom:8}}>JSONファイルからデータを読み込みます</div>
              <label style={{...S.btn(false),display:"inline-block",cursor:"pointer"}}>
                ファイルを選択
                <input type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
              </label>
            </div>
            <div style={{background:"#fff5f5",borderRadius:8,padding:14,border:"1px solid #fcc"}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:"#c44"}}>初期化（リセット）</div>
              <div style={{fontSize:11,color:"#666",marginBottom:8}}>すべてのデータを初期状態に戻します</div>
              <button onClick={handleReset} style={{...S.btn(false),background:"#fee",color:"#c44",border:"1px solid #fcc"}}>データを初期化</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (min-width: 769px) {
          .sidebar { left: 0 !important; position: fixed !important; }
          .sidebar-close { display: none !important; }
          .hamburger { display: none !important; }
        }
        @media (max-width: 768px) {
          .sidebar-spacer { display: none !important; }
        }
      `}</style>
    </div>
  );
}
