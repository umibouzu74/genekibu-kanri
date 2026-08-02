// ─── 衝突検出 (通常時間割作成) ──────────────────────────────────────
// タブ横断で「同じ曜日 × 時間帯が重なる」講師の二重割当と教室の重複を
// 検出する。時限はタブごとに時刻が違う (中3 18:00 開始 / 中12 18:55 開始
// など) ため、時限 id ではなく時刻文字列の重なりで判定する。
//
// 同一セル内の複数講師 ("藤田·大屋敷" の並列監督など) は 1 セルなので
// 衝突にならない。講師名の分解は splitTeacherField (CLAUDE.md の規約)。

import { splitTeacherField } from "../utils/biweekly";
import { timeOverlaps } from "../utils/chainSubstitution";
import { resolveAllEntries, effectiveRoom } from "./model";

const TIME_RE = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

/** entry の一意参照 (UI のハイライト用): `${tabId}:${cellKey}` */
export function entryRef(entry) {
  return `${entry.tab.id}:${entry.key}`;
}

function describeEntry(entry) {
  return `${entry.tab.name} ${entry.cls.label} ${entry.period.label} ${entry.cell.subj || ""}`.trim();
}

/**
 * プロジェクト全体の衝突を検出する。
 * @returns {{
 *   list: {type: "teacher"|"room", day: string, label: string, refs: string[]}[],
 *   byRef: Map<string, string[]>,  // entryRef → 人が読める理由の配列
 * }}
 */
export function computeConflicts(project) {
  const list = [];
  const byRef = new Map();
  const addReason = (ref, reason) => {
    const arr = byRef.get(ref) || [];
    arr.push(reason);
    byRef.set(ref, arr);
  };

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
          const label = `${day} ${t}: ${describeEntry(a)} ↔ ${describeEntry(b)}`;
          list.push({ type: "teacher", day, label, refs: [entryRef(a), entryRef(b)] });
          addReason(entryRef(a), `講師 ${t} が重複: ${describeEntry(b)}`);
          addReason(entryRef(b), `講師 ${t} が重複: ${describeEntry(a)}`);
        }

        // 教室重複 (実効教室が両方あり一致する場合)
        const ra = effectiveRoom(a);
        const rb = effectiveRoom(b);
        if (ra && ra === rb) {
          const label = `${day} 教室${ra}: ${describeEntry(a)} ↔ ${describeEntry(b)}`;
          list.push({ type: "room", day, label, refs: [entryRef(a), entryRef(b)] });
          addReason(entryRef(a), `教室 ${ra} が重複: ${describeEntry(b)}`);
          addReason(entryRef(b), `教室 ${ra} が重複: ${describeEntry(a)}`);
        }
      }
    }
  }

  return { list, byRef };
}
