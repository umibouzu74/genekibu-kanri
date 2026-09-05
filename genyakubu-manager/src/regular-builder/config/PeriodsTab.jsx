import { useState } from "react";
import { isWellFormedTimeRange } from "../../utils/timeBulkEdit";
import { useToasts } from "../../hooks/useToasts";
import { useConfirm } from "../../hooks/useConfirm";
import {
  countCellsForPeriod,
  nextPeriodId,
  removePeriodFromProject,
  shiftPeriodTimes,
} from "../model";
import { UI } from "../ui";
import { move } from "./shared";

// ⚙ 全体設定 → 🕐 時限 (全タブ共通の時限プール)
export function PeriodsTab({ project, saveProject }) {
  const toasts = useToasts();
  const confirm = useConfirm();

  const updatePeriod = (id, patch) =>
    saveProject((p) => ({
      ...p,
      periods: p.periods.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));

  const addPeriod = () =>
    saveProject((p) => ({
      ...p,
      periods: [
        ...p.periods,
        { id: nextPeriodId(p), label: `${p.periods.length + 1}限`, time: "" },
      ],
    }));

  // 時限の削除は全学年のその時限のコマを巻き込む (cascade) ため確認を挟む
  // (CLAUDE.md 削除 UX ルールの confirmedRemove 相当)。件数は表示用に現在の
  // project で数え、保存は saveProject の最新値で再計算する
  const removePeriod = async (per) => {
    const cells = countCellsForPeriod(project, per.id);
    if (cells > 0) {
      const ok = await confirm({
        title: "時限の削除",
        message:
          `時限「${per.label || per.time || `id:${per.id}`}」を削除しますか？\n` +
          `この時限に入力済みのコマ ${cells} 件も削除されます（全学年）。\n` +
          `（Ctrl+Z で戻せます）`,
        okLabel: "削除する",
        tone: "danger",
      });
      if (!ok) return;
    }
    saveProject((p) => removePeriodFromProject(p, per.id).project, {
      atomic: true,
    });
    if (cells > 0) {
      toasts.success(`時限を削除しました（コマ ${cells} 件も削除）`);
    }
  };

  // 時限の一括時刻シフト (期切替の「全体を 15 分後ろへ」)。件数は表示用に
  // 現在の project で数え、保存は saveProject の最新値で再計算する
  const [shiftMinutes, setShiftMinutes] = useState("15");
  const shiftAllPeriods = (sign) => {
    const delta = sign * Number(shiftMinutes);
    if (!Number.isFinite(delta) || delta === 0) {
      toasts.error("ずらす分数を入力してください");
      return;
    }
    const res = shiftPeriodTimes(project, delta);
    if (res.shifted === 0) {
      toasts.info(
        res.skipped.length > 0
          ? `ずらせる時限がありません（${res.skipped.join("・")} は時刻が未設定か範囲外です）`
          : "ずらせる時限がありません（時刻を設定してください）"
      );
      return;
    }
    saveProject((p) => shiftPeriodTimes(p, delta).project, { atomic: true });
    const parts = [
      `${res.shifted} 件の時限を ${Math.abs(delta)} 分${delta > 0 ? "後ろへ" : "前へ"}ずらしました`,
    ];
    if (res.skipped.length > 0)
      parts.push(`${res.skipped.join("・")} は据え置き（時刻が未設定か範囲外）`);
    toasts.success(`${parts.join("。")}（Ctrl+Z で戻せます）`, { duration: 5000 });
  };

  return (
    <>
      <div className={UI.hint}>
        時刻は「HH:MM-HH:MM」形式。
        学年で時刻が違う場合は「中3 1限」「中12 1限」のように別の時限として登録し、各学年の設定で使う時限を選びます。
      </div>
      {project.periods.map((per, idx) => {
        const bad = per.time.trim() && !isWellFormedTimeRange(per.time);
        return (
          <div key={per.id} className="flex items-center gap-1.5 flex-wrap">
            <input
              type="text"
              value={per.label}
              onChange={(e) => updatePeriod(per.id, { label: e.target.value })}
              placeholder="1限"
              className={`${UI.input} w-28`}
            />
            <input
              type="text"
              value={per.time}
              onChange={(e) => updatePeriod(per.id, { time: e.target.value })}
              placeholder="18:00-18:45"
              className={`${UI.input} w-32 ${bad ? "border-builder-red" : ""}`}
            />
            {bad && (
              <span className="text-[10px] text-builder-red">形式が不正です</span>
            )}
            <button
              type="button"
              className={UI.btn}
              onClick={() =>
                saveProject((p) => ({ ...p, periods: move(p.periods, idx, -1) }))
              }
            >
              ↑
            </button>
            <button
              type="button"
              className={UI.btn}
              onClick={() =>
                saveProject((p) => ({ ...p, periods: move(p.periods, idx, 1) }))
              }
            >
              ↓
            </button>
            <button
              type="button"
              className={UI.btnDanger}
              onClick={() => removePeriod(per)}
            >
              削除
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" className={UI.btn} onClick={addPeriod}>
          + 時限を追加
        </button>
        {/* 期切替の「全体を 15 分後ろへ」を 1 操作で。時限 id は
            変わらないのでセルの中身は動かない */}
        {project.periods.length > 0 && (
          <span className="inline-flex items-center gap-1 ml-2 text-[11px] text-builder-ink">
            全時限を
            <input
              type="number"
              value={shiftMinutes}
              onChange={(e) => setShiftMinutes(e.target.value)}
              aria-label="ずらす分数 (正で後ろへ・負で前へ)"
              className={`${UI.input} w-16`}
            />
            分
            <button
              type="button"
              className={UI.btn}
              onClick={() => shiftAllPeriods(-1)}
              title="全時限の時刻をこの分数だけ前倒しする（コマの中身は動きません）"
            >
              ◂ 前へ
            </button>
            <button
              type="button"
              className={UI.btn}
              onClick={() => shiftAllPeriods(1)}
              title="全時限の時刻をこの分数だけ後ろへずらす（コマの中身は動きません）"
            >
              後ろへ ▸
            </button>
          </span>
        )}
      </div>
    </>
  );
}
