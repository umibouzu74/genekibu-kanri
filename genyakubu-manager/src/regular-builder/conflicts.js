// ─── 衝突検出 (通常時間割作成) ──────────────────────────────────────
// タブ横断で「同じ曜日 × 時間帯が重なる」講師の二重割当と教室の重複を
// 検出する。時限はタブごとに時刻が違う (中3 18:00 開始 / 中12 18:55 開始
// など) ため、時限 id ではなく時刻文字列の重なりで判定する。
//
// 同一セル内の複数講師 ("藤田·大屋敷" の並列監督など) は 1 セルなので
// 衝突にならない。講師名の分解は splitTeacherField (CLAUDE.md の規約)。
//
// 隔週コマ (note の「隔週(◯◯)」) の **パートナー講師もチェック対象**。
// 📊 集計は 0.5 コマとして計上し、👁 強調もパートナーを光らせるので、
// チェックだけ対象外だと「集計には出るのに重複は検出されない」非対称に
// なる。
//
// ただし隔週は「担当する週」まで見ないと重なりを判定できない。
// 講師欄の主担当 = A 週 / note のパートナー = B 週 (📊 集計・👁 週間
// ミニビュー・Excel の「隔週A/隔週B」と同じ定義)。同じ時間帯に
//   AB 列: 英/数 堀上(A) / 河野(B)
//   C  列: 数/英 河野(A) / 堀上(B)
// のように左右が交互に入れ替わる組は、どの週も同じ人が 2 か所に
// 居ることにならないので重複ではない。**担当週が交わるときだけ**検出し、
// 隔週と通常コマの重なり (通常コマは毎週なので必ずどちらかの週で当たる)
// は従来どおり警告する。
// 「隔週」とだけ書かれてパートナーが読み取れない note は週を絞れないため
// 両方の週に居る扱い = 保守的に広く検出する。
//
// 現行データに元からある意図的な重なり (亀73 同室の個別指導など) は
// project.approvedConflicts に conflictKey を入れて「承認」でき、
// buildConflictView がバッジ件数・赤枠から除外する。

import { biweeklyPartner, isBiweekly, splitTeacherField } from "../utils/biweekly";
import { timeOverlaps } from "../utils/chainSubstitution";
import {
  isAnnexRoom,
  makeCellKey,
  resolveAllEntries,
  effectiveRoom,
  tabPeriods,
} from "./model";

const TIME_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

// 時刻範囲を分 (start/end) に分解する。teacherLoad.periodRange と同じ規則だが、
// teacherLoad はこのモジュールの entryRef を import しているため、逆向きに
// import すると循環参照になる。判定に必要なのはこれだけなのでローカルに持つ
function parseTimeRange(time) {
  const m = String(time || "").trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return end > start ? { start, end } : null;
}

/** 隔週の週。A = 講師欄の主担当 / B = note「隔週(◯◯)」のパートナー */
const WEEKS = ["A", "B"];

/**
 * そのコマに関わる講師と、その人が担当する週の対応。
 * - 非隔週                     → teacher 欄の全員が毎週 (A/B 両方)
 * - 隔週(パートナー)           → teacher 欄 = A 週 / パートナー = B 週
 * - パートナーを読めない「隔週」 → 週を絞れないので両方 (保守的)
 * teacherLoad / RegularTeacherWeek / 👁 強調と同じ「関わる人」の定義に、
 * 週の情報を足したもの。
 * @returns {Map<string, Set<"A"|"B">>} 講師名 → 担当する週 (講師欄の順)
 */
export function entryTeacherWeeks(cell) {
  const names = splitTeacherField(cell?.teacher || "");
  const partner = isBiweekly(cell?.note) ? biweeklyPartner(cell?.note) : null;
  const map = new Map();
  const add = (name, weeks) => {
    const cur = map.get(name);
    if (cur) weeks.forEach((w) => cur.add(w));
    else map.set(name, new Set(weeks));
  };
  // パートナーが読めない「隔週」だけの note は主担当を毎週扱いにする
  for (const n of names) add(n, partner ? ["A"] : WEEKS);
  if (partner) add(partner, ["B"]);
  return map;
}

/**
 * そのコマに関わる講師名 (週は問わない)。NG 判定や「(重複)」予告の
 * 候補集めのように、週で絞らない用途に使う。
 */
export function entryTeachers(cell) {
  return [...entryTeacherWeeks(cell).keys()];
}

/** 2 つの担当週集合が交わる週 ("A"/"B" の順)。空なら同じ週には当たらない */
function sharedWeeks(wa, wb) {
  return WEEKS.filter((w) => wa.has(w) && wb.has(w));
}

/**
 * 隔週が絡む重なりに添える注記。どの週で当たるかまで確定できるので
 * 週を明示する (A/B が何を指すかも書いて、注記だけで意味が通るようにする)。
 * 隔週が絡まなければ空文字。
 */
function weekHint(cellA, cellB, weeks) {
  if (!isBiweekly(cellA?.note) && !isBiweekly(cellB?.note)) return "";
  if (weeks.length === 1) {
    return weeks[0] === "A"
      ? "（隔週 A 週＝講師欄の主担当の週）"
      : "（隔週 B 週＝備考のパートナーの週）";
  }
  return "（隔週コマを含む — 週が別なら承認で消せます）";
}

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

  // 時間帯の重なり比較 (講師・教室・クラス) は時刻が判定可能なエントリ
  // のみ対象 (時刻未設定の時限は反映側で弾く)。NG 判定は時刻に依存しない
  // 終日 NG があるため、全エントリを別途見る (下の allEntries)
  const allEntries = resolveAllEntries(project);
  const entries = allEntries.filter((e) =>
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

        // 講師重複 (隔週パートナーも「関わる講師」に含める)。
        // 隔週は担当週が交わるときだけ重複 — 主担当とパートナーが左右で
        // 入れ替わる組は、どの週も同じ人が 2 か所に居ることにならない
        const ta = entryTeacherWeeks(a.cell);
        const tb = entryTeacherWeeks(b.cell);
        for (const [t, weeksA] of ta) {
          const weeksB = tb.get(t);
          if (!weeksB) continue;
          const weeks = sharedWeeks(weeksA, weeksB);
          if (weeks.length === 0) continue;
          const suffix = weekHint(a.cell, b.cell, weeks);
          list.push({
            type: "teacher",
            day,
            label: `${day} 講師 ${t}: ${describeEntry(a)} ↔ ${describeEntry(b)}${suffix}`,
            refs: [entryRef(a), entryRef(b)],
            reasons: [
              `講師 ${t} が重複: ${describeEntry(b)}${suffix}`,
              `講師 ${t} が重複: ${describeEntry(a)}${suffix}`,
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
  // 終日 NG は時刻未設定の時限にも当てる (時刻に依存しないため。予告の
  // computeNgTeachersForTabs と同じ判定 — 予告だけ出て検出されないと、
  // 警告を見て割り当てたのに問題一覧に載らないズレになる)
  const ngTeachers = (project.teachers || []).filter(
    (t) => (t.ngSlots || []).length > 0
  );
  if (ngTeachers.length > 0) {
    const byName = new Map(ngTeachers.map((t) => [t.name, t]));
    for (const e of allEntries) {
      const time = (e.period.time || "").trim();
      for (const name of entryTeachers(e.cell)) {
        const master = byName.get(name);
        if (!master) continue;
        const hit = master.ngSlots.find(
          (s) =>
            s.day === e.day &&
            (!s.time || (TIME_RE.test(time) && timeOverlaps(s.time, time)))
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

  // ── 校舎間の移動 (本校 ↔ 亀井町) ────────────────────────────────
  // 時間帯が重なっていなくても、本校のコマ直後に亀井町のコマだと物理的に
  // 間に合わない。必要な移動時間は施設ごとの事情なので
  // project.campusTravelMinutes に入っているときだけチェックする
  // (未設定 = チェックしない — もっともらしい既定値を勝手に決めない)。
  // 時間帯が重なるケースは上の講師重複が既に拾っているので二重に出さない。
  const travelMinutes = Number(project.campusTravelMinutes);
  if (Number.isFinite(travelMinutes) && travelMinutes > 0) {
    // 隔週コマは担当する週が違えば同じ日に並ばないので、週 (A/B) ごとに
    // 「その週に居る人のコマ」だけを並べて隣接を見る。両方の週で当たる
    // 組み合わせ (通常コマ同士など) は 1 件にまとめる
    const found = new Map(); // `${prevRef}~${curRef}` → 検出内容 + 当たる週
    for (const week of WEEKS) {
      // 曜日 × 講師 → その週のその人のコマ (時刻・校舎つき)
      const byDayTeacher = new Map();
      for (const e of entries) {
        const range = parseTimeRange(e.period.time);
        const room = effectiveRoom(e);
        if (!range || !room) continue;
        for (const [name, weeks] of entryTeacherWeeks(e.cell)) {
          if (!weeks.has(week)) continue;
          const k = `${e.day}|${name}`;
          if (!byDayTeacher.has(k)) byDayTeacher.set(k, []);
          byDayTeacher.get(k).push({
            e,
            name,
            range,
            campus: isAnnexRoom(room) ? "亀井町" : "本校",
          });
        }
      }
      // 開始時刻順に並べ、隣り合うコマだけを見る (間に別のコマが挟まる
      // 組み合わせは、その途中のコマとの隣接で必ず判定される)
      for (const items of byDayTeacher.values()) {
        if (items.length < 2) continue;
        // キーを分解せず要素から引く (講師名に区切り文字が入っても崩れない)
        const day = items[0].e.day;
        const name = items[0].name;
        items.sort((a, b) => a.range.start - b.range.start);
        for (let i = 1; i < items.length; i++) {
          const prev = items[i - 1];
          const cur = items[i];
          if (prev.campus === cur.campus) continue;
          const gap = cur.range.start - prev.range.end;
          if (gap < 0) continue; // 重なりは講師重複として既に出ている
          if (gap >= travelMinutes) continue;
          const pairKey = `${entryRef(prev.e)}~${entryRef(cur.e)}`;
          const hit = found.get(pairKey);
          if (hit) hit.weeks.push(week);
          else found.set(pairKey, { day, name, prev, cur, gap, weeks: [week] });
        }
      }
    }
    for (const { day, name, prev, cur, gap, weeks } of found.values()) {
      const suffix = weekHint(prev.e.cell, cur.e.cell, weeks);
      list.push({
        type: "travel",
        day,
        label:
          `${day} 校舎移動 ${name}: ${describeEntry(prev.e)}（${prev.campus}）→ ` +
          `${describeEntry(cur.e)}（${cur.campus}）は間隔 ${gap} 分（必要 ${travelMinutes} 分）${suffix}`,
        refs: [entryRef(prev.e), entryRef(cur.e)],
        reasons: [
          `${cur.campus}への移動が間に合いません（次のコマまで ${gap} 分・必要 ${travelMinutes} 分）`,
          `${prev.campus}からの移動が間に合いません（前のコマから ${gap} 分・必要 ${travelMinutes} 分）`,
        ],
      });
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
 * 講師プルダウンが決めるのは「主担当」— 隔週コマ (パートナー付き) なら
 * A 週の担当だけ。予告はその週に居る人だけを対象にする。
 */
function mainTeacherWeeks(cell) {
  return isBiweekly(cell?.note) && biweeklyPartner(cell?.note) ? ["A"] : WEEKS;
}

/**
 * 複数タブ分の「(重複) 予告」索引を一括計算する。全セルの解決
 * (resolveAllEntries) は 1 回で済ませ、タブごとのループでは日別索引を
 * 参照するだけにする (曜日ビューは全タブ分を毎レンダー参照するため)。
 * 隔週コマは担当週が交わる相手だけを予告する (computeConflicts と同基準)。
 * @returns {Map<number, Map<string, string[]>>} tabId → (cellKey → 講師名)
 */
export function computeBusyTeachersForTabs(project, tabs) {
  const entries = resolveAllEntries(project).filter((e) =>
    TIME_RE.test((e.period.time || "").trim())
  );
  const byDay = new Map();
  const weeksByEntry = new Map(); // 週の判定は entry ごとに 1 回で済ませる
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
    weeksByEntry.set(e, entryTeacherWeeks(e.cell));
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
        // クラスごとには自セルの除外と担当週の照合だけを行う
        const overlapping = dayEntries.filter((e) =>
          timeOverlaps(time, e.period.time.trim())
        );
        if (overlapping.length === 0) continue;
        for (const cls of tab.classes || []) {
          const cellKey = makeCellKey(day, per.id, cls.id);
          const selfRef = `${tab.id}:${cellKey}`;
          const selfWeeks = mainTeacherWeeks((tab.schedule || {})[cellKey]);
          const names = new Set();
          for (const e of overlapping) {
            if (entryRef(e) === selfRef) continue;
            for (const [n, weeks] of weeksByEntry.get(e)) {
              if (selfWeeks.some((w) => weeks.has(w))) names.add(n);
            }
          }
          if (names.size) result.set(cellKey, [...names].sort());
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
 *   badgeByRef: Map<string, string>, // 未承認のあるセルのバッジ文言
 *   stale: string[],              // 対象の消えた承認キー (掃除の対象)
 * }}
 */
export function buildConflictView(list, approvedKeys) {
  const approvedSet = new Set(approvedKeys || []);
  const active = [];
  const approved = [];
  const liveKeys = new Set();
  for (const c of list) {
    const key = conflictKey(c);
    liveKeys.add(key);
    (approvedSet.has(key) ? approved : active).push(c);
  }
  // conflictKey はセル参照を含むため、承認したコマを動かすと承認は無効に
  // なる (保守的で意図どおり)。無効キーは画面には出ないまま保存に残り続け、
  // たまたま同じ配置に戻ると承認が生き返るので、掃除できるように数える
  const stale = [...approvedSet].filter((k) => !liveKeys.has(k));
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
  // セルのバッジ文言。問題が 1 種類だけならその種類を名乗る (NG だけの
  // セルに「重複」、校舎移動だけのセルに「重複」と出るのを防ぐ)。
  // 複数種類が重なっているセルは総称の「重複」に倒す
  const badgeByRef = new Map(
    [...typesByRef].map(([ref, types]) => {
      if (types.size === 1) {
        if (types.has("ng")) return [ref, "NG"];
        if (types.has("travel")) return [ref, "移動"];
      }
      return [ref, "重複"];
    })
  );
  return { active, approved, byRef, badgeByRef, stale };
}
