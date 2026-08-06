// ─── 本体の時間割 → RegularProject 変換 (反映の逆方向) ──────────────
// 本体の Slot 群 (指定 timetableId のもの) を通常時間割作成のプロジェクト
// に変換する。既存の時間割を下書きとして取り込み、期切替の編集を
// グリッド上で行うための入口。
//
// 変換規則:
// - 時限プール: 出現する時刻文字列 (distinct) を開始時刻順に並べる。
//   ラベルは空 (グリッドには時刻がそのまま出る)
// - タブ: 学年 (slot.grade) ごとに 1 タブ。並びは ALL_GRADES 順 → その他は
//   出現順
// - クラス列: 学年内の cls (distinct) を出現順に。同じ (曜日 × 時限 ×
//   cls) に複数コマがある場合 (確認テストの並列監督や高3 の選択講座) は
//   同じキーの列を追加して振り分ける — 結合せず、反映で元通りの複数
//   コマに戻る
// - クラス名の無いコマ (高校の講座など) は教室が列の唯一の同一性なので、
//   教室ごとに列を分け、列は教室番号順に並べる。先着順の振り分けだと
//   「404 列に 407 のコマ」「既定教室 405 の列が 2 本」のような取込結果
//   になっていた (2026-08-06)
// - 列の既定教室 = その列のセルで最頻の教室。セルには既定と違う場合のみ
//   教室を書く

import { ALL_GRADES } from "../constants/schools";
import { timeStartToMin } from "../utils/dateHelpers";
import { splitTeacherField } from "../utils/biweekly";
import {
  createDefaultProject,
  isAnnexRoom,
  makeCellKey,
  parseCellKey,
  REGULAR_DAYS,
} from "./model";

const WEEKEND_DAYS = new Set(["土", "日"]);

// 取込時のグループ名 (曜日ビューのセクション) 自動設定。単一学年
// (ALL_GRADES) のみ対象 — 「中1-3」「高1高2」のような特設タブは空のまま
// (時限セットの包含関係による自動同居に任せる)。学年設定でいつでも変更可。
const autoGroup = (grade, suffixes) => {
  if (!ALL_GRADES.includes(grade)) return "";
  if (grade.startsWith("附")) return "附属";
  if (grade.startsWith("中")) return "中学部";
  if (grade.startsWith("高"))
    return suffixes.includes("亀") ? "高校部・亀井町" : "高校部・本校";
  return "";
};

/**
 * @param {string} name プロジェクト名
 * @param {import("../types").Slot[]} allSlots 本体の全コマ
 * @param {number} timetableId 取込元の時間割 id
 * @param {{splitWeekend?: boolean, splitBuilding?: boolean}} [opts]
 *   splitWeekend: 平日と土日の両方にコマがある学年を「中3」「中3 (土)」の
 *   2 タブに分ける (時刻体系が曜日で違う学年のグリッドが締まる)。
 *   splitBuilding: 教室が「亀◯◯」(亀井町) のコマとそれ以外の両方がある
 *   学年を「高2」「高2 (亀)」に分ける (曜日ビューで本校と亀井町が別
 *   セクションに分かれ、ダッシュボードと同じ構図になる)
 * @returns {{project: object, stats: {slotCount: number, tabCount: number, parallelColumns: number}}}
 */
export function buildProjectFromSlots(name, allSlots, timetableId, opts = {}) {
  const slots = (allSlots || []).filter(
    (s) => (s.timetableId ?? 1) === timetableId
  );

  const project = { ...createDefaultProject(), name };

  // 時限プール (開始時刻順)
  const times = [...new Set(slots.map((s) => (s.time || "").trim()).filter(Boolean))];
  times.sort((a, b) => timeStartToMin(a) - timeStartToMin(b) || a.localeCompare(b));
  project.periods = times.map((time, i) => ({ id: i + 1, label: "", time }));
  const periodIdByTime = new Map(project.periods.map((p) => [p.time, p.id]));

  // 講師・科目マスタ (出現順)
  const teacherNames = new Set();
  const subjects = new Set();
  for (const s of slots) {
    for (const n of splitTeacherField(s.teacher)) teacherNames.add(n);
    if ((s.subj || "").trim()) subjects.add(s.subj.trim());
  }
  project.teachers = [...teacherNames].sort().map((n) => ({ name: n }));
  project.subjects = [...subjects];

  // 学年 → タブ (ALL_GRADES 順 → その他は出現順)。splitWeekend 時は
  // 平日と土日の両方がある学年を 2 タブに分ける
  const gradesInData = [...new Set(slots.map((s) => s.grade))];
  const ordered = [
    ...ALL_GRADES.filter((g) => gradesInData.includes(g)),
    ...gradesInData.filter((g) => !ALL_GRADES.includes(g)),
  ];
  const tabSpecs = []; // {name, grade, slots}
  for (const grade of ordered) {
    const gradeSlots = slots.filter((s) => s.grade === grade);
    // 建物 (亀井町) → 平日/土日 の順に分割し、両方に該当すれば
    // 「高2 (亀・土)」のようにサフィックスを連結する
    let buckets = [{ suffixes: [], slots: gradeSlots }];
    if (opts.splitBuilding) {
      buckets = buckets.flatMap((b) => {
        const main = b.slots.filter((s) => !isAnnexRoom(s.room));
        const annex = b.slots.filter((s) => isAnnexRoom(s.room));
        if (!main.length || !annex.length) return [b];
        return [
          { suffixes: [...b.suffixes], slots: main },
          { suffixes: [...b.suffixes, "亀"], slots: annex },
        ];
      });
    }
    if (opts.splitWeekend) {
      buckets = buckets.flatMap((b) => {
        const weekday = b.slots.filter((s) => !WEEKEND_DAYS.has(s.day));
        const weekend = b.slots.filter((s) => WEEKEND_DAYS.has(s.day));
        if (!weekday.length || !weekend.length) return [b];
        const wk = weekend.some((s) => s.day === "日") ? "土日" : "土";
        return [
          { suffixes: [...b.suffixes], slots: weekday },
          { suffixes: [...b.suffixes, wk], slots: weekend },
        ];
      });
    }
    for (const b of buckets) {
      tabSpecs.push({
        name: b.suffixes.length ? `${grade} (${b.suffixes.join("・")})` : grade,
        grade,
        group: autoGroup(grade, b.suffixes),
        slots: b.slots,
      });
    }
  }

  let parallelColumns = 0;
  project.tabs = tabSpecs.map(({ name: tabName, grade, group, slots: gs }, tabIdx) => {
    const days = REGULAR_DAYS.filter((d) => gs.some((s) => s.day === d));
    const periodIds = project.periods
      .filter((p) => gs.some((s) => (s.time || "").trim() === p.time))
      .map((p) => p.id);

    // クラス列: 出現順。衝突時は同キーの列を直後に追加して振り分ける。
    // クラス名の無いコマは教室が列の同一性なので、キーに教室を使う —
    // ラベルだけで振り分けると別教室の講座が同じ列に混ざり、列見出し
    // (既定教室) と中身が食い違う
    const classes = []; // {id, label, room(後で決定), _key, _cells: Map<posKey, cell>}
    let nextClassId = 1;
    const posKey = (day, periodId) => `${day}|${periodId}`;
    const columnKey = (s) =>
      s.cls ? `L:${s.cls}` : `R:${(s.room || "").trim()}`;

    for (const s of gs) {
      const periodId = periodIdByTime.get((s.time || "").trim());
      if (!periodId) continue;
      const label = s.cls || "";
      const key = columnKey(s);
      const cell = {};
      if ((s.subj || "").trim()) cell.subj = s.subj.trim();
      if ((s.teacher || "").trim()) cell.teacher = s.teacher.trim();
      if ((s.room || "").trim()) cell.room = s.room.trim();
      if ((s.note || "").trim()) cell.note = s.note.trim();

      // 同キーで空いている列を探す
      let target = classes.find(
        (c) => c._key === key && !c._cells.has(posKey(s.day, periodId))
      );
      if (!target) {
        target = { id: nextClassId++, label, room: "", _key: key, _cells: new Map() };
        const lastSame = classes.map((c) => c._key).lastIndexOf(key);
        if (lastSame >= 0) {
          classes.splice(lastSame + 1, 0, target);
          parallelColumns++;
        } else {
          classes.push(target);
        }
      }
      target._cells.set(posKey(s.day, periodId), cell);
    }

    // クラス名の無い列だけのタブ (高校の講座タブ) は列見出しが教室番号に
    // なるため、教室番号順に整列する (教室なしは末尾、同室の並列列は作成順)
    if (classes.length > 1 && classes.every((c) => !c.label)) {
      classes.sort((a, b) => {
        const ra = a._key.slice(2);
        const rb = b._key.slice(2);
        if (!ra !== !rb) return ra ? -1 : 1;
        return ra.localeCompare(rb, "ja", { numeric: true }) || a.id - b.id;
      });
    }

    // 列の既定教室 = 最頻の教室。セル側は既定と同じなら省略
    const schedule = {};
    for (const c of classes) {
      const counts = new Map();
      for (const cell of c._cells.values()) {
        if (cell.room) counts.set(cell.room, (counts.get(cell.room) || 0) + 1);
      }
      let best = "";
      let bestN = 0;
      for (const [room, n] of counts) {
        if (n > bestN) {
          best = room;
          bestN = n;
        }
      }
      c.room = best;
      for (const [pos, cell] of c._cells) {
        const [day, pid] = pos.split("|");
        const out = { ...cell };
        if (out.room === c.room) delete out.room;
        schedule[makeCellKey(day, Number(pid), c.id)] = out;
      }
    }

    return {
      id: tabIdx + 1,
      name: tabName,
      grade,
      group,
      classes: classes.map(({ id, label, room }) => ({ id, label, room })),
      days,
      periodIds,
      schedule,
    };
  });

  return {
    project,
    stats: {
      slotCount: slots.length,
      tabCount: project.tabs.length,
      parallelColumns,
    },
  };
}

// ─── 中3 の 2学期変更 (2026-08-02 の要件) ───────────────────────────
// 平日: 18:00 開始へ前倒し (最終コマ 20:45-21:30 の内容を新 1 限
// 18:00-18:45 へ移動、確認テスト 21:35-21:50 → 20:40-20:55)。旧 1・2 限の
// 時刻はそのまま 2・3 限になる。
// 土曜: 内申対策の午前枠 (時間帯A: 10:00-11:00 / 11:10-12:10 /
// 12:50-13:50 / 14:00-15:00) を時限として追加する (中身は空のまま —
// 担当・教科は画面で入力する)。

const WEEKDAYS_MF = ["月", "火", "水", "木", "金"];
const CHU3_MOVES = [
  { from: "20:45-21:30", to: "18:00-18:45" },
  { from: "21:35-21:50", to: "20:40-20:55" },
];
const SAT_MORNING_TIMES = ["10:00-11:00", "11:10-12:10", "12:50-13:50", "14:00-15:00"];

function ensurePeriod(project, time) {
  const found = project.periods.find((p) => p.time === time);
  if (found) return found.id;
  const id = project.periods.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  project.periods.push({ id, label: "", time });
  return id;
}

/**
 * プロジェクトに中3 の 2学期変更を適用した新しいプロジェクトを返す
 * (grade === "中3" のタブのみ変更)。期待する時刻のコマが無い場合は
 * その項目をスキップし、moved 件数で確認できる。
 * @returns {{project: object, moved: number, morningAdded: boolean}}
 */
export function applyChu3SecondTermShift(source) {
  // 深いコピーしてから破壊的に編集する (source は不変)
  const project = JSON.parse(JSON.stringify(source));

  const chu3Tabs = project.tabs.filter((t) => t.grade === "中3");
  if (chu3Tabs.length === 0) return { project, moved: 0, morningAdded: false };

  // 内申対策の午前枠は土曜を持つ中3 タブへ (取込の「平日/土曜で分ける」
  // オプションで「中3 (土)」に分かれている場合はそちらだけに追加する)。
  // 土曜を持つタブが無い場合は全中3 タブに追加し、曜日 土 も足す
  const satTabs = chu3Tabs.filter((t) => (t.days || []).includes("土"));
  const morningTargets = new Set(satTabs.length ? satTabs : chu3Tabs);

  const moves = CHU3_MOVES.map(({ from, to }) => ({
    fromId: project.periods.find((p) => p.time === from)?.id ?? null,
    toId: null, // 使う時があれば ensure する (不要な時限を増やさない)
    to,
  }));

  let moved = 0;
  for (const tab of chu3Tabs) {
    const schedule = {};
    for (const [key, cell] of Object.entries(tab.schedule)) {
      const { day, periodId, classId } = parseCellKey(key);
      const mv = WEEKDAYS_MF.includes(day)
        ? moves.find((m) => m.fromId != null && m.fromId === periodId)
        : null;
      if (mv) {
        if (mv.toId == null) mv.toId = ensurePeriod(project, mv.to);
        schedule[makeCellKey(day, mv.toId, classId)] = cell;
        moved++;
      } else {
        schedule[key] = cell;
      }
    }
    tab.schedule = schedule;

    // 使う時限を更新: 移動先 (+ 対象タブには内申対策の午前枠) を追加し、
    // どのセルからも使われなくなった時限を外す
    const usedIds = new Set(
      Object.keys(schedule).map((k) => parseCellKey(k).periodId)
    );
    for (const mv of moves) {
      if (mv.toId != null) usedIds.add(mv.toId);
    }
    if (morningTargets.has(tab)) {
      for (const time of SAT_MORNING_TIMES) {
        usedIds.add(ensurePeriod(project, time));
      }
      if (!tab.days.includes("土")) {
        tab.days = REGULAR_DAYS.filter((d) => tab.days.includes(d) || d === "土");
      }
    }
    tab.periodIds = tab.periodIds.filter((id) => usedIds.has(id));
    for (const id of usedIds) {
      if (!tab.periodIds.includes(id)) tab.periodIds.push(id);
    }
  }

  // 時限プールを開始時刻順に並べ直す (追加分を正しい位置に)
  project.periods.sort(
    (a, b) => timeStartToMin(a.time) - timeStartToMin(b.time) || a.time.localeCompare(b.time)
  );

  return { project, moved, morningAdded: true };
}
