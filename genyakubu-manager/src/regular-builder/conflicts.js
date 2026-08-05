// ─── 衝突検出 (通常時間割作成) ──────────────────────────────────────
// タブ横断で「同じ曜日 × 時間帯が重なる」講師の二重割当と教室の重複を
// 検出する。時限はタブごとに時刻が違う (中3 18:00 開始 / 中12 18:55 開始
// など) ため、時限 id ではなく時刻文字列の重なりで判定する。
//
// 同一セル内の複数講師 ("藤田·大屋敷" の並列監督など) は 1 セルなので
// 衝突にならない。講師名の分解は splitTeacherField (CLAUDE.md の規約)。
//
// 現行データに元からある意図的な重なり (亀73 同室の個別指導など) は
// project.approvedConflicts に conflictKey を入れて「承認」でき、
// buildConflictView がバッジ件数・赤枠から除外する。

import { splitTeacherField } from "../utils/biweekly";
import { timeOverlaps } from "../utils/chainSubstitution";
import { makeCellKey, resolveAllEntries, effectiveRoom, tabPeriods } from "./model";

const TIME_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

/** entry の一意参照 (UI のハイライト用): `${tabId}:${cellKey}` */
export function entryRef(entry) {
  return `${entry.tab.id}:${entry.key}`;
}

/** 承認リストに保存する衝突の識別子。セルが動くと無効になる (保守的)。 */
export function conflictKey(c) {
  return `${c.type}|${c.day}|${[...c.refs].sort().join("~")}`;
}

function describeEntry(entry) {
  return `${entry.tab.name} ${entry.cls.label} ${entry.period.label || entry.period.time} ${entry.cell.subj || ""}`.trim();
}

// クラス重複用の短い説明 (クラス名は label 側に出すため時限 + 教科だけ)
function describePeriodCell(entry) {
  return `${entry.period.label || entry.period.time} ${entry.cell.subj || ""}`.trim();
}

/**
 * プロジェクト全体の衝突を検出する (承認は考慮しない生の一覧)。
 * teacher/room/class は 2 セルの重複 (refs 2 件)、ng は講師マスタの NG
 * (不在) 時間帯への割当 (refs 1 件)。いずれも承認フローで消せる。
 * @returns {{list: {
 *   type: "teacher"|"room"|"class"|"ng", day: string, label: string,
 *   refs: string[],              // 該当セルの entryRef (teacher/room/class は 2 件)
 *   reasons: string[],           // refs と同順の、セル側に出す理由文
 * }[]}}
 */
export function computeConflicts(project) {
  const list = [];

  // 時刻が判定可能なエントリのみ対象 (時刻未設定の時限は反映側で弾く)
  const entries = resolveAllEntries(project).filter((e) =>
    TIME_RE.test((e.period.time || "").trim())
  );

  // 曜日ごとにペア比較 (規模は高々数百セルなので O(n^2) で十分)
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }

  for (const [day, dayEntries] of byDay) {
    for (let i = 0; i < dayEntries.length; i++) {
      for (let j = i + 1; j < dayEntries.length; j++) {
        const a = dayEntries[i];
        const b = dayEntries[j];
        if (!timeOverlaps(a.period.time.trim(), b.period.time.trim())) continue;

        // 講師重複
        const ta = splitTeacherField(a.cell.teacher || "");
        const tb = new Set(splitTeacherField(b.cell.teacher || ""));
        const shared = ta.filter((t) => tb.has(t));
        for (const t of shared) {
          list.push({
            type: "teacher",
            day,
            label: `${day} 講師 ${t}: ${describeEntry(a)} ↔ ${describeEntry(b)}`,
            refs: [entryRef(a), entryRef(b)],
            reasons: [
              `講師 ${t} が重複: ${describeEntry(b)}`,
              `講師 ${t} が重複: ${describeEntry(a)}`,
            ],
          });
        }

        // 教室重複 (実効教室が両方あり一致する場合)
        const ra = effectiveRoom(a);
        const rb = effectiveRoom(b);
        if (ra && ra === rb) {
          list.push({
            type: "room",
            day,
            label: `${day} 教室 ${ra}: ${describeEntry(a)} ↔ ${describeEntry(b)}`,
            refs: [entryRef(a), entryRef(b)],
            reasons: [
              `教室 ${ra} が重複: ${describeEntry(b)}`,
              `教室 ${ra} が重複: ${describeEntry(a)}`,
            ],
          });
        }

        // クラス (生徒) の時間重複 — 同じ学年・同じクラス列に時間帯の重なる
        // コマが 2 つある状態。通常は時限時刻のタイポで起きる (講師・教室
        // だけ見ていると生徒の二重在籍に気付けない)。意図した分割授業など
        // は他の重複と同じく承認フローで消せる
        if (a.tab.id === b.tab.id && a.cls.id === b.cls.id) {
          const clsName =
            `${a.tab.name} ${a.cls.label || a.cls.room || ""}`.trim();
          list.push({
            type: "class",
            day,
            label: `${day} クラス ${clsName}: ${describePeriodCell(a)} ↔ ${describePeriodCell(b)}`,
            refs: [entryRef(a), entryRef(b)],
            reasons: [
              `クラス ${clsName} の時間帯が重複: ${describePeriodCell(b)}`,
              `クラス ${clsName} の時間帯が重複: ${describePeriodCell(a)}`,
            ],
          });
        }
      }
    }
  }

  // ── 講師 NG (不在) への割当 ──────────────────────────────────────
  // NG は「曜日 (+ 任意の時刻範囲)」。time 無しは終日 NG。同じ講師の複数
  // NG が同じセルに重なっても 1 件と数える (承認を 1 回で済ませるため)。
  const ngTeachers = (project.teachers || []).filter(
    (t) => (t.ngSlots || []).length > 0
  );
  if (ngTeachers.length > 0) {
    const byName = new Map(ngTeachers.map((t) => [t.name, t]));
    for (const e of entries) {
      for (const name of splitTeacherField(e.cell.teacher || "")) {
        const master = byName.get(name);
        if (!master) continue;
        const hit = master.ngSlots.find(
          (s) =>
            s.day === e.day &&
            (!s.time || timeOverlaps(s.time, e.period.time.trim()))
        );
        if (!hit) continue;
        // ラベルは曜日で始まるため、括弧内は時間帯だけにする (重複表記防止)
        const when = hit.time || "終日";
        list.push({
          type: "ng",
          day: e.day,
          label: `${e.day} 講師 ${name} NG (${when}): ${describeEntry(e)}`,
          refs: [entryRef(e)],
          reasons: [`講師 ${name} の NG 時間帯 (${e.day} ${when}) です`],
        });
      }
    }
  }

  return { list };
}

/**
 * 複数タブ分の「(NG) 予告」索引を一括計算する。各マス (曜日 × 時限) に
 * ついて、NG (不在) に当たる講師名を返す — 講師プルダウンで選択前に
 * 警告するための索引で、選択は妨げない (割当済みは computeConflicts が
 * ng として検出し、承認フローで消せる)。
 * 終日 NG は時刻未設定の時限にも当たる (時刻に依存しないため)。
 * @returns {Map<number, Map<string, string[]>>} tabId → (cellKey → 講師名)
 */
export function computeNgTeachersForTabs(project, tabs) {
  const ngTeachers = (project.teachers || []).filter(
    (t) => (t.ngSlots || []).length > 0
  );
  const results = new Map();
  for (const tab of tabs) {
    const result = new Map();
    if (ngTeachers.length > 0) {
      const periods = tabPeriods(project, tab);
      for (const day of tab.days || []) {
        for (const per of periods) {
          const time = (per.time || "").trim();
          const names = ngTeachers
            .filter((t) =>
              t.ngSlots.some(
                (s) =>
                  s.day === day &&
                  (!s.time || (TIME_RE.test(time) && timeOverlaps(s.time, time)))
              )
            )
            .map((t) => t.name)
            .sort();
          if (names.length === 0) continue;
          for (const cls of tab.classes || []) {
            result.set(makeCellKey(day, per.id, cls.id), names);
          }
        }
      }
    }
    results.set(tab.id, result);
  }
  return results;
}

/**
 * 複数タブ分の「(重複) 予告」索引を一括計算する。全セルの解決
 * (resolveAllEntries) は 1 回で済ませ、タブごとのループでは日別索引を
 * 参照するだけにする (曜日ビューは全タブ分を毎レンダー参照するため)。
 * @returns {Map<number, Map<string, string[]>>} tabId → (cellKey → 講師名)
 */
export function computeBusyTeachersForTabs(project, tabs) {
  const entries = resolveAllEntries(project).filter((e) =>
    TIME_RE.test((e.period.time || "").trim())
  );
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }

  const results = new Map();
  for (const tab of tabs) {
    const result = new Map();
    const periods = tabPeriods(project, tab);
    for (const day of tab.days || []) {
      const dayEntries = byDay.get(day) || [];
      for (const per of periods) {
        const time = (per.time || "").trim();
        if (!TIME_RE.test(time)) continue;
        // 時間帯の重なり判定は (曜日, 時限) につき 1 回で済ませ、
        // クラスごとには自セルの除外だけを行う
        const overlapping = dayEntries.filter((e) =>
          timeOverlaps(time, e.period.time.trim())
        );
        if (overlapping.length === 0) continue;
        for (const cls of tab.classes || []) {
          const selfRef = `${tab.id}:${makeCellKey(day, per.id, cls.id)}`;
          const names = new Set();
          for (const e of overlapping) {
            if (entryRef(e) === selfRef) continue;
            for (const n of splitTeacherField(e.cell.teacher || "")) names.add(n);
          }
          if (names.size) {
            result.set(makeCellKey(day, per.id, cls.id), [...names].sort());
          }
        }
      }
    }
    results.set(tab.id, result);
  }
  return results;
}

/**
 * 単一タブの各マス (空セル含む) について、「その曜日 × 時間帯」に他の
 * セル (タブ横断) で既に割り当てられている講師名を返す。セルの講師
 * プルダウンで選択前に「(重複)」を予告するための索引。
 * 自セルに入っている分は数えない (自分自身との重複は成立しないため)。
 * 時刻未設定・不正な時限は判定不能なので予告なし (conflicts と同基準)。
 * @returns {Map<string, string[]>} cellKey → 講師名 (ソート済み)
 */
export function computeBusyTeachers(project, tab) {
  return computeBusyTeachersForTabs(project, [tab]).get(tab.id) || new Map();
}

/**
 * 承認済みを除外した表示用ビューを組み立てる。
 * @param {ReturnType<typeof computeConflicts>["list"]} list
 * @param {string[] | undefined} approvedKeys project.approvedConflicts
 * @returns {{
 *   active: object[],             // 未承認 (バッジ件数・赤枠の対象)
 *   approved: object[],           // 承認済み
 *   byRef: Map<string, string[]>, // 未承認のみ: entryRef → 理由文
 *   ngOnlyRefs: Set<string>,      // 未承認が NG のみのセル (バッジを ⚠️NG に)
 * }}
 */
export function buildConflictView(list, approvedKeys) {
  const approvedSet = new Set(approvedKeys || []);
  const active = [];
  const approved = [];
  for (const c of list) {
    (approvedSet.has(conflictKey(c)) ? approved : active).push(c);
  }
  const byRef = new Map();
  const typesByRef = new Map();
  for (const c of active) {
    c.refs.forEach((ref, i) => {
      const arr = byRef.get(ref) || [];
      arr.push(c.reasons[i]);
      byRef.set(ref, arr);
      const types = typesByRef.get(ref) || new Set();
      types.add(c.type);
      typesByRef.set(ref, types);
    });
  }
  const ngOnlyRefs = new Set(
    [...typesByRef]
      .filter(([, types]) => types.size === 1 && types.has("ng"))
      .map(([ref]) => ref)
  );
  return { active, approved, byRef, ngOnlyRefs };
}
