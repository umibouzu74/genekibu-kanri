// ─── 合同 (結合) コマの作成・変更 (セル右クリック → ⊞ 合同) ─────────
// 合同はデータ上「範囲/列挙ラベルのクラス列」(mergedColumns 参照) なので、
// 合同の作成・変更は「セルを別のクラス列へ移す」操作に還元できる:
//   - 対象クラスを広げる / 変える → 同スパンの空き合同列を再利用し、
//     無ければ範囲ラベル (SS〜S 等) の列を新設して移動
//   - 1 クラスだけ選ぶ → その通常クラス列へ移動 (合同の解除)
//   - 移動で空になった合同列は削除する (通常クラス列は削除しない)
// 複数の op (確認テストの並列監督を SS〜S と A〜C に分け合う等) は 1 つの
// トランザクションとして検証する — 片方ずつでは中間状態が必ず範囲交差に
// なる操作を、最終形で判定することで通せるようにする。
// 移動後も結合表示が保てること (mergeFallback に落ちないこと) を事前に
// 検証し、崩れる移動は all-or-nothing でエラーにする。

import { nextNumericId } from "../utils/schema";
import { computeMergeLayout } from "./mergedColumns";
import { classRoomForDay, makeCellKey, parseCellKey, REGULAR_DAYS } from "./model";

const RANGE_SEP_RE = /^.+?([〜～~]).+$/;

// 既存の合同範囲ラベルが使う区切り文字に合わせる (無ければ "〜")。
// 全角チルダ入力のタブに波ダッシュの列が混ざる表記ゆれを防ぐ
function rangeSeparator(layout) {
  for (const r of layout.ranges) {
    const m = RANGE_SEP_RE.exec(r.cls.label || "");
    if (m) return m[1];
  }
  return "〜";
}

/**
 * セルの現在の合同構成。合同列なら構成クラス全員、通常列なら自分だけ。
 * @returns {{isJoint: boolean, memberIds: number[]}} memberIds は表示列
 *   (通常クラス列) の id (表示順)
 */
export function jointMembersOf(tab, classId) {
  const layout = computeMergeLayout(tab);
  const r = layout.ranges.find((x) => x.cls.id === classId);
  if (r) {
    return {
      isJoint: true,
      memberIds: layout.visible
        .slice(r.startIdx, r.endIdx + 1)
        .map((c) => c.id),
    };
  }
  return { isJoint: false, memberIds: [classId] };
}

/**
 * 列の有効なセル (タブ設定内の曜日・時限のもの) を曜日 → 時限順で返す。
 * 「この列の他のコマにも適用」の対象列挙用。残骸セルは含めない。
 * @returns {{key: string, cell: object, day: string, periodId: number}[]}
 */
export function columnCells(tab, classId) {
  const dayset = new Set(tab.days || []);
  const pids = tab.periodIds || [];
  const out = [];
  for (const [key, cell] of Object.entries(tab.schedule || {})) {
    const pos = parseCellKey(key);
    if (pos.classId !== classId) continue;
    if (!dayset.has(pos.day) || !pids.includes(pos.periodId)) continue;
    out.push({ key, cell, day: pos.day, periodId: pos.periodId });
  }
  out.sort(
    (a, b) =>
      REGULAR_DAYS.indexOf(a.day) - REGULAR_DAYS.indexOf(b.day) ||
      pids.indexOf(a.periodId) - pids.indexOf(b.periodId)
  );
  return out;
}

/**
 * ops をまとめて適用した新しいタブを返す純関数。各 op は「同一列のセル
 * keys を memberIds のクラス構成の合同へ移す」(memberIds が 1 つなら
 * 通常コマ化)。複数 op は最終形で検証・適用する 1 トランザクション。
 * @param {object} tab RegularProject のタブ
 * @param {{keys: string[], memberIds: number[]}[]} ops
 *   keys: 移動するセルの cellKey (op 内はすべて同じクラス列のもの)、
 *   memberIds: 合同に含める通常クラス列の id (表示順で連続)
 * @param {{periods?: object[]}} [opts] periods はエラー文言の時限表示用
 * @returns {{ok: true, tab: object, moves: {fromKey: string, toKey: string}[],
 *            created: string[], removedSources: string[],
 *            parts: {fromLabel: string, toLabel: string, toPlain: boolean,
 *                    moved: number}[]}
 *          |{ok: false, errors: string[]}}
 */
export function changeJoint(tab, ops, { periods = [] } = {}) {
  const fail = (...errors) => ({ ok: false, errors });
  const layout = computeMergeLayout(tab);
  const visible = layout.visible;
  const idxById = new Map(visible.map((c, i) => [c.id, i]));
  const perById = new Map(periods.map((p) => [p.id, p]));
  const rowLabel = (day, periodId) => {
    const p = perById.get(periodId);
    return `${day}曜 ${p?.label || p?.time || `時限${periodId}`}`;
  };

  // ── 各 op の検証 (表示列の id で表示順に連続・同一列・中身あり) ──
  if (!Array.isArray(ops) || ops.length === 0) {
    return fail("対象のコマがありません");
  }
  const seenKeys = new Set();
  const specs = [];
  for (const { keys = [], memberIds = [] } of ops) {
    const idxs = memberIds.map((id) => idxById.get(id));
    if (memberIds.length === 0 || idxs.some((i) => i == null)) {
      return fail("対象クラスを選択してください");
    }
    const s = Math.min(...idxs);
    const e = Math.max(...idxs);
    if (new Set(idxs).size !== e - s + 1) {
      return fail(
        "対象クラスは表の並びで連続している必要があります (間のクラスも含めてください)"
      );
    }
    if (keys.length === 0) return fail("対象のコマがありません");
    const srcIds = new Set(keys.map((k) => parseCellKey(k).classId));
    if (srcIds.size !== 1) return fail("同じ列のコマだけをまとめて変更できます");
    const srcId = [...srcIds][0];
    const srcCls = (tab.classes || []).find((c) => c.id === srcId);
    if (!srcCls) return fail("移動元の列が見つかりません");
    for (const k of keys) {
      if (seenKeys.has(k)) return fail("同じコマが複数回指定されています");
      seenKeys.add(k);
      const cell = tab.schedule?.[k];
      if (!cell) return fail("空のセルは合同にできません");
      if (cell.locked) return fail("ロック中のコマは変更できません");
    }
    const srcRange = layout.ranges.find((r) => r.cls.id === srcId) || null;

    // 現在の構成と同じ選択は no-op
    const curS = srcRange ? srcRange.startIdx : idxById.get(srcId);
    const curE = srcRange ? srcRange.endIdx : idxById.get(srcId);
    if (curS === s && curE === e) {
      return fail("現在の合同と同じ構成です (変更がありません)");
    }
    specs.push({ keys, srcId, srcCls, srcRange, s, e, width: e - s + 1 });
  }
  const srcIdsAll = new Set(specs.map((x) => x.srcId));

  // ── 作業コピー: 全 op の移動セルを先に取り除いてから空き・衝突を
  //    最終形で判定する (並列の分け合いは中間状態が必ず交差するため) ──
  const schedule = { ...(tab.schedule || {}) };
  for (const spec of specs) {
    spec.moving = spec.keys.map((k) => {
      const cell = schedule[k];
      delete schedule[k];
      return { key: k, cell };
    });
    // 同スパンの既存合同列 (並列として再利用できる)。いずれかの op の
    // 移動元列は空になって削除されうるため再利用先にしない
    spec.sameSpanCols = layout.ranges
      .filter(
        (r) =>
          !srcIdsAll.has(r.cls.id) &&
          r.startIdx === spec.s &&
          r.endIdx === spec.e
      )
      .map((r) => r.cls);
  }
  let classes = [...(tab.classes || [])];
  const createdCols = []; // {col, s, e}
  const createdForSpan = (s, e) =>
    createdCols.filter((x) => x.s === s && x.e === e).map((x) => x.col);

  // 新しい合同列は「スパンの構成クラス・同スパン列」の直後に挿し、範囲 →
  // 列挙の順にラベルを試して、意図したスパンに解釈されることを検証する
  // (クラス名の重複や区切り文字を含むクラス名では解釈がずれるため)
  const makeJointColumn = (spec) => {
    const { s, e } = spec;
    const related = new Set([
      ...visible.slice(s, e + 1).map((c) => c.id),
      ...spec.sameSpanCols.map((c) => c.id),
      ...createdForSpan(s, e).map((c) => c.id),
    ]);
    const sep = rangeSeparator(layout);
    const labels = [
      `${visible[s].label}${sep}${visible[e].label}`,
      visible
        .slice(s, e + 1)
        .map((c) => c.label)
        .join("/"),
    ];
    for (const label of labels) {
      const id = nextNumericId(classes);
      const col = { id, label, room: spec.srcCls.room || "" };
      let at = -1;
      classes.forEach((c, i) => {
        if (related.has(c.id)) at = i;
      });
      const probe = [...classes];
      probe.splice(at + 1, 0, col);
      const lay2 = computeMergeLayout({ ...tab, classes: probe });
      const okParse =
        lay2.visible.length === visible.length &&
        lay2.ranges.some(
          (r) => r.cls.id === id && r.startIdx === s && r.endIdx === e
        );
      if (okParse) return { col, classes: probe };
    }
    return null;
  };

  const errors = [];
  const moves = [];
  for (const spec of specs) {
    const { s, e, width, srcCls } = spec;
    spec.toLabel = width === 1 ? visible[s].label : "";
    for (const mv of spec.moving) {
      const { day, periodId } = parseCellKey(mv.key);
      const at = (clsId) => schedule[makeCellKey(day, periodId, clsId)];

      // 1) スパン内の構成クラスに個別コマがあると結合表示できない
      //    (width 1 のときは移動先クラス列の占有チェックそのもの)
      for (let i = s; i <= e; i++) {
        if (!at(visible[i].id)) continue;
        errors.push(
          width === 1
            ? `${rowLabel(day, periodId)}: 移動先クラス「${visible[i].label}」に既にコマがあります`
            : `${rowLabel(day, periodId)}: 構成クラス「${visible[i].label}」に個別のコマがあるため合同にできません`
        );
      }
      // 2) 範囲の重なる別の合同コマ (同スパンの並列は width > 1 なら許容)。
      //    この操作で新設した列のコマも含めて最終形で判定する
      const joints = [
        ...layout.ranges.map((r) => ({
          id: r.cls.id,
          s: r.startIdx,
          e: r.endIdx,
          label: r.cls.label,
        })),
        ...createdCols.map((x) => ({
          id: x.col.id,
          s: x.s,
          e: x.e,
          label: x.col.label,
        })),
      ];
      for (const j of joints) {
        if (width > 1 && j.s === s && j.e === e) continue; // 並列
        if (j.s <= e && s <= j.e && at(j.id)) {
          errors.push(
            `${rowLabel(day, periodId)}: 合同「${j.label}」と範囲が重なるため移動できません`
          );
        }
      }
      // 3) 並列数がスパン幅を超えると幅 0 のセルが出る
      if (width > 1) {
        const parallels = [...spec.sameSpanCols, ...createdForSpan(s, e)].filter(
          (c) => at(c.id)
        ).length;
        if (parallels + 1 > width) {
          errors.push(
            `${rowLabel(day, periodId)}: 同じ範囲の並列コマが幅 (${width} クラス) を超えるため移動できません`
          );
        }
      }
      if (errors.length) continue; // エラーは全件集めるが配置はしない

      // 配置先: width 1 は通常クラス列、それ以外は空きの同スパン列 (無ければ新設)
      let target;
      if (width === 1) {
        target = visible[s];
      } else {
        target = [...spec.sameSpanCols, ...createdForSpan(s, e)].find(
          (c) => !at(c.id)
        );
        if (!target) {
          const made = makeJointColumn(spec);
          if (!made) {
            errors.push(
              "合同列のラベルを作れません (クラス名に「〜」「/」や重複した名前があると合同にできません)"
            );
            continue;
          }
          classes = made.classes;
          createdCols.push({ col: made.col, s, e });
          target = made.col;
        }
      }
      spec.toLabel = target.label;

      // 実効教室を保つ: セルに教室が無ければ移動元列のその曜日の既定教室
      // (曜日別 → 基本) を引き継ぎ、移動先列の同曜日の既定と同じなら省略に
      // 正規化する (setClassRoom と同じ思想)。教室しか無いセルは省略すると
      // 空セルになり同期サニタイズで消えるため、その場合だけ既定と同じでも
      // 教室を残す
      const eff = (mv.cell.room || "").trim() || classRoomForDay(srcCls, day);
      const { room: _room, ...out } = mv.cell;
      if (
        eff &&
        (eff !== classRoomForDay(target, day) || Object.keys(out).length === 0)
      ) {
        out.room = eff;
      }
      const toKey = makeCellKey(day, periodId, target.id);
      schedule[toKey] = out;
      moves.push({ fromKey: mv.key, toKey });
    }
  }

  if (errors.length) return fail(...new Set(errors));

  // ── 空になった合同列は削除する (通常クラス列は残す) ──
  const removedSources = [];
  for (const spec of specs) {
    if (
      spec.srcRange &&
      !Object.keys(schedule).some((k) => parseCellKey(k).classId === spec.srcId)
    ) {
      classes = classes.filter((c) => c.id !== spec.srcId);
      removedSources.push(spec.srcCls.label);
    }
  }

  return {
    ok: true,
    tab: { ...tab, classes, schedule },
    moves,
    created: createdCols.map((x) => x.col.label),
    removedSources,
    parts: specs.map((x) => ({
      fromLabel: x.srcCls.label || x.srcCls.room || "?",
      toLabel: x.toLabel,
      toPlain: x.width === 1,
      moved: x.moving.length,
    })),
  };
}
