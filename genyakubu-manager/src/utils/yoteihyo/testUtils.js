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

export const BLACK = "#000000";
export const TEST_GREEN = "#c5e0b4";
export const PALE_GREEN = "#e2f0d9";

// 10〜11 月の中1・中2 の予定表 (形は 2026 年度の「T1T2」を写したもの。中身は作りもの)。
// 月のブロック = [日][曜日][中1 (5 列)][中2 (5 列)]。記号は 中1 ■ 本科 (火金)・
// ◇ 附中 (水)、中2 □ 本科 (月木)・◆ 附中 (水)、☆ プレップ (土。2 つの欄をまたぐ)。
// 日曜と 10/12 (スポーツの日) は曜日の欄が黒。
//   - 10/17 (土) は ☆ の欄に「※」(プレップ休校。備考にも書く)
//   - 11/4 (水) は中2 の欄に「※」(中2 附中の休講)
//   - 11/9 (月) の中2 本科を 11/6 (金) へ振替 (黄色。備考「中2本科：11/9(月)の授業を11/6(金)に振替」)
//   - 10/20 (火) の中1 の欄は緑 (凡例: 公立中学校定期テスト)、11/25 (水) は凡例に無い薄い緑
//   - 表の外に「☆9」の書き残し
// wrongWeekday: 11 月のブロックの曜日を前の年のまま (1 日ずれ) にする
export function smallT1T2Sheet({ name = "T1T2", year = 2026, wrongWeekday = false } = {}) {
  return makeSheet(name, (s) => {
    s.set(
      0,
      0,
      `${year}年度【中1・中2ゼミ】 10月～11月予定表\u3000\u3000中1…■：本科，◇：附中\u3000\u3000\u3000中2…□：本科，◆：附中\u3000\u3000\u3000☆：プレップ（個別指導）`
    );
    s.merge(0, 0, 1, 23);
    const counters = {};
    const next = (k) => (counters[k] = (counters[k] || 0) + 1);
    const blocks = [
      { dayCol: 0, month: 10 },
      { dayCol: 12, month: 11 },
    ];
    for (const b of blocks) {
      const g1 = b.dayCol + 2;
      const g2 = b.dayCol + 7;
      s.set(2, b.dayCol, `${b.month}月`);
      s.merge(2, b.dayCol, 2, b.dayCol + 11);
      s.set(3, b.dayCol, "学年");
      s.set(3, g1, "中1");
      s.merge(3, g1, 3, g1 + 4);
      s.set(3, g2, "中2");
      s.merge(3, g2, 3, g2 + 4);
      const map = s.month({
        year,
        month: b.month,
        dayCol: b.dayCol,
        firstRow: 4,
        wrongWeekday: wrongWeekday && b.month === 11,
      });
      for (const [iso, r] of map) {
        const wd = weekdayIndexOf(iso);
        const md = iso.slice(5);
        const cell = (c, v, fill = null) => {
          s.set(r, c, v, fill);
          s.merge(r, c, r, c + 4);
        };
        if (wd === 0 || md === "10-12") {
          s.set(r, b.dayCol + 1, "日月火水木金土"[wd], BLACK);
          continue;
        }
        if (md === "11-09") continue; // 中2 本科は 11/6 へ振替
        if (wd === 6) {
          if (md === "10-17") s.set(r, g1, "※");
          else s.set(r, g1, `☆ ${next("☆")}`);
          s.merge(r, g1, r, g2 + 4);
          continue;
        }
        if (wd === 2 || wd === 5) cell(g1, `\u3000\u3000■${next("■")}  英①`, md === "10-20" ? TEST_GREEN : null);
        if (wd === 3) cell(g1, `\u3000\u3000◇${next("◇")}  数②`, md === "11-25" ? PALE_GREEN : null);
        if (wd === 1 || wd === 4) cell(g2, `\u3000\u3000□${next("□")}  国③`);
        if (md === "11-06") cell(g2, `\u3000\u3000□${next("□")}  理④`, YELLOW);
        if (wd === 3) {
          if (md === "11-04") cell(g2, "※");
          else cell(g2, `\u3000\u3000◆${next("◆")}  社⑤`);
        }
      }
    }
    // 備考と凡例 (日付の行の下)
    s.set(36, 0, "備\u3000\u3000考");
    s.merge(36, 0, 43, 1);
    s.set(36, 2, "\u3000プレップ：10/17(土) 休校");
    s.set(36, 14, "\u3000中2本科：11/9(月)の授業を11/6(金)に振替");
    s.set(37, 14, "\u3000＜ゼミ終講日＞");
    s.set(38, 15, "中1本科：11/27(金)");
    s.set(40, 2, "※予定に変更がある場合，担任からお知らせします。");
    for (const c of [2, 3, 4]) s.set(42, c, null, TEST_GREEN);
    s.set(42, 5, "公立中学校定期テスト(標準日)");
    s.set(47, 6, "☆9");
  });
}
