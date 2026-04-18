// 先生欠勤ワークフローの一括保存ヘルパ。
// 代行・合同/移動・回数補正の 3 種の変更を 1 回のまとまりとして保存する。
// 内部的には各ストレージの save*() を順次呼ぶだけだが、ID採番・タイムスタンプ
// 付与・保存順をここに集約することで呼び出し側を単純化する。

function nextId(list) {
  let max = 0;
  for (const x of list) {
    const v = Number(x?.id);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max + 1;
}

/**
 * @param {object} args
 * @param {Array} args.subsList              現在の代行レコード配列
 * @param {Array} args.adjustmentsList       現在の時間割調整配列
 * @param {Array} args.sessionOverridesList  現在の回数補正配列
 * @param {Array} args.draftSubs             追加する代行 (date, slotId, originalTeacher, substitute, status, memo)
 * @param {Array} args.draftAdjustments      追加する調整 (date, type, slotId, targetTime?, combineSlotIds?, memo)
 * @param {Array} args.draftOverrides        追加する回数補正 (date, slotId, mode, value?, displayAs?, memo)
 * @param {Function} args.saveSubs
 * @param {Function} args.saveAdjustments
 * @param {Function} args.saveSessionOverrides
 * @returns {{added: {subs: number, adjustments: number, overrides: number}}}
 */
export function saveAbsenceBatch({
  subsList,
  adjustmentsList,
  sessionOverridesList,
  draftSubs = [],
  draftAdjustments = [],
  draftOverrides = [],
  saveSubs,
  saveAdjustments,
  saveSessionOverrides,
}) {
  const ts = new Date().toISOString();

  // Substitutes
  let subId = nextId(subsList);
  const newSubs = draftSubs.map((r) => ({
    ...r,
    status: r.substitute ? (r.status || "confirmed") : "requested",
    id: subId++,
    createdAt: ts,
    updatedAt: ts,
  }));

  // Adjustments
  let adjId = nextId(adjustmentsList);
  const newAdjs = draftAdjustments.map((a) => ({
    ...a,
    id: adjId++,
    createdAt: ts,
  }));

  // Session overrides - dedupe by (slotId, date): if draft contains an entry
  // matching an existing override, replace it.
  let ovId = nextId(sessionOverridesList);
  const draftKeys = new Set(
    draftOverrides.map((o) => `${o.slotId}|${o.date}`)
  );
  const keptOverrides = sessionOverridesList.filter(
    (o) => !draftKeys.has(`${o.slotId}|${o.date}`)
  );
  const newOverrides = draftOverrides.map((o) => ({
    ...o,
    id: ovId++,
    createdAt: ts,
  }));

  if (newSubs.length > 0) saveSubs([...subsList, ...newSubs]);
  if (newAdjs.length > 0) saveAdjustments([...adjustmentsList, ...newAdjs]);
  if (newOverrides.length > 0 || keptOverrides.length !== sessionOverridesList.length) {
    saveSessionOverrides([...keptOverrides, ...newOverrides]);
  }

  return {
    added: {
      subs: newSubs.length,
      adjustments: newAdjs.length,
      overrides: newOverrides.length,
    },
  };
}
