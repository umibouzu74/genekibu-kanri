import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useProjectContext } from '../contexts/projectContextValue';
import { useUI } from '../contexts/uiContextValue';
import { useHostData } from '../contexts/hostDataContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { effectiveConfigForTab } from '../utils/scheduleKey';
import { parseProjectFile } from '../utils/projectFile';
import {
  buildDefaultMappings,
  carryTimetable,
  countCarriedCells,
  mappingForSourceTab,
  planTimetableCopy,
  sequentialDateMapping,
  sourceTeacherCounts,
  subjectCountDiffsAfterCopy,
  weekdayMismatches,
  type SubjectCountDiff,
  type TabCopyMapping,
} from '../utils/timetableCopy';
import type { CarriedTimetable, Entity } from '../types';

const TITLE_ID = 'builder-timetable-copy-title';

// 「📋 前の講習の時間割を写す」(2026-10-27)。写す元 (作り直す前の控え / JSON) を
// 選び、タブ・日付 (N 日目 → N 日目)・時限・クラスの対応と、入れない講師を確かめて
// から写す。決まりは utils/timetableCopy。
export default function TimetableCopyDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onClose });
  const { project, importScheduleCells } = useProjectContext();
  const { showToast } = useUI();
  const { partTimeStaffNames, retiredTeacherNames } = useHostData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<{ timetable: CarriedTimetable; label: string } | null>(() =>
    project.previousTimetable
      ? { timetable: project.previousTimetable, label: `作り直す前の時間割「${project.previousTimetable.name || '名前なし'}」` }
      : null,
  );
  const [mappings, setMappings] = useState<TabCopyMapping[]>(() =>
    project.previousTimetable ? buildDefaultMappings(project.previousTimetable, project) : [],
  );
  const [overwrite, setOverwrite] = useState(false);
  const [openTabId, setOpenTabId] = useState<number | null>(null);

  const masterNames = useMemo(() => new Set((project.teachers || []).map(t => t.name)), [project.teachers]);
  const partTime = useMemo(() => new Set(partTimeStaffNames || []), [partTimeStaffNames]);
  const retired = useMemo(() => new Set(retiredTeacherNames || []), [retiredTeacherNames]);
  const teacherRows = useMemo(() => (source ? sourceTeacherCounts(source.timetable) : []), [source]);
  // 既定で入れるのは講師マスタにいて、バイトでも退職でもない人
  const defaultIncluded = (rows: Array<{ name: string }>) =>
    new Set(rows.map(r => r.name).filter(n => masterNames.has(n) && !partTime.has(n) && !retired.has(n)));
  const [included, setIncluded] = useState<Set<string>>(() => defaultIncluded(teacherRows));

  const chooseSource = (timetable: CarriedTimetable, label: string) => {
    setSource({ timetable, label });
    setMappings(buildDefaultMappings(timetable, project));
    setIncluded(defaultIncluded(sourceTeacherCounts(timetable)));
    setOpenTabId(null);
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const parsed = parseProjectFile(String(ev.target?.result ?? ''));
      if ('error' in parsed) {
        showToast(parsed.error, 'error', 5000);
        return;
      }
      const timetable = carryTimetable(parsed.project);
      if (countCarriedCells(timetable) === 0) {
        showToast(`「${f.name}」には時間割が入っていません`, 'warning', 4000);
        return;
      }
      chooseSource(timetable, `「${f.name}」(${parsed.project.name || '名前なし'})`);
    };
    r.onerror = () => showToast('読み込みエラー', 'error');
    r.readAsText(f);
  };

  const plan = useMemo(
    () => (source ? planTimetableCopy({ source: source.timetable, project, mappings, includeTeachers: included, overwrite }) : null),
    [source, project, mappings, included, overwrite],
  );

  // 写したあとの科目ごとのコマ数とコマ数の設定の差 (写す先のタブだけ)
  const countDiffs = useMemo(
    () => (plan ? subjectCountDiffsAfterCopy(project, plan.writes, mappings.filter(m => m.sourceTabIndex != null).map(m => m.targetTabId)) : []),
    [plan, project, mappings],
  );
  // 写した後の結果 (写したあとのコマ数の差を出してから閉じる)
  const [applied, setApplied] = useState<{ count: number; blanked: number; diffs: SubjectCountDiff[] } | null>(null);

  // 去年の日を外す / 戻す。外した日を飛ばして残りを先頭から順に詰め直す
  const setSkipped = (targetTabId: number, skipped: number[]) =>
    setMappings(prev => prev.map(m => {
      if (m.targetTabId !== targetTabId || m.sourceTabIndex == null) return m;
      const src = source?.timetable.tabs[m.sourceTabIndex];
      const tab = project.tabs.find(t => t.id === targetTabId);
      if (!src || !tab) return m;
      const targets = effectiveConfigForTab(project, tab).dates;
      return { ...m, skippedDates: skipped, dates: sequentialDateMapping(src.dates.length, targets, skipped) };
    }));
  const toggleSkip = (m: TabCopyMapping, i: number) => {
    const current = new Set(m.skippedDates || []);
    if (current.has(i)) current.delete(i); else current.add(i);
    setSkipped(m.targetTabId, [...current].sort((a, b) => a - b));
  };

  const setMappingAt = (targetTabId: number, key: 'dates' | 'periods' | 'classes', idx: number, value: number | null) =>
    setMappings(prev => prev.map(m => {
      if (m.targetTabId !== targetTabId) return m;
      const arr = [...m[key]];
      arr[idx] = value;
      return { ...m, [key]: arr };
    }));

  const apply = () => {
    if (!plan || plan.writes.length === 0) return;
    importScheduleCells(plan.writes);
    showToast(
      `${plan.writes.length} コマを写しました` +
        (plan.teacherBlanked > 0 ? ` (講師を空にした ${plan.teacherBlanked} コマ)` : '') +
        '。Undo で戻せます',
      'success',
      6000,
    );
    // コマ数の設定と合わないクラスがあれば、閉じる前に一覧で見せる
    if (countDiffs.length > 0) setApplied({ count: plan.writes.length, blanked: plan.teacherBlanked, diffs: countDiffs });
    else onClose();
  };

  const selectCls = 'border border-builder-border rounded px-1 py-0.5 text-xs bg-builder-surface text-builder-ink max-w-[14rem]';

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1005] flex justify-center items-center p-4 no-print"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="bg-builder-surface w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-lg shadow-2xl p-5 text-builder-ink space-y-4"
      >
        <h2 id={TITLE_ID} className="text-lg font-bold">📋 前の講習の時間割を写す</h2>
        {applied ? (
          <>
            <p role="status" className="text-sm">
              <strong>{applied.count} コマ</strong>を写しました{applied.blanked > 0 && <> (講師を空にした {applied.blanked} コマ)</>}。Undo で戻せます。
            </p>
            <section aria-labelledby="builder-timetable-copy-result" className="space-y-1">
              <h3 id="builder-timetable-copy-result" className="text-sm font-bold">コマ数の設定と合わないクラス</h3>
              <CountDiffList diffs={applied.diffs} />
              <p className="text-xs text-builder-ink-muted">
                日数の違い (去年より講習の日が少ない) で科目のコマが足りない・多いクラスです。時間割で直すか、⚙ 設定のコマ数を見直してください。
              </p>
            </section>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-bold rounded text-white bg-builder-blue hover:bg-builder-blue-hover"
              >閉じる</button>
            </div>
          </>
        ) : (
        <>
        <p className="text-xs text-builder-ink-muted">
          科目と講師を、日付は <strong>N 日目 → N 日目</strong>、時限・クラスは同じ名前のところへ写します。
          先に「⚡ 期間から自動生成」で今年の日付を作っておいてください。
        </p>

        <section aria-labelledby="builder-timetable-copy-source" className="space-y-2">
          <h3 id="builder-timetable-copy-source" className="text-sm font-bold">写す元</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {project.previousTimetable && (
              <button
                type="button"
                onClick={() => chooseSource(project.previousTimetable!, `作り直す前の時間割「${project.previousTimetable!.name || '名前なし'}」`)}
                aria-pressed={source?.timetable === project.previousTimetable}
                className={`px-2 py-1 rounded border ${source?.timetable === project.previousTimetable ? 'border-builder-blue bg-builder-info-soft font-bold' : 'border-builder-border bg-builder-surface'}`}
              >
                作り直す前の時間割「{project.previousTimetable.name || '名前なし'}」({countCarriedCells(project.previousTimetable)} コマ)
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 rounded border border-builder-border bg-builder-surface hover:bg-builder-surface-alt"
              title="💾 プロジェクト保存で書き出した JSON の時間割を写します"
            >📂 JSON ファイルから…</button>
            <input type="file" accept=".json" ref={fileInputRef} onChange={handleFile} className="hidden" aria-hidden="true" tabIndex={-1} />
          </div>
          {source ? (
            <p className="text-xs">写す元: <strong>{source.label}</strong> ({countCarriedCells(source.timetable)} コマ)</p>
          ) : (
            <p className="text-xs text-builder-ink-muted">
              作り直す前の時間割の控えはありません (「🔄 次の◯期講習用に作り直す」をすると残ります)。JSON ファイルから選んでください。
            </p>
          )}
        </section>

        {source && plan && (
          <>
            <section aria-labelledby="builder-timetable-copy-tabs" className="space-y-2">
              <h3 id="builder-timetable-copy-tabs" className="text-sm font-bold">タブの対応</h3>
              <ul className="space-y-2">
                {project.tabs.map(tab => {
                  const m = mappings.find(x => x.targetTabId === tab.id);
                  if (!m) return null;
                  const cfg = effectiveConfigForTab(project, tab);
                  const src = m.sourceTabIndex != null ? source.timetable.tabs[m.sourceTabIndex] : null;
                  const mappedDates = m.dates.filter(v => v != null).length;
                  const open = openTabId === tab.id;
                  return (
                    <li key={tab.id} className="border border-builder-border rounded p-2 text-xs space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{tab.name}</span>
                        <span aria-hidden="true">←</span>
                        <select
                          className={selectCls}
                          value={m.sourceTabIndex ?? ''}
                          aria-label={`${tab.name} に写す元のタブ`}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setMappings(prev => prev.map(x => (x.targetTabId === tab.id ? mappingForSourceTab(source.timetable, project, tab.id, v) : x)));
                          }}
                        >
                          <option value="">写さない</option>
                          {source.timetable.tabs.map((t, i) => (
                            <option key={i} value={i}>{t.name || `タブ ${i + 1}`} ({t.dates.length} 日・{t.cells.length} コマ)</option>
                          ))}
                        </select>
                        {src && (
                          <span className="text-builder-ink-muted">
                            日付 {mappedDates}/{src.dates.length} 日を対応
                            {cfg.dates.length === 0 && <span className="text-builder-orange font-bold"> — このタブにはまだ日付がありません</span>}
                            {cfg.dates.length > 0 && src.dates.length !== cfg.dates.length && (
                              <span className="text-builder-orange"> (元 {src.dates.length} 日 / 今 {cfg.dates.length} 日)</span>
                            )}
                          </span>
                        )}
                        {src && (
                          <button
                            type="button"
                            onClick={() => setOpenTabId(open ? null : tab.id)}
                            aria-expanded={open}
                            className="ml-auto px-2 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-surface-alt"
                          >{open ? '▲ 閉じる' : '▼ 日付・時限・クラスの対応'}</button>
                        )}
                      </div>
                      {src && cfg.dates.length > 0 && (
                        <DaySkipRow
                          tabName={tab.name}
                          sourceDates={src.dates}
                          mapping={m}
                          targetDates={cfg.dates}
                          onToggle={(i) => toggleSkip(m, i)}
                          onSkip={(list) => setSkipped(tab.id, list)}
                        />
                      )}
                      {src && open && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <MappingTable
                            title="日付 (N 日目)"
                            sourceLabels={src.dates.map((d, i) => `${i + 1}日目 ${d}`)}
                            targets={cfg.dates}
                            values={m.dates}
                            onChange={(i, v) => setMappingAt(tab.id, 'dates', i, v)}
                            selectCls={selectCls}
                          />
                          <MappingTable
                            title="時限"
                            sourceLabels={src.periods}
                            targets={cfg.periods}
                            values={m.periods}
                            onChange={(i, v) => setMappingAt(tab.id, 'periods', i, v)}
                            selectCls={selectCls}
                          />
                          <MappingTable
                            title="クラス"
                            sourceLabels={src.classes}
                            targets={cfg.classes || []}
                            values={m.classes}
                            onChange={(i, v) => setMappingAt(tab.id, 'classes', i, v)}
                            selectCls={selectCls}
                          />
                        </div>
                      )}
                      {src && !open && m.classes.some(v => v == null) && (
                        <div className="text-builder-orange">
                          対応の無いクラス: {src.classes.filter((_, i) => m.classes[i] == null).join('、')} (このクラスの分は写しません。▼ から選べます)
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="builder-timetable-copy-teachers" className="space-y-1">
              <h3 id="builder-timetable-copy-teachers" className="text-sm font-bold">講師を入れる人</h3>
              <p className="text-xs text-builder-ink-muted">
                チェックを外した講師のコマは、講師を空にして科目だけ写します (バイト・退職・講師マスタにいない人は最初から外してあります)。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {teacherRows.map(r => {
                  const inMaster = masterNames.has(r.name);
                  const tags = [
                    !inMaster && '講師マスタにいない',
                    partTime.has(r.name) && 'バイト',
                    retired.has(r.name) && '退職',
                  ].filter(Boolean);
                  const on = inMaster && included.has(r.name);
                  return (
                    <label
                      key={r.name}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs ${on ? 'border-builder-blue bg-builder-info-soft' : 'border-builder-border text-builder-ink-muted'}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!inMaster}
                        aria-label={`${r.name} を講師として入れる`}
                        onChange={() => setIncluded(prev => {
                          const next = new Set(prev);
                          if (next.has(r.name)) next.delete(r.name); else next.add(r.name);
                          return next;
                        })}
                      />
                      {r.name} ({r.cells} コマ{tags.length > 0 ? `・${tags.join('・')}` : ''})
                    </label>
                  );
                })}
              </div>
            </section>

            <fieldset className="text-xs space-y-1">
              <legend className="text-sm font-bold">写し方</legend>
              <label className="flex items-center gap-1">
                <input type="radio" name="builder-timetable-copy-mode" checked={!overwrite} onChange={() => setOverwrite(false)} />
                空いているセルにだけ写す
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="builder-timetable-copy-mode" checked={overwrite} onChange={() => setOverwrite(true)} />
                入っているセルも上書きする (ロックしたセルは除く)
              </label>
            </fieldset>

            <div role="status" className="text-xs bg-builder-surface-alt border border-builder-border rounded p-2 space-y-0.5">
              <div>
                <strong className="text-builder-blue">{plan.writes.length} コマ</strong>を写します
                {plan.teacherBlanked > 0 && <> (うち講師を空にする {plan.teacherBlanked} コマ)</>}
              </div>
              {plan.skippedFilled > 0 && <div>入っているので写さない: {plan.skippedFilled} コマ</div>}
              {plan.skippedLocked > 0 && <div>ロックしてあるので写さない: {plan.skippedLocked} コマ</div>}
              {plan.unmapped > 0 && <div className="text-builder-orange">日付・時限・クラスの対応が無いので写さない: {plan.unmapped} コマ</div>}
              {plan.unknownSubjects.length > 0 && (
                <div className="text-builder-orange">科目マスタに無い科目: {plan.unknownSubjects.join('、')} (📚 科目で足してください)</div>
              )}
            </div>

            {plan.writes.length > 0 && (
              <section aria-labelledby="builder-timetable-copy-counts" className="space-y-1">
                <h3 id="builder-timetable-copy-counts" className="text-sm font-bold">写したあとのコマ数 (コマ数の設定と合わないクラス)</h3>
                <CountDiffList diffs={countDiffs} />
              </section>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-builder-border bg-builder-surface hover:bg-builder-surface-alt"
          >キャンセル</button>
          <button
            type="button"
            onClick={apply}
            disabled={!plan || plan.writes.length === 0}
            className="px-3 py-1.5 text-sm font-bold rounded text-white bg-builder-blue hover:bg-builder-blue-hover disabled:opacity-50"
          >写す{plan && plan.writes.length > 0 ? ` (${plan.writes.length} コマ)` : ''}</button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// 写したあとの科目ごとのコマ数とコマ数の設定の差 (「3SS 数学 8/9 (−1)」)
function CountDiffList({ diffs }: { diffs: SubjectCountDiff[] }) {
  if (diffs.length === 0) {
    return <p className="text-xs text-builder-green">どのクラスもコマ数の設定どおりです。</p>;
  }
  return (
    <ul className="text-xs space-y-0.5 max-h-48 overflow-y-auto">
      {diffs.map(d => (
        <li key={`${d.tabId}-${d.className}`}>
          <span className="font-bold">{d.tabName} {d.className}</span>:{' '}
          {d.items.map((x, i) => (
            <span key={x.subject} className={x.diff < 0 ? 'text-builder-red' : 'text-builder-orange'}>
              {i > 0 && '・'}{x.subject} {x.count}/{x.quota} ({x.diff > 0 ? `+${x.diff}` : `−${-x.diff}`})
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function MappingTable({
  title,
  sourceLabels,
  targets,
  values,
  onChange,
  selectCls,
}: {
  title: string;
  sourceLabels: string[];
  targets: Entity[];
  values: Array<number | null>;
  onChange: (i: number, v: number | null) => void;
  selectCls: string;
}) {
  return (
    <div>
      <div className="font-bold mb-1">{title}</div>
      <ul className="space-y-1">
        {sourceLabels.map((label, i) => (
          <li key={i} className="flex flex-col">
            <span className="text-builder-ink-muted">{label} →</span>
            <select
              className={selectCls}
              value={values[i] ?? ''}
              aria-label={`${title}: ${label} を写す先`}
              onChange={(e) => onChange(i, e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">写さない</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 去年の日 (写す元) → 今年の日の対応を並べ、外す日を選ぶ。日数が違うとき (去年 15 日・
// 今年 14 日) は外した日を飛ばして残りを先頭から詰める。曜日の違う対応は色で知らせる
function DaySkipRow({
  tabName,
  sourceDates,
  mapping,
  targetDates,
  onToggle,
  onSkip,
}: {
  tabName: string;
  sourceDates: string[];
  mapping: TabCopyMapping;
  targetDates: Entity[];
  onToggle: (i: number) => void;
  onSkip: (skipped: number[]) => void;
}) {
  const skipped = new Set(mapping.skippedDates || []);
  const byId = new Map(targetDates.map(d => [d.id, d.label] as const));
  const mismatched = new Set(weekdayMismatches(sourceDates, mapping.dates, targetDates).map(x => x.index));
  const extra = sourceDates.length - targetDates.length;
  const used = sourceDates.length - skipped.size;
  const range = (from: number, n: number) => Array.from({ length: n }, (_, k) => from + k);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">日の対応</span>
        <span className={used > targetDates.length ? 'text-builder-orange' : 'text-builder-ink-muted'}>
          去年 {sourceDates.length} 日 (外す {skipped.size} 日) → 今年 {targetDates.length} 日
          {used > targetDates.length && ` — 今年の日が ${used - targetDates.length} 日足りないので、最後の ${used - targetDates.length} 日は写しません。外す日を選んでください`}
        </span>
        {extra > 0 && (
          <>
            <button type="button" onClick={() => onSkip(range(sourceDates.length - extra, extra))} className="px-1.5 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-surface-alt">最後の {extra} 日を外す</button>
            <button type="button" onClick={() => onSkip(range(0, extra))} className="px-1.5 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-surface-alt">最初の {extra} 日を外す</button>
          </>
        )}
        {skipped.size > 0 && (
          <button type="button" onClick={() => onSkip([])} className="px-1.5 py-0.5 border border-builder-border rounded bg-builder-surface hover:bg-builder-surface-alt">外した日を戻す</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={`${tabName} の去年の日 (押すと外す)`}>
        {sourceDates.map((label, i) => {
          const off = skipped.has(i);
          const to = mapping.dates[i] != null ? byId.get(mapping.dates[i]!) : null;
          const warn = mismatched.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggle(i)}
              aria-pressed={!off}
              aria-label={`${i + 1}日目 ${label}${off ? ' (外す)' : to ? ` → ${to}${warn ? ' (曜日が違う)' : ''}` : ' (写す先なし)'}`}
              title={off ? '押すと戻す' : '押すとこの日を外す (残りを詰める)'}
              className={`px-1.5 py-0.5 border rounded text-left leading-tight ${off
                ? 'border-builder-border text-builder-ink-muted line-through bg-builder-surface'
                : warn ? 'border-builder-orange bg-builder-warning-soft' : to ? 'border-builder-blue bg-builder-info-soft' : 'border-builder-border text-builder-ink-muted bg-builder-surface'}`}
            >
              <span className="text-[10px] text-builder-ink-muted">{i + 1}日目</span> {label}
              {!off && <span className="text-builder-ink-muted"> → {to ?? '—'}</span>}
            </button>
          );
        })}
      </div>
      {mismatched.size > 0 && (
        <div className="text-builder-orange">曜日が違う対応があります (オレンジ)。火木・水金のような曜日で決まるコースなら、外す日を選び直してください</div>
      )}
    </div>
  );
}
