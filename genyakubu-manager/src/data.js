export const DAYS = ["月", "火", "水", "木", "金", "土"];
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export const DAY_COLOR = {
  月: "#3d7a4a", 火: "#c05030", 水: "#2e6a9e",
  木: "#9e8a2e", 金: "#6a3d8e", 土: "#8e3d3d",
};

export const DAY_BG = {
  月: "#e8f2ea", 火: "#fce8e4", 水: "#e4ecf6",
  木: "#f6f2e4", 金: "#ece4f2", 土: "#f2e4e4",
};

export function gradeColor(g) {
  if (g.includes("附中")) return { b: "#e8d5b7", f: "#6b4c2a" };
  if (g.includes("中1")) return { b: "#d4e8d4", f: "#2a5a2a" };
  if (g.includes("中2")) return { b: "#cce0f0", f: "#1a4a6a" };
  if (g.includes("中3")) return { b: "#e0d4f0", f: "#4a2a7a" };
  if (g.includes("高1")) return { b: "#f0e0c8", f: "#7a5a1a" };
  if (g.includes("高2")) return { b: "#f0ccc8", f: "#7a2a1a" };
  if (g.includes("高3")) return { b: "#c8c8f0", f: "#1a1a7a" };
  return { b: "#e8e8e8", f: "#444" };
}

export function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function sortSlots(arr) {
  const idx = Object.fromEntries(DAYS.map((d, i) => [d, i]));
  return [...arr].sort((a, b) => {
    const dd = idx[a.day] - idx[b.day];
    return dd || timeToMin(a.time.split("-")[0]) - timeToMin(b.time.split("-")[0]);
  });
}

export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const DEPARTMENTS = ["中学部", "高校部", "予備校部"];

export const DEPT_COLOR = {
  中学部: { b: "#d4e8d4", f: "#2a5a2a", accent: "#4a9a4a" },
  高校部: { b: "#f0e0c8", f: "#7a5a1a", accent: "#c08a2a" },
  予備校部: { b: "#cce0f0", f: "#1a4a6a", accent: "#3a8abe" },
};

export function gradeToDept(grade) {
  if (grade.includes("附中") || grade.includes("中")) return "中学部";
  if (grade.includes("高")) return "高校部";
  return null;
}

export const isKameiRoom = (room) => room?.startsWith("亀");

export const INIT_HOLIDAYS = [
  { date: "2026-04-29", label: "昭和の日", scope: ["全部"] },
  { date: "2026-05-03", label: "憲法記念日", scope: ["全部"] },
  { date: "2026-05-04", label: "みどりの日", scope: ["全部"] },
  { date: "2026-05-05", label: "こどもの日", scope: ["全部"] },
  { date: "2026-05-06", label: "振替休日", scope: ["全部"] },
  { date: "2026-07-20", label: "海の日", scope: ["全部"] },
  { date: "2026-08-11", label: "山の日", scope: ["全部"] },
  { date: "2026-09-21", label: "敬老の日", scope: ["全部"] },
  { date: "2026-09-23", label: "秋分の日", scope: ["全部"] },
  { date: "2026-10-12", label: "スポーツの日", scope: ["全部"] },
  { date: "2026-11-03", label: "文化の日", scope: ["全部"] },
  { date: "2026-11-23", label: "勤労感謝の日", scope: ["全部"] },
];

export const INIT_SLOTS = [
  // ── 中学 月曜 ──
  {id:1,day:"月",time:"18:55-19:40",grade:"中2",cls:"S/AB",room:"601",subj:"社会",teacher:"西岡",note:"合同"},
  {id:2,day:"月",time:"19:50-20:35",grade:"中2",cls:"S",room:"602",subj:"国語",teacher:"小松",note:""},
  {id:3,day:"月",time:"19:50-20:35",grade:"中2",cls:"AB",room:"601",subj:"英/数",teacher:"堀上",note:"隔週(河野)"},
  {id:4,day:"月",time:"19:50-20:35",grade:"中2",cls:"C",room:"603",subj:"数/英",teacher:"河野",note:"隔週(堀上)"},
  {id:5,day:"月",time:"20:45-21:30",grade:"中2",cls:"S",room:"602",subj:"英/数",teacher:"堀上",note:"隔週(河野)"},
  {id:6,day:"月",time:"20:45-21:30",grade:"中2",cls:"AB",room:"601",subj:"国語",teacher:"小松",note:"合同"},
  // ── 中学 火曜 中1 ──
  {id:7,day:"火",time:"18:55-19:40",grade:"中1",cls:"S/AB",room:"601",subj:"社会",teacher:"西岡",note:"合同"},
  {id:8,day:"火",time:"19:50-20:35",grade:"中1",cls:"S",room:"602",subj:"数学",teacher:"半田",note:""},
  {id:9,day:"火",time:"19:50-20:35",grade:"中1",cls:"AB",room:"601",subj:"英語",teacher:"堀上",note:""},
  {id:10,day:"火",time:"20:45-21:30",grade:"中1",cls:"S",room:"602",subj:"英語",teacher:"堀上",note:""},
  {id:11,day:"火",time:"20:45-21:30",grade:"中1",cls:"AB",room:"601",subj:"数学",teacher:"片岡",note:""},
  // ── 火曜 中3 ──
  {id:12,day:"火",time:"18:55-19:40",grade:"中3",cls:"SS",room:"505",subj:"英/数",teacher:"堀上",note:"隔週(半田)"},
  {id:13,day:"火",time:"18:55-19:40",grade:"中3",cls:"S",room:"501",subj:"数/英",teacher:"半田",note:"隔週(堀上)"},
  {id:14,day:"火",time:"18:55-19:40",grade:"中3",cls:"A",room:"502",subj:"国語",teacher:"松川",note:""},
  {id:15,day:"火",time:"18:55-19:40",grade:"中3",cls:"B",room:"503",subj:"社会",teacher:"井上",note:""},
  {id:16,day:"火",time:"18:55-19:40",grade:"中3",cls:"C",room:"504",subj:"数学",teacher:"香川",note:""},
  {id:17,day:"火",time:"19:50-20:35",grade:"中3",cls:"SS",room:"505",subj:"国語",teacher:"松川",note:""},
  {id:18,day:"火",time:"19:50-20:35",grade:"中3",cls:"S",room:"501",subj:"社会",teacher:"井上",note:""},
  {id:19,day:"火",time:"19:50-20:35",grade:"中3",cls:"A",room:"502",subj:"数/英",teacher:"香川",note:"隔週(高松)"},
  {id:20,day:"火",time:"19:50-20:35",grade:"中3",cls:"B",room:"503",subj:"英/数",teacher:"高松",note:"隔週(香川)"},
  {id:21,day:"火",time:"19:50-20:35",grade:"中3",cls:"C",room:"504",subj:"理科",teacher:"奥村",note:""},
  {id:22,day:"火",time:"20:45-21:30",grade:"中3",cls:"SS",room:"505",subj:"社会",teacher:"井上",note:""},
  {id:23,day:"火",time:"20:45-21:30",grade:"中3",cls:"S",room:"501",subj:"国語",teacher:"松川",note:""},
  {id:24,day:"火",time:"20:45-21:30",grade:"中3",cls:"A",room:"502",subj:"社会",teacher:"西岡",note:""},
  {id:25,day:"火",time:"20:45-21:30",grade:"中3",cls:"B",room:"503",subj:"理科",teacher:"奥村",note:""},
  {id:26,day:"火",time:"20:45-21:30",grade:"中3",cls:"C",room:"504",subj:"英語",teacher:"高松",note:""},
  // ── 水曜 中3水金 ──
  {id:27,day:"水",time:"18:55-19:40",grade:"中3",cls:"S",room:"501",subj:"数学",teacher:"片岡",note:""},
  {id:28,day:"水",time:"18:55-19:40",grade:"中3",cls:"A",room:"502",subj:"国語",teacher:"小松",note:""},
  {id:29,day:"水",time:"18:55-19:40",grade:"中3",cls:"B",room:"503",subj:"英語",teacher:"堀上",note:""},
  {id:30,day:"水",time:"19:50-20:35",grade:"中3",cls:"S",room:"501",subj:"社会",teacher:"井上",note:""},
  {id:31,day:"水",time:"19:50-20:35",grade:"中3",cls:"A",room:"502",subj:"英語",teacher:"堀上",note:""},
  {id:32,day:"水",time:"19:50-20:35",grade:"中3",cls:"B",room:"503",subj:"数学",teacher:"福武",note:""},
  {id:33,day:"水",time:"20:45-21:30",grade:"中3",cls:"S",room:"501",subj:"英語",teacher:"堀上",note:""},
  {id:34,day:"水",time:"20:45-21:30",grade:"中3",cls:"A",room:"502",subj:"数学",teacher:"福武",note:""},
  {id:35,day:"水",time:"20:45-21:30",grade:"中3",cls:"B",room:"503",subj:"社会",teacher:"井上",note:""},
  // ── 附中 ──
  {id:36,day:"水",time:"16:25-17:25",grade:"附中1",cls:"-",room:"401",subj:"理科",teacher:"武下",note:""},
  {id:37,day:"水",time:"16:25-17:25",grade:"附中2",cls:"-",room:"402",subj:"英語",teacher:"石原",note:""},
  {id:38,day:"水",time:"16:25-17:25",grade:"附中3",cls:"-",room:"403",subj:"数学",teacher:"片岡",note:""},
  {id:39,day:"水",time:"17:35-18:35",grade:"附中1",cls:"-",room:"401",subj:"英語",teacher:"石原",note:""},
  {id:40,day:"水",time:"17:35-18:35",grade:"附中2",cls:"-",room:"402",subj:"数学",teacher:"片岡",note:""},
  {id:41,day:"水",time:"17:35-18:35",grade:"附中3",cls:"-",room:"403",subj:"理科",teacher:"滝澤",note:""},
  {id:42,day:"水",time:"18:45-19:45",grade:"附中1",cls:"-",room:"401",subj:"国語",teacher:"松川",note:""},
  {id:43,day:"水",time:"18:45-19:45",grade:"附中2",cls:"-",room:"402",subj:"理科",teacher:"滝澤",note:""},
  {id:44,day:"水",time:"18:45-19:45",grade:"附中3",cls:"-",room:"403",subj:"英語",teacher:"石原",note:""},
  {id:45,day:"水",time:"19:55-20:55",grade:"附中1",cls:"-",room:"401",subj:"数学",teacher:"片岡",note:""},
  {id:46,day:"水",time:"19:55-20:55",grade:"附中2",cls:"-",room:"402",subj:"国語",teacher:"小松",note:""},
  {id:47,day:"水",time:"19:55-20:55",grade:"附中3",cls:"-",room:"403",subj:"国語",teacher:"松川",note:""},
  // ── 木曜 中2 ──
  {id:48,day:"木",time:"18:55-19:40",grade:"中2",cls:"S/AB",room:"601",subj:"理科",teacher:"小見山",note:"合同"},
  {id:49,day:"木",time:"19:50-20:35",grade:"中2",cls:"S",room:"602",subj:"英語",teacher:"堀上",note:""},
  {id:50,day:"木",time:"19:50-20:35",grade:"中2",cls:"AB",room:"601",subj:"数学",teacher:"奥村",note:""},
  {id:51,day:"木",time:"19:50-20:35",grade:"中2",cls:"C",room:"603",subj:"英語",teacher:"高松",note:""},
  {id:52,day:"木",time:"20:45-21:30",grade:"中2",cls:"S",room:"602",subj:"数学",teacher:"半田",note:""},
  {id:53,day:"木",time:"20:45-21:30",grade:"中2",cls:"AB",room:"601",subj:"英語",teacher:"堀上",note:""},
  {id:54,day:"木",time:"20:45-21:30",grade:"中2",cls:"C",room:"603",subj:"数学",teacher:"奥村",note:""},
  // ── 木曜 中3 ──
  {id:55,day:"木",time:"18:55-19:40",grade:"中3",cls:"SS",room:"505",subj:"数学",teacher:"半田",note:""},
  {id:56,day:"木",time:"18:55-19:40",grade:"中3",cls:"S",room:"501",subj:"英語",teacher:"堀上",note:""},
  {id:57,day:"木",time:"18:55-19:40",grade:"中3",cls:"A",room:"502",subj:"英語",teacher:"石原",note:""},
  {id:58,day:"木",time:"18:55-19:40",grade:"中3",cls:"B",room:"503",subj:"国語",teacher:"松川",note:""},
  {id:59,day:"木",time:"18:55-19:40",grade:"中3",cls:"C",room:"504",subj:"英/数",teacher:"南條",note:"隔週(江本)"},
  {id:60,day:"木",time:"19:50-20:35",grade:"中3",cls:"SS",room:"505",subj:"英語",teacher:"石原",note:""},
  {id:61,day:"木",time:"19:50-20:35",grade:"中3",cls:"S",room:"501",subj:"理科",teacher:"滝澤",note:""},
  {id:62,day:"木",time:"19:50-20:35",grade:"中3",cls:"A",room:"502",subj:"数学",teacher:"福武",note:""},
  {id:63,day:"木",time:"19:50-20:35",grade:"中3",cls:"B",room:"503",subj:"数学",teacher:"江本",note:""},
  {id:64,day:"木",time:"19:50-20:35",grade:"中3",cls:"C",room:"504",subj:"社会",teacher:"野口",note:""},
  {id:65,day:"木",time:"20:45-21:30",grade:"中3",cls:"SS",room:"505",subj:"理科",teacher:"滝澤",note:""},
  {id:66,day:"木",time:"20:45-21:30",grade:"中3",cls:"S",room:"501",subj:"数学",teacher:"福武",note:""},
  {id:67,day:"木",time:"20:45-21:30",grade:"中3",cls:"A",room:"502",subj:"理科",teacher:"小見山",note:""},
  {id:68,day:"木",time:"20:45-21:30",grade:"中3",cls:"B",room:"503",subj:"英語",teacher:"高松",note:""},
  {id:69,day:"木",time:"20:45-21:30",grade:"中3",cls:"C",room:"504",subj:"国語",teacher:"松川",note:""},
  // ── 金曜 中1 ──
  {id:70,day:"金",time:"18:55-19:40",grade:"中1",cls:"S/AB",room:"601",subj:"理科",teacher:"滝澤",note:"合同"},
  {id:71,day:"金",time:"19:50-20:35",grade:"中1",cls:"S",room:"602",subj:"英/数",teacher:"堀上",note:"隔週(川井)"},
  {id:72,day:"金",time:"19:50-20:35",grade:"中1",cls:"AB",room:"601",subj:"数/英",teacher:"川井",note:"隔週(堀上)"},
  {id:73,day:"金",time:"20:45-21:30",grade:"中1",cls:"S/AB",room:"601",subj:"国語",teacher:"松川",note:"合同"},
  // ── 金曜 中3水金 ──
  {id:74,day:"金",time:"18:55-19:40",grade:"中3",cls:"S",room:"501",subj:"英/数",teacher:"堀上",note:"隔週(川井)"},
  {id:75,day:"金",time:"18:55-19:40",grade:"中3",cls:"A",room:"502",subj:"理科",teacher:"河野",note:""},
  {id:76,day:"金",time:"18:55-19:40",grade:"中3",cls:"B",room:"503",subj:"国語",teacher:"松川",note:""},
  {id:77,day:"金",time:"19:50-20:35",grade:"中3",cls:"S",room:"501",subj:"国語",teacher:"松川",note:""},
  {id:78,day:"金",time:"19:50-20:35",grade:"中3",cls:"A",room:"502",subj:"社会",teacher:"野口",note:""},
  {id:79,day:"金",time:"19:50-20:35",grade:"中3",cls:"B",room:"503",subj:"理科",teacher:"河野",note:""},
  {id:80,day:"金",time:"20:45-21:30",grade:"中3",cls:"S",room:"501",subj:"理科",teacher:"滝澤",note:""},
  {id:81,day:"金",time:"20:45-21:30",grade:"中3",cls:"A",room:"502",subj:"英/数",teacher:"堀上",note:"隔週(福江)"},
  {id:82,day:"金",time:"20:45-21:30",grade:"中3",cls:"B",room:"503",subj:"数/英",teacher:"福江",note:"隔週(堀上)"},
  // ── 高校 月 ──
  {id:100,day:"月",time:"19:00-20:20",grade:"高2",cls:"",room:"亀21",subj:"東大京大医進 英語",teacher:"冨田",note:""},
  {id:101,day:"月",time:"19:00-20:20",grade:"高2",cls:"",room:"亀62",subj:"高松高 文系数学",teacher:"南條",note:""},
  {id:102,day:"月",time:"19:00-20:20",grade:"高2",cls:"",room:"亀63",subj:"高松高 理系数学",teacher:"南條",note:""},
  {id:103,day:"月",time:"19:40-20:40",grade:"高1",cls:"",room:"亀21",subj:"高松西 数学",teacher:"杉原",note:""},
  {id:104,day:"月",time:"19:40-20:40",grade:"高2",cls:"",room:"亀63",subj:"高松西 英語",teacher:"久保井",note:""},
  {id:105,day:"月",time:"19:40-20:40",grade:"高1",cls:"",room:"401",subj:"高松一 英語",teacher:"石原",note:""},
  {id:106,day:"月",time:"19:40-20:40",grade:"高2",cls:"",room:"402",subj:"高松桜井 数学",teacher:"小見山",note:""},
  {id:107,day:"月",time:"20:50-21:50",grade:"高1",cls:"",room:"亀21",subj:"高松西 英語",teacher:"久保井",note:""},
  {id:108,day:"月",time:"20:50-21:50",grade:"高1",cls:"",room:"亀21",subj:"高松西 文系数学",teacher:"杉原",note:""},
  {id:109,day:"月",time:"20:50-21:50",grade:"高1",cls:"",room:"亀21",subj:"高松西 理系数学",teacher:"香川",note:""},
  {id:110,day:"月",time:"20:50-21:50",grade:"高1",cls:"",room:"401",subj:"高松一 数学",teacher:"小見山",note:""},
  {id:111,day:"月",time:"20:50-21:50",grade:"高2",cls:"",room:"402",subj:"高松桜井 英語",teacher:"石原",note:""},
  // ── 高校 火 ──
  {id:120,day:"火",time:"19:00-20:20",grade:"高2",cls:"",room:"亀62",subj:"高松一 文系数学",teacher:"半田",note:""},
  {id:121,day:"火",time:"19:00-20:20",grade:"高2",cls:"",room:"亀62",subj:"高松一 物理",teacher:"白川",note:""},
  {id:122,day:"火",time:"19:00-20:20",grade:"高1",cls:"",room:"亀21",subj:"東大京大医進 英語",teacher:"大前",note:""},
  {id:123,day:"火",time:"19:00-20:20",grade:"高1",cls:"",room:"亀21",subj:"高松高 数学",teacher:"久保井",note:""},
  {id:124,day:"火",time:"19:40-20:40",grade:"高1",cls:"",room:"401",subj:"高松一 英語",teacher:"石原",note:""},
  {id:130,day:"火",time:"19:00-20:20",grade:"高3",cls:"",room:"701",subj:"岡広大 英語",teacher:"伊藤",note:""},
  {id:131,day:"火",time:"19:00-20:20",grade:"高3",cls:"",room:"703",subj:"旧帝大 国語",teacher:"井口",note:""},
  {id:132,day:"火",time:"19:00-20:20",grade:"高3",cls:"",room:"702",subj:"共テ英語(St)",teacher:"今津",note:""},
  {id:133,day:"火",time:"19:00-20:20",grade:"高3",cls:"",room:"亀41",subj:"東大京大医進 英語",teacher:"長尾",note:""},
  {id:134,day:"火",time:"19:00-20:20",grade:"高3",cls:"",room:"亀42",subj:"阪大神大 文系数学",teacher:"石川",note:""},
  {id:135,day:"火",time:"19:00-20:20",grade:"高3",cls:"",room:"亀43",subj:"阪大神大 理系数学",teacher:"大前",note:""},
  {id:136,day:"火",time:"19:40-20:40",grade:"高3",cls:"",room:"701",subj:"旧帝大 英語",teacher:"伊藤",note:""},
  {id:137,day:"火",time:"19:40-20:40",grade:"高3",cls:"",room:"703",subj:"岡広大 理系数学",teacher:"片岡",note:""},
  // ── 高校 水 ──
  {id:140,day:"水",time:"19:00-20:20",grade:"高2",cls:"",room:"407",subj:"高松一 英語選抜",teacher:"伊藤",note:""},
  {id:141,day:"水",time:"19:00-20:20",grade:"高2",cls:"",room:"404",subj:"高松一 英語",teacher:"今津",note:""},
  {id:142,day:"水",time:"19:00-20:20",grade:"高2",cls:"",room:"405",subj:"高松一 物理",teacher:"白川",note:""},
  {id:143,day:"水",time:"19:40-20:40",grade:"高2",cls:"",room:"405",subj:"高松桜井 文系数学",teacher:"半田",note:""},
  {id:144,day:"水",time:"19:40-20:40",grade:"高2",cls:"",room:"406",subj:"高松桜井 理系数学",teacher:"石川",note:""},
  {id:145,day:"水",time:"20:50-21:50",grade:"高2",cls:"",room:"405",subj:"高松一 理系数学",teacher:"半田",note:""},
  {id:146,day:"水",time:"20:50-21:50",grade:"高2",cls:"",room:"406",subj:"高松桜井 英語",teacher:"石原",note:""},
  {id:150,day:"水",time:"19:00-20:20",grade:"高3",cls:"",room:"703",subj:"関関同立 英語",teacher:"道久",note:""},
  {id:151,day:"水",time:"19:00-20:20",grade:"高3",cls:"",room:"701",subj:"共テ英語(Hi)",teacher:"伊藤",note:""},
  {id:152,day:"水",time:"19:00-20:20",grade:"高3",cls:"",room:"702",subj:"共テ数IA(St)",teacher:"加藤",note:""},
  {id:153,day:"水",time:"19:00-20:20",grade:"高3",cls:"",room:"704",subj:"共テ生物",teacher:"福江",note:""},
  {id:154,day:"水",time:"19:00-20:20",grade:"高3",cls:"",room:"亀41",subj:"東大京大医進 化学",teacher:"滝澤",note:""},
  {id:155,day:"水",time:"19:40-20:40",grade:"高3",cls:"",room:"703",subj:"関関同立 現古",teacher:"仙波",note:""},
  {id:156,day:"水",time:"19:40-20:40",grade:"高3",cls:"",room:"702",subj:"共テ物理",teacher:"白川",note:""},
  {id:157,day:"水",time:"20:50-21:50",grade:"高3",cls:"",room:"701",subj:"共テ数IIBC(St)",teacher:"石川",note:""},
  // ── 高校 木 ──
  {id:160,day:"木",time:"19:40-20:40",grade:"高1",cls:"",room:"401",subj:"高松一 英語",teacher:"伊藤",note:""},
  {id:161,day:"木",time:"19:40-20:40",grade:"高1",cls:"",room:"402",subj:"高松桜井 数学",teacher:"片岡",note:""},
  {id:162,day:"木",time:"19:40-20:40",grade:"高2",cls:"",room:"403",subj:"古文漢文",teacher:"仙波",note:""},
  {id:163,day:"木",time:"19:40-20:40",grade:"高1",cls:"",room:"亀21",subj:"高松西 数学",teacher:"石川",note:""},
  {id:164,day:"木",time:"19:40-20:40",grade:"高2",cls:"",room:"亀63",subj:"高松西 英語",teacher:"藤本",note:""},
  {id:165,day:"木",time:"20:50-21:50",grade:"高1",cls:"",room:"401",subj:"高松一 数学",teacher:"片岡",note:""},
  {id:166,day:"木",time:"20:50-21:50",grade:"高1",cls:"",room:"402",subj:"高松桜井 英語",teacher:"石原",note:""},
  {id:167,day:"木",time:"20:50-21:50",grade:"高1",cls:"",room:"亀21",subj:"高松西 英語",teacher:"藤本",note:""},
  {id:168,day:"木",time:"20:50-21:50",grade:"高2",cls:"",room:"亀62",subj:"高松西 文系数学",teacher:"河野",note:""},
  {id:169,day:"木",time:"20:50-21:50",grade:"高2",cls:"",room:"亀63",subj:"高松西 理系数学",teacher:"石川",note:""},
  {id:170,day:"木",time:"19:00-20:20",grade:"高3",cls:"",room:"701",subj:"共テ世界史",teacher:"妻鹿",note:""},
  {id:171,day:"木",time:"19:00-20:20",grade:"高3",cls:"",room:"702",subj:"共テ日本史",teacher:"野口",note:""},
  {id:172,day:"木",time:"19:00-20:20",grade:"高3",cls:"",room:"703",subj:"共テ地理",teacher:"大島",note:""},
  {id:173,day:"木",time:"19:00-20:20",grade:"高3",cls:"",room:"亀41",subj:"東大京大医進 英語",teacher:"長尾",note:""},
  {id:174,day:"木",time:"19:00-20:20",grade:"高3",cls:"",room:"亀42",subj:"阪大神大 文系数学",teacher:"本多",note:""},
  {id:175,day:"木",time:"19:00-20:20",grade:"高3",cls:"",room:"亀43",subj:"阪大神大 理系数学",teacher:"冨田",note:""},
  {id:176,day:"木",time:"19:40-20:40",grade:"高3",cls:"",room:"701",subj:"共テ数IA(Hi)",teacher:"半田",note:""},
  {id:177,day:"木",time:"19:40-20:40",grade:"高3",cls:"",room:"亀41",subj:"阪大神大 英語",teacher:"長尾",note:""},
  {id:178,day:"木",time:"19:40-20:40",grade:"高3",cls:"",room:"亀42",subj:"東大京大 文系数学",teacher:"本多",note:""},
  {id:179,day:"木",time:"19:40-20:40",grade:"高3",cls:"",room:"亀43",subj:"東大京大医進 理系数学",teacher:"冨田",note:""},
  {id:180,day:"木",time:"20:50-21:50",grade:"高3",cls:"",room:"701",subj:"共テ国語(現)",teacher:"竹内",note:""},
  // ── 高校 金 ──
  {id:190,day:"金",time:"19:00-20:20",grade:"高1",cls:"",room:"404",subj:"高松一 文系数学",teacher:"片岡",note:""},
  {id:191,day:"金",time:"19:00-20:20",grade:"高1",cls:"",room:"405",subj:"高松一 化学",teacher:"十川",note:""},
  {id:192,day:"金",time:"19:00-20:20",grade:"高1",cls:"",room:"亀42",subj:"東大京大医進 英語",teacher:"藤本",note:""},
  {id:193,day:"金",time:"19:00-20:20",grade:"高1",cls:"",room:"亀43",subj:"高松高 数学",teacher:"大前",note:""},
  {id:194,day:"金",time:"19:00-20:20",grade:"高2",cls:"",room:"亀21",subj:"東大京大医進 英語",teacher:"本澤",note:""},
  {id:195,day:"金",time:"19:00-20:20",grade:"高2",cls:"",room:"亀62",subj:"高松高 文系数学",teacher:"福武",note:""},
  {id:196,day:"金",time:"19:00-20:20",grade:"高2",cls:"",room:"亀65",subj:"高松高 理系数学",teacher:"本多",note:""},
  {id:197,day:"金",time:"19:40-20:40",grade:"高2",cls:"",room:"404",subj:"高松一 英語",teacher:"池内",note:""},
  {id:198,day:"金",time:"19:40-20:40",grade:"高2",cls:"",room:"405",subj:"高松桜井 文系数学",teacher:"奥村",note:""},
  {id:199,day:"金",time:"19:40-20:40",grade:"高2",cls:"",room:"406",subj:"高松桜井 理系数学",teacher:"片岡",note:""},
  {id:200,day:"金",time:"20:50-21:50",grade:"高1",cls:"",room:"亀42",subj:"東大京大医進 数学",teacher:"大前",note:""},
  {id:201,day:"金",time:"20:50-21:50",grade:"高1",cls:"",room:"亀43",subj:"高松高 英語",teacher:"藤本",note:""},
  {id:202,day:"金",time:"20:50-21:50",grade:"高2",cls:"",room:"亀21",subj:"東大京大医進 理系数学",teacher:"本多",note:""},
  {id:203,day:"金",time:"20:50-21:50",grade:"高2",cls:"",room:"亀62",subj:"東大京大 文系数学",teacher:"本多",note:""},
  {id:204,day:"金",time:"20:50-21:50",grade:"高2",cls:"",room:"亀65",subj:"高松高 英語",teacher:"本澤",note:""},
  {id:205,day:"金",time:"20:50-21:50",grade:"高2",cls:"",room:"405",subj:"高松一 理系数学",teacher:"奥村",note:""},
  {id:206,day:"金",time:"20:50-21:50",grade:"高2",cls:"",room:"406",subj:"高松桜井 英語",teacher:"石原",note:""},
  {id:210,day:"金",time:"19:00-20:20",grade:"高3",cls:"",room:"701",subj:"共テ英語(Hi)",teacher:"伊藤",note:""},
  {id:211,day:"金",time:"19:00-20:20",grade:"高3",cls:"",room:"702",subj:"共テ英語(St)",teacher:"池内",note:""},
  {id:212,day:"金",time:"19:00-20:20",grade:"高3",cls:"",room:"亀41",subj:"東大京大 国語",teacher:"井口",note:""},
  {id:213,day:"金",time:"19:40-20:40",grade:"高3",cls:"",room:"701",subj:"共テ化学",teacher:"十川",note:""},
  {id:214,day:"金",time:"20:50-21:50",grade:"高3",cls:"",room:"701",subj:"共テ数IIBC(Hi)",teacher:"片岡",note:""},
  {id:215,day:"金",time:"20:50-21:50",grade:"高3",cls:"",room:"702",subj:"共テ国語(古漢)",teacher:"竹内",note:""},
  // ── 土 ──
  {id:220,day:"土",time:"19:00-20:20",grade:"高2",cls:"",room:"亀62",subj:"高松高 物理",teacher:"白川",note:""},
  {id:221,day:"土",time:"19:40-20:40",grade:"高2",cls:"",room:"亀62",subj:"高松高 化学",teacher:"武下",note:""},
  {id:222,day:"土",time:"19:00-20:20",grade:"高3",cls:"",room:"亀63",subj:"Speaking/Listening",teacher:"本澤",note:""},
  {id:223,day:"土",time:"19:00-20:20",grade:"高3",cls:"",room:"亀43",subj:"共テ化学",teacher:"武下",note:""},
  {id:224,day:"土",time:"19:40-20:40",grade:"高3",cls:"",room:"亀63",subj:"共テ英語(Hi)",teacher:"南條",note:""},
  {id:225,day:"土",time:"19:40-20:40",grade:"高3",cls:"",room:"亀43",subj:"共テ数IAIIBC(St)",teacher:"石川",note:""},
  {id:226,day:"土",time:"19:40-20:40",grade:"高3",cls:"",room:"亀42",subj:"共テ国語(現古漢)",teacher:"松川",note:""},
  {id:227,day:"土",time:"19:40-20:40",grade:"高3",cls:"",room:"亀41",subj:"共テ物理",teacher:"白川",note:""},
  {id:228,day:"土",time:"20:50-21:50",grade:"高3",cls:"",room:"亀63",subj:"共テ英語(St)",teacher:"南條",note:""},
  {id:229,day:"土",time:"20:50-21:50",grade:"高3",cls:"",room:"亀43",subj:"共テ数IAIIBC(Hi)",teacher:"石川",note:""},
];
