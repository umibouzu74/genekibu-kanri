import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';

export default function BasicSettings() {
  const {
    activeTab,
    currentConfig,
    handleListConfigChange,
    handleSaveAsDefault,
  } = useProjectContext();
  const { showConfirm, showToast } = useUI();

  const handleConfigChange = (key, value) => {
    const raw = value.split(',').map(s => s.trim());
    const filtered = raw.filter(s => s);
    if (raw.length !== filtered.length) {
      showToast("空の項目は除外されました", "warning", 2000);
    }
    if (filtered.length === 0) {
      showToast("最低1つの項目が必要です", "error", 3000);
      return;
    }
    handleListConfigChange(key, value);
  };

  const handleSaveDefaultClick = async () => {
    const ok = await showConfirm("現在の「講師設定」と「カレンダー構成」を初期値として保存しますか？\n次回リセット時にこの設定が読み込まれます。", { title: "初期値の保存", confirmLabel: "保存" });
    if (ok) {
      handleSaveAsDefault();
      showToast("保存しました。次回からこの設定が初期値になります。");
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-builder-ink border-b border-builder-border pb-1">📅 カレンダー設定</h3>
      <div className="bg-builder-info-soft p-2 text-xs text-builder-ink border border-builder-info-border rounded">
        <strong>便利機能:</strong> カレンダーの日付やクラス名を右クリックすると、名称を変更できます（データも引き継がれます）。<br />
        現在の設定を保存したい場合は、下の「現在の設定を初期値にする」ボタンを押してください。
        科目の追加・コマ数設定は「📚 科目」タブで行えます。
      </div>

      {/* 日付・時限は全タブ共通 (講師不在・NG もこのカレンダーを共有する) */}
      <div className="border border-builder-blue/40 rounded p-2 bg-builder-info-soft/40 space-y-3">
        <div className="text-[11px] font-bold text-builder-blue">
          🔗 日付・時限は<strong>全タブ共通</strong>です（ここで編集すると全学年タブに反映され、講師不在・NG 設定もこのカレンダーを共有します）
        </div>
        <div>
          <label className="text-xs font-bold text-builder-ink-muted">日付 (カンマ区切り・全タブ共通)</label>
          <textarea className="w-full border border-builder-border p-2 text-sm h-20 rounded" value={currentConfig.dates.map(e => e.label).join(", ")} onChange={(e) => handleConfigChange('dates', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-builder-ink-muted">時限 (カンマ区切り・全タブ共通)</label>
          <textarea className="w-full border border-builder-border p-2 text-sm h-16 rounded" value={currentConfig.periods.map(e => e.label).join(", ")} onChange={(e) => handleConfigChange('periods', e.target.value)} />
        </div>
      </div>

      {/* クラスはタブ (学年) ごと */}
      <div>
        <label className="text-xs font-bold text-builder-ink-muted">クラス (カンマ区切り・このタブ「{activeTab.name}」専用)</label>
        <textarea className="w-full border border-builder-border p-2 text-sm h-16 rounded" value={currentConfig.classes.map(e => e.label).join(", ")} onChange={(e) => handleConfigChange('classes', e.target.value)} />
      </div>
      <div className="pt-2">
        <button onClick={handleSaveDefaultClick} className="w-full py-2 bg-builder-ink text-white font-bold rounded hover:bg-builder-primary-hover shadow-sm text-sm">
          💾 現在の設定を初期値にする
        </button>
      </div>
    </div>
  );
}
