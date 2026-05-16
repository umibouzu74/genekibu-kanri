import { makeKey, findCombinedGroup, findEntityById } from './scheduleKey';

// 合同グループのセカンダリ伝播・クリーンアップを担う純粋関数群。
//
// useProject の handleAssign / handleCellPaste / handleCellClear /
// handleSwapCells で繰り返されていた cascade ロジックを抽出したもの。
// 「合同グループに属するクラスのうち、自分以外で locked でないものに
// 連動するセルを書き換える」というパターンが共通している。
//
// v3 以降の API: dateId / periodId / classId は ID。config.classes / dates は
// { id, label } の entity 配列。findCombinedGroup は label ベースで検索する
// (合同グループ自体がラベルで定義されているため)。

// (dateId, periodId, classId) に対応するセルが属する合同グループの secondary
// セルのうち、旧 subject を持ち locked でないものを削除した新スケジュールを
// 返す。該当する合同グループが無ければ schedule をそのまま返す。
export function cleanupOldCombined(schedule, config, combinedGroups, dateId, periodId, classId, oldSubject) {
  if (!oldSubject) return schedule;
  const dateEnt = findEntityById(config.dates, dateId);
  const classEnt = findEntityById(config.classes, classId);
  if (!dateEnt || !classEnt) return schedule;
  const group = findCombinedGroup(combinedGroups, oldSubject, classEnt.label, dateEnt.label);
  if (!group) return schedule;

  const newSchedule = { ...schedule };
  let mutated = false;
  group.classes.forEach(gcLabel => {
    const gcEnt = config.classes.find(cc => cc.label === gcLabel);
    if (!gcEnt || gcEnt.id === classId) return;
    const gk = makeKey(dateId, periodId, gcEnt.id);
    if (newSchedule[gk]?.subject === oldSubject && !newSchedule[gk]?.locked) {
      delete newSchedule[gk];
      mutated = true;
    }
  });
  return mutated ? newSchedule : schedule;
}

// (dateId, periodId, classId) に対応するセルが属する合同グループの secondary
// セルのうち locked でないものを entry の subject/teacher で上書きした新
// スケジュールを返す。entry に teacher が無い場合は teacher: '' を入れる
// (handleAssign の subject 変更時の挙動と整合)。entry.subject が空なら何もしない。
// 該当する合同グループが無ければ schedule をそのまま返す。
//
// 注意: subject 変更 / paste / swap など「セルを丸ごと書き換える」操作で使う。
// 講師だけを変える場合は propagateTeacherChange を使うこと (ユーザが手動で
// 切り離した secondary の subject を勝手に再接続しない挙動が必要)。
export function propagateAssignment(schedule, config, combinedGroups, dateId, periodId, classId, entry) {
  if (!entry?.subject) return schedule;
  const dateEnt = findEntityById(config.dates, dateId);
  const classEnt = findEntityById(config.classes, classId);
  if (!dateEnt || !classEnt) return schedule;
  const group = findCombinedGroup(combinedGroups, entry.subject, classEnt.label, dateEnt.label);
  if (!group) return schedule;

  const newSchedule = { ...schedule };
  let mutated = false;
  group.classes.forEach(gcLabel => {
    const gcEnt = config.classes.find(cc => cc.label === gcLabel);
    if (!gcEnt || gcEnt.id === classId) return;
    const gk = makeKey(dateId, periodId, gcEnt.id);
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
export function propagateTeacherChange(schedule, config, combinedGroups, dateId, periodId, classId, subject, teacher) {
  if (!subject) return schedule;
  const dateEnt = findEntityById(config.dates, dateId);
  const classEnt = findEntityById(config.classes, classId);
  if (!dateEnt || !classEnt) return schedule;
  const group = findCombinedGroup(combinedGroups, subject, classEnt.label, dateEnt.label);
  if (!group) return schedule;

  const newSchedule = { ...schedule };
  let mutated = false;
  group.classes.forEach(gcLabel => {
    const gcEnt = config.classes.find(cc => cc.label === gcLabel);
    if (!gcEnt || gcEnt.id === classId) return;
    const gk = makeKey(dateId, periodId, gcEnt.id);
    if (newSchedule[gk]?.subject === subject && !newSchedule[gk]?.locked) {
      newSchedule[gk] = { ...newSchedule[gk], teacher };
      mutated = true;
    }
  });
  return mutated ? newSchedule : schedule;
}
