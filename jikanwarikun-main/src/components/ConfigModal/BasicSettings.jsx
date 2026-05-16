import React from 'react';
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
      <h3 className="font-bold text-blue-800 border-b pb-1">📅 カレンダー設定 ({activeTab.name})</h3>
      <div className="bg-blue-50 p-2 text-xs text-blue-800 border border-blue-200 rounded">
        <strong>便利機能:</strong> カレンダーの日付やクラス名を右クリックすると、名称を変更できます（データも引き継がれます）。<br />
        現在の設定を保存したい場合は、下の「現在の設定を初期値にする」ボタンを押してください。
        科目の追加・コマ数設定は「📚 科目」タブで行えます。
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500">日付 (カンマ区切り)</label>
        <textarea className="w-full border p-2 text-sm h-20 rounded" value={currentConfig.dates.join(", ")} onChange={(e) => handleConfigChange('dates', e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500">時限 (カンマ区切り)</label>
        <textarea className="w-full border p-2 text-sm h-16 rounded" value={currentConfig.periods.join(", ")} onChange={(e) => handleConfigChange('periods', e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500">クラス (カンマ区切り)</label>
        <textarea className="w-full border p-2 text-sm h-16 rounded" value={currentConfig.classes.join(", ")} onChange={(e) => handleConfigChange('classes', e.target.value)} />
      </div>
      <div className="pt-2">
        <button onClick={handleSaveDefaultClick} className="w-full py-2 bg-gray-600 text-white font-bold rounded hover:bg-gray-700 shadow-sm text-sm">
          💾 現在の設定を初期値にする
        </button>
      </div>
    </div>
  );
}
