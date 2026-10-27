import { useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHostData } from '../contexts/hostDataContext';
import { parseHHmm } from '../utils/timeRange';
import { countCarriedCells, carryTimetable } from '../utils/timetableCopy';
import type { ExternalSessionPreset, Project } from '../types';

const TITLE_ID = 'builder-season-copy-title';
// 時刻入力の刻み (講師不在・NG のプリセットと同じ 5 分)
const TIME_STEP_SEC = 300;

export interface SeasonCopyChoice {
  name: string;
  /** 写すプリセット (時刻を直したもの) */
  presets: ExternalSessionPreset[];
  /** 写さない講師 */
  dropTeachers: string[];
}

interface PresetDraft {
  preset: ExternalSessionPreset;
  include: boolean;
  startTime: string;
  endTime: string;
}

// 季節の設定を写す前の確認 (2026-10-27)。ほかの季節・テンプレートから始めるとき
// (SeasonStartPanel) と、翌年の同じ季節用に作り直すとき (⚙ 設定 > 基本設定) の両方で
// 使う。決めること:
// - 名前
// - 他学年セッションのプリセットを写すか・時刻を直すか (夏期の予備校 10:25〜 と
//   冬期の時刻が違う。写したまま気付かずに使うと、違う時刻で自動NG が付く)
// - 本体で退職・非表示の講師を写さない (既定で外す)
// 作り直すときは、作り直す前の時間割を控えとして残すことも知らせる
// (「📋 前の講習の時間割を写す」で使える)。
export default function SeasonCopyDialog({
  mode,
  source,
  sourceLabel,
  seasonLabel,
  defaultName,
  onConfirm,
  onCancel,
}: {
  mode: 'start' | 'rebuild';
  source: Project;
  /** 何から写すか (「夏期講習「2026 夏期講習」」) */
  sourceLabel: string;
  seasonLabel: string;
  defaultName: string;
  onConfirm: (choice: SeasonCopyChoice) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onClose: onCancel });
  const { retiredTeacherNames } = useHostData();
  const [name, setName] = useState(defaultName);
  const [drafts, setDrafts] = useState<PresetDraft[]>(() =>
    (source.externalSessionPresets || []).map(p => ({
      preset: p,
      include: true,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
    })),
  );
  const retiredInSource = useMemo(() => {
    const retired = new Set(retiredTeacherNames || []);
    return (source.teachers || []).map(t => t.name).filter(n => retired.has(n));
  }, [source.teachers, retiredTeacherNames]);
  const [dropped, setDropped] = useState<Set<string>>(() => new Set(retiredInSource));
  const carriedCells = useMemo(
    () => (mode === 'rebuild' ? countCarriedCells(carryTimetable(source)) : 0),
    [mode, source],
  );

  const draftError = (d: PresetDraft): string | null => {
    if (!d.include) return null;
    const s = d.startTime ? parseHHmm(d.startTime) : null;
    const e = d.endTime ? parseHHmm(d.endTime) : null;
    if (!d.startTime && d.endTime) return '開始時刻も入れてください';
    if (d.startTime && s == null) return '開始時刻が読めません';
    if (d.endTime && e == null) return '終了時刻が読めません';
    if (s != null && e != null && s >= e) return '開始は終了より前に';
    return null;
  };
  const hasError = drafts.some(d => draftError(d) != null);
  const update = (i: number, patch: Partial<PresetDraft>) =>
    setDrafts(prev => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const toggleDropped = (n: string) =>
    setDropped(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });

  const submit = () => {
    if (hasError) return;
    const presets = drafts
      .filter(d => d.include)
      .map(d => {
        const { startTime: _s, endTime: _e, ...rest } = d.preset;
        return {
          ...rest,
          ...(d.startTime ? { startTime: d.startTime } : {}),
          ...(d.startTime && d.endTime ? { endTime: d.endTime } : {}),
        };
      });
    onConfirm({ name: name.trim() || defaultName, presets, dropTeachers: [...dropped] });
  };

  const inputCls = 'border border-builder-border rounded px-2 py-1 text-sm bg-builder-surface text-builder-ink';
  const changedCount = drafts.filter(d => d.include && (d.startTime !== (d.preset.startTime || '') || d.endTime !== (d.preset.endTime || ''))).length;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1005] flex justify-center items-center p-4 no-print"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="bg-builder-surface w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg shadow-2xl p-5 text-builder-ink space-y-4"
      >
        <h2 id={TITLE_ID} className="text-lg font-bold">
          {mode === 'rebuild' ? `次の${seasonLabel}用に作り直す` : `${sourceLabel}の設定を写して始める`}
        </h2>

        <div>
          <label htmlFor="builder-season-copy-name" className="block text-xs font-bold mb-1">
            {mode === 'rebuild' ? '作り直した後のプロジェクト名' : 'プロジェクト名'}
          </label>
          <input
            id="builder-season-copy-name"
            className={`${inputCls} w-full max-w-sm`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
          />
        </div>

        <section aria-labelledby="builder-season-copy-presets" className="space-y-2">
          <h3 id="builder-season-copy-presets" className="text-sm font-bold">他学年セッションのプリセット</h3>
          {drafts.length === 0 ? (
            <p className="text-xs text-builder-ink-muted">プリセットはありません。</p>
          ) : (
            <>
              <p className="text-xs text-builder-ink-muted">
                予備校・高校の時刻が季節で違うときは、ここで直してから写してください (日付の範囲は前の講習のものなので写しません)。
                外したプリセットは写しません。
              </p>
              <div className="overflow-x-auto border border-builder-border rounded">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-builder-surface-alt">
                      <th className="px-2 py-1 text-left">写す</th>
                      <th className="px-2 py-1 text-left">名前</th>
                      <th className="px-2 py-1 text-left">時刻</th>
                      <th className="px-2 py-1 text-left">講師</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d, i) => {
                      const err = draftError(d);
                      const label = d.preset.name || `プリセット ${i + 1}`;
                      return (
                        <tr key={d.preset.id ?? i} className={d.include ? '' : 'text-builder-ink-muted'}>
                          <td className="px-2 py-1 border-t border-builder-border">
                            <input
                              type="checkbox"
                              checked={d.include}
                              onChange={(e) => update(i, { include: e.target.checked })}
                              aria-label={`${label} を写す`}
                            />
                          </td>
                          <td className="px-2 py-1 border-t border-builder-border font-bold">
                            {label}
                            {d.preset.memo && d.preset.memo !== d.preset.name && (
                              <span className="block font-normal text-builder-ink-muted">{d.preset.memo}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 border-t border-builder-border">
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                step={TIME_STEP_SEC}
                                value={d.startTime}
                                disabled={!d.include}
                                onChange={(e) => update(i, { startTime: e.target.value })}
                                aria-label={`${label} の開始時刻`}
                                className={inputCls}
                              />
                              <span aria-hidden="true">〜</span>
                              <input
                                type="time"
                                step={TIME_STEP_SEC}
                                value={d.endTime}
                                disabled={!d.include}
                                onChange={(e) => update(i, { endTime: e.target.value })}
                                aria-label={`${label} の終了時刻`}
                                className={inputCls}
                              />
                            </div>
                            {err && <div className="text-builder-red font-bold">⚠ {err}</div>}
                          </td>
                          <td className="px-2 py-1 border-t border-builder-border">
                            {Array.isArray(d.preset.teachers) && d.preset.teachers.length > 0
                              ? `${d.preset.teachers.length} 名`
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {changedCount > 0 && (
                <p className="text-xs text-builder-blue">時刻を直したプリセット: {changedCount} 件</p>
              )}
            </>
          )}
        </section>

        {retiredInSource.length > 0 && (
          <section aria-labelledby="builder-season-copy-retired" className="space-y-1">
            <h3 id="builder-season-copy-retired" className="text-sm font-bold">本体で退職・非表示の講師</h3>
            <p className="text-xs text-builder-ink-muted">チェックした講師は講師マスタに写しません (プリセットの対象講師からも外します)。</p>
            <div className="flex flex-wrap gap-2">
              {retiredInSource.map(n => (
                <label key={n} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-builder-border rounded">
                  <input type="checkbox" checked={dropped.has(n)} onChange={() => toggleDropped(n)} aria-label={`${n} を写さない`} />
                  {n} を写さない
                </label>
              ))}
            </div>
          </section>
        )}

        {mode === 'rebuild' ? (
          <div className="text-xs text-builder-ink-muted space-y-1 border-t border-builder-border pt-3">
            <p>
              <strong className="text-builder-ink">残すもの:</strong> 講師 (担当科目・担当不可/優先クラス・コマ数の上限)、学年タブ (クラス・コマ数・使う時限)、科目と色、時限、全日程の合同授業、自動生成の設定
            </p>
            <p>
              <strong className="text-builder-ink">空にするもの:</strong> 日付、時間割、日ごとのチェック、講師不在・NG、出勤可能調査の回答、他学年セッション、スナップショット
            </p>
            <p>今の講習のコマは、講師の月間予定の「講」と授業時間の集計からも消えます (集計は先に締めてください)。</p>
            {carriedCells > 0 && (
              <p className="text-builder-ink">
                今の時間割 ({carriedCells} コマ) は控えとして残ります。日付を作ったあと、⚙ 設定 &gt; 基本設定 の「📋 前の講習の時間割を写す」で
                N 日目 → N 日目に写せます。
              </p>
            )}
            <p>作り直した直後なら、ツールバーの ↩️ (元に戻す) か Ctrl+Z で戻せます。</p>
          </div>
        ) : (
          <p className="text-xs text-builder-ink-muted border-t border-builder-border pt-3">
            講師・学年タブ (クラスとコマ数)・科目・時限を引き継ぎ、日付と時間割は空から始まります。
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-builder-border bg-builder-surface hover:bg-builder-surface-alt"
          >キャンセル</button>
          <button
            type="button"
            onClick={submit}
            disabled={hasError}
            className={`px-3 py-1.5 text-sm font-bold rounded text-white disabled:opacity-50 ${mode === 'rebuild' ? 'bg-builder-red hover:opacity-90' : 'bg-builder-blue hover:bg-builder-blue-hover'}`}
          >{mode === 'rebuild' ? '作り直す' : 'この内容で始める'}</button>
        </div>
      </div>
    </div>
  );
}
