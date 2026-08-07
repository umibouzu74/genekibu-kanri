// ─── コースセット (曜日の組で通うクラスのまとまり) の検出 ───────────
// 「中3 は火・木で 1 セット、水・金でもう 1 セット」「中1 のセット1/
// セット2」のように、通常授業は同じクラス列が決まった曜日の組で回る。
// ◫ 曜日を並べるビューはこの「学年 × 曜日の組」をショートカットチップに
// して、「中3（火・木）」のクリックでその組の曜日の同時表示へ一発で
// 切り替えられるようにする (表示自体は曜日のフル表示 — 同じ曜日の
// 他学年・他コースとの兼ね合いを見ながら編集するため、クラスは絞らない)。
//
// セットはデータに保存せず、毎回スケジュールから導出する (取込直後でも
// 設定なしで使え、コマを動かせば自動で追従する):
// - クラス列の「使っている曜日」= そのクラスのセルがある曜日
//   (tab.days / tab.periodIds の範囲外に残った残骸セルは数えない)
// - 合同列 (範囲・列挙ラベル) のセルがある曜日は、構成クラスの使用曜日
//   にも数える (合同コマの日もそのクラスの生徒は来るため)。合同列自身は
//   構成クラスが全員同じセットに入ればそのセットへ合流する
// - セルが 1 つも無いクラス列は tab.days (学年の使う全曜日) 扱い
//   (作りかけの学年のセットもチップに出るように)
// 同じ曜日の組になったクラス列同士が 1 つのセットになる。

import { REGULAR_DAYS, parseCellKey } from "./model";
import { computeMergeLayout } from "./mergedColumns";

const dayIndex = (d) => REGULAR_DAYS.indexOf(d);
const sortDays = (days) => [...days].sort((a, b) => dayIndex(a) - dayIndex(b));

// タブの各クラス列が「セルを持つ曜日」の集合 (残骸セルは除外)
function ownDaysByClass(tab) {
  const dayset = new Set(tab.days || []);
  const useP = new Set(tab.periodIds || []);
  const clsIds = new Set((tab.classes || []).map((c) => c.id));
  const result = new Map(); // classId → Set<day>
  for (const key of Object.keys(tab.schedule || {})) {
    const { day, periodId, classId } = parseCellKey(key);
    if (!dayset.has(day) || !useP.has(periodId) || !clsIds.has(classId)) continue;
    if (!result.has(classId)) result.set(classId, new Set());
    result.get(classId).add(day);
  }
  return result;
}

/**
 * プロジェクトの全コースセットを検出する。
 * @returns {{
 *   key: string,        // セットの安定キー (`${tabId}|${days.join("")}`)
 *   tabId: number, tabName: string, grade: string,
 *   days: string[],     // 曜日順 (REGULAR_DAYS 順) のセットの曜日
 *   classIds: number[], // tab.classes の並び順を保った構成クラス id
 *   label: string,      // 例 "中3（火・木）"
 *   cellCount: number,  // セット内の入力済みコマ数
 * }[]} タブ定義順 → セットの先頭曜日順
 */
export function computeCourseSets(project) {
  const sets = [];
  for (const tab of project.tabs || []) {
    if (
      (tab.days || []).length === 0 ||
      (tab.periodIds || []).length === 0 ||
      (tab.classes || []).length === 0
    )
      continue;

    const layout = computeMergeLayout(tab);
    const own = ownDaysByClass(tab);
    const fallbackDays = sortDays(tab.days);

    // 構成クラスの実効曜日 = 自セルの曜日 ∪ 自分を含む合同列のセルの曜日
    const effDays = new Map(); // classId → string[] (ソート済み)
    layout.visible.forEach((cls, idx) => {
      const days = new Set(own.get(cls.id) || []);
      for (const r of layout.ranges) {
        if (idx < r.startIdx || idx > r.endIdx) continue;
        for (const d of own.get(r.cls.id) || []) days.add(d);
      }
      effDays.set(cls.id, days.size ? sortDays(days) : fallbackDays);
    });

    // 曜日の組が同じクラス列を 1 セットに
    const groups = new Map(); // daysKey → {days, classIds}
    const groupKeyByClass = new Map(); // classId → daysKey
    const addTo = (daysKey, days, clsId) => {
      if (!groups.has(daysKey)) groups.set(daysKey, { days, classIds: [] });
      groups.get(daysKey).classIds.push(clsId);
      groupKeyByClass.set(clsId, daysKey);
    };
    for (const cls of layout.visible) {
      const days = effDays.get(cls.id);
      addTo(days.join(""), days, cls.id);
    }
    // 合同列: 構成クラスが全員同じセットならそこへ合流。割れている場合は
    // 自分のセルの曜日 (無ければ tab.days) の組として扱う
    for (const r of layout.ranges) {
      const memberKeys = new Set();
      for (let i = r.startIdx; i <= r.endIdx; i++) {
        const m = layout.visible[i];
        if (m) memberKeys.add(groupKeyByClass.get(m.id));
      }
      if (memberKeys.size === 1) {
        groups.get([...memberKeys][0]).classIds.push(r.cls.id);
      } else {
        const rDays = own.get(r.cls.id);
        const days = rDays?.size ? sortDays(rDays) : fallbackDays;
        addTo(days.join(""), days, r.cls.id);
      }
    }

    // classIds は tab.classes の並び順に戻す (結合レイアウトが添字依存)
    const order = new Map((tab.classes || []).map((c, i) => [c.id, i]));
    const tabSets = [...groups.values()]
      .filter((g) => g.days.length > 0)
      .map((g) => {
        const classIds = [...g.classIds].sort((a, b) => order.get(a) - order.get(b));
        const clsSet = new Set(classIds);
        let cellCount = 0;
        const dayset = new Set(tab.days || []);
        const useP = new Set(tab.periodIds || []);
        for (const key of Object.keys(tab.schedule || {})) {
          const pos = parseCellKey(key);
          if (dayset.has(pos.day) && useP.has(pos.periodId) && clsSet.has(pos.classId))
            cellCount++;
        }
        return {
          key: `${tab.id}|${g.days.join("")}`,
          tabId: tab.id,
          tabName: tab.name,
          grade: tab.grade || "",
          days: g.days,
          classIds,
          label: `${tab.name}（${g.days.join("・")}）`,
          cellCount,
        };
      })
      .sort(
        (a, b) =>
          dayIndex(a.days[0]) - dayIndex(b.days[0]) ||
          a.days.length - b.days.length ||
          order.get(a.classIds[0]) - order.get(b.classIds[0])
      );
    sets.push(...tabSets);
  }
  return sets;
}
