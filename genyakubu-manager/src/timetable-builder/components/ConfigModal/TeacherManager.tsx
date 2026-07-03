import { Fragment, useMemo, useState } from 'react';
import { useProjectContext } from '../../contexts/projectContextValue';
import { useUI } from '../../contexts/uiContextValue';
import { parseTeachersCsv, decodeCsvBytes } from '../../utils/csvImport';
import { groupTeachersBySubject } from '../../utils/groupTeachersBySubject';
import { readParentTeachers } from '../../utils/parentTeachers';
import { buildTeachersCsvTemplate, downloadCsvFile } from '../../utils/csvTemplates';
import DraftNumberInput from './DraftNumberInput';

const CSV_PLACEHOLDER = `name,subjects
堀上,英語
未定,英語|数学|国語|理科|社会
山田,数学|理科`;

function InlineNameEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full border border-builder-blue rounded px-1.5 py-0.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-builder-blue"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') {
            // IME 変換中の Esc (変換キャンセル) では編集を破棄しない
            if (e.nativeEvent?.isComposing) return;
            // stopPropagation しないと ConfigModal の focus trap まで届いて
            // モーダルごと閉じてしまう (DraftListTextarea と同じ対策)
            e.stopPropagation();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="cursor-pointer hover:text-builder-blue hover:underline"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="クリックで名前を変更"
    >
      {value}
    </span>
  );
}

export default function TeacherManager() {
  const {
    project,
    commonSubjects,
    addTeacher,
    importTeachers,
    removeTeacher,
    renameTeacher,
    toggleTeacherSubject,
    setTeacherLimit,
    addSubjects,
  } = useProjectContext();
  const { showConfirm, showInput, showToast } = useUI();
  const [csvPanelOpen, setCsvPanelOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // CSV ファイル (選択 or ドロップ) を読み取って textarea に流し込む (E2a)。
  // 中身は既存の paste フロー (csvText → parse → preview) に合流するので、
  // ここでは読み取りと軽いガードのみ。
  const readCsvFile = async (file) => {
    if (!file) return;
    const name = file.name || '';
    const looksCsv = /\.csv$/i.test(name) || ['text/csv', 'text/plain', 'application/vnd.ms-excel', ''].includes(file.type);
    if (!looksCsv) {
      showToast('CSV (.csv) ファイルを選択してください', 'error', 3000);
      return;
    }
    try {
      // N1j: UTF-8 固定 (file.text()) だと日本語 Excel 既定の Shift-JIS CSV が
      // 文字化けして全行「未登録」warning になる。バイト列から判定して読む。
      const { text, encoding } = decodeCsvBytes(await file.arrayBuffer());
      setCsvText(text);
      showToast(
        encoding === 'shift_jis'
          ? `「${name || 'ファイル'}」を読み込みました (Shift-JIS として解釈)`
          : `「${name || 'ファイル'}」を読み込みました`,
        'success',
        2000,
      );
    } catch {
      showToast('ファイルの読み込みに失敗しました', 'error', 3000);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    readCsvFile(file);
    // 同じファイルを再選択しても change が発火するよう value をリセット
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    readCsvFile(file);
  };

  const handleAddClick = async () => {
    const name = await showInput("講師名を入力してください", { title: "講師の追加", placeholder: "例: 山田" });
    if (name) addTeacher(name);
  };

  const handleRemoveClick = async (i) => {
    const ok = await showConfirm(`「${project.teachers[i].name}」を削除しますか？`, { title: "講師の削除", danger: true, confirmLabel: "削除" });
    if (ok) removeTeacher(i);
  };

  // CSV preview は textarea 変更ごとに parse する (デバウンス無し / 数百行想定で十分軽量)
  const csvParsed = useMemo(
    () => csvText.trim() ? parseTeachersCsv(csvText, { commonSubjects }) : null,
    [csvText, commonSubjects],
  );

  // 教科ごとにグループ化した講師一覧 (rename / 削除 / 担当科目編集を
  // グループ見出し付きで表示)。元の i (project.teachers index) を維持する
  // ため teacher.name → i の lookup を経由する。
  const teacherIdxByName = useMemo(() => {
    const m = new Map();
    project.teachers.forEach((t, i) => m.set(t.name, i));
    return m;
  }, [project.teachers]);
  const teacherGroups = useMemo(
    () => groupTeachersBySubject(project.teachers, project.subjects),
    [project.teachers, project.subjects],
  );
  // L1g: 担当科目が空の講師 (どこにも割り当てられない)。'未定' は
  // placeholder なので対象外。
  const noSubjectTeachers = useMemo(
    () => project.teachers.filter(t => t.name !== '未定' && (t.subjects || []).length === 0),
    [project.teachers],
  );

  const handleCsvImport = async (mode) => {
    if (!csvParsed || csvParsed.rows.length === 0) return;
    if (mode === 'replace') {
      const ok = await showConfirm(
        `現在の ${project.teachers.length} 件の講師を破棄して、CSV の ${csvParsed.rows.length} 件で置き換えますか？\n(NG時間・優先クラス設定もリセットされます)`,
        { title: '講師マスタを置換', danger: true, confirmLabel: '置換' },
      );
      if (!ok) return;
    }
    importTeachers(csvParsed.rows, mode);
    showToast(
      mode === 'replace'
        ? `${csvParsed.rows.length} 件の講師で置換しました`
        : `${csvParsed.rows.length} 件を追加 / 更新しました`,
      'success', 4000,
    );
    setCsvPanelOpen(false);
    setCsvText('');
  };

  // L5a: 親アプリ (原学部管理) の講師マスタをワンクリック取込。既存の
  // teacher/import (append) に流すので、同名講師は担当科目のみ更新され
  // NG・優先クラス・上限などは維持される (Undo 1 ステップ)。
  const handleImportFromParent = async () => {
    const parents = readParentTeachers();
    if (parents.length === 0) {
      showToast('親アプリの講師データが見つかりませんでした', 'error', 4000);
      return;
    }
    const existingNames = new Set(project.teachers.map(t => t.name));
    // 同名かつ親側の担当科目が空の講師は除外する。append の「subjects を
    // 上書き」で builder 側の担当設定が空に消えるのを防ぐため。
    const entries = parents.filter(p => p.subjects.length > 0 || !existingNames.has(p.name));
    if (entries.length === 0) {
      showToast('取り込む差分がありません (全員登録済みです)', 'success', 3000);
      return;
    }
    const newCount = entries.filter(p => !existingNames.has(p.name)).length;
    const updCount = entries.length - newCount;
    // §M: builder の科目マスタに無い担当科目は、そのまま取り込むと UI に
    // 出ない「見えない割当」になる (CSV 経路の L4c と同じ問題)。マスタへ
    // 併せて追加することを confirm に明示した上で addSubjects する。
    const knownSubjects = new Set(project.subjects || []);
    const unknownSubjects = [...new Set(entries.flatMap(p => p.subjects))]
      .filter(sub => !knownSubjects.has(sub));
    const ok = await showConfirm(
      `親アプリの講師 ${entries.length} 名を取り込みますか？\n` +
        `(新規 ${newCount} 名 / 担当科目の更新 ${updCount} 名。` +
        `NG・優先クラスなどの既存設定は維持されます)` +
        (unknownSubjects.length > 0
          ? `\n\n未登録の科目 ${unknownSubjects.length} 件 (${unknownSubjects.join('・')}) を科目マスタへ追加します。`
          : ''),
      { title: '親アプリから講師を取り込む', confirmLabel: '取り込む' },
    );
    if (!ok) return;
    if (unknownSubjects.length > 0) addSubjects(unknownSubjects);
    importTeachers(entries, 'append');
    showToast(`親アプリから ${entries.length} 名を取り込みました`, 'success', 4000);
  };

  return (
    <div className="border-l border-builder-border pl-6 space-y-4">
      <div className="flex justify-between items-center border-b border-builder-border pb-1">
        <h3 className="font-bold text-builder-ink">👤 講師マスタ (全タブ共通)</h3>
        <div className="flex gap-2">
          <button
            onClick={handleImportFromParent}
            className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface-alt"
            title="原学部管理 (親アプリ) のバイト講師マスタから講師名と担当科目を取り込みます"
          >🔗 親アプリから取込</button>
          <button
            onClick={() => setCsvPanelOpen((v) => !v)}
            className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface-alt"
            aria-expanded={csvPanelOpen}
          >📥 CSV インポート</button>
          <button onClick={handleAddClick} className="text-xs bg-builder-green text-white px-2 py-1 rounded shadow hover:bg-builder-green-hover">+ 追加</button>
        </div>
      </div>
      {csvPanelOpen && (
        <div className="border border-builder-border rounded bg-builder-surface-alt p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-builder-ink-muted">
              ヘッダ行は <code>name,subjects</code>。subjects は <code>|</code> 区切り (例: <code>英語|数学</code>)。
            </div>
            {/* L4f: 事務スタッフに配る雛形 (現在の科目マスタ入り) */}
            <button
              type="button"
              onClick={() => downloadCsvFile('講師マスタ雛形.csv', buildTeachersCsvTemplate(commonSubjects))}
              className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface-alt whitespace-nowrap"
              title="現在の科目名を埋めたヘッダ付きの雛形 CSV をダウンロードします"
            >⬇ 雛形CSV</button>
            <label className="text-xs bg-builder-surface border border-builder-border text-builder-ink-muted px-2 py-1 rounded shadow hover:bg-builder-surface cursor-pointer whitespace-nowrap">
              📂 ファイルを選択
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                aria-label="CSV ファイルを選択"
                onChange={handleFileInputChange}
              />
            </label>
          </div>
          <textarea
            aria-label="講師マスタ CSV テキスト"
            className={`w-full h-32 border rounded p-2 text-xs font-mono focus:outline-none focus:border-builder-blue bg-builder-surface transition-colors ${isDragging ? 'border-builder-blue border-2 bg-builder-info-soft' : 'border-builder-border'}`}
            placeholder={`${CSV_PLACEHOLDER}\n\n（CSV ファイルをここにドラッグ&ドロップでも読み込めます）`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          />
          {csvParsed && (
            <div className="text-xs space-y-1">
              <div>
                <span className="font-bold text-builder-green">{csvParsed.rows.length} 件</span> parse 成功
                {csvParsed.errors.length > 0 && (
                  <> / <span className="font-bold text-builder-red">{csvParsed.errors.length} 件</span> エラー</>
                )}
                {csvParsed.unknownSubjects.length > 0 && (
                  <>
                    {' / '}未登録科目: <span className="text-builder-red">{csvParsed.unknownSubjects.join(', ')}</span>
                    {/* L4c: 未登録のまま取り込むと担当設定が UI に出ない
                        「見えない割当」になる。その場でマスタへ登録できる導線 */}
                    <button
                      type="button"
                      onClick={() => {
                        addSubjects(csvParsed.unknownSubjects);
                        showToast(`${csvParsed.unknownSubjects.length} 科目をマスタへ追加しました`, 'success', 3000);
                      }}
                      className="ml-2 px-1.5 py-0.5 border border-builder-blue rounded text-builder-blue hover:bg-builder-info-soft"
                    >＋ マスタへ一括追加</button>
                  </>
                )}
              </div>
              {csvParsed.errors.length > 0 && (
                <ul className="text-builder-red pl-3 list-disc">
                  {csvParsed.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e.line} 行目: {e.message}</li>
                  ))}
                  {csvParsed.errors.length > 5 && <li className="italic">他 {csvParsed.errors.length - 5} 件</li>}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setCsvPanelOpen(false); setCsvText(''); }}
              className="text-xs px-3 py-1 border border-builder-border rounded text-builder-ink-muted hover:bg-builder-surface"
            >キャンセル</button>
            <button
              onClick={() => handleCsvImport('append')}
              disabled={!csvParsed || csvParsed.rows.length === 0}
              className="text-xs px-3 py-1 bg-builder-blue text-white rounded font-bold disabled:opacity-30 hover:bg-builder-blue-hover"
            >追加 / 更新</button>
            <button
              onClick={() => handleCsvImport('replace')}
              disabled={!csvParsed || csvParsed.rows.length === 0}
              className="text-xs px-3 py-1 bg-builder-red text-white rounded font-bold disabled:opacity-30 hover:bg-builder-danger-border"
            >全置換</button>
          </div>
        </div>
      )}
      <div className="text-xs text-builder-ink-muted bg-builder-surface-alt p-2 rounded border border-builder-border">氏名をクリックすると名前を変更できます。スケジュールの講師名も自動更新されます。</div>
      {/* L1g: 担当科目が空の講師は自動生成でどこにも割り当てられないのに
          「その他」グループへ静かに沈むだけで気づけない。ここで明示する。 */}
      {noSubjectTeachers.length > 0 && (
        <div
          className="text-xs p-2 rounded border bg-builder-warning-soft border-builder-warning-border text-builder-ink"
          role="alert"
        >
          ⚠️ 担当科目が未設定の講師が {noSubjectTeachers.length} 名います
          ({noSubjectTeachers.map(t => t.name).join('・')})。
          担当科目を選ぶまで自動生成・講師候補に登場しません。
        </div>
      )}
      <div className="overflow-y-auto max-h-[400px] border border-builder-border rounded bg-builder-bg p-2">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-1 text-builder-ink-muted">氏名</th>
              <th className="text-left p-1 text-builder-ink-muted">担当科目</th>
              <th
                className="text-left p-1 text-builder-ink-muted whitespace-nowrap"
                title="この講師だけの上限。1日 = 空欄なら ⚡自動生成 の全体設定を使う / 通算 = 講習全体 (全タブ + 他学年コマ) の合計上限、空欄なら無制限"
              >上限 (1日/通算)</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {teacherGroups.map(group => (
              <Fragment key={group.key}>
                <tr className="bg-builder-bg">
                  <td colSpan={4} className="px-2 py-1 text-[11px] font-bold text-builder-ink-muted">
                    ━━ {group.label} ({group.teachers.length})
                  </td>
                </tr>
                {group.teachers.map(t => {
                  const i = teacherIdxByName.get(t.name);
                  // key は teacher.name でなく i (project.teachers index) を
                  // 使う: InlineNameEdit が編集中に外部要因で t.name が
                  // 変わると t.name キーでは remount されて draft 文字列が
                  // 失われる (code-review P2)。i は rename で変わらないので安定。
                  return (
                    <tr key={i} className="border-b border-builder-border bg-builder-surface last:border-0">
                      <td className="p-2 font-bold text-builder-ink">
                        <InlineNameEdit value={t.name} onSave={(newName) => renameTeacher(i, newName)} />
                      </td>
                      <td className="p-2 flex flex-wrap gap-1">
                        {commonSubjects.map(s => (
                          <label key={s} className={`px-2 py-0.5 border rounded cursor-pointer text-xs select-none transition-colors ${t.subjects.includes(s) ? "bg-builder-blue text-white border-builder-blue" : "bg-builder-surface text-builder-ink-ghost border-builder-border"}`}>
                            <input type="checkbox" className="hidden" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} />
                            {s}
                          </label>
                        ))}
                      </td>
                      {/* L3a/L3b: 講師個別の上限。'未定' は placeholder で
                          上限の対象外なので入力を出さない */}
                      <td className="p-2 whitespace-nowrap">
                        {t.name !== '未定' && (
                          <span className="inline-flex items-center gap-1 text-xs text-builder-ink-muted">
                            <DraftNumberInput
                              value={t.maxDailyHours ?? ''}
                              onCommit={(raw) => setTeacherLimit(i, 'maxDailyHours', raw)}
                              min={1}
                              placeholder="全体"
                              aria-label={`${t.name} の 1 日コマ数上限 (空欄 = 全体設定)`}
                              className="w-14 border border-builder-border rounded px-1 py-0.5 text-xs text-right bg-builder-surface"
                            />
                            /
                            <DraftNumberInput
                              value={t.maxTotalHours ?? ''}
                              onCommit={(raw) => setTeacherLimit(i, 'maxTotalHours', raw)}
                              min={1}
                              placeholder="∞"
                              aria-label={`${t.name} の通算コマ数上限 (空欄 = 無制限)`}
                              className="w-14 border border-builder-border rounded px-1 py-0.5 text-xs text-right bg-builder-surface"
                            />
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => handleRemoveClick(i)} className="text-builder-ink-muted hover:text-builder-red">×</button>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
