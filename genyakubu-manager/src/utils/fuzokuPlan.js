// ─── 附属の授業予定: 決まりごと (純関数) ───────────────────────────
// 附属コース (学年が「附中」で始まるコマ。水曜) の月間予定を組むための
// ルールを集める。画面の組み立て (その日のコマ・休み・時刻) は
// utils/fuzokuBoard.js、保存形の整形は utils/migrate.migrateFuzokuPlan。
//
// **モデルは最小限しか足していない。** 時程 (50分授業 / 1限カット) は
// 特別時程 (DaySchedule) のレコードそのもの、休みは休講 (Holiday) /
// テスト期間 (ExamPeriod) のまま。fuzokuPlan が持つのは既存モデルに
// 受け皿の無い 2 つだけ:
//   - notes: 日付ごとの学校メモ (バスの時刻・行事)。時程を決めた根拠
//   - tests: 確認テストの科目を手で決めた週 (無い週はローテーションで自動)

import { normalizeFuzokuTestEntry, migrateFuzokuPlan } from "./migrate";
import {
  buildCompressTimeMap,
  buildCutFirstCancelTimes,
  collectTargetTimes,
  getDaySchedulesForDate,
} from "./daySchedules";

// ── 対象のコマ ──────────────────────────────────────────────────────

export const FUZOKU_GRADE_PREFIX = "附中";

// 附属コースの学年か ("附中1" / "附中2" / "附中3" / 共通の "附中")
export const isFuzokuGrade = (grade) =>
  typeof grade === "string" && grade.startsWith(FUZOKU_GRADE_PREFIX);

// 附属の確認テストのコマ (21:00-21:30 の「確認テスト」。学年は共通の
// "附中" のことも、学年別のこともある)
export const isFuzokuTestSlot = (slot) =>
  !!slot && isFuzokuGrade(slot.grade) && /テスト/.test(slot.subj || "");

// 附属の授業のコマ (確認テスト以外)
export const isFuzokuLessonSlot = (slot) =>
  !!slot && isFuzokuGrade(slot.grade) && !isFuzokuTestSlot(slot);

// テストのコマがその学年に当たるか。学年共通 ("附中") のコマは全学年に当たる
export const testSlotAppliesToGrade = (testSlot, grade) =>
  testSlot.grade === grade || testSlot.grade === FUZOKU_GRADE_PREFIX;

// 見出し用の短い学年名 ("附中1" → "中1")。共通の "附中" はそのまま
export const shortFuzokuGrade = (grade) =>
  grade === FUZOKU_GRADE_PREFIX ? grade : String(grade || "").replace(/^附/, "");

// 学年の並び ("附中1" < "附中2" < "附中10")
export const compareFuzokuGrades = (a, b) =>
  String(a).localeCompare(String(b), "ja", { numeric: true });

// ── バス時刻 → 時程の提案 ───────────────────────────────────────────
// 学校の予定表の「バス」欄から授業開始を決める運用の写し (2026-09-30 確定):
//   - 10 分刻みのように近い便は 1 本にまとめ、**その中の遅い方**に合わせる
//     ("15:20×2 15:30×1" → 15:30)
//   - 1 時間後にもう 1 本あるような離れた便は別の便 (部活組など) として扱い、
//     時程は**最初の便**で決める ("16:05×1 17:20×2" → 16:05)
//   - 基準の便が 15:30 までなら通常 (16:25 開始)、16:15 までなら 50分授業
//     (17:00 開始)。それより遅いと 17:00 にも間に合わないので要判断
// **提案であって自動では切り替えない** (行事の中身次第で人が決める)。

export const BUS_CLUSTER_GAP_MIN = 30; // これ以内の間隔の便は 1 本扱い
export const BUS_NORMAL_LATEST_MIN = 15 * 60 + 30; // 15:30 → 通常 16:25 開始
export const BUS_COMPRESS_LATEST_MIN = 16 * 60 + 15; // 16:15 → 50分 17:00 開始

// 分 → "HH:MM"
export function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// バス欄の文字列から時刻 (分) を拾う。"15:20×2 15:30×1" / 全角 "１５：２０" /
// "16:15×1（正門）" に耐える。重複は 1 つ、昇順
export function parseBusTimes(text) {
  const s = String(text || "").normalize("NFKC");
  const out = new Set();
  for (const m of s.matchAll(/(\d{1,2}):(\d{2})/g)) {
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h > 23 || mm > 59) continue;
    out.add(h * 60 + mm);
  }
  return [...out].sort((a, b) => a - b);
}

// 近い便どうしをまとめる (間隔が gap 分以内なら同じ便)
export function clusterBusTimes(times, gap = BUS_CLUSTER_GAP_MIN) {
  const clusters = [];
  for (const t of [...(times || [])].sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (last && t - last[last.length - 1] <= gap) last.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

/**
 * バス欄から時程を提案する。
 * @param {string} text 学校の予定表のバス欄 ("16:05×1 17:20×2")
 * @returns {null | {
 *   kind: "normal" | "compress" | "unknown",
 *   ref: string,        // 基準にした便 ("16:05")
 *   others: string[],   // 別の便として扱った後ろの便 (["17:20"])
 * }} 時刻が読めなければ null
 */
export function suggestPatternFromBus(text) {
  const clusters = clusterBusTimes(parseBusTimes(text));
  if (clusters.length === 0) return null;
  const first = clusters[0];
  const refMin = first[first.length - 1];
  const kind =
    refMin <= BUS_NORMAL_LATEST_MIN
      ? PATTERN.NORMAL
      : refMin <= BUS_COMPRESS_LATEST_MIN
        ? PATTERN.COMPRESS
        : "unknown";
  return {
    kind,
    ref: fmtMin(refMin),
    others: clusters.slice(1).map((c) => fmtMin(c[c.length - 1])),
  };
}

// ── 時程 (特別時程のレコードとの対応) ───────────────────────────────

export const PATTERN = Object.freeze({
  NORMAL: "normal", // 特別時程なし (コマ本来の時刻。附属は 16:25 開始)
  COMPRESS: "compress", // 50分授業 (17:00 開始)
  CUT_FIRST: "cutFirst", // 1限カット
  CUSTOM: "custom", // 上のどれでもない特別時程 (特別時程の画面で編集する)
});

export const PATTERN_LABEL = Object.freeze({
  [PATTERN.NORMAL]: "通常",
  [PATTERN.COMPRESS]: "50分授業",
  [PATTERN.CUT_FIRST]: "1限カット",
  [PATTERN.CUSTOM]: "特別時程",
});

// 特別時程の画面のプリセットと同じラベル (DayScheduleManager.applyPreset)
export const PATTERN_SCHEDULE_LABEL = Object.freeze({
  [PATTERN.COMPRESS]: "附属 50分授業 (17:00開始)",
  [PATTERN.CUT_FIRST]: "附属 1限カット",
});

// 授業の時間帯 (確認テストを除く。開始時刻順)。50分授業の読み替えは
// 「先頭から 4 コマ」なので、テストの時間帯を混ぜると授業が 3 コマの日に
// テストまで 20:00 へ読み替えてしまう
export function collectLessonTimes(daySlots) {
  const lessons = (daySlots || []).filter(isFuzokuLessonSlot);
  const grades = [...new Set(lessons.map((s) => s.grade))];
  return collectTargetTimes(lessons, grades);
}

// その日の特別時程のうち、附属の学年に効くもの (登録順)
export function fuzokuDaySchedulesOn(daySchedules, date, grades) {
  const set = new Set(grades || []);
  return getDaySchedulesForDate(daySchedules, date).filter((d) =>
    (d.targetGrades || []).some((g) => set.has(g))
  );
}

// プリセットの中身 (timeMap / cancelTimes)。作れないときは null
export function buildPatternBody(kind, lessonTimes) {
  if (kind === PATTERN.COMPRESS) {
    const timeMap = buildCompressTimeMap(lessonTimes || []);
    return timeMap.length > 0 ? { timeMap, cancelTimes: [] } : null;
  }
  if (kind === PATTERN.CUT_FIRST) {
    const cancelTimes = buildCutFirstCancelTimes(lessonTimes || []);
    return cancelTimes.length > 0 ? { timeMap: [], cancelTimes } : null;
  }
  return null;
}

const timeMapKey = (tm) =>
  (tm || [])
    .filter((m) => m && m.from && m.to && m.to !== m.from)
    .map((m) => `${m.from}>${m.to}`)
    .sort()
    .join("|");
const listKey = (xs) => [...(xs || [])].filter(Boolean).sort().join("|");

/**
 * その日の時程が 通常 / 50分 / 1限カット / それ以外 のどれかを判定する。
 * レコードの label は人が書き換えられるので見ない (中身で判定する)。
 * プリセットと見なすのは「附属に効くレコードが 1 件だけ」で、授業の学年を
 * 全部含み、中身がプリセットと一致するとき。コマの時刻を後から変えて
 * 中身がずれたレコードは custom (= 特別時程の画面で直す) になる。
 * @param {{date: string, daySchedules: object[], grades: string[],
 *   lessonGrades: string[], lessonTimes: string[]}} args
 * @returns {{kind: string, schedules: object[]}}
 */
export function classifyDayPattern({ date, daySchedules, grades, lessonGrades, lessonTimes }) {
  const schedules = fuzokuDaySchedulesOn(daySchedules, date, grades);
  if (schedules.length === 0) return { kind: PATTERN.NORMAL, schedules };
  if (schedules.length === 1) {
    const d = schedules[0];
    const covers = (lessonGrades || []).every((g) => (d.targetGrades || []).includes(g));
    if (covers) {
      for (const kind of [PATTERN.COMPRESS, PATTERN.CUT_FIRST]) {
        const body = buildPatternBody(kind, lessonTimes);
        if (
          body &&
          timeMapKey(d.timeMap) === timeMapKey(body.timeMap) &&
          listKey(d.cancelTimes) === listKey(body.cancelTimes)
        ) {
          return { kind, schedules };
        }
      }
    }
  }
  return { kind: PATTERN.CUSTOM, schedules };
}

/**
 * 時程の切り替えを「何をすればよいか」に落とす (保存は呼び出し側)。
 *   - add:     新しい特別時程を末尾に足す (entry は id / createdAt 以外)
 *   - update:  既存のプリセットを別のプリセットに書き換える
 *   - remove:  既存のプリセットを消す (通常に戻す。removeWithUndo で)
 *   - none:    今と同じ
 *   - blocked: できない (reason に理由)。custom の日は特別時程の画面で直す
 * @param {{current: {kind: string, schedules: object[]}, target: string,
 *   grades: string[], lessonTimes: string[]}} args
 */
export function planPatternChange({ current, target, grades, lessonTimes }) {
  if (!current || current.kind === target) return { action: "none" };
  if (current.kind === PATTERN.CUSTOM) {
    return {
      action: "blocked",
      reason: "この日は特別時程が個別に登録されています。特別時程の画面で編集してください",
    };
  }
  const existing = current.schedules[0] || null;
  if (target === PATTERN.NORMAL) {
    return existing ? { action: "remove", id: existing.id } : { action: "none" };
  }
  const body = buildPatternBody(target, lessonTimes);
  if (!body) {
    return { action: "blocked", reason: "この日は読み替える授業の時間帯がありません" };
  }
  const fields = { label: PATTERN_SCHEDULE_LABEL[target], ...body };
  if (existing) return { action: "update", id: existing.id, patch: fields };
  return {
    action: "add",
    entry: { ...fields, targetGrades: [...(grades || [])], memo: "" },
  };
}

// ── 保存データの書き換え (純関数。migrate を通して整形済みで返す) ───

/**
 * 学校メモ (バス欄・メモ) を書き換える。両方空ならその日のメモを消す。
 * 渡さなかった方は今の値を保つ。
 */
export function setFuzokuNote(plan, date, { bus, memo } = {}) {
  const cur = migrateFuzokuPlan(plan);
  const prev = cur.notes[date] || {};
  const notes = {
    ...cur.notes,
    [date]: {
      bus: bus !== undefined ? bus : prev.bus || "",
      memo: memo !== undefined ? memo : prev.memo || "",
    },
  };
  return migrateFuzokuPlan({ ...cur, notes });
}

/**
 * 確認テストの科目を手で決める / 自動に戻す。
 * entry: {subjects: [...]} / {none: true} / null (= 自動に戻す)
 */
export function setFuzokuTestEntry(plan, date, grade, entry) {
  const cur = migrateFuzokuPlan(plan);
  const byGrade = { ...(cur.tests[date] || {}) };
  const norm = entry ? normalizeFuzokuTestEntry(entry) : null;
  if (norm) byGrade[grade] = norm;
  else delete byGrade[grade];
  return migrateFuzokuPlan({ ...cur, tests: { ...cur.tests, [date]: byGrade } });
}

// ── 確認テストのローテーション ──────────────────────────────────────
// 2 科目ずつ 英→数→国→理→社→英… と回る (2026-09-30 確定)。回数の都合で
// 1 科目だけの週・実施なしの週 (学期の終わりの方) は手で決める。
//   - 手で決めた週は、その週の最後の科目の次から再開する (起点にもなる)
//   - 「なし」の週・休みの週は進めない
//   - 期 (回数の数え直しの起点) が変わったら自動を止める。新しい期の最初の
//     週を手で決めると、そこからまた回る (新学期の中1 のように始まりが
//     学年ごとに違うので、勝手に「英 数」から始めない)

export const TEST_ROTATION = Object.freeze(["英", "数", "国", "理", "社"]);
export const TEST_SUBJECTS_PER_WEEK = 2;

// その週の科目を出した後の位置 (最後の科目の次)。ローテーション外の科目
// しか無ければ位置は変えない
export function nextRotationIndex(subjects, pos) {
  for (let i = (subjects || []).length - 1; i >= 0; i--) {
    const idx = TEST_ROTATION.indexOf(subjects[i]);
    if (idx !== -1) return (idx + 1) % TEST_ROTATION.length;
  }
  return pos;
}

// 位置 pos から n 科目
export function rotationSubjects(pos, n = TEST_SUBJECTS_PER_WEEK) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(TEST_ROTATION[(pos + i) % TEST_ROTATION.length]);
  return out;
}

// 手で選んだ科目をローテーションの順に並べる (pos から数えた距離順)。
// "社" と "英" を選んだら 社→英 (英→社 にすると次の週が 英 から始まる)
export function sortByRotation(subjects, pos) {
  const base = pos == null ? 0 : pos;
  const n = TEST_ROTATION.length;
  const dist = (s) => {
    const idx = TEST_ROTATION.indexOf(s);
    return idx === -1 ? n : (idx - base + n) % n;
  };
  return [...(subjects || [])].sort((a, b) => dist(a) - dist(b));
}

/**
 * 1 学年ぶんの確認テストの科目を、日付順にたどって決める。
 * @param {{
 *   dates: string[],                       // 附属の授業日 (昇順)
 *   isHeld: (date: string) => boolean,     // その学年がその日に確認テストを受けるか
 *   entries: Record<string, {subjects?: string[], none?: boolean}>, // 日付 → 手動指定
 *   scopeKeyOf?: (date: string) => string | null, // 期の識別子 (変わったら自動を止める)
 * }} args
 * @returns {Map<string, {
 *   kind: "auto" | "manual" | "none" | "off" | "unset",
 *   subjects: string[],
 *   held: boolean,
 *   posBefore: number | null,   // その週の手前の位置 (手で選ぶときの並べ替え用)
 * }>}
 *   manual は休みの判定の日でも manual (手で決めたものを優先)。held で見分ける
 */
export function resolveTestChain({ dates, isHeld, entries, scopeKeyOf }) {
  const out = new Map();
  let pos = null;
  let lastScope = null;
  for (const date of dates || []) {
    const scope = scopeKeyOf ? scopeKeyOf(date) : null;
    if (scope != null) {
      if (lastScope != null && scope !== lastScope) pos = null;
      lastScope = scope;
    }
    const held = isHeld(date);
    const e = entries?.[date];
    const posBefore = pos;
    if (e?.none) {
      out.set(date, { kind: "none", subjects: [], held, posBefore });
    } else if (e?.subjects?.length) {
      out.set(date, { kind: "manual", subjects: [...e.subjects], held, posBefore });
      pos = nextRotationIndex(e.subjects, pos);
    } else if (!held) {
      out.set(date, { kind: "off", subjects: [], held, posBefore });
    } else if (pos == null) {
      out.set(date, { kind: "unset", subjects: [], held, posBefore });
    } else {
      const subjects = rotationSubjects(pos);
      out.set(date, { kind: "auto", subjects, held, posBefore });
      pos = nextRotationIndex(subjects, pos);
    }
  }
  return out;
}

// 表示用 ("英 数" / "なし" / "—")
export function formatTestSubjects(result) {
  if (!result) return "";
  if (result.kind === "none") return "なし";
  if (result.subjects.length > 0) return result.subjects.join(" ");
  return "—";
}
