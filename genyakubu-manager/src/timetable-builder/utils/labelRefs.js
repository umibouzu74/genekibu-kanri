// F2k: ラベルベース参照の cascade (リネーム / 削除追従) を一元化する純粋関数群。
//
// このアプリはタブ横断の参照 (講師 NG・外部コマ数・合同グループ・クラス
// 優先度) を **ラベル文字列** で持つ (ID 化しないのは JSON の人間可読性と
// タブ間の同名共有のため — E5b 参照)。その代償として、ラベルの rename /
// 削除時に参照を追従させる cascade が必要になる。
//
// キー形式 (scheduleKey.js と同一):
//   - NG キー:        `${dateLabel}-${periodLabel}`
//   - external キー:  `${dateLabel}-${teacherName}`
//
// ラベル自体に "-" を含み得るため、キーの分解は常に曖昧さを持つ。方針:
//   - 講師名は末尾 (suffix)、日付は先頭 (prefix)、時限は末尾 (suffix)
//   - 削除系の照合は「既知ラベル全体の中で最長一致したものが対象のときだけ」
//     消す (「8/1」と「8/1-補講」のような包含ラベルの誤射防止)
//   - リネーム系は該当部分だけを slice で置換する (String.replace の
//     「最初の一致」置換は、日付ラベルが `-旧講師名` を含むケースで
//     日付側を壊す — F2o)
//
// このモジュールは import を持たない (scheduleKey / constants から独立)。

// ─── NG キー (`${date}-${period}`) ───────────────────────────────

// 日付ラベルのリネームに追従して ngSlots キーの prefix を書き換える。
export function renameNgDate(ngSlots, oldVal, newVal) {
  return (ngSlots || []).map(slot =>
    slot.startsWith(`${oldVal}-`) ? `${newVal}-${slot.substring(oldVal.length + 1)}` : slot
  );
}

// 時限ラベルのリネームに追従して ngSlots キーの suffix を書き換える。
export function renameNgPeriod(ngSlots, oldVal, newVal) {
  return (ngSlots || []).map(slot =>
    slot.endsWith(`-${oldVal}`) ? `${slot.substring(0, slot.length - oldVal.length - 1)}-${newVal}` : slot
  );
}

// ─── external キー (`${date}-${teacherName}`) ────────────────────

// 講師リネームに追従して externalCounts キーの suffix を書き換える (F2o)。
// suffix を slice で置換する。String.replace('-旧名', ...) は最初の一致を
// 置換するため、日付ラベルが `-旧名` を含むと日付側が壊れていた
// (例: 日付「8/1-田中」×講師「田中」)。
export function renameExternalTeacher(externalCounts, oldName, newName) {
  if (!externalCounts) return externalCounts;
  const suffix = `-${oldName}`;
  const out = {};
  Object.keys(externalCounts).forEach(k => {
    const newKey = k.endsWith(suffix)
      ? `${k.substring(0, k.length - oldName.length - 1)}-${newName}`
      : k;
    out[newKey] = externalCounts[k];
  });
  return out;
}

// 日付ラベルのリネームに追従して externalCounts キーの prefix を書き換える。
export function renameExternalDate(externalCounts, oldLabel, newLabel) {
  if (!externalCounts) return externalCounts;
  const prefix = `${oldLabel}-`;
  const out = {};
  Object.keys(externalCounts).forEach(k => {
    if (k.startsWith(prefix)) {
      out[`${newLabel}-${k.substring(prefix.length)}`] = externalCounts[k];
    } else {
      out[k] = externalCounts[k];
    }
  });
  return out;
}

// 講師削除に追従して externalCounts キーを drop する (末尾一致)。
export function dropExternalForTeacher(externalCounts, teacherName) {
  if (!externalCounts) return externalCounts;
  const suffix = `-${teacherName}`;
  const out = {};
  Object.keys(externalCounts).forEach(k => {
    if (!k.endsWith(suffix)) out[k] = externalCounts[k];
  });
  return out;
}

// ─── 削除系の最長一致 matcher ────────────────────────────────────

// 日付ラベル削除用: キー先頭の日付部分が「既知ラベル中の最長一致」で
// removed に該当するときだけ true を返す matcher を作る。
// NG キー / external キーの両方に使える (どちらも `${date}-...`)。
export function makeDateKeyDropMatcher(allDateLabels, removedLabels) {
  const removedSet = removedLabels instanceof Set ? removedLabels : new Set(removedLabels);
  return (key) => {
    let longest = null;
    (allDateLabels || []).forEach(l => {
      if (key.startsWith(`${l}-`) && (longest === null || l.length > longest.length)) longest = l;
    });
    return longest !== null && removedSet.has(longest);
  };
}

// 時限ラベル削除用: キー末尾の時限部分が「既知ラベル中の最長一致」で
// removed に該当するときだけ true を返す matcher を作る (NG キー用)。
export function makePeriodKeyDropMatcher(allPeriodLabels, removedLabels) {
  const removedSet = removedLabels instanceof Set ? removedLabels : new Set(removedLabels);
  return (key) => {
    let longest = null;
    (allPeriodLabels || []).forEach(l => {
      if (key.endsWith(`-${l}`) && (longest === null || l.length > longest.length)) longest = l;
    });
    return longest !== null && removedSet.has(longest);
  };
}

// ─── teacher.ngClasses / priorityClasses (クラスラベル参照、H5) ──

// クラスラベルのリネームに追従する。リネーム先が既にリスト内に居る場合は
// 重複させない (dedupe)。変更が無ければ元の参照を返す。
export function renameClassInTeachers(teachers, oldVal, newVal) {
  if (!Array.isArray(teachers)) return teachers;
  let changed = false;
  const renameList = (list) => {
    if (!list || !list.includes(oldVal)) return list;
    changed = true;
    const next = list.map(c => (c === oldVal ? newVal : c));
    return [...new Set(next)];
  };
  const result = teachers.map(t => {
    const ngClasses = renameList(t.ngClasses);
    const priorityClasses = renameList(t.priorityClasses);
    if (ngClasses === t.ngClasses && priorityClasses === t.priorityClasses) return t;
    return { ...t, ngClasses, priorityClasses };
  });
  return changed ? result : teachers;
}

// クラスラベルの削除に追従して、有効ラベル集合に無い参照を drop する。
// validLabelSet は「編集後のタブの新ラベル + 他タブの既存ラベル」の和集合を
// 渡す (combinedGroups の cascade と同じ考え方 — 他タブが使うラベルの
// 参照は巻き添えにしない)。変更が無ければ元の参照を返す。
export function cleanClassRefsInTeachers(teachers, validLabelSet) {
  if (!Array.isArray(teachers)) return teachers;
  let changed = false;
  const cleanList = (list) => {
    if (!list) return list;
    const next = list.filter(c => validLabelSet.has(c));
    if (next.length === list.length) return list;
    changed = true;
    return next;
  };
  const result = teachers.map(t => {
    const ngClasses = cleanList(t.ngClasses);
    const priorityClasses = cleanList(t.priorityClasses);
    if (ngClasses === t.ngClasses && priorityClasses === t.priorityClasses) return t;
    return { ...t, ngClasses, priorityClasses };
  });
  return changed ? result : teachers;
}

// ─── combinedGroups (クラス / 日付ラベル参照) ────────────────────

// 残るラベル集合に合うよう combinedGroups から消えたものを filter。
// dimension: 'classes' | 'dates'
export function cleanCombinedGroupsForLabelChange(groups, dimension, validLabelSet) {
  return (groups || [])
    .map(g => {
      if (dimension === 'classes') {
        const newClasses = g.classes.filter(c => validLabelSet.has(c));
        return { ...g, classes: newClasses };
      }
      // dimension === 'dates' (null は全日扱いで不変)
      if (g.dates === null) return g;
      const newDates = g.dates.filter(d => validLabelSet.has(d));
      return { ...g, dates: newDates };
    })
    .filter(g => {
      if (dimension === 'classes') return g.classes.length >= 2; // 1 クラスでは合同にならない
      // dates の全消失は「全日無し」= 対象が無いので drop。null (全日) は残す。
      return g.dates === null || g.dates.length > 0;
    });
}

// 科目削除に伴う combinedGroups の cleanup。subject 一致グループを drop。
export function cleanCombinedGroupsForSubjectRemoval(groups, removedSubject) {
  return (groups || []).filter(g => g.subject !== removedSubject);
}

// クラス/日付ラベルのリネームに伴う combinedGroups の label 書き換え。
export function renameCombinedGroupsLabel(groups, dimension, oldLabel, newLabel) {
  return (groups || []).map(g => {
    if (dimension === 'classes') {
      return { ...g, classes: g.classes.map(c => c === oldLabel ? newLabel : c) };
    }
    // dimension === 'dates'
    if (g.dates === null) return g;
    return { ...g, dates: g.dates.map(d => d === oldLabel ? newLabel : d) };
  });
}
