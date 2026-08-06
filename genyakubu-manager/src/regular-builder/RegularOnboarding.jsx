import { UI } from "./ui";

// ─── はじめかたガイド (RB23) ────────────────────────────────────────
// 最初のコマが入るまでの間だけ表示する状態連動チェックリスト。
// 完了判定は project の実データから導出する (保存領域は増やさない —
// 使用統計の学習ではなく、現在の状態の写像)。各ステップのボタンで
// 該当 UI (全体設定の該当タブ・学年追加・本体から取込) へ直接飛べる。
// 最初のコマが入るとガイドごと消える (App 側の表示条件)。

export function RegularOnboarding({
  project,
  /** (tabId) => void 全体設定モーダルを指定タブで開く */
  onOpenConfig,
  onAddTab,
  onOpenImport,
}) {
  const hasPeriods = (project.periods || []).length > 0;
  const hasTeachers = (project.teachers || []).length > 0;
  const hasGrid = (project.tabs || []).some(
    (t) =>
      (t.days || []).length > 0 &&
      (t.periodIds || []).length > 0 &&
      (t.classes || []).length > 0
  );
  const steps = [
    {
      done: hasPeriods,
      label: "時限（時刻付き）を登録する",
      detail:
        "時刻は「HH:MM-HH:MM」形式。学年で時刻が違う場合は「中3 1限」「中12 1限」のように別の時限にします",
      action: () => onOpenConfig("periods"),
      actionLabel: "⚙ 時限を開く",
    },
    {
      done: hasTeachers,
      label: "講師を登録する",
      detail: "本体のコマからの一括取込が早いです（マスタ外はセルの直接入力でも入ります）",
      action: () => onOpenConfig("teachers"),
      actionLabel: "⚙ 講師を開く",
    },
    {
      done: hasGrid,
      label: "学年を作る（曜日・使う時限・クラス）",
      detail: "クラス列には既定教室を設定できます（セル側で上書き可）",
      action: onAddTab,
      actionLabel: "+ 学年追加",
    },
    {
      done: false,
      label: "マス目に教科・講師を入れる",
      detail:
        "クリックで編集・ドラッグで入替。講師・教室・クラスの重複と講師NG は自動チェック。完成したら「⤴ 本体へ反映」",
      action: null,
    },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <div className="no-print bg-builder-info-soft border border-dashed border-builder-info-border rounded-lg p-4 text-xs text-builder-ink flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-extrabold text-[13px]">はじめかた</span>
        <span className="text-builder-ink-muted">今の時間割から始めるなら:</span>
        <button type="button" className={UI.btnBlue} onClick={onOpenImport}>
          ⬇ 本体から取込（おすすめ）
        </button>
        <span className="text-builder-ink-subtle">
          「中3 の 2学期変更を適用する」にチェックを入れると 2学期のたたき台が一発でできます。ゼロから組むなら下の手順で。
        </span>
      </div>
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-center gap-2 flex-wrap ${s.done ? "opacity-55" : ""}`}
        >
          <span aria-hidden="true" className="w-5 text-center shrink-0">
            {s.done ? "✅" : s === next ? "👉" : "⬜"}
          </span>
          <span className={`font-bold ${s.done ? "line-through" : ""}`}>
            {i + 1}. {s.label}
          </span>
          {!s.done && s.action && (
            <button type="button" className={UI.btn} onClick={s.action}>
              {s.actionLabel}
            </button>
          )}
          <span className="text-builder-ink-subtle">{s.detail}</span>
        </div>
      ))}
    </div>
  );
}
