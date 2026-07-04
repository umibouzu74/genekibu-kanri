import { useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import {
  loadTemplates,
  persistTemplates,
  addTemplate,
  removeTemplate,
  updateTemplate,
} from '../../utils/templates';
import { validateProjectShape } from '../../utils/projectSchema';

// E2d: 年度間コピー用テンプレートの管理 UI。
// 現在のプロジェクトを名前付きで保存し、「全体」または「講師マスタのみ」を
// 適用して使い回す。保存先は localStorage (project state とは独立)。
export default function TemplateManager() {
  const { project, applyTemplateFull, importTeachers } = useProjectContext();
  const { showInput, showConfirm, showToast } = useUI();
  const [templates, setTemplates] = useState(() => loadTemplates());

  const update = (next) => {
    setTemplates(next);
    persistTemplates(next);
  };

  const handleSave = async () => {
    const name = await showInput('テンプレート名を入力', {
      title: 'テンプレートとして保存',
      defaultValue: project.name || '',
      placeholder: '例: 2026 冬期 ベース',
      confirmLabel: '保存',
    });
    if (!name) return;
    // N4a: 同名テンプレートがあれば「上書き / 新規」を選ばせる。従来は常に
    // 新規追加で、年度ベースを微修正するたび同名が重複蓄積していた。
    const existing = templates.find(t => t.name === name);
    if (existing) {
      const overwrite = await showConfirm(
        `テンプレート「${name}」は既にあります (${fmt(existing.createdAt) || '日付不明'} 保存)。\n現在の内容で上書きしますか？\n(「キャンセル」で別名の新規保存はやり直せます)`,
        { title: '同名のテンプレート', confirmLabel: '上書き' },
      );
      if (!overwrite) return;
      update(updateTemplate(templates, { id: existing.id, project, createdAt: new Date().toISOString() }));
      showToast(`テンプレート「${name}」を上書きしました`);
      return;
    }
    update(addTemplate(templates, { name, project, createdAt: new Date().toISOString() }));
    showToast(`テンプレート「${name}」を保存しました`);
  };

  // N4a: 行内からの「現在の内容で更新」(名前は据え置き)
  const handleUpdate = async (tpl) => {
    const ok = await showConfirm(
      `テンプレート「${tpl.name}」を現在のプロジェクトの内容で更新しますか？\n(保存されている内容は置き換わります)`,
      { title: 'テンプレートの更新', confirmLabel: '更新' },
    );
    if (!ok) return;
    update(updateTemplate(templates, { id: tpl.id, project, createdAt: new Date().toISOString() }));
    showToast(`「${tpl.name}」を現在の内容で更新しました`);
  };

  const handleApplyFull = async (tpl) => {
    // localStorage を手編集されたテンプレートでも crash しないよう、適用前に
    // 構造を検証する (review F5: JSON 取り込み経路と挙動を揃える)。
    const { valid, error } = validateProjectShape(tpl.payload);
    if (!valid) {
      showToast(`テンプレートのデータが壊れています: ${error}`, 'error', 4000);
      return;
    }
    const ok = await showConfirm(
      `現在のプロジェクトを破棄して、テンプレート「${tpl.name}」を全体適用しますか？\n（元に戻す Ctrl+Z で戻せます）`,
      { title: 'テンプレートを全体適用', danger: true, confirmLabel: '適用' },
    );
    if (!ok) return;
    applyTemplateFull(tpl.payload);
    showToast(`「${tpl.name}」を全体適用しました`);
  };

  const handleApplyTeachers = async (tpl) => {
    const teachers = tpl.payload?.teachers || [];
    const ok = await showConfirm(
      `現在の講師マスタを、テンプレート「${tpl.name}」の ${teachers.length} 名で置き換えますか？\n（時間割・カレンダー構成はそのまま）`,
      { title: '講師マスタのみ適用', danger: true, confirmLabel: '置換' },
    );
    if (!ok) return;
    importTeachers(teachers, 'replace');
    showToast(`講師マスタを ${teachers.length} 名で置き換えました`);
  };

  const handleDelete = async (tpl) => {
    const ok = await showConfirm(
      `テンプレート「${tpl.name}」を削除しますか？`,
      { title: 'テンプレートの削除', danger: true, confirmLabel: '削除' },
    );
    if (!ok) return;
    update(removeTemplate(templates, tpl.id));
    showToast(`「${tpl.name}」を削除しました`, 'warning', 2000);
  };

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP');
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-between items-center border-b border-builder-border pb-1">
        <h3 className="font-bold text-builder-ink">🗂 テンプレート（年度間コピー）</h3>
        <button
          type="button"
          onClick={handleSave}
          className="text-xs bg-builder-primary text-white px-3 py-1.5 rounded shadow hover:bg-builder-primary-hover font-bold"
        >＋ 現在のプロジェクトを保存</button>
      </div>
      <div className="bg-builder-info-soft p-2 text-xs text-builder-ink border border-builder-info-border rounded">
        <strong>便利機能:</strong> 去年の設定を今年に流用できます。「全体を適用」は
        講師・カレンダー・時間割をまるごと、「講師マスタのみ」は講師だけを引き継ぎます。
        適用は <strong>元に戻す (Ctrl+Z)</strong> で取り消せます。
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-builder-ink-muted py-6 text-center border border-builder-border rounded bg-builder-bg">
          保存されたテンプレートはありません。<br />
          右上の「＋ 現在のプロジェクトを保存」で、今の設定をテンプレート化できます。
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.slice().reverse().map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 border border-builder-border rounded px-3 py-2 bg-builder-surface">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-builder-ink truncate" title={tpl.name}>{tpl.name}</div>
                <div className="text-[11px] text-builder-ink-muted">
                  {fmt(tpl.createdAt)} / 講師 {tpl.payload?.teachers?.length ?? 0} 名 / タブ {tpl.payload?.tabs?.length ?? 0}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleApplyFull(tpl)}
                className="text-xs bg-builder-blue text-white px-2 py-1 rounded font-bold hover:bg-builder-blue-hover whitespace-nowrap"
                title="講師・カレンダー・時間割をまるごと適用"
              >全体を適用</button>
              <button
                type="button"
                onClick={() => handleApplyTeachers(tpl)}
                className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded hover:bg-builder-surface-alt whitespace-nowrap"
                title="講師マスタだけを引き継ぐ"
              >講師のみ</button>
              <button
                type="button"
                onClick={() => handleUpdate(tpl)}
                className="text-xs px-1.5 py-1 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface-alt"
                title="このテンプレートを現在のプロジェクトの内容で更新"
                aria-label={`${tpl.name} を現在の内容で更新`}
              >💾</button>
              <button
                type="button"
                onClick={() => handleDelete(tpl)}
                className="text-xs px-1.5 py-1 border border-builder-danger-border rounded text-builder-red hover:bg-builder-danger-soft"
                title="削除"
                aria-label={`${tpl.name} を削除`}
              >🗑️</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
