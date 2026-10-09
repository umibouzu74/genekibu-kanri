// テスト用: 予定表の形をしたシート ({ name, rows, merges }) を組み立てる。
// 学校の予定表そのものは使わず、形 (月のブロック・見出し・記号・塗り) だけ
// 写した小さな表を作る。

const WD = "日月火水木金土";

export const GRAY = "#969696";
export const YELLOW = "#ffff00";
export const RED = "#ff8080";

export function makeSheet(name, build) {
  const rows = [];
  const merges = [];
  const put = (r, c, cell) => {
    (rows[r] || (rows[r] = []))[c] = cell;
  };
  const api = {
    /** 文字 (string) / 数 (number) / 日付 ({date}) / 色だけ (null + fill) */
    set(r, c, v, fill = null) {
      if (v == null) put(r, c, { t: "z", v: null, fill });
      else if (typeof v === "number") put(r, c, { t: "n", v, fill });
      else if (typeof v === "object" && v.date) put(r, c, { t: "n", v: 0, fill, date: v.date });
      else put(r, c, { t: "s", v: String(v), fill });
    },
    merge(r0, c0, r1, c1) {
      merges.push({ r0, c0, r1, c1 });
    },
    /**
     * 月のブロックを書く: dayCol に日、dayCol+1 に曜日。label があれば
     * labelRow に「N月」。日付 → 行 の Map を返す。
     */
    month({ year, month, dayCol, firstRow, labelRow = null, wrongWeekday = false, dateCellOnFirst = false }) {
      if (labelRow != null) api.set(labelRow, dayCol, `${month}月`);
      const out = new Map();
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let d = 1; d <= days; d++) {
        const r = firstRow + d - 1;
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
        if (dateCellOnFirst && d === 1) api.set(r, dayCol, { date: iso });
        else api.set(r, dayCol, d);
        api.set(r, dayCol + 1, WD[(wd + (wrongWeekday ? 6 : 0)) % 7]);
        out.set(iso, r);
      }
      return out;
    },
  };
  build(api);
  return { name, rows, merges };
}

export function weekdayIndexOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 10〜11 月の高1・高2 の予定表。講座は 高1 高松西高校 (月木) と 高2 古文・漢文 (木)。
// 2026 年は 10/12 スポーツの日・11/9 休校・10/15 灰色 (休講)・11/6 振替 (黄色、
// 注記「←11/9(月)の振替→」)。withMove: false で 11/6 の振替を描かない
export function smallH12Sheet({ name = "2026\u3000H1H2【10-11月】教員用", year = 2026, withMove = true } = {}) {
  return makeSheet(name, (s) => {
    s.set(1, 1, `${year}年度\u3000【高1・高2ゼミ】\u300010月～11月予定表`);
    const blocks = [
      { dayCol: 1, month: 10 },
      { dayCol: 6, month: 11 },
    ];
    for (const b of blocks) {
      const c0 = b.dayCol + 2;
      s.set(4, c0, "高1");
      s.set(4, c0 + 1, "高2");
      s.set(6, c0, "高松西高校");
      s.set(6, c0 + 1, "古文・漢文");
      const map = s.month({ year, month: b.month, dayCol: b.dayCol, firstRow: 7, labelRow: 3 });
      for (const [iso, r] of map) {
        const wd = weekdayIndexOf(iso);
        const md = iso.slice(5);
        if (md === "10-12" || md === "11-09") {
          s.set(r, c0, md === "10-12" ? "スポーツの日" : "休校", RED);
          s.set(r, c0 + 1, null, RED);
          s.merge(r, c0, r, c0 + 1);
          continue;
        }
        if (wd === 1 || wd === 4) s.set(r, c0, "●", md === "10-15" ? GRAY : null);
        if (wd === 4) s.set(r, c0 + 1, "◇");
        if (withMove && md === "11-06") {
          s.set(r, c0, "●", YELLOW);
          s.set(r, c0 + 1, "←11/9(月)の振替→");
        }
      }
    }
  });
}

export const SMALL_SLOTS = [
  { id: 1, day: "月", time: "19:40-20:40", grade: "高1", subj: "高松西 数学", room: "701", teacher: "A" },
  { id: 2, day: "木", time: "19:40-20:40", grade: "高1", subj: "高松西 英語", room: "701", teacher: "B" },
  { id: 3, day: "木", time: "19:40-20:40", grade: "高2", subj: "古文漢文", room: "702", teacher: "C" },
  { id: 4, day: "木", time: "20:50-21:50", grade: "高2", subj: "高松西 英語", room: "703", teacher: "D" },
  { id: 5, day: "木", time: "19:50-20:35", grade: "中2", cls: "S", subj: "数学", room: "601", teacher: "E" },
];
