import { useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { generateDateLabels, sortPoolDatesByCalendar, WEEKDAY_LABELS, ymdToLabel } from '../../utils/dateGenerate';

// カンマ区切りリスト編集用の textarea。編集中は draft をローカルに持ち、
// フォーカスを外した時にだけ onCommit で確定する。
// keystroke ごとに commit すると (a) ラベルの編集途中の中間状態が
// 「entity 削除 + 新規追加」として reducer に届き、全タブの該当セルが
// cleanSchedule で即消える、(b) 末尾に打ったカンマが state 再導出で即消えて
// 項目を追加できない、(c) 1 打鍵 = 1 Undo 履歴で MAX_HISTORY を食い潰す、
// という 3 重の実害があるため、必ず確定タイミングを blur に寄せること。
function DraftListTextarea({ value, onCommit }) {
  const [draft, setDraft] = useState(null); // null = 非編集 (canonical を表示)
  // aria-label は付けない (ラップする <label> の文言が accessible name になる)
  return (
    <textarea
      className="w-full border border-builder-border p-2 text-sm h-16 rounded"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft((d) => d ?? value)}
      onBlur={() => {
        if (draft != null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // IME 変換中の Esc は「変換のキャンセル」であって編集の取り消しでは
          // ない (Chrome は composition 中も key='Escape' の keydown を配信する)。
          // ここで draft を破棄すると未確定の編集内容が丸ごと消える。
          if (e.nativeEvent?.isComposing) return;
          // 編集の取り消し。stopPropagation しないと ConfigModal の
          // focus trap まで届いてモーダルごと閉じてしまう。
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

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
    handleToggleTabPeriod,
    handleSetAllTabPeriods,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();

  // v4(Y): project.dates は全タブ共通の『日付プール』。activeTab.config.activeDateIds
  // で「この学年が使う日」を選ぶ (未指定=全日)。NG はプール全日に設定できる。
  const poolDates = useMemo(() => project.dates || [], [project.dates]);
  const activeDateIds = activeTab.config.activeDateIds; // undefined = 全日
  const isActive = (id) => !activeDateIds || activeDateIds.includes(id);
  const activeCount = poolDates.filter(d => isActive(d.id)).length;
  // 設定画面では常に実日付順で表示する (保存順序=挿入順はそのまま)。
  const sortedPoolDates = useMemo(() => sortPoolDatesByCalendar(poolDates), [poolDates]);
  const isActiveForTab = (tab, dateId) => {
    const ids = tab.config.activeDateIds;
    return !ids || ids.includes(dateId);
  };

  // v4(Y) + E-3: project.periods も同じ「プール + タブごとの使う時限」構造。
  // 時限プールのテキストエリアは project.periods (全件) を編集対象にする。
  // currentConfig.periods を使うと「今のタブが使う時限だけ」が表示され、
  // 保存すると他タブの時限がプールごと消えてしまうため誤り (AbsenceNgPanel と同じ注意点)。
  const poolPeriods = useMemo(() => project.periods || [], [project.periods]);
  const activePeriodIds = activeTab.config.activePeriodIds; // undefined = 全時限
  const isPeriodActive = (id) => !activePeriodIds || activePeriodIds.includes(id);
  const activePeriodCount = poolPeriods.filter(p => isPeriodActive(p.id)).length;
  const isPeriodActiveForTab = (tab, periodId) => {
    const ids = tab.config.activePeriodIds;
    return !ids || ids.includes(periodId);
  };

  // ── 日付ジェネレータ form state ──
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genWeekdays, setGenWeekdays] = useState(() => new Set([0, 1, 2, 3, 4, 5, 6]));
  const [genExclude, setGenExclude] = useState('');
  const [manualDate, setManualDate] = useState('');
  // 全タブまとめて表示 (行=プールの日付・列=各タブ) トグル
  const [showAllTabs, setShowAllTabs] = useState(false);
  // 時限版の同トグル (日付とは独立)
  const [showAllTabsPeriods, setShowAllTabsPeriods] = useState(false);

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
    const label = ymdToLabel(manualDate);
    if (!label) {
      showToast('日付を選択してください', 'error', 2000);
      return;
    }
    const current = poolDates.filter(d => isActive(d.id)).map(d => d.label);
    if (current.includes(label)) {
      showToast(`「${label}」は既に「${activeTab.name}」に追加されています`, 'warning', 2500);
      return;
    }
    handleSetTabDatesByLabels([...current, label]);
    setManualDate('');
    showToast(`「${label}」を「${activeTab.name}」に追加しました`, 'success', 2000);
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
        <strong>仕組み:</strong> 日付・時限は<strong>全タブ共通の「プール」</strong>で管理し、各学年タブは
        「この学年が実際に使う日・時限」だけを選びます（期間や時間帯がズレる学年も歯抜けもOK）。<br />
        講師不在・NG はプールの<strong>全日・全時限</strong>に設定できます。日付やクラス名は右クリックでも改名できます。
      </div>

      {/* ── この学年が使う日 ── */}
      <div className="border border-builder-blue/40 rounded p-3 bg-builder-info-soft/30 space-y-3">
        <div className="font-bold text-builder-ink text-sm">
          🗓 「{activeTab.name}」で使う日
          <span className={`ml-2 text-xs ${activeCount === 0 ? "font-bold text-builder-orange" : "font-normal text-builder-ink-muted"}`}>
            選択 {activeCount} / プール {poolDates.length} 日
            {activeCount === 0 && " — ⚠️ 0 件のためこのタブの時間割は空になります"}
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
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-xs text-builder-ink-muted">使う日 (チェックを外すとこのタブの時間割から隠れます)</span>
            <div className="flex gap-1">
              {!showAllTabs && (
                <>
                  <button type="button" onClick={() => handleSetAllTabDates(true)} aria-label="日付を全選択" className="text-xs px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">全選択</button>
                  <button type="button" onClick={() => handleSetAllTabDates(false)} aria-label="日付を全解除" className="text-xs px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">全解除</button>
                </>
              )}
              <button type="button" onClick={() => setShowAllTabs(v => !v)} aria-pressed={showAllTabs} className={`text-xs px-2 py-0.5 border rounded font-bold ${showAllTabs ? 'bg-builder-blue text-white border-builder-blue' : 'border-builder-border bg-builder-surface hover:bg-builder-bg text-builder-ink'}`}>
                {showAllTabs ? '📋 日付の通常表示に戻す' : '🗂 日付を全タブまとめて表示'}
              </button>
            </div>
          </div>
          {poolDates.length === 0 ? (
            <div className="text-[11px] text-builder-ink-muted italic">まだ日付がありません。上の「自動生成」か下の「手動で追加」から登録してください。</div>
          ) : showAllTabs ? (
            <div className="overflow-x-auto border border-builder-border rounded">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-builder-surface-alt">
                    <th className="text-left px-2 py-1 border-b border-builder-border sticky left-0 bg-builder-surface-alt">日付</th>
                    {project.tabs.map(tab => (
                      <th key={tab.id} className="px-2 py-1 border-b border-l border-builder-border text-center whitespace-nowrap font-bold">
                        <div className={tab.id === activeTab.id ? 'text-builder-blue' : 'text-builder-ink'}>{tab.name}</div>
                        <div className="flex justify-center gap-1 mt-1 font-normal">
                          <button type="button" onClick={() => handleSetAllTabDates(true, tab.id)} title={`「${tab.name}」を全選択`} className="text-[10px] px-1 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg">全選</button>
                          <button type="button" onClick={() => handleSetAllTabDates(false, tab.id)} title={`「${tab.name}」を全解除`} className="text-[10px] px-1 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg">全解</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPoolDates.map(d => (
                    <tr key={d.id} className="odd:bg-builder-surface even:bg-builder-bg/40">
                      <td className="px-2 py-1 border-b border-builder-border whitespace-nowrap sticky left-0 bg-inherit">
                        {d.label}
                        <button type="button" onClick={() => removeFromPool(d)} title="プールから完全削除 (全タブ・NG から消えます)" aria-label={`${d.label} をプールから削除`} className="ml-1 text-builder-red hover:text-builder-red-hover font-bold leading-none">×</button>
                      </td>
                      {project.tabs.map(tab => (
                        <td key={tab.id} className="px-2 py-1 border-b border-l border-builder-border text-center">
                          <input
                            type="checkbox"
                            checked={isActiveForTab(tab, d.id)}
                            onChange={() => handleToggleTabDate(d.id, tab.id)}
                            aria-label={`${d.label} を「${tab.name}」で使う`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sortedPoolDates.map(d => {
                const on = isActive(d.id);
                return (
                  <span key={d.id} className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-xs ${on ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border-builder-border text-builder-ink-muted'}`}>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => handleToggleTabDate(d.id)} aria-label={`${d.label} をこのタブで使う`} />
                      <span>{d.label}</span>
                    </label>
                    <button type="button" onClick={() => removeFromPool(d)} title="プールから完全削除 (全タブ・NG から消えます)" aria-label={`${d.label} をプールから削除`} className="text-builder-red hover:text-builder-red-hover font-bold leading-none">×</button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 手動追加: 日付ピッカーで1日ずつ追加 (実日付から M/D(曜) を自動生成するため表記が揺れない) */}
        <div className="flex items-end gap-2 text-xs">
          <label className="flex flex-col gap-0.5">
            <span className="text-builder-ink-muted">手動で追加 (1日ずつ選択)</span>
            <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className={inputCls} aria-label="手動追加する日付" />
          </label>
          <button type="button" onClick={addManual} disabled={!manualDate} className="px-3 py-1 border border-builder-border bg-builder-surface text-builder-ink rounded text-xs font-bold disabled:opacity-50 hover:bg-builder-bg">追加</button>
        </div>
      </div>

      {/* ── 時限 ── */}
      <div className="border border-builder-blue/40 rounded p-3 bg-builder-info-soft/30 space-y-3">
        <div className="font-bold text-builder-ink text-sm">
          ⏰ 時限
          <span className={`ml-2 text-xs ${activePeriodCount === 0 ? "font-bold text-builder-orange" : "font-normal text-builder-ink-muted"}`}>
            選択 {activePeriodCount} / プール {poolPeriods.length} コマ
            {activePeriodCount === 0 && " — ⚠️ 0 件のためこのタブの時間割は空になります"}
          </span>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-builder-ink-muted">時限プールを編集 (カンマ区切り・<span className="text-builder-blue">全タブ共通</span>)</span>
          <DraftListTextarea
            value={poolPeriods.map(e => e.label).join(', ')}
            onCommit={(v) => handleConfigChange('periods', v)}
          />
          <span className="block text-[11px] text-builder-ink-muted">欄の外をクリックすると確定します (Esc で取り消し)</span>
        </label>

        {/* 使う時限チェックリスト */}
        <div className="space-y-1">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="text-xs text-builder-ink-muted">「{activeTab.name}」で使う時限 (チェックを外すとこのタブの時間割から隠れます)</span>
            <div className="flex gap-1">
              {!showAllTabsPeriods && (
                <>
                  <button type="button" onClick={() => handleSetAllTabPeriods(true)} aria-label="時限を全選択" className="text-xs px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">全選択</button>
                  <button type="button" onClick={() => handleSetAllTabPeriods(false)} aria-label="時限を全解除" className="text-xs px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg text-builder-ink">全解除</button>
                </>
              )}
              <button type="button" onClick={() => setShowAllTabsPeriods(v => !v)} aria-pressed={showAllTabsPeriods} className={`text-xs px-2 py-0.5 border rounded font-bold ${showAllTabsPeriods ? 'bg-builder-blue text-white border-builder-blue' : 'border-builder-border bg-builder-surface hover:bg-builder-bg text-builder-ink'}`}>
                {showAllTabsPeriods ? '📋 時限の通常表示に戻す' : '🗂 時限を全タブまとめて表示'}
              </button>
            </div>
          </div>
          {poolPeriods.length === 0 ? (
            <div className="text-[11px] text-builder-ink-muted italic">まだ時限がありません。上のテキストエリアで追加してください。</div>
          ) : showAllTabsPeriods ? (
            <div className="overflow-x-auto border border-builder-border rounded">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-builder-surface-alt">
                    <th className="text-left px-2 py-1 border-b border-builder-border sticky left-0 bg-builder-surface-alt">時限</th>
                    {project.tabs.map(tab => (
                      <th key={tab.id} className="px-2 py-1 border-b border-l border-builder-border text-center whitespace-nowrap font-bold">
                        <div className={tab.id === activeTab.id ? 'text-builder-blue' : 'text-builder-ink'}>{tab.name}</div>
                        <div className="flex justify-center gap-1 mt-1 font-normal">
                          <button type="button" onClick={() => handleSetAllTabPeriods(true, tab.id)} title={`「${tab.name}」を全選択`} className="text-[10px] px-1 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg">全選</button>
                          <button type="button" onClick={() => handleSetAllTabPeriods(false, tab.id)} title={`「${tab.name}」を全解除`} className="text-[10px] px-1 border border-builder-border rounded bg-builder-surface hover:bg-builder-bg">全解</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poolPeriods.map(p => (
                    <tr key={p.id} className="odd:bg-builder-surface even:bg-builder-bg/40">
                      <td className="px-2 py-1 border-b border-builder-border whitespace-nowrap sticky left-0 bg-inherit">{p.label}</td>
                      {project.tabs.map(tab => (
                        <td key={tab.id} className="px-2 py-1 border-b border-l border-builder-border text-center">
                          <input
                            type="checkbox"
                            checked={isPeriodActiveForTab(tab, p.id)}
                            onChange={() => handleToggleTabPeriod(p.id, tab.id)}
                            aria-label={`${p.label} を「${tab.name}」で使う`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {poolPeriods.map(p => {
                const on = isPeriodActive(p.id);
                return (
                  <label key={p.id} className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-xs cursor-pointer ${on ? 'bg-builder-info-soft border-builder-blue text-builder-ink font-bold' : 'bg-builder-surface border-builder-border text-builder-ink-muted'}`}>
                    <input type="checkbox" checked={on} onChange={() => handleToggleTabPeriod(p.id)} aria-label={`${p.label} をこのタブで使う`} />
                    <span>{p.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── クラス (このタブ専用) ── */}
      <label className="block">
        <span className="text-xs font-bold text-builder-ink-muted">クラス (カンマ区切り・このタブ「{activeTab.name}」専用)</span>
        <DraftListTextarea
          value={currentConfig.classes.map(e => e.label).join(', ')}
          onCommit={(v) => handleConfigChange('classes', v)}
        />
        <span className="block text-[11px] text-builder-ink-muted">欄の外をクリックすると確定します (Esc で取り消し)</span>
      </label>

      <div className="pt-2">
        <button onClick={handleSaveDefaultClick} className="w-full py-2 bg-builder-ink text-white font-bold rounded hover:bg-builder-primary-hover shadow-sm text-sm">
          💾 現在の設定を初期値にする
        </button>
      </div>
    </div>
  );
}
