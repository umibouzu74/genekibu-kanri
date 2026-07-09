import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { effectiveConfigForTab } from '../../utils/scheduleKey';
import { quotaForClass, hasClassQuotaOverrides } from '../../utils/subjectQuota';
import DraftNumberInput from './DraftNumberInput';

export default function SubjectManager() {
  const {
    project,
    commonSubjects,
    addSubject,
    addSubjects,
    removeSubject,
    reorderSubjects,
    handleSubjectCountChange,
    handleClassSubjectCountChange,
    setClassSubjectCountsMode,
    fillSubjectCounts,
    copySubjectCountsToOthers,
  } = useProjectContext();
  const { showInput, showConfirm, showToast } = useUI();

  const tabs = project.tabs;

  // §N: クラス別コマ数モード。classSubjectCounts の有無 ({} も ON) で判定し、
  // ON のタブは列がクラスごとの入力に分かれる。
  const isPerClass = (tab) => !!tab.config.classSubjectCounts && (tab.config.classes || []).length > 0;

  // L4d: カンマ区切りで複数科目を一括追加できる (クラスの一括 textarea と
  // 同じ思想。8 科目 8 回モーダルの解消)。単一名は従来の subject/add。
  // §M: 全角カンマ「，」(IME 設定で頻出) も区切りに含める。重複スキップは
  // reducer 側で silent なので、件数の内訳を toast で伝える。
  const handleAddClick = async () => {
    const name = await showInput(
      "科目名を入力してください (カンマ区切りで複数追加できます)",
      { title: "科目の追加", placeholder: "例: 情報, 小論文" },
    );
    if (!name) return;
    const names = [...new Set(name.split(/[,、，]/).map(s => s.trim()).filter(Boolean))];
    if (names.length === 0) return;
    if (names.length === 1) {
      addSubject(names[0]);
      return;
    }
    const existing = new Set(commonSubjects);
    const freshCount = names.filter(n => !existing.has(n)).length;
    addSubjects(names);
    showToast(
      freshCount === names.length
        ? `${freshCount} 科目を追加しました`
        : `${freshCount} 科目を追加しました (登録済み ${names.length - freshCount} 件はスキップ)`,
      'success', 3000,
    );
  };

  // L4a: 列 (タブ) 単位の一括入力。「英語も数学も 4 コマ」を 1 回で。
  // §N: クラス別モード中はクラス別の上書きもクリアされる (reducer 側)。
  const handleFillClick = async (tab) => {
    const raw = await showInput(
      `「${tab.name}」の全科目を何コマにしますか？`,
      { title: 'コマ数の一括入力', placeholder: '例: 4' },
    );
    if (raw == null || raw.trim() === '') return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      showToast('0 以上の数値を入力してください', 'error', 3000);
      return;
    }
    // §M: 丸めは UI 側で確定してから渡す (toast の表示値と reducer の
    // 格納値がズレないように)
    const rounded = Math.round(n);
    fillSubjectCounts(tab.id, rounded);
    showToast(`「${tab.name}」の全科目を ${rounded} コマにしました`, 'success', 3000);
  };

  // L4a: 列 (タブ) の値を他の全タブへコピー。「中3 の値を中1・2 にも」。
  const handleCopyCountsClick = async (tab) => {
    const ok = await showConfirm(
      `「${tab.name}」の科目コマ数を他の全タブへコピーしますか？\n他タブの既存のコマ数設定 (クラス別の設定を含む) は上書きされます (Undo で戻せます)。`,
      { title: 'コマ数のコピー', confirmLabel: 'コピーする' },
    );
    if (!ok) return;
    copySubjectCountsToOthers(tab.id);
    showToast(`「${tab.name}」のコマ数を他のタブへコピーしました`, 'success', 3000);
  };

  // §N: クラス別モードの切り替え。解除時に上書きが残っていれば破棄の確認を挟む。
  const handleTogglePerClass = async (tab) => {
    if (!tab.config.classSubjectCounts) {
      setClassSubjectCountsMode(tab.id, true);
      return;
    }
    if (hasClassQuotaOverrides(tab.config)) {
      const ok = await showConfirm(
        `「${tab.name}」のクラス別のコマ数設定を破棄して、全クラス共通のコマ数に戻しますか？ (Undo で戻せます)`,
        { title: 'クラス別設定の解除', confirmLabel: '共通に戻す' },
      );
      if (!ok) return;
    }
    setClassSubjectCountsMode(tab.id, false);
  };

  const handleRemoveClick = async (name) => {
    const ok = await showConfirm(`「${name}」を削除しますか？\nスケジュール上のこの科目のデータと、講師の担当科目設定も削除されます。`, { title: "科目の削除", danger: true, confirmLabel: "削除" });
    if (ok) removeSubject(name);
  };

  const moveUp = (idx) => {
    if (idx > 0) reorderSubjects(idx, idx - 1);
  };

  const moveDown = (idx) => {
    if (idx < commonSubjects.length - 1) reorderSubjects(idx, idx + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-builder-border pb-1">
        <h3 className="font-bold text-builder-ink">📚 科目マスタ</h3>
        <button onClick={handleAddClick} className="text-xs bg-builder-primary text-white px-2 py-1 rounded shadow hover:bg-builder-primary-hover">+ 追加</button>
      </div>
      <div className="text-xs text-builder-ink-muted bg-builder-surface-alt p-2 rounded border border-builder-border">
        科目の追加・削除・並び替えは全タブ共通です。コマ数 (上限) はタブ (学年) ごとに設定できます。
        同じタブの中でクラスごとにコマ数を変えたい場合は、列見出しの ▦ でクラス別の設定に切り替えられます。
      </div>
      {/* §N: クラス別モードのタブは列がクラス数分に分かれて横に広がるため、
          見出し・入力・合計を 1 つの横スクロール領域にまとめる。 */}
      <div className="overflow-x-auto">
        <div className="min-w-max space-y-1">
          {/* 科目ごとに、各タブ (学年) のコマ数を横並びで編集する。
              ヘッダ行でタブ名を示し、列をそろえる。 */}
          <div className="flex items-center gap-2 px-2 text-[11px] font-bold text-builder-ink-muted">
            <div className="w-4" />
            <span className="flex-1 min-w-24">科目</span>
            {tabs.map((tab) => {
              const perClass = isPerClass(tab);
              const classes = tab.config.classes || [];
              return (
                <span key={tab.id} className={perClass ? '' : 'w-16'}>
                  <span className="block truncate text-center" title={tab.name}>{tab.name}</span>
                  {/* L4a: 列単位の一括入力・他タブへのコピー / §N: クラス別切替 */}
                  <span className="flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleFillClick(tab)}
                      aria-label={`${tab.name} の全科目のコマ数を一括入力`}
                      title="この列の全科目を同じコマ数にします"
                      className="text-builder-ink-ghost hover:text-builder-blue leading-none"
                    >⚡</button>
                    {tabs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleCopyCountsClick(tab)}
                        aria-label={`${tab.name} のコマ数を他の全タブへコピー`}
                        title="この列の値を他の全タブへコピーします"
                        className="text-builder-ink-ghost hover:text-builder-blue leading-none"
                      >⧉</button>
                    )}
                    {classes.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => handleTogglePerClass(tab)}
                        aria-label={perClass
                          ? `${tab.name} のクラス別コマ数を解除`
                          : `${tab.name} のコマ数をクラス別に設定`}
                        title={perClass
                          ? 'クラス別のコマ数設定を解除して全クラス共通に戻します'
                          : 'クラスごとに別々のコマ数を設定します (学年混在タブ用)'}
                        className={`leading-none ${perClass ? 'text-builder-blue' : 'text-builder-ink-ghost hover:text-builder-blue'}`}
                      >▦</button>
                    )}
                  </span>
                  {perClass && (
                    <span className="flex gap-2 mt-0.5">
                      {classes.map((c) => (
                        <span key={c.id} className="w-16 text-center truncate" title={c.label}>{c.label}</span>
                      ))}
                    </span>
                  )}
                </span>
              );
            })}
            <span className="w-5" />
          </div>
          {commonSubjects.map((s, idx) => (
            <div key={s} className="flex items-center gap-2 bg-builder-surface border border-builder-border rounded p-2">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="text-[10px] text-builder-ink-muted hover:text-builder-ink disabled:opacity-20 leading-none"
                >▲</button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === commonSubjects.length - 1}
                  className="text-[10px] text-builder-ink-muted hover:text-builder-ink disabled:opacity-20 leading-none"
                >▼</button>
              </div>
              <span className="font-bold text-sm flex-1 min-w-24 text-builder-ink">{s}</span>
              {tabs.map((tab) => {
                if (!isPerClass(tab)) {
                  return (
                    <DraftNumberInput
                      key={tab.id}
                      aria-label={`${tab.name} の ${s} コマ数`}
                      className="w-16 text-right text-sm border border-builder-border rounded px-1 py-0.5"
                      value={tab.config.subjectCounts[s] || 0}
                      onCommit={(v) => handleSubjectCountChange(s, v, tab.id)}
                      min={0}
                    />
                  );
                }
                // §N: クラス別モード — クラスごとの実効値を表示し、編集は
                // 上書きとして保存する。上書き中 (共通値と別) の入力は
                // 枠色で見分けられるようにする。
                return (
                  <span key={tab.id} className="flex gap-2">
                    {(tab.config.classes || []).map((c) => {
                      const overridden = tab.config.classSubjectCounts?.[String(c.id)]?.[s] != null;
                      return (
                        <DraftNumberInput
                          key={c.id}
                          aria-label={`${tab.name} ${c.label} の ${s} コマ数`}
                          className={`w-16 text-right text-sm border rounded px-1 py-0.5 ${overridden ? 'border-builder-blue' : 'border-builder-border'}`}
                          value={quotaForClass(tab.config, c.id, s)}
                          onCommit={(v) => handleClassSubjectCountChange(s, c.id, v, tab.id)}
                          min={0}
                        />
                      );
                    })}
                  </span>
                );
              })}
              <button
                onClick={() => handleRemoveClick(s)}
                className="text-builder-ink-muted hover:text-builder-red text-sm px-1"
              >×</button>
            </div>
          ))}
          {/* N4e: 列合計と収容枠 (クラスあたり: 使う日 × 使う時限 − の対比)。
              入力中に「入れ過ぎ / 入れ足りない」へ設定段階で気づけるようにする。
              超過は solver 的にも完全解が不可能な設定 (quotaCellMismatch と同根)。
              §N: クォータは 1 クラスあたりの値なので、収容枠もクラスあたりの
              セル数 (使う日 × 使う時限) と比較する。クラス別モードのタブは
              クラスごとに合計を出す。 */}
          {commonSubjects.length > 0 && (
            <div className="flex items-center gap-2 px-2 pt-1 text-[11px] text-builder-ink-muted">
              <div className="w-4" />
              <span className="flex-1 min-w-24 font-bold">合計 / 収容枠</span>
              {tabs.map((tab) => {
                const cfg = effectiveConfigForTab(project, tab);
                const capacity = cfg.dates.length * cfg.periods.length;
                const cell = (total: number, over: boolean, key: number | string, labelPrefix: string) => (
                  <span
                    key={key}
                    className={`w-16 text-center font-bold ${over ? 'text-builder-red' : 'text-builder-ink-muted'}`}
                    title={over
                      ? `コマ数の合計 (${total}) が ${labelPrefix} の収容枠 (使う日 × 使う時限 = ${capacity}) を超えています。全てを配置することはできません`
                      : `${labelPrefix} のコマ数合計 ${total} / 収容枠 ${capacity} (使う日 × 使う時限)`}
                    aria-label={`${labelPrefix} のコマ数合計 ${total}、収容枠 ${capacity}${over ? ' (超過)' : ''}`}
                  >
                    {over ? '⚠' : ''}{total}/{capacity}
                  </span>
                );
                if (!isPerClass(tab)) {
                  const total = commonSubjects.reduce((sum, s) => sum + (Number(tab.config.subjectCounts[s]) || 0), 0);
                  return cell(total, total > capacity, tab.id, tab.name);
                }
                return (
                  <span key={tab.id} className="flex gap-2">
                    {(tab.config.classes || []).map((c) => {
                      const total = commonSubjects.reduce((sum, s) => sum + quotaForClass(tab.config, c.id, s), 0);
                      return cell(total, total > capacity, c.id, `${tab.name} ${c.label}`);
                    })}
                  </span>
                );
              })}
              <span className="w-5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
