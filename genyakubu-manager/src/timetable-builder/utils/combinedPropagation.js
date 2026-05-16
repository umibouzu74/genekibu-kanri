import { makeKey, findCombinedGroup } from './scheduleKey';

// 合同グループのセカンダリ伝播・クリーンアップを担う純粋関数群。
//
// useProject の handleAssign / handleCellPaste / handleCellClear /
// handleSwapCells で繰り返されていた cascade ロジックを抽出したもの。
// 「合同グループに属するクラスのうち、自分以外で locked でないものに
// 連動するセルを書き換える」というパターンが共通している。

// 引数のスケジュールを元に、(dIdx, pIdx, cIdx) に対応するセルが属する
// 合同グループの secondary セル (= 自分以外のクラス) のうち、旧 subject を
// 持ち、かつ locked でないものを削除した新スケジュールを返す。
// 該当する合同グループが無ければ schedule をそのまま返す。
export function cleanupOldCombined(schedule, config, combinedGroups, dIdx, pIdx, cIdx, oldSubject) {
  if (!oldSubject) return schedule;
  const date = config.dates[dIdx];
  const className = config.classes[cIdx];
  const group = findCombinedGroup(combinedGroups, oldSubject, className, date);
  if (!group) return schedule;

  const newSchedule = { ...schedule };
  let mutated = false;
  group.classes.forEach(gc => {
    const gci = config.classes.indexOf(gc);
    if (gci < 0 || gci === cIdx) return;
    const gk = makeKey(dIdx, pIdx, gci);
    if (newSchedule[gk]?.subject === oldSubject && !newSchedule[gk]?.locked) {
      delete newSchedule[gk];
      mutated = true;
    }
  });
  return mutated ? newSchedule : schedule;
}

// 引数のスケジュールを元に、(dIdx, pIdx, cIdx) に対応するセルが属する
// 合同グループの secondary セル (= 自分以外のクラス) のうち locked でない
// ものを entry の subject/teacher で上書きした新スケジュールを返す。
// entry に teacher が無い場合は teacher: '' を入れる (合同先で講師未定の
// セルを生成するため。handleAssign の subject 変更時の挙動と整合)。
// entry.subject が空なら何もしない。
// 該当する合同グループが無ければ schedule をそのまま返す。
//
// 注意: subject 変更 / paste / swap など「セルを丸ごと書き換える」操作で使う。
// 講師だけを変える場合は propagateTeacherChange を使うこと (ユーザが手動で
// 切り離した secondary の subject を勝手に再接続しない挙動が必要)。
export function propagateAssignment(schedule, config, combinedGroups, dIdx, pIdx, cIdx, entry) {
  if (!entry?.subject) return schedule;
  const date = config.dates[dIdx];
  const className = config.classes[cIdx];
  const group = findCombinedGroup(combinedGroups, entry.subject, className, date);
  if (!group) return schedule;

  const newSchedule = { ...schedule };
  let mutated = false;
  group.classes.forEach(gc => {
    const gci = config.classes.indexOf(gc);
    if (gci < 0 || gci === cIdx) return;
    const gk = makeKey(dIdx, pIdx, gci);
    if (newSchedule[gk]?.locked) return;
    newSchedule[gk] = {
      ...(newSchedule[gk] || {}),
      subject: entry.subject,
      teacher: entry.teacher ?? '',
    };
    mutated = true;
  });
  return mutated ? newSchedule : schedule;
}

// 講師のみ変更したケース用。合同グループ secondary のうち、subject が
// 一致し locked でないものだけ teacher を更新する。subject は触らない。
// secondary の subject が一致しない (ユーザが手動で切り離した) ケースは
// 触らないことで、broken combined link を不用意に再接続しない。
export function propagateTeacherChange(schedule, config, combinedGroups, dIdx, pIdx, cIdx, subject, teacher) {
  if (!subject) return schedule;
  const date = config.dates[dIdx];
  const className = config.classes[cIdx];
  const group = findCombinedGroup(combinedGroups, subject, className, date);
  if (!group) return schedule;

  const newSchedule = { ...schedule };
  let mutated = false;
  group.classes.forEach(gc => {
    const gci = config.classes.indexOf(gc);
    if (gci < 0 || gci === cIdx) return;
    const gk = makeKey(dIdx, pIdx, gci);
    if (newSchedule[gk]?.subject === subject && !newSchedule[gk]?.locked) {
      newSchedule[gk] = { ...newSchedule[gk], teacher };
      mutated = true;
    }
  });
  return mutated ? newSchedule : schedule;
}
