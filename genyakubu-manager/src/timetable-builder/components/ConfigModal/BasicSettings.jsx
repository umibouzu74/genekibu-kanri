import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { generateDateLabels, WEEKDAY_LABELS } from '../../utils/dateGenerate';

export default function BasicSettings() {
  const {
    project,
    activeTab,
    currentConfig,
    handleListConfigChange,
    handleSaveAsDefault,
    handleSetTabDatesByLabels,
    handleToggleTabDate,
    handleSetAllTabDates,
    handleRemoveDateFromPool,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();

  // v4(Y): project.dates は全タブ共通の『日付プール』。activeTab.config.activeDateIds
  // で「この学年が使う日」を選ぶ (未指定=全日)。NG はプール全日に設定できる。
  const poolDates = project.dates || [];
  const activeDateIds = activeTab.config.activeDateIds; // undefined = 全日
  const isActive = (id) => !activeDateIds || activeDateIds.includes(id);
  const activeCount = poolDates.filter(d => isActive(d.id)).length;

  // ── 日付ジェネレータ form state ──
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genWeekdays, setGenWeekdays] = useState(() => new Set([0, 1, 2, 3, 4, 5, 6]));
  const [genExclude, setGenExclude] = useState('');
  const [manualAdd, setManualAdd] = useState('');

  const toggleWeekday = (idx) => {
    setGenWeekdays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const runGenerate = (mode) => {
    const labels = generateDateLabels({
      startYmd: genStart,
      endYmd: genEnd,
      weekdays: [...genWeekdays],
      excludeYmd: genExclude.split(',').map(s => s.trim()).filter(Boolean),
    });
    if (labels.length === 0) {
      showToast('生成できる日付がありません（期間・曜日・除外日を確認してください）', 'error', 3500);
      return;
    }
    if (mode === 'append') {
      const current = poolDates.filter(d => isActive(d.id)).map(d => d.label);
      handleSetTabDatesByLabels([...current, ...labels]);
      showToast(`${labels.length} 日を「${activeTab.name}」に追加しました`, 'success', 2500);
    } else {
      handleSetTabDatesByLabels(labels);
      showToast(`「${activeTab.name}」の使う日を ${labels.length} 日に設定しました`, 'success', 2500);
    }
  };

  const addManual = () => {
    const labels = manualAdd.split(',').map(s => s.trim()).filter(Boolean);
    if (labels.length === 0) return;
    const current = poolDates.filter(d => isActive(d.id)).map(d => d.label);
    handleSetTabDatesByLabels([...current, ...labels]);
    setManualAdd('');
    showToast(`${labels.length} 件を追加しました`, 'success', 2000);
  };

  const removeFromPool = async (d) => {
    const ok = await showConfirm(
      `「${d.label}」を日付プールから完全に削除します。\n全タブ・講師不在/NG から消え、この日付に入っているコマも削除されます。\nよろしいですか?`,
      { title: '日付の完全削除', danger: true, confirmLabel: '削除する' },
    );
    if (ok) {
      handleRemoveDateFromPool(d.id);
      showToast(`「${d.label}」を削除しました`, 'success', 2000);
    }
  };

  // 時限 / クラス用 (カンマ区切りテキスト)
  const handleConfigChange = (key, value) => {
    const raw = value.split(',').map(s => s.trim());
    const filtered = raw.filter(s => s);
    if (raw.length !== filtered.length) {
      showToast('空の項目は除外されました', 'warning', 2000);
    }
    if (filtered.length === 0) {
      showToast('最低1つの項目が必要です', 'error', 3000);
      return;
    }
    handleListConfigChange(key, value);
  };

  const handleSaveDefaultClick = async () => {
    const ok = await showConfirm('現在の「講師設定」と「カレンダー構成」を初期値として保存しますか？\n次回リセット時にこの設定が読み込まれます。', { title: '初期値の保存', confirmLabel: '保存' });
    if (ok) {
      handleSaveAsDefault();
      showToast('保存しました。次回からこの設定が初期値になります。');
    }
  };

  const inputCls = 'border border-builder-border rounded px-2 py-1 text-sm bg-builder-surface text-builder-ink';

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-builder-ink border-b border-builder-border pb-1">📅 カレンダー設定</h3>
      <div className="bg-builder-info-soft p-2 text-xs text-builder-ink border border-builder-info-border rounded">
        <strong>仕組み:</strong> 日付は<strong>全タブ共通の「プール」</strong>で管理し、各学年タブは
        「この学年が実際に使う日」だけを選びます（期間がズレる学年も歯抜けの日もOK）。<br />
        講師不在・NG はプールの<strong>全日</strong>に設定できます。日付やクラス名は右クリックでも改名できます。
      </div>

      {/* ── この学年が使う日 ── */}
      <div className="border border-builder-blue/40 rounded p-3 bg-builder-info-soft/30 space-y-3">
        <div className="font-bold text-builder-ink text-sm">
          🗓 「{activeTab.name}」で使う日
          <span className="ml-2 text-xs font-normal text-builder-ink-muted">
            選択 {activeCount} / プール {poolDates.length} 日
          </span>
        </div>

        {/* 自動生成 */}
        <div className="border border-builder-border rounded p-2 bg-builder-surface space-y-2">
          <div className="text-xs font-bold text-builder-ink-muted">⚡ 期間から自動生成</div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex flex-col gap-0.5">
              <span className="text-builder-ink-muted">開始日</span>
              <input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} className={inputCls} aria-label="生成 開始日" />
            </label>
            <span className="pb-1.5 text-builder-ink-muted">〜</span>
            <label className="flex flex-col gap-0.5">
              <span className="text-builder-ink-muted">終了日</span>
              <input type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} className={inputCls} aria-label="生成 終了日" />
            </label>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-builder-ink-muted">対象曜日</span>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_LABELS.map((wd, idx) => {
                const on = genWeekdays.has(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleWeekday(idx)}
                    aria-pressed={on}
                    className={`w-8 h-8 rounded border text-xs font-bold ${on ? 'bg-builder-blue text-white border-builder-blue' : 'bg-builder-surface text-builder-ink-muted border-builder-border'}`}
                  >
                    {wd}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-builder-ink-muted">除外日 (任意・YYYY-MM-DD をカンマ区切り。授業が無い日)</span>
            <input type="text" value={genExclude} onChange={(e) => setGenExclude(e.target.value)} placeholder="2026-07-29, 2026-08-13" className={inputCls} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runGenerate('replace')} className="px-3 py-1 bg-builder-primary text-white rounded text-xs font-bold hover:opacity-90">
              この内容でこのタブに設定
            </button>
            <button type="button" onClick={() => runGenerate('append')} className="px-3 py-1 border border-builder-border bg-builder-surface text-builder-ink rounded text-xs font-bold hover:bg-builder-bg">
              現在の日付に追加
            </button>
          </div>
        </div>

        {/* 使う日チェックリスト */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-builder-ink-muted">使う日 (チェックを外すとこのタブの時間割から隠れます)</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => handleSetAllTabDates(true)} className="text-xs px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">全選択</button>
              <button type="button" onClick={() => handleSetAllTabDates(false)} className="text-xs px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">全解除</button>
            </div>
          </div>
          {poolDates.length === 0 ? (
            <div className="text-[11px] text-builder-ink-muted italic">まだ日付がありません。上の「自動生成」か下の「手動で追加」から登録してください。</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {poolDates.map(d => {
                const on = isActive(d.id);
                return (
                  <span key={d.id} className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-xs ${on ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border-builder-border text-builder-ink-muted'}`}>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => handleToggleTabDate(d.id)} aria-label={`${d.label} をこのタブで使う`} />
                      <span>{d.label}</span>
                    </label>
                    <button type="button" onClick={() => removeFromPool(d)} title="プールから完全削除 (全タブ・NG から消えます)" aria-label={`${d.label} をプールから削除`} className="text-builder-red hover:text-red-700 font-bold leading-none">×</button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 手動追加 */}
        <div className="flex items-end gap-2 text-xs">
          <label className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-builder-ink-muted">手動で追加 (カンマ区切り・例: 7/24(金), 8/1(土))</span>
            <input type="text" value={manualAdd} onChange={(e) => setManualAdd(e.target.value)} className={inputCls} />
          </label>
          <button type="button" onClick={addManual} disabled={!manualAdd.trim()} className="px-3 py-1 border border-builder-border bg-builder-surface text-builder-ink rounded text-xs font-bold disabled:opacity-50 hover:bg-builder-bg">追加</button>
        </div>
      </div>

      {/* ── 時限 (全タブ共通) ── */}
      <div>
        <label className="text-xs font-bold text-builder-ink-muted">時限 (カンマ区切り・<span className="text-builder-blue">全タブ共通</span>)</label>
        <textarea className="w-full border border-builder-border p-2 text-sm h-16 rounded" value={currentConfig.periods.map(e => e.label).join(', ')} onChange={(e) => handleConfigChange('periods', e.target.value)} />
      </div>

      {/* ── クラス (このタブ専用) ── */}
      <div>
        <label className="text-xs font-bold text-builder-ink-muted">クラス (カンマ区切り・このタブ「{activeTab.name}」専用)</label>
        <textarea className="w-full border border-builder-border p-2 text-sm h-16 rounded" value={currentConfig.classes.map(e => e.label).join(', ')} onChange={(e) => handleConfigChange('classes', e.target.value)} />
      </div>

      <div className="pt-2">
        <button onClick={handleSaveDefaultClick} className="w-full py-2 bg-builder-ink text-white font-bold rounded hover:bg-builder-primary-hover shadow-sm text-sm">
          💾 現在の設定を初期値にする
        </button>
      </div>
    </div>
  );
}
