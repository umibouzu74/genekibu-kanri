import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
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
    fillSubjectCounts,
    copySubjectCountsToOthers,
  } = useProjectContext();
  const { showInput, showConfirm, showToast } = useUI();

  const tabs = project.tabs;

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
      `「${tab.name}」の科目コマ数を他の全タブへコピーしますか？\n他タブの既存のコマ数設定は上書きされます (Undo で戻せます)。`,
      { title: 'コマ数のコピー', confirmLabel: 'コピーする' },
    );
    if (!ok) return;
    copySubjectCountsToOthers(tab.id);
    showToast(`「${tab.name}」のコマ数を他のタブへコピーしました`, 'success', 3000);
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
      </div>
      {/* 科目ごとに、各タブ (学年) のコマ数を横並びで編集する。
          ヘッダ行でタブ名を示し、列をそろえる。 */}
      <div className="flex items-center gap-2 px-2 text-[11px] font-bold text-builder-ink-muted">
        <div className="w-4" />
        <span className="flex-1">科目</span>
        {tabs.map((tab) => (
          <span key={tab.id} className="w-16 text-center">
            <span className="block truncate" title={tab.name}>{tab.name}</span>
            {/* L4a: 列単位の一括入力・他タブへのコピー */}
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
            </span>
          </span>
        ))}
        <span className="w-5" />
      </div>
      <div className="space-y-1">
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
            <span className="font-bold text-sm flex-1 text-builder-ink">{s}</span>
            {tabs.map((tab) => (
              <DraftNumberInput
                key={tab.id}
                aria-label={`${tab.name} の ${s} コマ数`}
                className="w-16 text-right text-sm border border-builder-border rounded px-1 py-0.5"
                value={tab.config.subjectCounts[s] || 0}
                onCommit={(v) => handleSubjectCountChange(s, v, tab.id)}
                min={0}
              />
            ))}
            <button
              onClick={() => handleRemoveClick(s)}
              className="text-builder-ink-muted hover:text-builder-red text-sm px-1"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
