import { useState, useMemo, useEffect, useCallback } from "react";
import {
  DAYS, WEEKDAYS, DAY_COLOR as DC, DAY_BG as DB,
  gradeColor as GC, sortSlots as sortS, fmtDate, timeToMin,
  INIT_SLOTS, INIT_HOLIDAYS,
  DEPARTMENTS, DEPT_COLOR, gradeToDept, isKameiRoom,
  INIT_PART_TIME_STAFF, SUB_STATUS, SUB_STATUS_KEYS,
  getSubForSlot, monthlyTally, fmtDateWeekday, dateToDay,
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
      borderRadius:8,padding:compact?"8px 10px":"10px 14px",
      lineHeight:1.5,position:"relative",transition:"box-shadow .15s",
    }}
    onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.1)"}
    onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",fontSize:10,color:"#888"}}>
        <span style={{background:gc.b,color:gc.f,borderRadius:4,padding:"1px 6px",fontWeight:700}}>{slot.grade}{slot.cls&&slot.cls!=="-"?slot.cls:""}</span>
        <span>{slot.time}</span>
        {slot.room&&<span>/ {slot.room}</span>}
        {slot.note&&<span style={{color:"#e67a00"}}>({slot.note})</span>}
      </div>
      <div style={{fontSize:compact?16:18,fontWeight:800,color:"#1a1a2e",marginTop:4}}>
        {slot.subj}
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

function HolidayManager({holidays,onSave}) {
  const [date,setDate]=useState("");
  const [label,setLabel]=useState("");
  const [scope,setScope]=useState(["全部"]);
  const [filter,setFilter]=useState("");
  const [editDate,setEditDate]=useState(null);

  const toggleScope=(dept)=>{
    if(dept==="全部"){setScope(["全部"]);return;}
    let next=scope.filter(s=>s!=="全部");
    next=next.includes(dept)?next.filter(s=>s!==dept):[...next,dept];
    setScope(next.length===0?["全部"]:next);
  };

  const handleAdd=()=>{
    if(!date)return;
    const entry={date,label:label||"休講",scope:[...scope]};
    onSave([...holidays.filter(h=>h.date!==date),entry]);
    setDate("");setLabel("");setScope(["全部"]);setEditDate(null);
  };
  const handleEdit=(h)=>{setDate(h.date);setLabel(h.label);setScope(h.scope||["全部"]);setEditDate(h.date);};
  const cancelEdit=()=>{setDate("");setLabel("");setScope(["全部"]);setEditDate(null);};
  const handleDel=(d)=>onSave(holidays.filter(h=>h.date!==d));

  const sorted=[...holidays].sort((a,b)=>a.date.localeCompare(b.date));
  const filtered=filter?sorted.filter(h=>{const s=h.scope||["全部"];return s.includes("全部")||s.includes(filter);}):sorted;

  return (
    <div style={{marginTop:12}}>
      <div style={{background:"#fff",borderRadius:8,padding:16,marginBottom:16,border:"1px solid #e0e0e0"}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>
          {editDate?"休講日を編集":"休講日を追加"}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...S.input,width:"auto"}}/>
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="名称（任意）" style={{...S.input,width:160}}/>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:12,fontWeight:700}}>対象:</span>
          {["全部",...DEPARTMENTS].map(d=>(
            <label key={d} style={{
              display:"flex",alignItems:"center",gap:3,fontSize:12,
              padding:"4px 10px",borderRadius:6,cursor:"pointer",
              background:scope.includes(d)?(d==="全部"?"#1a1a2e":DEPT_COLOR[d]?.b||"#eee"):"#f5f5f5",
              color:scope.includes(d)?(d==="全部"?"#fff":DEPT_COLOR[d]?.f||"#444"):"#aaa",
              border:`1px solid ${scope.includes(d)?(d==="全部"?"#1a1a2e":DEPT_COLOR[d]?.accent||"#ccc"):"#ddd"}`,
              fontWeight:scope.includes(d)?700:400,transition:"all .15s",userSelect:"none",
            }}>
              <input type="checkbox" checked={scope.includes(d)} onChange={()=>toggleScope(d)} style={{display:"none"}}/>
              {d}
            </label>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={handleAdd} style={S.btn(true)}>{editDate?"更新":"追加"}</button>
          {editDate&&<button onClick={cancelEdit} style={S.btn(false)}>キャンセル</button>}
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,fontWeight:700}}>フィルター:</span>
        {["",...DEPARTMENTS].map(d=>(
          <button key={d} onClick={()=>setFilter(d)} style={{...S.btn(filter===d),fontSize:11,padding:"4px 10px"}}>
            {d||"すべて"}
          </button>
        ))}
      </div>

      <div style={{fontSize:12,color:"#888",marginBottom:6}}>{filtered.length} / {holidays.length} 件表示</div>
      <div style={{background:"#fff",borderRadius:8,border:"1px solid #e0e0e0",overflow:"hidden"}}>
        {filtered.length===0?(
          <div style={{textAlign:"center",color:"#bbb",padding:30,fontSize:13}}>登録された休講日はありません</div>
        ):filtered.map((h,i)=>{
          const sc=h.scope||["全部"];
          return (
            <div key={h.date} style={{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 14px",borderBottom:i<filtered.length-1?"1px solid #eee":"none",
              background:editDate===h.date?"#fffbe6":i%2?"#f8f9fa":"#fff",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <strong style={{fontSize:12,minWidth:90}}>{h.date}</strong>
                <span style={{fontSize:12}}>{h.label}</span>
                <div style={{display:"flex",gap:3}}>
                  {sc.map(d=>(
                    <span key={d} style={{
                      fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4,
                      background:d==="全部"?"#1a1a2e":DEPT_COLOR[d]?.b||"#eee",
                      color:d==="全部"?"#fff":DEPT_COLOR[d]?.f||"#444",
                    }}>{d}</span>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button onClick={()=>handleEdit(h)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:2}}>✏️</button>
                <button onClick={()=>handleDel(h.date)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:12,fontSize:11,color:"#888"}}>
        ※「全部」＝全部門休講。部門を個別に選択すると、該当部門のみ休講になります。
      </div>
    </div>
  );
}

function DayBlock({date,dow,holidays:hols=[],sl}) {
  const fullOff=hols.some(h=>(h.scope||["全部"]).includes("全部"));
  const offDepts=[...new Set(hols.flatMap(h=>h.scope||["全部"]))].filter(d=>d!=="全部");
  const hasPartial=!fullOff&&offDepts.length>0;
  const holLabel=hols[0]?.label;

  const byTime={};
  sl.forEach(s=>{if(!byTime[s.time])byTime[s.time]=[];byTime[s.time].push(s);});
  const timeGroups=Object.entries(byTime).sort(([a],[b])=>timeToMin(a.split("-")[0])-timeToMin(b.split("-")[0]));

  return (
    <div style={{flex:1,minWidth:360}}>
      <div style={{
        background:fullOff?"#f0f0f0":(DC[dow]||"#666"),color:fullOff?"#999":"#fff",
        padding:"12px 16px",borderRadius:"10px 10px 0 0",fontWeight:800,fontSize:15,
        display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,
      }}>
        <span>{date}（{dow}）</span>
        {fullOff&&<span style={{fontSize:11,background:"#ddd",padding:"2px 8px",borderRadius:4}}>🚫 {holLabel}</span>}
        {hasPartial&&(
          <div style={{display:"flex",gap:3}}>
            {offDepts.map(d=>(
              <span key={d} style={{fontSize:10,background:"rgba(255,255,255,0.25)",padding:"2px 6px",borderRadius:4}}>{d}休</span>
            ))}
          </div>
        )}
      </div>
      <div style={{
        background:"#fff",borderRadius:"0 0 10px 10px",border:"1px solid #e0e0e0",borderTop:"none",
        padding:14,minHeight:100,
      }}>
        {fullOff?(
          <div style={{textAlign:"center",color:"#bbb",padding:30,fontSize:14}}>休講日{holLabel?`（${holLabel}）`:""}</div>
        ):sl.length===0?(
          <div style={{textAlign:"center",color:"#bbb",padding:30,fontSize:14}}>授業なし</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {timeGroups.map(([time,tSlots])=>(
              <div key={time}>
                <div style={{
                  fontSize:13,fontWeight:800,color:DC[dow],marginBottom:6,
                  paddingBottom:4,borderBottom:`2px solid ${DC[dow]}`,
                  display:"flex",alignItems:"center",gap:8,
                }}>
                  <span>{time}</span>
                  <span style={{fontSize:11,fontWeight:400,color:"#888"}}>{tSlots.length}コマ</span>
                </div>
                <div style={{
                  display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(180px,1fr))`,
                  background:"#555",gap:2,border:"2px solid #555",borderRadius:4,overflow:"hidden",
                }}>
                  {tSlots.map((s,i)=>{
                    const gc=GC(s.grade);
                    return (
                      <div key={i} style={{
                        background:"#fff",padding:"10px 8px",textAlign:"center",
                        display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:90,
                      }}>
                        <div style={{lineHeight:1.4}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,flexWrap:"wrap"}}>
                            <span style={{
                              background:gc.b,color:gc.f,borderRadius:3,padding:"1px 5px",
                              fontSize:10,fontWeight:700,
                            }}>{s.grade}{s.cls&&s.cls!=="-"?s.cls:""}</span>
                            <span style={{fontSize:12,fontWeight:600,color:"#444"}}>{s.subj}</span>
                          </div>
                          {s.room&&<div style={{fontSize:10,color:"#999",marginTop:2}}>{s.room}</div>}
                          {s.note&&<div style={{fontSize:9,color:"#e67a00",marginTop:1}}>({s.note})</div>}
                        </div>
                        <div style={{
                          fontSize:28,fontWeight:800,color:"#1a1a2e",
                          lineHeight:1.1,marginTop:6,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                        }}>
                          {s.teacher}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {!fullOff&&sl.length>0&&(
          <div style={{marginTop:10,fontSize:11,color:"#888",textAlign:"right"}}>
            計 {sl.length} コマ ｜ 講師 {[...new Set(sl.map(s=>s.teacher))].length} 名
          </div>
        )}
      </div>
    </div>
  );
}

const DASH_SECTIONS = [
  { key: "中学部", label: "中学部", dept: "中学部", filterFn: s => gradeToDept(s.grade) === "中学部" },
  { key: "高校本校", label: "高校部・本校", dept: "高校部", filterFn: s => gradeToDept(s.grade) === "高校部" && !isKameiRoom(s.room) },
  { key: "高校亀井町", label: "高校部・亀井町", dept: "高校部", filterFn: s => gradeToDept(s.grade) === "高校部" && isKameiRoom(s.room) },
];

function SectionColumn({ label, color, sl, deptOff, subs, date }) {
  const byTime = {};
  sl.forEach(s => { if (!byTime[s.time]) byTime[s.time] = []; byTime[s.time].push(s); });
  const timeGroups = Object.entries(byTime).sort(([a], [b]) => timeToMin(a.split("-")[0]) - timeToMin(b.split("-")[0]));
  const teachers = [...new Set(sl.map(s => s.teacher))];

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        background: color.b, color: color.f, padding: "8px 12px",
        borderRadius: "8px 8px 0 0", fontWeight: 800, fontSize: 13,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span>{label}</span>
        {!deptOff && sl.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{sl.length}コマ / {teachers.length}名</span>
        )}
      </div>
      <div style={{
        background: "#fff", borderRadius: "0 0 8px 8px",
        border: "1px solid #e0e0e0", borderTop: "none",
        padding: 10, minHeight: 80,
      }}>
        {deptOff ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>休講日</div>
        ) : sl.length === 0 ? (
          <div style={{ textAlign: "center", color: "#bbb", padding: 20, fontSize: 13 }}>授業なし</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {timeGroups.map(([time, tSlots]) => (
              <div key={time}>
                <div style={{
                  fontSize: 12, fontWeight: 800, color: color.f, marginBottom: 4,
                  paddingBottom: 3, borderBottom: `2px solid ${color.accent}`,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span>{time}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#888" }}>{tSlots.length}コマ</span>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
                  background: "#555", gap: 2, border: "2px solid #555", borderRadius: 4, overflow: "hidden",
                }}>
                  {tSlots.map((s, i) => {
                    const gc = GC(s.grade);
                    const sub = date ? getSubForSlot(subs, s.id, date) : null;
                    const st = sub ? (SUB_STATUS[sub.status] || SUB_STATUS.requested) : null;
                    const newGradeRow = i > 0 && s.grade !== tSlots[i - 1].grade;
                    return (
                      <div key={i} style={{
                        background: sub ? st.bg : "#fff", padding: "8px 6px", textAlign: "left",
                        display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 96,
                        position: "relative",
                        ...(newGradeRow ? { gridColumnStart: 1 } : null),
                      }}>
                        {sub && (
                          <div style={{position:"absolute",top:2,right:2,background:st.color,color:"#fff",fontSize:8,fontWeight:800,padding:"1px 4px",borderRadius:3}}
                            title={`${sub.originalTeacher} → ${sub.substitute || "未定"}\n${st.label}${sub.memo ? "\n" + sub.memo : ""}`}>代</div>
                        )}
                        <div style={{ lineHeight: 1.4 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}>
                            <span style={{
                              background: gc.b, color: gc.f, borderRadius: 3, padding: "1px 4px",
                              fontSize: 11, fontWeight: 700,
                            }}>{s.grade}{s.cls && s.cls !== "-" ? s.cls : ""}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>{s.subj}</span>
                          </div>
                          {(s.room || s.note) && (
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                              {s.room && <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>{s.room}</span>}
                              {s.note && <span style={{ fontSize: 13, fontWeight: 600, color: "#a0331a" }}>({s.note})</span>}
                            </div>
                          )}
                        </div>
                        <div style={{
                          fontSize: sub ? 16 : 22, fontWeight: 800, color: "#1a1a2e",
                          lineHeight: 1.1, marginTop: 6,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {sub ? (
                            <span>
                              <span style={{textDecoration:"line-through",color:"#999",fontSize:12}}>{sub.originalTeacher}</span>
                              <span style={{margin:"0 2px",color:st.color}}>→</span>
                              <span style={{color:st.color}}>{sub.substitute || "?"}</span>
                            </span>
                          ) : s.teacher}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashDayRow({ date, dow, holidays: hols, slots, subs }) {
  const fullOff = hols.some(h => (h.scope || ["全部"]).includes("全部"));
  const offDepts = [...new Set(hols.flatMap(h => h.scope || ["全部"]))].filter(d => d !== "全部");
  const hasPartial = !fullOff && offDepts.length > 0;
  const holLabel = hols[0]?.label;

  return (
    <div>
      <div style={{
        background: fullOff ? "#f0f0f0" : (DC[dow] || "#666"), color: fullOff ? "#999" : "#fff",
        padding: "10px 16px", borderRadius: 10, fontWeight: 800, fontSize: 15,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
        marginBottom: 10,
      }}>
        <span>{date}（{dow}）</span>
        {fullOff && <span style={{ fontSize: 11, background: "#ddd", padding: "2px 8px", borderRadius: 4 }}>🚫 {holLabel}</span>}
        {hasPartial && (
          <div style={{ display: "flex", gap: 3 }}>
            {offDepts.map(d => (
              <span key={d} style={{ fontSize: 10, background: "rgba(255,255,255,0.25)", padding: "2px 6px", borderRadius: 4 }}>{d}休</span>
            ))}
          </div>
        )}
      </div>
      {fullOff ? (
        <div style={{ textAlign: "center", color: "#bbb", padding: 30, fontSize: 14, background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0" }}>
          休講日{holLabel ? `（${holLabel}）` : ""}
        </div>
      ) : (
        <div className="dash-sections" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
          {DASH_SECTIONS.map(sec => {
            const deptOff = offDepts.includes(sec.dept);
            const secSlots = deptOff ? [] : sortS(slots.filter(sec.filterFn));
            const color = DEPT_COLOR[sec.dept] || { b: "#e8e8e8", f: "#444", accent: "#888" };
            return <SectionColumn key={sec.key} label={sec.label} color={color} sl={secSlots} deptOff={deptOff} subs={subs} date={date} />;
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard({ slots, holidays, subs }) {
  const now = new Date();
  const todayStr = fmtDate(now);
  const todayDow = WEEKDAYS[now.getDay()];
  const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
  const tmrStr = fmtDate(tmr);
  const tmrDow = WEEKDAYS[tmr.getDay()];

  const holidaysFor = d => holidays.filter(h => h.date === d);
  const isOffForGrade = (d, grade) => {
    const dept = gradeToDept(grade);
    return holidays.some(h => {
      if (h.date !== d) return false;
      const sc = h.scope || ["全部"];
      return sc.includes("全部") || (dept && sc.includes(dept));
    });
  };

  const todayHols = holidaysFor(todayStr);
  const tmrHols = holidaysFor(tmrStr);
  const todaySlots = slots.filter(s => s.day === todayDow && !isOffForGrade(todayStr, s.grade));
  const tmrSlots = slots.filter(s => s.day === tmrDow && !isOffForGrade(tmrStr, s.grade));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <DashDayRow date={todayStr} dow={todayDow} holidays={todayHols} slots={todaySlots} subs={subs} />
      <DashDayRow date={tmrStr} dow={tmrDow} holidays={tmrHols} slots={tmrSlots} subs={subs} />
    </div>
  );
}

function WeekView({teacher,slots,subs,onEdit,onDel}) {
  const ts=useMemo(()=>sortS(slots.filter(s=>s.teacher===teacher||s.note?.includes(teacher))),[teacher,slots]);
  const byDay=useMemo(()=>{const m={};DAYS.forEach(d=>{m[d]=[]});ts.forEach(s=>m[s.day]?.push(s));return m;},[ts]);

  // 今日から+14日間の代行予定 (この teacher が元講師 or 代行者)
  const upcomingSubs=useMemo(()=>{
    if(!subs?.length) return [];
    const today=new Date();today.setHours(0,0,0,0);
    const end=new Date(today);end.setDate(end.getDate()+14);
    return subs
      .filter(sub=>{
        if(sub.originalTeacher!==teacher&&sub.substitute!==teacher) return false;
        const [y,m,d]=sub.date.split("-").map(Number);
        const dt=new Date(y,m-1,d);
        return dt>=today&&dt<=end;
      })
      .sort((a,b)=>a.date.localeCompare(b.date));
  },[subs,teacher]);

  return (
    <div style={{marginTop:12}}>
      {upcomingSubs.length>0 && (
        <div style={{background:"#fffbe6",border:"1px solid #f0d878",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:800,marginBottom:8,color:"#8a6a1a"}}>
            🔄 直近2週間の代行予定 ({upcomingSubs.length}件)
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {upcomingSubs.map(sub=>{
              const slot=slots.find(s=>s.id===sub.slotId);
              const st=SUB_STATUS[sub.status]||SUB_STATUS.requested;
              const isOriginal=sub.originalTeacher===teacher;
              return (
                <div key={sub.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",padding:"6px 10px",borderRadius:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:700,minWidth:110}}>{fmtDateWeekday(sub.date)}</span>
                  <span style={{fontSize:11,color:"#666",minWidth:90}}>{slot?.time||"-"}</span>
                  <span style={{fontSize:11}}>{slot?`${slot.grade}${slot.cls&&slot.cls!=="-"?slot.cls:""} ${slot.subj}`:"(削除済)"}</span>
                  <span style={{fontSize:11,fontWeight:700,marginLeft:"auto"}}>
                    <span style={{color:isOriginal?"#c03030":"#888"}}>{sub.originalTeacher}</span>
                    <span style={{margin:"0 4px",color:"#888"}}>→</span>
                    <span style={{color:!isOriginal?"#2a7a4a":"#888"}}>{sub.substitute||"未定"}</span>
                  </span>
                  <StatusBadge status={sub.status}/>
                  {isOriginal
                    ? <span style={{fontSize:9,background:"#fde4e4",color:"#c03030",padding:"1px 6px",borderRadius:10,fontWeight:700}}>お願いする側</span>
                    : <span style={{fontSize:9,background:"#e0f2e4",color:"#2a7a4a",padding:"1px 6px",borderRadius:10,fontWeight:700}}>代行する側</span>
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{overflowX:"auto"}}>
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
    </div>
  );
}

function MonthView({teacher,slots,holidays,subs,year,month,onEdit,onDel}) {
  // 対象: 元々この teacher のコマ + この teacher が代行に入った他人のコマ
  const teacherSubs=useMemo(()=>(subs||[]).filter(s=>s.originalTeacher===teacher||s.substitute===teacher),[subs,teacher]);
  const ts=useMemo(()=>slots.filter(s=>s.teacher===teacher||s.note?.includes(teacher)),[teacher,slots]);
  const dayMap=useMemo(()=>{const m={};DAYS.forEach(d=>{m[d]=ts.filter(s=>s.day===d)});return m;},[ts]);
  const holMap=useMemo(()=>{const m={};holidays.forEach(h=>{m[h.date]=h});return m;},[holidays]);

  const isOffForGrade=useCallback((ds,grade)=>{
    const h=holMap[ds];
    if(!h)return false;
    const sc=h.scope||["全部"];
    if(sc.includes("全部"))return true;
    const dept=gradeToDept(grade);
    return dept&&sc.includes(dept);
  },[holMap]);

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
          const hol=holMap[ds];
          const isFullOff=hol&&(hol.scope||["全部"]).includes("全部");
          const offDepts=hol?[...new Set((hol.scope||["全部"]).filter(s=>s!=="全部"))]:[];
          const isT=todayY===year&&todayM===month&&todayD===d;
          const sl=isFullOff?[]:(dayMap[dn]||[]).filter(s=>!isOffForGrade(ds,s.grade));
          return (
            <div key={i} style={{
              background:isFullOff?"#f8f0f0":isT?"#fffbe6":dow===0?"#fdf5f5":dow===6?"#f5f5fd":"#fff",
              minHeight:90,padding:4,border:isT?"2px solid #e6a800":"none",position:"relative",
            }}>
              <div style={{fontSize:12,fontWeight:isT?800:600,color:dow===0?"#c44":dow===6?"#44c":"#333",display:"flex",justifyContent:"space-between"}}>
                <span>{d}</span>
                {isFullOff&&<span style={{fontSize:9,color:"#c44",fontWeight:400}}>{hol.label}</span>}
                {!isFullOff&&offDepts.length>0&&<span style={{fontSize:8,color:"#c88",fontWeight:400}}>{offDepts.map(d=>d.replace("部","")).join(",")+"休"}</span>}
              </div>
              {isFullOff?<div style={{fontSize:10,color:"#caa",textAlign:"center",marginTop:8}}>休</div>:
                sl.map((s,j)=>{
                  const sub=getSubForSlot(subs,s.id,ds);
                  const st=sub?(SUB_STATUS[sub.status]||SUB_STATUS.requested):null;
                  const away=sub&&sub.originalTeacher===teacher&&sub.substitute!==teacher; // 自分が休み
                  return (
                    <div key={j} style={{
                      fontSize:11,lineHeight:1.4,padding:"2px 3px",margin:"1px 0",borderRadius:3,
                      background:sub?st.bg:DB[s.day],
                      borderLeft:`2px solid ${sub?st.color:DC[s.day]}`,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      cursor:onEdit?"pointer":"default",
                      opacity:away?0.55:1,
                    }}
                      onClick={()=>onEdit&&onEdit(s)}
                      title={`${s.time} ${s.grade} ${s.subj} ${s.room||""}${sub?`\n[代行] ${sub.originalTeacher} → ${sub.substitute||"未定"} (${st.label})${sub.memo?"\n"+sub.memo:""}`:""}\nクリックで編集`}>
                      {sub && <span style={{background:st.color,color:"#fff",fontSize:8,fontWeight:800,padding:"0 3px",borderRadius:2,marginRight:2}}>代</span>}
                      <b>{s.time.split("-")[0]}</b> {s.subj}
                    </div>
                  );
                })}
              {/* この teacher が「他人のコマ」を代行する場合 */}
              {!isFullOff && teacherSubs.filter(sub=>sub.date===ds && sub.substitute===teacher && !sl.some(s=>s.id===sub.slotId)).map((sub,j)=>{
                const slot=slots.find(s=>s.id===sub.slotId);
                if(!slot) return null;
                const st=SUB_STATUS[sub.status]||SUB_STATUS.requested;
                return (
                  <div key={`ext-${j}`} style={{
                    fontSize:11,lineHeight:1.4,padding:"2px 3px",margin:"1px 0",borderRadius:3,
                    background:st.bg,borderLeft:`2px solid ${st.color}`,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                  }}
                    title={`${slot.time} ${slot.grade} ${slot.subj} ${slot.room||""}\n[代行] ${sub.originalTeacher}の代わりに担当 (${st.label})${sub.memo?"\n"+sub.memo:""}`}>
                    <span style={{background:st.color,color:"#fff",fontSize:8,fontWeight:800,padding:"0 3px",borderRadius:2,marginRight:2}}>代</span>
                    <b>{slot.time.split("-")[0]}</b> {slot.subj}
                  </div>
                );
              })}
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
      const byDay={};const byDayTip={};
      DAYS.forEach(d=>{
        const ds=sl.filter(s=>s.day===d);
        byDay[d]=ds.length;
        byDayTip[d]=ds.map(s=>`${s.time} ${s.grade} ${s.subj}`).join("\n");
      });
      return {name:t,byDay,byDayTip,total:sl.length};
    }).sort((a,b)=>b.total-a.total);
  },[slots]);
  return (
    <div style={{marginTop:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>
          <th style={{textAlign:"left",padding:"10px 14px",background:"#1a1a2e",color:"#fff",borderRadius:"8px 0 0 0",fontSize:14}}>講師名</th>
          {DAYS.map(d=><th key={d} style={{padding:"10px 12px",background:DC[d],color:"#fff",textAlign:"center",minWidth:48,fontSize:14}}>{d}</th>)}
          <th style={{padding:"10px 12px",background:"#1a1a2e",color:"#fff",textAlign:"center",borderRadius:"0 8px 0 0",fontSize:14}}>計</th>
        </tr></thead>
        <tbody>{teachers.map((t,i)=>(
          <tr key={t.name} style={{background:i%2?"#f8f9fa":"#fff"}}>
            <td onClick={()=>onSelectTeacher&&onSelectTeacher(t.name)} style={{padding:"8px 14px",fontWeight:800,fontSize:15,borderBottom:"1px solid #eee",cursor:onSelectTeacher?"pointer":"default",color:onSelectTeacher?"#2e6a9e":"inherit"}}
              onMouseEnter={e=>{if(onSelectTeacher)e.currentTarget.style.textDecoration="underline"}}
              onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{t.name}</td>
            {DAYS.map(d=><td key={d} title={t.byDayTip[d]} style={{textAlign:"center",padding:"8px 10px",borderBottom:"1px solid #eee",background:t.byDay[d]?DB[d]:"transparent",fontWeight:t.byDay[d]>3?800:t.byDay[d]?600:400,fontSize:t.byDay[d]?18:13,color:t.byDay[d]>3?DC[d]:t.byDay[d]?"#1a1a2e":"#ccc",cursor:"default"}}>{t.byDay[d]||"—"}</td>)}
            <td style={{textAlign:"center",padding:"8px 10px",fontWeight:800,fontSize:18,borderBottom:"1px solid #eee",color:t.total>10?"#c44":"#1a1a2e"}}>{t.total}</td>
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
  const [tab,setTab]=useState("list");

  const grades=useMemo(()=>[...new Set(slots.map(s=>s.grade))].sort(),[slots]);

  const filtered=useMemo(()=>{
    let r=[...slots];
    if(filterDay) r=r.filter(s=>s.day===filterDay);
    if(filterGrade) r=r.filter(s=>s.grade===filterGrade);
    if(filterTeacher) r=r.filter(s=>s.teacher.includes(filterTeacher));
    if(filterSubj) r=r.filter(s=>s.subj.includes(filterSubj));
    return sortS(r);
  },[slots,filterDay,filterGrade,filterTeacher,filterSubj]);

  const dayGroups=useMemo(()=>{
    const activeDays=filterDay?[filterDay]:DAYS;
    return activeDays.map(day=>{
      const daySlots=filtered.filter(s=>s.day===day);
      if(daySlots.length===0) return null;
      return {day,slots:daySlots};
    }).filter(Boolean);
  },[filtered,filterDay]);

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
      <div style={{display:"flex",flexDirection:"column",gap:24}}>
        {dayGroups.map(({day,slots:daySlots})=>(
          <div key={day}>
            <div style={{
              background:DC[day]||"#666",color:"#fff",
              padding:"10px 16px",borderRadius:10,fontWeight:800,fontSize:15,
              display:"flex",justifyContent:"space-between",alignItems:"center",
              marginBottom:10,
            }}>
              <span>{day}曜日</span>
              <span style={{fontSize:11,opacity:.8}}>{daySlots.length}コマ</span>
            </div>
            <div className="dash-sections" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:10}}>
              {DASH_SECTIONS.map(sec=>{
                const secSlots=daySlots.filter(sec.filterFn);
                const color=DEPT_COLOR[sec.dept]||{b:"#e8e8e8",f:"#444",accent:"#888"};
                const byTime={};
                secSlots.forEach(s=>{if(!byTime[s.time])byTime[s.time]=[];byTime[s.time].push(s);});
                const timeGroups=Object.entries(byTime).sort(([a],[b])=>timeToMin(a.split("-")[0])-timeToMin(b.split("-")[0]));
                const teachers=[...new Set(secSlots.map(s=>s.teacher))];
                return (
                  <div key={sec.key} style={{flex:1,minWidth:0}}>
                    <div style={{
                      background:color.b,color:color.f,padding:"8px 12px",
                      borderRadius:"8px 8px 0 0",fontWeight:800,fontSize:13,
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                    }}>
                      <span>{sec.label}</span>
                      {secSlots.length>0&&<span style={{fontSize:10,fontWeight:600,opacity:0.8}}>{secSlots.length}コマ / {teachers.length}名</span>}
                    </div>
                    <div style={{
                      background:"#fff",borderRadius:"0 0 8px 8px",
                      border:"1px solid #e0e0e0",borderTop:"none",
                      padding:10,minHeight:80,
                    }}>
                      {secSlots.length===0?(
                        <div style={{textAlign:"center",color:"#bbb",padding:20,fontSize:13}}>授業なし</div>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:12}}>
                          {timeGroups.map(([time,tSlots])=>(
                            <div key={time}>
                              <div style={{
                                fontSize:12,fontWeight:800,color:color.f,marginBottom:4,
                                paddingBottom:3,borderBottom:`2px solid ${color.accent}`,
                                display:"flex",alignItems:"center",gap:6,
                              }}>
                                <span>{time}</span>
                                <span style={{fontSize:10,fontWeight:400,color:"#888"}}>{tSlots.length}コマ</span>
                              </div>
                              <div style={{
                                display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",
                                background:"#555",gap:2,border:"2px solid #555",borderRadius:4,overflow:"hidden",
                              }}>
                                {tSlots.map((s,i)=>{
                                  const gc=GC(s.grade);
                                  const newGradeRow=i>0&&s.grade!==tSlots[i-1].grade;
                                  return (
                                    <div key={s.id} style={{
                                      background:"#fff",padding:"8px 6px",textAlign:"left",
                                      display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:96,
                                      position:"relative",
                                      ...(newGradeRow?{gridColumnStart:1}:null),
                                    }}
                                    onMouseEnter={e=>{const b=e.currentTarget.querySelector('.master-slot-actions');if(b)b.style.opacity='1';}}
                                    onMouseLeave={e=>{const b=e.currentTarget.querySelector('.master-slot-actions');if(b)b.style.opacity='0';}}>
                                      <div style={{lineHeight:1.4}}>
                                        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:4,flexWrap:"wrap"}}>
                                          <span style={{
                                            background:gc.b,color:gc.f,borderRadius:3,padding:"1px 4px",
                                            fontSize:11,fontWeight:700,
                                          }}>{s.grade}{s.cls&&s.cls!=="-"?s.cls:""}</span>
                                          <span style={{fontSize:14,fontWeight:600,color:"#444"}}>{s.subj}</span>
                                        </div>
                                        {(s.room||s.note)&&(
                                          <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:2,flexWrap:"wrap"}}>
                                            {s.room&&<span style={{fontSize:18,fontWeight:700,color:"#555"}}>{s.room}</span>}
                                            {s.note&&<span style={{fontSize:13,fontWeight:600,color:"#a0331a"}}>({s.note})</span>}
                                          </div>
                                        )}
                                      </div>
                                      <div style={{
                                        fontSize:22,fontWeight:800,color:"#1a1a2e",
                                        lineHeight:1.1,marginTop:6,
                                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                                      }}>
                                        {s.teacher}
                                      </div>
                                      <div className="master-slot-actions" style={{
                                        position:"absolute",top:2,right:2,display:"flex",gap:1,
                                        opacity:0,transition:"opacity .15s",
                                      }}>
                                        <button onClick={()=>onEdit(s)} style={{background:"rgba(255,255,255,0.9)",border:"1px solid #ddd",borderRadius:3,cursor:"pointer",fontSize:11,padding:"1px 3px",lineHeight:1}}>✏️</button>
                                        <button onClick={()=>onDel(s.id)} style={{background:"rgba(255,255,255,0.9)",border:"1px solid #ddd",borderRadius:3,cursor:"pointer",fontSize:11,padding:"1px 3px",lineHeight:1}}>🗑</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {dayGroups.length===0&&(
          <div style={{textAlign:"center",color:"#888",padding:40,background:"#fff",borderRadius:8,border:"1px solid #e0e0e0"}}>
            該当するコマがありません
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 代行管理 ────────────────────────────────────────────────────────
function StatusBadge({status}){
  const s=SUB_STATUS[status]||SUB_STATUS.requested;
  return (
    <span style={{
      display:"inline-block",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,
      background:s.bg,color:s.color,border:`1px solid ${s.border}`,whiteSpace:"nowrap",
    }}>{s.label}</span>
  );
}

function SubBadge({sub,compact}){
  if(!sub) return null;
  const s=SUB_STATUS[sub.status]||SUB_STATUS.requested;
  return (
    <span title={`${sub.originalTeacher} → ${sub.substitute||"未定"} (${s.label})${sub.memo?"\n"+sub.memo:""}`}
      style={{
      display:"inline-flex",alignItems:"center",gap:4,fontSize:compact?9:10,fontWeight:700,
      padding:compact?"1px 5px":"2px 7px",borderRadius:10,
      background:s.bg,color:s.color,border:`1px solid ${s.border}`,whiteSpace:"nowrap",
    }}>
      <span>代</span>
      <span>{sub.originalTeacher}→{sub.substitute||"?"}</span>
    </span>
  );
}

function SubstituteForm({sub,slots,partTimeStaff,onSave,onCancel}){
  const today=fmtDate(new Date());
  const [f,setF]=useState(sub||{
    date:today,slotId:"",originalTeacher:"",substitute:"",status:"requested",memo:"",
  });
  const [errors,setErrors]=useState({});
  const up=(k,v)=>{setF(p=>({...p,[k]:v}));setErrors(p=>({...p,[k]:undefined}));};

  const dayOfDate=dateToDay(f.date);

  // 候補コマ: 選択日の曜日に該当する slot、アルバイト担当を優先
  const slotOptions=useMemo(()=>{
    if(!dayOfDate) return [];
    const filtered=sortS(slots.filter(s=>s.day===dayOfDate));
    const isPT=(t)=>partTimeStaff.includes(t);
    return [
      ...filtered.filter(s=>isPT(s.teacher)),
      ...filtered.filter(s=>!isPT(s.teacher)),
    ];
  },[slots,dayOfDate,partTimeStaff]);

  const selectedSlot=useMemo(
    ()=>slots.find(s=>s.id===Number(f.slotId))||null,
    [slots,f.slotId]
  );

  // slot 変更時に元講師を自動入力
  useEffect(()=>{
    if(selectedSlot && selectedSlot.teacher !== f.originalTeacher){
      setF(p=>({...p,originalTeacher:selectedSlot.teacher}));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedSlot?.id]);

  const allTeachers=useMemo(()=>{
    const set=new Set(partTimeStaff);
    slots.forEach(s=>s.teacher&&set.add(s.teacher));
    return [...set].sort();
  },[slots,partTimeStaff]);

  const handleSave=()=>{
    const errs={};
    if(!f.date) errs.date="日付を入力してください";
    if(!f.slotId) errs.slotId="コマを選択してください";
    if(Object.keys(errs).length){setErrors(errs);return;}
    onSave({...f,slotId:Number(f.slotId)});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div>
        <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:3}}>日付 <span style={{color:"#c44"}}>*</span></label>
        <input type="date" value={f.date} onChange={e=>up("date",e.target.value)}
          style={{...S.input,borderColor:errors.date?"#c44":"#ccc"}}/>
        {dayOfDate && <span style={{fontSize:11,color:"#888",marginLeft:8}}>({dayOfDate}曜日)</span>}
        {errors.date&&<div style={{fontSize:10,color:"#c44",marginTop:2}}>{errors.date}</div>}
      </div>

      <div>
        <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:3}}>対象コマ <span style={{color:"#c44"}}>*</span></label>
        <select value={f.slotId} onChange={e=>up("slotId",e.target.value)}
          style={{...S.input,borderColor:errors.slotId?"#c44":"#ccc"}}>
          <option value="">-- コマを選択 --</option>
          {slotOptions.map(s=>{
            const isPT=partTimeStaff.includes(s.teacher);
            return (
              <option key={s.id} value={s.id}>
                {isPT?"★ ":""}{s.time} / {s.grade}{s.cls&&s.cls!=="-"?s.cls:""} / {s.subj} / {s.teacher}{s.room?` (${s.room})`:""}
              </option>
            );
          })}
        </select>
        {dayOfDate===null && <div style={{fontSize:10,color:"#888",marginTop:2}}>※ 日付を選ぶと該当曜日のコマが表示されます</div>}
        {dayOfDate && slotOptions.length===0 && <div style={{fontSize:10,color:"#888",marginTop:2}}>該当コマがありません</div>}
        {errors.slotId&&<div style={{fontSize:10,color:"#c44",marginTop:2}}>{errors.slotId}</div>}
      </div>

      {selectedSlot && (
        <div style={{background:"#f5f7fa",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#555"}}>
          元講師: <b style={{color:"#1a1a2e",fontSize:13}}>{selectedSlot.teacher}</b>
          {selectedSlot.note && <span style={{marginLeft:10,color:"#e67a00"}}>({selectedSlot.note})</span>}
        </div>
      )}

      <div>
        <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:3}}>代行者</label>
        <input list="sub-teacher-list" value={f.substitute} onChange={e=>up("substitute",e.target.value)}
          placeholder="代行者名 (空欄なら依頼中)" style={S.input}/>
        <datalist id="sub-teacher-list">
          {allTeachers.map(t=><option key={t} value={t}/>)}
        </datalist>
      </div>

      <div>
        <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:3}}>ステータス</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {SUB_STATUS_KEYS.map(k=>{
            const st=SUB_STATUS[k];
            const active=f.status===k;
            return (
              <button key={k} type="button" onClick={()=>up("status",k)} style={{
                padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,
                background:active?st.bg:"#f5f5f5",
                color:active?st.color:"#888",
                border:`2px solid ${active?st.border:"#e0e0e0"}`,
              }}>{st.label}</button>
            );
          })}
        </div>
        {!f.substitute && f.status!=="requested" && (
          <div style={{fontSize:10,color:"#c77",marginTop:4}}>※ 代行者が未入力の場合は「依頼中」として保存されます</div>
        )}
      </div>

      <div>
        <label style={{fontSize:12,fontWeight:700,display:"block",marginBottom:3}}>メモ</label>
        <textarea value={f.memo||""} onChange={e=>up("memo",e.target.value)}
          placeholder="理由・引継ぎ事項など"
          rows={3} style={{...S.input,resize:"vertical",fontFamily:"inherit"}}/>
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
        <button onClick={onCancel} style={S.btn(false)}>キャンセル</button>
        <button onClick={handleSave} style={S.btn(true)}>保存</button>
      </div>
    </div>
  );
}

function SubstituteView({subs,slots,partTimeStaff,onNew,onEdit,onDel,onSavePartTimeStaff}){
  const now=new Date();
  const [tab,setTab]=useState("list");
  const [fMonth,setFMonth]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [fStaff,setFStaff]=useState("");
  const [fStatus,setFStatus]=useState("");
  const [newStaff,setNewStaff]=useState("");

  const slotMap=useMemo(()=>{
    const m={};slots.forEach(s=>{m[s.id]=s});return m;
  },[slots]);

  const filtered=useMemo(()=>{
    let r=[...subs];
    if(fMonth) r=r.filter(s=>s.date?.startsWith(fMonth));
    if(fStaff) r=r.filter(s=>s.originalTeacher===fStaff||s.substitute===fStaff);
    if(fStatus) r=r.filter(s=>s.status===fStatus);
    return r.sort((a,b)=>a.date.localeCompare(b.date));
  },[subs,fMonth,fStaff,fStatus]);

  const [ty,tm]=fMonth.split("-").map(Number);
  const tally=useMemo(()=>monthlyTally(subs,ty,tm),[subs,ty,tm]);

  const tallyRows=useMemo(()=>{
    const names=new Set(partTimeStaff);
    Object.keys(tally.covered).forEach(n=>names.add(n));
    Object.keys(tally.coveredFor).forEach(n=>names.add(n));
    return [...names].map(name=>({
      name,
      covered:tally.covered[name]||0,
      coveredFor:tally.coveredFor[name]||0,
      isPT:partTimeStaff.includes(name),
    })).sort((a,b)=>(b.covered+b.coveredFor)-(a.covered+a.coveredFor)||a.name.localeCompare(b.name));
  },[tally,partTimeStaff]);

  const addStaff=()=>{
    const n=newStaff.trim();
    if(!n||partTimeStaff.includes(n)) return;
    onSavePartTimeStaff([...partTimeStaff,n]);
    setNewStaff("");
  };
  const delStaff=(n)=>{
    if(!confirm(`「${n}」をアルバイト一覧から削除しますか？\n※過去の代行記録は削除されません`)) return;
    onSavePartTimeStaff(partTimeStaff.filter(x=>x!==n));
  };

  const allTeachers=useMemo(()=>{
    const set=new Set(partTimeStaff);
    slots.forEach(s=>s.teacher&&set.add(s.teacher));
    return [...set].sort();
  },[slots,partTimeStaff]);

  const TabBtn=({k,label,count})=>(
    <button onClick={()=>setTab(k)} style={S.btn(tab===k)}>
      {label}{count!=null&&<span style={{marginLeft:5,opacity:.7}}>{count}</span>}
    </button>
  );

  return (
    <div style={{marginTop:12}}>
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        <TabBtn k="list" label="代行一覧" count={subs.length}/>
        <TabBtn k="tally" label="月次集計"/>
        <TabBtn k="staff" label="アルバイト管理" count={partTimeStaff.length}/>
      </div>

      {tab==="list" && (
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",background:"#fff",padding:12,borderRadius:8,border:"1px solid #e0e0e0",alignItems:"flex-end"}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>月</label>
              <input type="month" value={fMonth} onChange={e=>setFMonth(e.target.value)} style={{...S.input,width:"auto"}}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>講師・代行者</label>
              <select value={fStaff} onChange={e=>setFStaff(e.target.value)} style={{...S.input,width:"auto",minWidth:110}}>
                <option value="">すべて</option>
                {allTeachers.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,display:"block",marginBottom:2}}>ステータス</label>
              <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{...S.input,width:"auto",minWidth:90}}>
                <option value="">すべて</option>
                {SUB_STATUS_KEYS.map(k=><option key={k} value={k}>{SUB_STATUS[k].label}</option>)}
              </select>
            </div>
            <button onClick={()=>{setFMonth("");setFStaff("");setFStatus("")}} style={{...S.btn(false),fontSize:11}}>クリア</button>
            <div style={{marginLeft:"auto"}}>
              <button onClick={onNew} style={{...S.btn(false),background:"#e8f5e8",color:"#2a7a2a"}}>＋ 新規代行</button>
            </div>
          </div>

          <div style={{fontSize:12,color:"#888",marginBottom:6}}>{filtered.length} / {subs.length} 件表示</div>
          <div style={{background:"#fff",borderRadius:8,border:"1px solid #e0e0e0",overflow:"auto"}}>
            {filtered.length===0 ? (
              <div style={{textAlign:"center",color:"#bbb",padding:40,fontSize:13}}>該当する代行記録はありません</div>
            ) : (
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:760}}>
                <thead>
                  <tr style={{background:"#1a1a2e",color:"#fff"}}>
                    <th style={{padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>日付</th>
                    <th style={{padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>時間</th>
                    <th style={{padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>学年</th>
                    <th style={{padding:"8px 10px",textAlign:"left"}}>科目</th>
                    <th style={{padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap"}}>元 → 代行</th>
                    <th style={{padding:"8px 10px",textAlign:"center",whiteSpace:"nowrap"}}>状態</th>
                    <th style={{padding:"8px 10px",textAlign:"left"}}>メモ</th>
                    <th style={{padding:"8px 10px",textAlign:"center",width:60}}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sub,i)=>{
                    const slot=slotMap[sub.slotId];
                    const gc=slot?GC(slot.grade):{b:"#eee",f:"#888"};
                    const dow=dateToDay(sub.date);
                    return (
                      <tr key={sub.id} style={{background:i%2?"#f8f9fa":"#fff",borderTop:"1px solid #eee"}}>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap",fontWeight:700}}>
                          {sub.date}
                          {dow && <span style={{marginLeft:4,fontSize:10,color:DC[dow],fontWeight:700}}>({dow})</span>}
                        </td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>{slot?.time||"-"}</td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>
                          {slot ? (
                            <span style={{background:gc.b,color:gc.f,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>
                              {slot.grade}{slot.cls&&slot.cls!=="-"?slot.cls:""}
                            </span>
                          ) : "(削除済)"}
                        </td>
                        <td style={{padding:"8px 10px",fontWeight:600}}>{slot?.subj||"-"}{slot?.room?<span style={{color:"#999",fontSize:10,marginLeft:4}}>{slot.room}</span>:null}</td>
                        <td style={{padding:"8px 10px",whiteSpace:"nowrap",fontWeight:700}}>
                          {sub.originalTeacher} <span style={{color:"#888",fontWeight:400}}>→</span> <span style={{color:"#2a7a4a"}}>{sub.substitute||"未定"}</span>
                        </td>
                        <td style={{padding:"8px 10px",textAlign:"center"}}><StatusBadge status={sub.status}/></td>
                        <td style={{padding:"8px 10px",fontSize:11,color:"#666",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={sub.memo}>{sub.memo}</td>
                        <td style={{padding:"8px 10px",textAlign:"center",whiteSpace:"nowrap"}}>
                          <button onClick={()=>onEdit(sub)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:2}}>✏️</button>
                          <button onClick={()=>onDel(sub.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:2}}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab==="tally" && (
        <div>
          <div style={{background:"#fff",padding:12,borderRadius:8,border:"1px solid #e0e0e0",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <label style={{fontSize:12,fontWeight:700}}>集計月:</label>
            <input type="month" value={fMonth} onChange={e=>setFMonth(e.target.value)} style={{...S.input,width:"auto"}}/>
            <span style={{fontSize:11,color:"#888"}}>※ 依頼中のレコードは集計対象外</span>
          </div>
          <div style={{background:"#fff",borderRadius:8,border:"1px solid #e0e0e0",overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#1a1a2e",color:"#fff"}}>
                  <th style={{padding:"10px 14px",textAlign:"left"}}>氏名</th>
                  <th style={{padding:"10px 14px",textAlign:"center"}}>代行した</th>
                  <th style={{padding:"10px 14px",textAlign:"center"}}>代行された</th>
                  <th style={{padding:"10px 14px",textAlign:"center"}}>差引</th>
                </tr>
              </thead>
              <tbody>
                {tallyRows.map((r,i)=>{
                  const diff=r.covered-r.coveredFor;
                  return (
                    <tr key={r.name} style={{background:i%2?"#f8f9fa":"#fff",borderTop:"1px solid #eee"}}>
                      <td style={{padding:"10px 14px",fontWeight:800,fontSize:14}}>
                        {r.isPT && <span style={{marginRight:6,background:"#ffe8a0",color:"#7a5a1a",borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700,verticalAlign:"middle"}}>バイト</span>}
                        {r.name}
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"center",fontSize:18,fontWeight:r.covered?800:400,color:r.covered?"#2a7a4a":"#ccc"}}>{r.covered||"—"}</td>
                      <td style={{padding:"10px 14px",textAlign:"center",fontSize:18,fontWeight:r.coveredFor?800:400,color:r.coveredFor?"#c03030":"#ccc"}}>{r.coveredFor||"—"}</td>
                      <td style={{padding:"10px 14px",textAlign:"center",fontSize:16,fontWeight:700,color:diff>0?"#2a7a4a":diff<0?"#c03030":"#888"}}>{diff>0?`+${diff}`:diff}</td>
                    </tr>
                  );
                })}
                {tallyRows.length===0 && (
                  <tr><td colSpan={4} style={{textAlign:"center",color:"#bbb",padding:40,fontSize:13}}>データがありません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="staff" && (
        <div>
          <div style={{background:"#fff",padding:14,borderRadius:8,border:"1px solid #e0e0e0",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>アルバイトを追加</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={newStaff} onChange={e=>setNewStaff(e.target.value)} placeholder="名前を入力" list="sub-staff-candidates"
                onKeyDown={e=>{if(e.key==="Enter")addStaff()}} style={{...S.input,width:180}}/>
              <datalist id="sub-staff-candidates">
                {allTeachers.filter(t=>!partTimeStaff.includes(t)).map(t=><option key={t} value={t}/>)}
              </datalist>
              <button onClick={addStaff} style={S.btn(true)}>＋ 追加</button>
            </div>
            <div style={{fontSize:11,color:"#888",marginTop:6}}>※ 既存講師名を入れると候補に補完されます</div>
          </div>
          <div style={{background:"#fff",borderRadius:8,border:"1px solid #e0e0e0",overflow:"hidden"}}>
            {partTimeStaff.length===0 ? (
              <div style={{textAlign:"center",color:"#bbb",padding:30,fontSize:13}}>登録されていません</div>
            ) : partTimeStaff.map((n,i)=>{
              const cnt=slots.filter(s=>s.teacher===n).length;
              return (
                <div key={n} style={{
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"10px 14px",borderBottom:i<partTimeStaff.length-1?"1px solid #eee":"none",
                  background:i%2?"#f8f9fa":"#fff",
                }}>
                  <div>
                    <span style={{fontWeight:800,fontSize:14}}>{n}</span>
                    <span style={{marginLeft:10,fontSize:11,color:"#888"}}>担当コマ: {cnt}</span>
                  </div>
                  <button onClick={()=>delStaff(n)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#c44"}}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────
export default function App() {
  const [slots,setSlots]=useState(INIT_SLOTS);
  const [holidays,setHolidays]=useState(INIT_HOLIDAYS);
  const [subs,setSubs]=useState([]);
  const [partTimeStaff,setPartTimeStaff]=useState(INIT_PART_TIME_STAFF);
  const [selected,setSelected]=useState(null);
  const [view,setView]=useState("dash"); // dash|week|month|all|master|holidays|subs
  const [monthOff,setMonthOff]=useState(0);
  const [search,setSearch]=useState("");
  const [editSlot,setEditSlot]=useState(null); // null | slot | "new"
  const [editSub,setEditSub]=useState(null);   // null | sub | "new"
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
      if(h) setHolidays(JSON.parse(h).map(x=>({...x,scope:x.scope||["全部"]})));
    } catch{}
    try {
      const bw=localStorage.getItem("genyakubu-biweekly-base");
      if(bw) setBiweeklyBase(bw);
    } catch{}
    try {
      const sv=localStorage.getItem("genyakubu-substitutions");
      if(sv) setSubs(JSON.parse(sv));
    } catch{}
    try {
      const pt=localStorage.getItem("genyakubu-part-time-staff");
      if(pt) setPartTimeStaff(JSON.parse(pt));
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
  const saveSubs=useCallback((v)=>{
    setSubs(v);
    try{localStorage.setItem("genyakubu-substitutions",JSON.stringify(v))}catch{}
  },[]);
  const savePartTimeStaff=useCallback((v)=>{
    setPartTimeStaff(v);
    try{localStorage.setItem("genyakubu-part-time-staff",JSON.stringify(v))}catch{}
  },[]);

  const handleExport=()=>{
    const data=JSON.stringify({slots,holidays,biweeklyBase,substitutions:subs,partTimeStaff},null,2);
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
        if(d.holidays&&Array.isArray(d.holidays)){saveHolidays(d.holidays.map(x=>({...x,scope:x.scope||["全部"]})));}
        if(d.biweeklyBase){saveBiweeklyBase(d.biweeklyBase);}
        if(d.substitutions&&Array.isArray(d.substitutions)){saveSubs(d.substitutions);}
        if(d.partTimeStaff&&Array.isArray(d.partTimeStaff)){savePartTimeStaff(d.partTimeStaff);}
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
    localStorage.removeItem("genyakubu-substitutions");
    localStorage.removeItem("genyakubu-part-time-staff");
    setSlots(INIT_SLOTS);setHolidays(INIT_HOLIDAYS);setBiweeklyBase("");
    setSubs([]);setPartTimeStaff(INIT_PART_TIME_STAFF);
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
  const nextSubId=()=>Math.max(0,...subs.map(s=>s.id||0))+1;

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

  const handleSaveSub=(f)=>{
    const now=new Date().toISOString();
    const normalized={...f,status:f.substitute?f.status:"requested"};
    if(editSub==="new"){
      saveSubs([...subs,{...normalized,id:nextSubId(),createdAt:now,updatedAt:now}]);
    } else {
      saveSubs(subs.map(s=>s.id===editSub.id?{...normalized,id:s.id,createdAt:s.createdAt,updatedAt:now}:s));
    }
    setEditSub(null);
  };
  const handleDelSub=(id)=>{
    if(confirm("この代行記録を削除しますか？")) saveSubs(subs.filter(s=>s.id!==id));
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
          <button onClick={()=>{setSelected(null);setView("holidays");setSidebarOpen(false)}} style={{
            display:"block",width:"100%",padding:"7px 14px",border:"none",
            background:!selected&&view==="holidays"?"#3a3a6e":"transparent",color:!selected&&view==="holidays"?"#fff":"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:view==="holidays"?700:400,
          }}>📅 祝日・休講日管理</button>
          <button onClick={()=>{setSelected(null);setView("master");setSidebarOpen(false)}} style={{
            display:"block",width:"100%",padding:"7px 14px",border:"none",
            background:!selected&&view==="master"?"#3a3a6e":"transparent",color:!selected&&view==="master"?"#fff":"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:view==="master"?700:400,
          }}>⚙ コースマスター管理</button>
          <button onClick={()=>{setSelected(null);setView("subs");setSidebarOpen(false)}} style={{
            display:"block",width:"100%",padding:"7px 14px",border:"none",
            background:!selected&&view==="subs"?"#3a3a6e":"transparent",color:!selected&&view==="subs"?"#fff":"#ccc",textAlign:"left",cursor:"pointer",fontSize:12,fontWeight:view==="subs"?700:400,
          }}>🔄 代行管理{subs.filter(s=>s.status==="requested").length>0&&<span style={{marginLeft:6,background:"#c44",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:800}}>{subs.filter(s=>s.status==="requested").length}</span>}</button>
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
              {view==="dash"?"ダッシュボード":view==="all"?"全講師コマ数一覧":view==="master"?"コースマスター管理":view==="holidays"?"祝日・休講日管理":view==="subs"?"アルバイト代行管理":selected||""}
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
          {view==="dash"&&!selected&&<Dashboard slots={slots} holidays={holidays} subs={subs}/>}
          {view==="all"&&!selected&&<AllView slots={slots} onSelectTeacher={selectTeacher}/>}
          {view==="master"&&!selected&&<MasterView slots={slots} onEdit={setEditSlot} onDel={handleDelSlot} onNew={()=>setEditSlot("new")} biweeklyBase={biweeklyBase} onSetBiweeklyBase={saveBiweeklyBase}/>}
          {view==="holidays"&&!selected&&<HolidayManager holidays={holidays} onSave={saveHolidays}/>}
          {view==="subs"&&!selected&&<SubstituteView subs={subs} slots={slots} partTimeStaff={partTimeStaff} onNew={()=>setEditSub("new")} onEdit={setEditSub} onDel={handleDelSub} onSavePartTimeStaff={savePartTimeStaff}/>}
          {selected&&view==="week"&&<WeekView teacher={selected} slots={slots} subs={subs} onEdit={setEditSlot} onDel={handleDelSlot}/>}
          {selected&&view==="month"&&<MonthView teacher={selected} slots={slots} holidays={holidays} subs={subs} year={vy} month={vm} onEdit={setEditSlot} onDel={handleDelSlot}/>}
        </div>
      </div>

      {/* Edit Modal */}
      {editSlot&&(
        <Modal title={editSlot==="new"?"コマを追加":"コマを編集"} onClose={()=>setEditSlot(null)}>
          <SlotForm slot={editSlot==="new"?null:editSlot} onSave={handleSaveSlot} onCancel={()=>setEditSlot(null)}/>
        </Modal>
      )}

      {/* Substitute Edit Modal */}
      {editSub&&(
        <Modal title={editSub==="new"?"代行を追加":"代行を編集"} onClose={()=>setEditSub(null)}>
          <SubstituteForm sub={editSub==="new"?null:editSub} slots={slots} partTimeStaff={partTimeStaff} onSave={handleSaveSub} onCancel={()=>setEditSub(null)}/>
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
          .dash-sections { grid-template-columns: 1fr !important; }
          .master-slot-actions { opacity: 1 !important; }
        }
        @media print {
          .dash-sections { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
          .master-slot-actions { display: none !important; }
        }
      `}</style>
    </div>
  );
}
